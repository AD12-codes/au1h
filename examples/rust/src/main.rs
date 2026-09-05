//! au1h example backend in Rust (axum + jsonwebtoken).
//!
//! Serves the demo page and one protected endpoint, GET /api/me, which verifies
//! the JWT minted by au1h (EdDSA / Ed25519) against au1h's JWKS and echoes the
//! verified user claims back.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse},
    routing::get,
    Json, Router,
};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::sync::RwLock;

const INDEX_HTML: &str = include_str!("../index.html");

#[derive(Debug, Deserialize)]
struct Au1hClaims {
    sub: String,
    email: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, rename = "applicationId")]
    application_id: Option<String>,
    iss: String,
    aud: Value,
    iat: i64,
    exp: i64,
}

struct AppState {
    au1h_url: String,
    app_slug: String,
    app_id: Option<String>, // optional: pin tokens to this application
    http: reqwest::Client,
    jwks: RwLock<Option<JwkSet>>,
}

impl AppState {
    async fn fetch_jwks(&self) -> Result<JwkSet, String> {
        let url = format!("{}/api/auth/jwks", self.au1h_url);
        let set: JwkSet = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("jwks fetch failed: {e}"))?
            .error_for_status()
            .map_err(|e| format!("jwks fetch failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("jwks parse failed: {e}"))?;
        *self.jwks.write().await = Some(set.clone());
        Ok(set)
    }

    /// Look up the key by `kid`, refetching the JWKS once if the key is unknown.
    async fn decoding_key(&self, kid: &str) -> Result<DecodingKey, String> {
        if let Some(set) = self.jwks.read().await.as_ref() {
            if let Some(jwk) = set.find(kid) {
                return DecodingKey::from_jwk(jwk).map_err(|e| e.to_string());
            }
        }
        let set = self.fetch_jwks().await?;
        let jwk = set.find(kid).ok_or_else(|| format!("unknown kid {kid}"))?;
        DecodingKey::from_jwk(jwk).map_err(|e| e.to_string())
    }

    async fn verify(&self, token: &str) -> Result<Au1hClaims, String> {
        let header = decode_header(token).map_err(|e| e.to_string())?;
        let kid = header.kid.ok_or("token has no kid header")?;
        let key = self.decoding_key(&kid).await?;

        let mut validation = Validation::new(Algorithm::EdDSA);
        validation.set_issuer(&[&self.au1h_url]);
        validation.set_audience(&[&self.au1h_url]);

        decode::<Au1hClaims>(token, &key, &validation)
            .map(|data| data.claims)
            .map_err(|e| e.to_string())
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| fallback.to_string())
}

fn error(status: StatusCode, msg: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({ "error": msg.into() }))).into_response()
}

async fn index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn config(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "language": "rust",
        "au1hUrl": state.au1h_url,
        "appSlug": state.app_slug,
    }))
}

async fn me(State(state): State<Arc<AppState>>, headers: HeaderMap) -> axum::response::Response {
    let Some(token) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    else {
        return error(StatusCode::UNAUTHORIZED, "missing bearer token");
    };

    let claims = match state.verify(token).await {
        Ok(c) => c,
        Err(e) => return error(StatusCode::UNAUTHORIZED, format!("invalid token: {e}")),
    };

    // Tenant check: a token from another au1h application must not be accepted here.
    if let Some(expected) = &state.app_id {
        if claims.application_id.as_deref() != Some(expected.as_str()) {
            return error(StatusCode::FORBIDDEN, "token was issued for a different application");
        }
    }

    Json(json!({
        "language": "rust",
        "library": "jsonwebtoken",
        "user": {
            "id": claims.sub,
            "email": claims.email,
            "name": claims.name,
            "applicationId": claims.application_id,
        },
        "token": {
            "issuer": claims.iss,
            "audience": claims.aud,
            "issuedAt": claims.iat,
            "expiresAt": claims.exp,
        },
    }))
    .into_response()
}

#[tokio::main]
async fn main() {
    let port = env_or("PORT", "8082");
    let state = Arc::new(AppState {
        au1h_url: env_or("AU1H_URL", "http://localhost:4444").trim_end_matches('/').to_string(),
        app_slug: env_or("AU1H_APP_SLUG", "example-rust"),
        app_id: std::env::var("AU1H_APP_ID").ok().filter(|v| !v.is_empty()),
        http: reqwest::Client::new(),
        jwks: RwLock::new(None),
    });

    if let Err(e) = state.fetch_jwks().await {
        eprintln!("warning: initial JWKS fetch failed ({e}); will retry on first request");
    }

    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(health))
        .route("/api/config", get(config))
        .route("/api/me", get(me))
        .with_state(state.clone());

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    println!(
        "au1h Rust example listening on http://localhost:{port} (app slug: {})",
        state.app_slug
    );
    axum::serve(listener, app).await.expect("server");
}
