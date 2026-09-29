use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;

/// Runs an additive migration, tolerating only the error that means it has already run.
///
/// The previous form discarded every result, so a database lock, a full disk or an
/// unreadable schema was indistinguishable from "the column is already there": startup
/// reported success and the first query that needed the column failed instead, far from
/// the cause and with no hint of it.
async fn add_column(pool: &Pool<Sqlite>, statement: &str) -> Result<()> {
    match sqlx::query(statement).execute(pool).await {
        Ok(_) => Ok(()),
        // SQLite reports a repeated ADD COLUMN this way, and nothing else does.
        Err(sqlx::Error::Database(error)) if error.message().contains("duplicate column name") => {
            Ok(())
        }
        Err(error) => Err(anyhow::anyhow!(
            "schema migration failed ({statement}): {error}"
        )),
    }
}

use crate::commands::connection::ConnectionInfo;
use crate::commands::keychain::KeychainItem;
use crate::commands::settings::AppSettings;
use crate::commands::snippet::Snippet;
use crate::services::crypto;
use crate::services::proxy::ProxyMode;

fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub struct Database {
    pool: Pool<Sqlite>,
}

/// Row shape of the connections query. Thirteen positional columns, which is unreadable
/// written inline.
type ConnectionRow = (
    String,
    String,
    String,
    i32,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
);

/// Row shape of the terminal-log query.
type TerminalLogRow = (String, String, String, String, String, String, i64, i64);

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
                proxy_choice TEXT NOT NULL DEFAULT '',
                encrypted_proxy_password TEXT NOT NULL DEFAULT '',
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

        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN encrypted_password TEXT DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN encrypted_key_path TEXT DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN encrypted_key_passphrase TEXT DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN keychain_id TEXT DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN proxy_choice TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE connections ADD COLUMN encrypted_proxy_password TEXT NOT NULL DEFAULT ''",
        )
        .await?;

        add_column(
            &self.pool,
            "ALTER TABLE keychain ADD COLUMN encrypted_private_key TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE keychain ADD COLUMN encrypted_public_key TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE keychain ADD COLUMN encrypted_certificate TEXT NOT NULL DEFAULT ''",
        )
        .await?;
        add_column(
            &self.pool,
            "ALTER TABLE keychain ADD COLUMN encrypted_passphrase TEXT NOT NULL DEFAULT ''",
        )
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS terminal_logs (
                id TEXT PRIMARY KEY,
                connection_id TEXT NOT NULL DEFAULT '',
                connection_name TEXT NOT NULL DEFAULT '',
                host TEXT NOT NULL DEFAULT '',
                username TEXT NOT NULL DEFAULT '',
                session_type TEXT NOT NULL DEFAULT 'ssh',
                started_at INTEGER NOT NULL,
                ended_at INTEGER NOT NULL,
                content TEXT NOT NULL DEFAULT ''
            )",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // ── Settings ──

    pub async fn get_settings(&self) -> Result<AppSettings> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'app_settings'")
                .fetch_optional(&self.pool)
                .await?;

        match row {
            Some((json,)) => Ok(serde_json::from_str(&json)?),
            None => Ok(AppSettings::default()),
        }
    }

    pub async fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?)")
            .bind(&json)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ── Snippets ──

    pub async fn get_snippets(&self) -> Result<Vec<Snippet>> {
        let rows: Vec<(String, String, String, String)> =
            sqlx::query_as("SELECT id, name, content, tags FROM snippets ORDER BY name")
                .fetch_all(&self.pool)
                .await?;

        let snippets = rows
            .into_iter()
            .map(|(id, name, content, tags)| {
                let tags: Vec<String> = serde_json::from_str(&tags).unwrap_or_else(|e| {
                    log::warn!("Failed to parse tags JSON for snippet {}: {}", id, e);
                    Vec::new()
                });
                Snippet {
                    id,
                    name,
                    content,
                    tags,
                }
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

        self.touch_sync_best_effort("snippets", &snippet.id).await;
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
        let rows: Vec<ConnectionRow> = sqlx::query_as(
            "SELECT id, name, host, port, username, auth_type, group_name,
                        encrypted_password, encrypted_key_path, encrypted_key_passphrase,
                        COALESCE(keychain_id, '') as keychain_id,
                        COALESCE(proxy_choice, '') as proxy_choice,
                        COALESCE(encrypted_proxy_password, '') as encrypted_proxy_password
                 FROM connections ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut conns = Vec::with_capacity(rows.len());
        for (
            id,
            name,
            host,
            port,
            username,
            auth_type,
            group,
            enc_pw,
            enc_kp,
            enc_kpp,
            keychain_id,
            proxy_choice,
            enc_proxy_pw,
        ) in rows
        {
            let password =
                crypto::decrypt_secret(&enc_pw, &format!("the password for connection {id}"))?;
            let key_path =
                crypto::decrypt_secret(&enc_kp, &format!("the key path for connection {id}"))?;
            let key_passphrase = crypto::decrypt_secret(
                &enc_kpp,
                &format!("the key passphrase for connection {id}"),
            )?;
            // The proxy password is stored apart from the mode so it can be encrypted.
            let mut proxy: Option<ProxyMode> = if proxy_choice.trim().is_empty() {
                None
            } else {
                serde_json::from_str(&proxy_choice).ok()
            };
            if let Some(ProxyMode::Custom(config)) = proxy.as_mut() {
                config.password = crypto::decrypt_secret(
                    &enc_proxy_pw,
                    &format!("the proxy password for connection {id}"),
                )?;
            }
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
                proxy,
            });
        }
        Ok(conns)
    }

    pub async fn save_connection(&self, conn: &ConnectionInfo) -> Result<()> {
        let now = now_epoch();
        let enc_pw = crypto::encrypt(&conn.password)?;
        let enc_kp = crypto::encrypt(&conn.key_path)?;
        let enc_kpp = crypto::encrypt(&conn.key_passphrase)?;

        // Split the proxy password out of the mode so it can be encrypted at rest.
        let mut proxy = conn.proxy.clone();
        let proxy_password = match proxy.as_mut() {
            Some(ProxyMode::Custom(config)) => std::mem::take(&mut config.password),
            _ => String::new(),
        };
        let proxy_choice = match &proxy {
            Some(mode) => serde_json::to_string(mode)?,
            None => String::new(),
        };
        let enc_proxy_pw = crypto::encrypt(&proxy_password)?;

        sqlx::query(
            "INSERT INTO connections (id, name, host, port, username, auth_type, group_name,
                encrypted_password, encrypted_key_path, encrypted_key_passphrase, keychain_id,
                proxy_choice, encrypted_proxy_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name=?, host=?, port=?, username=?, auth_type=?, group_name=?,
                encrypted_password=?, encrypted_key_path=?, encrypted_key_passphrase=?, keychain_id=?,
                proxy_choice=?, encrypted_proxy_password=?, updated_at=?",
        )
        .bind(&conn.id).bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp).bind(&conn.keychain_id)
        .bind(&proxy_choice).bind(&enc_proxy_pw)
        .bind(now).bind(now)
        // ON CONFLICT SET
        .bind(&conn.name).bind(&conn.host).bind(conn.port)
        .bind(&conn.username).bind(&conn.auth_type).bind(&conn.group)
        .bind(&enc_pw).bind(&enc_kp).bind(&enc_kpp).bind(&conn.keychain_id)
        .bind(&proxy_choice).bind(&enc_proxy_pw)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.touch_sync_best_effort("connections", &conn.id).await;
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
            let decrypt = |field: &str, enc: &str| -> Result<String> {
                crypto::decrypt_secret(enc, &format!("the {field} of keychain item {id}"))
            };
            items.push(KeychainItem {
                id: id.clone(),
                name,
                key_type,
                private_key: decrypt("private key", &enc_pk)?,
                public_key: decrypt("public key", &enc_pub)?,
                certificate: decrypt("certificate", &enc_cert)?,
                passphrase: decrypt("passphrase", &enc_pp)?,
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

        self.touch_sync_best_effort("keychain", &item.id).await;
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

    /// Records that a row changed, for incremental-sync bookkeeping.
    ///
    /// Best effort on purpose. By the time this runs the caller's row is already
    /// committed, so propagating a failure would report a save that did happen as a
    /// failure — the two statements would have to be one transaction to be all-or-nothing.
    /// Current sync pushes full snapshots and never reads this table; anyone building
    /// incremental sync on top of it has to make that change first.
    async fn touch_sync_best_effort(&self, table: &str, record_id: &str) {
        let now = now_epoch();
        let result = sqlx::query(
            "INSERT OR REPLACE INTO sync_metadata (table_name, record_id, updated_at, synced_at)
             VALUES (?, ?, ?, 0)",
        )
        .bind(table)
        .bind(record_id)
        .bind(now)
        .execute(&self.pool)
        .await;
        if let Err(error) = result {
            log::warn!("Could not record sync metadata for {table}/{record_id}: {error}");
        }
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

    // ── Terminal Logs ──

    pub async fn get_terminal_logs(
        &self,
    ) -> Result<Vec<crate::commands::terminal_log::TerminalLogEntry>> {
        let rows: Vec<TerminalLogRow> = sqlx::query_as(
            "SELECT id, connection_id, connection_name, host, username, session_type, started_at, ended_at
             FROM terminal_logs ORDER BY ended_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(
                |(
                    id,
                    connection_id,
                    connection_name,
                    host,
                    username,
                    session_type,
                    started_at,
                    ended_at,
                )| {
                    crate::commands::terminal_log::TerminalLogEntry {
                        id,
                        connection_id,
                        connection_name,
                        host,
                        username,
                        session_type,
                        started_at,
                        ended_at,
                    }
                },
            )
            .collect())
    }

    pub async fn get_terminal_log_content(&self, id: &str) -> Result<Option<String>> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT content FROM terminal_logs WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(c,)| c))
    }

    pub async fn save_terminal_log(
        &self,
        log: &crate::commands::terminal_log::SaveTerminalLog,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO terminal_logs (id, connection_id, connection_name, host, username, session_type, started_at, ended_at, content)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&log.id)
        .bind(&log.connection_id)
        .bind(&log.connection_name)
        .bind(&log.host)
        .bind(&log.username)
        .bind(&log.session_type)
        .bind(log.started_at)
        .bind(log.ended_at)
        .bind(&log.content)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_terminal_log(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM terminal_logs WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn clear_terminal_logs(&self) -> Result<()> {
        sqlx::query("DELETE FROM terminal_logs")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
