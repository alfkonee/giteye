use crate::errors::AppError;
use crate::git::{cli::GitCli, repository_service, state_graph::RepoStateReason};
use crate::models::job::{
    GitJobLogChannel, GitJobLogLine, GitJobRecord, GitJobStatus, GitJobSummary,
};
use chrono::Utc;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, TryLockError};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const GIT_JOB_EVENT: &str = "giteye://git-job-event";
const GIT_STATE_CHANGED_EVENT: &str = "git-state-changed";
const MAX_RETAINED_TERMINAL_JOBS_PER_REPO: usize = 200;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStateChangedPayload {
    repo_path: String,
    reason: String,
}

type CompletionHook = Box<dyn FnOnce() + Send + 'static>;

/// Internal request used by command handlers to start a GitEye-triggered Git job.
pub struct GitJobRequest {
    pub repo_path: String,
    pub working_dir: PathBuf,
    pub kind: String,
    pub title: String,
    pub args: Vec<String>,
    pub mutates_repo: bool,
    pub invalidation_reasons: Vec<String>,
    pub on_success: Option<CompletionHook>,
}

impl GitJobRequest {
    pub fn new(
        repo_path: String,
        kind: impl Into<String>,
        title: impl Into<String>,
        args: Vec<String>,
    ) -> Self {
        let working_dir = PathBuf::from(&repo_path);
        Self {
            repo_path,
            working_dir,
            kind: kind.into(),
            title: title.into(),
            args,
            mutates_repo: true,
            invalidation_reasons: vec!["worktree".to_string(), "refs".to_string()],
            on_success: None,
        }
    }

    pub fn with_working_dir(mut self, working_dir: PathBuf) -> Self {
        self.working_dir = working_dir;
        self
    }

    #[allow(dead_code)]
    pub fn with_mutation(mut self, mutates_repo: bool) -> Self {
        self.mutates_repo = mutates_repo;
        self
    }

    pub fn with_invalidation_reasons(mut self, reasons: Vec<&str>) -> Self {
        self.invalidation_reasons = reasons.into_iter().map(str::to_string).collect();
        self
    }

    pub fn on_success(mut self, hook: CompletionHook) -> Self {
        self.on_success = Some(hook);
        self
    }
}

/// Tauri-managed state for GitEye-triggered background Git jobs.
#[derive(Default)]
pub struct GitJobRunnerState {
    next_job_id: AtomicU64,
    jobs: Arc<Mutex<HashMap<String, GitJobRecord>>>,
    cancellations: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    repo_mutation_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl GitJobRunnerState {
    pub fn start_job(
        &self,
        app: AppHandle,
        request: GitJobRequest,
    ) -> Result<GitJobSummary, AppError> {
        let sequence = self.next_job_id.fetch_add(1, Ordering::SeqCst) + 1;
        let job_id = format!("git-job-{}-{sequence}", Utc::now().timestamp_millis());
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let record = GitJobRecord {
            job_id: job_id.clone(),
            repo_path: request.repo_path.clone(),
            kind: request.kind.clone(),
            title: request.title.clone(),
            status: GitJobStatus::Queued,
            command: "git".to_string(),
            args: redact_git_job_args(&request.args),
            created_at: Utc::now(),
            started_at: None,
            finished_at: None,
            exit_code: None,
            error: None,
            invalidation_reasons: request.invalidation_reasons.clone(),
            logs: Vec::new(),
        };

        {
            let mut jobs = self.jobs.lock().map_err(lock_error)?;
            jobs.insert(job_id.clone(), record.clone());
        }
        {
            let mut cancellations = self.cancellations.lock().map_err(lock_error)?;
            cancellations.insert(job_id.clone(), Arc::clone(&cancel_flag));
        }
        emit_job_event(&app, &record, None);

        let jobs = Arc::clone(&self.jobs);
        let cancellations = Arc::clone(&self.cancellations);
        let repo_lock = if request.mutates_repo {
            Some(self.repo_lock(&request.repo_path)?)
        } else {
            None
        };
        let job_id_for_thread = job_id.clone();

        thread::spawn(move || {
            let _repo_guard = match wait_for_repo_guard(&repo_lock, &cancel_flag) {
                RepoGuardWait::Acquired(guard) => guard,
                RepoGuardWait::Canceled => {
                    update_job(&jobs, &app, &job_id_for_thread, None, |job| {
                        job.status = GitJobStatus::Canceled;
                        job.finished_at = Some(Utc::now());
                        job.error = Some("Git job canceled before start".to_string());
                    });
                    if let Ok(mut cancellations) = cancellations.lock() {
                        cancellations.remove(&job_id_for_thread);
                    }
                    trim_retained_jobs(&jobs, &request.repo_path);
                    return;
                }
            };

            if cancel_flag.load(Ordering::SeqCst) {
                update_job(&jobs, &app, &job_id_for_thread, None, |job| {
                    job.status = GitJobStatus::Canceled;
                    job.finished_at = Some(Utc::now());
                    job.error = Some("Git job canceled before start".to_string());
                });
                if let Ok(mut cancellations) = cancellations.lock() {
                    cancellations.remove(&job_id_for_thread);
                }
                trim_retained_jobs(&jobs, &request.repo_path);
                return;
            }

            update_job(&jobs, &app, &job_id_for_thread, None, |job| {
                job.status = GitJobStatus::Running;
                job.started_at = Some(Utc::now());
            });

            let output_jobs = Arc::clone(&jobs);
            let output_app = app.clone();
            let output_job_id = job_id_for_thread.clone();
            let stream = Arc::new(move |channel: &'static str, line: String| {
                let channel = if channel == "stderr" {
                    GitJobLogChannel::Stderr
                } else {
                    GitJobLogChannel::Stdout
                };
                let log_line = GitJobLogLine {
                    channel,
                    line: redact_git_output(&line),
                    timestamp: Utc::now(),
                };
                update_job(
                    &output_jobs,
                    &output_app,
                    &output_job_id,
                    Some(log_line.clone()),
                    |job| {
                        job.logs.push(log_line);
                    },
                );
            });

            let result = GitCli::run_streaming(
                &request.working_dir,
                &request.args,
                Arc::clone(&cancel_flag),
                stream,
            );
            let canceled = cancel_flag.load(Ordering::SeqCst);

            update_job(&jobs, &app, &job_id_for_thread, None, |job| {
                job.finished_at = Some(Utc::now());
                match result {
                    Ok(output) if canceled => {
                        job.status = GitJobStatus::Canceled;
                        job.exit_code = Some(output.status_code);
                        job.error = Some("Git job canceled".to_string());
                    }
                    Ok(output) if output.status_code == 0 => {
                        job.status = GitJobStatus::Succeeded;
                        job.exit_code = Some(output.status_code);
                    }
                    Ok(output) => {
                        job.status = GitJobStatus::Failed;
                        job.exit_code = Some(output.status_code);
                        let message = first_non_empty(&output.stderr)
                            .or_else(|| first_non_empty(&output.stdout))
                            .unwrap_or_else(|| {
                                format!("git exited with status {}", output.status_code)
                            });
                        job.error = Some(redact_git_output(&message));
                    }
                    Err(error) if canceled => {
                        job.status = GitJobStatus::Canceled;
                        job.error = Some(error.to_string());
                    }
                    Err(error) => {
                        job.status = GitJobStatus::Failed;
                        job.error = Some(error.to_string());
                    }
                }
            });

            if let Ok(mut cancellations) = cancellations.lock() {
                cancellations.remove(&job_id_for_thread);
            }

            if let Some(job) = get_job_from(&jobs, &job_id_for_thread) {
                if !matches!(job.status, GitJobStatus::Canceled) {
                    for reason in &job.invalidation_reasons {
                        if let Some(state_reason) = repo_state_reason(reason) {
                            repository_service::note_repository_change(
                                Path::new(&job.repo_path),
                                state_reason,
                            );
                            let _ = app.emit(
                                GIT_STATE_CHANGED_EVENT,
                                GitStateChangedPayload {
                                    repo_path: job.repo_path.clone(),
                                    reason: reason.clone(),
                                },
                            );
                        }
                    }
                }
                if matches!(job.status, GitJobStatus::Succeeded) {
                    if let Some(hook) = request.on_success {
                        hook();
                    }
                }
            }

            trim_retained_jobs(&jobs, &request.repo_path);
        });

        let jobs = self.jobs.lock().map_err(lock_error)?;
        jobs.get(&job_id)
            .map(GitJobRecord::summary)
            .ok_or_else(|| AppError::GitError(format!("Git job {job_id} was not recorded")))
    }

    pub fn list_jobs(&self, repo_path: Option<&str>) -> Result<Vec<GitJobSummary>, AppError> {
        let jobs = self.jobs.lock().map_err(lock_error)?;
        let mut summaries: Vec<_> = jobs
            .values()
            .filter(|job| repo_path.map(|path| path == job.repo_path).unwrap_or(true))
            .map(GitJobRecord::summary)
            .collect();
        summaries.sort_by_key(|job| job.created_at);
        summaries.reverse();
        Ok(summaries)
    }

    pub fn get_job(&self, job_id: &str) -> Result<Option<GitJobRecord>, AppError> {
        let jobs = self.jobs.lock().map_err(lock_error)?;
        Ok(jobs.get(job_id).cloned())
    }

    pub fn cancel_job(&self, app: &AppHandle, job_id: &str) -> Result<GitJobSummary, AppError> {
        let cancel_flag = {
            let cancellations = self.cancellations.lock().map_err(lock_error)?;
            cancellations.get(job_id).cloned()
        };

        match cancel_flag {
            Some(flag) => flag.store(true, Ordering::SeqCst),
            None => {
                let job = self
                    .get_job(job_id)?
                    .ok_or_else(|| AppError::GitError(format!("Git job {job_id} was not found")))?;
                return Ok(job.summary());
            }
        }

        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let job = jobs
            .get_mut(job_id)
            .ok_or_else(|| AppError::GitError(format!("Git job {job_id} was not found")))?;
        if matches!(job.status, GitJobStatus::Queued) {
            job.status = GitJobStatus::Canceled;
            job.finished_at = Some(Utc::now());
            job.error = Some("Git job canceled before start".to_string());
        }
        let summary = job.summary();
        emit_job_event(app, job, None);
        Ok(summary)
    }

    pub fn clear_job_logs(
        &self,
        repo_path: Option<&str>,
        job_id: Option<&str>,
    ) -> Result<Vec<GitJobSummary>, AppError> {
        let mut jobs = self.jobs.lock().map_err(lock_error)?;
        let mut summaries = Vec::new();
        for job in jobs.values_mut() {
            let repo_matches = repo_path.map(|path| path == job.repo_path).unwrap_or(true);
            let job_matches = job_id.map(|id| id == job.job_id).unwrap_or(true);
            if repo_matches && job_matches {
                job.logs.clear();
                summaries.push(job.summary());
            }
        }
        summaries.sort_by_key(|job| job.created_at);
        summaries.reverse();
        Ok(summaries)
    }

    pub fn with_repo_mutation_lock<T, F>(
        &self,
        repo_path: &str,
        operation: F,
    ) -> Result<T, AppError>
    where
        F: FnOnce() -> Result<T, AppError>,
    {
        let repo_lock = self.repo_lock(repo_path)?;
        let _guard = match repo_lock.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::WouldBlock) => {
                return Err(AppError::GitError(
                    "Repository has another Git operation in progress".to_string(),
                ));
            }
            Err(TryLockError::Poisoned(error)) => error.into_inner(),
        };

        operation()
    }

    fn repo_lock(&self, repo_path: &str) -> Result<Arc<Mutex<()>>, AppError> {
        let mut locks = self.repo_mutation_locks.lock().map_err(lock_error)?;
        Ok(Arc::clone(
            locks
                .entry(repo_path.to_string())
                .or_insert_with(|| Arc::new(Mutex::new(()))),
        ))
    }
}

enum RepoGuardWait<'a> {
    Acquired(Option<MutexGuard<'a, ()>>),
    Canceled,
}

fn wait_for_repo_guard<'a>(
    repo_lock: &'a Option<Arc<Mutex<()>>>,
    cancel_flag: &AtomicBool,
) -> RepoGuardWait<'a> {
    let Some(lock) = repo_lock else {
        return RepoGuardWait::Acquired(None);
    };

    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            return RepoGuardWait::Canceled;
        }

        match lock.try_lock() {
            Ok(guard) => return RepoGuardWait::Acquired(Some(guard)),
            Err(TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(25)),
            Err(TryLockError::Poisoned(error)) => {
                return RepoGuardWait::Acquired(Some(error.into_inner()));
            }
        }
    }
}

fn update_job<F>(
    jobs: &Arc<Mutex<HashMap<String, GitJobRecord>>>,
    app: &AppHandle,
    job_id: &str,
    stream: Option<GitJobLogLine>,
    update: F,
) where
    F: FnOnce(&mut GitJobRecord),
{
    let Ok(mut jobs) = jobs.lock() else {
        return;
    };
    let Some(job) = jobs.get_mut(job_id) else {
        return;
    };
    update(job);
    emit_job_event(app, job, stream);
}

fn emit_job_event(app: &AppHandle, job: &GitJobRecord, stream: Option<GitJobLogLine>) {
    let _ = app.emit(GIT_JOB_EVENT, job.event(stream));
}

fn get_job_from(
    jobs: &Arc<Mutex<HashMap<String, GitJobRecord>>>,
    job_id: &str,
) -> Option<GitJobRecord> {
    jobs.lock().ok().and_then(|jobs| jobs.get(job_id).cloned())
}

fn trim_retained_jobs(jobs: &Arc<Mutex<HashMap<String, GitJobRecord>>>, repo_path: &str) {
    let Ok(mut jobs) = jobs.lock() else {
        return;
    };
    trim_retained_jobs_for_repo(&mut jobs, repo_path, MAX_RETAINED_TERMINAL_JOBS_PER_REPO);
}

fn trim_retained_jobs_for_repo(
    jobs: &mut HashMap<String, GitJobRecord>,
    repo_path: &str,
    max_terminal_jobs: usize,
) {
    let mut terminal_job_ids: Vec<_> = jobs
        .values()
        .filter(|job| job.repo_path == repo_path && is_terminal_status(&job.status))
        .map(|job| (job.created_at, job.job_id.clone()))
        .collect();

    terminal_job_ids.sort_by(|left, right| right.cmp(left));

    for (_, job_id) in terminal_job_ids.into_iter().skip(max_terminal_jobs) {
        jobs.remove(&job_id);
    }
}

fn is_terminal_status(status: &GitJobStatus) -> bool {
    matches!(
        status,
        GitJobStatus::Succeeded | GitJobStatus::Failed | GitJobStatus::Canceled
    )
}

fn repo_state_reason(reason: &str) -> Option<RepoStateReason> {
    match reason {
        "worktree" => Some(RepoStateReason::Worktree),
        "refs" => Some(RepoStateReason::Refs),
        "remote" => Some(RepoStateReason::Remote),
        "rebase" => Some(RepoStateReason::Rebase),
        _ => None,
    }
}

fn first_non_empty(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn redact_git_job_args(args: &[String]) -> Vec<String> {
    args.iter().map(|arg| redact_git_arg(arg)).collect()
}

fn redact_git_arg(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    if lower.contains("authorization:")
        || lower.contains("http.extraheader")
        || lower.starts_with("credential.helper=")
    {
        return "<redacted>".to_string();
    }

    redact_url_userinfo(value)
}

fn redact_git_output(value: &str) -> String {
    let mut redacted = String::with_capacity(value.len());
    let mut token = String::new();

    for character in value.chars() {
        if character.is_whitespace() {
            if !token.is_empty() {
                redacted.push_str(&redact_git_arg(&token));
                token.clear();
            }
            redacted.push(character);
        } else {
            token.push(character);
        }
    }

    if !token.is_empty() {
        redacted.push_str(&redact_git_arg(&token));
    }

    redacted
}

fn redact_url_userinfo(value: &str) -> String {
    let Some(scheme_end) = value.find("://") else {
        return value.to_string();
    };
    let authority_start = scheme_end + 3;
    let authority_suffix_start = value[authority_start..]
        .find(['/', '?', '#'])
        .map(|index| authority_start + index)
        .unwrap_or(value.len());
    let authority = &value[authority_start..authority_suffix_start];
    let Some(userinfo_end) = authority.rfind('@') else {
        return value.to_string();
    };

    let host = &authority[userinfo_end + 1..];
    if host.is_empty() {
        return value.to_string();
    }

    format!(
        "{}{}{}",
        &value[..authority_start],
        host,
        &value[authority_suffix_start..]
    )
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> AppError {
    AppError::IoError(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration as ChronoDuration;
    use std::time::Instant;

    #[test]
    fn wait_for_repo_guard_exits_when_canceled_while_queued() {
        let lock = Arc::new(Mutex::new(()));
        let held_guard = lock.lock().expect("lock should be available");
        let repo_lock = Some(Arc::clone(&lock));
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let worker_flag = Arc::clone(&cancel_flag);

        let started_at = Instant::now();
        let worker = thread::spawn(move || {
            matches!(
                wait_for_repo_guard(&repo_lock, &worker_flag),
                RepoGuardWait::Canceled
            )
        });

        thread::sleep(Duration::from_millis(50));
        cancel_flag.store(true, Ordering::SeqCst);

        assert!(worker.join().expect("worker should not panic"));
        assert!(
            started_at.elapsed() < Duration::from_millis(500),
            "queued cancellation should not wait for the repo mutation lock"
        );

        drop(held_guard);
    }

    #[test]
    fn trim_retained_jobs_caps_terminal_jobs_per_repo() {
        let repo_path = "/repo";
        let other_repo = "/other";
        let now = Utc::now();
        let mut jobs = HashMap::new();

        for index in 0..4 {
            let job = test_job(
                &format!("done-{index}"),
                repo_path,
                GitJobStatus::Succeeded,
                now + ChronoDuration::seconds(index),
            );
            jobs.insert(job.job_id.clone(), job);
        }
        let running = test_job("running", repo_path, GitJobStatus::Running, now);
        jobs.insert(running.job_id.clone(), running);
        let other = test_job("other", other_repo, GitJobStatus::Succeeded, now);
        jobs.insert(other.job_id.clone(), other);

        trim_retained_jobs_for_repo(&mut jobs, repo_path, 2);

        assert!(!jobs.contains_key("done-0"));
        assert!(!jobs.contains_key("done-1"));
        assert!(jobs.contains_key("done-2"));
        assert!(jobs.contains_key("done-3"));
        assert!(jobs.contains_key("running"));
        assert!(jobs.contains_key("other"));
    }

    #[test]
    fn with_repo_mutation_lock_rejects_concurrent_mutation() {
        let state = GitJobRunnerState::default();
        let lock = state.repo_lock("/repo").expect("repo lock");
        let _held_guard = lock.lock().expect("lock should be available");

        let error = state
            .with_repo_mutation_lock("/repo", || Ok(()))
            .expect_err("busy repo rejected");

        assert!(
            matches!(error, AppError::GitError(message) if message.contains("another Git operation"))
        );
    }

    #[test]
    fn with_repo_mutation_lock_runs_when_repo_is_available() {
        let state = GitJobRunnerState::default();

        let value = state
            .with_repo_mutation_lock("/repo", || Ok(42))
            .expect("available repo mutation runs");

        assert_eq!(value, 42);
    }

    #[test]
    fn redact_git_job_args_strips_url_userinfo() {
        let args = vec![
            "clone".to_string(),
            "https://token@github.com/org/repo.git".to_string(),
            "https://user:password@example.com/repo.git".to_string(),
            "https://user@example.com/repo.git".to_string(),
            "ssh://git@github.com/org/repo.git".to_string(),
            "git@github.com:org/repo.git".to_string(),
            "https://github.com/org/repo.git".to_string(),
            "http.extraheader=Authorization: Bearer secret".to_string(),
        ];

        let redacted = redact_git_job_args(&args);

        assert_eq!(redacted[0], "clone");
        assert_eq!(redacted[1], "https://github.com/org/repo.git");
        assert_eq!(redacted[2], "https://example.com/repo.git");
        assert_eq!(redacted[3], "https://example.com/repo.git");
        assert_eq!(redacted[4], "ssh://github.com/org/repo.git");
        assert_eq!(redacted[5], "git@github.com:org/repo.git");
        assert_eq!(redacted[6], "https://github.com/org/repo.git");
        assert_eq!(redacted[7], "<redacted>");
    }

    #[test]
    fn redact_git_output_strips_credentials_from_log_lines() {
        let redacted = redact_git_output(
            "fatal: Authentication failed for 'https://user:password@example.com/org/repo.git/'",
        );

        assert_eq!(
            redacted,
            "fatal: Authentication failed for 'https://example.com/org/repo.git/'"
        );
    }

    fn test_job(
        job_id: &str,
        repo_path: &str,
        status: GitJobStatus,
        created_at: chrono::DateTime<Utc>,
    ) -> GitJobRecord {
        GitJobRecord {
            job_id: job_id.to_string(),
            repo_path: repo_path.to_string(),
            kind: "test".to_string(),
            title: "Test".to_string(),
            status,
            command: "git".to_string(),
            args: Vec::new(),
            created_at,
            started_at: None,
            finished_at: None,
            exit_code: None,
            error: None,
            invalidation_reasons: Vec::new(),
            logs: Vec::new(),
        }
    }
}
