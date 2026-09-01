import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// Los tests de `tests/` corren contra Postgres real (Story 1.3 / 1.5): el
// mecanismo que verifican (RLS) vive en Postgres, no en el código, así que un
// Prisma mockeado pasaría trivialmente aunque las policies estuvieran mal
// escritas o ausentes. Prisma lee `DATABASE_URL` de `process.env`, y el `.env`
// de este paquete solo lo carga el CLI de Prisma — no el runtime. Se carga acá
// a mano (sin agregar `dotenv` como dependencia) y sin pisar nada que el
// entorno de CI ya haya definido.
// [Source: architecture/testing-strategy.md#Test Organization]
const envFile = path.join(here, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Los tests de aislamiento comparten un proyecto Postgres real; correrlos
    // en paralelo haría que el setup/teardown de un archivo pise los fixtures
    // del otro.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
