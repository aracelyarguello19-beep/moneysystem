# Deployment Architecture

## Deployment Strategy

**Frontend Deployment:**
- **Platform:** Vercel (Git Integration nativo — deploy automático)
- **Build Command:** `npm run build --workspace=apps/web`
- **Output Directory:** `.next` (manejado internamente por el adaptador de Vercel para Next.js)
- **CDN/Edge:** Vercel Edge Network para assets estáticos; funciones (Server Actions/RSC) pineadas a la región `gru1`

**Backend Deployment:**
- **Platform:** el mismo despliegue de Vercel — no hay backend separado (ver "Service Architecture")
- **Build Command:** compartido con el frontend (un único build de Next.js)
- **Deployment Method:** Git push → Vercel construye preview por PR → merge a `main` promueve a producción

**Migraciones de base de datos:** `prisma migrate deploy` corre en un paso dedicado del pipeline de GitHub Actions **antes** de que Vercel promueva el nuevo build a producción — no como parte del build de Next.js (evita condiciones de carrera entre instancias serverless concurrentes ejecutando migraciones).

## CI/CD Pipeline

```yaml
# .github/workflows/ci.yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run db:migrate:test      # aplica migraciones + RLS al Postgres del job
      - run: npm run test                 # unit
      - run: npm run test:integration     # aislamiento cuenta/negocio contra Postgres real
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

  deploy-migrations:
    needs: quality
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run db:migrate:deploy    # DIRECT_URL contra Supabase de producción
        env:
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
    # El deploy de la app en sí lo dispara automáticamente Vercel Git Integration
    # al detectar el push a main — no se orquesta desde este workflow.
```

## Environments

| Environment | Frontend URL | Backend URL | Purpose |
|---|---|---|---|
| Development | `localhost:3000` | (mismo proceso) | Desarrollo local, Supabase local vía Docker |
| Preview | `<branch>-<proyecto>.vercel.app` (por PR) | (mismo proceso) | Revisión de PR contra un branch de Supabase o el mismo proyecto de staging |
| Production | dominio propio (a definir) | (mismo proceso) | Uso real del usuario |

## Jobs Programados

**ADR-001:** `vercel.json` (raíz del repo) declara el cron de cierre de período — ver "Jobs Programados (Cierre de Período)" en Backend Architecture para el detalle del mecanismo:
```json
{
  "crons": [
    { "path": "/api/cron/cierre-periodo", "schedule": "0 6 * * *" }
  ]
}
```
Vercel genera y rota `CRON_SECRET` automáticamente al detectar el bloque `crons` en el proyecto, y lo inyecta como header `Authorization: Bearer <CRON_SECRET>` en cada invocación — no requiere configuración manual del secreto en Vercel, pero el Route Handler debe leerlo desde `process.env.CRON_SECRET` (mismo mecanismo de variables de entorno que el resto de la app) para validarlo. Solo corre en **Production** — los crons de Vercel no se disparan en Preview ni en Development.

---
