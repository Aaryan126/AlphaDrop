# AlphaDrop - Chrome Extension

AI-powered background removal that runs entirely in your browser. Fast, private, and free.

## Features

- **100% Client-Side** - All processing happens locally in your browser
- **No Server Required** - Works offline after initial model download
- **Privacy First** - Your images never leave your device
- **Two AI Modes**:
  - **Alpha** - Soft edges, preserves fine details like hair and fur
  - **Object** - Hard edges, clean cutouts for products and solid objects
- **Right-Click Integration** - Remove background from any image on the web
- **Upload from Desktop** - Or upload images directly from your computer
- **Refinement Tools** - Feather, edge adjust, smooth, and manual eraser
- **Crop & Download** - Crop results and download as transparent PNG

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)

1. Download or clone this repository

2. Install dependencies and build:
   ```bash
   cd extension-clientside
   npm install
   npm run build
   ```

3. Open Chrome and go to `chrome://extensions/`

4. Enable **Developer mode** (toggle in top right)

5. Click **Load unpacked**

6. Select the `extension-clientside` folder

7. The AlphaDrop icon will appear in your toolbar

## Usage

### Method 1: Right-Click Any Image
1. Browse to any webpage with images
2. Right-click on an image
3. Select **"Remove Background"**
4. The extension popup opens with the image loaded

### Method 2: Upload from Desktop
1. Click the AlphaDrop icon in your toolbar
2. Click **"Upload Image"** button
3. Select an image from your computer

### Processing
1. Choose a mode:
   - **Alpha** - For portraits, hair, fur, transparency
   - **Object** - For products, logos, solid objects
2. Click **"Remove Background"**
3. Wait for AI processing (first run downloads the model)

### Refinement
After processing, use the refinement tools:
- **Feather** - Soften edges
- **Edge Adjust** - Expand or shrink the mask
- **Smooth** - Remove jagged edges
- **Eraser** - Manual touch-up with zoom support

### Download
Click **"Download"** to save as transparent PNG.

## Technical Details

### AI Model
- Uses RMBG-1.4 (Background Removal Model)
- Runs via ONNX Runtime in WebAssembly
- Model downloaded on first use (~45MB)
- Processes at 1024x1024 internally

### Post-Processing Pipeline
- Guided filter for edge refinement
- Trimap-based alpha matting
- Color defringing for clean edges
- Gradient-aware feathering

### Browser Requirements
- Chrome 116+ (for Manifest V3 and offscreen API)
- ~200MB RAM for model inference
- WebAssembly support (all modern browsers)

## File Structure

```
extension-clientside/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── offscreen.html         # Offscreen document for AI
├── offscreen.js           # AI processing logic (source)
├── offscreen.bundle.js    # Bundled AI processing
├── popup/
│   ├── popup.html         # Main UI
│   ├── popup.js           # UI logic
│   └── popup.css          # Styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── ort-wasm-*.wasm        # ONNX Runtime WebAssembly
```

## Development

### Prerequisites
- Node.js 18+
- npm

### Build
```bash
npm install
npm run build
```

### Rebuild After Changes
After modifying `offscreen.js`, rebuild the bundle:
```bash
npm run build
```

## Privacy

AlphaDrop is designed with privacy in mind:
- **No data collection** - We don't collect any user data
- **No analytics** - No tracking or telemetry
- **Local processing** - Images are processed entirely on your device
- **No server calls** - Works completely offline (after model download)

## Permissions Explained

- `contextMenus` - Add "Remove Background" to right-click menu
- `activeTab` - Access the current tab to get image URLs
- `storage` - Save settings and session data locally
- `offscreen` - Run AI model in background document
- `host_permissions: <all_urls>` - Fetch images from any website

## License

MIT

## Credits

- [RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) by BRIA AI
- [Transformers.js](https://huggingface.co/docs/transformers.js) by Hugging Face
- [ONNX Runtime Web](https://onnxruntime.ai/) by Microsoft
