use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub cursor_style: String,
    pub scroll_back: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_family: "JetBrains Mono, Consolas, monospace".to_string(),
            font_size: 14,
            cursor_style: "block".to_string(),
            scroll_back: 10000,
        }
    }
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<AppSettings, String> {
    db.get_settings().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.save_settings(&settings).await.map_err(|e| e.to_string())
}
