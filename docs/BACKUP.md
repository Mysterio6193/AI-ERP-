# Backing up SupplySure

The whole business is 73MB in `.pgdata`, inside this repo's working directory,
served by a Postgres that lives in `node_modules`. That arrangement is fine for
running the app and is one bad command from losing everything, so this is worth
five minutes of attention before real orders go through it.

## Two things to know first

**There is no `pg_dump` on this machine.** The database is run by
`embedded-postgres`, which ships exactly three binaries — `initdb`, `pg_ctl`,
`postgres`. The usual backup advice does not apply, which is why the scripts
below export through Prisma instead.

**`.pgdata` is inside the working tree.** It is gitignored, so it will not be
committed, but `git clean -xdf` deletes ignored files and would take the
database with it. If you run that, take a backup first.

## Taking one

```bash
npm run backup
```

Writes `backups/supplysure-<timestamp>.ndjson.gz` — every table as
newline-delimited JSON, gzipped, with a manifest of row counts at the end. The
manifest is written last on purpose: if it is there, the backup finished.

Fourteen are kept and older ones are rotated out. `BACKUP_KEEP` changes that.

`backups/` is gitignored. It holds every customer record, so it must stay that
way — and if you copy one elsewhere, that copy is customer data too.

## Proving it works

```bash
npm run backup:verify
```

This is the part that matters, and the part normally skipped. It creates a
scratch database, pushes the current schema, restores the newest backup into it,
compares every table against the manifest, checks the sales totals still add up,
and drops the scratch database again. It never writes to the live one.

It has been tested against two failure modes and catches both: a truncated
backup (no manifest — refused outright) and a backup that silently lost a table
while still claiming it in the manifest (counts disagree).

Run it after any schema change. A restore into a schema that has moved on does
not error — it quietly drops whatever no longer has a column — so the verifier
warns when the schema checksum has changed since the backup was taken.

## Doing it nightly

`launchd`, not `cron` — a user crontab may not run when nobody is logged in.

Save as `~/Library/LaunchAgents/os.supplysure.backup.plist`, with the path
corrected:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>os.supplysure.backup</string>
  <key>WorkingDirectory</key><string>/Users/YOU/webjumbo/supplysure-os</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>npm run backup &amp;&amp; npm run backup:verify</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/tmp/supplysure-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/supplysure-backup.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/os.supplysure.backup.plist
```

Verify runs straight after backup deliberately. A nightly backup nobody checks
is the situation this whole file exists to avoid.

## Getting a copy off the machine

Everything above still leaves one disk holding the only copy. `backups/` is a
directory of small gzipped files, so anything works — a scheduled copy to an
external disk, or to whatever cloud storage the business already pays for.

Two rules. Encrypt it, because it is every customer record. And restore from the
offsite copy once, by hand, to prove the copy is real — the same argument as
above, one step further out.

## Restoring for real

`scripts/verify-backup.ts` already performs a complete restore; recovering for
real means pointing it at a database you intend to keep rather than a scratch
one. Deliberately not a script — restoring over a live database is not something
that should be one command away, and by the time it is needed somebody should be
reading carefully anyway.
