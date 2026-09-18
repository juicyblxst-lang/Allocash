import { PrismaClient } from '@prisma/client';
import { createPublicClient, http, parseAbiItem, type Address, type Log } from 'viem';
import { bscTestnet } from 'viem/chains';

const prisma = new PrismaClient();
const rpcUrl = process.env.RPC_URL || process.env.VITE_RPC_URL || 'https://bsc-testnet.bnbchain.org';
const client = createPublicClient({ chain:bscTestnet, transport:http(rpcUrl) });
const CHUNK = BigInt(Number(process.env.INDEX_CHUNK_SIZE || 2000));

const incoming = parseAbiItem('event IncomingPayment(uint256 indexed paymentId,address indexed payer,uint256 amount,uint256 receivedAt)');
const presetCreated = parseAbiItem('event PresetCreated(uint256 indexed presetId,string name)');
const presetArchived = parseAbiItem('event PresetArchived(uint256 indexed presetId,string reason)');
const presetDeleted = parseAbiItem('event PresetDeleted(uint256 indexed presetId)');
const allocationCreated = parseAbiItem('event AllocationCreated(uint256 indexed allocationId,uint256 indexed paymentId,uint256 indexed presetId,uint8 containerIndex,uint256 amount,uint256 unlockAt)');
const tempStarted = parseAbiItem('event TemporaryLockStarted(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)');
const tempExpired = parseAbiItem('event TemporaryLockExpired(uint256 indexed paymentId)');
const tempRepeated = parseAbiItem('event TemporaryLockRepeated(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)');
const unlocked = parseAbiItem('event AllocationUnlocked(uint256 indexed allocationId)');
const withdrawal = parseAbiItem('event Withdrawal(uint256 indexed allocationId,address indexed recipient,uint256 amount)');

function asDate(seconds: bigint) { return new Date(Number(seconds) * 1000); }
function key(log: Log) { return `${log.transactionHash}:${log.logIndex}`; }

async function applyLog(vaultAddress:string, log:Log, userId:string) {
  const k=key(log);
  const blockNumber=log.blockNumber ?? 0n;
  const blockHash=log.blockHash ?? undefined;
  const txHash=log.transactionHash!;
  const base={chainId:97,blockNumber:blockNumber.toString(),blockHash: blockHash ?? null,txHash,logIndex:Number(log.logIndex ?? 0)};
  if (await prisma.chainEvent.findUnique({where:{uniqueKey:k}})) return;

  const topic=log.topics[0];
  if (topic === incoming.topic) {
    const a:any=log.args;
    const payment=await prisma.incomingPayment.upsert({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},update:{payerAddress:a.payer,amountBaseUnits:a.amount.toString(),receivedAt:asDate(a.receivedAt),state:'PENDING_DECISION'},create:{userId,chainPaymentId:a.paymentId.toString(),payerAddress:a.payer,assetAddress:'0x0000000000000000000000000000000000000000',amountBaseUnits:a.amount.toString(),receivedAt:asDate(a.receivedAt),state:'PENDING_DECISION',cycle:{create:{state:'PENDING_DECISION',decisionAt:asDate(a.receivedAt)}}}});
    await prisma.notificationEvent.create({data:{userId,type:'INCOMING_FUNDS',message:`Incoming payment #${a.paymentId.toString()} needs an allocation decision.`,scheduledAt:new Date()}});
    void payment;
  } else if(topic===tempStarted.topic || topic===tempRepeated.topic) {
    const a:any=log.args; const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle) await prisma.$transaction([prisma.incomingPayment.update({where:{id:p.id},data:{state:'TEMPORARILY_LOCKED'}}),prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'TEMPORARILY_LOCKED',temporaryUnlockAt:asDate(a.unlockAt),decisionAt:asDate(a.unlockAt),reminder5SentAt:null,reminder10SentAt:null}})]);
  } else if(topic===tempExpired.topic) {
    const a:any=log.args; const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle) await prisma.$transaction([prisma.incomingPayment.update({where:{id:p.id},data:{state:'PENDING_DECISION'}}),prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'PENDING_DECISION',temporaryUnlockAt:null}})]);
  } else if(topic===allocationCreated.topic) {
    const a:any=log.args; const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle) {
      const preset=await prisma.preset.findUnique({where:{userId_onchainPresetId:{userId,onchainPresetId:a.presetId.toString()}}});
      if(preset) await prisma.$transaction([prisma.incomingPayment.update({where:{id:p.id},data:{state:'ALLOCATED'}}),prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'ALLOCATED'}}),prisma.allocation.upsert({where:{cycleId_onchainAllocationId:{cycleId:p.cycle.id,onchainAllocationId:a.allocationId.toString()}},update:{amountBaseUnits:a.amount.toString(),unlockAt:asDate(a.unlockAt)},create:{cycleId:p.cycle.id,presetId:preset.id,onchainAllocationId:a.allocationId.toString(),containerIndex:Number(a.containerIndex),amountBaseUnits:a.amount.toString(),unlockAt:asDate(a.unlockAt)}})]);
    }
  } else if(topic===unlocked.topic) {
    const a:any=log.args; const al=await prisma.allocation.findUnique({where:{onchainAllocationId:a.allocationId.toString()},include:{cycle:true}});
    if(al) await prisma.allocation.update({where:{id:al.id},data:{unlockedAt:new Date()}});
  } else if(topic===withdrawal.topic) {
    const a:any=log.args; const al=await prisma.allocation.findUnique({where:{onchainAllocationId:a.allocationId.toString()},include:{cycle:true}});
    if(al) await prisma.$transaction([prisma.allocation.update({where:{id:al.id},data:{withdrawnAt:new Date()}}),prisma.preset.update({where:{id:al.presetId},data:{}})]);
  }
  await prisma.chainEvent.create({data:{uniqueKey:k,vaultAddress, ...base,eventName:topic}});
}

async function indexVault(account:any) {
  let state=await prisma.indexerState.findUnique({where:{vaultAddress:account.vaultAddress}});
  const latest=await client.getBlockNumber();
  let from=state ? BigInt(state.nextBlock) : BigInt(account.createdBlock ?? 0);
  while(from<=latest){
    const to=from+CHUNK-1n>latest?latest:from+CHUNK-1n;
    const events=[
      {event:incoming},{event:presetCreated},{event:presetArchived},{event:presetDeleted},
      {event:allocationCreated},{event:tempStarted},{event:tempExpired},{event:tempRepeated},{event:unlocked},{event:withdrawal}
    ];
    for(const e of events){
      const logs=await client.getLogs({address:account.vaultAddress as Address,event:e.event,fromBlock:from,toBlock:to});
      for(const log of logs) await applyLog(account.vaultAddress,log,account.userId);
    }
    from=to+1n;
    await prisma.indexerState.upsert({where:{vaultAddress:account.vaultAddress},update:{nextBlock:from.toString(),updatedAt:new Date()},create:{vaultAddress:account.vaultAddress,nextBlock:from.toString()}});
  }
}
export async function syncAll() {
  const accounts=await prisma.smartAccount.findMany();
  for(const account of accounts) { try { await indexVault(account); } catch(e) { console.error('indexer',account.vaultAddress,e); } }
}
