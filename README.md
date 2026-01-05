# AlphaDrop

AI-powered background removal for Chrome. Available in two versions:

## Versions

### 1. Client-Side Extension (Recommended)
**Location:** `extension-clientside/`

Runs entirely in your browser - no server required.

- 100% local processing
- Privacy-first (images never leave your device)
- Works offline after initial model download
- Uses RMBG-1.4 AI model via WebAssembly

**[See extension-clientside/README.md for details](./extension-clientside/README.md)**

### 2. Server-Based Extension
**Location:** `extension/` + `backend/`

Original version requiring a backend server.

- Requires Python backend running
- More processing options
- Better for batch processing

## Quick Start (Client-Side)

```bash
cd extension-clientside
npm install
npm run build
```

Then load the `extension-clientside` folder as an unpacked extension in Chrome.

## Features

- **Right-click any image** on the web to remove background
- **Upload images** directly from your computer
- **Two AI modes:**
  - **Alpha** - Soft edges for hair, fur, transparency
  - **Object** - Hard edges for products, logos
- **Refinement tools** - Feather, edge adjust, smooth, eraser
- **Crop & Download** as transparent PNG

## Project Structure

```
AlphaDrop/
├── extension-clientside/   # Standalone Chrome Extension (recommended)
│   ├── manifest.json
│   ├── background.js
│   ├── offscreen.js        # AI processing
│   ├── popup/              # UI
│   └── icons/
├── extension/              # Server-based extension (legacy)
├── backend/                # Python FastAPI server (legacy)
└── CLAUDE.md               # Engineering guidelines
```

## License

MIT
