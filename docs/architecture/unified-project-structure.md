# Unified Project Structure

```text
sistema-control-financiero/
├── .github/
│   └── workflows/
│       ├── ci.yaml                 # lint + typecheck + unit + integration + e2e
├── apps/
│   └── web/                        # única app desplegada
│       ├── src/
│       │   ├── app/                # rutas App Router (ver Frontend Architecture)
│       │   ├── actions/            # Server Actions (ver Backend Architecture)
│       │   ├── components/
│       │   ├── stores/
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── middleware.ts
│       ├── tests/                  # unit/component (Vitest + RTL)
│       ├── e2e/                    # Playwright
│       └── package.json
├── packages/
│   ├── domain/                     # lógica pura: indicadores, conversión moneda, schemas Zod, tipos
│   │   ├── src/
│   │   │   ├── indicadores/
│   │   │   ├── moneda/
│   │   │   ├── schemas/
│   │   │   └── types/
│   │   ├── tests/                  # mayor densidad de tests del monorepo (Story 5.1, riesgo alto)
│   │   └── package.json
│   └── database/                   # Prisma schema + cliente + withRlsContext
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       │   └── rls-context.ts
│       ├── tests/                  # integration tests contra Postgres real (aislamiento)
│       └── package.json
├── docs/
│   ├── brief.md
│   ├── prd.md
│   └── architecture.md             # este documento
├── .env.example
├── package.json                    # workspaces: ["apps/*", "packages/*"]
├── tsconfig.base.json
└── README.md
```

---
