# 🚀 منصة إنجاز — Enjaz Platform Bot

<div align="center">

![Enjaz Platform](https://img.shields.io/badge/منصة-إنجاز-6366f1?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-316192?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker)

**نظام ذكي لمراقبة مجموعات Telegram والتقاط طلبات الطلاب تلقائياً**

</div>

---

## 📋 نظرة عامة

منصة إنجاز هي نظام متكامل يراقب مجموعات Telegram تلقائياً، ويلتقط طلبات الطلاب الحقيقية، ويصنفها بالذكاء الاصطناعي، ويرسلها للمختصين عبر لوحة تحكم احترافية.

### المميزات الرئيسية

- 🤖 **ذكاء اصطناعي** — تصنيف الرسائل باستخدام GPT-4o-mini + Keyword Fallback
- 📱 **متعدد الحسابات** — دعم حسابات Telegram متعددة بجلسات مستقلة
- 🛡️ **فلترة الإعلانات** — تجاهل المسوقين والمعلنين تلقائياً
- ⚡ **Real-time** — إشعارات فورية عبر WebSocket
- 🌙 **وضع ليلي** — واجهة عربية داكنة احترافية
- 📊 **إحصائيات** — رسوم بيانية وتقارير شاملة
- 🔐 **أمان عالي** — JWT + 2FA + Rate Limiting + تشفير

---

## 🏗️ هيكل المشروع

```
enjaz-platform/
├── backend/                    # Node.js + Express API
│   ├── prisma/schema.prisma    # Database Schema
│   └── src/
│       ├── config/             # Database, Logger
│       ├── controllers/        # Business Logic
│       ├── middleware/         # Auth, Rate Limit, Validation
│       ├── routes/             # API Routes
│       ├── services/
│       │   ├── ai/             # AI Classifier (GPT-4o-mini)
│       │   └── telegram/       # Multi-account Listener
│       ├── jobs/               # Cron Jobs
│       └── utils/              # JWT, Socket, Seed
├── frontend/                   # Next.js 14 Dashboard
│   └── app/
│       ├── (auth)/             # Login, Register
│       └── dashboard/          # Admin Dashboard
├── nginx/                      # Nginx Config
├── docker-compose.yml
└── .env.example
```

---

## ⚡ التشغيل السريع

### المتطلبات
- Node.js 18+
- PostgreSQL 14+
- Docker + Docker Compose (اختياري)
- مفتاح Telegram API من [my.telegram.org](https://my.telegram.org/apps)

### 1. إعداد البيئة

```bash
# نسخ ملف البيئة
cp .env.example .env

# تعديل الملف وإضافة القيم
notepad .env
```

### 2. تشغيل بـ Docker (الأسهل)

```bash
# بناء وتشغيل كل الخدمات
docker-compose up -d

# تهيئة قاعدة البيانات
docker-compose exec backend npm run db:push
docker-compose exec backend npm run db:seed

# فتح لوحة التحكم
start http://localhost:3000
```

### 3. تشغيل يدوي

```bash
# ─── Backend ───────────────────────────────────────────
cd backend
npm install
npm run db:push
npm run db:seed
npm run dev

# ─── Frontend (نافذة جديدة) ────────────────────────────
cd frontend
npm install
npm run dev
```

---

## 🔑 بيانات تسجيل الدخول

```
اسم المستخدم: EhabSH
كلمة المرور:  ehab20633
البريد:       ehab6847@gmail.com
```

> ⚠️ **مهم**: غيّر كلمة المرور فور تسجيل الدخول لأول مرة!

---

## 📱 ربط حسابات Telegram

### الحصول على API Credentials

1. اذهب إلى [my.telegram.org/apps](https://my.telegram.org/apps)
2. سجل دخولك
3. أنشئ تطبيق جديد
4. انسخ `API_ID` و `API_HASH`
5. أضفهم في ملف `.env`

### إنشاء جلسة للحساب

```bash
cd backend
node src/utils/create-session.js
```

اتبع التعليمات:
1. أدخل رقم الهاتف (مثال: `+967772612086`)
2. أدخل رمز OTP المُرسَل لك
3. سيتم حفظ الجلسة تلقائياً

---

## 🔧 API Reference

### Authentication
```
POST /api/auth/login          — تسجيل الدخول
POST /api/auth/register       — طلب انضمام
POST /api/auth/verify-2fa     — التحقق بخطوتين
POST /api/auth/refresh        — تجديد Token
GET  /api/auth/me             — بيانات المستخدم الحالي
```

### Requests
```
GET    /api/requests          — قائمة الطلبات (مع فلاتر)
GET    /api/requests/stats    — إحصائيات
GET    /api/requests/:id      — تفاصيل طلب
PUT    /api/requests/:id/status — تغيير الحالة
DELETE /api/requests/:id      — حذف
```

### Telegram
```
GET  /api/telegram/accounts              — قائمة الحسابات
POST /api/telegram/accounts              — إضافة حساب
GET  /api/telegram/accounts/:id/groups   — جروبات الحساب
POST /api/telegram/accounts/:id/toggle   — تفعيل/إيقاف
```

### Users (Admin Only)
```
GET  /api/users               — قائمة المستخدمين
PUT  /api/users/:id/approve   — الموافقة على مختص
PUT  /api/users/:id/block     — حظر مستخدم
DELETE /api/users/:id         — حذف مستخدم
```

---

## 🚀 النشر المجاني

### 1. Frontend → Vercel

```bash
cd frontend
npx vercel --prod
```

### 2. Backend → Railway

```bash
# سجل دخول على Railway
railway login

# أنشئ مشروع جديد
railway init

# اضغط الكود
railway up

# أضف المتغيرات البيئية من لوحة Railway
```

### 3. Database → Supabase

1. اذهب إلى [supabase.com](https://supabase.com)
2. أنشئ مشروع جديد (مجاناً)
3. من Settings → Database، انسخ `Connection string`
4. أضفه في `DATABASE_URL` في Railway

---

## 🛡️ الأمان

| الحماية | التفاصيل |
|---------|----------|
| تشفير كلمات المرور | bcrypt (12 rounds) |
| المصادقة | JWT (15 دقيقة) + Refresh Token (7 أيام) |
| التحقق بخطوتين | TOTP (Google Authenticator) |
| Rate Limiting | 100 طلب/دقيقة لكل IP |
| Security Headers | Helmet.js |
| التحقق من المدخلات | Zod Schema |
| تشفير الجلسات | AES-256 |

---

## 📊 Cron Jobs

| المهمة | التوقيت |
|--------|---------|
| أرشفة الطلبات القديمة | كل ساعة |
| حذف الأرشيف القديم | يومياً 2:00 صباحاً |
| فحص جلسات Telegram | كل 5 دقائق |
| تنظيف السجلات | أسبوعياً |
| تنظيف الإشعارات | يومياً 4:00 صباحاً |

---

## 🤝 المساهمة

هذا المشروع مخصص لـ **منصة إنجاز** الأكاديمية.

---

<div align="center">

**صُنع بـ ❤️ لطلاب الخليج العربي**

</div>
