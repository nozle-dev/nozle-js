# Nozle JavaScript SDK

**Official TypeScript/JavaScript SDKs for integrating Nozle billing into your applications.**

Add usage-based billing, subscriptions, and entitlements to your SaaS with just a few lines of code.

---

## 📦 Packages

This monorepo contains 3 packages:

### [@nozle-js/react](./packages/react) ![npm](https://img.shields.io/npm/v/@nozle-js/react)
**Client-side SDK** - React hooks and components

```bash
npm install @nozle-js/react
```

**Features:**
- React hooks for billing state (`useCan`, `usePlan`, `useUsage`)
- Pre-built UI components (`<PlanGate>`, `<FeatureGate>`)
- Real-time usage tracking
- Feature gates and entitlements
- TypeScript support

**[📖 Full Documentation →](./packages/react/README.md)**

---

### [@nozle-js/node](./packages/node) ![npm](https://img.shields.io/npm/v/@nozle-js/node)
**Server-side SDK** - Node.js API client

```bash
npm install @nozle-js/node
```

**Features:**
- Track usage from your backend
- Check entitlements server-side
- LLM auto-capture (OpenAI, Anthropic)
- Atomic credit deduction
- Customer management

**[📖 Full Documentation →](./packages/node/README.md)**

---

### [@nozle-js/create-app](./packages/create-app) ![npm](https://img.shields.io/npm/v/@nozle-js/create-app)
**CLI tool** - Scaffold Next.js apps with Nozle pre-integrated

```bash
npx create-nozle-app my-app
```

**Features:**
- Choose from 4 production-ready templates
- Full billing UI already built
- Demo mode for instant testing
- Templates fetched fresh from GitHub

**[📖 Full Documentation →](./packages/create-app/README.md)**

---

## 🚀 Quick Start

### For New Projects

The fastest way to get started:

```bash
npx create-nozle-app my-app
cd my-app
npm run dev
```

Choose a template and you'll have a working billing UI in 2 minutes.

### For Existing Projects

Install both client and server SDKs:

```bash
npm install @nozle-js/react @nozle-js/node
```

**Client-side usage:**

```tsx
import { BillingProvider, useCan } from '@nozle-js/react'

// Wrap your app
function App() {
  return (
    <BillingProvider apiKey={process.env.NEXT_PUBLIC_NOZLE_KEY}>
      <YourApp />
    </BillingProvider>
  )
}

// Check feature access
function PremiumFeature() {
  const { allowed } = useCan('advanced-analytics')
  
  if (!allowed) {
    return <UpgradePrompt />
  }
  
  return <AnalyticsDashboard />
}
```

**Server-side usage:**

```typescript
import { Nozle } from '@nozle-js/node'

const nozle = new Nozle({
  apiKey: process.env.NOZLE_API_KEY
})

// Track usage
await nozle.track(customerId, 'api_calls', {
  endpoint: '/api/generate',
  tokens: 1500
})

// Check entitlements
const result = await nozle.can(customerId, 'advanced-analytics')
if (!result.allowed) {
  throw new Error('Feature not available on your plan')
}
```

---

## 📚 Documentation

Comprehensive guides available in the [`docs/`](./docs) directory:

- **[Architecture](./docs/architecture.md)** - System design and components
- **[SDKs](./docs/sdks.md)** - Complete SDK reference
- **[create-nozle-app](./docs/create-nozle-app.md)** - CLI documentation

---

## 🏗️ Development

This is a monorepo managed with npm workspaces.

### Setup

```bash
# Clone repository
git clone https://github.com/nozle-dev/nozle-js.git
cd nozle-js

# Install dependencies
npm install
```

### Package Structure

```
nozle-js/
├── packages/
│   ├── react/           # @nozle-js/react
│   │   ├── src/         # React hooks and components
│   │   └── package.json
│   │
│   ├── node/            # @nozle-js/node
│   │   ├── src/         # Node.js SDK
│   │   └── package.json
│   │
│   └── create-app/      # @nozle-js/create-app
│       ├── src/         # CLI tool
│       └── package.json
│
├── docs/                # Documentation
└── package.json         # Workspace root
```

### Working on Packages

```bash
# Build all packages
npm run build -w packages/react
npm run build -w packages/node
npm run build -w packages/create-app

# Test a package
npm test -w packages/react

# Publish (maintainers only)
npm publish -w packages/react
```

---

## 🎯 Use Cases

### What You Can Build

- **SaaS Applications** - Usage-based billing for API platforms
- **AI/LLM Apps** - Token-based pricing for AI services
- **Infrastructure Tools** - Compute hour billing
- **Creative Platforms** - Credit-based marketplaces
- **Team Tools** - Seat-based subscriptions

### Templates Available

The `create-nozle-app` CLI provides 4 ready-to-use templates:

1. **flat-subscription** - Tiered plans (Notion, Linear style)
2. **saas-usage** - Base + usage overage (Stripe, Twilio style)
3. **compute** - Graduated pricing (Vercel, Railway style)
4. **credit-based** - Prepaid credits (Canva, Midjourney style)

Each template includes:
- Complete billing UI
- Usage tracking
- Feature gates
- Pricing pages
- Dashboard

---

## 🔗 Links

- **Templates Repository:** [github.com/nozle-dev/templates](https://github.com/nozle-dev/templates)
- **Documentation:** [docs.nozle.dev](https://docs.nozle.dev)
- **Dashboard:** [app.nozle.dev](https://app.nozle.dev)
- **Website:** [nozle.dev](https://nozle.dev)

---

## 📄 License

MIT License - see individual packages for details

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

For bugs and feature requests, [open an issue](https://github.com/nozle-dev/nozle-js/issues).

---

**Built for developers building SaaS with usage-based billing** ❤️
