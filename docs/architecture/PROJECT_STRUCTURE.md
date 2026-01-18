# 📁 Project Structure & Architecture Guide

## Directory Organization

After refactoring, the project is organized as follows:

```
chat-backend/
│
├── docs/                              # 📚 All documentation
│   ├── README.md                      # Main documentation hub
│   ├── GETTING_STARTED.md             # Quick start for all roles
│   │
│   ├── guides/                        # 👨‍💻 How-to guides for tasks
│   │   ├── MIGRATION_GUIDE.md         # Developer setup & development
│   │   └── DEPLOYMENT_CHECKLIST.md    # Deployment procedures
│   │
│   └── analysis/                      # 🔬 Technical analysis & reports
│       ├── REFACTORING_COMPLETED.md   # Detailed changes made
│       ├── CIRCULAR_DEPENDENCIES_ANALYSIS.md  # Architecture analysis
│       └── REFACTORING_REPORT.md      # Initial findings
│
├── server/                            # 🖥️ Backend application
│   ├── .env.example                   # Configuration template
│   ├── .env                           # (CREATED LOCALLY, not in git)
│   ├── package.json                   # Updated dependencies
│   │
│   ├── app.js                         # Express app setup (UPDATED)
│   ├── index.js                       # Router setup
│   │
│   ├── api/
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── middleware/
│   │
│   ├── config/
│   │   ├── socket.js                  # Socket.IO setup (REFACTORED)
│   │   ├── database.js                # MongoDB connection
│   │   ├── sequelize.js
│   │   └── index.js
│   │
│   ├── middleware/
│   │   ├── socket.auth.js             # JWT authentication (NEW)
│   │   └── verify.js                  # Token verification
│   │
│   ├── models/                        # Mongoose models
│   │   ├── user.js
│   │   ├── chat.js
│   │   ├── message.js
│   │   ├── reaction.js
│   │   ├── media.js
│   │   ├── content.storage.js
│   │   ├── user.blocked.js
│   │   ├── user.connect.js
│   │   ├── user.request.js
│   │   ├── calls/
│   │   ├── mysql/
│   │   └── ...
│   │
│   ├── communication/                 # Socket.IO event handlers
│   │   ├── index.js                   # Chat events
│   │   ├── calls.js                   # Call events
│   │   └── user.js                    # User events
│   │
│   ├── services/                      # Business logic
│   │   ├── user.service.js
│   │   ├── contact.service.js
│   │   ├── chat/
│   │   ├── call/
│   │   ├── sms/
│   │   ├── pushNotification/
│   │   └── aws/
│   │
│   ├── notifications/
│   │   ├── index.js
│   │   ├── user.js
│   │   └── voip.js
│   │
│   ├── socket/                        # Socket utilities
│   │   └── index.js
│   │
│   ├── utils/
│   │   ├── config.js                  # Configuration (UPDATED)
│   │   └── index.js
│   │
│   ├── certs/
│   └── tmp/
│
├── .env.example                       # Configuration template (in root)
├── .gitignore                         # Git ignore rules (UPDATED)
├── package.json
├── LICENSE
├── Makefile
├── README.md                          # Original project README
├── zootch.config.js
│
└── (old documentation files - root level, can be archived)
    ├── FINAL_SUMMARY.md              → docs/GETTING_STARTED.md
    ├── README_REFACTORING.md         → docs/README.md
    ├── DOCUMENTATION_INDEX.md        → docs/README.md
    ├── MIGRATION_GUIDE.md            → docs/guides/MIGRATION_GUIDE.md
    ├── DEPLOYMENT_CHECKLIST.md       → docs/guides/DEPLOYMENT_CHECKLIST.md
    ├── REFACTORING_COMPLETED.md      → docs/analysis/REFACTORING_COMPLETED.md
    ├── CIRCULAR_DEPENDENCIES_ANALYSIS.md → docs/analysis/CIRCULAR_DEPENDENCIES_ANALYSIS.md
    └── REFACTORING_REPORT.md         → docs/analysis/REFACTORING_REPORT.md
```

---

## Documentation Navigation

### 📍 For Different Users

```
Starting Point → Your Role → Recommended Path
    ↓
 docs/README.md (main hub)
    ├─→ 👨‍💼 Project Manager/Team Lead
    │    └─→ GETTING_STARTED.md → guides/DEPLOYMENT_CHECKLIST.md
    │
    ├─→ 👨‍💻 Developer
    │    └─→ GETTING_STARTED.md → guides/MIGRATION_GUIDE.md
    │
    ├─→ 🔧 DevOps/Infrastructure
    │    └─→ GETTING_STARTED.md → guides/DEPLOYMENT_CHECKLIST.md
    │
    ├─→ 🏗️ Architect/Senior Dev
    │    └─→ GETTING_STARTED.md → analysis/CIRCULAR_DEPENDENCIES_ANALYSIS.md
    │
    └─→ 📊 Reviewer/QA
         └─→ GETTING_STARTED.md → analysis/REFACTORING_REPORT.md
```

---

## File Organization Rationale

### `docs/` Directory
**Purpose**: Central documentation hub
- Keeps all documentation organized and separate from code
- Easier to maintain and version control
- Clear structure for different audiences

### `docs/guides/`
**Purpose**: Practical "how-to" guides
- **MIGRATION_GUIDE.md**: Step-by-step setup and development
- **DEPLOYMENT_CHECKLIST.md**: Deployment procedures and verification
- These are action-oriented documents

### `docs/analysis/`
**Purpose**: Technical analysis and reference
- **REFACTORING_COMPLETED.md**: Complete technical reference of changes
- **CIRCULAR_DEPENDENCIES_ANALYSIS.md**: Deep architecture analysis
- **REFACTORING_REPORT.md**: Initial findings and issues discovered
- These are research and reference documents

### `docs/architecture/` (reserved)
**Purpose**: Architecture decisions and design documentation
- Future: ADRs (Architecture Decision Records)
- Future: System design diagrams
- Future: Data flow documentation

---

## Configuration Files

### `.env.example` (in root & `server/`)
- Template for environment variables
- Safe to commit to git
- Never commit actual `.env` file

### `server/.env` (NOT in git)
- Actual credentials and secrets
- Created locally from `.env.example`
- Never committed (protected by `.gitignore`)
- Set in deployment platform

### `server/package.json`
- Updated with modern dependency versions
- Socket.io: 2.5.0 → 4.7.0
- Mongoose: 5.10.12 → 7.5.0
- Removed deprecated packages

---

## Code Organization

### `server/config/socket.js` (REFACTORED)
- Modern socket.io setup using v4.x
- Uses new authentication middleware
- Fixed memory leaks
- Clean error handling

### `server/middleware/socket.auth.js` (NEW)
- Modern JWT authentication for socket.io
- Replaces deprecated `socketio-jwt` package
- Flexible token source handling
- Better error messages

### `server/utils/config.js` (UPDATED)
- Environment variable support with `dotenv`
- All credentials loaded from process.env
- Fallback values for development
- Never exposes secrets in code

---

## Key Changes Summary

### Moved to `docs/`
All documentation has been organized into the `docs/` directory structure:
- Separate concerns (guides vs analysis)
- Clear navigation structure
- Role-based documentation
- Easier to maintain

### Kept in `server/`
Configuration files stay in the server directory:
- `.env.example` - template
- All application code unchanged
- Easier for developers to find

### Kept in Root
- `.gitignore` - updated to protect `.env`
- `package.json` - main project
- `Makefile`, `README.md` - original files
- `.env.example` - for reference

---

## Best Practices Going Forward

### 1. Documentation
- Add new documentation to `docs/` directory
- Use appropriate subdirectory (guides, analysis, or architecture)
- Keep README.md files in each directory for navigation

### 2. Environment Variables
- Always use `.env.example` as template
- Never commit `.env` files
- Document required variables in `.env.example`
- Use strong secrets in production

### 3. Code Organization
- Keep configuration in `server/config/`
- Keep middleware in `server/middleware/`
- Keep services in `server/services/`
- Keep socket handlers in `server/communication/`

### 4. File Naming
- Document files: `UPPERCASE_WITH_UNDERSCORES.md`
- Code files: `camelCase.js` or `kebab-case.js` based on convention
- Configuration files: `.env*`, `*.config.js`

---

## Migration from Old Structure

### If you see old files in root:
These can now be archived or removed since they're in `docs/`:
```bash
# Archive old documentation
mkdir -p archived_docs
mv FINAL_SUMMARY.md archived_docs/
mv README_REFACTORING.md archived_docs/
mv DOCUMENTATION_INDEX.md archived_docs/
# ... etc
```

**Or keep them for backward compatibility** - they won't hurt anything.

---

## Quick Reference

### Documentation Locations
- **Start here**: `docs/README.md` or `docs/GETTING_STARTED.md`
- **Developer setup**: `docs/guides/MIGRATION_GUIDE.md`
- **Deployment**: `docs/guides/DEPLOYMENT_CHECKLIST.md`
- **Technical details**: `docs/analysis/REFACTORING_COMPLETED.md`
- **Architecture**: `docs/analysis/CIRCULAR_DEPENDENCIES_ANALYSIS.md`

### Configuration
- **Template**: `server/.env.example`
- **Local setup**: `server/.env` (create from template)
- **Code config**: `server/utils/config.js` (uses environment variables)

### Source Code
- **Socket setup**: `server/config/socket.js`
- **Authentication**: `server/middleware/socket.auth.js`
- **Services**: `server/services/`
- **Models**: `server/models/`
- **Routes**: `server/api/routes/`

---

## Index of All Documentation

| File | Location | Purpose |
|------|----------|---------|
| README.md | `docs/` | Documentation hub |
| GETTING_STARTED.md | `docs/` | Quick start guide |
| MIGRATION_GUIDE.md | `docs/guides/` | Developer setup |
| DEPLOYMENT_CHECKLIST.md | `docs/guides/` | Deployment procedures |
| REFACTORING_COMPLETED.md | `docs/analysis/` | Technical reference |
| CIRCULAR_DEPENDENCIES_ANALYSIS.md | `docs/analysis/` | Architecture analysis |
| REFACTORING_REPORT.md | `docs/analysis/` | Initial findings |

---

Created: January 12, 2026
Status: Ready for Use
Organized: ✅ Complete
