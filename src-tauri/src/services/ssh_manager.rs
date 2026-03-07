use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use russh::keys::key::PublicKey;
use russh::{client, Channel, ChannelId, Disconnect};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use crate::commands::ssh::AuthMethod;

#[derive(Clone, Serialize)]
pub struct SshDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct SshDisconnectEvent {
    pub session_id: String,
    pub reason: String,
}

struct ClientHandler {
    sender: mpsc::UnboundedSender<Vec<u8>>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement known_hosts verification to prevent MITM attacks.
        // Currently accepts all host keys — acceptable for early development only.
        log::warn!(
            "Host key verification skipped. Fingerprint: {:?}",
            server_public_key.fingerprint()
        );
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.sender.send(data.to_vec());
        Ok(())
    }

    async fn extended_data(
        &mut self,
        _channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let _ = self.sender.send(data.to_vec());
        Ok(())
    }
}

struct Session {
    handle: client::Handle<ClientHandler>,
    channel: Arc<Channel<client::Msg>>,
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
        host: &str,
        port: u16,
        username: &str,
        auth_method: AuthMethod,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let config = Arc::new(client::Config {
            ..Default::default()
        });

        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let handler = ClientHandler { sender: tx };

        let mut handle = client::connect(config, (host, port), handler).await?;

        let authenticated = match auth_method {
            AuthMethod::Password { password } => {
                handle.authenticate_password(username, &password).await?
            }
            AuthMethod::PrivateKey {
                key_path,
                passphrase,
            } => {
                let key = russh_keys::load_secret_key(&key_path, passphrase.as_deref())?;
                handle
                    .authenticate_publickey(username, Arc::new(key))
                    .await?
            }
            AuthMethod::PrivateKeyContent {
                key_content,
                passphrase,
            } => {
                if key_content.trim().is_empty() {
                    return Err(anyhow!("Private key content is empty"));
                }
                let key = russh_keys::decode_secret_key(&key_content, passphrase.as_deref())?;
                handle
                    .authenticate_publickey(username, Arc::new(key))
                    .await?
            }
        };

        if !authenticated {
            log::warn!("SSH authentication failed for {}@{}:{}", username, host, port);
            return Err(anyhow!("Authentication failed"));
        }

        let channel = handle.channel_open_session().await?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await?;
        channel.request_shell(false).await?;

        let session = Session { handle, channel: Arc::new(channel) };
        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session);

        // Spawn a task to forward SSH output to the frontend via Tauri events
        let sid = session_id.clone();
        tokio::spawn(async move {
            while let Some(data) = rx.recv().await {
                let event = SshDataEvent {
                    session_id: sid.clone(),
                    data,
                };
                if app.emit("ssh_data", &event).is_err() {
                    break;
                }
            }
            // Channel closed — notify frontend
            let _ = app.emit(
                "ssh_disconnect",
                &SshDisconnectEvent {
                    session_id: sid,
                    reason: "Connection closed".to_string(),
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
                .map(|s| s.channel.clone())
                .ok_or_else(|| anyhow!("Session not found: {}", session_id))?
        };
        channel
            .data(&data[..])
            .await
            .map_err(|e| anyhow!("Failed to write: {:?}", e))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<()> {
        let channel = {
            let sessions = self.sessions.lock().await;
            sessions
                .get(session_id)
                .map(|s| s.channel.clone())
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
