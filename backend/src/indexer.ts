import { PrismaClient } from '@prisma/client';
import { createPublicClient, decodeEventLog, http, parseAbi, type Address, type Log } from 'viem';
import { bscTestnet } from 'viem/chains';

const prisma = new PrismaClient();
const rpcUrl = process.env.RPC_URL || 'https://bsc-testnet.bnbchain.org';
const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl) });
const CHUNK = BigInt(Number(process.env.INDEX_CHUNK_SIZE || 2000));

const abi = parseAbi([
  'event IncomingPayment(uint256 indexed paymentId,address indexed payer,uint256 amount,uint256 receivedAt)',
  'event PresetCreated(uint256 indexed presetId,string name)',
  'event PresetArchived(uint256 indexed presetId,string reason)',
  'event PresetDeleted(uint256 indexed presetId)',
  'event AllocationCreated(uint256 indexed allocationId,uint256 indexed paymentId,uint256 indexed presetId,uint8 containerIndex,uint256 amount,uint256 unlockAt)',
  'event TemporaryLockStarted(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)',
  'event TemporaryLockExpired(uint256 indexed paymentId)',
  'event TemporaryLockRepeated(uint256 indexed paymentId,uint256 amount,uint256 unlockAt)',
  'event AllocationUnlocked(uint256 indexed allocationId)',
  'event Withdrawal(uint256 indexed allocationId,address indexed recipient,uint256 amount)',
  'function preset(uint256 id) view returns ((string name,uint256 createdAt,bool archived,bool deleted,uint256 activeFunds,string archiveReason), (string name,uint16 percentage,uint64 lockDuration,uint8 priority,bool exists)[])'
]);

const date=(n:bigint)=>new Date(Number(n)*1000);
const eventKey=(l:Log)=>`${l.transactionHash}:${l.logIndex}`;

async function recordChainEvent(l:Log,vaultAddress:string,eventName:string){
  return prisma.chainEvent.create({data:{
    uniqueKey:eventKey(l),vaultAddress,chainId:97,blockNumber:(l.blockNumber??0n).toString(),
    blockHash:l.blockHash??null,txHash:l.transactionHash!,logIndex:Number(l.logIndex??0),eventName
  }});
}

async function syncPreset(userId:string,vaultAddress:string,presetId:bigint){
  const result:any=await client.readContract({address:vaultAddress as Address,abi,functionName:'preset',args:[presetId]});
  const p=result[0], containers=result[1];
  const preset=await prisma.preset.upsert({
    where:{userId_onchainPresetId:{userId,onchainPresetId:presetId.toString()}},
    update:{name:p.name,archived:p.archived,deleted:p.deleted},
    create:{userId,onchainPresetId:presetId.toString(),name:p.name,immutable:true,archived:p.archived,deleted:p.deleted}
  });
  for(let i=0;i<containers.length;i++){
    const c=containers[i];
    await prisma.container.upsert({where:{presetId_onchainIndex:{presetId:preset.id,onchainIndex:i}},
      update:{name:c.name,percentage:Number(c.percentage),lockDurationSeconds:BigInt(c.lockDuration),priority:Number(c.priority)},
      create:{presetId:preset.id,onchainIndex:i,name:c.name,percentage:Number(c.percentage),lockDurationSeconds:BigInt(c.lockDuration),priority:Number(c.priority)}});
  }
  return preset;
}

async function processLog(userId:string,vaultAddress:string,l:Log){
  if(await prisma.chainEvent.findUnique({where:{uniqueKey:eventKey(l)}})) return;
  const decoded:any=decodeEventLog({abi,data:l.data,topics:l.topics});
  const name=decoded.eventName as string;
  const a:any=decoded.args;
  if(name==='IncomingPayment'){
    await prisma.incomingPayment.upsert({
      where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},
      update:{payerAddress:a.payer,amountBaseUnits:a.amount.toString(),receivedAt:date(a.receivedAt),state:'PENDING_DECISION'},
      create:{userId,chainPaymentId:a.paymentId.toString(),payerAddress:a.payer,assetAddress:'0x0000000000000000000000000000000000000000',amountBaseUnits:a.amount.toString(),receivedAt:date(a.receivedAt),state:'PENDING_DECISION',cycle:{create:{state:'PENDING_DECISION',decisionAt:date(a.receivedAt)}}}
    });
  } else if(name==='PresetCreated'){
    await syncPreset(userId,vaultAddress,a.presetId);
  } else if(name==='PresetArchived' || name==='PresetDeleted'){
    const p=await prisma.preset.findUnique({where:{userId_onchainPresetId:{userId,onchainPresetId:a.presetId?.toString()??'0'}}});
    if(p){await prisma.preset.update({where:{id:p.id},data:{archived:name==='PresetArchived'?true:p.archived,deleted:name==='PresetDeleted'?true:p.deleted}});if(name==='PresetArchived')await prisma.presetArchiveEvent.create({data:{presetId:p.id,reason:a.reason}});}
  } else if(name==='TemporaryLockStarted' || name==='TemporaryLockRepeated'){
    const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle) await prisma.$transaction([
      prisma.incomingPayment.update({where:{id:p.id},data:{state:'TEMPORARILY_LOCKED'}}),
      prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'TEMPORARILY_LOCKED',temporaryUnlockAt:date(a.unlockAt),decisionAt:date(a.unlockAt),reminder5SentAt:null,reminder10SentAt:null}})
    ]);
  } else if(name==='TemporaryLockExpired'){
    const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle) await prisma.$transaction([
      prisma.incomingPayment.update({where:{id:p.id},data:{state:'PENDING_DECISION'}}),
      prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'PENDING_DECISION',temporaryUnlockAt:null,decisionAt:new Date()}})
    ]);
  } else if(name==='AllocationCreated'){
    const p=await prisma.incomingPayment.findUnique({where:{userId_chainPaymentId:{userId,chainPaymentId:a.paymentId.toString()}},include:{cycle:true}});
    if(p?.cycle){
      const preset=await syncPreset(userId,vaultAddress,a.presetId);
      await prisma.$transaction([
        prisma.incomingPayment.update({where:{id:p.id},data:{state:'ALLOCATED'}}),
        prisma.allocationCycle.update({where:{id:p.cycle.id},data:{state:'ALLOCATED'}}),
        prisma.allocation.upsert({where:{cycleId_onchainAllocationId:{cycleId:p.cycle.id,onchainAllocationId:a.allocationId.toString()}},
          update:{amountBaseUnits:a.amount.toString(),unlockAt:date(a.unlockAt)},
          create:{cycleId:p.cycle.id,presetId:preset.id,onchainAllocationId:a.allocationId.toString(),containerIndex:Number(a.containerIndex),amountBaseUnits:a.amount.toString(),unlockAt:date(a.unlockAt)}})
      ]);
    }
  } else if(name==='AllocationUnlocked'){
    const al=await prisma.allocation.findFirst({where:{onchainAllocationId:a.allocationId.toString()}});
    if(al) await prisma.allocation.update({where:{id:al.id},data:{unlockedAt:new Date()}});
  } else if(name==='Withdrawal'){
    const al=await prisma.allocation.findFirst({where:{onchainAllocationId:a.allocationId.toString()}});
    if(al) await prisma.allocation.update({where:{id:al.id},data:{withdrawnAt:new Date()}});
  }
  await recordChainEvent(l,vaultAddress,name);
}

async function syncAccount(account:any){
  let state=await prisma.indexerState.findUnique({where:{vaultAddress:account.vaultAddress}});
  const latest=await client.getBlockNumber();
  let from=state?BigInt(state.nextBlock):BigInt(account.createdBlock||0);
  while(from<=latest){
    const to=from+CHUNK-1n>latest?latest:from+CHUNK-1n;
    const logs=await client.getLogs({address:account.vaultAddress as Address,fromBlock:from,toBlock:to});
    for(const l of logs) {
      try { await processLog(account.userId,account.vaultAddress,l); }
      catch(e) { console.error('index log',account.vaultAddress,eventKey(l),e); }
    }
    from=to+1n;
    await prisma.indexerState.upsert({where:{vaultAddress:account.vaultAddress},update:{nextBlock:from.toString()},create:{vaultAddress:account.vaultAddress,nextBlock:from.toString()}});
  }
}
export async function syncAll(){ for(const account of await prisma.smartAccount.findMany()) await syncAccount(account); }
