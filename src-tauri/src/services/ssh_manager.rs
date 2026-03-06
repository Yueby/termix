use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use russh::keys::key::PublicKey;
use russh::{client, Channel, ChannelId, Disconnect};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use crate::commands::sftp::FileEntry;
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
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
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
    channel: Channel<client::Msg>,
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
        };

        if !authenticated {
            return Err(anyhow!("Authentication failed"));
        }

        let channel = handle.channel_open_session().await?;

        channel
            .request_pty(false, "xterm-256color", 80, 24, 0, 0, &[])
            .await?;
        channel.request_shell(false).await?;

        let session = Session { handle, channel };
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

        Ok(session_id)
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let session = self.sessions.lock().await.remove(session_id);
        if let Some(session) = session {
            session
                .handle
                .disconnect(Disconnect::ByApplication, "User disconnected", "en")
                .await?;
        }
        Ok(())
    }

    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;
        session
            .channel
            .data(&data[..])
            .await
            .map_err(|e| anyhow!("Failed to write: {:?}", e))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?;
        session
            .channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| anyhow!("Failed to resize: {:?}", e))?;
        Ok(())
    }

    pub async fn list_sessions(&self) -> Vec<String> {
        self.sessions.lock().await.keys().cloned().collect()
    }

    pub async fn sftp_list_dir(&self, _session_id: &str, _path: &str) -> Result<Vec<FileEntry>> {
        Ok(vec![])
    }

    pub async fn sftp_download(
        &self,
        _session_id: &str,
        _remote_path: &str,
        _local_path: &str,
    ) -> Result<()> {
        Ok(())
    }

    pub async fn sftp_upload(
        &self,
        _session_id: &str,
        _local_path: &str,
        _remote_path: &str,
    ) -> Result<()> {
        Ok(())
    }

    pub async fn sftp_mkdir(&self, _session_id: &str, _path: &str) -> Result<()> {
        Ok(())
    }

    pub async fn sftp_remove(&self, _session_id: &str, _path: &str) -> Result<()> {
        Ok(())
    }
}
