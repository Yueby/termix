use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Result};
use parking_lot::Mutex as SyncMutex;
use russh::client::DisconnectReason;
use russh::keys::{PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{client, ChannelId, ChannelWriteHalf, Disconnect};
use serde::Serialize;
use tauri::ipc::{Channel as IpcChannel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use crate::commands::ssh::AuthMethod;
use crate::services::host_keys;
use crate::services::proxy::{self, ProxyMode};

/// Seconds between keepalive probes sent to the server.
const KEEPALIVE_INTERVAL_SECS: u64 = 30;

/// Unanswered probes tolerated before the session is treated as dead.
const KEEPALIVE_MAX: usize = 3;

#[derive(Clone, Serialize)]
pub struct SshDisconnectEvent {
    pub session_id: String,
    pub reason: String,
}

struct ClientHandler {
    sender: mpsc::UnboundedSender<Vec<u8>>,
    disconnect_reason: Arc<SyncMutex<Option<String>>>,
    host: String,
    port: u16,
}

// russh 0.63 dropped the `async_trait` indirection: the handler methods are plain
// `fn`s returning `impl Future`, so each one writes that signature out.
impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        // Trust on first use, and refuse a changed key afterwards. Resolved here rather
        // than inside the returned future so no borrow of `self` has to outlive the call.
        let verdict = host_keys::verify_host_key(&self.host, self.port, server_public_key);
        async move { verdict }
    }

    fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        let _ = self.sender.send(data.to_vec());
        async { Ok(()) }
    }

    fn extended_data(
        &mut self,
        _channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        let _ = self.sender.send(data.to_vec());
        async { Ok(()) }
    }

    /// Records why the transport ended, so the frontend is told the real reason
    /// instead of a constant string.
    fn disconnected(
        &mut self,
        reason: DisconnectReason<Self::Error>,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        let described = match &reason {
            DisconnectReason::ReceivedDisconnect(info) => format!(
                "server closed the connection ({:?}): {}",
                info.reason_code, info.message
            ),
            DisconnectReason::Error(error) => format!("transport error: {error}"),
        };
        log::info!("SSH transport closed: {described}");
        *self.disconnect_reason.lock() = Some(described);
        // Per the handler contract an error has to be re-returned for the session join.
        async move {
            match reason {
                DisconnectReason::ReceivedDisconnect(_) => Ok(()),
                DisconnectReason::Error(error) => Err(error),
            }
        }
    }
}

struct Session {
    handle: client::Handle<ClientHandler>,
    writer: Arc<ChannelWriteHalf<client::Msg>>,
}

pub struct SshManager {
    sessions: Mutex<HashMap<String, Session>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        session_id: String,
        host: &str,
        port: u16,
        username: &str,
        auth_method: AuthMethod,
        proxy_mode: &ProxyMode,
        on_data: IpcChannel<InvokeResponseBody>,
    ) -> Result<String> {
        let config = Arc::new(client::Config {
            // With no keepalive the client never probes: nothing holds NAT or
            // firewall state open, and a peer that has silently gone away is never
            // noticed. `keepalive_max` unanswered probes end the session.
            keepalive_interval: Some(Duration::from_secs(KEEPALIVE_INTERVAL_SECS)),
            keepalive_max: KEEPALIVE_MAX,
            ..Default::default()
        });

        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let disconnect_reason = Arc::new(SyncMutex::new(None));
        let handler = ClientHandler {
            sender: tx,
            disconnect_reason: disconnect_reason.clone(),
            host: host.to_string(),
            port,
        };

        // The proxy has to be applied before the SSH handshake, so the tunnel is
        // built first and handed to russh as a stream. `System` is resolved here
        // because only this side can read the OS proxy settings.
        let proxy = proxy::resolve(proxy_mode, host);
        let stream = proxy::connect(proxy.as_ref(), host, port).await?;
        let mut handle = client::connect_stream(config, stream, handler).await?;

        let authenticated = match auth_method {
            AuthMethod::Password { password } => {
                handle.authenticate_password(username, password).await?
            }
            AuthMethod::PrivateKey {
                key_path,
                passphrase,
            } => {
                let key = russh::keys::load_secret_key(&key_path, passphrase.as_deref())?;
                handle
                    .authenticate_publickey(
                        username,
                        PrivateKeyWithHashAlg::new(Arc::new(key), None),
                    )
                    .await?
            }
            AuthMethod::PrivateKeyContent {
                key_content,
                passphrase,
            } => {
                if key_content.trim().is_empty() {
                    return Err(anyhow!("Private key content is empty"));
                }
                let key = russh::keys::decode_secret_key(&key_content, passphrase.as_deref())?;
                handle
                    .authenticate_publickey(
                        username,
                        PrivateKeyWithHashAlg::new(Arc::new(key), None),
                    )
                    .await?
            }
        };

        // 0.63 returns an AuthResult instead of a bool.
        if !authenticated.success() {
            log::warn!(
                "SSH authentication failed for {}@{}:{}",
                username,
                host,
                port
            );
            return Err(anyhow!("Authentication failed"));
        }

        let channel = handle.channel_open_session().await?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await?;
        channel.request_shell(false).await?;

        let (mut reader, writer) = channel.split();

        let session = Session {
            handle,
            writer: Arc::new(writer),
        };
        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session);

        // The read half has to be consumed, and not for the data: russh pushes every
        // incoming message into a bounded per-channel queue (`channel_buffer_size`, 100
        // by default) *before* handing it to `Handler::data`, so a channel nobody reads
        // stalls the entire transport once that queue fills — about 100 output messages
        // into an interactive session, after which the connection simply stops. The
        // output itself is forwarded by the handler, so what arrives here is discarded;
        // what matters is that something is always waiting on it. `wait` returns `None`
        // once the channel closes, which ends the task.
        tokio::spawn(async move { while reader.wait().await.is_some() {} });

        // Spawn a task to forward SSH output to the frontend over the channel
        let sid = session_id.clone();
        tokio::spawn(async move {
            let mut delivery_failures: u64 = 0;
            while let Some(data) = rx.recv().await {
                // Raw bytes: no JSON array of numbers and no base64. The webview
                // receives an ArrayBuffer it can wrap in a Uint8Array directly.
                if let Err(error) = on_data.send(InvokeResponseBody::Raw(data)) {
                    // A delivery failure is not a lost connection: keep the session
                    // and keep forwarding. Breaking here used to report a drop to
                    // the user whenever the frontend missed a single chunk.
                    delivery_failures += 1;
                    if delivery_failures == 1 {
                        log::warn!(
                            "Session {sid}: could not deliver output to the frontend: {error}"
                        );
                    }
                }
            }
            let reason = disconnect_reason
                .lock()
                .clone()
                .unwrap_or_else(|| "connection closed without a reported reason".to_string());
            log::info!(
                "SSH session {sid} ended: {reason} (undelivered output chunks: {delivery_failures})"
            );
            let _ = app.emit(
                "ssh_disconnect",
                &SshDisconnectEvent {
                    session_id: sid,
                    reason,
                },
            );
        });

        log::info!("SSH session {} connected to {}:{}", session_id, host, port);
        Ok(session_id)
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let session = self.sessions.lock().await.remove(session_id);
        if let Some(session) = session {
            session
                .handle
                .disconnect(Disconnect::ByApplication, "User disconnected", "en")
                .await?;
            log::info!("SSH session {} disconnected", session_id);
        }
        Ok(())
    }

    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let channel = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(session_id)
                .map(|s| s.writer.clone())
                .ok_or_else(|| anyhow!("Session not found: {}", session_id))?
        };
        channel
            .data(data)
            .await
            .map_err(|e| anyhow!("Failed to write: {:?}", e))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<()> {
        let channel = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(session_id)
                .map(|s| s.writer.clone())
                .ok_or_else(|| anyhow!("Session not found: {}", session_id))?
        };
        channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| anyhow!("Failed to resize: {:?}", e))?;
        Ok(())
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Only the network test below renders a fingerprint now; production code hands that
    // to host_keys::verify_host_key.
    use russh::keys::HashAlg;

    /// The 0.63 migration rewrote the handler signatures and moved the host key
    /// type to `PublicKeyOrCertificate`. Getting as far as key exchange proves
    /// those line up; authentication is not involved, so no credentials are
    /// needed. Run with `cargo test --lib ssh_manager -- --include-ignored`.
    #[tokio::test]
    #[ignore = "needs network access to github.com:22"]
    async fn reaches_host_key_verification() {
        struct Probe {
            fingerprint: Arc<SyncMutex<Option<String>>>,
        }

        impl client::Handler for Probe {
            type Error = anyhow::Error;

            fn check_server_key(
                &mut self,
                server_public_key: &PublicKeyOrCertificate,
            ) -> impl Future<Output = Result<bool, Self::Error>> + Send {
                let rendered = server_public_key
                    .public_key()
                    .fingerprint(HashAlg::Sha256)
                    .to_string();
                *self.fingerprint.lock() = Some(rendered);
                async { Ok(true) }
            }
        }

        let fingerprint: Arc<SyncMutex<Option<String>>> = Arc::new(SyncMutex::new(None));
        let config = Arc::new(client::Config::default());
        let handle = tokio::time::timeout(
            Duration::from_secs(30),
            client::connect(
                config,
                ("github.com", 22),
                Probe {
                    fingerprint: fingerprint.clone(),
                },
            ),
        )
        .await
        .expect("key exchange timed out")
        .expect("key exchange failed");

        let rendered = fingerprint
            .lock()
            .clone()
            .expect("check_server_key was never called");

        // The log line has to stay in the form a user can compare against
        // `ssh-keyscan` / `ssh -v`. Rendering the value with `{:?}` produces a byte
        // array instead, which is why this is pinned rather than left to review.
        assert!(
            rendered.starts_with("SHA256:"),
            "expected the OpenSSH fingerprint form, got {rendered}"
        );
        drop(handle);
    }
}
