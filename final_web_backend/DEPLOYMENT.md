# Deploy the API to Vercel

This repository contains separate frontend and backend folders. Configure the
Vercel project for the API with **Root Directory** set to `final_web_backend`.
The Express app is exported from `app.ts`, which Vercel detects as the API
entry point. Keep the Vercel project connected to the repository's production
branch and assign `finalwebprojectapi.vercel.app` to that project.

Use the following project settings:

- Framework Preset: Express
- Build Command: `npm run vercel-build`
- Install Command: `npm install`
- Output Directory: leave unset
- Node.js version: 20.x or newer

Add these environment variables in the Vercel project settings for Production
and Preview as needed:

```text
DB_HOST=<database host>
DB_PORT=<database port>
DB_USER=<database user>
DB_PASSWORD=<database password>
DB_NAME=<database name>
DB_SSL=true
DB_SSL_VERIFY=false
```

Deploy the Production environment, then check `/`, `/health`, and
`/api/customer`. The root route should return the API name; `/health` should
return `{ "ok": true, "database": "mysql" }`.

Do not commit `.env` or paste database credentials into source files. The
local `.env.example` file lists the required variable names.
