import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Reminder timing is derived from persisted allocation-cycle timestamps, not browser timers.
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const cycles = await prisma.allocationCycle.findMany({
    where: { state: 'PENDING_DECISION' },
    include: { incomingPayment: true },
    take: 200,
  });
  for (const cycle of cycles) {
    const elapsed = now.getTime() - cycle.decisionAt.getTime();
    if (elapsed >= 5 * 60_000 && !cycle.reminder5SentAt) {
      await prisma.notificationEvent.create({ data:{userId:cycle.incomingPayment.userId,type:'ALLOCATION_REMINDER_5',message:'Action needed',scheduledAt:now} });
      await prisma.allocationCycle.update({where:{id:cycle.id},data:{reminder5SentAt:now}});
    }
    if (elapsed >= 10 * 60_000 && !cycle.reminder10SentAt) {
      await prisma.notificationEvent.create({ data:{userId:cycle.incomingPayment.userId,type:'ALLOCATION_REMINDER_10',message:'Action needed',scheduledAt:now} });
      await prisma.allocationCycle.update({where:{id:cycle.id},data:{reminder10SentAt:now}});
    }
  }
});
