const { PrismaClient } = require('@prisma/client');

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-north-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'sa-east-1', 'me-central-1'
];

async function testRegion(region) {
  const url = `postgresql://postgres.lxnlsfubhfzflkkwaams:N7%23vQ9%21mZ4%40xL2%24Rp8%5ETq6@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: url
      }
    }
  });

  try {
    // Connect and query with a 4 second timeout
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1 as result`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
    ]);
    console.log(`✅ SUCCESS: Region ${region} connected!`);
    await prisma.$disconnect();
    return true;
  } catch (err) {
    console.log(`❌ Region ${region} failed: ${err.message.split('\n')[0]}`);
    await prisma.$disconnect();
    return false;
  }
}

async function run() {
  console.log('Testing regions from Render...');
  for (const region of regions) {
    const success = await testRegion(region);
    if (success) {
      console.log(`\n🎉 Found working region: ${region}`);
      console.log(`URL: postgresql://postgres.lxnlsfubhfzflkkwaams:N7%23vQ9%21mZ4%40xL2%24Rp8%5ETq6@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true\n`);
      break;
    }
  }
  console.log('Done.');
}

run();
