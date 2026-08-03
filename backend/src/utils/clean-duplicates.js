const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Cleaning up duplicate requests...');
  try {
    const deleteCount = await prisma.$executeRawUnsafe(`
      DELETE FROM "requests" a USING "requests" b
      WHERE a.id < b.id
        AND a."messageId" = b."messageId"
        AND a."groupId" = b."groupId"
        AND a."messageId" IS NOT NULL;
    `);
    console.log(`Deleted ${deleteCount} duplicate request rows successfully!`);
  } catch (err) {
    console.error('Failed to delete duplicates:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
