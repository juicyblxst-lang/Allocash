ALTER TABLE "SmartAccount" ADD COLUMN "createdBlock" TEXT NOT NULL DEFAULT '0';

CREATE TABLE "ChainEvent" (
  "id" TEXT NOT NULL,
  "uniqueKey" TEXT NOT NULL,
  "vaultAddress" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "blockNumber" TEXT NOT NULL,
  "blockHash" TEXT,
  "txHash" TEXT NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "eventName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChainEvent_uniqueKey_key" ON "ChainEvent"("uniqueKey");
CREATE INDEX "ChainEvent_vaultAddress_blockNumber_idx" ON "ChainEvent"("vaultAddress","blockNumber");

CREATE TABLE "IndexerState" (
  "id" TEXT NOT NULL,
  "vaultAddress" TEXT NOT NULL,
  "nextBlock" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndexerState_vaultAddress_key" ON "IndexerState"("vaultAddress");
