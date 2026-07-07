mod report;
mod scanner;
mod storage;

use std::path::PathBuf;

use report::RepoScanReport;

#[tauri::command]
fn scan_repo(path: String, app: tauri::AppHandle) -> Result<RepoScanReport, String> {
    let report = scanner::scan_repo(PathBuf::from(path)).map_err(|error| error.to_string())?;
    storage::save_report(&app, &report).map_err(|error| error.to_string())?;
    Ok(report)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_repo])
        .run(tauri::generate_context!())
        .expect("failed to run Fixer desktop app");
}
