-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "currency" TEXT;

-- AlterTable
ALTER TABLE "CustomerEvent" ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paidByProviderInvoiceId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "paidByProviderInvoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "providerBalance" REAL;

-- AlterTable
ALTER TABLE "ProviderAuth" ADD COLUMN "baseUrl" TEXT;

-- AlterTable
ALTER TABLE "SyncRunItem" ADD COLUMN "customerName" TEXT;
ALTER TABLE "SyncRunItem" ADD COLUMN "detail" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "simulation" BOOLEAN NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL,
    "startedAt" TEXT NOT NULL,
    "finishedAt" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "counters" TEXT NOT NULL,
    "error" TEXT
);
INSERT INTO "new_SyncRun" ("counters", "error", "finishedAt", "id", "simulation", "startedAt", "status", "summary", "type") SELECT "counters", "error", "finishedAt", "id", "simulation", "startedAt", "status", "summary", "type" FROM "SyncRun";
DROP TABLE "SyncRun";
ALTER TABLE "new_SyncRun" RENAME TO "SyncRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
