# AlphaDrop Deployment Guide

This guide covers deploying AlphaDrop to production:
- **Backend**: Google Cloud Run
- **Extension**: Chrome Web Store

---

## Prerequisites

### For Backend Deployment
- [Google Cloud Account](https://cloud.google.com/)
- [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install) installed
- A Google Cloud project with billing enabled

### For Extension Publishing
- [Chrome Web Store Developer Account](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
- Extension icons in PNG format (16x16, 48x48, 128x128)
- Screenshots for store listing (1280x800 or 640x400)

---

## Part 1: Backend Deployment (Google Cloud Run)

### Step 1: Set Up Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Create a new project (or use existing)
gcloud projects create alphadrop-api --name="AlphaDrop API"

# Set the project
gcloud config set project alphadrop-api

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### Step 2: Deploy to Cloud Run

Navigate to the backend directory and deploy:

```bash
cd backend

gcloud run deploy alphadrop-api \
  --source . \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --allow-unauthenticated \
  --set-env-vars "ALPHADROP_DEBUG=false"
```

**Deployment options explained:**
| Option | Value | Reason |
|--------|-------|--------|
| `--memory 2Gi` | 2GB RAM | ML models require significant memory |
| `--cpu 2` | 2 vCPUs | Image processing is CPU-intensive |
| `--timeout 300` | 5 minutes | Large images take time to process |
| `--allow-unauthenticated` | Public API | Extension needs public access |

### Step 3: Get Your Service URL

After deployment, you'll see output like:
```
Service [alphadrop-api] revision [alphadrop-api-00001-xxx] has been deployed
Service URL: https://alphadrop-api-xxxxxxxxxx-uc.a.run.app
```

**Save this URL** - you'll need it for the extension configuration.

### Step 4: Verify Deployment

```bash
curl https://alphadrop-api-xxxxxxxxxx-uc.a.run.app/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "engines": ["matting", "segmentation", "color"]
}
```

### Optional: Configure Custom Domain

```bash
gcloud run domain-mappings create \
  --service alphadrop-api \
  --domain api.yourdomain.com \
  --region us-central1
```

---

## Part 2: Update Extension for Production

### Step 1: Update API Configuration

Edit `extension/config.js`:

```javascript
const CONFIG = {
  // Development (local backend)
  // API_BASE: "http://localhost:8000",

  // Production (Google Cloud Run)
  API_BASE: "https://alphadrop-api-xxxxxxxxxx-uc.a.run.app",
};
```

Replace `xxxxxxxxxx` with your actual Cloud Run service identifier.

### Step 2: Update Version (if needed)

Edit `extension/manifest.json` and increment the version:

```json
{
  "version": "1.0.1"
}
```

---

## Part 3: Publish to Chrome Web Store

### Step 1: Prepare Extension Package

1. Ensure all icons are PNG format (not SVG)
2. Remove any development files
3. Create a ZIP file of the extension folder:

```bash
cd extension
zip -r ../alphadrop-extension.zip . -x "*.git*"
```

Or on Windows (PowerShell):
```powershell
Compress-Archive -Path extension\* -DestinationPath alphadrop-extension.zip
```

### Step 2: Create Developer Account

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay the one-time $5 registration fee
3. Complete account verification

### Step 3: Upload Extension

1. Click **"New Item"** in the dashboard
2. Upload your `alphadrop-extension.zip`
3. Fill in store listing details:

**Required Information:**
| Field | Recommendation |
|-------|----------------|
| Name | AlphaDrop - Background Remover |
| Summary | Remove backgrounds from any image with one click |
| Description | Detailed feature list (see template below) |
| Category | Productivity |
| Language | English |

**Store Description Template:**
```
AlphaDrop instantly removes backgrounds from any image on the web.

FEATURES:
• Right-click any image to remove its background
• Multiple AI-powered removal methods
• Automatic method selection for best results
• Built-in refinement tools (feather, edge adjust, smooth)
• Manual eraser for precise touch-ups
• Crop tool for final adjustments
• Download as transparent PNG

METHODS:
• Auto - Intelligently selects the best method
• AI Matting - Perfect for portraits and hair detail
• AI Segmentation - Great for products and objects
• Color-Based - Fast removal for uniform backgrounds

HOW TO USE:
1. Right-click on any image
2. Select "Remove Background"
3. Refine if needed
4. Download your transparent PNG

No sign-up required. Works with any website.
```

### Step 4: Add Store Assets

**Required:**
- At least 1 screenshot (1280x800 or 640x400)
- Small promo tile (440x280) - optional but recommended

**Screenshot suggestions:**
1. Before/after comparison
2. Context menu in action
3. Popup with refinement tools
4. Downloaded result

### Step 5: Submit for Review

1. Click **"Submit for Review"**
2. Review typically takes 1-3 business days
3. You'll receive email notification when approved

### Step 6: After Approval

Your extension will be available at:
```
https://chrome.google.com/webstore/detail/alphadrop/[extension-id]
```

---

## Updating the Deployment

### Update Backend

```bash
cd backend

gcloud run deploy alphadrop-api \
  --source . \
  --region us-central1
```

The existing configuration will be preserved.

### Update Extension

1. Increment version in `manifest.json`
2. Create new ZIP file
3. Go to Developer Dashboard
4. Click your extension → **"Package"** → **"Upload new package"**
5. Submit for review

---

## Cost Estimation

### Google Cloud Run

| Usage Level | Monthly Cost |
|-------------|--------------|
| Light (< 2M requests) | Free tier |
| Moderate (5M requests) | ~$10-20 |
| Heavy (20M+ requests) | ~$50-100 |

**Free tier includes:**
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

### Chrome Web Store
- One-time $5 developer fee
- No ongoing costs

---

## Monitoring & Logs

### View Cloud Run Logs

```bash
gcloud run services logs read alphadrop-api --region us-central1
```

### View in Console

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on `alphadrop-api`
3. View metrics, logs, and revisions

### Set Up Alerts (Optional)

```bash
# Alert on high error rate
gcloud alpha monitoring policies create \
  --display-name="AlphaDrop High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"'
```

---

## Troubleshooting

### Backend Issues

**Deployment fails with memory error:**
```bash
# Increase memory limit
gcloud run deploy alphadrop-api --memory 4Gi
```

**Cold start too slow:**
```bash
# Keep minimum instances warm (adds cost)
gcloud run deploy alphadrop-api --min-instances 1
```

**CORS errors:**
- Backend already allows all origins (`cors_origins: ["*"]`)
- Ensure Cloud Run URL is in extension's `host_permissions`

### Extension Issues

**"API not available" after publishing:**
1. Verify Cloud Run URL is correct in `config.js`
2. Check that `https://*.run.app/*` is in `host_permissions`
3. Reload extension after changes

**Extension rejected by Chrome Web Store:**
- Common reasons: missing privacy policy, unclear permissions justification
- Add privacy policy URL if you collect any data
- Explain why `<all_urls>` permission is needed (to fetch images from any site)

---

## Security Considerations

### Production Checklist

- [ ] Set `ALPHADROP_DEBUG=false` in Cloud Run
- [ ] Consider rate limiting for public API
- [ ] Monitor for abuse/excessive usage
- [ ] Keep dependencies updated

### Optional: Add Authentication

If you want to restrict API access:

```python
# backend/main.py - add API key validation
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != os.getenv("API_KEY"):
        raise HTTPException(status_code=401)
    return x_api_key
```

---

## Quick Reference

### Useful Commands

```bash
# Check deployment status
gcloud run services describe alphadrop-api --region us-central1

# View recent logs
gcloud run services logs read alphadrop-api --limit 50

# List all revisions
gcloud run revisions list --service alphadrop-api

# Rollback to previous revision
gcloud run services update-traffic alphadrop-api --to-revisions=REVISION_NAME=100
```

### Important URLs

| Resource | URL |
|----------|-----|
| Cloud Run Console | https://console.cloud.google.com/run |
| Chrome Developer Dashboard | https://chrome.google.com/webstore/devconsole |
| Cloud Run Pricing | https://cloud.google.com/run/pricing |
