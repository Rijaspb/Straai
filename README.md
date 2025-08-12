# Straai 🚀

**Shopify + Klaviyo conversational analytics for SMBs**

Get insights from your e-commerce data through natural conversation. Straai connects your Shopify store and Klaviyo email marketing to provide AI-powered analytics that you can query in plain English.

## 🏗️ Project Structure

This is a TypeScript monorepo with the following structure:

```
straai/
├── client/          # React 18 + Vite + TypeScript + Tailwind + shadcn/ui
├── server/          # Node.js + Express + TypeScript API
├── prisma/          # Database schema and migrations
├── .github/         # GitHub Actions CI/CD
└── package.json     # Workspace configuration
```

## ⚡ Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- PostgreSQL database (or Supabase account)
- Git

### One-Click Development Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd straai

# Install all dependencies
npm install

# Set up environment files
# Windows (PowerShell):
.\scripts\setup-env.ps1

# Unix/Linux/Mac:
./scripts/setup-env.sh

# Configure your Supabase credentials (see Environment Setup below)
# Edit .env and client/.env with your actual Supabase values

# Set up database (generate client, run migrations, seed data)
npm run db:setup

# Start development servers (client + server)
npm run dev
```

This will start:
- Client: http://localhost:3000
- Server: http://localhost:8000
- API available at: http://localhost:3000/api (proxied)

## 🔧 Environment Setup

Copy `env.example` to `.env` and configure the following:

### Database (Choose one)

**Option 1: Local PostgreSQL**
```env
DATABASE_URL="postgresql://username:password@localhost:5432/straai_dev"
```

**Option 2: Supabase (Recommended for Auth + Database)**
```env
# In root .env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="your_supabase_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"

# In client/.env
VITE_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"
```

## 💳 Stripe Billing Setup

1. Configure environment variables in root `.env` (see `env.example`):
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
2. Start the API server: `cd server && npm run dev`.
3. In another terminal, forward webhooks:
   ```bash
   stripe listen --forward-to localhost:8000/api/billing/webhook
   ```
   Copy the `whsec_...` value and set `STRIPE_WEBHOOK_SECRET`.
4. Start a trial subscription (no card required):
   - `POST /api/billing/create-customer-and-subscription` with `{ "priceId": "price_..." }`, or
   - `POST /api/billing/start-trial` (uses `STRIPE_PRICE_ID`).
5. Manage subscription via Stripe Billing Portal:
   - `GET /api/billing/portal` (Dashboard has a Manage Billing button).
   - `POST /api/billing/cancel` to cancel at period end, or `POST /api/billing/cancel-now` to end immediately.
6. Webhooks handled: `customer.subscription.created|updated|deleted`, `invoice.payment_succeeded|failed|upcoming`.
   - On `invoice.upcoming`, if `RESEND_API_KEY` is set, an email is sent prompting to add a payment method.

### Required API Keys

```env
# OpenAI (for conversational analytics)
OPENAI_API_KEY="sk-..."

# Stripe (for subscription billing)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Resend (for transactional emails)
RESEND_API_KEY="re_..."

# Shopify (for store integration)
SHOPIFY_CLIENT_ID="your_shopify_app_client_id"
SHOPIFY_CLIENT_SECRET="your_shopify_app_client_secret"

# Klaviyo (for email marketing integration)
KLAVIYO_CLIENT_ID="your_klaviyo_client_id"
KLAVIYO_CLIENT_SECRET="your_klaviyo_client_secret"
```

### How to Get API Keys

- **Supabase**: [supabase.com](https://supabase.com) → Create Project → Settings → API
- **OpenAI**: [platform.openai.com](https://platform.openai.com)
- **Stripe**: [dashboard.stripe.com](https://dashboard.stripe.com/apikeys)
- **Resend**: [resend.com/api-keys](https://resend.com/api-keys)
- **Shopify**: [partners.shopify.com](https://partners.shopify.com) → Create App
- **Klaviyo**: [developers.klaviyo.com](https://developers.klaviyo.com)

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Settings → API to get your keys
3. Enable Google OAuth in Authentication → Settings → Auth Providers
4. Set up redirect URLs:
   - `http://localhost:3000/auth/callback` (development)
   - `https://yourdomain.com/auth/callback` (production)
5. Configure email templates in Authentication → Settings → Email Templates

## 📝 Available Scripts

### Root Level (Monorepo)
```bash
npm run dev          # Start both client and server in development
npm run build        # Build both client and server for production
npm run start        # Start production server
npm run lint         # Lint all workspaces
npm run lint:fix     # Fix linting issues
npm run type-check   # TypeScript type checking
npm run test         # Run tests in all workspaces
```

### Database Operations
```bash
npm run db:setup     # Full setup: generate + migrate + seed
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Create and run migrations
npm run db:push      # Push schema changes to database (dev only)
npm run db:seed      # Seed database with sample data
npm run db:reset     # Reset database and re-run migrations
npm run db:studio    # Open Prisma Studio (database GUI)
```

### Individual Workspaces
```bash
npm run dev:client   # Start only client (React app)
npm run dev:server   # Start only server (Express API)
```

## 🗄️ Database Schema

The application uses PostgreSQL with Prisma ORM. Key entities:

### Core Models

- **User**: Application users with authentication and profile data
  - `id` (UUID), `email`, `passwordHash`, `supabaseId`, `emailVerified`
  - `timezone`, `companyName`, soft delete support

- **Store**: Connected Shopify stores
  - `shopifyShopDomain`, `shopifyAccessToken`
  - `installedAt`, `lastSyncAt` for sync tracking

- **KlaviyoIntegration**: Klaviyo account connections
  - `accountId`, `accessToken`, `refreshToken`, `expiresAt`
  - OAuth token management with refresh capability

- **Subscription**: Stripe subscription management
  - `stripeCustomerId`, `stripeSubscriptionId`, `status`
  - `trialEndsAt`, `currentPeriodEnd` for billing cycles

- **Report**: Generated weekly PDF reports
  - `weekOf` (date), `pdfPath`, `generatedAt`
  - Unique constraint per user/store/week

- **Conversation**: AI chat conversations
  - `messages` (JSONB) for chat history
  - Optimized for conversational analytics queries

### Key Features
- UUID primary keys for all models
- Soft delete support (`deletedAt`)
- Comprehensive indexing for performance
- Foreign key constraints with cascade deletes
- JSONB for flexible message storage

## 🔐 Authentication

Straai uses Supabase Auth for secure authentication with the following features:

### Supported Auth Methods
- **Email/Password**: Traditional signup and login
- **Google OAuth**: One-click social authentication  
- **Email Verification**: Secure account activation
- **Password Reset**: Self-service password recovery

### Security Features
- JWT-based authentication
- Automatic token refresh
- Protected API routes
- User session management
- Supabase RLS (Row Level Security) ready

### Auth Flow
1. User signs up/logs in via frontend auth form
2. Supabase handles authentication and JWT generation
3. Frontend stores session and includes JWT in API calls
4. Backend middleware verifies JWT with Supabase
5. User data syncs between Supabase Auth and local database

### Frontend Auth Components
- `AuthForm`: Tabbed signup/login with Google OAuth
- `AuthCallback`: Handles OAuth redirects
- `ResetPassword`: Self-service password reset
- `useAuthStore`: Zustand store for auth state management

### Backend Auth Middleware
- `authenticate`: Protects routes requiring authentication
- `optionalAuth`: Adds user context if authenticated
- User sync endpoints for database synchronization

## 🚀 Deployment

### Production Build
```bash
npm run build
npm run start
```

### Environment Variables for Production
Make sure to set all environment variables from `env.example` in your production environment.

### Database Migrations
```bash
# In production, run migrations instead of db:push
npm run db:migrate
```

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests for specific workspace
npm run test --workspace=client
npm run test --workspace=server
```

## 🛠️ Development Tools

This project includes:

- **ESLint**: Code linting
- **Prettier**: Code formatting  
- **Husky**: Git hooks
- **lint-staged**: Pre-commit linting
- **TypeScript**: Type safety
- **Prisma**: Database ORM
- **Tailwind CSS**: Utility-first CSS
- **shadcn/ui**: React component library

## 🔄 Git Workflow

Pre-commit hooks automatically:
- Run ESLint and fix issues
- Format code with Prettier
- Run TypeScript checks

## 📦 Tech Stack

### Frontend (Client)
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **React Router** - Client-side routing

### Backend (Server)
- **Node.js** - Runtime
- **Express** - Web framework
- **TypeScript** - Type safety
- **Prisma** - Database ORM
- **PostgreSQL** - Database

### DevOps & Tools
- **GitHub Actions** - CI/CD
- **Husky** - Git hooks
- **ESLint/Prettier** - Code quality
- **Vite Proxy** - Development API routing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues

**Database connection fails**
- Verify DATABASE_URL in .env
- Ensure PostgreSQL is running
- Check database credentials

**API calls fail in development**
- Verify server is running on port 8000
- Check Vite proxy configuration
- Ensure environment variables are set

**Build fails**
- Run `npm run type-check` to find TypeScript errors
- Ensure all dependencies are installed
- Check for ESLint errors

**Prisma issues**
- Run `npm run db:generate` after schema changes
- Use `npm run db:migrate` to create and run migrations
- Use `npm run db:push` for rapid prototyping (development only)
- Use `npm run db:seed` to populate with sample data
- Use `npm run db:reset` to reset database and re-run all migrations

**Database setup**
- For development: Use `npm run db:migrate` followed by `npm run db:seed`
- For production: Use `npm run db:migrate` (never use db:push)
- UUIDs are used for all primary keys for better scalability
- Soft deletes are implemented via `deletedAt` field

### Getting Help

- Check existing [GitHub Issues](../../issues)
- Create a new issue with detailed description
- Include error messages and environment details
#   S t r a a i  
 