# Monitoring and Observability

## Monitoring Stack

- **Frontend Monitoring:** Vercel Analytics (Core Web Vitals) — sin configuración adicional, incluido en el plan de Vercel
- **Backend Monitoring:** Vercel Function Logs (Server Actions) + métricas de base de datos del dashboard de Supabase (latencia de queries, conexiones activas)
- **Error Tracking:** Sentry (cliente + servidor), correlacionado por `requestId` (ver Error Handling Strategy) — captura excepciones de Server Actions y errores no controlados de React
- **Performance Monitoring:** Vercel Analytics (frontend) + tiempos de query lentas visibles en el dashboard de Supabase (sin APM dedicado en el MVP)

## Key Metrics

**Frontend Metrics:**
- Core Web Vitals (LCP, CLS, INP)
- Errores de JavaScript no capturados (Sentry)
- Tiempo de respuesta percibido de Server Actions (desde el click hasta la confirmación en UI)
- Interacciones de usuario en formularios de carga rápida (abandono de formulario, si se instrumenta en Fase 2)

**Backend Metrics:**
- Tasa de error por Server Action (agrupado por `code` de `ApiError`)
- Tiempo de respuesta p50/p95 por Server Action
- Performance de queries de Postgres (vía dashboard de Supabase) — foco en las queries de agregación de indicadores y los índices `(negocio_id, fecha)`
- Conteo de rechazos de RLS (si Supabase expone logs de policy — sirve como señal temprana de un bug de contexto, ver Security)

---
