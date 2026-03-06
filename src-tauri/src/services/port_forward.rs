use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PortForwardConfig {
    pub id: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub forward_type: ForwardType,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ForwardType {
    Local,
    Remote,
    Dynamic,
}

pub struct PortForwardManager;

impl PortForwardManager {
    pub fn new() -> Self {
        Self
    }

    pub async fn start_forward(&self, _config: &PortForwardConfig) -> Result<()> {
        // TODO: implement port forwarding via russh direct-tcpip
        log::info!("Port forwarding requested");
        Ok(())
    }

    pub async fn stop_forward(&self, _id: &str) -> Result<()> {
        // TODO: implement stopping port forward
        Ok(())
    }
}
