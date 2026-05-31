//! Gemini image-generation call.
//!
//! Runs entirely in Rust: the API key is read from the OS keychain here and
//! attached to the request server-side, so it never enters the webview/JS and
//! there is no CORS surface. We POST the source image + prompt to the
//! `generateContent` endpoint with response modalities TEXT and IMAGE, then
//! decode the returned inline image part.

use crate::apikey::read_api_key;
use serde::Serialize;
use serde_json::{json, Value};

// "Nano Banana" (fast) and "Nano Banana Pro" (Gemini 3 Pro Image — supports
// native 2K/4K output via imageConfig.imageSize).
const FLASH_MODEL: &str = "gemini-2.5-flash-image";
const PRO_MODEL: &str = "gemini-3-pro-image-preview";
const ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Debug, Serialize)]
pub struct RenderResult {
    /// Base64 of the generated image (no data: prefix).
    pub image_base64: String,
    pub mime: String,
    /// Any accompanying text the model returned (may be empty).
    pub text: String,
}

fn model_id(tier: &str) -> &'static str {
    match tier.to_ascii_lowercase().as_str() {
        "pro" => PRO_MODEL,
        _ => FLASH_MODEL,
    }
}

/// Normalize the requested output resolution to a value the API accepts.
/// Only "2K"/"4K" are upscales worth sending; anything else → "1K".
fn normalize_resolution(res: &str) -> &'static str {
    match res.to_ascii_uppercase().as_str() {
        "4K" => "4K",
        "2K" => "2K",
        _ => "1K",
    }
}

/// Send {source image + prompt} to Gemini and return the rendered image.
/// `resolution` ("1K"/"2K"/"4K") only applies to the Pro model (Nano Banana
/// Pro); Flash always outputs 1K.
#[tauri::command]
pub async fn generate_render(
    app: tauri::AppHandle,
    image_base64: String,
    mime: String,
    prompt: String,
    model: String,
    resolution: String,
) -> Result<RenderResult, String> {
    if prompt.trim().is_empty() {
        return Err("Prompt is empty.".into());
    }
    let api_key = read_api_key(&app)?;
    let model_id = model_id(&model);
    let is_pro = model_id == PRO_MODEL;
    let url = format!("{ENDPOINT}/{model_id}:generateContent");

    let mut generation_config = json!({ "responseModalities": ["TEXT", "IMAGE"] });
    // imageConfig.imageSize (2K/4K) is a Nano Banana Pro capability.
    if is_pro {
        generation_config["imageConfig"] = json!({ "imageSize": normalize_resolution(&resolution) });
    }

    let body = json!({
        "contents": [{
            "role": "user",
            "parts": [
                { "text": prompt },
                { "inline_data": { "mime_type": mime, "data": image_base64 } }
            ]
        }],
        "generationConfig": generation_config
    });

    // 4K renders can take several minutes; allow a long but bounded timeout.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("http client error: {e}"))?;
    let resp = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = resp.status();
    let payload: Value = resp
        .json()
        .await
        .map_err(|e| format!("could not parse response: {e}"))?;

    if !status.is_success() {
        let msg = payload
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Gemini API error ({status}): {msg}"));
    }

    parse_image(&payload)
}

/// Pull the first inline image (and any text) out of a generateContent response.
fn parse_image(payload: &Value) -> Result<RenderResult, String> {
    if let Some(reason) = payload
        .get("promptFeedback")
        .and_then(|f| f.get("blockReason"))
        .and_then(|r| r.as_str())
    {
        return Err(format!("Request was blocked: {reason}"));
    }

    let parts = payload
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.as_array())
        .ok_or("Response contained no candidates.")?;

    let mut text = String::new();
    let mut image: Option<(String, String)> = None;

    for part in parts {
        if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
            text.push_str(t);
        }
        // REST responses use camelCase (`inlineData`); accept snake_case too.
        let inline = part.get("inlineData").or_else(|| part.get("inline_data"));
        if let Some(inline) = inline {
            let data = inline.get("data").and_then(|d| d.as_str());
            let mime = inline
                .get("mimeType")
                .or_else(|| inline.get("mime_type"))
                .and_then(|m| m.as_str())
                .unwrap_or("image/png");
            if let Some(data) = data {
                image = Some((data.to_string(), mime.to_string()));
            }
        }
    }

    match image {
        Some((image_base64, mime)) => Ok(RenderResult {
            image_base64,
            mime,
            text,
        }),
        None => {
            let extra = if text.is_empty() {
                String::new()
            } else {
                format!(" Model said: {text}")
            };
            Err(format!("No image was returned.{extra}"))
        }
    }
}
