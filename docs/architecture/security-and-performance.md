# Security and Performance

## Security Requirements

**Frontend Security:**
- CSP Headers: `default-src 'self'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';` configurado en `next.config.ts`
- XSS Prevention: React escapa por defecto; no se usa `dangerouslySetInnerHTML` en ningún componente que renderice datos de usuario (montos, nombres de cliente/proveedor son siempre texto plano)
- Secure Storage: la sesión vive en **cookies httpOnly** gestionadas por `@supabase/ssr` — nunca en `localStorage` (evita robo de token vía XSS). Zustand solo persiste preferencias de UI no sensibles (negocio activo).

**Backend Security:**
- Input Validation: todo input de Server Action se valida con Zod (`packages/domain/schemas`) antes de tocar la base de datos — nunca se confía en la validación del formulario del cliente como única barrera.
- Rate Limiting: límite básico por IP en `signIn`/`signUp` (Supabase Auth ya aplica throttling propio; se documenta como capa adicional a evaluar si se detecta abuso, no bloqueante para el MVP).
- CORS Policy: N/A para Server Actions (mismo origen por diseño); el proyecto de Supabase restringe `Site URL`/`Redirect URLs` a los dominios de Vercel del proyecto.

**Authentication Security:**
- Token Storage: cookies httpOnly + `SameSite=Lax` (default de `@supabase/ssr`)
- Session Management: refresco automático de token gestionado por el middleware en cada request
- Password Policy: mínimo de Supabase Auth (8 caracteres) + se habilita la protección de contraseñas filtradas (HaveIBeenPwned) disponible en el dashboard de Supabase Auth, sin costo adicional

**Aislamiento de datos (NFR1/NFR2) — ver Database Schema:** es la garantía de seguridad más importante del sistema y está resuelta a nivel de Postgres (RLS), no de código de aplicación — la defensa en profundidad en `withRlsContext` (verificación de `negocio.cuentaId === cuentaId` en TypeScript) es una segunda capa, no la única.

## Performance Optimization

**Frontend Performance:**
- Bundle Size Target: <200KB JS inicial por ruta (medido con `next build` output) — se logra por defecto al usar RSC para todo lo que no requiere interactividad (dashboards, listados) y reservar Client Components para formularios
- Loading Strategy: streaming de RSC con `Suspense` en dashboards (los indicadores del negocio activo pueden tardar más que la navegación básica); code-splitting automático por ruta de Next.js
- Caching Strategy: React Query con `staleTime: 30s` para datos que cambian con la actividad del usuario; RSC cacheados por Next.js donde no dependen de datos que mutan en el mismo request

**Backend Performance:**
- Response Time Target: p95 < 300ms para operaciones CRUD individuales (compra/venta/gasto) — soporta NFR10 (registrar una transacción en menos de 1 minuto de punta a punta incluyendo interacción humana)
- Database Optimization: índices compuestos `(negocio_id, fecha desc)` en todas las tablas transaccionales de alto volumen (`compras`, `ventas`, `gastos`) — son el patrón de consulta dominante (listados y agregación por período); los indicadores se calculan on-read con agregación SQL indexada, no con batch nocturno (requisito literal de NFR4)
- Caching Strategy: sin cache de servidor dedicado en el MVP (ver Tech Stack — Cache); se revisita si el volumen de negocios/transacciones por cuenta crece más allá de lo descrito en el brief

---
