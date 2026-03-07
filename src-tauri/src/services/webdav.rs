use anyhow::{Context, Result};
use reqwest::Client;

pub struct WebDavClient {
    base_url: String,
    username: String,
    password: String,
    client: Client,
}

impl WebDavClient {
    pub fn new(base_url: &str, username: &str, password: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            username: username.to_string(),
            password: password.to_string(),
            client: Client::new(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    pub async fn propfind(&self, path: &str) -> Result<String> {
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .header("Depth", "1")
            .send()
            .await
            .context("PROPFIND request failed")?;

        let status = resp.status();
        if status.is_success() || status.as_u16() == 207 {
            Ok(resp.text().await.unwrap_or_default())
        } else {
            anyhow::bail!("PROPFIND {} returned {}", path, status)
        }
    }

    pub async fn get(&self, path: &str) -> Result<String> {
        let resp = self
            .client
            .get(self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("GET request failed")?;

        if resp.status().is_success() {
            Ok(resp.text().await.unwrap_or_default())
        } else {
            anyhow::bail!("GET {} returned {}", path, resp.status())
        }
    }

    pub async fn put(&self, path: &str, body: &str) -> Result<()> {
        let resp = self
            .client
            .put(self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .header("Content-Type", "application/json")
            .body(body.to_string())
            .send()
            .await
            .context("PUT request failed")?;

        if resp.status().is_success() || resp.status().as_u16() == 201 {
            Ok(())
        } else {
            anyhow::bail!("PUT {} returned {}", path, resp.status())
        }
    }

    pub async fn mkcol(&self, path: &str) -> Result<()> {
        let resp = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), self.url(path))
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("MKCOL request failed")?;

        let status = resp.status();
        if status.is_success() || status.as_u16() == 201 || status.as_u16() == 405 {
            // 405 = already exists, which is fine
            Ok(())
        } else {
            anyhow::bail!("MKCOL {} returned {}", path, status)
        }
    }
}
