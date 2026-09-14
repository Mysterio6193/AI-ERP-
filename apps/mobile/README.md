# SupplySure OS — mobile

A purpose-built iOS and Android app for drivers and warehouse staff, against
the existing `/api/driver/*` endpoints. Expo + expo-router.

## What is actually built and tested

The part of a field app that loses people's work is the offline path, so that
is where the effort went and it is covered by 15 tests that need no simulator:

| File | What it does |
|---|---|
| `src/lib/queue.ts` | Durable action queue: per-stop ordering, idempotency keys, exponential backoff, retryable vs. refused, nothing dropped silently. |
| `src/lib/client.ts` | Reads go straight out; **writes always go through the queue**. Both the fetch and the session are injected. |
| `src/lib/runtime.ts` | The only module that touches the device. Everything above it is pure. |

```bash
cd apps/mobile && npx vitest run --config vitest.config.mts
```

The tsconfig here deliberately stands alone rather than extending Expo's, so
these tests run with nothing but vitest installed. Making them depend on the
mobile toolchain is the fastest way to have them quietly stop being run.

## Why a queue rather than plain requests

A driver marks a delivery complete in a basement dock with no signal. That tap
has to survive the app closing, the phone dying, and the drive to the next
stop. Four things follow, each with a test:

- **Order is kept per stop.** "Arrived" then "delivered" replayed backwards
  would move a delivery the wrong way.
- **Every action carries a client-generated id**, sent as an idempotency key.
  A reply lost on a flaky connection otherwise becomes a double delivery when
  the retry lands.
- **A refusal is not a retry.** No HTTP status means the request never left and
  is always retried; a 422 means the server understood and said no, so it is
  parked at once instead of burning battery forever.
- **Nothing is discarded.** An action that exhausts its retries stays visible,
  because a delivery that never reached the office is something a person has
  to know about.

## Not verified here

The screens under `app/` have not been run — there is no simulator in this
environment, and an `.ipa` needs Xcode and an Apple Developer account while an
`.aab` needs a Play console. They are written against the tested client and
queue, but treat them as unreviewed until someone has opened them on a device.

```bash
npx expo start           # then press i or a
eas build --platform ios --profile preview
```

Set `EXPO_PUBLIC_API_URL` to the server; it defaults to `http://localhost:3000`.
