use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInfo {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    pub group: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub password: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub key_path: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub key_passphrase: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub keychain_id: String,
}

#[tauri::command]
pub async fn get_connections(db: State<'_, Database>) -> Result<Vec<ConnectionInfo>, String> {
    db.get_connections().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_connection(
    conn: ConnectionInfo,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.save_connection(&conn).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.delete_connection(&id).await.map_err(|e| e.to_string())
}
