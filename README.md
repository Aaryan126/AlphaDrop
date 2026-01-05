# AlphaDrop

A Chrome extension for intelligent background removal from images, powered by multiple AI and heuristic engines.

## Features

- **Right-click context menu** - Remove background from any image on the web
- **Multiple removal methods**:
  - **Auto (Recommended)** - Automatically selects the best method based on image analysis
  - **AI Matting** - Best for portraits with soft edges and hair detail
  - **AI Segmentation** - Best for objects, products, and general use
  - **Color-Based** - Best for logos and uniform backgrounds
- **Refinement tools** - Feather edges, adjust boundaries, smooth masks, manual eraser
- **Crop functionality** - Crop results before downloading
- **Persistent sessions** - Results cached for 24 hours
- **Download as transparent PNG**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ Context Menu│───▶│  Background │───▶│   Popup UI      │ │
│  │  (trigger)  │    │   Worker    │    │  (refinement)   │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │  Analyzer   │───▶│   Engines   │───▶│   Response      │ │
│  │ (auto-pick) │    │ (ML/heuristic)│  │  (base64 PNG)   │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend (Extension)
- Manifest V3 Chrome Extension
- Vanilla JavaScript
- Chrome Storage API for persistence

### Backend
- FastAPI (Python)
- rembg (AI background removal)
- OpenCV (image processing & heuristics)
- Pillow (image manipulation)

## Project Structure

```
AlphaDrop/
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json       # Extension configuration
│   ├── config.js           # API URL configuration
│   ├── background.js       # Service worker
│   ├── popup/              # Popup UI
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── icons/              # Extension icons
├── backend/                # FastAPI Server
│   ├── main.py             # API endpoints
│   ├── config.py           # Server configuration
│   ├── Dockerfile          # Container definition
│   ├── requirements.txt    # Python dependencies
│   ├── engines/            # Background removal engines
│   │   ├── base.py         # Abstract base class
│   │   ├── ai_matting.py   # Portrait/hair matting
│   │   ├── ai_segmentation.py  # Object segmentation
│   │   └── color_based.py  # Heuristic removal
│   ├── analyzer/           # Auto-selection logic
│   │   └── auto_select.py  # Rule-based method selection
│   └── utils/              # Utilities
│       └── image_utils.py  # Image loading/conversion
├── models/                 # ML model weights (auto-downloaded)
├── DEPLOYMENT.md           # Deployment guide
└── CLAUDE.md               # Engineering guidelines
```

## Local Development

### Prerequisites

- Python 3.10+
- Chrome browser
- (Optional) CUDA-capable GPU for faster ML inference

### Backend Setup

1. Create a virtual environment:
   ```bash
   cd AlphaDrop
   python -m venv venv

   # Windows
   venv\Scripts\activate

   # macOS/Linux
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Run the server:
   ```bash
   python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Verify the server is running:
   ```bash
   curl http://localhost:8000/health
   ```

### Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`

2. Enable "Developer mode" (toggle in top right)

3. Click "Load unpacked"

4. Select the `AlphaDrop/extension` folder

5. The AlphaDrop extension icon should appear in your toolbar

## Usage

1. Ensure the backend server is running

2. Navigate to any webpage with images

3. Right-click on an image and select **"Remove Background"**

4. The popup will open with:
   - Original image preview
   - Method selection (Auto, Matting, Segmentation, Color)
   - Processing progress indicator

5. After processing, use refinement tools if needed:
   - **Feather** - Soften edges
   - **Edge Adjust** - Expand or contract mask
   - **Smooth** - Remove jagged edges
   - **Eraser** - Manual touch-up with zoom

6. Click **"Download PNG"** to save the result

## API Reference

### Health Check
```
GET /health

Response: {
  "status": "ok",
  "version": "1.0.0",
  "engines": ["matting", "segmentation", "color"]
}
```

### Remove Background
```
POST /v1/remove-background
Content-Type: multipart/form-data

Parameters:
- image: Image file (required, max 10MB)
- method: auto | matting | segmentation | color (default: auto)

Response: {
  "success": true,
  "method_used": "matting",
  "confidence": 0.92,
  "image": "<base64 PNG>",
  "analysis": {
    "has_face": true,
    "color_entropy": 5.2,
    "edge_density": 0.08,
    "auto_selected": "matting"
  }
}
```

### Task-Based Processing (with progress)
```
POST /v1/start-task    # Start processing, returns task_id
GET /v1/task/{task_id} # Poll for progress and result
```

## Auto-Selection Logic

The auto method analyzes images and selects the optimal removal technique:

| Condition | Selected Method | Reason |
|-----------|-----------------|--------|
| Face detected | AI Matting | Better hair/edge handling |
| Low color entropy | Color-Based | Uniform background, fast |
| Default | AI Segmentation | General-purpose, reliable |

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions:
- Backend deployment to Google Cloud Run
- Extension publishing to Chrome Web Store

## Troubleshooting

### Extension shows "API not available"
- Ensure the backend server is running on port 8000
- Check that no firewall is blocking localhost connections
- Verify with: `curl http://localhost:8000/health`

### First processing is slow
- ML models are downloaded on first use (~500MB)
- Subsequent requests will be much faster
- Consider pre-warming the backend

### Poor results with color-based method
- Works best with solid/uniform backgrounds
- Try AI Segmentation for complex backgrounds

### CORS errors
- Backend already allows all origins by default
- For production, update `cors_origins` in `backend/config.py`

## Environment Variables

The backend supports configuration via environment variables (prefix: `ALPHADROP_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ALPHADROP_HOST` | 0.0.0.0 | Server host |
| `ALPHADROP_PORT` | 8000 | Server port |
| `ALPHADROP_DEBUG` | true | Debug mode |
| `ALPHADROP_MAX_IMAGE_SIZE` | 10485760 | Max upload size (bytes) |

## License

MIT
