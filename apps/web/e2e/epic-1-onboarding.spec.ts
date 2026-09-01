import { expect, test } from "@playwright/test";

// [Source: architecture/testing-strategy.md#E2E Tests]
// Story 1.2 aporta el tramo de registro/login de este spec; Story 1.4 agrega
// "alta de negocio" y "cambio de negocio activo" al final del primer test.
//
// NOTA: corre contra Supabase Auth real (no hay mock de infraestructura para
// e2e) — usa un email único por corrida para no colisionar con cuentas
// previas, y requiere que el proyecto Supabase de destino tenga la
// confirmación de email desactivada (o un modo de test) para que el login
// post-registro funcione sin intervención manual. No se ejecutó contra el
// proyecto Supabase real del usuario en esta implementación para no crear
// usuarios de prueba en su cuenta de producción — ver Story 1.1 Dev Agent
// Record / Story 1.2 Completion Notes.
test("registro y login con credenciales nuevas", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/registro");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /crear cuenta/i }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  await expect(page).toHaveURL(/\/negocios$/);

  // Story 1.4: alta de negocio y cambio de negocio activo.
  await page.getByLabel(/nombre del negocio/i).fill("Primer negocio");
  await page.getByRole("button", { name: /crear negocio/i }).click();
  await expect(page.getByText("Primer negocio")).toBeVisible();

  await page.getByLabel(/nombre del negocio/i).fill("Segundo negocio");
  await page.getByRole("button", { name: /crear negocio/i }).click();
  await expect(page.getByText("Segundo negocio")).toBeVisible();

  const selectorNegocio = page.getByLabel(/negocio activo/i);
  await selectorNegocio.selectOption({ label: "Segundo negocio" });
  await expect(selectorNegocio.locator("option:checked")).toHaveText("Segundo negocio");
});

test("credenciales inválidas muestran un mensaje genérico (AC4)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("no-existe@example.com");
  await page.getByLabel(/contraseña/i).fill("cualquier-cosa");
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  await expect(page.getByRole("alert")).toHaveText("Credenciales inválidas.");
});
