use std::path::PathBuf;
use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(std::env::var_os("CARGO_MANIFEST_DIR")?)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn watch_git_path(name: &str) {
    if let Some(path) = git(&["rev-parse", "--path-format=absolute", "--git-path", name]) {
        let mut path = PathBuf::from(path);
        // Watch the nearest existing parent if a loose ref has not been created yet.
        while !path.exists() && path.pop() {}
        println!("cargo:rerun-if-changed={}", path.display());
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=GITEYE_BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=GITEYE_BUILD_VERSION");
    if let Ok(version) = std::env::var("GITEYE_BUILD_VERSION") {
        assert_eq!(
            version,
            std::env::var("CARGO_PKG_VERSION").unwrap(),
            "CI build version does not match Cargo package version"
        );
    }
    watch_git_path("HEAD");
    watch_git_path("packed-refs");
    if let Some(reference) = git(&["symbolic-ref", "-q", "HEAD"]) {
        watch_git_path(&reference);
    }
    let checkout_commit = git(&["rev-parse", "--verify", "HEAD^{commit}"]);
    let commit = match std::env::var("GITEYE_BUILD_COMMIT") {
        Ok(commit) => {
            assert!(
                matches!(commit.len(), 40 | 64)
                    && commit.bytes().all(|byte| byte.is_ascii_hexdigit()),
                "CI build commit must be a full Git commit ID"
            );
            if let Some(checkout_commit) = checkout_commit {
                assert_eq!(
                    commit, checkout_commit,
                    "CI build commit does not match checked-out source"
                );
            }
            commit
        }
        Err(_) => checkout_commit.unwrap_or_default(),
    };
    println!("cargo:rustc-env=GITEYE_BUILD_COMMIT={commit}");
    tauri_build::build()
}
