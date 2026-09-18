import Fastify from 'fastify';
import cors from '@fastify/cors';
import cron from 'node-cron';
import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { syncAll } from './indexer.js';

const prisma=new PrismaClient();
const app=Fastify({logger:true});
await app.register(cors,{origin:true});
const PORT=Number(process.env.PORT||8787);
const pushEnabled=Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
if(pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);

const walletSchema=z.object({walletAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/),smartAccount:z.string().regex(/^0x[a-fA-F0-9]{40}$/),vaultAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/),createdBlock:z.string().optional()});
const subscriptionSchema=z.object({walletAddress:z.string().regex(/^0x[a-fA-F0-9]{40}$/),subscription:z.object({endpoint:z.string().url(),keys:z.object({p256dh:z.string(),auth:z.string()})})});

app.get('/health',async()=>({ok:true,testnetOnly:true,chainId:97,indexer:'on-chain-authoritative'}));

app.post('/v1/users/register',async(req,reply)=>{
  const body=walletSchema.parse(req.body);
  const user=await prisma.user.upsert({where:{walletAddress:body.walletAddress},update:{},create:{walletAddress:body.walletAddress}});
  await prisma.smartAccount.upsert({where:{userId:user.id},update:{walletAddress:body.smartAccount,vaultAddress:body.vaultAddress,chainId:97,createdBlock:body.createdBlock??'0'},create:{userId:user.id,walletAddress:body.smartAccount,vaultAddress:body.vaultAddress,chainId:97,createdBlock:body.createdBlock??'0'}});
  return {userId:user.id};
});

app.post('/v1/notifications/subscribe',async(req,reply)=>{
  const body=subscriptionSchema.parse(req.body);
  const user=await prisma.user.findUnique({where:{walletAddress:body.walletAddress}});
  if(!user)return reply.code(404).send({error:'USER_NOT_REGISTERED'});
  await prisma.pushSubscription.upsert({where:{userId_endpoint:{userId:user.id,endpoint:body.subscription.endpoint}},update:{p256dh:body.subscription.keys.p256dh,auth:body.subscription.keys.auth},create:{userId:user.id,endpoint:body.subscription.endpoint,p256dh:body.subscription.keys.p256dh,auth:body.subscription.keys.auth}});
  return {ok:true};
});

app.get('/v1/payments/:walletAddress',async(req)=>{
  const user=await prisma.user.findUnique({where:{walletAddress:(req.params as any).walletAddress},include:{incomingPayments:{orderBy:{receivedAt:'desc'},include:{cycle:{include:{allocations:{include:{preset:true}}}}}}});
  return {payments:user?.incomingPayments??[]};
});
app.get('/v1/presets/:walletAddress',async(req)=>{
  const user=await prisma.user.findUnique({where:{walletAddress:(req.params as any).walletAddress},include:{presets:{include:{containers:true,archiveEvents:true},orderBy:{createdAt:'desc'}}}});
  return {presets:user?.presets??[]};
});
app.get('/v1/notifications/:walletAddress',async(req)=>{
  const user=await prisma.user.findUnique({where:{walletAddress:(req.params as any).walletAddress}});
  if(!user)return {notifications:[]};
  return {notifications:await prisma.notificationEvent.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:50})};
});
app.get('/v1/suggestions/:walletAddress',async(req)=>{
  const user=await prisma.user.findUnique({where:{walletAddress:(req.params as any).walletAddress},include:{presets:{include:{containers:true},where:{archived:false,deleted:false}}}});
  if(!user)return {suggestion:null};
  const usage=await prisma.allocation.groupBy({by:['presetId'],where:{preset:{userId:user.id}},_count:{presetId:true},orderBy:{_count:{presetId:'desc'}},take:1});
  if(!usage[0])return {suggestion:null};
  const preset=user.presets.find(p=>p.id===usage[0].presetId);
  return {suggestion:preset?{presetId:preset.onchainPresetId,name:preset.name,usageCount:usage[0]._count.presetId,requiresExplicitChoice:true}:null};
});

app.post('/v1/indexer/sync',async()=>{await syncAll();return {ok:true};});

cron.schedule('* * * * *',async()=>{
  try{
    await syncAll();
    const now=new Date();
    const cycles=await prisma.allocationCycle.findMany({where:{state:'PENDING_DECISION'},include:{incomingPayment:true},take:200});
    for(const cycle of cycles){
      const elapsed=now.getTime()-cycle.decisionAt.getTime();
      if(elapsed>=5*60_000&&!cycle.reminder5SentAt){
        await prisma.notificationEvent.create({data:{userId:cycle.incomingPayment.userId,type:'ALLOCATION_REMINDER_5',message:'5 minutes have passed. Review or temporarily lock this incoming payment.',scheduledAt:now}});
        await prisma.allocationCycle.update({where:{id:cycle.id},data:{reminder5SentAt:now}});
      }
      if(elapsed>=10*60_000&&!cycle.reminder10SentAt){
        await prisma.notificationEvent.create({data:{userId:cycle.incomingPayment.userId,type:'ALLOCATION_REMINDER_10',message:'10 minutes have passed. Review or temporarily lock this incoming payment.',scheduledAt:now}});
        await prisma.allocationCycle.update({where:{id:cycle.id},data:{reminder10SentAt:now}});
      }
    }
    const due=await prisma.notificationEvent.findMany({where:{scheduledAt:{lte:now},deliveredAt:null},take:100,include:{user:{include:{pushSubscriptions:true}}}});
    for(const event of due){
      if(pushEnabled) for(const sub of event.user.pushSubscriptions){
        try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'Allocash',body:event.message}))}
        catch(err:any){if(err?.statusCode===404||err?.statusCode===410)await prisma.pushSubscription.delete({where:{userId_endpoint:{userId:event.userId,endpoint:sub.endpoint}}})}
      }
      await prisma.notificationEvent.update({where:{id:event.id},data:{deliveredAt:now}});
    }
  }catch(err){app.log.error(err,'scheduler/indexer failure')}
});

app.addHook('onClose',async()=>prisma.$disconnect());
app.listen({port:PORT,host:'0.0.0.0'}).catch(err=>{app.log.error(err);process.exit(1)});
