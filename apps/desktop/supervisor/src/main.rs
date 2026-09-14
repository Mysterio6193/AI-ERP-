//! Runs the bundled stack headless.
//!
//! The same boot path the desktop window uses, without the window — which is
//! what makes it runnable in CI and on a server, and is how the sequence gets
//! exercised on every platform rather than only inside a signed bundle.
//!
//!   supplysure-serve --node <path> --server <server.js> [--pg-bin <dir>] [--data <dir>]

use std::path::PathBuf;
use std::time::Duration;

use supervisor::{AppPaths, Supervisor};

fn arg(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let index = args.iter().position(|a| a == &format!("--{name}"))?;
    args.get(index + 1).cloned()
}

fn main() {
    let node = arg("node").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("node"));
    let server_js = match arg("server") {
        Some(value) => PathBuf::from(value),
        None => {
            eprintln!("--server <path to server.js> is required");
            std::process::exit(2);
        }
    };

    let paths = AppPaths {
        node,
        server_js,
        pg_bin: arg("pg-bin").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("")),
        data_dir: arg("data")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("supplysure-desktop")),
        bundle_root: arg("bundle").map(PathBuf::from),
    };

    let timeout = Duration::from_secs(
        arg("timeout").and_then(|v| v.parse().ok()).unwrap_or(90),
    );

    match Supervisor::start(&paths, timeout) {
        Ok(supervisor) => {
            println!("{}", supervisor.url());
            // Held until interrupted; dropping the supervisor stops everything.
            loop {
                std::thread::sleep(Duration::from_secs(3600));
            }
        }
        Err(error) => {
            eprintln!("could not start: {error}");
            std::process::exit(1);
        }
    }
}
