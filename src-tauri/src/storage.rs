use std::fs;

use rusqlite::{params, Connection};
use tauri::{AppHandle, Manager};

use crate::report::RepoScanReport;

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
            source_path text not null,
            scanned_at text not null,
            ai_expense_score integer not null,
            ai_readiness_score integer not null,
            report_json text not null
        )",
        [],
    )?;

    let json = serde_json::to_string(report)?;
    connection.execute(
        "insert into reports (source_path, scanned_at, ai_expense_score, ai_readiness_score, report_json) values (?1, ?2, ?3, ?4, ?5)",
        params![report.source_path, report.scanned_at, report.ai_expense_score.value, report.ai_readiness_score.value, json],
    )?;

    Ok(())
}
