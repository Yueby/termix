use std::collections::HashMap;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use russh::keys::key::PublicKey;
use russh::{client, ChannelId, Disconnect};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileAttributes;
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;

use crate::commands::ssh::AuthMethod;

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub permissions: Option<String>,
    pub kind: String,
}

struct SftpHandler;

#[async_trait]
impl client::Handler for SftpHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement known_hosts verification to prevent MITM attacks.
        log::warn!(
            "Host key verification skipped. Fingerprint: {:?}",
            server_public_key.fingerprint()
        );
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        _data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }
}

struct SftpSessionInfo {
    handle: client::Handle<SftpHandler>,
    sftp: SftpSession,
}

pub struct SftpManager {
    sessions: Mutex<HashMap<String, Arc<SftpSessionInfo>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(
        &self,
        host: &str,
        port: u16,
        username: &str,
        auth_method: AuthMethod,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let config = Arc::new(client::Config::default());
        let handler = SftpHandler;

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
            log::warn!("SFTP authentication failed for {}@{}:{}", username, host, port);
            return Err(anyhow!("Authentication failed"));
        }

        let channel = handle.channel_open_session().await?;
        channel.request_subsystem(true, "sftp").await?;

        let stream = channel.into_stream();
        let sftp = SftpSession::new(stream).await.map_err(|e| anyhow!("{}", e))?;

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), Arc::new(SftpSessionInfo { handle, sftp }));

        log::info!("SFTP session {} connected to {}:{}", session_id, host, port);
        Ok(session_id)
    }

    async fn get_session(&self, session_id: &str) -> Result<Arc<SftpSessionInfo>> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| anyhow!("SFTP session not found: {}", session_id))
    }

    pub async fn home_dir(&self, session_id: &str) -> Result<String> {
        let session = self.get_session(session_id).await?;

        session
            .sftp
            .canonicalize(".")
            .await
            .map_err(|e| anyhow!("{}", e))
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let session = self.sessions.lock().await.remove(session_id);
        if let Some(session) = session {
            if let Err(e) = session.sftp.close().await {
                log::warn!("SFTP close error for session {}: {}", session_id, e);
            }
            if let Err(e) = session
                .handle
                .disconnect(Disconnect::ByApplication, "User disconnected", "en")
                .await
            {
                log::warn!("SSH disconnect error for session {}: {}", session_id, e);
            }
            log::info!("SFTP session {} disconnected", session_id);
        }
        Ok(())
    }

    pub async fn list_dir(&self, session_id: &str, path: &str) -> Result<Vec<FileEntry>> {
        log::debug!("SFTP list_dir: session={}, path={}", session_id, path);
        let session = self.get_session(session_id).await?;

        let read_dir = session
            .sftp
            .read_dir(path)
            .await
            .map_err(|e| anyhow!("{}", e))?;

        let mut entries = Vec::new();
        for entry in read_dir {
            let name = entry.file_name();
            let meta = entry.metadata();
            let is_dir = meta.is_dir();
            let size = meta.size.unwrap_or(0);
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            let permissions = meta.permissions.map(format_unix_permissions);
            let kind = if is_dir {
                "folder".to_string()
            } else {
                extension_to_kind(&name)
            };

            entries.push(FileEntry {
                name,
                is_dir,
                size,
                modified,
                permissions,
                kind,
            });
        }

        entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
        Ok(entries)
    }

    /// Stream-based download: reads remote file in chunks to avoid OOM on large files.
    pub async fn download(&self, session_id: &str, remote_path: &str, local_path: &str) -> Result<()> {
        log::info!("SFTP download: {} -> {} (session={})", remote_path, local_path, session_id);
        let session = self.get_session(session_id).await?;

        if let Some(parent) = std::path::Path::new(local_path).parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }

        let mut remote_file = session
            .sftp
            .open(remote_path)
            .await
            .map_err(|e| anyhow!("Failed to open remote file '{}': {}", remote_path, e))?;

        let mut local_file = tokio::fs::File::create(local_path)
            .await
            .map_err(|e| anyhow!("Failed to create local file '{}': {}", local_path, e))?;

        let mut buf = [0u8; 32768];
        loop {
            let n = remote_file
                .read(&mut buf)
                .await
                .map_err(|e| anyhow!("Failed to read remote file '{}': {}", remote_path, e))?;
            if n == 0 {
                break;
            }
            local_file
                .write_all(&buf[..n])
                .await
                .map_err(|e| anyhow!("Failed to write local file '{}': {}", local_path, e))?;
        }

        Ok(())
    }

    /// Stream-based upload: reads local file in chunks to avoid OOM on large files.
    pub async fn upload(&self, session_id: &str, local_path: &str, remote_path: &str) -> Result<()> {
        log::info!("SFTP upload: {} -> {} (session={})", local_path, remote_path, session_id);
        let session = self.get_session(session_id).await?;

        let mut local_file = tokio::fs::File::open(local_path)
            .await
            .map_err(|e| anyhow!("Failed to open local file '{}': {}", local_path, e))?;

        let mut remote_file = session
            .sftp
            .create(remote_path)
            .await
            .map_err(|e| anyhow!("Failed to create remote file '{}': {}", remote_path, e))?;

        let mut buf = [0u8; 32768];
        loop {
            let n = local_file
                .read(&mut buf)
                .await
                .map_err(|e| anyhow!("Failed to read local file '{}': {}", local_path, e))?;
            if n == 0 {
                break;
            }
            remote_file
                .write_all(&buf[..n])
                .await
                .map_err(|e| anyhow!("Failed to write remote file '{}': {}", remote_path, e))?;
        }

        remote_file
            .shutdown()
            .await
            .map_err(|e| anyhow!("Failed to close remote file '{}': {}", remote_path, e))?;

        Ok(())
    }

    pub async fn mkdir(&self, session_id: &str, path: &str) -> Result<()> {
        log::info!("SFTP mkdir: session={}, path={}", session_id, path);
        let session = self.get_session(session_id).await?;

        session
            .sftp
            .create_dir(path)
            .await
            .map_err(|e| anyhow!("{}", e))?;
        Ok(())
    }

    pub async fn remove(&self, session_id: &str, path: &str, is_dir: bool) -> Result<()> {
        log::info!("SFTP remove: session={}, path={}, is_dir={}", session_id, path, is_dir);
        let session = self.get_session(session_id).await?;

        if is_dir {
            session
                .sftp
                .remove_dir(path)
                .await
                .map_err(|e| anyhow!("{}", e))?;
        } else {
            session
                .sftp
                .remove_file(path)
                .await
                .map_err(|e| anyhow!("{}", e))?;
        }
        Ok(())
    }

    pub async fn rename(&self, session_id: &str, old_path: &str, new_path: &str) -> Result<()> {
        log::info!("SFTP rename: session={}, {} -> {}", session_id, old_path, new_path);
        let session = self.get_session(session_id).await?;

        session
            .sftp
            .rename(old_path, new_path)
            .await
            .map_err(|e| anyhow!("{}", e))?;
        Ok(())
    }

    pub async fn chmod(&self, session_id: &str, path: &str, mode: u32) -> Result<()> {
        log::debug!("SFTP chmod: session={}, path={}, mode={:o}", session_id, path, mode);
        let session = self.get_session(session_id).await?;

        let mut attrs = FileAttributes::empty();
        attrs.permissions = Some(mode);

        session
            .sftp
            .set_metadata(path, attrs)
            .await
            .map_err(|e| anyhow!("{}", e))?;
        Ok(())
    }
}

fn format_unix_permissions(mode: u32) -> String {
    let mut s = String::with_capacity(10);

    let file_type = (mode >> 12) & 0xF;
    s.push(match file_type {
        0o04 => 'd',
        0o12 => 'l',
        _ => '-',
    });

    for shift in [6, 3, 0] {
        let bits = (mode >> shift) & 7;
        s.push(if bits & 4 != 0 { 'r' } else { '-' });
        s.push(if bits & 2 != 0 { 'w' } else { '-' });
        s.push(if bits & 1 != 0 { 'x' } else { '-' });
    }

    s
}

pub fn extension_to_kind(name: &str) -> String {
    name.rsplit('.')
        .next()
        .filter(|ext| ext.len() < 10 && !ext.is_empty() && *ext != name)
        .map(|ext| ext.to_lowercase())
        .unwrap_or_else(|| "file".to_string())
}
