# DOH-BCHD Leave Monitoring - Central Database

Next.js app source for the multi-user leave application system, also deployed live at:
https://doh-bchd-leave-monitoring.vercel.app

## Run locally

```
npm install
npm run dev
```

Then open http://localhost:3000

## Required environment variables (create a .env.local file)

- POSTGRES_URL - connection string for a Postgres database (e.g. from Neon)
- ADMIN_USERNAME - admin login username
- ADMIN_PASSWORD - admin login password
- SESSION_SECRET - any long random string, used to sign the admin session cookie

## Structure

- app/page.tsx - public leave application form (no login required)
- app/admin/login/page.tsx - admin login
- app/admin/page.tsx - admin dashboard (For Approval / Approved / Rejected tabs)
- app/api/applications/route.ts - submit (POST) + list (GET, admin-only)
- app/api/applications/[id]/route.ts - approve/reject (PATCH, admin-only)
- lib/db.ts - Postgres schema (auto-creates the table on first use)
- lib/auth.ts - admin session cookie signing/verification
- middleware.ts - protects /admin pages and the list/approve/reject APIs
