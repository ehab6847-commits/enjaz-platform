'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── Admin Credentials ─────────────────────────────────────────────────────────
const ADMIN = {
  username: process.env.ADMIN_USERNAME || 'EhabSH',
  email: process.env.ADMIN_EMAIL || 'ehab6847@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'ehab20633',
};

/**
 * Seeds the database with the initial admin user.
 * Idempotent — won't create duplicates if run multiple times.
 */
const seed = async () => {
  console.log('🌱 Starting database seed...');

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { OR: [{ email: ADMIN.email }, { username: ADMIN.username }] },
    });

    if (existingAdmin) {
      console.log(`✅ Admin already exists: ${existingAdmin.username} (${existingAdmin.email})`);
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN.password, 12);

    const admin = await prisma.user.create({
      data: {
        username: ADMIN.username,
        email: ADMIN.email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        twoFactorEnabled: false,
      },
    });

    console.log(`✅ Admin user created:`);
    console.log(`   ID:       ${admin.id}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Role:     ${admin.role}`);
    console.log(`   Status:   ${admin.status}`);

    // Seed some sample monitored groups for testing
    if (process.env.NODE_ENV === 'development') {
      console.log('\n🌱 Seeding sample data for development...');
      console.log('   (Add Telegram accounts and groups via API)');
    }

    console.log('\n🎉 Seed completed successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
};

// Run the seed
seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
