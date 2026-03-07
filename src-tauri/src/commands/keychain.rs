use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeychainItem {
    pub id: String,
    pub name: String,
    pub key_type: String,
    #[serde(default)]
    pub private_key: String,
    #[serde(default)]
    pub passphrase: String,
}

#[tauri::command]
pub async fn get_keychain_items(db: State<'_, Database>) -> Result<Vec<KeychainItem>, String> {
    db.get_keychain_items().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_keychain_item(
    item: KeychainItem,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.save_keychain_item(&item).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_keychain_item(
    id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.delete_keychain_item(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_key_file(path: String) -> Result<String, String> {
    let canonical = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;

    let meta = tokio::fs::metadata(&canonical).await
        .map_err(|e| format!("Cannot access '{}': {}", path, e))?;
    if !meta.is_file() {
        return Err(format!("'{}' is not a regular file", path));
    }
    const MAX_KEY_SIZE: u64 = 64 * 1024;
    if meta.len() > MAX_KEY_SIZE {
        return Err(format!("File too large ({} bytes, max {})", meta.len(), MAX_KEY_SIZE));
    }

    tokio::fs::read_to_string(&canonical)
        .await
        .map_err(|e| format!("Failed to read key file '{}': {}", path, e))
}
