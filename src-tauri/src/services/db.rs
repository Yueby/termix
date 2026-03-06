use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

use crate::commands::settings::AppSettings;
use crate::commands::snippet::Snippet;

pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(app_dir: &str) -> Result<Self> {
        let db_path = format!("{}/termix.db", app_dir);
        let options = SqliteConnectOptions::from_str(&format!("sqlite:{}?mode=rwc", db_path))?;

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    async fn run_migrations(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_type TEXT NOT NULL DEFAULT 'password',
                group_name TEXT DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS port_forwards (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                local_port INTEGER NOT NULL,
                remote_host TEXT NOT NULL,
                remote_port INTEGER NOT NULL,
                forward_type TEXT NOT NULL DEFAULT 'local'
            )",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_settings(&self) -> Result<AppSettings> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE key = 'app_settings'",
        )
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some((json,)) => Ok(serde_json::from_str(&json)?),
            None => Ok(AppSettings::default()),
        }
    }

    pub async fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        sqlx::query(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?)",
        )
        .bind(&json)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_snippets(&self) -> Result<Vec<Snippet>> {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT id, name, content, tags FROM snippets ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;

        let snippets = rows
            .into_iter()
            .map(|(id, name, content, tags)| {
                let tags: Vec<String> = serde_json::from_str(&tags).unwrap_or_default();
                Snippet { id, name, content, tags }
            })
            .collect();

        Ok(snippets)
    }

    pub async fn save_snippet(&self, snippet: &Snippet) -> Result<()> {
        let tags = serde_json::to_string(&snippet.tags)?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;

        sqlx::query(
            "INSERT OR REPLACE INTO snippets (id, name, content, tags, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&snippet.id)
        .bind(&snippet.name)
        .bind(&snippet.content)
        .bind(&tags)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_snippet(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM snippets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
