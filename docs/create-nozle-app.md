# create-nozle-app

CLI tool to scaffold Next.js applications with Nozle billing pre-integrated.

[← Back to Documentation](./README.md)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Available Templates](#available-templates)
- [Quick Start](#quick-start)
- [CLI Options](#cli-options)
- [Generated App Structure](#generated-app-structure)
- [Configuration](#configuration)
- [Next Steps](#next-steps)

---

## Overview

**create-nozle-app** scaffolds a production-ready Next.js application with Nozle billing SDK already integrated.

**What you get**:
- ✅ Next.js 16 with App Router & TypeScript
- ✅ @nozle-js/react and @nozle-js/node pre-installed
- ✅ Working demo with mock data
- ✅ Dashboard, pricing, and billing pages
- ✅ Tailwind CSS + shadcn/ui components
- ✅ Feature gating examples
- ✅ Environment configuration templates

**Time to working app**: ~2 minutes

---

## Installation

```bash
# Interactive mode (recommended)
npx create-nozle-app

# With project name
npx create-nozle-app my-billing-app

# Or install globally
npm install -g @nozle-js/create-app
create-nozle-app my-app
```

**Requirements**:
- Node.js 18+
- npm, pnpm, yarn, or bun

---

## Available Templates

Choose from 4 production-ready billing templates:

### 1. **flat-subscription** - Fixed Monthly Plans
**Best for:** SaaS with tiered features
- Flat subscription pricing (Free, Pro, Enterprise)
- Plan-based feature gating
- Seat/user limits
- **Example:** Notion, Linear, Slack

### 2. **saas-usage** - Base + Usage Overage
**Best for:** API platforms
- Base subscription + metered usage
- Usage tracking and billing
- Overage charges
- **Example:** Stripe, Twilio, SendGrid

### 3. **compute** - Graduated Usage Tiers
**Best for:** Cloud infrastructure
- Tiered compute hours pricing
- Volume discounts
- Usage-based billing
- **Example:** Vercel, Railway, AWS

### 4. **credit-based** - Prepaid Credit Packs
**Best for:** Creative tools & marketplaces
- Buy credit packs
- Spend credits per action
- Action marketplace UI
- **Example:** Canva, Midjourney

---

## Quick Start

### 1. Create Your App

```bash
npx create-nozle-app my-app
```

You'll be prompted to:
1. Choose a template (flat-subscription, saas-usage, etc.)
2. Select package manager (npm, pnpm, yarn, bun)
3. Confirm installation

### 2. Start Development Server

```bash
cd my-app
npm install
npm run dev
```

Visit http://localhost:3000

### 3. Explore Demo Mode

The app runs in **demo mode** by default:
- No database required
- Mock billing data
- Pre-filled login credentials
- All features working

**Demo Login:**
- Email: `demo@example.com`
- Password: `demo123`

---

## CLI Options

```bash
npx create-nozle-app [project-name] [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --template <type>` | Template: `flat-subscription`, `saas-usage`, `compute`, `credit-based` | Interactive prompt |
| `-p, --pkg-manager <manager>` | Package manager: npm, pnpm, yarn, bun | Auto-detect |
| `--no-install` | Skip dependency installation | `false` |
| `-h, --help` | Show help | |
| `-V, --version` | Show version | |

### Examples

```bash
# Interactive mode
npx create-nozle-app

# Specify template
npx create-nozle-app my-app --template saas-usage

# Use pnpm
npx create-nozle-app my-app --pkg-manager pnpm

# Skip install (for CI)
npx create-nozle-app my-app --no-install
```

---

## Generated App Structure

```
my-app/
├── app/
│   ├── layout.tsx            # BillingProvider wrapper
│   ├── page.tsx              # Homepage
│   │
│   ├── dashboard/
│   │   └── page.tsx          # Usage dashboard
│   │
│   ├── pricing/
│   │   └── page.tsx          # Pricing page
│   │
│   └── api/
│       ├── track/            # Usage tracking endpoint
│       ├── checkout/         # Checkout endpoint
│       └── can/              # Feature gate check
│
├── lib/
│   ├── nozle-client.ts       # Server-side Nozle SDK
│   └── utils.ts              # Helper functions
│
├── components/               # Reusable UI components
├── .env.example              # Environment template
├── package.json
└── README.md
```

---

## Configuration

### Environment Variables

Each template includes `.env.example`:

```env
# Nozle Configuration
NOZLE_API_KEY=your_secret_key_here
NEXT_PUBLIC_NOZLE_PUBLIC_KEY=your_public_key_here

# Demo Mode (default: true)
NEXT_PUBLIC_DEMO_MODE=true

# Optional: Stripe Integration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
```

### Demo Mode

Templates run in demo mode by default:
- ✅ No API keys needed
- ✅ Mock data for all features
- ✅ Pre-configured users
- ✅ Working UI components

**To use real billing:**
1. Get your Nozle API keys from [dashboard](https://app.nozle.dev)
2. Add keys to `.env.local`
3. Set `NEXT_PUBLIC_DEMO_MODE=false`
4. Configure your plans and metrics in Nozle dashboard

---

## Next Steps

### 1. Explore the Generated App

- **Homepage** (`/`) - Landing page
- **Dashboard** (`/dashboard`) - Usage metrics & billing info
- **Pricing** (`/pricing`) - Plan comparison & checkout

### 2. Customize Your App

- Edit pages in `app/`
- Modify components in `components/`
- Update styles with Tailwind CSS
- Configure billing in Nozle dashboard

### 3. Add Authentication

The templates don't include auth by default. Add your preferred solution:

**Recommended:**
- [Clerk](https://clerk.com) - Modern auth for Next.js
- [NextAuth.js](https://next-auth.js.org) - Flexible auth library
- [Supabase Auth](https://supabase.com/auth) - Open source auth

### 4. Deploy

```bash
# Build for production
npm run build

# Deploy to Vercel (recommended)
vercel deploy

# Or any Next.js hosting platform
```

**Remember to:**
- Set environment variables in deployment platform
- Use production Nozle API keys
- Configure your domain

---

## Template Comparison

| Template | Billing Model | Best For | Key Feature |
|----------|---------------|----------|-------------|
| flat-subscription | Fixed monthly/annual | SaaS products | Plan-based gates |
| saas-usage | Base + usage | API platforms | Metered billing |
| compute | Graduated tiers | Infrastructure | Volume discounts |
| credit-based | Prepaid credits | Marketplaces | Action-based spend |

---

## Learn More

- [SDK Documentation](./sdks.md) - Full SDK reference
- [Architecture](./architecture.md) - How it all works
- [Nozle Dashboard](https://app.nozle.dev) - Configure billing
- [Templates Repository](https://github.com/nozle-dev/templates) - Template source code

---

**Last Updated**: June 23, 2026
