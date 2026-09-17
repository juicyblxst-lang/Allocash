import Fastify from 'fastify';
import cron from 'node-cron';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 8787);

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

const walletSchema = z.object({ walletAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/), smartAccount:z.string().regex(/^0x[a-fA-F0-9]{40}$/), vaultAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/) });
const paymentSchema = z.object({ walletAddress:z.string(), chainPaymentId:z.string(), payerAddress:z.string(), amountBaseUnits:z.string(), receivedAt:z.string() });

app.get('/health', async () => ({ ok:true, testnetOnly:true, chainId:97 }));

app.post('/v1/users/register', async (req, reply) => {
  const body = walletSchema.parse(req.body);
  const user = await prisma.user.upsert({ where:{walletAddress:body.walletAddress}, update:{}, create:{walletAddress:body.walletAddress} });
  await prisma.smartAccount.upsert({ where:{userId:user.id}, update:{walletAddress:body.smartAccount,vaultAddress:body.vaultAddress,chainId:97}, create:{userId:user.id,walletAddress:body.smartAccount,vaultAddress:body.vaultAddress,chainId:97} });
  return reply.send({userId:user.id});
});

app.post('/v1/payments', async (req, reply) => {
  const body = paymentSchema.parse(req.body);
  const user = await prisma.user.findUnique({where:{walletAddress:body.walletAddress}});
  if (!user) return reply.code(404).send({error:'USER_NOT_REGISTERED'});
  const payment = await prisma.incomingPayment.upsert({
    where:{userId_chainPaymentId:{userId:user.id,chainPaymentId:body.chainPaymentId}},
    update:{},
    create:{userId:user.id,chainPaymentId:body.chainPaymentId,payerAddress:body.payerAddress,assetAddress:'0x0000000000000000000000000000000000000000',amountBaseUnits:body.amountBaseUnits,receivedAt:new Date(body.receivedAt),state:'PENDING_DECISION',cycle:{create:{state:'PENDING_DECISION',decisionAt:new Date(body.receivedAt)}}}
  });
  await prisma.notificationEvent.create({data:{userId:user.id,type:'INCOMING_FUNDS',message:'Incoming funds received',scheduledAt:new Date()}});
  return reply.send({paymentId:payment.id});
});

app.post('/v1/notifications/subscribe', async (req, reply) => {
  const body = z.object({walletAddress:z.string(),subscription:z.record(z.string(),z.any())}).parse(req.body);
  const user = await prisma.user.findUnique({where:{walletAddress:body.walletAddress}});
  if (!user) return reply.code(404).send({error:'USER_NOT_REGISTERED'});
  await prisma.notificationEvent.create({data:{userId:user.id,type:'PUSH_SUBSCRIPTION',message:JSON.stringify(body.subscription),scheduledAt:new Date()}});
  return reply.send({ok:true});
});

app.get('/v1/suggestions/:walletAddress', async (req) => {
  const user = await prisma.user.findUnique({where:{walletAddress:(req.params as any).walletAddress},include:{presets:{include:{containers:true},where:{archived:false,deleted:false}}}});
  if (!user) return {suggestion:null};
  const usage = await prisma.allocation.groupBy({by:['presetId'],where:{preset:{userId:user.id}},_count:{presetId:true},orderBy:{_count:{presetId:'desc'}},take:1});
  if (!usage[0]) return {suggestion:null};
  const preset = user.presets.find(p=>p.id===usage[0].presetId);
  return {suggestion:preset ? {presetId:preset.onchainPresetId,name:preset.name,usageCount:usage[0]._count.presetId}:null};
});

cron.schedule('* * * * *', async () => {
  const now = new Date();
  const due = await prisma.notificationEvent.findMany({where:{scheduledAt:{lte:now},deliveredAt:null},take:100});
  for (const event of due) {
    // Push delivery is intentionally best-effort. In-app notification state is authoritative.
    if (event.type === 'PUSH_SUBSCRIPTION') continue;
    await prisma.notificationEvent.update({where:{id:event.id},data:{deliveredAt:now}});
  }
});

app.addHook('onClose', async () => prisma.$disconnect());
app.listen({port:PORT,host:'0.0.0.0'}).catch(err=>{app.log.error(err);process.exit(1)});
