# Copilot instructions — involvex/dev (dev worker)

Purpose: Give Copilot sessions focused, repo-specific guidance so suggestions and edits are aligned with how this project is built and deployed.

---

## Quick commands (what exists in package.json)

- Install deps: `npm ci` (or `bun install` if you use Bun).
- Dev (frontend + SSR dev): `npm run dev` (runs `react-router dev`).
- Build (server + client): `npm run build` (runs `react-router build`).
- Prebuild (format + lint fix + typecheck): `npm run prebuild` — note: the script chains `bun run ...` calls; if Bun isn't installed run the steps directly: `npm run format && npm run lint:fix && npm run typecheck`.
- Preview (local preview of built app): `npm run preview`.
- Typegen / Typecheck: `npm run cf-typegen` and `npm run typecheck` (runs Cloudflare `wrangler types`, `react-router typegen`, and `tsc -b`).
- Format: `npm run format`; check only: `npm run format:check`.
- Lint: `npm run lint`; auto-fix: `npm run lint:fix`.
- Deploy (wrangler): `npm run deploy` (builds then runs `wrangler deploy`).
- Image worker deploy: `npm run image-worker:deploy`.
- Wrangler local worker dev: use `wrangler dev` for Cloudflare Worker-specific local testing (see `wrangler.jsonc`).

Notes about tests: there is no top-level `test` script. The repository contains documentation (.claude/skills) referencing Cloudflare testing patterns and `@cloudflare/vitest-pool-workers`. If you add Vitest-based tests, a single test file can be run with e.g.:

- `npx vitest path/to/file.test.ts` or
- `npx vitest -t "partial test name" path/to/file.test.ts`

(Adapt to your chosen test runner; the repository currently does not include a `test` script.)

---

## High-level architecture (big picture)

- This is a full-stack Cloudflare Workers app using Hono for backend APIs and React Router for frontend routing + SSR. The Worker entry is `workers/app.ts` and the server build is imported with `virtual:react-router/server-build` for SSR.

- Frontend: `app/` + `public/` with React Router file-based routes and Shadcn UI components styled with Tailwind CSS (Tailwind v4 via `@tailwindcss/vite`). Vite is used for local dev and bundling.

- Backend / Edge: Cloudflare Worker (`workers/app.ts`) exposes API endpoints under `/api/*` (auth, profile, image generation, AI endpoints) and a catch-all `GET *` that performs SSR via the React Router server build.

- Secondary worker: `workers/image-generator.ts` (image-only worker) with its own wrangler config `image-worker.wrangler.json`.

- Platform bindings (see `wrangler.jsonc`):
  - D1 database binding `DB` (sessions & users; schema in `schema.sql`).
  - KV binding `KV` (used by subprojects like `url-shortener`).
  - AI binding `AI` (used to call hosted models and image generation via `env.AI.run(...)`).
  - Observability is enabled and source maps are uploaded by default.

- Deployment: `wrangler` + Cloudflare Vite plugin. `react-router build` produces server and client artifacts that the Worker serves; `wrangler deploy` publishes to the edge.

---

## Key repo conventions and patterns (what Copilot should know)

- Worker entry points:
  - Primary app: `workers/app.ts` — this file contains Hono routes, auth, D1 interactions, AI calls, and SSR handler.
  - Image worker: `workers/image-generator.ts` — separate deployment (`image-worker.wrangler.json`).

- API & routing:
  - API endpoints live under `/api/*` in `workers/app.ts` (e.g., `/api/login`, `/api/me`, `/api/generate-image`, `/api/ai/*`).
  - SSR is performed by the catch-all `GET *` that uses `createRequestHandler()` with `virtual:react-router/server-build` — when routes change, rebuild the server bundle (`npm run build`).

- Auth & sessions:
  - Session cookie name: `session_id` (HttpOnly, Secure, SameSite=Strict, maxAge 24h).
  - Sessions stored in D1 table `sessions` (see `schema.sql`). Use prepared queries via `c.env.DB.prepare(...).bind(...).first()` / `.run()`.
  - Admin fallback creds use env vars: `ADMIN_USERNAME` and `ADMIN_PASSWORD` if no D1 user found.

- Cloudflare bindings & environment variables (used in code):
  - `DB` — D1 database binding (wrangler.jsonc `d1_databases`).
  - `KV` — KV namespace binding.
  - `AI` — Cloudflare AI binding; examples call `env.AI.run("@cf/stabilityai/..." | "@cf/meta/...")`.
  - App-specific env vars referenced in `workers/app.ts`: `TURNSTILE_SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT`.

- Type generation & checks:
  - Cloudflare type generation is part of `npm run cf-typegen` (wraps `wrangler types`).
  - `npm run typecheck` runs cf type generation + `react-router typegen` + `tsc -b` — run this before PRs that touch bindings or server code.

- SQL & schema:
  - `schema.sql` contains the D1 schema (sessions, users). Keep migrations in sync with this file.

- AI usage patterns:
  - `env.AI.run(modelId, inputs)` is used directly; model identifiers are string literals (e.g., `"@cf/stabilityai/stable-diffusion-xl-base-1.0"`). Treat these as external configuration points when editing inference code.

- Scripts note: several scripts use `bun run <script>` inside package.json. Either have Bun available or run the underlying npm scripts directly (examples shown in the Quick commands section).

- Subprojects: `url-shortener/` is a standalone example with its own README and deployment hints (uses KV and Wrangler workflows). Check its README for KV setup and CI notes.

- Testing guidance (repo hints):
  - The repository includes `.claude/skills` references describing Cloudflare testing and `@cloudflare/vitest-pool-workers`. Adopt `vitest` + `@cloudflare/vitest-pool-workers` for Worker integration tests; look in `.claude/skills/*` for example configs.

---

## Files to inspect when making edits

- `workers/app.ts` — main app: APIs, authentication, SSR.
- `workers/image-generator.ts` and `image-worker.wrangler.json` — image worker.
- `wrangler.jsonc` — Cloudflare bindings and deployment settings.
- `schema.sql` — D1 schema.
- `package.json` — scripts and devDependencies.
- `react-router.config.ts` and `app/` — frontend routing and routes.
- `.claude/skills/` — project-specific guidance for testing and Cloudflare patterns.

---

If anything in this summary should be expanded (more command examples, CI hints, or test run commands), ask and Copilot will update this file.
