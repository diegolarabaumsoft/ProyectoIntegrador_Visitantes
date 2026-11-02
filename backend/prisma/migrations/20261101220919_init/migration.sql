-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ANFITRION', 'RECEPCION_SEGURIDAD', 'JEFE_SEGURIDAD', 'ADMINISTRADOR', 'DPO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'PASAPORTE', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoInvitacion" AS ENUM ('ACTIVA', 'REPROGRAMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoVisita" AS ENUM ('PROGRAMADA', 'PRE_REGISTRADA', 'EN_PLANTA', 'FINALIZADA', 'CANCELADA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "ElementoEpp" AS ENUM ('CASCO', 'GAFAS', 'TAPABOCAS', 'PROTECTOR_AUDITIVO', 'CHALECO', 'BOTAS', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('INVITACION_CREADA', 'INVITACION_REPROGRAMADA', 'INVITACION_CANCELADA', 'ENLACE_ENVIADO', 'PRE_REGISTRO_DATOS', 'PRE_REGISTRO_COMPLETADO', 'CONSENTIMIENTO_ACEPTADO', 'INDUCCION_APROBADA', 'INDUCCION_REPROBADA', 'CREDENCIAL_EMITIDA', 'CREDENCIAL_RECHAZADA', 'CREDENCIAL_INVALIDADA', 'CHECKIN_BLOQUEADO', 'EXCEPCION_REGISTRADA', 'EPP_ENTREGADO', 'EPP_DEVUELTO', 'ACS_AUTORIZADO', 'ACS_CONTINGENCIA', 'ACS_RECONCILIADO', 'CHECKIN_REALIZADO', 'REGISTRO_EXPRES', 'MOVIMIENTO_ZONA', 'ACOMPANANTE_ASIGNADO', 'VEHICULO_REGISTRADO', 'ALERTA_PERMANENCIA', 'CHECKOUT_REALIZADO', 'INCIDENCIA_DEVOLUCION', 'RESTRICCION_CREADA', 'RESTRICCION_MODIFICADA', 'RESTRICCION_ELIMINADA', 'USUARIO_CREADO', 'USUARIO_MODIFICADO', 'USUARIO_DESACTIVADO', 'LOGIN_OK', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'SESION_CERRADA', 'NOTIFICACION_ENVIADA', 'NOTIFICACION_FALLIDA', 'REPORTE_GENERADO', 'EXPORTACION_ANONIMIZADA', 'SOLICITUD_DATOS_REGISTRADA', 'SOLICITUD_DATOS_ATENDIDA', 'ANONIMIZACION_RETENCION', 'CONFIGURACION_MODIFICADA');

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('CORREO', 'MENSAJERIA');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "NombreIndicador" AS ENUM ('TIEMPO_CHECKIN_P90', 'TIEMPO_CHECKIN_PROMEDIO', 'COMPLETITUD_REGISTRO', 'SATISFACCION', 'VISITAS_DIA', 'BLOQUEOS', 'CONTINGENCIAS');

-- CreateEnum
CREATE TYPE "OperadorUmbral" AS ENUM ('MAYOR', 'MENOR');

-- CreateEnum
CREATE TYPE "TipoSolicitudDatos" AS ENUM ('ELIMINACION', 'ANONIMIZACION', 'CONSULTA');

-- CreateEnum
CREATE TYPE "EstadoSolicitudDatos" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'ATENDIDA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "PeriodicidadReporte" AS ENUM ('DIARIA', 'SEMANAL', 'MENSUAL');

-- CreateTable
CREATE TABLE "usuarios_internos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "area" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(6),
    "ultimo_acceso" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usuarios_internos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitantes" (
    "id" UUID NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "tipo_documento" "TipoDocumento" NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "numero_documento_hash" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "correo_hash" TEXT NOT NULL,
    "telefono" TEXT,
    "anonimizado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" UUID NOT NULL,
    "anfitrion_id" UUID NOT NULL,
    "fecha_visita" TIMESTAMPTZ(6) NOT NULL,
    "motivo" TEXT NOT NULL,
    "token_enlace_hash" TEXT NOT NULL,
    "vencimiento_enlace" TIMESTAMPTZ(6) NOT NULL,
    "estado" "EstadoInvitacion" NOT NULL DEFAULT 'ACTIVA',
    "es_grupal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas" (
    "id" UUID NOT NULL,
    "invitacion_id" UUID,
    "visitante_id" UUID NOT NULL,
    "anfitrion_id" UUID NOT NULL,
    "estado" "EstadoVisita" NOT NULL DEFAULT 'PROGRAMADA',
    "fecha_programada" TIMESTAMPTZ(6) NOT NULL,
    "motivo" TEXT NOT NULL,
    "hora_ingreso" TIMESTAMPTZ(6),
    "hora_salida" TIMESTAMPTZ(6),
    "tiempo_autorizado_min" INTEGER NOT NULL,
    "modo_contingencia" BOOLEAN NOT NULL DEFAULT false,
    "acompanante_id" UUID,
    "es_expres" BOOLEAN NOT NULL DEFAULT false,
    "identidad_verificada" BOOLEAN NOT NULL DEFAULT false,
    "alerta_permanencia_en" TIMESTAMPTZ(6),
    "satisfaccion" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciales_qr" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "emitida_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "invalidada_en" TIMESTAMPTZ(6),
    "motivo_invalidacion" TEXT,
    "fisica_entregada" BOOLEAN NOT NULL DEFAULT false,
    "fisica_devuelta" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "credenciales_qr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimientos" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "version_politica" TEXT NOT NULL,
    "acepta_tratamiento" BOOLEAN NOT NULL,
    "acepta_nda" BOOLEAN NOT NULL,
    "fecha_hora_aceptacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "consentimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" TEXT,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inducciones_seguridad" (
    "id" UUID NOT NULL,
    "visitante_id" UUID NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "aprobada" BOOLEAN NOT NULL,
    "fecha_aprobacion" TIMESTAMPTZ(6),
    "vence_en" TIMESTAMPTZ(6),
    "respuestas" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inducciones_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preguntas_induccion" (
    "id" UUID NOT NULL,
    "enunciado" TEXT NOT NULL,
    "opciones" JSONB NOT NULL,
    "respuesta_correcta" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "preguntas_induccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_epp" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "elemento" "ElementoEpp" NOT NULL,
    "entregado" BOOLEAN NOT NULL DEFAULT true,
    "devuelto" BOOLEAN NOT NULL DEFAULT false,
    "entregado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devuelto_en" TIMESTAMPTZ(6),
    "registrado_por_id" UUID,

    CONSTRAINT "entregas_epp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zonas" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_sensible" BOOLEAN NOT NULL DEFAULT false,
    "requiere_acompanante" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zonas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_zona" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "zona_id" UUID NOT NULL,
    "hora_entrada" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hora_salida" TIMESTAMPTZ(6),
    "registrado_por_id" UUID,

    CONSTRAINT "movimientos_zona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_restriccion" (
    "id" UUID NOT NULL,
    "numero_documento_hash" TEXT NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "nombre_referencia" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autor_id" UUID NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_por_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entradas_restriccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepciones_autorizadas" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "entrada_restriccion_id" UUID NOT NULL,
    "justificacion" TEXT NOT NULL,
    "autorizado_por" TEXT NOT NULL,
    "registrado_por_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "excepciones_autorizadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_bitacora" (
    "id" BIGSERIAL NOT NULL,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_evento" "TipoEvento" NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_id" UUID,
    "visita_id" UUID,
    "entidad" TEXT,
    "entidad_id" TEXT,
    "resultado" TEXT NOT NULL,
    "detalle" JSONB,
    "ip" TEXT,

    CONSTRAINT "eventos_bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "destinatario" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "visita_id" UUID,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "enviada_en" TIMESTAMPTZ(6),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicadores" (
    "id" UUID NOT NULL,
    "nombre" "NombreIndicador" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "fecha_calculo" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodo" DATE NOT NULL,

    CONSTRAINT "indicadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_umbral" (
    "id" UUID NOT NULL,
    "indicador" "NombreIndicador" NOT NULL,
    "umbral" DOUBLE PRECISION NOT NULL,
    "operador" "OperadorUmbral" NOT NULL,
    "canal" "CanalNotificacion" NOT NULL DEFAULT 'CORREO',
    "destinatarios" TEXT[],
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_umbral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_generados" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "periodicidad" "PeriodicidadReporte",
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "formato" TEXT NOT NULL,
    "ruta_archivo" TEXT NOT NULL,
    "generado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generado_por" TEXT,

    CONSTRAINT "reportes_generados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_datos" (
    "id" UUID NOT NULL,
    "visitante_id" UUID NOT NULL,
    "tipo" "TipoSolicitudDatos" NOT NULL,
    "fecha_recepcion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_limite" TIMESTAMPTZ(6) NOT NULL,
    "fecha_respuesta" TIMESTAMPTZ(6),
    "estado" "EstadoSolicitudDatos" NOT NULL DEFAULT 'PENDIENTE',
    "atendida_por_id" UUID,
    "respuesta" TEXT,

    CONSTRAINT "solicitudes_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cola_acs_pendientes" (
    "id" UUID NOT NULL,
    "visita_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "enviado_en" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "cola_acs_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descripcion" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_internos_correo_key" ON "usuarios_internos"("correo");

-- CreateIndex
CREATE INDEX "usuarios_internos_rol_idx" ON "usuarios_internos"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "visitantes_numero_documento_hash_idx" ON "visitantes"("numero_documento_hash");

-- CreateIndex
CREATE INDEX "visitantes_correo_hash_idx" ON "visitantes"("correo_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_enlace_hash_key" ON "invitaciones"("token_enlace_hash");

-- CreateIndex
CREATE INDEX "invitaciones_anfitrion_id_fecha_visita_idx" ON "invitaciones"("anfitrion_id", "fecha_visita");

-- CreateIndex
CREATE INDEX "visitas_estado_idx" ON "visitas"("estado");

-- CreateIndex
CREATE INDEX "visitas_visitante_id_idx" ON "visitas"("visitante_id");

-- CreateIndex
CREATE INDEX "visitas_anfitrion_id_fecha_programada_idx" ON "visitas"("anfitrion_id", "fecha_programada");

-- CreateIndex
CREATE INDEX "visitas_fecha_programada_idx" ON "visitas"("fecha_programada");

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_qr_visita_id_key" ON "credenciales_qr"("visita_id");

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_qr_codigo_key" ON "credenciales_qr"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "consentimientos_visita_id_key" ON "consentimientos"("visita_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_visita_id_key" ON "vehiculos"("visita_id");

-- CreateIndex
CREATE INDEX "inducciones_seguridad_visitante_id_aprobada_idx" ON "inducciones_seguridad"("visitante_id", "aprobada");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_epp_visita_id_elemento_key" ON "entregas_epp"("visita_id", "elemento");

-- CreateIndex
CREATE UNIQUE INDEX "zonas_nombre_key" ON "zonas"("nombre");

-- CreateIndex
CREATE INDEX "movimientos_zona_visita_id_idx" ON "movimientos_zona"("visita_id");

-- CreateIndex
CREATE INDEX "entradas_restriccion_numero_documento_hash_activa_idx" ON "entradas_restriccion"("numero_documento_hash", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "excepciones_autorizadas_visita_id_key" ON "excepciones_autorizadas"("visita_id");

-- CreateIndex
CREATE INDEX "eventos_bitacora_fecha_hora_idx" ON "eventos_bitacora"("fecha_hora");

-- CreateIndex
CREATE INDEX "eventos_bitacora_tipo_evento_idx" ON "eventos_bitacora"("tipo_evento");

-- CreateIndex
CREATE INDEX "eventos_bitacora_visita_id_idx" ON "eventos_bitacora"("visita_id");

-- CreateIndex
CREATE INDEX "eventos_bitacora_actor_id_idx" ON "eventos_bitacora"("actor_id");

-- CreateIndex
CREATE INDEX "notificaciones_estado_idx" ON "notificaciones"("estado");

-- CreateIndex
CREATE INDEX "notificaciones_visita_id_idx" ON "notificaciones"("visita_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicadores_nombre_periodo_key" ON "indicadores"("nombre", "periodo");

-- CreateIndex
CREATE INDEX "solicitudes_datos_estado_idx" ON "solicitudes_datos"("estado");

-- CreateIndex
CREATE INDEX "cola_acs_pendientes_enviado_en_idx" ON "cola_acs_pendientes"("enviado_en");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios_internos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_anfitrion_id_fkey" FOREIGN KEY ("anfitrion_id") REFERENCES "usuarios_internos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_invitacion_id_fkey" FOREIGN KEY ("invitacion_id") REFERENCES "invitaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_visitante_id_fkey" FOREIGN KEY ("visitante_id") REFERENCES "visitantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_anfitrion_id_fkey" FOREIGN KEY ("anfitrion_id") REFERENCES "usuarios_internos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_acompanante_id_fkey" FOREIGN KEY ("acompanante_id") REFERENCES "usuarios_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales_qr" ADD CONSTRAINT "credenciales_qr_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consentimientos" ADD CONSTRAINT "consentimientos_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inducciones_seguridad" ADD CONSTRAINT "inducciones_seguridad_visitante_id_fkey" FOREIGN KEY ("visitante_id") REFERENCES "visitantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_epp" ADD CONSTRAINT "entregas_epp_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_epp" ADD CONSTRAINT "entregas_epp_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_zona" ADD CONSTRAINT "movimientos_zona_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_zona" ADD CONSTRAINT "movimientos_zona_zona_id_fkey" FOREIGN KEY ("zona_id") REFERENCES "zonas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_zona" ADD CONSTRAINT "movimientos_zona_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_restriccion" ADD CONSTRAINT "entradas_restriccion_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios_internos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_autorizadas" ADD CONSTRAINT "excepciones_autorizadas_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_autorizadas" ADD CONSTRAINT "excepciones_autorizadas_entrada_restriccion_id_fkey" FOREIGN KEY ("entrada_restriccion_id") REFERENCES "entradas_restriccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_autorizadas" ADD CONSTRAINT "excepciones_autorizadas_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios_internos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_bitacora" ADD CONSTRAINT "eventos_bitacora_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_datos" ADD CONSTRAINT "solicitudes_datos_visitante_id_fkey" FOREIGN KEY ("visitante_id") REFERENCES "visitantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_datos" ADD CONSTRAINT "solicitudes_datos_atendida_por_id_fkey" FOREIGN KEY ("atendida_por_id") REFERENCES "usuarios_internos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cola_acs_pendientes" ADD CONSTRAINT "cola_acs_pendientes_visita_id_fkey" FOREIGN KEY ("visita_id") REFERENCES "visitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
