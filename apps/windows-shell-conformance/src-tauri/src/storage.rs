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
    pub owner_id: String,
    pub fencing_token: u64,
    pub expires_at_ms: u64,
}

struct StorageInner {
    active_lease: Option<ProjectWriterLease>,
    next_fencing_token: u64,
    next_temp_id: u64,
}

pub struct StorageHost {
    root: PathBuf,
    owns_root: bool,
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
            owns_root: true,
            inner: Mutex::new(StorageInner {
                active_lease: None,
                next_fencing_token: 1,
                next_temp_id: 1,
            }),
        })
    }

    pub fn create_granted(root: PathBuf) -> Result<Self, String> {
        if !root.is_absolute() {
            return Err("GRANT_ROOT_NOT_ABSOLUTE".into());
        }
        if root.parent().is_none() {
            return Err("GRANT_VOLUME_ROOT_REJECTED".into());
        }
        let metadata = fs::metadata(&root).map_err(|error| match error.kind() {
            ErrorKind::NotFound => "GRANT_ROOT_NOT_FOUND".into(),
            _ => format!("GRANT_ROOT_IO_FAILURE:{error}"),
        })?;
        if !metadata.is_dir() {
            return Err("GRANT_ROOT_NOT_DIRECTORY".into());
        }
        let canonical =
            fs::canonicalize(&root).map_err(|error| format!("GRANT_ROOT_IO_FAILURE:{error}"))?;
        let normalized = normalize_windows_path(&root);
        if normalize_windows_path(&canonical) != normalized {
            return Err("GRANT_ROOT_REPARSE_REJECTED".into());
        }
        Ok(Self {
            root: canonical,
            owns_root: false,
            inner: Mutex::new(StorageInner {
                active_lease: None,
                next_fencing_token: 1,
                next_temp_id: 1,
            }),
        })
    }

    pub fn read(&self, logical_path: &str) -> Result<Option<String>, String> {
        assert_public_path(logical_path)?;
        let _inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        assert_no_reparse_point(&self.root, logical_path)?;
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
        assert_public_path(logical_path)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        self.refresh_lease_from_disk(&mut inner)?;
        assert_active_lease(&inner, lease)?;
        assert_no_reparse_point(&self.root, logical_path)?;
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
        assert_public_path(source_path)?;
        assert_public_path(target_path)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        self.refresh_lease_from_disk(&mut inner)?;
        assert_active_lease(&inner, lease)?;
        assert_no_reparse_point(&self.root, source_path)?;
        assert_no_reparse_point(&self.root, target_path)?;
        let source = resolve_store_path(&self.root, source_path)?;
        let target = resolve_store_path(&self.root, target_path)?;
        fs::create_dir_all(target.parent().ok_or("INVALID_PATH")?)
            .map_err(|error| format!("IO_FAILURE:mkdir:{error}"))?;
        move_replace(&source, &target)
    }

    pub fn remove(&self, logical_path: &str, lease: &ProjectWriterLease) -> Result<(), String> {
        assert_public_path(logical_path)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        self.refresh_lease_from_disk(&mut inner)?;
        assert_active_lease(&inner, lease)?;
        assert_no_reparse_point(&self.root, logical_path)?;
        let target = resolve_store_path(&self.root, logical_path)?;
        match fs::remove_file(target) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("IO_FAILURE:remove:{logical_path}:{error}")),
        }
    }

    pub fn reset(&self) -> Result<(), String> {
        if !self.owns_root {
            return Err("GRANT_RESET_REJECTED".into());
        }
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
        self.refresh_lease_from_disk(&mut inner)?;
        if let Some(active) = &inner.active_lease {
            if active.expires_at_ms > now && active.owner_id != owner_id {
                return Ok(json!({"status":"held","holderExpiresAtMs":active.expires_at_ms}));
            }
            if active.expires_at_ms > now && active.owner_id == owner_id {
                let renewed = ProjectWriterLease {
                    expires_at_ms: now + ttl_ms,
                    ..active.clone()
                };
                self.persist_lease(&renewed)?;
                inner.active_lease = Some(renewed.clone());
                return Ok(json!({"status":"acquired","lease":renewed}));
            }
        }
        let next_token = self.read_next_fencing_token(&inner)?;
        let lease = ProjectWriterLease {
            owner_id: owner_id.into(),
            fencing_token: next_token,
            expires_at_ms: now + ttl_ms,
        };
        inner.next_fencing_token = next_token + 1;
        self.persist_next_fencing_token(inner.next_fencing_token)?;
        self.persist_lease(&lease)?;
        inner.active_lease = Some(lease.clone());
        Ok(json!({"status":"acquired","lease":lease}))
    }

    pub fn renew(&self, lease: &ProjectWriterLease, ttl_ms: u64) -> Result<Value, String> {
        assert_ttl(ttl_ms)?;
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        let now = now_ms()?;
        self.refresh_lease_from_disk(&mut inner)?;
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
        self.persist_lease(&renewed)?;
        inner.active_lease = Some(renewed.clone());
        Ok(json!({"status":"renewed","lease":renewed}))
    }

    pub fn release(&self, lease: &ProjectWriterLease) -> Result<bool, String> {
        let mut inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        self.refresh_lease_from_disk(&mut inner)?;
        if !inner
            .active_lease
            .as_ref()
            .is_some_and(|active| lease_matches(active, lease))
        {
            return Ok(false);
        }
        inner.active_lease = None;
        match fs::remove_file(self.lease_path()) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(format!("LOCK_IO_FAILURE:release:{error}")),
        }
        Ok(true)
    }

    pub fn cleanup(&self) -> Result<(), String> {
        let _inner = self.inner.lock().map_err(|_| "LOCK_POISONED")?;
        if self.owns_root && self.root.exists() {
            fs::remove_dir_all(&self.root)
                .map_err(|error| format!("IO_FAILURE:cleanup:{error}"))?;
        }
        Ok(())
    }

    fn lock_directory(&self) -> PathBuf {
        self.root.join(".world-lock")
    }

    fn lease_path(&self) -> PathBuf {
        self.lock_directory().join("lease.json")
    }

    fn token_path(&self) -> PathBuf {
        self.lock_directory().join("next-token.txt")
    }

    fn refresh_lease_from_disk(&self, inner: &mut StorageInner) -> Result<(), String> {
        assert_no_reparse_point(&self.root, ".world-lock/lease.json")?;
        inner.active_lease = match fs::read_to_string(self.lease_path()) {
            Ok(encoded) => Some(serde_json::from_str(&encoded).map_err(|_| "LOCK_STATE_CORRUPT")?),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => return Err(format!("LOCK_IO_FAILURE:read-lease:{error}")),
        };
        Ok(())
    }

    fn read_next_fencing_token(&self, inner: &StorageInner) -> Result<u64, String> {
        assert_no_reparse_point(&self.root, ".world-lock/next-token.txt")?;
        match fs::read_to_string(self.token_path()) {
            Ok(encoded) => encoded.parse::<u64>().ok().filter(|token| *token > 0).ok_or_else(|| "LOCK_STATE_CORRUPT".into()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(inner.next_fencing_token),
            Err(error) => Err(format!("LOCK_IO_FAILURE:read-token:{error}")),
        }
    }

    fn persist_next_fencing_token(&self, token: u64) -> Result<(), String> {
        self.atomic_lock_write(&self.token_path(), token.to_string().as_bytes())
    }

    fn persist_lease(&self, lease: &ProjectWriterLease) -> Result<(), String> {
        let encoded = serde_json::to_vec(lease).map_err(|_| "LOCK_STATE_CORRUPT")?;
        self.atomic_lock_write(&self.lease_path(), &encoded)
    }

    fn atomic_lock_write(&self, target: &Path, content: &[u8]) -> Result<(), String> {
        let logical = if target == self.lease_path() { ".world-lock/lease.json" } else { ".world-lock/next-token.txt" };
        assert_no_reparse_point(&self.root, logical)?;
        fs::create_dir_all(self.lock_directory()).map_err(|error| format!("LOCK_IO_FAILURE:mkdir:{error}"))?;
        let temporary = target.with_extension(format!("{}-{}.tmp", std::process::id(), now_ms()?));
        let result = (|| {
            let mut file = OpenOptions::new().create_new(true).write(true).open(&temporary)
                .map_err(|error| format!("LOCK_IO_FAILURE:create:{error}"))?;
            file.write_all(content).map_err(|error| format!("LOCK_IO_FAILURE:write:{error}"))?;
            file.sync_all().map_err(|error| format!("LOCK_IO_FAILURE:sync:{error}"))?;
            drop(file);
            move_replace(&temporary, target)
        })();
        if result.is_err() { let _ = fs::remove_file(&temporary); }
        result
    }
}

fn normalize_windows_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('/', "\\");
    normalized
        .strip_prefix(r"\\?\")
        .unwrap_or(&normalized)
        .trim_end_matches(['\\', '/'])
        .to_ascii_lowercase()
}

fn assert_no_reparse_point(root: &Path, logical_path: &str) -> Result<(), String> {
    let target = resolve_store_path(root, logical_path)?;
    let relative = target.strip_prefix(root).map_err(|_| "INVALID_PATH")?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("REPARSE_POINT_REJECTED".into())
            }
            Ok(_) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => break,
            Err(error) => return Err(format!("IO_FAILURE:metadata:{error}")),
        }
    }
    Ok(())
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

fn assert_public_path(logical_path: &str) -> Result<(), String> {
    if logical_path == ".world-lock" || logical_path.starts_with(".world-lock/") {
        return Err("RESERVED_PATH".into());
    }
    Ok(())
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
    use std::os::windows::fs::symlink_dir;

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

    #[test]
    fn coordinates_two_granted_hosts_and_reserves_lock_state() {
        let root = std::env::temp_dir().join(format!("world-rust-cross-host-{}", now_ms().unwrap()));
        fs::create_dir_all(&root).unwrap();
        let first_host = StorageHost::create_granted(root.clone()).unwrap();
        let second_host = StorageHost::create_granted(root.clone()).unwrap();
        let first = first_host.acquire("owner-a", 60_000).unwrap();
        let first: ProjectWriterLease = serde_json::from_value(first["lease"].clone()).unwrap();
        assert_eq!(second_host.acquire("owner-b", 60_000).unwrap()["status"], "held");
        assert_eq!(first_host.read(".world-lock/lease.json"), Err("RESERVED_PATH".into()));
        assert!(first_host.release(&first).unwrap());
        let second = second_host.acquire("owner-b", 60_000).unwrap();
        let second: ProjectWriterLease = serde_json::from_value(second["lease"].clone()).unwrap();
        assert!(second.fencing_token > first.fencing_token);
        assert_eq!(first_host.write("stale.txt", "stale", &first), Err("LEASE_LOST".into()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn granted_root_is_retained_and_cannot_be_reset() {
        assert_eq!(
            StorageHost::create_granted(PathBuf::from(r"C:\")).err(),
            Some("GRANT_VOLUME_ROOT_REJECTED".into())
        );
        let root = std::env::temp_dir().join(format!("world-rust-grant-{}", now_ms().unwrap()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("project.json"), "granted").unwrap();
        let host = StorageHost::create_granted(root.clone()).expect("grant");
        assert_eq!(
            host.read("project.json").unwrap().as_deref(),
            Some("granted")
        );
        assert_eq!(host.reset(), Err("GRANT_RESET_REJECTED".into()));
        host.cleanup().unwrap();
        assert!(root.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_reparse_root_and_child() {
        let stamp = now_ms().unwrap();
        let root = std::env::temp_dir().join(format!("world-rust-grant-root-{stamp}"));
        let outside = std::env::temp_dir().join(format!("world-rust-grant-outside-{stamp}"));
        let alias = std::env::temp_dir().join(format!("world-rust-grant-alias-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "outside").unwrap();
        if let Err(error) = symlink_dir(&root, &alias) {
            if error.raw_os_error() == Some(1314) {
                let _ = fs::remove_dir_all(root);
                let _ = fs::remove_dir_all(outside);
                return;
            }
            panic!("create root symlink: {error}");
        }
        assert_eq!(
            StorageHost::create_granted(alias.clone()).err(),
            Some("GRANT_ROOT_REPARSE_REJECTED".into())
        );
        symlink_dir(&outside, root.join("linked")).expect("create child symlink");
        let host = StorageHost::create_granted(root.clone()).expect("grant root");
        assert_eq!(
            host.read("linked/secret.txt"),
            Err("REPARSE_POINT_REJECTED".into())
        );
        let _ = fs::remove_dir_all(alias);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
