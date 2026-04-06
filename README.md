# NeevCloud Demo Agent

A voice-powered AI agent that demos the NeevCloud platform to clients — with screen sharing, step-by-step guided walkthrough, and live Q&A.

## What it does

- Client opens the link → clicks "Start Demo"
- Optionally shares their screen (shows the NeevCloud dashboard)
- Agent speaks in Indian English, guiding them through:
  1. Dashboard overview
  2. Instances section
  3. Creating a server (step by step)
  4. SSH & Firewall setup
  5. Billing & Plans
  6. Open Q&A
- Client can ask questions any time — agent answers by voice

## Tech Stack

- **Frontend**: React + Vite (browser-native Web Speech API for mic + TTS)
- **Backend**: Node.js + Express + Anthropic Claude
- **Voice input**: Browser SpeechRecognition API (no cost, works in Chrome)
- **Voice output**: Browser SpeechSynthesis API (no cost, Indian English voice)
- **AI Brain**: Claude claude-opus-4-5 via Anthropic API

## Prerequisites

- Node.js 18+
- Anthropic API key → https://console.anthropic.com
- Chrome browser (for speech APIs)

## Setup & Run (Local)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm install
npm start
# Runs on http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# Runs on http://localhost:3000
```

Open http://localhost:3000 in Chrome → click "Start Demo"

## Deploy to Production

### Option A — Railway (Recommended, simplest)

1. Push this repo to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add two services: `backend` folder and `frontend` folder
4. Set env vars:
   - Backend: `ANTHROPIC_API_KEY=your_key`
   - Frontend: `VITE_BACKEND_URL=https://your-backend.railway.app`
5. Done — Railway gives you a public URL

### Option B — VPS (NeevCloud instance!)

```bash
# On your NeevCloud server (Ubuntu 22.04):
git clone <your-repo>
cd neevcloud-agent

# Backend
cd backend && npm install
# Use PM2 to keep it running:
npm install -g pm2
pm2 start server.js --name neev-backend
pm2 save

# Frontend - build and serve with nginx
cd ../frontend
npm install && npm run build
# Copy dist/ to nginx web root
sudo cp -r dist/* /var/www/html/

# Set VITE_BACKEND_URL in frontend/.env before building
```

### Option C — Vercel (Frontend) + Railway (Backend)

- Deploy frontend to Vercel (connects to GitHub, auto-deploys)
- Deploy backend to Railway
- Set VITE_BACKEND_URL on Vercel to your Railway backend URL

## Customisation

### Change demo steps
Edit `DEMO_STEPS` array in `frontend/src/App.jsx`

### Update NeevCloud knowledge
Edit `NEEVCLOUD_SYSTEM_PROMPT` in `backend/server.js`
Add new plans, pricing, features, or FAQ as they change.

### Change voice
In `App.jsx`, the `speak()` function uses browser TTS.
To upgrade to ElevenLabs (much more natural):
1. Get ElevenLabs API key
2. Add a `/api/tts` endpoint in backend using ElevenLabs SDK
3. Replace the `speak()` function to fetch audio from backend and play it

## Browser Support

| Feature | Chrome | Firefox | Safari |
|---|---|---|---|
| Speech Recognition (mic) | ✅ | ❌ | Partial |
| Speech Synthesis (voice) | ✅ | ✅ | ✅ |
| Screen Share | ✅ | ✅ | ✅ |

**Recommend Chrome for full experience.**

## Cost Estimate

- Anthropic API: ~$0.01–0.05 per demo session (Claude claude-opus-4-5)
- Hosting: Free tier on Railway covers early usage
- Voice: Free (browser APIs) — upgrade to ElevenLabs (~$5/mo) for premium voice

## Project Structure

```
neevcloud-agent/
├── backend/
│   ├── server.js          # Express API + Claude integration
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main voice agent UI
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── .env.example
```
