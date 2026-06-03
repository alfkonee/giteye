use crate::errors::AppError;
use crate::git::cli::GitCli;
use crate::models::Remote;
use std::collections::HashMap;
use std::path::Path;

pub fn list_remotes(repo_path: &Path) -> Result<Vec<Remote>, AppError> {
    let output = GitCli::run(repo_path, &["remote", "-v"])?;

    let mut remotes_map: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0].to_string();
        let url = parts[1].to_string();
        let kind = parts.get(2).copied().unwrap_or("");

        let entry = remotes_map.entry(name.clone()).or_insert((None, None));
        match kind {
            "(fetch)" => entry.0 = Some(url),
            "(push)" => entry.1 = Some(url),
            _ => {}
        }
    }

    let remotes: Vec<Remote> = remotes_map
        .into_iter()
        .map(|(name, (fetch_url, push_url))| Remote {
            name: name.clone(),
            url: fetch_url.clone().unwrap_or_default(),
            fetch_url,
            push_url,
        })
        .collect();

    Ok(remotes)
}

pub fn fetch(repo_path: &Path, remote: Option<&str>) -> Result<(), AppError> {
    let mut args = vec!["fetch"];
    if let Some(r) = remote {
        args.push(r);
    }
    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn pull(repo_path: &Path, remote: Option<&str>, branch: Option<&str>) -> Result<(), AppError> {
    let mut args = vec!["pull"];
    if let Some(r) = remote {
        args.push(r);
    }
    if let Some(b) = branch {
        args.push(b);
    }
    GitCli::run(repo_path, &args)?;
    Ok(())
}

pub fn push(repo_path: &Path, remote: Option<&str>, branch: Option<&str>) -> Result<(), AppError> {
    let mut args = vec!["push"];
    if let Some(r) = remote {
        args.push(r);
    }
    if let Some(b) = branch {
        args.push(b);
    }
    GitCli::run(repo_path, &args)?;
    Ok(())
}
