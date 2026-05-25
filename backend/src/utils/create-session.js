/**
 * Telegram Session Creator
 * يستخدم هذا السكريبت لإنشاء جلسات Telegram للحسابات المضافة
 * 
 * الاستخدام: node src/utils/create-session.js
 */

require('dotenv').config();
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const prisma = require('../config/database');
const logger = require('../config/logger');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function createSession() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    console.error('❌ يرجى تعيين TELEGRAM_API_ID و TELEGRAM_API_HASH في ملف .env');
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 منصة إنجاز — إنشاء جلسة Telegram');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const phone = await question('📱 أدخل رقم الهاتف (مثال: +967772612086): ');

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => phone,
    password: async () => {
      return question('🔑 أدخل كلمة مرور الحساب (إذا وجدت، وإلا اضغط Enter): ');
    },
    phoneCode: async () => {
      return question('📩 أدخل رمز التحقق المرسل لك: ');
    },
    onError: (err) => {
      console.error('❌ خطأ:', err.message);
    },
  });

  const sessionString = client.session.save();

  console.log('\n✅ تم تسجيل الدخول بنجاح!');
  console.log('\nحفظ الجلسة في قاعدة البيانات...');

  await prisma.telegramAccount.upsert({
    where: { phone },
    create: {
      phone,
      sessionString,
      isActive: true,
    },
    update: {
      sessionString,
      isActive: true,
      lastSeen: new Date(),
    },
  });

  console.log(`\n🎉 تم حفظ جلسة الحساب ${phone} بنجاح!`);
  console.log('يمكنك الآن تشغيل النظام وسيبدأ مراقبة المجموعات.\n');

  await client.disconnect();
  rl.close();
  await prisma.$disconnect();
}

createSession().catch(err => {
  console.error('❌ فشل إنشاء الجلسة:', err.message);
  rl.close();
  process.exit(1);
});
