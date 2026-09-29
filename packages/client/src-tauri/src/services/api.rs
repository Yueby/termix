use anyhow::{Context, Result};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// What a push did.
#[derive(Debug, PartialEq, Eq)]
pub enum PushOutcome {
    Written,
    /// The server already holds a version at least as new. Nothing was written.
    Conflict {
        server_version: i64,
    },
}

#[derive(Debug, Serialize)]
struct PushBody<'a> {
    data: &'a str,
    version: i64,
}

#[derive(Debug, Deserialize)]
pub struct PullResponse {
    pub data: Option<String>,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
struct ConflictBody {
    #[serde(default, rename = "serverVersion")]
    server_version: Option<i64>,
}

/// Client for a Termix server the user deployed themselves.
///
/// The vault is a single row addressed by a fixed id, and the only credential is a shared
/// token set on both sides — a private deployment belongs to one person, so there is nothing
/// for accounts to keep apart. The payload is encrypted by the caller before it gets here,
/// so the server stores something it cannot read.
pub struct TermixApi {
    base_url: String,
    token: String,
    client: Client,
}

impl TermixApi {
    pub fn new(base_url: &str, token: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token: token.trim().to_string(),
            client: Client::builder()
                .timeout(Duration::from_secs(60))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// Unauthenticated on the server, so this separates "reachable" from "token is wrong".
    pub async fn health(&self) -> Result<()> {
        let resp = self
            .client
            .get(self.url("/health"))
            .send()
            .await
            .context("could not reach the server")?;

        if resp.status().is_success() {
            Ok(())
        } else {
            anyhow::bail!("the server answered /health with {}", resp.status())
        }
    }

    pub async fn pull(&self) -> Result<PullResponse> {
        let resp = self
            .client
            .get(self.url("/sync/pull"))
            .bearer_auth(&self.token)
            .send()
            .await
            .context("could not reach the server")?;

        match resp.status() {
            status if status.is_success() => resp
                .json::<PullResponse>()
                .await
                .context("the server sent a response that could not be read"),
            StatusCode::UNAUTHORIZED => anyhow::bail!("the server rejected the token"),
            status => anyhow::bail!("pull failed: the server answered {status}"),
        }
    }

    /// Pushes `data` as `version`. A refusal is an ordinary outcome rather than an error: the
    /// caller needs to pull instead, and that is a decision, not a failure.
    pub async fn push(&self, data: &str, version: i64) -> Result<PushOutcome> {
        let resp = self
            .client
            .post(self.url("/sync/push"))
            .bearer_auth(&self.token)
            .json(&PushBody { data, version })
            .send()
            .await
            .context("could not reach the server")?;

        match resp.status() {
            status if status.is_success() => Ok(PushOutcome::Written),
            StatusCode::CONFLICT => {
                let server_version = resp
                    .json::<ConflictBody>()
                    .await
                    .ok()
                    .and_then(|body| body.server_version)
                    .unwrap_or_default();
                Ok(PushOutcome::Conflict { server_version })
            }
            StatusCode::UNAUTHORIZED => anyhow::bail!("the server rejected the token"),
            StatusCode::PAYLOAD_TOO_LARGE => {
                anyhow::bail!("the vault is larger than the server accepts")
            }
            status => anyhow::bail!("push failed: the server answered {status}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// Serves exactly one canned HTTP response, so the client is exercised over a real
    /// socket rather than against a mock of itself.
    async fn serve_once(status_line: &'static str, body: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let port = listener.local_addr().expect("addr").port();

        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut request = [0u8; 4096];
                let _ = socket.read(&mut request).await;
                let response = format!(
                    "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.flush().await;
            }
        });

        port
    }

    fn api(port: u16) -> TermixApi {
        TermixApi::new(&format!("http://127.0.0.1:{port}"), "a-token")
    }

    #[tokio::test]
    async fn reads_a_vault_back() {
        let port = serve_once("HTTP/1.1 200 OK", r#"{"data":"ciphertext","version":7}"#).await;

        let pulled = api(port).pull().await.expect("pull");
        assert_eq!(pulled.version, 7);
        assert_eq!(pulled.data.as_deref(), Some("ciphertext"));
    }

    #[tokio::test]
    async fn an_empty_vault_is_not_an_error() {
        let port = serve_once("HTTP/1.1 200 OK", r#"{"data":null,"version":0}"#).await;

        let pulled = api(port).pull().await.expect("pull");
        assert_eq!(pulled.version, 0);
        assert!(pulled.data.is_none());
    }

    #[tokio::test]
    async fn a_refused_push_is_an_outcome_rather_than_a_failure() {
        // The caller has to pull instead, and deciding that is not an error.
        let port = serve_once(
            "HTTP/1.1 409 Conflict",
            r#"{"error":"Version conflict","serverVersion":9}"#,
        )
        .await;

        let outcome = api(port).push("payload", 5).await.expect("push");
        assert_eq!(outcome, PushOutcome::Conflict { server_version: 9 });
    }

    #[tokio::test]
    async fn an_accepted_push_reports_success() {
        let port = serve_once("HTTP/1.1 200 OK", r#"{"ok":true,"version":5}"#).await;
        assert_eq!(
            api(port).push("payload", 5).await.expect("push"),
            PushOutcome::Written
        );
    }

    #[tokio::test]
    async fn a_rejected_token_is_reported_as_such() {
        // Distinct from an unreachable server: one is a typo to fix, the other is a
        // deployment to check.
        let port = serve_once("HTTP/1.1 401 Unauthorized", r#"{"error":"Unauthorized"}"#).await;

        let error = api(port).pull().await.expect_err("401 must fail");
        assert!(error.to_string().contains("rejected the token"), "{error}");
    }
}
