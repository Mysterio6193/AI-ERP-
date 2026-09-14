//! Booting the bundled stack for the desktop app.
//!
//! A desktop install is not a thin client: it carries its own Postgres and its
//! own Next.js server, and must come up on a laptop with no network at all.
//! That makes the boot sequence the riskiest part of the whole desktop build,
//! so it lives here — in a crate with no GUI dependency — where it can be
//! compiled and run on any machine, including CI, without a display.
//!
//! The window is the easy part and wraps this.
//!
//! Ordering matters and is not obvious:
//!
//!   - Postgres must be accepting connections before the server starts, or the
//!     first request races the database and the user sees a boot error on a
//!     perfectly healthy install.
//!   - Shutdown runs in reverse. Killing Postgres first leaves the server
//!     writing into a closed socket and can leave the cluster needing
//!     recovery on the next launch.
//!   - Both are killed on drop, so a panic in the GUI cannot orphan a Postgres
//!     holding the data directory lock — the next launch would then fail with
//!     an error the user cannot act on.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Where the bundled pieces live inside the installed app.
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// Bundled Node runtime. The user is not required to have Node installed.
    pub node: PathBuf,
    /// `server.js` from the Next standalone build.
    pub server_js: PathBuf,
    /// Directory holding `initdb`, `pg_ctl` and `postgres`.
    pub pg_bin: PathBuf,
    /// Per-user writable data directory — never inside the app bundle, which
    /// is read-only on macOS and under Program Files on Windows.
    pub data_dir: PathBuf,
    /// Bundle root holding `prisma/` and `migrator/node_modules`. When absent,
    /// migrations are skipped — useful in tests, fatal for a real install.
    pub bundle_root: Option<PathBuf>,
}

#[derive(Debug)]
pub enum BootError {
    Io(std::io::Error),
    /// A bundled file is missing. Names the path, because "failed to start" on
    /// a customer's machine with no further detail is unactionable.
    Missing(PathBuf),
    /// Came up but never reported healthy inside the timeout.
    Timeout { seconds: u64, last: String },
    Postgres(String),
    /// The schema could not be brought up to date. Fatal: the app would
    /// otherwise open onto a database with no tables in it.
    Migration(String),
}

impl std::fmt::Display for BootError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BootError::Io(error) => write!(f, "{error}"),
            BootError::Missing(path) => {
                write!(f, "bundled file missing: {}", path.display())
            }
            BootError::Timeout { seconds, last } => {
                write!(f, "server did not become healthy within {seconds}s (last: {last})")
            }
            BootError::Postgres(message) => write!(f, "postgres: {message}"),
            BootError::Migration(message) => write!(f, "database migration failed: {message}"),
        }
    }
}

impl std::error::Error for BootError {}

impl From<std::io::Error> for BootError {
    fn from(error: std::io::Error) -> Self {
        BootError::Io(error)
    }
}

/// Asks the OS for a free port by binding to 0 and reading back what it gave.
///
/// A fixed port would collide with anything else the user runs, and with a
/// second copy of this app. There is an unavoidable race between releasing the
/// port here and the child binding it; on a desktop machine that window is
/// microseconds and the alternative — holding the socket and passing the fd
/// through three platforms' process APIs — is far more fragile.
pub fn free_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

/// Polls an HTTP endpoint until it answers, or the timeout expires.
///
/// Deliberately a raw socket rather than an HTTP client: this needs to run
/// before anything else is up, on three platforms, inside a signed bundle. The
/// only question is whether the server answers, and a 200 line is enough to
/// tell.
pub fn wait_for_health(port: u16, path: &str, timeout: Duration) -> Result<(), BootError> {
    let deadline = Instant::now() + timeout;
    let address: SocketAddr = ([127, 0, 0, 1], port).into();
    let mut last = String::from("no connection yet");

    while Instant::now() < deadline {
        match probe(address, path) {
            Ok(true) => return Ok(()),
            Ok(false) => last = String::from("connected, not ready"),
            Err(error) => last = error.to_string(),
        }

        sleep(Duration::from_millis(250));
    }

    Err(BootError::Timeout {
        seconds: timeout.as_secs(),
        last,
    })
}

fn probe(address: SocketAddr, path: &str) -> std::io::Result<bool> {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(500))?;
    stream.set_read_timeout(Some(Duration::from_millis(1500)))?;
    stream.set_write_timeout(Some(Duration::from_millis(1500)))?;

    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    )?;
    stream.flush()?;

    let mut response = String::new();
    // Read only what is needed to see the status line. The body may be large
    // and is irrelevant.
    let mut buffer = [0u8; 256];
    let read = stream.read(&mut buffer)?;
    response.push_str(&String::from_utf8_lossy(&buffer[..read]));

    Ok(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
}

/// A running stack. Dropping it stops everything.
pub struct Supervisor {
    postgres_started: bool,
    pg_bin: PathBuf,
    data_dir: PathBuf,
    server: Option<Child>,
    port: u16,
}

impl Supervisor {
    /// The port the app window should point at.
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Boots Postgres, then the server, and returns once the server is healthy.
    pub fn start(paths: &AppPaths, timeout: Duration) -> Result<Self, BootError> {
        for required in [&paths.node, &paths.server_js] {
            if !required.exists() {
                return Err(BootError::Missing(required.clone()));
            }
        }

        std::fs::create_dir_all(&paths.data_dir)?;

        let cluster = paths.data_dir.join("pgdata");
        let pg_port = free_port()?;
        let mut started_postgres = false;

        if paths.pg_bin.exists() {
            start_postgres(&paths.pg_bin, &cluster, pg_port)?;
            started_postgres = true;
        }

        let port = free_port()?;

        let database_url = format!(
            "postgresql://postgres:postgres@127.0.0.1:{pg_port}/supplysure?schema=public"
        );

        // Before the server, never after. Starting first would open a window
        // onto a database with no tables and fail every page — and `migrate
        // deploy` only applies what has not run, so this is cheap on every
        // launch after the first.
        if let Some(root) = &paths.bundle_root {
            run_migrations(&paths.node, root, &database_url)?;
        }

        let server = Command::new(&paths.node)
            .arg(&paths.server_js)
            .env("PORT", port.to_string())
            .env("HOSTNAME", "127.0.0.1")
            .env("NODE_ENV", "production")
            .env("DATABASE_URL", &database_url)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;

        let mut supervisor = Supervisor {
            postgres_started: started_postgres,
            pg_bin: paths.pg_bin.clone(),
            data_dir: cluster,
            server: Some(server),
            port,
        };

        match wait_for_health(port, "/api/health", timeout) {
            Ok(()) => Ok(supervisor),
            Err(error) => {
                // Tear down before reporting. Leaving a half-booted stack
                // running would make the next launch fail on a port or lock
                // that nothing appears to hold.
                supervisor.shutdown();
                Err(error)
            }
        }
    }

    /// Stops the server, then Postgres. Safe to call more than once.
    pub fn shutdown(&mut self) {
        if let Some(mut server) = self.server.take() {
            let _ = server.kill();
            // Reap it, or it lingers as a zombie for the life of the app.
            let _ = server.wait();
        }

        if self.postgres_started {
            let _ = Command::new(self.pg_bin.join(pg_ctl_name()))
                .args(["-D", &self.data_dir.to_string_lossy(), "stop", "-m", "fast"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();

            self.postgres_started = false;
        }
    }
}

impl Drop for Supervisor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn pg_ctl_name() -> &'static str {
    if cfg!(windows) {
        "pg_ctl.exe"
    } else {
        "pg_ctl"
    }
}

fn exe(bin: &Path, name: &str) -> PathBuf {
    if cfg!(windows) {
        bin.join(format!("{name}.exe"))
    } else {
        bin.join(name)
    }
}

/// Initialises the cluster on first launch, then starts it.
///
/// `initdb` is only run when there is no `PG_VERSION`, so a second launch
/// reuses the customer's data rather than quietly starting an empty database
/// beside it.
fn start_postgres(pg_bin: &Path, cluster: &Path, port: u16) -> Result<(), BootError> {
    let fresh = !cluster.join("PG_VERSION").exists();

    if fresh {
        std::fs::create_dir_all(cluster)?;

        let password_file = cluster.parent().unwrap_or(cluster).join(".pgpass-init");
        std::fs::write(&password_file, "postgres")?;

        let status = Command::new(exe(pg_bin, "initdb"))
            .args([
                "-D",
                &cluster.to_string_lossy(),
                "-U",
                "postgres",
                "--auth=trust",
                "--pwfile",
                &password_file.to_string_lossy(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;

        let _ = std::fs::remove_file(&password_file);

        if !status.success() {
            return Err(BootError::Postgres(format!(
                "initdb failed ({status}) for {}",
                cluster.display()
            )));
        }
    }

    // Create the application database before the server can ask for it.
    //
    // initdb leaves a cluster holding only `postgres` and the templates, so
    // without this every connection fails with `database "supplysure" does not
    // exist` — the server boots, serves pages, and every request 500s.
    //
    // Single-user mode is used because the bundle ships only initdb, pg_ctl
    // and postgres: there is no createdb or psql to call, and adding a
    // Postgres client crate to reach the socket would drag a dependency tree
    // into a binary that has to build inside three signing pipelines.
    if fresh {
        create_database(pg_bin, cluster, "supplysure")?;
    }

    let status = Command::new(exe(pg_bin, "pg_ctl"))
        .args([
            "-D",
            &cluster.to_string_lossy(),
            "-o",
            &format!("-p {port} -k \"\" -h 127.0.0.1"),
            "-l",
            &cluster.join("postgres.log").to_string_lossy(),
            "-w",
            "start",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;

    if !status.success() {
        return Err(BootError::Postgres(format!(
            "pg_ctl start failed ({status}); see {}",
            cluster.join("postgres.log").display()
        )));
    }

    Ok(())
}

/// Creates a database using single-user mode, with the server stopped.
///
/// `postgres --single` runs the backend directly against the data directory
/// and reads SQL from stdin, which is the only way to do this with the three
/// binaries the bundle carries.
fn create_database(pg_bin: &Path, cluster: &Path, name: &str) -> Result<(), BootError> {
    let mut child = Command::new(exe(pg_bin, "postgres"))
        .args(["--single", "-D", &cluster.to_string_lossy(), "postgres"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;

    if let Some(stdin) = child.stdin.as_mut() {
        writeln!(stdin, "CREATE DATABASE {name};")?;
    }

    // Dropping stdin closes it, which is how single-user mode knows to exit.
    drop(child.stdin.take());

    let output = child.wait_with_output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Already existing is success, not failure: a cluster restored from a
        // backup has the database and must not be refused on next launch.
        if !stderr.contains("already exists") {
            return Err(BootError::Postgres(format!(
                "could not create database {name}: {}",
                stderr.trim()
            )));
        }
    }

    Ok(())
}

/// Applies pending migrations with the bundled Prisma CLI.
///
/// `migrate deploy` rather than `migrate dev`: deploy only applies migrations
/// that already exist and never generates or resets anything, which is the only
/// safe shape for a command running against a customer's own data.
fn run_migrations(node: &Path, bundle_root: &Path, database_url: &str) -> Result<(), BootError> {
    let cli = bundle_root
        .join("migrator")
        .join("node_modules")
        .join("prisma")
        .join("build")
        .join("index.js");

    let schema = bundle_root.join("prisma").join("schema.prisma");

    if !cli.exists() || !schema.exists() {
        return Err(BootError::Migration(format!(
            "bundle is missing the migrator ({} / {})",
            cli.display(),
            schema.display()
        )));
    }

    let output = Command::new(node)
        .arg(&cli)
        .args(["migrate", "deploy", "--schema"])
        .arg(&schema)
        .env("DATABASE_URL", database_url)
        // Prisma phones home for version checks; a desktop install may have no
        // network at all, and waiting on that would delay every launch.
        .env("CHECKPOINT_DISABLE", "1")
        .output()?;

    if !output.status.success() {
        return Err(BootError::Migration(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(())
}
