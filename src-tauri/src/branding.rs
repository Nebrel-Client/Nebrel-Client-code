//! Central branding and endpoint definition for the Nebrel Client.
//!
//! Every host the launcher talks to is declared here so a self-hosted
//! deployment only has to change this file, or override the values at build
//! time through the matching environment variables.

/// Reads a build-time environment variable, falling back to the default.
macro_rules! endpoint {
    ($var:literal, $default:literal) => {
        match option_env!($var) {
            Some(value) => value,
            None => $default,
        }
    };
}

/// Product name, used in user agents and window titles.
pub const PRODUCT_NAME: &str = "Nebrel";

/// Contact address advertised in the HTTP user agent.
pub const SUPPORT_EMAIL: &str = endpoint!("NEBREL_SUPPORT_EMAIL", "support@nebrel.de");

/// Core API, production. Serves accounts, friends, packs and notifications.
pub const API_BASE: &str = endpoint!("NEBREL_API_BASE", "https://api.nebrel.de/api/v1");

/// Core API, staging. Used when the launcher runs in experimental mode.
pub const API_BASE_STAGING: &str =
    endpoint!("NEBREL_API_BASE_STAGING", "https://api-staging.nebrel.de/api/v1");

/// Asset and cape CDN.
pub const CDN_BASE: &str = endpoint!("NEBREL_CDN_BASE", "https://cdn.nebrel.de");

/// Discord rich presence and OAuth bridge.
pub const DISCORD_API_BASE: &str =
    endpoint!("NEBREL_DISCORD_API_BASE", "https://discord-api.nebrel.de/api/v1/discord");

/// Returns the core API base for the selected environment.
pub fn api_base(is_experimental: bool) -> &'static str {
    if is_experimental {
        API_BASE_STAGING
    } else {
        API_BASE
    }
}

/// Returns the bare host name of the core API, for WebSocket handshakes.
pub fn api_host(is_experimental: bool) -> &'static str {
    let base = api_base(is_experimental);
    let without_scheme = match base.split_once("://") {
        Some((_, rest)) => rest,
        None => base,
    };
    match without_scheme.split_once('/') {
        Some((host, _)) => host,
        None => without_scheme,
    }
}
