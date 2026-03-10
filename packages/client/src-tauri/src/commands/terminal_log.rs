use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLogEntry {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub host: String,
    pub username: String,
    pub session_type: String,
    pub started_at: i64,
    pub ended_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTerminalLog {
    pub id: String,
    pub connection_id: String,
    pub connection_name: String,
    pub host: String,
    pub username: String,
    pub session_type: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub content: String,
}

#[tauri::command]
pub async fn get_terminal_logs(db: State<'_, Database>) -> Result<Vec<TerminalLogEntry>, String> {
    db.get_terminal_logs().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_terminal_log_content(db: State<'_, Database>, id: String) -> Result<Option<String>, String> {
    db.get_terminal_log_content(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_terminal_log(db: State<'_, Database>, log: SaveTerminalLog) -> Result<(), String> {
    db.save_terminal_log(&log).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_terminal_log(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_terminal_log(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_terminal_logs(db: State<'_, Database>) -> Result<(), String> {
    db.clear_terminal_logs().await.map_err(|e| e.to_string())
}
