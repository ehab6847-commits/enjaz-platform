# Enjaz Platform Bot — Backend

A production-ready Node.js/Express backend for the **Enjaz Platform Bot**, a Telegram monitoring system that captures academic service requests using AI classification.

## 🏗️ Architecture

```
src/
├── config/
│   ├── database.js        # Prisma client singleton
│   └── logger.js          # Winston logger with file rotation
├── middleware/
│   ├── auth.js            # JWT verification + role guards
│   ├── rateLimiter.js     # Express rate limiting
│   └── validate.js        # Zod schema validation
├── routes/
│   ├── auth.routes.js
│   ├── requests.routes.js
│   ├── telegram.routes.js
│   ├── users.routes.js
│   └── notifications.routes.js
├── controllers/
│   ├── auth.controller.js
│   ├── requests.controller.js
│   ├── telegram.controller.js
│   ├── users.controller.js
│   └── notifications.controller.js
├── services/
│   ├── ai/
│   │   └── classifier.js         # OpenAI GPT-4o-mini + keyword fallback
│   ├── telegram/
│   │   └── listener.js           # gramJS listeners for all accounts
│   └── notifications/
│       └── notifier.js           # DB + Socket.io + Telegram bot notifier
├── jobs/
│   └── archiver.js               # Cron jobs (archive, cleanup, health check)
└── utils/
    ├── jwt.js                     # JWT helper functions
    ├── socket.js                  # Socket.io singleton
    └── seed.js                    # Admin user seeder
```

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Setup database

```bash
npx prisma migrate dev --name init
npm run db:seed
```

### 4. Start development server

```bash
npm run dev
```

## 📡 API Endpoints

### Authentication (`/api/auth`)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/login` | Authenticate and get JWT tokens |
| POST | `/register` | Register new specialist (pending approval) |
| POST | `/verify-2fa` | Verify TOTP code for 2FA login |
| POST | `/refresh` | Get new access token from refresh token |
| POST | `/logout` | Revoke refresh token |
| GET | `/me` | Get current user profile |
| POST | `/setup-2fa` | Generate TOTP secret + QR code |
| POST | `/enable-2fa` | Enable 2FA after verifying TOTP |
| POST | `/disable-2fa` | Disable 2FA |

### Requests (`/api/requests`) — Auth required
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | List requests (filters: country, serviceType, status, priority, search, page, limit) |
| GET | `/stats` | Dashboard statistics |
| GET | `/:id` | Get single request (auto-marks as VIEWED) |
| PUT | `/:id/status` | Update status/priority |
| DELETE | `/:id` | Delete request |

### Telegram (`/api/telegram`) — Admin only
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/accounts` | List all Telegram accounts |
| POST | `/accounts` | Add new account with session string |
| DELETE | `/accounts/:id` | Remove account |
| GET | `/accounts/:id/groups` | Get account's monitored groups |
| POST | `/accounts/:id/groups` | Add monitored group |
| POST | `/accounts/:id/toggle` | Toggle account active state |
| GET | `/groups` | All monitored groups |
| PUT | `/groups/:id/toggle` | Toggle group monitoring |
| DELETE | `/groups/:id` | Remove group |

### Users (`/api/users`) — Admin only
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | List all users |
| GET | `/:id` | Get user details |
| PUT | `/:id` | Update user |
| POST | `/:id/approve` | Approve pending specialist |
| POST | `/:id/reject` | Block/reject user |
| DELETE | `/:id` | Delete user |

### Notifications (`/api/notifications`) — Auth required
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | List notifications |
| GET | `/unread-count` | Count unread |
| POST | `/:id/read` | Mark as read |
| POST | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete notification |

## 🔌 Socket.io Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `join:admin` | Client → Server | — |
| `join:user` | Client → Server | `userId` |
| `new_request` | Server → Client | `{ request, classification }` |
| `notification` | Server → Client | `Notification object` |

## 🤖 AI Classification

The classifier uses **OpenAI GPT-4o-mini** with an Arabic-language system prompt to detect:
- Message type: `request`, `advertisement`, `chat`, `spam`
- Service type (14 categories in Arabic)
- Confidence score (0.0 – 1.0)
- Priority: `URGENT`, `NORMAL`, `LOW`
- Keywords

Falls back to **keyword matching** if OpenAI is unavailable.

Only requests with `confidenceScore >= 0.5` are saved to the database.

## ⏱️ Cron Jobs

| Schedule | Job |
|----------|-----|
| Every hour | Archive requests older than 24h |
| Daily 2:00 AM | Delete archives older than 7 days |
| Every 5 min | Check Telegram session health |
| Daily 3:00 AM | Clean activity logs older than 30 days |
| Daily 3:30 AM | Clean read notifications older than 14 days |

## 🐳 Docker

```bash
docker build -t enjaz-backend .
docker run -p 5000:5000 --env-file .env enjaz-backend
```

## 🔐 Admin Credentials (Development)

After running `npm run db:seed`:
- **Username**: `EhabSH`
- **Email**: `ehab6847@gmail.com`
- **Password**: `ehab20633`

> ⚠️ Change credentials immediately in production!
