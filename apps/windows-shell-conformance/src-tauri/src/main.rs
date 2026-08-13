mod storage;

use serde_json::{json, Value};
use std::io::Write;
use storage::{ProjectWriterLease, StorageHost};
use tauri::{State, WebviewWindow};

fn pointer_eq(payload: &Value, pointer: &str, expected: &Value) -> bool {
    payload
        .pointer(pointer)
        .is_some_and(|actual| actual == expected)
}

fn payload_matches(payload: &Value) -> bool {
    pointer_eq(payload, "/schemaVersion", &json!(1))
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

fn storage_matches(payload: &Value) -> bool {
    let Some(storage) = payload.get("storage") else {
        return false;
    };
    let Some(result_digest) = storage.get("resultDigest").and_then(Value::as_str) else {
        return false;
    };
    pointer_eq(storage, "/schemaVersion", &json!(0))
        && pointer_eq(storage, "/walBoundaryCount", &json!(7))
        && pointer_eq(storage, "/recoveryRuns", &json!(7))
        && pointer_eq(storage, "/oldSnapshotRecoveries", &json!(4))
        && pointer_eq(storage, "/newSnapshotRecoveries", &json!(3))
        && pointer_eq(storage, "/corruptRecoveries", &json!(0))
        && pointer_eq(storage, "/backupRevisions", &json!([1]))
        && pointer_eq(storage, "/secondOwnerHeld", &json!(true))
        && pointer_eq(storage, "/staleWriterRejected", &json!(true))
        && pointer_eq(storage, "/fencingTokenAdvanced", &json!(true))
        && pointer_eq(storage, "/traversalRejected", &json!(true))
        && result_digest == "69ffefe97f9c90c52d2e5795937fc5c5258e7cc281b05c1f9264f3ee1a40d73c"
}

fn assert_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("INVALID_SENDER".into());
    }
    Ok(())
}

#[tauri::command]
fn project_read(
    window: WebviewWindow,
    state: State<StorageHost>,
    path: String,
) -> Result<Option<String>, String> {
    assert_main_window(&window)?;
    state.read(&path)
}

#[tauri::command]
fn project_write(
    window: WebviewWindow,
    state: State<StorageHost>,
    path: String,
    content: String,
    lease: ProjectWriterLease,
) -> Result<(), String> {
    assert_main_window(&window)?;
    state.write(&path, &content, &lease)
}

#[tauri::command]
fn project_replace(
    window: WebviewWindow,
    state: State<StorageHost>,
    source_path: String,
    target_path: String,
    lease: ProjectWriterLease,
) -> Result<(), String> {
    assert_main_window(&window)?;
    state.replace(&source_path, &target_path, &lease)
}

#[tauri::command]
fn project_remove(
    window: WebviewWindow,
    state: State<StorageHost>,
    path: String,
    lease: ProjectWriterLease,
) -> Result<(), String> {
    assert_main_window(&window)?;
    state.remove(&path, &lease)
}

#[tauri::command]
fn project_reset(window: WebviewWindow, state: State<StorageHost>) -> Result<(), String> {
    assert_main_window(&window)?;
    state.reset()
}

#[tauri::command]
fn lease_acquire(
    window: WebviewWindow,
    state: State<StorageHost>,
    owner_id: String,
    ttl_ms: u64,
) -> Result<Value, String> {
    assert_main_window(&window)?;
    state.acquire(&owner_id, ttl_ms)
}

#[tauri::command]
fn lease_renew(
    window: WebviewWindow,
    state: State<StorageHost>,
    lease: ProjectWriterLease,
    ttl_ms: u64,
) -> Result<Value, String> {
    assert_main_window(&window)?;
    state.renew(&lease, ttl_ms)
}

#[tauri::command]
fn lease_release(
    window: WebviewWindow,
    state: State<StorageHost>,
    lease: ProjectWriterLease,
) -> Result<bool, String> {
    assert_main_window(&window)?;
    state.release(&lease)
}

#[tauri::command]
fn submit_evidence(
    window: WebviewWindow,
    state: State<StorageHost>,
    payload: Value,
) -> Result<(), String> {
    if window.label() != "main" {
        println!(
            "{}",
            json!({"schemaVersion":0,"status":"invalid-sender","exitCode":64})
        );
        let _ = std::io::stdout().flush();
        std::process::exit(64);
    }
    let encoded = serde_json::to_vec(&payload).map_err(|_| "invalid payload")?;
    if encoded.len() > 2_000_000
        || payload.get("observation").is_none()
        || payload.get("report").is_none()
        || payload.get("storage").is_none()
    {
        println!(
            "{}",
            json!({"schemaVersion":0,"status":"invalid-payload","exitCode":64})
        );
        let _ = state.cleanup();
        let _ = std::io::stdout().flush();
        std::process::exit(64);
    }
    let valid = payload_matches(&payload) && storage_matches(&payload);
    let report = if valid {
        json!({"schemaVersion":1,"hostId":"host.windows.tauri-webview2","status":"match","exitCode":0})
    } else {
        json!({"schemaVersion":1,"hostId":"host.windows.tauri-webview2","status":"difference","exitCode":2})
    };
    println!(
        "{}",
        json!({"observation": payload.get("observation"), "storage": payload.get("storage"), "report": report})
    );
    let _ = state.cleanup();
    let _ = std::io::stdout().flush();
    std::process::exit(if valid { 0 } else { 2 });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_payload() -> Value {
        json!({
            "schemaVersion": 1,
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
        assert!(!payload_matches(&json!({"schemaVersion": 1})));
    }

    #[test]
    fn rejects_failed_seed_count() {
        let mut payload = valid_payload();
        payload["observation"]["result"]["spike12"]["failedSeedCount"] = json!(1);
        assert!(!payload_matches(&payload));
    }
}

fn main() {
    if std::env::args().any(|argument| argument == "--inject-invalid-payload") {
        println!(
            "{}",
            json!({"schemaVersion":1,"status":"invalid-payload","exitCode":64})
        );
        let _ = std::io::stdout().flush();
        std::process::exit(64);
    }
    if std::env::args().any(|argument| argument == "--inject-difference") {
        println!(
            "{}",
            json!({"schemaVersion":1,"status":"difference","exitCode":2})
        );
        let _ = std::io::stdout().flush();
        std::process::exit(2);
    }
    let granted_root = std::env::args().find_map(|argument| {
        argument
            .strip_prefix("--project-root=")
            .map(std::path::PathBuf::from)
    });
    let storage = match granted_root {
        Some(root) => StorageHost::create_granted(root).expect("create granted Tauri storage host"),
        None => StorageHost::create().expect("create Tauri storage host"),
    };
    if let Some(logical_path) = std::env::args()
        .find_map(|argument| argument.strip_prefix("--audit-read=").map(str::to_owned))
    {
        let rejected = storage
            .read(&logical_path)
            .is_err_and(|error| error == "REPARSE_POINT_REJECTED");
        println!(
            "{}",
            json!({"schemaVersion":1,"status":if rejected {"reparse-rejected"} else {"reparse-followed"},"exitCode":if rejected {0} else {2}})
        );
        let _ = std::io::stdout().flush();
        std::process::exit(if rejected { 0 } else { 2 });
    }
    if std::env::args().any(|argument| argument == "--audit-grant-only") {
        println!(
            "{}",
            json!({"schemaVersion":1,"status":"grant-accepted","exitCode":0})
        );
        let _ = std::io::stdout().flush();
        std::process::exit(0);
    }
    tauri::Builder::default()
        .manage(storage)
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(|_webview, url| {
                    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            project_read,
            project_write,
            project_replace,
            project_remove,
            project_reset,
            lease_acquire,
            lease_renew,
            lease_release,
            submit_evidence
        ])
        .run(tauri::generate_context!())
        .expect("Tauri conformance host failed");
}
