# Smart Plug Monitor - Cloudflare Workers

A serverless Cloudflare Workers application that monitors Tuya smart plug status and tracks electricity schedules. Built with the high-performance Hono framework and deployed on Cloudflare's global edge network.

## 🎯 Overview

This project provides real-time monitoring of a Tuya smart plug's online/offline status, tracks power outage durations, and sends Telegram notifications when the power state changes. It's designed to run efficiently on Cloudflare Workers with automatic scheduled checks every 7 minutes.

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Tusko/tuya-smart-plug-notification" target="_blank" rel="noopener"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers"></a>

## ✨ Features

- 🔌 **Smart Plug Monitoring**: Real-time tracking of Tuya smart plug online/offline status
- 📊 **Data Persistence**: Stores status history using Firebase Firestore
- 📅 **Schedule Tracking**: Fetches and monitors electricity schedule updates with visual graphics
- 🤖 **AI Image Analysis**:
  - Cloudflare AI-powered OCR using llava-1.5-7b-hf vision model
  - Google Gemini API integration for advanced image-to-JSON extraction
- 📲 **Telegram Notifications**: Automatic alerts when power status changes with duration tracking
- 🌍 **Edge Computing**: Runs on Cloudflare's global network for low-latency responses
- ⚡ **Ultra-Fast**: Built with Hono framework optimized for edge runtime
- ⏰ **Scheduled Tasks**: Automatic cron-based monitoring every 7 minutes
- 🔍 **Web Interface**: Clean HTML interface showing current status and history
- 🌐 **API Endpoints**: JSON API for programmatic access to status data
- 🇺🇦 **Ukrainian Localization**: Includes Ukrainian language support for dates and notifications

## 🛠 Tech Stack

- **Runtime**: Cloudflare Workers (Edge Runtime)
- **Framework**: [Hono](https://hono.dev/) v4.6+ (Ultra-fast web framework)
- **AI/ML**: Cloudflare Workers AI with llava-1.5-7b-hf vision model
- **Database**: Firebase Firestore (Real-time NoSQL database)
- **Date/Time**: Day.js v1.11+ with timezone & Ukrainian locale support
- **Utilities**:
  - `humanize-duration` - Human-readable duration formatting
  - `short-uuid` - UUID generation
- **Package Manager**: Yarn
- **Deployment**: Wrangler CLI

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 22.0.0 or higher
- **Yarn** package manager
- **Cloudflare Account** (free tier works)
- **Tuya Cloud Account** with smart plug configured and API credentials
- **Firebase Project** with Firestore database enabled
- **Telegram Bot** (optional, for notifications)
  - Bot token from [@BotFather](https://t.me/botfather)
  - Chat ID where notifications will be sent

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd smart-plug
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Configure Environment Variables

Create a `.dev.vars` file for local development:

```bash
# Copy the example file
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your actual credentials (see [Environment Variables](#environment-variables) section below).

### 4. Login to Cloudflare

```bash
npx wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

## ⚙️ Environment Variables

### Local Development

For local development, create a `.dev.vars` file in the project root:

```bash
# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef
FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Tuya Smart Plug Configuration
TUYA_HOST=https://openapi.tuyaeu.com
TUYA_ACCESS_KEY=your_tuya_access_key
TUYA_SECRET_KEY=your_tuya_secret_key
TUYA_DEVICE_ID=your_device_id
TUYA_TIME_FORMAT=YYYY-MM-DD HH:mm:ss

# Electricity Schedule API
SCHEDULE_API_URL=https://api.loe.lviv.ua

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_BOT_CHAT_ID=123456789
TELEGRAM_CHANNEL_LINK=your_telegram_channel_link
BROADCAST_KEY=your_long_random_secret

# Google Gemini API (optional - for advanced image analysis)
GEMINI_API_KEY=your_gemini_api_key

# Environment
NODE_ENV=development
```

### Production Deployment

For production, set environment variables as Cloudflare Workers secrets:

```bash
# Set each secret individually
wrangler secret put FIREBASE_API_KEY
wrangler secret put FIREBASE_AUTH_DOMAIN
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_STORAGE_BUCKET
wrangler secret put FIREBASE_MESSAGING_SENDER_ID
wrangler secret put FIREBASE_APP_ID
wrangler secret put FIREBASE_MEASUREMENT_ID
wrangler secret put TUYA_HOST
wrangler secret put TUYA_ACCESS_KEY
wrangler secret put TUYA_SECRET_KEY
wrangler secret put TUYA_DEVICE_ID
wrangler secret put TUYA_TIME_FORMAT
wrangler secret put SCHEDULE_API_URL
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_BOT_CHAT_ID
wrangler secret put TELEGRAM_CHANNEL_LINK
wrangler secret put BROADCAST_KEY
wrangler secret put GEMINI_API_KEY  # Optional - for Gemini image analysis
wrangler secret put NODE_ENV
```

Or use the `-e` flag to set secrets for a specific environment:

```bash
wrangler secret put TUYA_ACCESS_KEY -e production
```

### Environment Variable Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `FIREBASE_API_KEY` | Firebase API key from project settings | ✅ | - |
| `FIREBASE_AUTH_DOMAIN` | Firebase authentication domain | ✅ | - |
| `FIREBASE_PROJECT_ID` | Firebase project ID | ✅ | - |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | ✅ | - |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | ✅ | - |
| `FIREBASE_APP_ID` | Firebase application ID | ✅ | - |
| `FIREBASE_MEASUREMENT_ID` | Firebase analytics measurement ID | ❌ | - |
| `TUYA_HOST` | Tuya API endpoint URL | ✅ | `https://openapi.tuyaeu.com` |
| `TUYA_ACCESS_KEY` | Tuya Cloud project access key | ✅ | - |
| `TUYA_SECRET_KEY` | Tuya Cloud project secret key | ✅ | - |
| `TUYA_DEVICE_ID` | Your Tuya smart plug device ID | ✅ | - |
| `TUYA_TIME_FORMAT` | Date/time format for display | ❌ | `YYYY-MM-DD HH:mm:ss` |
| `SCHEDULE_API_URL` | Electricity schedule API base URL | ❌ | `https://api.loe.lviv.ua` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ | - |
| `TELEGRAM_BOT_CHAT_ID` | Telegram chat ID for notifications | ✅ | - |
| `TELEGRAM_CHANNEL_LINK` | Telegram bot/channel invite link | ❌ | - |
| `BROADCAST_KEY` | Bearer token for `POST /broadcast`. Unset = endpoint always returns 401 | ❌ | - |
| `GEMINI_API_KEY` | Google Gemini API key for advanced image analysis | ❌ | - |
| `NODE_ENV` | Environment mode (`development` or `production`) | ❌ | `development` |

## 💻 Development

### Start Local Development Server

```bash
yarn dev
```

The worker will be available at `http://localhost:8787`

This runs the worker locally using Wrangler's local development environment.

### Test on Cloudflare Edge

```bash
yarn preview
```

This deploys to a temporary Cloudflare environment for testing on the actual edge network.

### View Real-time Logs

```bash
yarn tail
```

Stream logs from your deployed worker in real-time.

## 🚢 Deployment

### Deploy to Production

```bash
yarn deploy
```

This deploys to your Cloudflare Workers production environment configured in `wrangler.toml`.

### Deploy to Specific Environment

```bash
wrangler deploy -e dev
wrangler deploy -e production
```

## 📁 Project Structure

```
smart-plug/
├── src/
│   ├── index.js          # Main Cloudflare Worker entry point
│   │                     # Handles HTTP requests & scheduled cron tasks
│   ├── api.js            # Hono API routes
│   │                     # GET /, /ping, /no-render endpoints
│   │                     # POST /analyze-image, /analyze-schedule, etc.
│   ├── smart-plug.js     # Core monitoring logic
│   │                     # Checks device status, sends notifications
│   └── utils/
│       ├── db.js         # Firebase Firestore database helpers
│       │                 # Status tracking, image tracking
│       ├── tuya-api.js   # Tuya Cloud API integration
│       │                 # Device authentication & status retrieval
│       └── imgToJSON.js  # Cloudflare AI image analysis
│                         # Vision model integration for OCR & data extraction
├── wrangler.toml         # Cloudflare Workers configuration
│                         # Includes AI binding for Workers AI
├── .dev.vars.example     # Environment variables template
├── .dev.vars             # Local environment variables (git-ignored)
├── package.json          # Node.js dependencies and scripts
├── yarn.lock             # Yarn dependency lock file
├── test-image-analysis.js # Test script for AI image analysis
├── IMAGE_ANALYSIS.md     # Detailed AI image analysis documentation
├── LICENSE               # Apache 2.0 license
└── README.md             # This file
```

## 🔗 API Endpoints

### `GET /`

Returns an HTML page with:
- Current smart plug status (online/offline)
- Latest status change notification
- Status history (JSON formatted)
- Latest electricity schedule graphic

**Query Parameters:**
- `no-render` - Skip HTML rendering (for debugging)

**Example:**
```bash
curl https://your-worker.workers.dev/
```

### `GET /ping`

Simple health check endpoint.

**Response:**
```
ok
```

**Example:**
```bash
curl https://your-worker.workers.dev/ping
```

### `GET /no-render`

Returns JSON data without HTML rendering.

**Response:**
```json
{
  "success": true,
  "notify": "🟡 No changes from 2025-10-25 14:30:00",
  "latestStatus": {
    "status": "online",
    "datetime": {
      "seconds": 1729866600,
      "nanoseconds": 0
    }
  },
  "timestamp": "2025-10-25T14:37:15.123Z"
}
```

**Example:**
```bash
curl https://your-worker.workers.dev/no-render
```

### `GET /health`

Returns health status in JSON format.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-25T14:37:15.123Z"
}
```

**Example:**
```bash
curl https://your-worker.workers.dev/health
```

### `GET /health/:check`

Checks external dependencies. `:check` is `all`, `tuya`, `firebase`, `schedule`, or `telegram`. `all` runs every check in parallel. Each check times out after 15s. Returns `200` if every check passes, `503` otherwise (failures are also logged).

| Check | What it does |
|-------|--------------|
| `tuya` | Gets a token and reads the device (`deviceOnline`) |
| `firebase` | Reads the latest stored status (`latestStatus`, `since`) |
| `schedule` | Fetches the schedule menu (`menuItems`) |
| `telegram` | Calls `getMe` with the bot token (`bot`) |

**Example:**
```bash
curl https://your-worker.workers.dev/health/all
```

```json
{
  "ok": true,
  "checks": {
    "tuya": { "ok": true, "ms": 412, "deviceOnline": true },
    "firebase": { "ok": true, "ms": 230, "latestStatus": "online", "since": "2026-09-22T21:35:54.000Z" },
    "schedule": { "ok": true, "ms": 520, "menuItems": 3 },
    "telegram": { "ok": true, "ms": 180, "bot": "your_bot" }
  },
  "timestamp": "2026-10-14T13:00:00.000Z"
}
```

### `POST /broadcast`

Sends a message to every chat in `TELEGRAM_BOT_CHAT_ID`. Requires `Authorization: Bearer <BROADCAST_KEY>`; returns `401` otherwise (including when `BROADCAST_KEY` is not set).

`message` can be sent as JSON, form data, or `?message=` query param. `\n` is converted to a newline. Without a message, sends "test bot" plus the channel link.

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/broadcast \
  -H "Authorization: Bearer $BROADCAST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from the bot"}'
```

**Response:** `ok` (200), `Unauthorized` (401), or `error` (500 if any chat fails).

`POST /test-bot` is an alias with the same auth.

### `GET /calendar/:groupId.ics`

Subscribable ICS feed with today's and tomorrow's outages for one group (e.g. `/calendar/1.1.ics`). Returns `404` for malformed group ids and `502` if the schedule API is unavailable.

**Example:**
```bash
curl https://your-worker.workers.dev/calendar/1.1.ics
```

### `POST /analyze-image`

Analyzes an image using Cloudflare AI's llava-1.5-7b-hf vision model and returns structured JSON data.

**Request Body:**
```json
{
  "imageUrl": "https://example.com/image.jpg",
  "prompt": "Optional custom prompt"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "extracted title",
    "company": "company name",
    "groups": [...],
    "additionalText": "other relevant text"
  },
  "modelUsed": "@cf/llava-hf/llava-1.5-7b-hf",
  "timestamp": "2025-11-02T..."
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/analyze-image \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/schedule.jpg"}'
```

### `POST /analyze-schedule`

Specialized endpoint for analyzing power schedule images with predefined prompts using Cloudflare AI.

**Request Body:**
```json
{
  "imageUrl": "https://example.com/schedule.jpg"
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/analyze-schedule \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/schedule.jpg"}'
```

### `POST /analyze-gemini`

Analyzes one or more images using **Google Gemini API** (gemini-2.0-flash-exp model). This endpoint provides more accurate OCR and data extraction compared to Cloudflare AI, especially for complex images with text.

**Request Body:**
```json
{
  "imageUrls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
  "prompt": "Optional custom prompt for analysis",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "image_1_data": { ... },
    "image_2_data": { ... }
  },
  "modelUsed": "gemini-2.0-flash-exp",
  "imagesProcessed": 2,
  "timestamp": "2025-11-02T..."
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/analyze-gemini \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrls": ["https://example.com/schedule1.jpg", "https://example.com/schedule2.jpg"],
    "prompt": "Extract power schedule data from these images"
  }'
```

**Requirements:**
- Set `GEMINI_API_KEY` environment variable (get it from [Google AI Studio](https://aistudio.google.com/app/apikey))

### `POST /analyze-schedule-gemini`

Specialized endpoint for analyzing power schedule images using **Google Gemini API** with optimized prompts for Ukrainian power schedule extraction.

**Request Body:**
```json
{
  "imageUrl": "https://example.com/schedule.jpg"
}
```

Or for multiple images:
```json
{
  "imageUrls": ["https://example.com/schedule1.jpg", "https://example.com/schedule2.jpg"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "31.10.2025",
    "company": "ЛЬВІВОБЛЕНЕРГО",
    "groups": [
      {
        "id": "1.1",
        "status": "Електроенергії немає",
        "schedule": "з 14:00 по 15:30"
      }
    ]
  },
  "modelUsed": "gemini-2.0-flash-exp",
  "imagesProcessed": 1,
  "timestamp": "2025-11-02T..."
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/analyze-schedule-gemini \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/schedule.jpg"}'
```

**Requirements:**
- Set `GEMINI_API_KEY` environment variable

### `POST /analyze-multiple-images`

Batch analyze multiple images in parallel.

**Request Body:**
```json
{
  "imageUrls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
  "prompt": "Optional custom prompt"
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/analyze-multiple-images \
  -H "Content-Type: application/json" \
  -d '{"imageUrls": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"]}'
```

> 📖 For detailed image analysis documentation, see [IMAGE_ANALYSIS.md](./IMAGE_ANALYSIS.md)

## ⏰ Scheduled Tasks

The worker automatically runs every **7 minutes** via Cloudflare Cron Triggers, configured in `wrangler.toml`:

```toml
[triggers]
crons = ["*/7 * * * *"]
```

### What Happens During Scheduled Runs:

1. ✅ Fetches current device status from Tuya API
2. ✅ Compares with last known status in Firestore
3. ✅ If status changed:
   - Calculates downtime/uptime duration
   - Sends Telegram notification
   - Updates Firestore with new status
4. ✅ Checks for new electricity schedule graphics
5. ✅ Sends new schedule images via Telegram if available

### Manual Trigger

You can manually trigger the scheduled task by making an HTTP request with a Cloudflare API token.

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start local development server with hot reload |
| `yarn deploy` | Deploy to Cloudflare Workers production environment |
| `yarn preview` | Test deployment on Cloudflare edge (temporary) |
| `yarn tail` | Stream real-time logs from deployed worker |
| `yarn clean` | Remove node_modules, .wrangler cache, and dist folder |
| `yarn update` | Interactive dependency update tool |

## 🔧 Configuration

### `wrangler.toml`

Main Cloudflare Workers configuration file:

```toml
name = "smart-plug"                    # Worker name
main = "src/index.js"                  # Entry point
compatibility_date = "2025-10-23"      # Workers runtime version

# Enable Node.js compatibility for Firebase & other libs
compatibility_flags = ["nodejs_compat_v2"]

[observability]
enabled = true                         # Enable metrics & analytics

[triggers]
crons = ["*/7 * * * *"]               # Run every 7 minutes

[ai]
binding = "AI"                        # Workers AI binding for image analysis
```

## 🌐 How It Works

### 1. **Device Status Monitoring**

The `smart-plug.js` module:
- Authenticates with Tuya Cloud API
- Fetches device online/offline status
- Compares with last known status from Firestore
- Calculates duration of status changes

### 2. **Notification System**

When status changes:
- 💡 **Power Restored**: "💡 Світло є\r\n\r\nЕлектроенергія була відсутня: [duration]"
- 🔴 **Power Lost**: "🔴 Світла немає\r\n\r\nЕлектроенергію було увімкнено: [duration]"

Notifications include human-readable duration in Ukrainian (e.g., "2 години та 15 хвилин").

### 3. **Schedule Graphics**

- Fetches latest electricity schedule from configured API
- Detects new schedule images
- Sends images to Telegram when updated
- Stores image references in Firestore to avoid duplicates

### 4. **Data Persistence**

Firebase Firestore collections:
- **Statuses**: Tracks device online/offline state changes
- **Images**: Tracks sent schedule graphics to prevent duplicates

## 🧪 Testing

### Test Locally

```bash
yarn dev
# Open http://localhost:8787 in browser
```

### Test Telegram Bot

```bash
curl -X POST https://your-worker.workers.dev/test-bot -H "Authorization: Bearer $BROADCAST_KEY"
```

Check your Telegram chats for a "test bot" message.

### Test AI Image Analysis

```bash
# Start dev server
yarn dev

# Run test script in another terminal
node test-image-analysis.js
```

This will test all AI image analysis endpoints with example images.

### Test Scheduled Task Locally

The cron trigger doesn't run in local development. To test the scheduling logic:

```bash
# Make a request to trigger the smart plug check
curl http://localhost:8787/
```

## 🐛 Troubleshooting

### Worker Not Deploying

```bash
# Ensure you're logged in
npx wrangler login

# Check wrangler.toml configuration
cat wrangler.toml

# Try deploying with verbose output
npx wrangler deploy --verbose
```

### Secrets Not Working

```bash
# List all secrets
npx wrangler secret list

# Delete and recreate a secret
npx wrangler secret delete SECRET_NAME
npx wrangler secret put SECRET_NAME
```

### Firebase Connection Issues

- Verify all Firebase environment variables are set correctly
- Check Firebase project permissions
- Ensure Firestore database is created and accessible

### Tuya API Issues

- Verify device ID is correct
- Check Tuya Cloud project status and API limits
- Ensure access key and secret key are valid
- Confirm API endpoint (`TUYA_HOST`) matches your region

## 📊 Monitoring

### View Worker Analytics

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to Workers & Pages
3. Select your worker
4. View metrics: requests, errors, CPU time, etc.

### Real-time Logs

```bash
yarn tail
```

### Observability

The worker has observability enabled in `wrangler.toml`, providing:
- Request/response metrics
- Error tracking
- Performance data
- Worker analytics

## 🔒 Security Best Practices

- ✅ **Never commit `.dev.vars`** - It's git-ignored by default
- ✅ **Use Wrangler secrets for production** - Not environment variables in `wrangler.toml`
- ✅ **Rotate API keys regularly** - Especially Tuya and Firebase keys
- ✅ **Limit Firebase permissions** - Use minimal required permissions
- ✅ **Monitor worker logs** - Watch for unauthorized access attempts

## 📄 License

Apache-2.0

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge computing platform
- [Hono](https://hono.dev/) - Ultra-fast web framework
- [Tuya](https://developer.tuya.com/) - Smart device platform
- [Firebase](https://firebase.google.com/) - Real-time database
- [Telegram Bot API](https://core.telegram.org/bots/api) - Messaging platform
