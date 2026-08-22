# Driver App

Separate driver and courier-facing Next.js app for the SupplySure OS core platform.

Local dev:

```bash
npm run dev:driver
```

The driver app connects to the core platform through `CORE_APP_URL`, proxied server-side so it can run on a different subdomain without browser CORS issues.
