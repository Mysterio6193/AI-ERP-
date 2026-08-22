# Scheduled agents

An agent with `trigger: "schedule"`, a cron expression and a run prompt executes
unattended. Everything else about the run is ordinary: it acts as a real staff
user, so role limits and approval thresholds apply, and anything over the line
becomes an `AgentProposal` for a human instead of happening on its own.

## Wiring the tick

Nothing runs on its own — an external scheduler has to call the tick endpoint.

```
GET|POST /api/cron/agents
```

Call it at least as often as your finest schedule; every 5 minutes is a sensible
default. Calling it more often than necessary is harmless: due-ness comes from
each agent's stored `nextRunAt`, not from when the request arrived.

### Auth

Set a secret and send it as a bearer token:

```bash
CRON_SECRET=$(openssl rand -hex 32)
```

```
Authorization: Bearer $CRON_SECRET
```

A signed-in admin can also call it from the browser, which is how you test it.
If `CRON_SECRET` is unset the endpoint refuses anonymous calls rather than
running open — it tells you to set the variable.

### Self-hosted (this deployment)

Add to the crontab of the host running the app:

```
*/5 * * * * curl -fsS -X POST https://your-host/api/cron/agents -H "Authorization: Bearer $CRON_SECRET" >/dev/null 2>&1
```

Or as a systemd timer if you want the run logged and retried.

### On a platform with managed cron

If this ever moves to a platform with built-in cron (Vercel and similar), point
its scheduler at the same path every 5 minutes and keep the same secret.

## Behaviour worth knowing

- **Adding a schedule never causes an immediate run.** The first tick that sees
  a new schedule records `nextRunAt` and waits for it.
- **Overlapping ticks cannot double-run an agent.** A tick claims a row by
  writing `nextRunAt` forward guarded by the value it read; a second tick that
  read the same value updates nothing and moves on.
- **Times are the server's local time**, not UTC. Check the host's timezone
  before writing `0 8 * * 1-5` and expecting 8am for the business.
- **A bad expression is refused when you save it**, not discovered at 3am. If
  one somehow gets through, the tick disables its `nextRunAt` and records the
  error on the agent.
- **Failures are recorded, not thrown.** `lastRunStatus`, `lastRunError` and
  `lastRunAt` are on the agent and shown in the studio, so a quietly broken
  schedule is visible.
- **A scheduled agent with no run prompt is skipped** rather than run empty.

## Testing one

Use **Run now** in the agent studio (`/settings/agents`). It executes the
identical path, as the same user, without consuming or moving `nextRunAt`.
