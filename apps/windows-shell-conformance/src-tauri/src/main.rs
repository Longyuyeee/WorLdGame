use serde_json::{json, Value};
use tauri::{AppHandle, WebviewWindow};

fn pointer_eq(payload: &Value, pointer: &str, expected: &Value) -> bool {
    payload
        .pointer(pointer)
        .is_some_and(|actual| actual == expected)
}

fn payload_matches(payload: &Value) -> bool {
    pointer_eq(payload, "/schemaVersion", &json!(0))
        && pointer_eq(
            payload,
            "/observation/bundleId",
            &json!("bundle.cl04.spike14.v0"),
        )
        && pointer_eq(
            payload,
            "/observation/hostId",
            &json!("host.windows.tauri-webview2"),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike10/recordCount",
            &json!(12),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike10/corpusDigest",
            &json!("6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f"),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike10/traceDigest",
            &json!("9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738"),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike11/recordCount",
            &json!(16),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike11/suiteDigest",
            &json!("39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc"),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike12/seedCount",
            &json!(10000),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike12/replayExecutions",
            &json!(20000),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike12/chunkCount",
            &json!(40),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike12/failedSeedCount",
            &json!(0),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike12/outcomeDigest",
            &json!("770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048"),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike13/recordCount",
            &json!(22),
        )
        && pointer_eq(
            payload,
            "/observation/result/spike13/suiteDigest",
            &json!("fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26"),
        )
        && pointer_eq(payload, "/report/status", &json!("match"))
        && pointer_eq(payload, "/report/exitCode", &json!(0))
}

#[tauri::command]
fn submit_conformance(app: AppHandle, window: WebviewWindow, payload: Value) -> Result<(), String> {
    if window.label() != "main" {
        println!(
            "{}",
            json!({"schemaVersion":0,"status":"invalid-sender","exitCode":64})
        );
        app.exit(64);
        return Ok(());
    }
    let encoded = serde_json::to_vec(&payload).map_err(|_| "invalid payload")?;
    if encoded.len() > 2_000_000
        || payload.get("observation").is_none()
        || payload.get("report").is_none()
    {
        println!(
            "{}",
            json!({"schemaVersion":0,"status":"invalid-payload","exitCode":64})
        );
        app.exit(64);
        return Ok(());
    }
    let valid = payload_matches(&payload);
    let report = if valid {
        json!({"schemaVersion":0,"hostId":"host.windows.tauri-webview2","status":"match","exitCode":0})
    } else {
        json!({"schemaVersion":0,"hostId":"host.windows.tauri-webview2","status":"difference","exitCode":2})
    };
    println!(
        "{}",
        json!({"observation": payload.get("observation"), "report": report})
    );
    app.exit(if valid { 0 } else { 2 });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payload() -> Value {
        json!({
            "schemaVersion": 0,
            "observation": {
                "bundleId": "bundle.cl04.spike14.v0",
                "hostId": "host.windows.tauri-webview2",
                "result": {
                    "spike10": {
                        "recordCount": 12,
                        "corpusDigest": "6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f",
                        "traceDigest": "9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738"
                    },
                    "spike11": {"recordCount": 16, "suiteDigest": "39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc"},
                    "spike12": {
                        "seedCount": 10000,
                        "replayExecutions": 20000,
                        "chunkCount": 40,
                        "failedSeedCount": 0,
                        "outcomeDigest": "770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048"
                    },
                    "spike13": {"recordCount": 22, "suiteDigest": "fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26"}
                }
            },
            "report": {"status": "match", "exitCode": 0}
        })
    }

    #[test]
    fn accepts_exact_observation() {
        assert!(payload_matches(&valid_payload()));
    }

    #[test]
    fn rejects_missing_observation() {
        assert!(!payload_matches(&json!({"schemaVersion": 0})));
    }

    #[test]
    fn rejects_failed_seed_count() {
        let mut payload = valid_payload();
        payload["observation"]["result"]["spike12"]["failedSeedCount"] = json!(1);
        assert!(!payload_matches(&payload));
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_webview, url| {
                    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![submit_conformance])
        .run(tauri::generate_context!())
        .expect("Tauri conformance host failed");
}
