# Agents.md — AI Agent Instructions for InvolveX Dev Worker

This file provides comprehensive guidance for AI agents (Claude Code, Gemini, Copilot, or similar) working in this repository.

---

## 1. Useful Commands

### Installation

```bash
# Preferred (uses Bun)
bun install

# Alternatives (if Bun not available)
npm ci
pnpm install
```

### Development

```bash
# Start frontend + SSR dev server
npm run dev

# Preview the built app locally
npm run preview
```

### Building & Deployment

```bash
# Build server + client artifacts
npm run build

# Deploy main worker (builds first)
npm run deploy

# Deploy specialized image worker
npm run image-worker:deploy
```

### Quality Assurance

```bash
# Run prebuild (format + lint fix + typecheck)
npm run prebuild
# Or run individually:
npm run format
npm run lint:fix
npm run typecheck

# Format code only
npm run format

# Check formatting without fixing
npm run format:check

# Lint only
npm run lint
npm run lint:fix

# Type checking + type generation
npm run typecheck
npm run cf-typegen  # Generate Cloudflare binding types
```

### Testing

```bash
# Run a single test file (if using Vitest)
npx vitest path/to/file.test.ts

# Run specific test
npx vitest -t "partial test name" path/to/file.test.ts
```

### Cloudflare Workers

```bash
# Local worker dev server (for url-shortener or other workers)
wrangler dev

# Publish worker to Cloudflare
wrangler deploy
```

---

## 2. Technologies

### Core Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (D1, KV, AI, Assets)
- **Backend**: [Hono](https://hono.dev/) — lightweight web framework for edge
- **Frontend**: [React Router 7](https://reactrouter.com/) — file-based routing + SSR
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (Radix UI primitives)
- **Build Tool**: [Vite](https://vitejs.dev/) with Cloudflare Vite plugin

### Development Tools

- **Package Manager**: Bun (preferred) or npm/pnpm
- **CLI**: [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — Workers deployment
- **Language**: TypeScript
- **Code Quality**: ESLint, Prettier

### Platform Bindings

| Binding | Purpose                                                     |
| ------- | ----------------------------------------------------------- |
| `DB`    | D1 database (sessions, users)                               |
| `KV`    | Key-value storage (for url-shortener subproject)            |
| `AI`    | Cloudflare Workers AI (image generation, chat, translation) |

### AI Models Used

- Image: `@cf/stabilityai/stable-diffusion-xl-base-1.0`
- Chat: `@cf/meta/llama-3-8b-instruct`
- Translation: `@cf/meta/m2m100-1.2b`
- Summarization: `@cf/meta/bart-large-cnn`

---

## 3. Best Practices

### Cloudflare Workers

- Always regenerate types after changing bindings: `npm run cf-typegen`
- Use prepared D1 queries: `c.env.DB.prepare(...).bind(...).first()` / `.run()`
- Enable streaming for better performance on large responses
- Avoid floating promises — always await or handle rejections
- Do not use global mutable state (breaks across invocations)

### React & Frontend

- Use React Router file-based routing in `app/routes/`
- Keep UI components in `app/components/`
- Use Tailwind utility classes for styling
- Follow shadcn/ui patterns for component structure

### API Design

- Prefix all API endpoints with `/api/` in `workers/app.ts`
- Use Hono middleware for auth (`requireAuth`)
- Return consistent JSON response structures
- Handle errors gracefully with appropriate HTTP status codes

### Authentication

- Session cookie: `session_id` (HttpOnly, Secure, SameSite=Strict, maxAge 24h)
- Store sessions in D1 `sessions` table
- Use Cloudflare Turnstile for bot protection
- Support GitHub OAuth for social login

### Database & Schema

- Keep `schema.sql` in sync with actual D1 migrations
- Use migrations for schema changes: `wrangler d1 execute DB --file=./schema.sql`

### TypeScript

- Run `npm run typecheck` before committing
- Use strict typing — avoid `any`
- Generate Cloudflare types with `wrangler types`

---

## 4. Guidelines

### Before Making Edits

1. Check `.claude/skills/` for project-specific guidance
2. Review `.github/copilot-instructions.md` for architectural details
3. Inspect key files:
   - `workers/app.ts` — main worker entry + API routes
   - `workers/image-generator.ts` — image-only worker
   - `wrangler.jsonc` — Cloudflare bindings configuration
   - `schema.sql` — D1 database schema
   - `package.json` — scripts and dependencies
   - `react-router.config.ts` — frontend routing config

### After Changing Bindings

Run type generation to update TypeScript types:

```bash
npm run cf-typegen
npm run typecheck
```

### Environment Variables

- Local development: use `.dev.vars` file
- Production secrets: use `wrangler secret put <name>`
- Required secrets: `TURNSTILE_SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT`

### Scripts Usage

Many scripts use `bun run ...`. Either:

- Have Bun installed and use `bun run <script>`
- Run the underlying npm command directly: `npm run <script>`

### Testing

- Use `vitest` with `@cloudflare/vitest-pool-workers` for Worker integration tests
- See `.claude/skills/` for testing patterns and configurations

### Deployment

- Main worker: `npm run deploy` (builds + wrangler deploy)
- Image worker: `npm run image-worker:deploy`
- Always build before deploying to ensure SSR bundle is up-to-date

### Subprojects

- `url-shortener/` — standalone worker with its own wrangler.toml and KV bindings
- Treat subprojects as independent workers for dev/deploy purposes
- Check subproject README for specific instructions

---

## 5. Architecture Overview

### Directory Structure

```
.
├── app/                    # React Router frontend (routes, components)
├── public/                 # Static assets
├── workers/
│   ├── app.ts            # Main worker entry (Hono API + SSR)
│   └── image-generator.ts # Secondary image worker
├── url-shortener/         # Subproject (standalone worker)
├── schema.sql            # D1 database schema
├── wrangler.jsonc        # Cloudflare bindings & config
└── package.json          # Workspace scripts
```

### High-Level Flow

1. Request hits Cloudflare Worker (`workers/app.ts`)
2. Hono routes API requests (`/api/*`) to handlers
3. Non-API requests go to React Router SSR (`GET *`)
4. SSR renders React app using `virtual:react-router/server-build`
5. Response streamed back to client

---

## 6. Verification Checklist

Before considering work complete:

- [ ] Dependencies installed (`bun install` or `npm ci`)
- [ ] Dev server runs without errors (`npm run dev`)
- [ ] Build succeeds (`npm run build` then `npm run preview`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] No lint errors (`npm run lint`)
- [ ] Format applied (`npm run format`)

---

For more details, see:

- `README.md` — project overview
- `CLAUDE.md` — Claude Code specific guidance
- `GEMINI.md` — Gemini specific guidance
- `.github/copilot-instructions.md` — Copilot specific guidance
- `.claude/skills/` — Project-specific automation and testing skills
