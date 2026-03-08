# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Summary

- Primary stack: TypeScript + React (React Router) frontend, Hono backend running on Cloudflare Workers. Vite is used for local development and build. The repo contains a small workspace with a `url-shortener/` subproject (separate Wrangler config).
- The repo uses Bun in many scripts (`bun run ...`) and includes Wrangler for Cloudflare deployments. There is an existing .claude/ directory with skills and agents containing project-specific guidance—consult those for testing and Cloudflare patterns.

Commands

- Install dependencies (preferred):
  - bun install
- Alternative (if Bun not available):
  - npm ci
  - pnpm install (if you prefer pnpm workspaces)

- Common scripts (run from repository root):
  - npm run dev
    - Starts frontend & SSR dev (maps to: cross-env NODE_ENV=development DEV=true bun run react-router dev)
  - npm run build
    - Builds server and client artifacts (react-router build)
  - npm run prebuild
    - Runs formatting, lint fixes, and typecheck (prebuild chains bun run commands)
  - npm run preview
    - Preview the built app via Vite
  - npm run lint
    - Run ESLint (repo-level linting)
  - npm run lint:fix
    - Fix lint issues automatically
  - npm run format
    - Format code with Prettier
  - npm run typecheck
    - Runs Cloudflare type generation + react-router typegen + tsc -b
  - npm run deploy
    - Build then run `wrangler deploy`
  - npm run cf-typegen
    - Run `wrangler types` to generate Cloudflare types
  - npm run image-worker:deploy
    - Build & deploy the image worker via specific wrangler config

- Cloudflare worker-specific commands:
  - wrangler dev
    - Run a local Cloudflare Worker dev server (useful for testing `url-shortener` or other workers)
  - wrangler publish / wrangler deploy
    - Publish worker to Cloudflare (used by npm run deploy)

- Running tests (repo currently has no top-level `test` script):
  - If you add Vitest-based tests, run a single file or test by using:
    - npx vitest path/to/file.test.ts
    - npx vitest -t "partial test name" path/to/file.test.ts
  - Otherwise follow patterns in .claude/skills for Worker integration testing with `@cloudflare/vitest-pool-workers`.

High-level architecture

- Root: repository root contains package.json (workspace) and top-level tooling (tsconfig.json, .github, .claude). The package.json defines scripts that use Bun and Wrangler.
- Frontend: React + React Router routes live under app/ (file-based routes). Vite handles bundling and the Cloudflare Vite plugin integrates the build with Workers.
- Backend / Edge: Hono-based APIs and SSR handler run in Cloudflare Workers (entry points described in README and .github/copilot-instructions.md). Worker-specific configuration exists under wrangler.toml and image-worker.wrangler.json.
- Subprojects: url-shortener/ — a workspace package with its own wrangler.toml and worker entry. Treat subprojects as independent workers for dev/deploy purposes.
- Types & tooling: Type generation uses Wrangler (`wrangler types`) and react-router typegen. Type checking is performed with `tsc -b`.

Important files and directories

- package.json (root): central scripts and workspace declaration (workspaces: ["url-shortener"]). See scripts section for exact commands.
- README.md: project overview and tech stack — consult it for runtime expectations and architecture notes.
- url-shortener/wrangler.toml: configuration for the url-shortener worker (KV bindings, dev settings).
- .github/copilot-instructions.md: repository-specific assistant guidance — Claude Code should read this when making edits to workers, routes, or deployment scripts.
- .claude/: contains skills and agents with project-specific automation and testing guidance. Consult it before making major changes.
- tsconfig.json: TypeScript configuration (root-level)
- workers/ or app/ (where present): Worker entry points and server-side routing code. See README and .github/copilot-instructions.md for canonical locations (`workers/app.ts`).

How to run a single test (examples)

- With Vitest (recommended for Workers integration tests):
  - npx vitest path/to/file.test.ts
  - npx vitest -t "partial test name" path/to/file.test.ts
- If you add a top-level npm script later, run `npm run test -- path/to/file.test.ts` or similar as defined in package.json.

Notes for Claude Code

- Always check .claude/ and .github/copilot-instructions.md before changing Worker entrypoints, bindings (wrangler.jsonc / wrangler.toml), or types — they contain embedded guidance for Cloudflare bindings, D1 schema, and AI usage.
- Scripts often use `bun run ...`. Prefer Bun in CLAUDE.md and when running scripts locally, but fall back to `npm run <script>` if Bun is not installed.
- When editing Cloudflare-related files, pay attention to bindings: KV, D1, AI, and schema.sql. Running `npm run cf-typegen` is recommended after changing bindings.
- This file is intentionally concise — consult README.md and .claude/* for deeper operational details.

Verification

- To verify the CLAUDE.md contents locally:
  1. Install deps: `bun install` (or `npm ci`).
  2. Start dev server: `npm run dev` and confirm the app serves locally.
  3. Build: `npm run build` then `npm run preview` to validate the build.
  4. For Workers-specific testing: `wrangler dev` in a worker directory (e.g., `url-shortener`) and confirm the worker routes respond.
  5. Run any Vitest tests with `npx vitest ...` if tests are added.

If you'd like, I can commit this file to the repository or create a PR — how would you like me to proceed?
