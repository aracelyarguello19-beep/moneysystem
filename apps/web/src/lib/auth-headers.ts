// Nombres de header compartidos entre `middleware.ts` (quien los fija, tras
// verificar la sesión una sola vez por navegación) y `lib/auth.ts` (quien los
// lee) — un solo lugar para el nombre evita que se desincronicen entre sí.
export const ACCOUNT_ID_HEADER = "x-account-id";
export const ACCOUNT_EMAIL_HEADER = "x-account-email";
