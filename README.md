# Networking Dashboard

## Stack
- React + Vite (frontend)
- Vercel Serverless Function (API proxy at /api/log)
- Google Apps Script (writes to Google Sheets)

## How it works
The React app calls /api/log (same origin — no CORS).
The Vercel serverless function calls Google Apps Script server-side (no browser — no CORS).
Google Apps Script writes to your Google Sheet.

## Deploy to Vercel

### 1. Push to GitHub
- Create a new repo at github.com
- Upload all files from this folder maintaining the directory structure

### 2. Connect to Vercel
- Go to vercel.com and sign in with GitHub
- Click "Add New Project"
- Import your GitHub repo
- Framework preset: Vite
- Build command: npm run build
- Output directory: dist
- Click Deploy

### 3. Add Environment Variable (CRITICAL)
- In your Vercel project, go to Settings → Environment Variables
- Add:
  - Name:  APPS_SCRIPT_URL
  - Value: https://script.google.com/macros/s/12Edb2Pvbij5RLXKhzo3EpOELAIjdS68c5ihI7mP93U4/exec
- Click Save
- Go to Deployments → click the three dots on your latest deploy → Redeploy

### 4. Verify
- Visit your Vercel URL
- Save a note on any contact
- Check your Google Sheet Interactions tab — row should appear within seconds

## Google Apps Script (already configured)
Your Apps Script at the URL above handles:
- POST with { type: "note", data: {...} } → writes to Interactions sheet
- POST with { type: "new_contact", data: {...} } → writes to Contacts sheet
