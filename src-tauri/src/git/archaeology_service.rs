use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::{
    BlameLine, CommitSearchResult, FileChange, FileHistoryEntry, GitGrepMatch, LostCommit,
    PickaxeSearchResult, ReflogEntry,
};
use std::collections::HashSet;
use std::path::Path;

const DEFAULT_COMMIT_LIMIT: u32 = 50;
const MAX_COMMIT_LIMIT: u32 = 200;
const DEFAULT_GREP_LIMIT: u32 = 100;
const MAX_GREP_LIMIT: u32 = 500;
const DEFAULT_BLAME_LIMIT: u32 = 500;
const MAX_BLAME_LIMIT: u32 = 2_000;

pub fn commit_search(
    repo_path: &Path,
    query: &str,
    limit: Option<u32>,
) -> Result<Vec<CommitSearchResult>, AppError> {
    let query = required_text(query, "search query")?;
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit = bounded_limit(limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT);
    let limit_arg = limit.to_string();
    let mut results = Vec::new();
    let mut seen = HashSet::new();

    let grep_arg = format!("--grep={query}");
    let grep_output = GitCli::run(
        repo_path,
        &[
            "log",
            "--all",
            "--date-order",
            "--regexp-ignore-case",
            "--fixed-strings",
            "--max-count",
            &limit_arg,
            &grep_arg,
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
        ],
    )?;
    append_commit_search_results(&mut results, &mut seen, &grep_output, limit);

    if results.len() < limit as usize {
        let author_arg = format!("--author={}", escape_extended_regex(query));
        let author_output = GitCli::run(
            repo_path,
            &[
                "log",
                "--all",
                "--date-order",
                "--regexp-ignore-case",
                "--max-count",
                &limit_arg,
                &author_arg,
                "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
            ],
        )?;
        append_commit_search_results(&mut results, &mut seen, &author_output, limit);
    }

    if results.len() < limit as usize && is_hex_query(query) {
        let hashes = GitCli::run(repo_path, &["rev-list", "--all"])?;
        let needle = query.to_lowercase();
        for hash in hashes
            .lines()
            .filter(|hash| hash.to_lowercase().contains(&needle))
        {
            if results.len() >= limit as usize {
                break;
            }
            if seen.contains(hash) {
                continue;
            }
            if let Some(result) = get_commit_search_result(repo_path, hash)? {
                seen.insert(result.hash.clone());
                results.push(result);
            }
        }
    }

    Ok(results)
}

pub fn file_history(
    repo_path: &Path,
    file_path: &str,
    limit: Option<u32>,
) -> Result<Vec<FileHistoryEntry>, AppError> {
    let file_path = required_text(file_path, "file path")?;
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit = bounded_limit(limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT).to_string();
    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--follow",
            "--date-order",
            "--max-count",
            &limit,
            "--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI",
            "--name-status",
            "--",
            file_path,
        ],
    )?;

    Ok(parse_file_history_entries(&output))
}

pub fn blame_file(
    repo_path: &Path,
    file_path: &str,
    revision: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<BlameLine>, AppError> {
    let file_path = required_text(file_path, "file path")?;
    let limit = bounded_limit(limit, DEFAULT_BLAME_LIMIT, MAX_BLAME_LIMIT);
    let line_range = format!("1,+{limit}");

    let mut args = vec![
        "blame".to_string(),
        "--line-porcelain".to_string(),
        "-L".to_string(),
        line_range,
    ];
    if let Some(revision) = revision
        .map(str::trim)
        .filter(|revision| !revision.is_empty())
    {
        if revision.starts_with('-') {
            return Err(AppError::GitError(
                "revision must not start with '-'".to_string(),
            ));
        }
        args.push(revision.to_string());
    }
    args.push("--".to_string());
    args.push(file_path.to_string());

    let output = run_git_owned(repo_path, args)?;
    Ok(parse_blame_lines(&output, limit))
}

pub fn git_grep(
    repo_path: &Path,
    query: &str,
    pathspec: Option<&str>,
    case_sensitive: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<GitGrepMatch>, AppError> {
    let query = required_text(query, "grep query")?;
    let limit = bounded_limit(limit, DEFAULT_GREP_LIMIT, MAX_GREP_LIMIT);

    let mut args = vec![
        "grep".to_string(),
        "-n".to_string(),
        "-z".to_string(),
        "-I".to_string(),
        "--no-color".to_string(),
        "--fixed-strings".to_string(),
    ];
    if !case_sensitive.unwrap_or(false) {
        args.push("-i".to_string());
    }
    args.push("-e".to_string());
    args.push(query.to_string());
    args.push("--".to_string());
    if let Some(pathspec) = pathspec
        .map(str::trim)
        .filter(|pathspec| !pathspec.is_empty())
    {
        args.push(pathspec.to_string());
    }

    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let (status, output) = GitCli::run_allowing_statuses(repo_path, &refs, &[1])?;
    if status == 1 {
        return Ok(Vec::new());
    }

    Ok(parse_git_grep_matches(&output, limit))
}

pub fn pickaxe_search(
    repo_path: &Path,
    query: &str,
    regex: Option<bool>,
    limit: Option<u32>,
) -> Result<Vec<PickaxeSearchResult>, AppError> {
    let query = required_text(query, "pickaxe query")?;
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit = bounded_limit(limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT).to_string();
    let pickaxe_arg = if regex.unwrap_or(false) {
        format!("-G{query}")
    } else {
        format!("-S{query}")
    };
    let output = GitCli::run(
        repo_path,
        &[
            "log",
            "--all",
            "--date-order",
            "--max-count",
            &limit,
            &pickaxe_arg,
            "--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI",
            "--name-status",
        ],
    )?;

    Ok(parse_pickaxe_results(&output))
}

pub fn discover_lost_commits(
    repo_path: &Path,
    limit: Option<u32>,
) -> Result<Vec<LostCommit>, AppError> {
    let limit = bounded_limit(limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT);
    let (status, output) = GitCli::run_allowing_statuses(
        repo_path,
        &["fsck", "--no-reflogs", "--unreachable", "--no-progress"],
        &[1],
    )?;
    if status == 1 && output.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut commits = Vec::new();
    for (source, hash) in parse_lost_commit_refs(&output) {
        if commits.len() >= limit as usize {
            break;
        }
        if let Some(commit) = get_lost_commit(repo_path, &hash, &source)? {
            commits.push(commit);
        }
    }

    Ok(commits)
}

pub fn reflog_search(
    repo_path: &Path,
    query: Option<&str>,
    limit: Option<u32>,
) -> Result<Vec<ReflogEntry>, AppError> {
    if GitCli::run(repo_path, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let limit = bounded_limit(limit, DEFAULT_COMMIT_LIMIT, MAX_COMMIT_LIMIT).to_string();
    let output = GitCli::run(
        repo_path,
        &[
            "reflog",
            "show",
            "--all",
            "--format=%H%x00%h%x00%gd%x00%gs%x00%an%x00%cI",
            "--max-count",
            &limit,
        ],
    )?;
    let needle = query
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(|query| query.to_lowercase());

    Ok(output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(parse_reflog_entry)
        .filter(|entry| match &needle {
            Some(needle) => {
                entry.hash.to_lowercase().contains(needle)
                    || entry.short_hash.to_lowercase().contains(needle)
                    || entry.selector.to_lowercase().contains(needle)
                    || entry.message.to_lowercase().contains(needle)
                    || entry.author_name.to_lowercase().contains(needle)
            }
            None => true,
        })
        .collect())
}

fn run_git_owned(repo_path: &Path, args: Vec<String>) -> Result<String, AppError> {
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    GitCli::run(repo_path, &refs)
}

fn bounded_limit(limit: Option<u32>, default: u32, max: u32) -> u32 {
    limit.unwrap_or(default).clamp(1, max)
}

fn required_text<'a>(value: &'a str, label: &str) -> Result<&'a str, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::GitError(format!("{label} is required")));
    }
    Ok(value)
}

fn parse_commit_search_result(line: &str) -> Option<CommitSearchResult> {
    let parts = line.split('\0').collect::<Vec<_>>();
    if parts.len() < 8 {
        return None;
    }

    Some(CommitSearchResult {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        message: parts[2].to_string(),
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        timestamp: parts[5].to_string(),
        refs: parse_refs(parts[6]),
        parents: parts[7]
            .split_whitespace()
            .map(|parent| parent.to_string())
            .collect(),
    })
}

fn append_commit_search_results(
    results: &mut Vec<CommitSearchResult>,
    seen: &mut HashSet<String>,
    output: &str,
    limit: u32,
) {
    for result in output
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(parse_commit_search_result)
    {
        if results.len() >= limit as usize {
            break;
        }
        if seen.insert(result.hash.clone()) {
            results.push(result);
        }
    }
}

fn get_commit_search_result(
    repo_path: &Path,
    hash: &str,
) -> Result<Option<CommitSearchResult>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "-s",
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI%x00%D%x00%P",
            hash,
        ],
    )?;
    Ok(parse_commit_search_result(output.trim_end_matches('\n')))
}

fn is_hex_query(query: &str) -> bool {
    query.len() >= 4 && query.chars().all(|c| c.is_ascii_hexdigit())
}

fn escape_extended_regex(query: &str) -> String {
    let mut escaped = String::with_capacity(query.len());
    for character in query.chars() {
        if matches!(
            character,
            '.' | '[' | ']' | '\\' | '(' | ')' | '*' | '+' | '?' | '{' | '}' | '^' | '$' | '|'
        ) {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

fn parse_lost_commit_refs(output: &str) -> Vec<(String, String)> {
    let mut commits = Vec::new();
    for line in output.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 3 && parts[1] == "commit" {
            commits.push((parts[0].to_string(), parts[2].to_string()));
        }
    }
    commits
}

fn get_lost_commit(
    repo_path: &Path,
    hash: &str,
    source: &str,
) -> Result<Option<LostCommit>, AppError> {
    let output = GitCli::run(
        repo_path,
        &[
            "show",
            "-s",
            "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%aI",
            hash,
        ],
    )?;
    let parts = output
        .trim_end_matches('\n')
        .split('\0')
        .collect::<Vec<_>>();
    if parts.len() < 6 {
        return Ok(None);
    }

    Ok(Some(LostCommit {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        message: parts[2].to_string(),
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        timestamp: parts[5].to_string(),
        source: source.to_string(),
    }))
}

fn parse_reflog_entry(line: &str) -> Option<ReflogEntry> {
    let parts = line.split('\0').collect::<Vec<_>>();
    if parts.len() < 6 {
        return None;
    }

    Some(ReflogEntry {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        selector: parts[2].to_string(),
        message: parts[3].to_string(),
        author_name: parts[4].to_string(),
        timestamp: parts[5].to_string(),
    })
}

fn parse_file_history_entries(output: &str) -> Vec<FileHistoryEntry> {
    output
        .split('\x1e')
        .filter_map(parse_file_history_entry)
        .collect()
}

fn parse_file_history_entry(record: &str) -> Option<FileHistoryEntry> {
    let record = record.trim_start_matches('\n');
    if record.trim().is_empty() {
        return None;
    }

    let (header, changes) = record.split_once('\n').unwrap_or((record, ""));
    let parts = header.split('\x1f').collect::<Vec<_>>();
    if parts.len() < 6 {
        return None;
    }

    Some(FileHistoryEntry {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        message: parts[2].to_string(),
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        timestamp: parts[5].to_string(),
        changes: parse_file_changes(changes),
    })
}

fn parse_pickaxe_results(output: &str) -> Vec<PickaxeSearchResult> {
    output
        .split('\x1e')
        .filter_map(parse_pickaxe_result)
        .collect()
}

fn parse_pickaxe_result(record: &str) -> Option<PickaxeSearchResult> {
    let record = record.trim_start_matches('\n');
    if record.trim().is_empty() {
        return None;
    }

    let (header, changes) = record.split_once('\n').unwrap_or((record, ""));
    let parts = header.split('\x1f').collect::<Vec<_>>();
    if parts.len() < 6 {
        return None;
    }

    Some(PickaxeSearchResult {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        message: parts[2].to_string(),
        author_name: parts[3].to_string(),
        author_email: parts[4].to_string(),
        timestamp: parts[5].to_string(),
        changes: parse_file_changes(changes),
    })
}

fn parse_file_changes(changes: &str) -> Vec<FileChange> {
    changes
        .lines()
        .filter_map(|line| {
            let line = line.trim_end_matches('\r');
            if line.trim().is_empty() {
                return None;
            }

            let mut parts = line.split('\t');
            let status = parts.next()?.to_string();
            let first_path = parts.next()?.to_string();
            let second_path = parts.next().map(|path| path.to_string());

            match second_path {
                Some(path) if status.starts_with('R') || status.starts_with('C') => {
                    Some(FileChange {
                        status,
                        path,
                        previous_path: Some(first_path),
                    })
                }
                Some(path) => Some(FileChange {
                    status,
                    path,
                    previous_path: Some(first_path),
                }),
                None => Some(FileChange {
                    status,
                    path: first_path,
                    previous_path: None,
                }),
            }
        })
        .collect()
}

fn parse_refs(refs: &str) -> Vec<String> {
    refs.split(',')
        .map(str::trim)
        .filter(|reference| !reference.is_empty() && !reference.starts_with("tag: "))
        .map(|reference| reference.to_string())
        .collect()
}

#[derive(Default)]
struct BlameState {
    hash: String,
    original_line_number: u32,
    line_number: u32,
    author_name: String,
    author_email: String,
    author_time: String,
    summary: String,
}

fn parse_blame_lines(output: &str, limit: u32) -> Vec<BlameLine> {
    let mut lines = Vec::new();
    let mut state = BlameState::default();

    for line in output.lines() {
        if lines.len() >= limit as usize {
            break;
        }

        if let Some(content) = line.strip_prefix('\t') {
            lines.push(BlameLine {
                line_number: state.line_number,
                original_line_number: state.original_line_number,
                hash: state.hash.clone(),
                author_name: state.author_name.clone(),
                author_email: state.author_email.clone(),
                author_time: state.author_time.clone(),
                summary: state.summary.clone(),
                content: content.to_string(),
            });
            continue;
        }

        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() >= 3 && parts[0].len() >= 40 {
            state.hash = parts[0].trim_start_matches('^').to_string();
            state.original_line_number = parts[1].parse().unwrap_or_default();
            state.line_number = parts[2].parse().unwrap_or_default();
            state.author_name.clear();
            state.author_email.clear();
            state.author_time.clear();
            state.summary.clear();
            continue;
        }

        if let Some(author) = line.strip_prefix("author ") {
            state.author_name = author.to_string();
        } else if let Some(email) = line.strip_prefix("author-mail ") {
            state.author_email = email
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>')
                .to_string();
        } else if let Some(time) = line.strip_prefix("author-time ") {
            state.author_time = time.to_string();
        } else if let Some(summary) = line.strip_prefix("summary ") {
            state.summary = summary.to_string();
        }
    }

    lines
}

fn parse_git_grep_matches(output: &str, limit: u32) -> Vec<GitGrepMatch> {
    let mut matches = Vec::new();
    let mut rest = output;

    while !rest.is_empty() && matches.len() < limit as usize {
        let Some(path_end) = rest.find('\0') else {
            break;
        };
        let path = &rest[..path_end];
        rest = &rest[path_end + 1..];

        let Some(line_end) = rest.find('\0') else {
            break;
        };
        let line_number = rest[..line_end].parse().unwrap_or_default();
        rest = &rest[line_end + 1..];

        let (content, next_rest) = match rest.find('\n') {
            Some(content_end) => (&rest[..content_end], &rest[content_end + 1..]),
            None => (rest, ""),
        };
        rest = next_rest;

        matches.push(GitGrepMatch {
            path: path.to_string(),
            line_number,
            content: content.to_string(),
        });
    }

    matches
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("giteye-archaeology-{name}-{nonce}"));
            fs::create_dir_all(&path).expect("create temp dir");
            Self { path }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
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

    fn git_output(cwd: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn init_repo(path: &Path) {
        git(path, &["init", "-b", "main"]);
        git(path, &["config", "user.name", "GitEye Test"]);
        git(path, &["config", "user.email", "test@giteye.local"]);
    }

    fn commit_file(path: &Path, file: &str, contents: &str, message: &str) {
        fs::write(path.join(file), contents).expect("write file");
        git(path, &["add", file]);
        git(path, &["commit", "-m", message]);
    }

    #[test]
    fn commit_search_finds_matching_commit_messages() {
        let temp = TestDir::new("commit-search");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "base\n", "Initial commit");
        commit_file(
            &temp.path,
            "search.txt",
            "native\n",
            "Add native archaeology search",
        );

        let results = commit_search(&temp.path, "archaeology", Some(10)).expect("search commits");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].message, "Add native archaeology search");
    }

    #[test]
    fn commit_search_finds_authors_and_hashes() {
        let temp = TestDir::new("commit-search-author-hash");
        init_repo(&temp.path);
        git(&temp.path, &["config", "user.name", "Archaeology Author"]);
        commit_file(&temp.path, "README.md", "base\n", "Initial commit");
        let hash = git_output(&temp.path, &["rev-parse", "HEAD"]);
        let hash_fragment = &hash[..8];

        let author_results =
            commit_search(&temp.path, "archaeology author", Some(10)).expect("author search");
        let hash_results = commit_search(&temp.path, hash_fragment, Some(10)).expect("hash search");

        assert!(author_results
            .iter()
            .any(|commit| commit.author_name == "Archaeology Author"));
        assert!(hash_results.iter().any(|commit| commit.hash == hash));
    }

    #[test]
    fn file_history_follows_renames_and_reports_changes() {
        let temp = TestDir::new("file-history");
        init_repo(&temp.path);
        commit_file(&temp.path, "notes.txt", "one\n", "Add notes");
        git(&temp.path, &["mv", "notes.txt", "docs.txt"]);
        git(&temp.path, &["commit", "-m", "Rename notes"]);

        let results = file_history(&temp.path, "docs.txt", Some(10)).expect("file history");

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].message, "Rename notes");
        assert!(results[0]
            .changes
            .iter()
            .any(
                |change| change.previous_path.as_deref() == Some("notes.txt")
                    && change.path == "docs.txt"
            ));
        assert_eq!(results[1].message, "Add notes");
    }

    #[test]
    fn blame_file_returns_limited_porcelain_lines() {
        let temp = TestDir::new("blame");
        init_repo(&temp.path);
        commit_file(&temp.path, "code.rs", "one\ntwo\n", "Add code");
        commit_file(
            &temp.path,
            "code.rs",
            "one\nchanged\n",
            "Change second line",
        );

        let lines = blame_file(&temp.path, "code.rs", None, Some(1)).expect("blame file");

        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].line_number, 1);
        assert_eq!(lines[0].content, "one");
        assert_eq!(lines[0].author_name, "GitEye Test");
    }

    #[test]
    fn git_grep_returns_matches_and_empty_results() {
        let temp = TestDir::new("grep");
        init_repo(&temp.path);
        commit_file(&temp.path, "src.txt", "alpha\nneedle value\n", "Add source");

        let matches = git_grep(&temp.path, "NEEDLE", None, Some(false), Some(10)).expect("grep");
        let empty = git_grep(&temp.path, "missing", None, None, Some(10)).expect("empty grep");

        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "src.txt");
        assert_eq!(matches[0].line_number, 2);
        assert_eq!(matches[0].content, "needle value");
        assert!(empty.is_empty());
    }

    #[test]
    fn pickaxe_search_finds_string_introductions() {
        let temp = TestDir::new("pickaxe");
        init_repo(&temp.path);
        commit_file(&temp.path, "src.txt", "alpha\n", "Initial");
        commit_file(&temp.path, "src.txt", "alpha\nneedle\n", "Introduce needle");

        let results = pickaxe_search(&temp.path, "needle", Some(false), Some(10)).expect("pickaxe");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].message, "Introduce needle");
        assert!(results[0]
            .changes
            .iter()
            .any(|change| change.path == "src.txt"));
    }

    #[test]
    fn pickaxe_search_supports_regex_changes() {
        let temp = TestDir::new("pickaxe-regex");
        init_repo(&temp.path);
        commit_file(&temp.path, "src.txt", "alpha\n", "Initial");
        commit_file(
            &temp.path,
            "src.txt",
            "alpha\nneedle_42\n",
            "Introduce numbered needle",
        );

        let results = pickaxe_search(&temp.path, "needle_[0-9]+", Some(true), Some(10))
            .expect("regex pickaxe");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].message, "Introduce numbered needle");
    }
    #[test]
    fn discover_lost_commits_reports_unreachable_commits() {
        let temp = TestDir::new("lost-commits");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "base\n", "Base");
        git(&temp.path, &["switch", "-c", "lost-work"]);
        commit_file(&temp.path, "lost.txt", "lost\n", "Lost work");
        let lost_hash = git_output(&temp.path, &["rev-parse", "HEAD"]);
        git(&temp.path, &["switch", "main"]);
        git(&temp.path, &["branch", "-D", "lost-work"]);

        let results = discover_lost_commits(&temp.path, Some(10)).expect("discover lost commits");

        assert!(results
            .iter()
            .any(|commit| commit.hash == lost_hash && commit.message == "Lost work"));
    }

    #[test]
    fn reflog_search_lists_and_filters_reflog_entries() {
        let temp = TestDir::new("reflog-search");
        init_repo(&temp.path);
        commit_file(&temp.path, "README.md", "base\n", "Base");
        commit_file(
            &temp.path,
            "feature.txt",
            "feature\n",
            "Feature reflog target",
        );

        let results =
            reflog_search(&temp.path, Some("Feature reflog"), Some(20)).expect("reflog search");

        assert!(results
            .iter()
            .any(|entry| entry.message.contains("Feature reflog target")));
    }
}
