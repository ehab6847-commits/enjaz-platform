#!/usr/bin/env node
/**
 * setup-prod.js
 * Run this ONCE after configuring DATABASE_URL in .env
 * It will push the Prisma schema and seed the admin user.
 * 
 * Usage:
 *   node src/utils/setup-prod.js
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Enjaz Platform - Production Setup\n');
console.log('═══════════════════════════════════════');

function run(cmd, label) {
  console.log(`\n⏳ ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '../../') });
    console.log(`✅ ${label} - Done!`);
  } catch (err) {
    console.error(`❌ ${label} - Failed!`);
    console.error(err.message);
    process.exit(1);
  }
}

async function main() {
  // 1. Push Prisma schema to database
  run('npx prisma db push --accept-data-loss', 'Pushing database schema');

  // 2. Seed admin user
  run('node src/utils/seed.js', 'Creating admin user');

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Production setup complete!\n');
  console.log('🔐 Admin credentials:');
  console.log('   Username: EhabSH');
  console.log('   Email:    ehab6847@gmail.com');
  console.log('   Password: ehab20633');
  console.log('\n⚠️  Please change the password after first login!');
  console.log('═══════════════════════════════════════\n');
}

main();
