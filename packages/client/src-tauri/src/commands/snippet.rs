use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub content: String,
    pub tags: Vec<String>,
}

#[tauri::command]
pub async fn get_snippets(db: State<'_, Database>) -> Result<Vec<Snippet>, String> {
    db.get_snippets().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_snippet(
    snippet: Snippet,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.save_snippet(&snippet).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_snippet(
    id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.delete_snippet(&id).await.map_err(|e| e.to_string())
}
