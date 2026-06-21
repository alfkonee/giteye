use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::diagnostics::{
    BisectActionSummary, BisectLogEntry, BisectRevision, BisectState, BisectTerms,
    GitCommandSafety, GitFsckIssue, GitFsckSeverity, GitFsckSummary, GitMaintenanceSummary,
    GitSignatureStatus, GitSignatureSummary,
};
use std::fs;
use std::path::{Component, Path, PathBuf};

const DEFAULT_BISECT_BAD_TERM: &str = "bad";
const DEFAULT_BISECT_GOOD_TERM: &str = "good";

pub fn get_bisect_state(repo_path: &Path) -> Result<BisectState, AppError> {
    let terms = read_bisect_terms(repo_path)?;
    let safety = bisect_safety();
    let log_path = git_path(repo_path, "BISECT_LOG")?;
    if !log_path.is_file() {
        return Ok(BisectState {
            in_progress: false,
            terms,
            start_revision: None,
            current_commit: None,
            paths: Vec::new(),
            known_good: Vec::new(),
            known_bad: Vec::new(),
            skipped: Vec::new(),
            log: Vec::new(),
            safety,
        });
    }

    let start_revision = read_optional_file(&git_path(repo_path, "BISECT_START")?)?;
    let paths = read_optional_file(&git_path(repo_path, "BISECT_NAMES")?)?
        .map(|content| parse_bisect_paths(&content))
        .unwrap_or_default();
    let log = read_optional_file(&log_path)?
        .map(|content| parse_bisect_log(&content))
        .unwrap_or_default();
    let refs = read_bisect_refs(repo_path)?;

    Ok(BisectState {
        in_progress: true,
        terms,
        start_revision,
        current_commit: current_bisect_commit(repo_path)?,
        paths,
        known_good: refs
            .iter()
            .filter(|revision| revision.role == "good")
            .cloned()
            .collect(),
        known_bad: refs
            .iter()
            .filter(|revision| revision.role == "bad")
            .cloned()
            .collect(),
        skipped: refs
            .into_iter()
            .filter(|revision| revision.role == "skipped")
            .collect(),
        log,
        safety,
    })
}

pub fn bisect_start(
    repo_path: &Path,
    bad_revision: Option<&str>,
    good_revisions: Option<Vec<String>>,
    paths: Option<Vec<String>>,
) -> Result<BisectActionSummary, AppError> {
    let mut args = vec!["bisect".to_string(), "start".to_string()];

    if let Some(revision) = bad_revision
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        validate_revision_arg(revision)?;
        args.push(revision.to_string());
    }

    if let Some(revisions) = good_revisions {
        for revision in revisions {
            let revision = revision.trim();
            if revision.is_empty() {
                continue;
            }
            validate_revision_arg(revision)?;
            args.push(revision.to_string());
        }
    }

    if let Some(paths) = paths {
        let mut safe_paths = Vec::new();
        for path in paths {
            let path = path.trim();
            if path.is_empty() {
                continue;
            }
            validate_repo_relative_path(path)?;
            safe_paths.push(path.to_string());
        }
        if !safe_paths.is_empty() {
            args.push("--".to_string());
            args.extend(safe_paths);
        }
    }

    run_bisect_action(repo_path, args)
}

pub fn bisect_good(
    repo_path: &Path,
    revision: Option<&str>,
) -> Result<BisectActionSummary, AppError> {
    run_bisect_revision_action(repo_path, "good", revision)
}

pub fn bisect_bad(
    repo_path: &Path,
    revision: Option<&str>,
) -> Result<BisectActionSummary, AppError> {
    run_bisect_revision_action(repo_path, "bad", revision)
}

pub fn bisect_skip(
    repo_path: &Path,
    revision: Option<&str>,
) -> Result<BisectActionSummary, AppError> {
    run_bisect_revision_action(repo_path, "skip", revision)
}

pub fn bisect_reset(
    repo_path: &Path,
    revision: Option<&str>,
) -> Result<BisectActionSummary, AppError> {
    let mut args = vec!["bisect".to_string(), "reset".to_string()];
    if let Some(revision) = revision.map(str::trim).filter(|value| !value.is_empty()) {
        validate_revision_arg(revision)?;
        args.push(revision.to_string());
    }
    run_bisect_action(repo_path, args)
}

pub fn run_git_fsck(
    repo_path: &Path,
    full: bool,
    strict: bool,
) -> Result<GitFsckSummary, AppError> {
    let mut args = vec!["fsck".to_string(), "--no-progress".to_string()];
    if full {
        args.push("--full".to_string());
    }
    if strict {
        args.push("--strict".to_string());
    }

    let argv = as_argv(&args);
    let output = GitCli::run_with_status(repo_path, &argv)?;
    let raw_output = join_output(&output.stdout, &output.stderr);
    let issues = parse_fsck_issues(&raw_output);
    let has_error = issues
        .iter()
        .any(|issue| issue.severity == GitFsckSeverity::Error);

    Ok(GitFsckSummary {
        ok: output.status_code == 0 && !has_error,
        exit_code: output.status_code,
        command: args,
        issue_count: issues.len(),
        issues,
        raw_output,
        safety: fsck_safety(),
    })
}

pub fn run_git_maintenance(
    repo_path: &Path,
    mode: Option<&str>,
) -> Result<GitMaintenanceSummary, AppError> {
    let mode = mode.unwrap_or("maintenance").trim();
    let mode = if mode.is_empty() { "maintenance" } else { mode };
    let args = maintenance_args(mode)?;
    let argv = as_argv(&args);
    let output = GitCli::run_with_status(repo_path, &argv)?;

    Ok(GitMaintenanceSummary {
        mode: mode.to_string(),
        exit_code: output.status_code,
        command: args,
        output: join_output(&output.stdout, &output.stderr),
        safety: maintenance_safety(mode),
    })
}

pub fn verify_git_signature(
    repo_path: &Path,
    target: &str,
) -> Result<GitSignatureSummary, AppError> {
    let target = target.trim();
    validate_revision_arg(target)?;
    let object_type = GitCli::run(repo_path, &["cat-file", "-t", target])?
        .trim()
        .to_string();

    let command = match object_type.as_str() {
        "commit" => vec![
            "verify-commit".to_string(),
            "--raw".to_string(),
            target.to_string(),
        ],
        "tag" => vec![
            "verify-tag".to_string(),
            "--raw".to_string(),
            target.to_string(),
        ],
        _ => {
            return Ok(GitSignatureSummary {
                target: target.to_string(),
                object_type,
                status: GitSignatureStatus::Unsupported,
                signer: None,
                key_id: None,
                fingerprint: None,
                trust: None,
                exit_code: 0,
                command: Vec::new(),
                output: String::new(),
                raw_status: Vec::new(),
                safety: verify_safety(),
            });
        }
    };

    let argv = as_argv(&command);
    let output = GitCli::run_with_status(repo_path, &argv)?;
    let raw_output = join_output(&output.stdout, &output.stderr);
    let signature = parse_signature_output(output.status_code, &raw_output);

    Ok(GitSignatureSummary {
        target: target.to_string(),
        object_type,
        status: signature.status,
        signer: signature.signer,
        key_id: signature.key_id,
        fingerprint: signature.fingerprint,
        trust: signature.trust,
        exit_code: output.status_code,
        command,
        output: raw_output,
        raw_status: signature.raw_status,
        safety: verify_safety(),
    })
}

fn run_bisect_revision_action(
    repo_path: &Path,
    action: &str,
    revision: Option<&str>,
) -> Result<BisectActionSummary, AppError> {
    let mut args = vec!["bisect".to_string(), action.to_string()];
    if let Some(revision) = revision.map(str::trim).filter(|value| !value.is_empty()) {
        validate_revision_arg(revision)?;
        args.push(revision.to_string());
    }
    run_bisect_action(repo_path, args)
}

fn run_bisect_action(repo_path: &Path, args: Vec<String>) -> Result<BisectActionSummary, AppError> {
    let argv = as_argv(&args);
    let output = GitCli::run(repo_path, &argv)?;
    Ok(BisectActionSummary {
        command: args,
        output,
        state: get_bisect_state(repo_path)?,
        safety: bisect_safety(),
    })
}

fn git_path(repo_path: &Path, name: &str) -> Result<PathBuf, AppError> {
    let output = GitCli::run(repo_path, &["rev-parse", "--git-path", name])?;
    Ok(path_from_git_output(repo_path, output.trim()))
}

fn path_from_git_output(repo_path: &Path, path_text: &str) -> PathBuf {
    let path = Path::new(path_text);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        repo_path.join(path)
    }
}

fn read_optional_file(path: &Path) -> Result<Option<String>, AppError> {
    match fs::read_to_string(path) {
        Ok(value) => {
            let trimmed = value
                .trim_end_matches(|c| c == '\r' || c == '\n')
                .to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::IoError(e.to_string())),
    }
}

fn read_bisect_terms(repo_path: &Path) -> Result<BisectTerms, AppError> {
    let Some(content) = read_optional_file(&git_path(repo_path, "BISECT_TERMS")?)? else {
        return Ok(BisectTerms {
            bad: DEFAULT_BISECT_BAD_TERM.to_string(),
            good: DEFAULT_BISECT_GOOD_TERM.to_string(),
        });
    };
    Ok(parse_bisect_terms(&content))
}

fn parse_bisect_terms(content: &str) -> BisectTerms {
    let mut terms = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    BisectTerms {
        bad: terms.next().unwrap_or(DEFAULT_BISECT_BAD_TERM).to_string(),
        good: terms.next().unwrap_or(DEFAULT_BISECT_GOOD_TERM).to_string(),
    }
}

fn parse_bisect_paths(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn current_bisect_commit(repo_path: &Path) -> Result<Option<BisectRevision>, AppError> {
    let output = GitCli::run(
        repo_path,
        &["show", "-s", "--format=%H%x00%h%x00%s", "HEAD"],
    )?;
    let parts: Vec<&str> = output.trim_end().split('\0').collect();
    if parts.len() < 3 {
        return Ok(None);
    }

    Ok(Some(BisectRevision {
        role: "current".to_string(),
        name: parts[1].to_string(),
        commit: parts[0].to_string(),
        summary: parts[2].to_string(),
    }))
}

fn read_bisect_refs(repo_path: &Path) -> Result<Vec<BisectRevision>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)%00%(subject)",
            "refs/bisect",
        ],
    )?;
    Ok(parse_bisect_refs(&output))
}

fn parse_bisect_refs(output: &str) -> Vec<BisectRevision> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\0').collect();
            if parts.len() != 3 {
                return None;
            }
            let role = bisect_ref_role(parts[0])?;
            Some(BisectRevision {
                role: role.to_string(),
                name: parts[0].trim_start_matches("refs/").to_string(),
                commit: parts[1].to_string(),
                summary: parts[2].to_string(),
            })
        })
        .collect()
}

fn bisect_ref_role(ref_name: &str) -> Option<&'static str> {
    let leaf = ref_name.rsplit('/').next().unwrap_or(ref_name);
    if leaf == "bad" || leaf.starts_with("bad-") {
        Some("bad")
    } else if leaf == "good" || leaf.starts_with("good-") {
        Some("good")
    } else if leaf == "skip" || leaf.starts_with("skip-") {
        Some("skipped")
    } else {
        None
    }
}

fn parse_bisect_log(content: &str) -> Vec<BisectLogEntry> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if !trimmed.starts_with("git bisect ") {
                return None;
            }
            let mut parts = trimmed.split_whitespace();
            let _git = parts.next();
            let _bisect = parts.next();
            let command = parts.next()?.to_string();
            let revision = parts.next().map(ToString::to_string);
            Some(BisectLogEntry {
                command,
                revision,
                raw: trimmed.to_string(),
            })
        })
        .collect()
}

fn parse_fsck_issues(output: &str) -> Vec<GitFsckIssue> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(parse_fsck_issue)
        .collect()
}

fn parse_fsck_issue(line: &str) -> GitFsckIssue {
    let severity = if line.starts_with("error")
        || line.starts_with("fatal")
        || line.starts_with("missing")
        || line.starts_with("broken")
    {
        GitFsckSeverity::Error
    } else if line.starts_with("warning") || line.starts_with("dangling") {
        GitFsckSeverity::Warning
    } else {
        GitFsckSeverity::Info
    };

    let (object_type, object_id) = extract_object_identity(line);
    GitFsckIssue {
        severity,
        object_type,
        object_id,
        message: line.to_string(),
    }
}

fn extract_object_identity(line: &str) -> (Option<String>, Option<String>) {
    let tokens: Vec<&str> = line
        .split(|c: char| c.is_whitespace() || c == ':' || c == ',')
        .filter(|token| !token.is_empty())
        .collect();

    for window in tokens.windows(2) {
        if is_git_object_type(window[0]) && is_object_id(window[1]) {
            return (Some(window[0].to_string()), Some(window[1].to_string()));
        }
    }

    if let Some(object_id) = tokens.iter().copied().find(|token| is_object_id(token)) {
        return (None, Some(object_id.to_string()));
    }

    (None, None)
}

fn is_git_object_type(value: &str) -> bool {
    matches!(value, "commit" | "tree" | "blob" | "tag")
}

fn is_object_id(value: &str) -> bool {
    value.len() >= 7 && value.len() <= 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

struct ParsedSignature {
    status: GitSignatureStatus,
    signer: Option<String>,
    key_id: Option<String>,
    fingerprint: Option<String>,
    trust: Option<String>,
    raw_status: Vec<String>,
}

fn parse_signature_output(exit_code: i32, output: &str) -> ParsedSignature {
    let mut parsed = ParsedSignature {
        status: if exit_code == 0 {
            GitSignatureStatus::Valid
        } else {
            GitSignatureStatus::Unknown
        },
        signer: None,
        key_id: None,
        fingerprint: None,
        trust: None,
        raw_status: Vec::new(),
    };
    let mut saw_signature = false;

    for line in output.lines() {
        let Some(status_text) = line.trim().strip_prefix("[GNUPG:] ") else {
            continue;
        };
        parsed.raw_status.push(line.trim().to_string());
        let mut tokens = status_text.split_whitespace();
        let Some(kind) = tokens.next() else {
            continue;
        };

        match kind {
            "GOODSIG" => {
                saw_signature = true;
                parsed.status = GitSignatureStatus::Valid;
                parsed.key_id = tokens.next().map(ToString::to_string);
                let signer = tokens.collect::<Vec<_>>().join(" ");
                if !signer.is_empty() {
                    parsed.signer = Some(signer);
                }
            }
            "VALIDSIG" => {
                saw_signature = true;
                parsed.fingerprint = tokens.next().map(ToString::to_string);
            }
            "BADSIG" | "EXPSIG" | "EXPKEYSIG" | "REVKEYSIG" => {
                saw_signature = true;
                parsed.status = GitSignatureStatus::Invalid;
                parsed.key_id = tokens.next().map(ToString::to_string);
                let signer = tokens.collect::<Vec<_>>().join(" ");
                if !signer.is_empty() {
                    parsed.signer = Some(signer);
                }
            }
            "ERRSIG" | "NO_PUBKEY" => {
                saw_signature = true;
                if parsed.status != GitSignatureStatus::Invalid {
                    parsed.status = GitSignatureStatus::Unknown;
                }
                parsed.key_id = tokens.next().map(ToString::to_string);
            }
            "TRUST_UNDEFINED" | "TRUST_NEVER" | "TRUST_MARGINAL" | "TRUST_FULLY"
            | "TRUST_ULTIMATE" => {
                parsed.trust = Some(kind.trim_start_matches("TRUST_").to_ascii_lowercase());
            }
            _ => {}
        }
    }

    let lower = output.to_ascii_lowercase();
    if !saw_signature && (lower.contains("no signature") || lower.contains("without a signature")) {
        parsed.status = GitSignatureStatus::Unsigned;
    } else if !saw_signature && exit_code != 0 {
        parsed.status = GitSignatureStatus::Unknown;
    }

    parsed
}

fn maintenance_args(mode: &str) -> Result<Vec<String>, AppError> {
    match mode {
        "gc" => Ok(vec!["gc".to_string()]),
        "aggressiveGc" | "aggressive-gc" => Ok(vec!["gc".to_string(), "--aggressive".to_string()]),
        "maintenance" => Ok(vec!["maintenance".to_string(), "run".to_string()]),
        "maintenanceAuto" | "auto" => Ok(vec![
            "maintenance".to_string(),
            "run".to_string(),
            "--auto".to_string(),
        ]),
        _ => Err(AppError::GitError(format!(
            "Unsupported maintenance mode: {mode}. Expected gc, aggressiveGc, maintenance, or maintenanceAuto"
        ))),
    }
}

fn validate_revision_arg(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.starts_with('-')
        || value.contains('\0')
        || value.contains(|c: char| c.is_control())
    {
        return Err(AppError::GitError(format!(
            "Invalid revision argument: {value}"
        )));
    }
    Ok(())
}

fn validate_repo_relative_path(file_path: &str) -> Result<(), AppError> {
    let path = Path::new(file_path);
    if file_path.is_empty()
        || file_path.contains('\0')
        || file_path.contains(|c: char| c.is_control())
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::InvalidPath(file_path.to_string()));
    }

    Ok(())
}

fn as_argv(args: &[String]) -> Vec<&str> {
    args.iter().map(String::as_str).collect()
}

fn join_output(stdout: &str, stderr: &str) -> String {
    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.trim_end().to_string(),
        (true, false) => stderr.trim_end().to_string(),
        (false, false) => format!("{}\n{}", stdout.trim_end(), stderr.trim_end()),
    }
}

fn bisect_safety() -> GitCommandSafety {
    GitCommandSafety {
        requires_explicit_action: true,
        changes_worktree: true,
        rewrites_history: false,
        long_running: false,
        description: "Bisect commands checkout commits and can move HEAD until reset.".to_string(),
    }
}

fn fsck_safety() -> GitCommandSafety {
    GitCommandSafety {
        requires_explicit_action: true,
        changes_worktree: false,
        rewrites_history: false,
        long_running: true,
        description: "fsck is read-only but can be expensive on large repositories.".to_string(),
    }
}

fn maintenance_safety(mode: &str) -> GitCommandSafety {
    GitCommandSafety {
        requires_explicit_action: true,
        changes_worktree: false,
        rewrites_history: false,
        long_running: true,
        description: format!(
            "{mode} may repack or prune repository internals; run only when the user explicitly requests maintenance."
        ),
    }
}

fn verify_safety() -> GitCommandSafety {
    GitCommandSafety {
        requires_explicit_action: false,
        changes_worktree: false,
        rewrites_history: false,
        long_running: false,
        description: "Signature verification is read-only.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        get_bisect_state, maintenance_args, parse_bisect_log, parse_bisect_refs,
        parse_bisect_terms, parse_fsck_issues, parse_signature_output, run_git_fsck,
        validate_repo_relative_path, validate_revision_arg, verify_git_signature,
    };
    use crate::models::diagnostics::{GitFsckSeverity, GitSignatureStatus};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_bisect_terms_and_refs() {
        let terms = parse_bisect_terms("broken\nfixed\n");
        assert_eq!(terms.bad, "broken");
        assert_eq!(terms.good, "fixed");

        let refs = parse_bisect_refs(
            "refs/bisect/bad\0aaaa1111\0bad commit\nrefs/bisect/good-bbbb2222\0bbbb2222\0good commit\nrefs/bisect/skip-cccc3333\0cccc3333\0skipped commit\n",
        );
        assert_eq!(refs.len(), 3);
        assert_eq!(refs[0].role, "bad");
        assert_eq!(refs[1].role, "good");
        assert_eq!(refs[2].role, "skipped");
    }

    #[test]
    fn parses_bisect_log_commands() {
        let entries = parse_bisect_log(
            "# bad: [aaaa] broken\ngit bisect start 'main' 'v1' -- src\ngit bisect bad aaaa\ngit bisect good bbbb\n",
        );
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].command, "start");
        assert_eq!(entries[1].revision.as_deref(), Some("aaaa"));
    }

    #[test]
    fn parses_fsck_issue_severity_and_object() {
        let issues = parse_fsck_issues(
            "dangling commit 0123456789abcdef\nerror in tree abcdef0: broken links\nnotice: HEAD points to an unborn branch\n",
        );
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].severity, GitFsckSeverity::Warning);
        assert_eq!(issues[0].object_type.as_deref(), Some("commit"));
        assert_eq!(issues[1].severity, GitFsckSeverity::Error);
        assert_eq!(issues[1].object_type.as_deref(), Some("tree"));
        assert_eq!(issues[2].severity, GitFsckSeverity::Info);
    }

    #[test]
    fn parses_signature_status_lines() {
        let valid = parse_signature_output(
            0,
            "[GNUPG:] GOODSIG ABCDEF123456 GitEye Test <test@example.com>\n[GNUPG:] VALIDSIG 0123456789ABCDEF\n[GNUPG:] TRUST_FULLY 0 pgp\n",
        );
        assert_eq!(valid.status, GitSignatureStatus::Valid);
        assert_eq!(valid.key_id.as_deref(), Some("ABCDEF123456"));
        assert_eq!(valid.fingerprint.as_deref(), Some("0123456789ABCDEF"));
        assert_eq!(valid.trust.as_deref(), Some("fully"));

        let unsigned = parse_signature_output(1, "error: no signature found\n");
        assert_eq!(unsigned.status, GitSignatureStatus::Unsigned);
    }

    #[test]
    fn validates_argv_inputs() {
        assert!(validate_revision_arg("HEAD~1").is_ok());
        assert!(validate_revision_arg("--upload-pack=/tmp/x").is_err());
        assert!(validate_revision_arg("bad\nref").is_err());
        assert!(validate_repo_relative_path("src/lib.rs").is_ok());
        assert!(validate_repo_relative_path("../outside").is_err());
        assert!(validate_repo_relative_path("/absolute").is_err());
    }

    #[test]
    fn maps_maintenance_modes_to_argv() {
        assert_eq!(maintenance_args("gc").unwrap(), vec!["gc"]);
        assert_eq!(
            maintenance_args("aggressiveGc").unwrap(),
            vec!["gc", "--aggressive"]
        );
        assert!(maintenance_args("unknown").is_err());
    }

    #[test]
    fn reads_active_bisect_state_from_git_metadata() {
        let temp = TestDir::new("bisect-state");
        init_repo(&temp.path);
        commit_file(&temp.path, "file.txt", "one\n", "one");
        commit_file(&temp.path, "file.txt", "two\n", "two");
        commit_file(&temp.path, "file.txt", "three\n", "three");

        git(&temp.path, &["bisect", "start", "HEAD", "HEAD~2"]);

        let state = get_bisect_state(&temp.path).expect("bisect state");
        assert!(state.in_progress);
        assert_eq!(state.terms.bad, "bad");
        assert_eq!(state.terms.good, "good");
        assert!(!state.known_bad.is_empty());
        assert!(!state.known_good.is_empty());
        assert!(state.current_commit.is_some());
        assert!(state.safety.changes_worktree);

        git(&temp.path, &["bisect", "reset"]);
    }

    #[test]
    fn fsck_clean_repository_returns_ok_summary() {
        let temp = TestDir::new("fsck-clean");
        init_repo(&temp.path);
        commit_file(&temp.path, "file.txt", "content\n", "initial");

        let summary = run_git_fsck(&temp.path, false, false).expect("fsck summary");
        assert!(summary.ok, "unexpected fsck output: {}", summary.raw_output);
        assert_eq!(summary.exit_code, 0);
        assert_eq!(summary.command, vec!["fsck", "--no-progress"]);
        assert!(summary.safety.long_running);
    }

    #[test]
    fn unsigned_commit_signature_returns_typed_summary() {
        let temp = TestDir::new("unsigned-signature");
        init_repo(&temp.path);
        commit_file(&temp.path, "file.txt", "content\n", "initial");

        let summary = verify_git_signature(&temp.path, "HEAD").expect("signature summary");
        assert_eq!(summary.object_type, "commit");
        assert!(matches!(
            summary.status,
            GitSignatureStatus::Unsigned | GitSignatureStatus::Unknown
        ));
        assert_eq!(summary.command, vec!["verify-commit", "--raw", "HEAD"]);
        assert!(!summary.safety.changes_worktree);
    }

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-diagnostics-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    fn commit_file(path: &Path, file_name: &str, content: &str, message: &str) {
        fs::write(path.join(file_name), content).expect("write fixture");
        git(path, &["add", file_name]);
        git(path, &["commit", "-m", message]);
    }

    fn git(cwd: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
