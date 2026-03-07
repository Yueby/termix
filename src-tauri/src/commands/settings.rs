use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::crypto;
use crate::services::db::Database;

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
    // WebDAV sync
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_remote_dir: String,
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
        }
    }
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<AppSettings, String> {
    let mut s = db.get_settings().await.map_err(|e| e.to_string())?;
    s.webdav_password = crypto::decrypt(&s.webdav_password).unwrap_or_default();
    Ok(s)
}

#[tauri::command]
pub async fn save_settings(
    mut settings: AppSettings,
    db: State<'_, Database>,
) -> Result<(), String> {
    settings.webdav_password = crypto::encrypt(&settings.webdav_password).map_err(|e| e.to_string())?;
    db.save_settings(&settings).await.map_err(|e| e.to_string())
}
