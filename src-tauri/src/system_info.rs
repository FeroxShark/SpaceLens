// Detect the running distribution and which package managers are installed,
// so the UI can show distro-appropriate guidance instead of assuming Arch.

use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfoDto {
    /// os-release ID, e.g. "arch", "cachyos", "debian", "fedora".
    pub distro_id: String,
    /// Human-readable name, e.g. "CachyOS Linux".
    pub distro_name: String,
    /// os-release ID_LIKE, e.g. "arch" for CachyOS, "debian" for Ubuntu.
    pub id_like: String,
    /// Package managers found on PATH, e.g. ["pacman", "flatpak"].
    pub package_managers: Vec<String>,
    pub home: String,
}

/// Parse a value out of /etc/os-release. Values may be quoted.
fn os_release_field(contents: &str, key: &str) -> Option<String> {
    for line in contents.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix(key).and_then(|r| r.strip_prefix('=')) {
            let v = rest.trim().trim_matches('"').trim_matches('\'');
            return Some(v.to_string());
        }
    }
    None
}

/// True if `name` is an executable found in any PATH directory.
fn on_path(name: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|dir| dir.join(name).is_file())
}

pub fn system_info() -> SystemInfoDto {
    let contents = std::fs::read_to_string("/etc/os-release").unwrap_or_default();

    let distro_id = os_release_field(&contents, "ID").unwrap_or_else(|| "linux".to_string());
    let distro_name = os_release_field(&contents, "PRETTY_NAME")
        .or_else(|| os_release_field(&contents, "NAME"))
        .unwrap_or_else(|| "Linux".to_string());
    let id_like = os_release_field(&contents, "ID_LIKE").unwrap_or_default();

    let mut package_managers = Vec::new();
    for pm in ["pacman", "apt", "dnf", "zypper", "flatpak", "snap"] {
        if on_path(pm) {
            package_managers.push(pm.to_string());
        }
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());

    SystemInfoDto {
        distro_id,
        distro_name,
        id_like,
        package_managers,
        home,
    }
}

#[cfg(test)]
mod tests {
    use super::os_release_field;

    const SAMPLE: &str = r#"
NAME="CachyOS Linux"
PRETTY_NAME="CachyOS"
ID=cachyos
ID_LIKE=arch
BUILD_ID=rolling
"#;

    #[test]
    fn parses_quoted_and_unquoted_fields() {
        assert_eq!(os_release_field(SAMPLE, "ID").as_deref(), Some("cachyos"));
        assert_eq!(os_release_field(SAMPLE, "ID_LIKE").as_deref(), Some("arch"));
        assert_eq!(os_release_field(SAMPLE, "PRETTY_NAME").as_deref(), Some("CachyOS"));
        assert_eq!(os_release_field(SAMPLE, "NAME").as_deref(), Some("CachyOS Linux"));
    }

    #[test]
    fn missing_field_is_none() {
        assert_eq!(os_release_field(SAMPLE, "VERSION_ID"), None);
    }

    #[test]
    fn does_not_match_prefix_collisions() {
        // "ID=cachyos" must not be returned when asking for "VERSION_ID".
        assert_eq!(os_release_field("VERSION_ID=42\nID=arch\n", "ID").as_deref(), Some("arch"));
    }
}
