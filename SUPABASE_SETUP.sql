-- ╔══════════════════════════════════════════════════════════════════╗
-- ║     Enjaz Platform — Complete Database Setup SQL                 ║
-- ║     Run this in Supabase SQL Editor (once only)                  ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── Step 1: Create ENUMs ──────────────────────────────────────────────────────
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SPECIALIST');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'VIEWED', 'ASSIGNED', 'ARCHIVED');
CREATE TYPE "Priority" AS ENUM ('URGENT', 'NORMAL', 'LOW');
CREATE TYPE "NotificationType" AS ENUM ('NEW_REQUEST', 'USER_JOINED', 'SYSTEM');

-- ─── Step 2: Create Tables ─────────────────────────────────────────────────────
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SPECIALIST',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT,
    "specialization" TEXT,
    "whatsapp" TEXT,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "senderName" TEXT,
    "senderUsername" TEXT,
    "senderId" TEXT NOT NULL,
    "profileLink" TEXT,
    "messageLink" TEXT,
    "groupName" TEXT,
    "groupId" TEXT NOT NULL,
    "country" TEXT,
    "university" TEXT,
    "serviceType" TEXT,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "keywords" TEXT[],
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "isAdvertiser" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
    "archivedAt" TIMESTAMP(3),
    "accountPhone" TEXT,
    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_accounts" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sessionString" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitored_groups" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupName" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monitored_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requestId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'NEW_REQUEST',
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- ─── Step 3: Create Indexes ────────────────────────────────────────────────────
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "requests_status_idx" ON "requests"("status");
CREATE INDEX "requests_country_idx" ON "requests"("country");
CREATE INDEX "requests_serviceType_idx" ON "requests"("serviceType");
CREATE INDEX "requests_capturedAt_idx" ON "requests"("capturedAt");
CREATE INDEX "requests_expiresAt_idx" ON "requests"("expiresAt");
CREATE UNIQUE INDEX "telegram_accounts_phone_key" ON "telegram_accounts"("phone");
CREATE UNIQUE INDEX "monitored_groups_accountId_groupId_key" ON "monitored_groups"("accountId", "groupId");
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- ─── Step 4: Foreign Keys ──────────────────────────────────────────────────────
ALTER TABLE "monitored_groups" ADD CONSTRAINT "monitored_groups_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "telegram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Step 5: Seed Admin User ───────────────────────────────────────────────────
-- Password: ehab20633 (bcrypt hashed)
INSERT INTO "users" ("id", "username", "email", "passwordHash", "role", "status", "fullName", "updatedAt")
VALUES (
    gen_random_uuid()::text,
    'EhabSH',
    'ehab6847@gmail.com',
    '$2a$10$Ai9nuHqe6nmRQoOMBZw2DOxVvqkzClaKicwOiIb7Q5Z7vbElh9Rpe',
    'ADMIN',
    'ACTIVE',
    'Ehab SH',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("username") DO NOTHING;

-- ─── Done! ────────────────────────────────────────────────────────────────────
-- Tables created: users, requests, telegram_accounts, monitored_groups,
--                 notifications, activity_logs, system_settings
-- Admin user: EhabSH / ehab6847@gmail.com
-- ⚠️  Note: Change admin password after first login via Settings page
