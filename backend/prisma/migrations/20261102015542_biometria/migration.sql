-- CreateEnum
CREATE TYPE "MetodoId" AS ENUM ('HUELLA', 'CREDENCIAL_ALTERNATIVA', 'MANUAL_CONTINGENCIA');

-- CreateEnum
CREATE TYPE "Dedo" AS ENUM ('PULGAR_D', 'INDICE_D', 'MEDIO_D', 'ANULAR_D', 'MENIQUE_D', 'PULGAR_I', 'INDICE_I', 'MEDIO_I', 'ANULAR_I', 'MENIQUE_I');

-- CreateEnum
CREATE TYPE "TipoTerminal" AS ENUM ('ENTRADA', 'SALIDA', 'ZONA');

-- CreateEnum
CREATE TYPE "EstadoAutorizacionTerminal" AS ENUM ('PENDIENTE', 'CARGADA', 'REVOCADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "ResultadoCotejo" AS ENUM ('COINCIDE', 'NO_COINCIDE', 'CALIDAD_BAJA', 'PRUEBA_VIDA_FALLIDA');

-- AlterEnum
ALTER TYPE "NombreIndicador" ADD VALUE 'TASA_RECHAZO_BIOMETRICO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEvento" ADD VALUE 'HUELLA_ENROLADA';
ALTER TYPE "TipoEvento" ADD VALUE 'COTEJO_EXITOSO';
ALTER TYPE "TipoEvento" ADD VALUE 'COTEJO_FALLIDO';
ALTER TYPE "TipoEvento" ADD VALUE 'PRUEBA_VIDA_FALLIDA';
ALTER TYPE "TipoEvento" ADD VALUE 'PLANTILLA_CARGADA';
ALTER TYPE "TipoEvento" ADD VALUE 'PLANTILLA_REVOCADA';
ALTER TYPE "TipoEvento" ADD VALUE 'PLANTILLA_PURGADA';
ALTER TYPE "TipoEvento" ADD VALUE 'TERMINAL_FUERA_LINEA';
ALTER TYPE "TipoEvento" ADD VALUE 'TERMINAL_RECUPERADO';
ALTER TYPE "TipoEvento" ADD VALUE 'PASO_TERMINAL';

-- AlterEnum
ALTER TYPE "TipoSolicitudDatos" ADD VALUE 'REVOCACION_BIOMETRICA';

-- AlterTable
ALTER TABLE "cola_acs_pendientes" ADD COLUMN     "terminal_id" UUID;

-- AlterTable
ALTER TABLE "consentimientos" ADD COLUMN     "autoriza_biometria" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version_texto_biometrico" TEXT;

-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "ingreso_fisico_en" TIMESTAMPTZ(6),
ADD COLUMN     "metodo_identificacion" "MetodoId";

-- CreateTable
CREATE TABLE "plantillas_biometricas" (
    "id" UUID NOT NULL,
    "visitante_id" UUID NOT NULL,
    "dedo" "Dedo" NOT NULL,
    "formato" TEXT NOT NULL,
    "dato_cifrado" TEXT NOT NULL,
    "calidad" INTEGER NOT NULL,
    "fecha_enrolamiento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "revocada_en" TIMESTAMPTZ(6),

    CONSTRAINT "plantillas_biometricas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminales_biometricos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoTerminal" NOT NULL,
    "zona_id" UUID,
    "ip" TEXT NOT NULL,
    "en_linea" BOOLEAN NOT NULL DEFAULT false,
    "ultima_sincronizacion" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "terminales_biometricos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autorizaciones_terminal" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "vigente_desde" TIMESTAMPTZ(6) NOT NULL,
    "vigente_hasta" TIMESTAMPTZ(6) NOT NULL,
    "estado" "EstadoAutorizacionTerminal" NOT NULL DEFAULT 'PENDIENTE',
    "enviada_en" TIMESTAMPTZ(6),
    "revocada_en" TIMESTAMPTZ(6),

    CONSTRAINT "autorizaciones_terminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_cotejo" (
    "id" UUID NOT NULL,
    "visita_id" UUID,
    "terminal_id" UUID,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "puntaje" DOUBLE PRECISION,
    "resultado" "ResultadoCotejo" NOT NULL,
    "prueba_vida" BOOLEAN NOT NULL,
    "origen" TEXT NOT NULL,

    CONSTRAINT "eventos_cotejo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visita_zonas" (
    "visita_id" UUID NOT NULL,
    "zona_id" UUID NOT NULL,

    CONSTRAINT "visita_zonas_pkey" PRIMARY KEY ("visita_id","zona_id")
);

-- CreateIndex
CREATE INDEX "plantillas_biometricas_vence_en_idx" ON "plantillas_biometricas"("vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_biometricas_visitante_id_dedo_key" ON "plantillas_biometricas"("visitante_id", "dedo");

-- CreateIndex
CREATE UNIQUE INDEX "terminales_biometricos_nombre_key" ON "terminales_biometricos"("nombre");

-- CreateIndex
CREATE INDEX "autorizaciones_terminal_terminal_id_estado_idx" ON "autorizaciones_terminal"("terminal_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "autorizaciones_terminal_visita_id_terminal_id_key" ON "autorizaciones_terminal"("visita_id", "terminal_id");

-- CreateIndex
CREATE INDEX "eventos_cotejo_fecha_hora_idx" ON "eventos_cotejo"("fecha_hora");

-- AddForeignKey
ALTER TABLE "cola_acs_pendientes" ADD CONSTRAINT "cola_acs_pendientes_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminales_biometricos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantillas_biometricas" ADD CONSTRAINT "plantillas_biometricas_visitante_id_fkey" FOREIGN KEY ("visitante_id") REFERENCES "visitantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminales_biometricos" ADD CONSTRAINT "terminales_biometricos_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zonas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizaciones_terminal" ADD CONSTRAINT "autorizaciones_terminal_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizaciones_terminal" ADD CONSTRAINT "autorizaciones_terminal_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminales_biometricos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_cotejo" ADD CONSTRAINT "eventos_cotejo_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_cotejo" ADD CONSTRAINT "eventos_cotejo_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminales_biometricos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visita_zonas" ADD CONSTRAINT "visita_zonas_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visita_zonas" ADD CONSTRAINT "visita_zonas_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zonas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

