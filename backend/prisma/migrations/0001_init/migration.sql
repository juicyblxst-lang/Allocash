CREATE TABLE "User" (
 "id" TEXT NOT NULL,
 "walletAddress" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

CREATE TABLE "SmartAccount" (
 "id" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "walletAddress" TEXT NOT NULL,
 "vaultAddress" TEXT NOT NULL,
 "chainId" INTEGER NOT NULL,
 "createdBlock" TEXT NOT NULL DEFAULT '0',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SmartAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmartAccount_userId_key" ON "SmartAccount"("userId");
CREATE UNIQUE INDEX "SmartAccount_walletAddress_key" ON "SmartAccount"("walletAddress");
CREATE UNIQUE INDEX "SmartAccount_vaultAddress_key" ON "SmartAccount"("vaultAddress");

CREATE TABLE "Preset" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"onchainPresetId" TEXT NOT NULL,"name" TEXT NOT NULL,
 "immutable" BOOLEAN NOT NULL DEFAULT true,"archived" BOOLEAN NOT NULL DEFAULT false,"deleted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Preset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Preset_userId_onchainPresetId_key" ON "Preset"("userId","onchainPresetId");
CREATE INDEX "Preset_userId_archived_deleted_idx" ON "Preset"("userId","archived","deleted");

CREATE TABLE "Container" (
 "id" TEXT NOT NULL,"presetId" TEXT NOT NULL,"onchainIndex" INTEGER NOT NULL,"name" TEXT NOT NULL,
 "percentage" INTEGER NOT NULL,"lockDurationSeconds" BIGINT NOT NULL,"priority" INTEGER NOT NULL,CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Container_presetId_onchainIndex_key" ON "Container"("presetId","onchainIndex");

CREATE TABLE "PresetArchiveEvent" (
 "id" TEXT NOT NULL,"presetId" TEXT NOT NULL,"reason" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PresetArchiveEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncomingPayment" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"chainPaymentId" TEXT NOT NULL,"payerAddress" TEXT NOT NULL,"assetAddress" TEXT NOT NULL,
 "amountBaseUnits" TEXT NOT NULL,"receivedAt" TIMESTAMP(3) NOT NULL,"state" TEXT NOT NULL,CONSTRAINT "IncomingPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IncomingPayment_userId_chainPaymentId_key" ON "IncomingPayment"("userId","chainPaymentId");
CREATE INDEX "IncomingPayment_userId_receivedAt_idx" ON "IncomingPayment"("userId","receivedAt");

CREATE TABLE "AllocationCycle" (
 "id" TEXT NOT NULL,"incomingPaymentId" TEXT NOT NULL,"state" TEXT NOT NULL,"decisionAt" TIMESTAMP(3) NOT NULL,
 "temporaryUnlockAt" TIMESTAMP(3),"reminder5SentAt" TIMESTAMP(3),"reminder10SentAt" TIMESTAMP(3),CONSTRAINT "AllocationCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllocationCycle_incomingPaymentId_key" ON "AllocationCycle"("incomingPaymentId");

CREATE TABLE "Allocation" (
 "id" TEXT NOT NULL,"cycleId" TEXT NOT NULL,"presetId" TEXT NOT NULL,"onchainAllocationId" TEXT NOT NULL,"containerIndex" INTEGER NOT NULL,
 "amountBaseUnits" TEXT NOT NULL,"unlockAt" TIMESTAMP(3) NOT NULL,"unlockedAt" TIMESTAMP(3),"withdrawnAt" TIMESTAMP(3),CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Allocation_cycleId_onchainAllocationId_key" ON "Allocation"("cycleId","onchainAllocationId");
CREATE INDEX "Allocation_presetId_withdrawnAt_idx" ON "Allocation"("presetId","withdrawnAt");

CREATE TABLE "LockRecord" (
 "id" TEXT NOT NULL,"allocationId" TEXT NOT NULL,"kind" TEXT NOT NULL,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "LockRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationEvent" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"type" TEXT NOT NULL,"message" TEXT NOT NULL,"scheduledAt" TIMESTAMP(3) NOT NULL,
 "deliveredAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationEvent_userId_scheduledAt_deliveredAt_idx" ON "NotificationEvent"("userId","scheduledAt","deliveredAt");

CREATE TABLE "PushSubscription" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"endpoint" TEXT NOT NULL,"p256dh" TEXT NOT NULL,"auth" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "PushSubscription"("userId","endpoint");

CREATE TABLE "TransactionRecord" (
 "id" TEXT NOT NULL,"userId" TEXT NOT NULL,"txHash" TEXT NOT NULL,"action" TEXT NOT NULL,"status" TEXT NOT NULL,"chainId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"confirmedAt" TIMESTAMP(3),CONSTRAINT "TransactionRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransactionRecord_txHash_key" ON "TransactionRecord"("txHash");
CREATE INDEX "TransactionRecord_userId_createdAt_idx" ON "TransactionRecord"("userId","createdAt");

CREATE TABLE "ChainEvent" (
 "id" TEXT NOT NULL,"uniqueKey" TEXT NOT NULL,"vaultAddress" TEXT NOT NULL,"chainId" INTEGER NOT NULL,"blockNumber" TEXT NOT NULL,
 "blockHash" TEXT,"txHash" TEXT NOT NULL,"logIndex" INTEGER NOT NULL,"eventName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChainEvent_uniqueKey_key" ON "ChainEvent"("uniqueKey");
CREATE INDEX "ChainEvent_vaultAddress_blockNumber_idx" ON "ChainEvent"("vaultAddress","blockNumber");

CREATE TABLE "IndexerState" (
 "id" TEXT NOT NULL,"vaultAddress" TEXT NOT NULL,"nextBlock" TEXT NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IndexerState_vaultAddress_key" ON "IndexerState"("vaultAddress");

ALTER TABLE "SmartAccount" ADD CONSTRAINT "SmartAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Preset" ADD CONSTRAINT "Preset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PresetArchiveEvent" ADD CONSTRAINT "PresetArchiveEvent_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncomingPayment" ADD CONSTRAINT "IncomingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllocationCycle" ADD CONSTRAINT "AllocationCycle_incomingPaymentId_fkey" FOREIGN KEY ("incomingPaymentId") REFERENCES "IncomingPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AllocationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LockRecord" ADD CONSTRAINT "LockRecord_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransactionRecord" ADD CONSTRAINT "TransactionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
