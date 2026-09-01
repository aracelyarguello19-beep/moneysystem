# Development Workflow

## Local Development Setup

**Prerequisites:**
```bash
node --version   # v20 LTS o superior
npm --version    # v10+
supabase --version  # Supabase CLI, para Postgres local + Auth local vía Docker
docker --version    # requerido por `supabase start`
```

**Initial Setup:**
```bash
git clone <repo>
cd sistema-control-financiero
npm install                          # instala todos los workspaces
supabase start                       # levanta Postgres + Auth local (Docker)
cp .env.example apps/web/.env.local  # completar con credenciales locales de `supabase start`
npm run db:migrate                   # aplica prisma/migrations contra Postgres local
```

**Development Commands:**
```bash
# Start all services
npm run dev                          # Next.js dev server (Turbopack) + Supabase local ya corriendo

# Start frontend only
npm run dev --workspace=apps/web

# Run tests
npm run test                         # Vitest: packages/domain + packages/database + apps/web unit
npm run test:integration             # packages/database contra Postgres local (RLS real)
npm run test:e2e                     # Playwright contra el dev server
```

## Environment Configuration

**Required Environment Variables:**
```bash
# apps/web/.env.local (Frontend — expuestas al cliente, prefijo NEXT_PUBLIC_)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# apps/web/.env.local (Backend — solo servidor, nunca expuestas al cliente)
SUPABASE_SERVICE_ROLE_KEY=           # solo para tareas administrativas puntuales (nunca en el runtime de Server Actions de dominio)
DATABASE_URL=                        # rol app_user (NOBYPASSRLS) — runtime de la app, vía connection pooler
DIRECT_URL=                          # rol owner del schema — SOLO para `prisma migrate deploy` en CI

# Compartidas
SENTRY_DSN=
```

---
