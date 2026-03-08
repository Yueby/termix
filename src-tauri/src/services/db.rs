use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

use crate::commands::connection::ConnectionInfo;
use crate::commands::keychain::KeychainItem;
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

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS keychain (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                key_type TEXT NOT NULL DEFAULT 'ssh-key',
                encrypted_private_key TEXT NOT NULL DEFAULT '',
                encrypted_public_key TEXT NOT NULL DEFAULT '',
                encrypted_certificate TEXT NOT NULL DEFAULT '',
                encrypted_passphrase TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN encrypted_password TEXT DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN encrypted_key_path TEXT DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN encrypted_key_passphrase TEXT DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE connections ADD COLUMN keychain_id TEXT DEFAULT ''")
            .execute(&self.pool).await;

        let _ = sqlx::query("ALTER TABLE keychain ADD COLUMN encrypted_private_key TEXT NOT NULL DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE keychain ADD COLUMN encrypted_public_key TEXT NOT NULL DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE keychain ADD COLUMN encrypted_certificate TEXT NOT NULL DEFAULT ''")
            .execute(&self.pool).await;
        let _ = sqlx::query("ALTER TABLE keychain ADD COLUMN encrypted_passphrase TEXT NOT NULL DEFAULT ''")
            .execute(&self.pool).await;

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
                let tags: Vec<String> = serde_json::from_str(&tags).unwrap_or_else(|e| {
                    log::warn!("Failed to parse tags JSON for snippet {}: {}", id, e);
                    Vec::new()
                });
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
        let rows: Vec<(String, String, String, i32, String, String, String, String, String, String, String)> =
            sqlx::query_as(
                "SELECT id, name, host, port, username, auth_type, group_name,
                        encrypted_password, encrypted_key_path, encrypted_key_passphrase,
                        COALESCE(keychain_id, '') as keychain_id
                 FROM connections ORDER BY name",
            )
            .fetch_all(&self.pool)
            .await?;

        let mut conns = Vec::with_capacity(rows.len());
        for (id, name, host, port, username, auth_type, group, enc_pw, enc_kp, enc_kpp, keychain_id) in rows {
            let password = crypto::decrypt(&enc_pw).unwrap_or_else(|e| {
                log::warn!("Failed to decrypt password for connection {}: {}", id, e);
                String::new()
            });
            let key_path = crypto::decrypt(&enc_kp).unwrap_or_else(|e| {
                log::warn!("Failed to decrypt key_path for connection {}: {}", id, e);
                String::new()
            });
            let key_passphrase = crypto::decrypt(&enc_kpp).unwrap_or_else(|e| {
                log::warn!("Failed to decrypt key_passphrase for connection {}: {}", id, e);
                String::new()
            });
            conns.push(ConnectionInfo {
                id,
                name,
                host,
                port,
                username,
                auth_type,
                group,
                password,
                key_path,
                key_passphrase,
                keychain_id,
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
                encrypted_password, encrypted_key_path, encrypted_key_passphrase, keychain_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name=?, host=?, port=?, username=?, auth_type=?, group_name=?,
                encrypted_password=?, encrypted_key_path=?, encrypted_key_passphrase=?, keychain_id=?, updated_at=?",
        )
        .bind(&conn.id).bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp).bind(&conn.keychain_id)
        .bind(now).bind(now)
        // ON CONFLICT SET
        .bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp).bind(&conn.keychain_id)
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

    // ── Keychain ──

    pub async fn get_keychain_items(&self) -> Result<Vec<KeychainItem>> {
        let rows: Vec<(String, String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT id, name, key_type, encrypted_private_key, encrypted_public_key, encrypted_certificate, encrypted_passphrase FROM keychain ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut items = Vec::with_capacity(rows.len());
        for (id, name, key_type, enc_pk, enc_pub, enc_cert, enc_pp) in rows {
            let decrypt = |field: &str, enc: &str| -> String {
                crypto::decrypt(enc).unwrap_or_else(|e| {
                    log::warn!("Failed to decrypt {} for keychain {}: {}", field, id, e);
                    String::new()
                })
            };
            items.push(KeychainItem {
                id: id.clone(),
                name,
                key_type,
                private_key: decrypt("private_key", &enc_pk),
                public_key: decrypt("public_key", &enc_pub),
                certificate: decrypt("certificate", &enc_cert),
                passphrase: decrypt("passphrase", &enc_pp),
            });
        }
        Ok(items)
    }

    pub async fn save_keychain_item(&self, item: &KeychainItem) -> Result<()> {
        let now = now_epoch();
        let enc_pk = crypto::encrypt(&item.private_key)?;
        let enc_pub = crypto::encrypt(&item.public_key)?;
        let enc_cert = crypto::encrypt(&item.certificate)?;
        let enc_pp = crypto::encrypt(&item.passphrase)?;

        sqlx::query(
            "INSERT INTO keychain (id, name, key_type, encrypted_private_key, encrypted_public_key, encrypted_certificate, encrypted_passphrase, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name=?, key_type=?, encrypted_private_key=?, encrypted_public_key=?, encrypted_certificate=?, encrypted_passphrase=?, updated_at=?",
        )
        .bind(&item.id).bind(&item.name).bind(&item.key_type)
        .bind(&enc_pk).bind(&enc_pub).bind(&enc_cert).bind(&enc_pp)
        .bind(now).bind(now)
        .bind(&item.name).bind(&item.key_type)
        .bind(&enc_pk).bind(&enc_pub).bind(&enc_cert).bind(&enc_pp)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.touch_sync("keychain", &item.id).await?;
        Ok(())
    }

    pub async fn delete_keychain_item(&self, id: &str) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("UPDATE connections SET keychain_id = '' WHERE keychain_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM keychain WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM sync_metadata WHERE table_name = 'keychain' AND record_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
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

    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
