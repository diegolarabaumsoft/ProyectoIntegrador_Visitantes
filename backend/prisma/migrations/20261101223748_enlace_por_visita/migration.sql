-- DropIndex
DROP INDEX "invitaciones_token_enlace_hash_key";

-- AlterTable
ALTER TABLE "invitaciones" DROP COLUMN "token_enlace_hash",
DROP COLUMN "vencimiento_enlace";

-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "token_enlace_hash" TEXT,
ADD COLUMN     "vencimiento_enlace" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "visitas_token_enlace_hash_key" ON "visitas"("token_enlace_hash");

