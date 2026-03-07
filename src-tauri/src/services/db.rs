use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

use crate::commands::connection::ConnectionInfo;
use crate::commands::settings::AppSettings;
use crate::commands::snippet::Snippet;
use crate::services::crypto;

fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

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
                encrypted_password TEXT DEFAULT '',
                encrypted_key_path TEXT DEFAULT '',
                encrypted_key_passphrase TEXT DEFAULT '',
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

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS sync_metadata (
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                synced_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (table_name, record_id)
            )",
        )
        .execute(&self.pool)
        .await?;

        // Upgrade existing connections table — safe to call repeatedly (errors ignored)
        for col in ["encrypted_password", "encrypted_key_path", "encrypted_key_passphrase"] {
            let _ = sqlx::query(&format!(
                "ALTER TABLE connections ADD COLUMN {} TEXT DEFAULT ''",
                col
            ))
            .execute(&self.pool)
            .await;
        }

        Ok(())
    }

    // ── Settings ──

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

    // ── Snippets ──

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
        let now = now_epoch();

        sqlx::query(
            "INSERT INTO snippets (id, name, content, tags, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=?, content=?, tags=?, updated_at=?",
        )
        .bind(&snippet.id)
        .bind(&snippet.name)
        .bind(&snippet.content)
        .bind(&tags)
        .bind(now)
        .bind(now)
        .bind(&snippet.name)
        .bind(&snippet.content)
        .bind(&tags)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.touch_sync("snippets", &snippet.id).await?;
        Ok(())
    }

    pub async fn delete_snippet(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM snippets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM sync_metadata WHERE table_name = 'snippets' AND record_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Connections ──

    pub async fn get_connections(&self) -> Result<Vec<ConnectionInfo>> {
        let rows: Vec<(String, String, String, i32, String, String, String, String, String, String)> =
            sqlx::query_as(
                "SELECT id, name, host, port, username, auth_type, group_name,
                        encrypted_password, encrypted_key_path, encrypted_key_passphrase
                 FROM connections ORDER BY name",
            )
            .fetch_all(&self.pool)
            .await?;

        let mut conns = Vec::with_capacity(rows.len());
        for (id, name, host, port, username, auth_type, group, enc_pw, enc_kp, enc_kpp) in rows {
            conns.push(ConnectionInfo {
                id,
                name,
                host,
                port,
                username,
                auth_type,
                group,
                password: crypto::decrypt(&enc_pw).unwrap_or_default(),
                key_path: crypto::decrypt(&enc_kp).unwrap_or_default(),
                key_passphrase: crypto::decrypt(&enc_kpp).unwrap_or_default(),
            });
        }
        Ok(conns)
    }

    pub async fn save_connection(&self, conn: &ConnectionInfo) -> Result<()> {
        let now = now_epoch();
        let enc_pw = crypto::encrypt(&conn.password)?;
        let enc_kp = crypto::encrypt(&conn.key_path)?;
        let enc_kpp = crypto::encrypt(&conn.key_passphrase)?;

        sqlx::query(
            "INSERT INTO connections (id, name, host, port, username, auth_type, group_name,
                encrypted_password, encrypted_key_path, encrypted_key_passphrase, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name=?, host=?, port=?, username=?, auth_type=?, group_name=?,
                encrypted_password=?, encrypted_key_path=?, encrypted_key_passphrase=?, updated_at=?",
        )
        .bind(&conn.id).bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp)
        .bind(now).bind(now)
        // ON CONFLICT SET
        .bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.touch_sync("connections", &conn.id).await?;
        Ok(())
    }

    pub async fn delete_connection(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM sync_metadata WHERE table_name = 'connections' AND record_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Sync metadata ──

    async fn touch_sync(&self, table: &str, record_id: &str) -> Result<()> {
        let now = now_epoch();
        sqlx::query(
            "INSERT OR REPLACE INTO sync_metadata (table_name, record_id, updated_at, synced_at)
             VALUES (?, ?, ?, 0)",
        )
        .bind(table)
        .bind(record_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_unsynced(&self, table: &str) -> Result<Vec<(String, i64)>> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT record_id, updated_at FROM sync_metadata
             WHERE table_name = ? AND updated_at > synced_at",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn mark_synced(&self, table: &str, record_id: &str) -> Result<()> {
        let now = now_epoch();
        sqlx::query(
            "UPDATE sync_metadata SET synced_at = ? WHERE table_name = ? AND record_id = ?",
        )
        .bind(now)
        .bind(table)
        .bind(record_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
