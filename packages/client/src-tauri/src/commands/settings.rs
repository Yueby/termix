use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::crypto;
use crate::services::db::Database;
use crate::services::proxy::{ProxyConfig, ProxyMode};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SyncBackend {
    /// Local only. Nothing leaves this machine.
    #[default]
    None,
    Webdav,
    /// A Termix server, deployed by the person using it.
    Termix,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub cursor_style: String,
    pub scroll_back: u32,
    pub terminal_theme_id: String,
    pub default_shell: String,
    /// Which remote the vault syncs to. `none` keeps everything local.
    #[serde(default)]
    pub sync_backend: SyncBackend,
    // WebDAV sync
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_remote_dir: String,
    // A self-deployed Termix server
    #[serde(default)]
    pub server_url: String,
    #[serde(default)]
    pub server_token: String,
    /// The vault version this machine last saw, so a pull can tell whether the remote has
    /// moved on. Per machine: it is deliberately not carried between them.
    #[serde(default)]
    pub vault_version: i64,
    #[serde(default)]
    pub sync_encryption_password: String,
    /// Retry an SSH session automatically when it drops unexpectedly.
    #[serde(default = "default_true")]
    pub auto_reconnect: bool,
    /// Where connections go by default: direct, the OS proxy, or a fixed proxy.
    #[serde(default)]
    pub proxy: ProxyMode,
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_family: "JetBrainsMono NF, JetBrains Mono, Consolas, monospace".to_string(),
            font_size: 14,
            cursor_style: "block".to_string(),
            scroll_back: 10000,
            terminal_theme_id: "default-dark".to_string(),
            default_shell: "auto".to_string(),
            webdav_url: String::new(),
            webdav_username: String::new(),
            webdav_password: String::new(),
            webdav_remote_dir: "/termix".to_string(),
            sync_backend: SyncBackend::None,
            server_url: String::new(),
            server_token: String::new(),
            vault_version: 0,
            sync_encryption_password: String::new(),
            auto_reconnect: true,
            proxy: ProxyMode::Direct,
        }
    }
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<AppSettings, String> {
    let mut s = db.get_settings().await.map_err(|e| e.to_string())?;
    s.webdav_password = crypto::decrypt_secret(&s.webdav_password, "the WebDAV password")
        .map_err(|e| e.to_string())?;
    s.server_token =
        crypto::decrypt_secret(&s.server_token, "the server token").map_err(|e| e.to_string())?;
    s.sync_encryption_password =
        crypto::decrypt_secret(&s.sync_encryption_password, "the sync encryption password")
            .map_err(|e| e.to_string())?;
    if let ProxyMode::Custom(config) = &mut s.proxy {
        config.password = crypto::decrypt_secret(&config.password, "the global proxy password")
            .map_err(|e| e.to_string())?;
    }
    Ok(s)
}

#[tauri::command]
pub async fn save_settings(
    mut settings: AppSettings,
    db: State<'_, Database>,
) -> Result<(), String> {
    settings.webdav_password =
        crypto::encrypt(&settings.webdav_password).map_err(|e| e.to_string())?;
    settings.server_token = crypto::encrypt(&settings.server_token).map_err(|e| e.to_string())?;
    settings.sync_encryption_password =
        crypto::encrypt(&settings.sync_encryption_password).map_err(|e| e.to_string())?;
    if let ProxyMode::Custom(config) = &mut settings.proxy {
        config.password = crypto::encrypt(&config.password).map_err(|e| e.to_string())?;
    }
    db.save_settings(&settings).await.map_err(|e| e.to_string())
}

/// What this machine's system proxy currently resolves to, so the UI can show it
/// next to the "System" option instead of leaving the user guessing.
#[tauri::command]
pub fn get_system_proxy() -> Option<ProxyConfig> {
    crate::services::proxy::system_proxy()
}
