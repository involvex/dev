# InvolveX Dev Worker - GEMINI.md

## Project Overview

InvolveX Dev Worker is a comprehensive full-stack platform built on **Cloudflare Workers**. It leverages **Hono** for backend API services, **React Router 7** for frontend routing and SSR, and **shadcn/ui** with **Tailwind CSS 4** for a modern user interface. The project acts as a monorepo containing the main dev worker and a specialized URL shortener.

### Core Capabilities:

- **AI Integration**: Image generation (SDXL), Chat (Llama 3), Translation (m2m100), and Summarization (BART) via Cloudflare AI.
- **Authentication**: Secure login using Cloudflare Turnstile, session management in Cloudflare D1, and GitHub OAuth integration.
- **Database & Storage**: D1 for relational data (users/sessions) and KV for key-value storage.
- **Micro-Workers**: Includes a standalone `image-generator` worker for dedicated image tasks.

---

## Tech Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (D1, KV, AI, Assets)
- **Backend Framework**: [Hono](https://hono.dev/)
- **Frontend Framework**: [React Router 7](https://reactrouter.com/) (SPA mode on Workers)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Development Tooling**: [Vite](https://vitejs.dev/), [Wrangler](https://developers.cloudflare.com/workers/wrangler/), [Bun](https://bun.sh/)
- **Code Quality**: ESLint, Prettier, TypeScript

---

## Directory Structure

- `app/`: React Router frontend application (Routes, Components, UI).
- `workers/`:
  - `app.ts`: Main entry point (Hono API + React Router SSR).
  - `image-generator.ts`: Specialized image generation worker.
- `url-shortener/`: Workspace for the URL shortener micro-service.
- `public/`: Static assets.
- `schema.sql`: D1 database schema for users and sessions.

---

## Building and Running

### Development

```bash
# Start the local development server (Hono + React Router)
bun run dev
```

### Type Checking & Linting

```bash
# Generate Cloudflare bindings types and run TypeScript check
bun run typecheck

# Fix linting issues
bun run lint:fix

# Format code
bun run format
```

### Deployment

```bash
# Deploy the main Dev Worker
bun run deploy

# Deploy the specialized Image Generator worker
bun run image-worker:deploy

# Update Cloudflare Types (after wrangler.jsonc changes)
bun run cf-typegen
```

---

## Development Conventions

### API Architecture

- All API endpoints are handled by Hono in `workers/app.ts` under the `/api/*` prefix.
- Middleware like `requireAuth` is used to protect sensitive endpoints using D1 session validation.

### UI Components

- Components are built using **Radix UI** primitives and styled with **Tailwind CSS**.
- UI-related utilities (like `cn`) are located in `app/lib/utils.ts`.

### Database Workflow

- Schema updates should be applied to `schema.sql`.
- Use `wrangler d1 execute DB --file=./schema.sql` to apply migrations locally or remotely.

### Environment Variables

- Sensitive secrets (Turnstile keys, GitHub secrets, etc.) are managed via `wrangler secret put` or `.dev.vars` for local development.
