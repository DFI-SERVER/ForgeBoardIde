use serde::Serialize;

#[derive(Serialize)]
pub struct PingResponse {
    pub pong: String,
    pub version: String,
}

#[tauri::command]
pub fn ping() -> PingResponse {
    PingResponse {
        pong: "ForgeBoard IDE backend is alive".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_returns_pong_and_version() {
        let resp = ping();
        assert_eq!(resp.pong, "ForgeBoard IDE backend is alive");
        assert!(!resp.version.is_empty(), "version should be populated");
    }
}
