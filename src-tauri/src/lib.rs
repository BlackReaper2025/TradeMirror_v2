use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

// ─── List image files in a folder ─────────────────────────────────────────────

#[tauri::command]
fn list_images(folder: String) -> Vec<String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&folder);
    if !path.is_dir() {
        return vec![];
    }

    let extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];

    let mut paths: Vec<String> = fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let p = e.path();
                    if !p.is_file() { return None; }
                    let ext = p.extension()
                        .and_then(|x| x.to_str())
                        .map(|s| s.to_lowercase())
                        .unwrap_or_default();
                    if extensions.contains(&ext.as_str()) {
                        p.to_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    paths.sort();
    paths
}


// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:trademirror.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![list_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
