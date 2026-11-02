-- DropForeignKey
ALTER TABLE "cola_acs_pendientes" DROP CONSTRAINT "cola_acs_pendientes_terminal_id_fkey";

-- AlterTable
ALTER TABLE "autorizaciones_terminal" ADD COLUMN     "revocacion_solicitada_en" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "cola_acs_pendientes" DROP COLUMN "terminal_id";

-- AlterTable
ALTER TABLE "terminales_biometricos" ADD COLUMN     "secreto_hash" TEXT;

