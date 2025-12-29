# AlphaDrop

A Chrome extension for background removal from images, powered by multiple AI and heuristic engines.

## Features

- **Right-click context menu**: Remove background from any image on the web
- **Multiple methods**:
  - **Auto (Recommended)**: Automatically selects the best method
  - **AI Matting**: Best for portraits (soft edges, hair)
  - **AI Segmentation**: Best for objects and products
  - **Color-Based**: Best for logos and uniform backgrounds
- **Download as transparent PNG**

## Project Structure

```
AlphaDrop/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js   # Service worker
│   ├── popup/          # Popup UI
│   └── icons/          # Extension icons
├── backend/            # FastAPI Server
│   ├── main.py         # API endpoints
│   ├── engines/        # Background removal engines
│   ├── analyzer/       # Auto-selection logic
│   └── utils/          # Image utilities
└── models/             # ML model weights (auto-downloaded)
```

## Setup Instructions

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

   The API will be available at `http://localhost:8000`

4. Verify the server is running:
   ```bash
   curl http://localhost:8000/health
   ```

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`

2. Enable "Developer mode" (toggle in top right)

3. Click "Load unpacked"

4. Select the `AlphaDrop/extension` folder

5. The AlphaDrop extension icon should appear in your toolbar

**Note**: The extension requires PNG icons. Convert the SVG icons to PNG:
- You can use any image editor or online converter
- Or use ImageMagick: `convert icon16.svg icon16.png`

### Icon Conversion (Optional)

If you have ImageMagick installed:
```bash
cd extension/icons
for size in 16 48 128; do
  convert icon${size}.svg icon${size}.png
done
```

Or use Python with Pillow:
```python
from PIL import Image
import cairosvg
for size in [16, 48, 128]:
    cairosvg.svg2png(url=f'icon{size}.svg', write_to=f'icon{size}.png')
```

## Usage

1. Make sure the backend server is running

2. Navigate to any webpage with images

3. Right-click on an image and select "Remove Background"

4. The popup will open with:
   - Original image preview
   - Method selection dropdown
   - "Remove Background" button

5. Select a method (or keep "Auto") and click "Remove Background"

6. Once processed, click "Download PNG" to save the result

## API Reference

### Health Check
```
GET /health
```
Returns server status and available engines.

### Remove Background
```
POST /v1/remove-background
Content-Type: multipart/form-data

Parameters:
- image: Image file (required)
- method: auto|matting|segmentation|color (default: auto)

Response:
{
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

## Auto-Selection Logic

The auto-selection analyzes the image and chooses the best method:

| Condition | Selected Method |
|-----------|-----------------|
| Face detected | AI Matting |
| Low color entropy (uniform background) | Color-Based |
| Default | AI Segmentation |

## Troubleshooting

### Extension shows "API not available"
- Ensure the backend server is running on port 8000
- Check that no firewall is blocking localhost connections

### First processing is slow
- ML models are downloaded on first use
- Subsequent requests will be faster

### Poor results with color-based method
- Works best with solid/uniform backgrounds
- Try AI Segmentation for complex backgrounds

## License

MIT
