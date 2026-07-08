use std::fs;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

use crate::report::RepoScanReport;

/// Persists each completed scan into the local app-data SQLite database for report history.
pub fn save_report(
    app: &AppHandle,
    report: &RepoScanReport,
) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    let db_path = dir.join("fixer.sqlite3");
    let connection = Connection::open(db_path)?;

    connection.execute(
        "create table if not exists reports (
            id integer primary key autoincrement,
            repo_path text not null,
            repo_name text not null,
            scanned_at text not null,
            ai_expense_score real not null,
            ai_readiness_score integer not null,
            report_json text not null
        )",
        [],
    )?;

    let json = serde_json::to_string(report)?;
    connection.execute(
        "insert into reports (repo_path, repo_name, scanned_at, ai_expense_score, ai_readiness_score, report_json) values (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            report.repo_path,
            report.repo_name,
            report.scanned_at,
            report.scores.ai_expense_score,
            report.scores.ai_readiness_score,
            json
        ],
    )?;

    Ok(())
}
