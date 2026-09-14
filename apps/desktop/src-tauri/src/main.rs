// A window over the locally bundled stack.
//
// Everything that can fail interestingly — starting Postgres, starting the
// server, waiting for health, shutting both down — lives in the `supervisor`
// crate, which has no GUI dependency and is tested on every platform. This
// file is only the window and the paths, so a failure here is a packaging
// problem rather than a logic one.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use supervisor::{AppPaths, Supervisor};
use tauri::Manager;

/// Held for the life of the app. Dropping it stops the stack, so a crash in
/// the GUI cannot orphan a Postgres still holding the data directory lock.
struct Running(Mutex<Option<Supervisor>>);

fn bundled(app: &tauri::AppHandle, relative: &str) -> PathBuf {
    app.path()
        .resolve(relative, tauri::path::BaseDirectory::Resource)
        .unwrap_or_else(|_| PathBuf::from(relative))
}

fn node_name() -> &'static str {
    if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // Per-user and writable. The bundle itself is read-only on macOS
            // and sits under Program Files on Windows, so the cluster cannot
            // live beside the binaries.
            let data_dir = handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("SupplySureOS"));

            let paths = AppPaths {
                node: bundled(&handle, &format!("runtime/{}", node_name())),
                server_js: bundled(&handle, "server/server.js"),
                pg_bin: bundled(&handle, "pgsql/bin"),
                data_dir,
            };

            // First launch runs initdb and the migrations, which is slow on a
            // cold machine; a short timeout here would fail a perfectly good
            // install.
            let supervisor = Supervisor::start(&paths, Duration::from_secs(180))
                .map_err(|error| format!("SupplySure could not start: {error}"))?;

            let url = supervisor.url();
            app.manage(Running(Mutex::new(Some(supervisor))));

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External(url.parse().expect("supervisor returned a valid url")),
            )
            .title("SupplySure OS")
            .inner_size(1440.0, 900.0)
            .min_inner_size(880.0, 600.0)
            .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop the stack explicitly rather than relying on process
                // teardown, which does not run Drop on every platform.
                if let Some(running) = window.app_handle().try_state::<Running>() {
                    if let Ok(mut guard) = running.0.lock() {
                        if let Some(mut supervisor) = guard.take() {
                            supervisor.shutdown();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run SupplySure OS");
}
