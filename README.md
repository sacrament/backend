# 🎯 Winky Backend

A modern, production-ready Node.js backend for real-time chat and video calling application.

## 📂 Quick Navigation

- **Getting Started**: [Quick Start Guide](#-quick-start)
- **Architecture**: [Server Structure](#-architecture)
- **Documentation**: [docs/README.md](docs/README.md)
- **Deployment**: [docs/guides/DEPLOYMENT_CHECKLIST.md](docs/guides/DEPLOYMENT_CHECKLIST.md)

## 📂 Project Layout

```
chat-backend/
├── server/              # Application code
│   ├── api/             # REST API routes and controllers
│   ├── config/          # Configuration files
│   ├── middleware/      # Express/Socket.IO middleware
│   ├── models/          # Database models (Mongoose, Sequelize)
│   ├── services/        # Business logic services
│   ├── socket/          # Socket.IO event handlers
│   ├── notifications/   # Push notification services
│   ├── utils/           # Utility functions
│   ├── app.js           # Express app
│   ├── Makefile         # Docker commands
│   ├── .env.example     # Configuration template
│   └── package.json     # Dependencies
├── docs/                # Architecture & deployment guides
├── .vscode/             # VS Code configuration
└── README.md           # This file
```

## ✨ Features

- ✅ Real-time chat with Socket.IO v4.7.0
- ✅ Video calling via Twilio
- ✅ Push notifications (iOS/Android)
- ✅ User authentication with JWT
- ✅ Contact management
- ✅ Message reactions and media attachments
- ✅ MongoDB support
- ✅ Redis caching for production

## 📦 Technology Stack

| Category | Technology |
|----------|-----------|
| **Runtime** | Node.js 14+ |
| **Framework** | Express.js 4.18.2 |
| **Real-time** | Socket.IO 4.7.0 |
| **Database** | MongoDB (Mongoose 7.5.0) |
| **Cache** | Redis |
| **Authentication** | JWT (jsonwebtoken) |
| **Video** | Twilio SDK |
| **Notifications** | Firebase, APNS |

## 🚀 Quick Start

### Prerequisites

- Node.js 14+
- MongoDB
- Redis (optional, for production)

### Installation

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your configuration
npm start
```

### Environment Variables

See `server/.env.example` for all required variables:
- Database credentials (MongoDB)
- Twilio API keys
- JWT secret
- Push notification keys
- AWS credentials (if using S3)

## 📂 Project Organization

### Services (`server/services/`)

Business logic organized by domain:
- **domain/** - Core services (chat, user, calls)
- **external/** - Third-party integrations (AWS, Twilio)

[See Services Guide →](server/services/README.md)

### Socket Handlers (`server/socket/handlers/`)

Real-time event handlers organized by feature:
- **chat/** - Chat messaging events (~1392 lines)
- **calls/** - Video call events (~276 lines)
- **user/** - User and contact events (~344 lines)

[See Socket Guide →](server/socket/README.md)

## 🔧 Configuration

### Docker

```bash
cd server
make build    # Build Docker image
make publish  # Push to AWS ECR
```

### Local Development

```bash
cd server
npm install
npm start
```

### Production with PM2

```bash
cd server
npm install --production
pm2 start app.js --name "winky" --instances 4
```

## 📖 Documentation

Complete documentation available in `/docs`:

- **[GETTING_STARTED.md](docs/GETTING_STARTED.md)** - Overview and role-based navigation
- **[docs/guides/MIGRATION_GUIDE.md](docs/guides/MIGRATION_GUIDE.md)** - Developer setup and testing
- **[docs/guides/DEPLOYMENT_CHECKLIST.md](docs/guides/DEPLOYMENT_CHECKLIST.md)** - Production deployment
- **[docs/guides/SERVICES_ARCHITECTURE.md](docs/guides/SERVICES_ARCHITECTURE.md)** - Services structure
- **[docs/analysis/REFACTORING_REPORT.md](docs/analysis/REFACTORING_REPORT.md)** - Technical changes

## 🔐 Security

- ✅ JWT-based authentication
- ✅ Environment variables for secrets (no hardcoding)
- ✅ Input validation on all routes
- ✅ CORS configuration
- ✅ Rate limiting ready
- ✅ No known vulnerabilities (npm audit: 0)

## 🎯 Status

- **Last Refactored:** January 12, 2026
- **Node Packages:** All up-to-date
- **Security:** 0 vulnerabilities
- **Code Quality:** Organized and maintainable

### Recent Improvements (2026-01-12)

- ✅ Upgraded Socket.IO from v2.5.0 → v4.7.0
- ✅ Fixed memory leaks and circular dependencies
- ✅ Reorganized services into domain/external structure
- ✅ Refactored socket handlers into organized folders
- ✅ Added comprehensive documentation
- ✅ All credentials moved to environment variables
- ✅ Cleaned up project structure
- ✅ Consolidated documentation

## 📞 Support

For issues or questions, check:
- [Services Architecture](docs/guides/SERVICES_ARCHITECTURE.md)
- [Socket Module Guide](server/socket/README.md)
- [Refactoring Report](docs/analysis/REFACTORING_REPORT.md)

## 📄 License

See [server/LICENSE](server/LICENSE) file for details.

---

**Ready to get started?** → [Installation](#-quick-start)  
**Want to understand the architecture?** → [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)  
**Deploying to production?** → [docs/guides/DEPLOYMENT_CHECKLIST.md](docs/guides/DEPLOYMENT_CHECKLIST.md)
