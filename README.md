# Smart Plug Monitor - Cloudflare Workers

A Cloudflare Workers application that monitors a Tuya smart plug status and tracks electricity schedules. Built with Hono framework.

## Features

- 🔌 **Smart Plug Monitoring**: Tracks Tuya smart plug online/offline status
- 📊 **Firebase Integration**: Stores status history in Firestore
- 📅 **Schedule Tracking**: Monitors electricity schedule updates
- 📲 **Telegram Notifications**: Sends alerts when power status changes
- 🌍 **Edge Computing**: Runs on Cloudflare's global network
- ⚡ **Fast & Lightweight**: Built with Hono for optimal performance
- 🔍 **Real-time Status**: Display current power status and history

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (v4.6+)
- **Database**: Firebase Firestore (v11+)
- **HTTP Client**: Axios (v1.7+)
- **Date/Time**: Day.js (v1.11+)
- **Utilities**: humanize-duration, short-uuid
- **Package Manager**: Yarn

## Setup

### Prerequisites

- Node.js 22+
- Yarn package manager
- Cloudflare account
- Tuya Cloud account with smart plug configured
- Firebase project

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd smart-plug
```

2. Install dependencies:
```bash
yarn install
```

3. Configure environment variables:
```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual credentials
```

### Development

Start the development server:
```bash
yarn dev
```

The worker will be available at `http://localhost:8787`

### Deployment

Deploy to Cloudflare Workers:
```bash
yarn deploy
```

## Environment Variables

All configuration is managed through environment variables. Copy `.dev.vars.example` to `.dev.vars` for local development.

### Required Variables:

**Firebase Configuration:**
- `FIREBASE_API_KEY` - Firebase API key
- `FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `FIREBASE_APP_ID` - Firebase app ID
- `FIREBASE_MEASUREMENT_ID` - Firebase measurement ID

**Tuya Smart Plug:**
- `TUYA_HOST` - Tuya API host (default: https://openapi.tuyaeu.com)
- `TUYA_ACCESS_KEY` - Tuya access key
- `TUYA_SECRET_KEY` - Tuya secret key
- `TUYA_DEVICE_ID` - Your device ID
- `TUYA_TIME_FORMAT` - Time format (default: YYYY-MM-DD HH:mm:ss)

**Electricity Schedule:**
- `SCHEDULE_API_URL` - Schedule API URL (default: https://api.loe.lviv.ua)

**Telegram Notifications:**
- `TELEGRAM_BOT_TOKEN` - Bot token for sending notifications
- `TELEGRAM_BOT_CHAT_ID` - Chat ID to send notifications to

For production, set secrets using:
```bash
wrangler secret put FIREBASE_API_KEY
wrangler secret put TUYA_ACCESS_KEY
wrangler secret put TUYA_SECRET_KEY
# ... etc for all secrets
```

## Project Structure

```
smart-plug/
├── src/
│   ├── index.js          # Main worker entry point
│   ├── api.js            # API routes with Hono
│   ├── smart-plug.js     # Smart plug monitoring logic
│   └── utils/
│       ├── db.js         # Firebase Firestore helpers
│       └── tuya-api.js   # Tuya API integration
├── public/
│   ├── index.html        # Landing page
│   └── _routes.json      # Cloudflare routing
├── wrangler.toml         # Cloudflare Workers configuration
├── .dev.vars.example     # Environment variables template
├── package.json
└── README.md
```

## API Endpoints

### Main Server (`/api/`)
- `GET /api/` - Display smart plug status and electricity schedule
- `GET /api/ping` - Health check endpoint

### Root
- `GET /` - Redirects to `/api/`
- `GET /health` - Returns health status JSON

## Scripts

```bash
yarn dev           # Start local development server
yarn deploy        # Deploy to Cloudflare Workers
yarn start         # Alias for dev
yarn preview       # Test on Cloudflare edge
yarn tail          # View real-time logs
yarn clean         # Clean build artifacts
yarn update        # Interactive package updates
```

## Migration from Netlify

This project was migrated from Netlify Functions to Cloudflare Workers. Key changes:

1. ✅ Replaced Express.js with Hono
2. ✅ Updated to ES Modules (`import`/`export`)
3. ✅ Removed `serverless-http` wrapper
4. ✅ Updated all dependencies to latest versions
5. ✅ Removed Telegram bot functionality (simplified)
6. ✅ Configured for edge runtime compatibility
7. ✅ All secrets moved to environment variables

## License

Apache-2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
