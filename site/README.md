# Vexa landing page

Next.js (App Router) exported to plain static HTML — `next build` writes `out/`.
English lives at `/`, Russian at `/ru/`; texts are in `content/{en,ru}.ts` (one `Dict` type keeps them in parity).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export into out/
npm start          # serve out/ locally
```

## What is filled in at build time

`lib/release.ts` asks the GitHub API for the latest published release and takes its version, date and
installer URL (a version-pinned link, so it keeps working after newer releases). “What’s new” is that
version’s section from `../CHANGELOG.md`. Without network access (or with `VEXA_SITE_OFFLINE=1`) it falls back
to `../package.json` and `../CHANGELOG.md`.

A new release therefore shows up on the site after the next rebuild — push to `main` or press
**Deploy** in App Platform after the release workflow has finished.

## Deploying to DigitalOcean App Platform

Create a **Static Site** component from this repository:

| Setting | Value |
| --- | --- |
| Source directory | `site` |
| Build command | `npm ci && npm run build` |
| Output directory | `out` |
| Error document | `404.html` |
| Env (build time, optional) | `SITE_URL=https://your-domain` — enables canonical, hreflang and Open Graph URLs |

Or create the app from the spec: `doctl apps create --spec .do/app.yaml` (it sets `SITE_URL=https://vexacode.ru`).
Optionally add `GITHUB_TOKEN` as a build-time secret if the unauthenticated GitHub API rate limit is ever hit.
