//! Exercises the boot sequence against a real child process.
//!
//! These run anywhere, including a container with no display, which is the
//! point of keeping the supervisor free of GUI dependencies: the risky part of
//! the desktop build is testable on every platform, not only on a signing
//! runner where a failure is expensive to diagnose.

use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use supervisor::{free_port, wait_for_health, AppPaths, BootError, Supervisor};

/// A throwaway HTTP server that answers 200 on /api/health.
fn stub_server(port: u16, delay: Duration) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind stub");
        thread::sleep(delay);

        for stream in listener.incoming().take(40) {
            let Ok(mut stream) = stream else { continue };
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
            );
            let _ = stream.flush();
        }
    })
}

#[test]
fn free_port_returns_something_bindable() {
    let port = free_port().expect("a free port");
    assert!(port > 1024, "should not hand back a privileged port");

    // The whole contract: whatever it returns must actually be bindable.
    let listener = TcpListener::bind(("127.0.0.1", port));
    assert!(listener.is_ok(), "port {port} was not actually free");
}

#[test]
fn free_port_does_not_repeat_itself_immediately() {
    let a = free_port().unwrap();
    let listener = TcpListener::bind(("127.0.0.1", a)).unwrap();
    let b = free_port().unwrap();
    drop(listener);

    assert_ne!(a, b, "handed out a port that was already held");
}

#[test]
fn health_wait_succeeds_once_the_server_answers() {
    let port = free_port().unwrap();
    // Answers only after a moment, which is the real case: the server is
    // spawned and takes a second or two to listen.
    let handle = stub_server(port, Duration::from_millis(400));

    let result = wait_for_health(port, "/api/health", Duration::from_secs(10));
    assert!(result.is_ok(), "should have become healthy: {result:?}");

    drop(handle);
}

#[test]
fn health_wait_times_out_on_a_dead_port_rather_than_hanging() {
    let port = free_port().unwrap();

    let started = std::time::Instant::now();
    let result = wait_for_health(port, "/api/health", Duration::from_secs(1));
    let elapsed = started.elapsed();

    match result {
        Err(BootError::Timeout { seconds, .. }) => assert_eq!(seconds, 1),
        other => panic!("expected a timeout, got {other:?}"),
    }

    // A boot that hangs forever is worse than one that fails: the user gets a
    // window that never opens and no way to tell why.
    assert!(elapsed < Duration::from_secs(5), "took {elapsed:?} to give up");
}

#[test]
fn missing_bundled_files_are_named_rather_than_failing_vaguely() {
    let paths = AppPaths {
        node: PathBuf::from("/definitely/not/here/node"),
        server_js: PathBuf::from("/definitely/not/here/server.js"),
        pg_bin: PathBuf::from("/definitely/not/here/bin"),
        data_dir: std::env::temp_dir().join("supplysure-test-missing"),
        bundle_root: None,
    };

    match Supervisor::start(&paths, Duration::from_secs(1)) {
        Err(BootError::Missing(path)) => {
            // The message has to name the file; "failed to start" on a
            // customer's machine is unactionable.
            assert!(path.to_string_lossy().contains("node"));
        }
        Err(other) => panic!("expected a Missing error naming the file, got {other:?}"),
        Ok(_) => panic!("started despite every bundled file being absent"),
    }
}

/// Spawns a real child that serves health, and proves the supervisor reaps it.
#[test]
fn supervisor_starts_a_real_child_and_stops_it_on_shutdown() {
    let Some(node) = which_node() else {
        eprintln!("skipping: no node on PATH");
        return;
    };

    let dir = std::env::temp_dir().join("supplysure-supervisor-test");
    std::fs::create_dir_all(&dir).unwrap();
    let server_js = dir.join("server.js");

    // Stands in for the Next standalone server: binds PORT, answers health.
    std::fs::write(
        &server_js,
        r#"
const http = require('http');
http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('ok'); return }
  res.writeHead(404); res.end();
}).listen(process.env.PORT, '127.0.0.1');
"#,
    )
    .unwrap();

    let paths = AppPaths {
        node,
        server_js,
        // No Postgres in this test; the supervisor must cope with it absent
        // rather than refusing to boot.
        pg_bin: dir.join("no-postgres-here"),
        data_dir: dir.clone(),
        // No migrator in this test: the supervisor must cope with it absent
        // rather than refusing to boot.
        bundle_root: None,
    };

    let mut supervisor =
        Supervisor::start(&paths, Duration::from_secs(30)).expect("should boot the stub server");

    let port = supervisor.port();
    assert!(supervisor.url().contains(&port.to_string()));

    // It is genuinely serving.
    assert!(wait_for_health(port, "/api/health", Duration::from_secs(5)).is_ok());

    supervisor.shutdown();

    // And genuinely stopped: an orphaned server would hold the port and the
    // next launch would fail on something nothing appears to own.
    thread::sleep(Duration::from_millis(500));
    assert!(
        TcpListener::bind(("127.0.0.1", port)).is_ok(),
        "port {port} still held after shutdown — the child was orphaned"
    );

    // Shutting down twice must not panic; drop will call it again.
    supervisor.shutdown();
}

fn which_node() -> Option<PathBuf> {
    let output: Child = Command::new("sh")
        .args(["-c", "command -v node"])
        .stdout(Stdio::piped())
        .spawn()
        .ok()?;

    let out = output.wait_with_output().ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();

    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}
