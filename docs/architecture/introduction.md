# Introduction

Este documento define la arquitectura fullstack completa para el Sistema de Control Financiero: backend, frontend y su integración, como fuente única de verdad para el desarrollo dirigido por agentes de IA (@dev). Unifica lo que tradicionalmente serían un documento de arquitectura backend y uno frontend separados, porque en este proyecto —una única aplicación Next.js con Server Actions— ambas capas están intrínsecamente entrelazadas.

**Documentos de entrada revisados:**
- `docs/prd.md` (v2.3) — 36 Requisitos Funcionales, 11 No Funcionales, 6 Epics, 26 historias. Marcado **READY FOR ARCHITECT**.
- `docs/brief.md` — Project Brief con terminología financiera y mockup de referencia ("Panorama Multi-Moneda").

No existe `docs/front-end-spec.md` todavía (el PRD delega el flujo detallado de UX a `@ux-design-expert`, ejecutado en paralelo/después de esta arquitectura). Donde el PRD deja una decisión técnica abierta, este documento la cierra explícitamente con su razonamiento — no se dejan huecos para @dev.

## Starter Template or Existing Project

**N/A — Proyecto Greenfield.** No hay repositorio git inicializado, no hay starter template ni codebase previo. El PRD fija el preset técnico activo del framework AIOX como punto de partida (`nextjs-react`: Next.js, React, TypeScript, Tailwind, Zustand, React Query), sujeto a validación de este documento. Se valida y se adopta como base (ver Tech Stack), sin usar un starter de terceros (T3, create-t3-app, etc.) — el modelo de datos multi-negocio y el patrón de aislamiento RLS compuesto son suficientemente específicos como para no beneficiarse de un starter genérico, y evitar sus configuraciones/opiniones no solicitadas.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 1.0 | Arquitectura inicial generada a partir de `docs/prd.md` v2.3 (modo YOLO/autónomo, decisiones técnicas cerradas por @architect con justificación registrada) | Aria (@architect) |

---
