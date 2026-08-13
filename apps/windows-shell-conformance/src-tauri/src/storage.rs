use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use windows_sys::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};

const MAX_CONTENT_BYTES: usize = 2_000_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWriterLease {
    owner_id: String,
    fencing_token: u64,
    expires_at_ms: u64,
}

struct StorageInner {
    active_lease: Option<ProjectWriterLease>,
    next_fencing_token: u64,
    next_temp_id: u64,
}

pub struct StorageHost {
    root: PathBuf,
    inner: Mutex<StorageInner>,
}

impl StorageHost {
    pub fn create() -> Result<Self, String> {
        let root = std::env::temp_dir().join(format!(
            "world-cl03-tauri-{}-{}",
            std::process::id(),
            now_ms()?
        ));
        fs::create_dir_all(&root).map_err(|error| format!("IO_FAILURE:create-root:{error}"))?;
        Ok(Self {
            root,
            inner: Mutex::new(StorageInner {
                active_lease: None,
                next_fencing_token: 1,
                next_temp_id: 1,
            }),
        })
    }

    pub fn read(&self, logical_path: &str) -> Result<Option<String>, String> {
        let _inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        let target = resolve_store_path(&self.root, logical_path)?;
        match fs::read_to_string(target) {
            Ok(content) => Ok(Some(content)),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("IO_FAILURE:read:{logical_path}:{error}")),
        }
    }

    pub fn write(
        &self,
        logical_path: &str,
        content: &str,
        lease: &ProjectWriterLease,
    ) -> Result<(), String> {
        if content.len() > MAX_CONTENT_BYTES {
            return Err("PAYLOAD_TOO_LARGE".into());
        }
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        assert_active_lease(&inner, lease)?;
        let target = resolve_store_path(&self.root, logical_path)?;
        let parent = target.parent().ok_or("INVALID_PATH")?;
        fs::create_dir_all(parent).map_err(|error| format!("IO_FAILURE:mkdir:{error}"))?;
        let temporary = target.with_extension(format!("world-write-{}", inner.next_temp_id));
        inner.next_temp_id += 1;
        let result = (|| {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temporary)
                .map_err(|error| format!("IO_FAILURE:create-temp:{error}"))?;
            file.write_all(content.as_bytes())
                .map_err(|error| format!("IO_FAILURE:write:{error}"))?;
            file.sync_all()
                .map_err(|error| format!("IO_FAILURE:sync:{error}"))?;
            drop(file);
            move_replace(&temporary, &target)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn replace(
        &self,
        source_path: &str,
        target_path: &str,
        lease: &ProjectWriterLease,
    ) -> Result<(), String> {
        if source_path == target_path {
            return Err("INVALID_PATH".into());
        }
        let inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        assert_active_lease(&inner, lease)?;
        let source = resolve_store_path(&self.root, source_path)?;
        let target = resolve_store_path(&self.root, target_path)?;
        fs::create_dir_all(target.parent().ok_or("INVALID_PATH")?)
            .map_err(|error| format!("IO_FAILURE:mkdir:{error}"))?;
        move_replace(&source, &target)
    }

    pub fn remove(&self, logical_path: &str, lease: &ProjectWriterLease) -> Result<(), String> {
        let inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        assert_active_lease(&inner, lease)?;
        let target = resolve_store_path(&self.root, logical_path)?;
        match fs::remove_file(target) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("IO_FAILURE:remove:{logical_path}:{error}")),
        }
    }

    pub fn reset(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        if self.root.exists() {
            fs::remove_dir_all(&self.root).map_err(|error| format!("IO_FAILURE:reset:{error}"))?;
        }
        fs::create_dir_all(&self.root).map_err(|error| format!("IO_FAILURE:reset:{error}"))?;
        inner.active_lease = None;
        Ok(())
    }

    pub fn acquire(&self, owner_id: &str, ttl_ms: u64) -> Result<Value, String> {
        assert_owner(owner_id)?;
        assert_ttl(ttl_ms)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        let now = now_ms()?;
        if let Some(active) = &inner.active_lease {
            if active.expires_at_ms > now && active.owner_id != owner_id {
                return Ok(json!({"status":"held","holderExpiresAtMs":active.expires_at_ms}));
            }
            if active.expires_at_ms > now && active.owner_id == owner_id {
                let renewed = ProjectWriterLease {
                    expires_at_ms: now + ttl_ms,
                    ..active.clone()
                };
                inner.active_lease = Some(renewed.clone());
                return Ok(json!({"status":"acquired","lease":renewed}));
            }
        }
        let lease = ProjectWriterLease {
            owner_id: owner_id.into(),
            fencing_token: inner.next_fencing_token,
            expires_at_ms: now + ttl_ms,
        };
        inner.next_fencing_token += 1;
        inner.active_lease = Some(lease.clone());
        Ok(json!({"status":"acquired","lease":lease}))
    }

    pub fn renew(&self, lease: &ProjectWriterLease, ttl_ms: u64) -> Result<Value, String> {
        assert_ttl(ttl_ms)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        let now = now_ms()?;
        let matches = inner
            .active_lease
            .as_ref()
            .is_some_and(|active| active.expires_at_ms > now && lease_matches(active, lease));
        if !matches {
            return Ok(json!({"status":"lost"}));
        }
        let renewed = ProjectWriterLease {
            expires_at_ms: now + ttl_ms,
            ..lease.clone()
        };
        inner.active_lease = Some(renewed.clone());
        Ok(json!({"status":"renewed","lease":renewed}))
    }

    pub fn release(&self, lease: &ProjectWriterLease) -> Result<bool, String> {
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        if !inner
            .active_lease
            .as_ref()
            .is_some_and(|active| lease_matches(active, lease))
        {
            return Ok(false);
        }
        inner.active_lease = None;
        Ok(true)
    }

    pub fn cleanup(&self) -> Result<(), String> {
        let _inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        if self.root.exists() {
            fs::remove_dir_all(&self.root)
                .map_err(|error| format!("IO_FAILURE:cleanup:{error}"))?;
        }
        Ok(())
    }
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|_| "CLOCK_FAILURE".into())
}

fn assert_owner(owner_id: &str) -> Result<(), String> {
    if owner_id.is_empty()
        || owner_id.len() > 128
        || !owner_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err("INVALID_OWNER".into());
    }
    Ok(())
}

fn assert_ttl(ttl_ms: u64) -> Result<(), String> {
    if !(1_000..=120_000).contains(&ttl_ms) {
        return Err("INVALID_TTL".into());
    }
    Ok(())
}

fn lease_matches(left: &ProjectWriterLease, right: &ProjectWriterLease) -> bool {
    left.owner_id == right.owner_id
        && left.fencing_token == right.fencing_token
        && left.expires_at_ms == right.expires_at_ms
}

fn assert_active_lease(inner: &StorageInner, lease: &ProjectWriterLease) -> Result<(), String> {
    let now = now_ms()?;
    if !inner
        .active_lease
        .as_ref()
        .is_some_and(|active| active.expires_at_ms > now && lease_matches(active, lease))
    {
        return Err("LEASE_LOST".into());
    }
    Ok(())
}

fn resolve_store_path(root: &Path, logical_path: &str) -> Result<PathBuf, String> {
    if logical_path.is_empty()
        || logical_path.starts_with('/')
        || logical_path.contains(['\\', '\0'])
    {
        return Err("INVALID_PATH".into());
    }
    let mut target = root.to_path_buf();
    for segment in logical_path.split('/') {
        let lower = segment.to_ascii_lowercase();
        let device_stem = lower.split('.').next().unwrap_or("");
        let device = matches!(device_stem, "con" | "prn" | "aux" | "nul")
            || (device_stem.len() == 4
                && (device_stem.starts_with("com") || device_stem.starts_with("lpt"))
                && matches!(device_stem.as_bytes()[3], b'1'..=b'9'));
        if segment.is_empty()
            || matches!(segment, "." | "..")
            || segment.ends_with('.')
            || device
            || !segment
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        {
            return Err("INVALID_PATH".into());
        }
        target.push(segment);
    }
    Ok(target)
}

fn wide_null(path: &Path) -> Vec<u16> {
    OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn move_replace(source: &Path, target: &Path) -> Result<(), String> {
    let source_wide = wide_null(source);
    let target_wide = wide_null(target);
    let result = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        return Err(format!(
            "IO_FAILURE:replace:{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_paths() {
        let root = PathBuf::from(r"C:\safe-root");
        for path in ["../escape", "/absolute", r"back\slash", "CON.txt", "a//b"] {
            assert!(resolve_store_path(&root, path).is_err(), "{path}");
        }
        assert!(resolve_store_path(&root, ".txn/tx/project.json").is_ok());
    }

    #[test]
    fn fences_a_released_writer() {
        let host = StorageHost::create().expect("create host");
        let first = host.acquire("owner_a", 60_000).expect("first lease");
        let first: ProjectWriterLease =
            serde_json::from_value(first["lease"].clone()).expect("lease");
        assert_eq!(
            host.acquire("owner_b", 60_000).expect("held")["status"],
            "held"
        );
        assert!(host.release(&first).expect("release"));
        let second = host.acquire("owner_b", 60_000).expect("second lease");
        let second: ProjectWriterLease =
            serde_json::from_value(second["lease"].clone()).expect("lease");
        assert!(second.fencing_token > first.fencing_token);
        assert_eq!(
            host.write("stale.txt", "stale", &first),
            Err("LEASE_LOST".into())
        );
        host.cleanup().expect("cleanup");
    }
}
