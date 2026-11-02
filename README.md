# VMS · Sistema de Gestión de Visitantes

Planta de producción de materias primas textiles · Bogotá
Proyecto Integrador II · Universidad de La Salle

Monorepo con dos aplicaciones:

| Carpeta | Tecnología | Puerto |
|---|---|---|
| `backend/` | NestJS 12 (ESM) · Prisma 7 · PostgreSQL 17 | 3001 |
| `frontend/` | Next.js 16 (App Router) · Tailwind 4 · componentes adaptados de Tailwind Plus (Headless UI + Heroicons) · TanStack Query | 3000 |

El plan completo (historias, APIs, vistas, sprints) está en [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md).

## Requisitos

- Node.js 20 o superior (desarrollado con Node 26)
- Docker Desktop (PostgreSQL y Mailpit corren en contenedores)

## Puesta en marcha

```bash
# 1. Infraestructura: PostgreSQL (5432) y Mailpit (SMTP 1026, UI http://localhost:8026)
npm run infra:up

# 2. Dependencias de ambas apps
npm run install:all

# 3. Variables de entorno del backend
cp .env.example backend/.env
# Edite backend/.env y reemplace los secretos (JWT_SECRET, JWT_QR_SECRET, CRYPTO_KEY, CRYPTO_PEPPER):
#   openssl rand -base64 48   # JWT_SECRET y JWT_QR_SECRET
#   openssl rand -base64 32   # CRYPTO_KEY (32 bytes)
#   openssl rand -base64 24   # CRYPTO_PEPPER

# 4. Variables del frontend
printf 'NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1\n' > frontend/.env.local

# 5. Base de datos: migraciones + datos iniciales
npm run db:migrate
npm run db:seed

# 6. Servidores de desarrollo (en dos terminales)
npm run dev:back     # http://localhost:3001/api/v1  ·  Swagger en http://localhost:3001/api/docs
npm run dev:front    # http://localhost:3000
```

Los usuarios de ejemplo (uno por rol) y su contraseña de desarrollo están en `backend/prisma/seed.ts`.

## Scripts raíz

| Script | Qué hace |
|---|---|
| `npm run infra:up` / `infra:down` / `infra:reset` | Levanta, detiene o reinicia (borrando datos) los contenedores |
| `npm run dev:back` / `dev:front` | Servidores de desarrollo |
| `npm run build:back` / `build:front` | Compilación de producción |
| `npm run lint` | oxlint (backend) + ESLint (frontend) |
| `npm run test` | Pruebas unitarias del backend (Vitest) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Carga usuarios, zonas, preguntas de inducción y configuración |
| `npm run db:studio` | Prisma Studio |

Pruebas end-to-end del backend (requieren la base de datos levantada):

```bash
npm --prefix backend run test:e2e
```

## Estructura

```
backend/
  prisma/schema.prisma        modelo de datos (sección 4 del plan)
  prisma/migrations/          incluye el trigger de inmutabilidad de la bitácora
  prisma/seed.ts              datos iniciales
  src/config/env.ts           validación de variables de entorno (zod)
  src/database/               PrismaService (adaptador pg)
  src/common/                 cifrado AES-256-GCM, guards JWT y de roles, filtro de errores, paginación
  src/eventos/                eventos de dominio (patrón Observador)
  src/modules/<dominio>/      un módulo NestJS por dominio
  src/integraciones/          adaptadores ACS, correo y directorio (Sprint 2)
frontend/
  src/proxy.ts                protección de rutas por rol (Next.js 16)
  src/lib/api.ts              cliente HTTP (cookies httpOnly, errores tipados)
  src/lib/roles.ts            roles, rutas de inicio y navegación por rol
  src/components/ui/          sistema de componentes adaptado de Tailwind Plus (cada archivo cita su sección de origen)
  src/components/layout/      shell con barra lateral (Tailwind Plus · application-shells/sidebar), barra superior pública
  src/services/               llamadas a la API por módulo + claves de TanStack Query
  tailwind_pro/               catálogo Tailwind Plus descargado (licencia por usuario; excluido de git)
  src/app/(auth)/login        L1
  src/app/(publico)/pre-registro/[token]   portal del visitante (V1–V7)
  src/app/(interno)/{anfitrion,recepcion,admin,dpo,seguridad}   paneles por rol
```

## Convenciones

- Backend en **ESM**: los imports relativos llevan extensión `.js` (`./app.module.js`).
- Todo endpoint exige JWT salvo los marcados con `@Public()`; los roles se restringen con `@Roles(...)`.
- Los datos personales de visitantes se guardan cifrados; las búsquedas usan columnas `*Hash`.
- Toda operación relevante publica un evento de dominio; la bitácora lo persiste y nunca se edita.
- Nombres de código, rutas y textos de interfaz en español.
