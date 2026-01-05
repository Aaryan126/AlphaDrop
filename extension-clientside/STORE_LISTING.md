# AlphaDrop - Chrome Web Store Listing

---

## Single Purpose

### Single Purpose Description
```
AlphaDrop removes backgrounds from images using AI. Users can right-click any image on a webpage or upload an image from their device to remove its background and download the result as a transparent PNG.
```

---

## Permission Justifications

### contextMenus Justification
```
Required to add the "Remove Background" option to Chrome's right-click context menu when users right-click on images. This is the primary way users interact with the extension to select images for background removal.
```

### activeTab Justification
```
Required to access the URL of images on the current webpage when the user right-clicks an image and selects "Remove Background". This permission allows the extension to retrieve the image data for processing.
```

### storage Justification
```
Required to save user session data locally, including the most recent processed image and processing state. This allows users to close and reopen the extension popup without losing their work. All data is stored locally in the browser.
```

### offscreen Justification
```
Required to run the AI background removal model (ONNX Runtime with WebAssembly) in a separate document. Chrome extensions cannot run WebAssembly workloads directly in the popup or service worker, so an offscreen document is necessary for AI inference.
```

### Host Permission Justification
```
Required to fetch images from any website the user visits. When a user right-clicks an image and selects "Remove Background", the extension needs to download that image for local processing. Without this permission, the extension could not access images from webpages. All fetched images are processed locally and never sent to external servers.
```

---

## Remote Code

### Are you using remote code?
```
No, I am not using Remote code
```

### Justification (if asked)
```
All code including the AI model inference runs from files bundled within the extension package. The ONNX Runtime WebAssembly files and model weights are included in the extension. No external scripts, modules, or code are loaded at runtime.
```

---

## Data Usage

### What user data do you plan to collect?
```
Select: NONE of the checkboxes

The extension does not collect any user data. All image processing occurs locally within the user's browser. No data is transmitted to external servers.
```

### Certifications
```
Check ALL THREE boxes:

[x] I do not sell or transfer user data to third parties, apart from the approved use cases

[x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose

[x] I do not use or transfer user data to determine creditworthiness or for lending purposes
```

---

## Privacy Policy

### Privacy Policy URL
```
https://github.com/yourusername/AlphaDrop/blob/main/PRIVACY_POLICY.md
```
(Replace with your actual GitHub URL after creating the privacy policy file)

---

## Product Details

### Title
```
AlphaDrop
```

### Summary (132 characters max)
```
AI-powered background removal that runs entirely in your browser. Fast, private, and free.
```

### Description (16,000 characters max)

```
AlphaDrop is a powerful background removal tool that runs completely in your browser. No uploads to external servers, no subscriptions, no limits - just fast, private, AI-powered image editing.

FEATURES

Two AI Processing Modes
- Alpha Mode: Preserves soft edges and fine details like hair, fur, and semi-transparent elements. Ideal for portraits and complex subjects.
- Object Mode: Creates clean, hard edges perfect for product photos, logos, and solid objects.

Multiple Ways to Use
- Right-click any image on the web and select "Remove Background"
- Upload images directly from your computer
- Process images one after another without refreshing

Professional Refinement Tools
- Feather: Soften edges for natural blending
- Edge Adjust: Expand or contract the mask boundary
- Smooth: Remove jagged edges and artifacts
- Manual Eraser: Touch up specific areas with zoom support

Additional Features
- Crop tool for both original and processed images
- Download results as transparent PNG
- Session persistence - your work is saved if you close the popup
- Large image support with automatic resize option

PRIVACY FIRST

AlphaDrop processes everything locally on your device:
- Your images never leave your computer
- No data is sent to external servers
- No account required
- Works offline after initial setup
- No tracking or analytics

HOW IT WORKS

1. Right-click any image on the web, or click the extension icon and upload an image
2. Select your preferred mode (Alpha for soft edges, Object for hard edges)
3. Click "Remove Background" and wait for processing
4. Use refinement tools if needed
5. Download your transparent PNG

TECHNICAL DETAILS

- Uses RMBG-1.4, a state-of-the-art background removal AI model
- Supports images up to 25 megapixels

REQUIREMENTS

- Chrome version 116 or later
- Approximately 200MB of memory during processing
- First use downloads the AI model (approximately 45MB)

SUPPORT

For bug reports, feature requests, or questions, please visit our GitHub repository or contact us through the support page.

AlphaDrop is free. We believe powerful image editing tools should be accessible to everyone without compromising privacy.
```

### Category
```
Productivity
```
(Alternative options: Photos, Tools)

### Language
```
English
```

---

## Graphic Assets

### Store Icon
- Size: 128 x 128 pixels
- Format: PNG
- Use: `icons/icon128.png` from your extension folder

### Screenshots (Required - at least 1)
- Size: 1280 x 800 or 640 x 400 pixels
- Format: JPEG or 24-bit PNG (no transparency)

Recommended screenshots to create:
1. Main interface showing an image before processing
2. Result view showing removed background with checkerboard
3. Refinement tools panel in use
4. Right-click context menu on a web image
5. Upload dialog / empty state

### Small Promo Tile (Optional)
- Size: 440 x 280 pixels
- Format: JPEG or 24-bit PNG (no transparency)

### Marquee Promo Tile (Optional)
- Size: 1400 x 560 pixels
- Format: JPEG or 24-bit PNG (no transparency)

---

## Additional Fields

### Homepage URL
```
https://github.com/yourusername/AlphaDrop
```
(Replace with your actual GitHub repository URL or website)

### Support URL
```
https://github.com/yourusername/AlphaDrop/issues
```
(Replace with your actual support page URL)

### Mature Content
```
No - This extension does not contain mature content
```

---

## Privacy Policy (if required)

If Chrome Web Store requires a privacy policy, use the following:

```
Privacy Policy for AlphaDrop

Last updated: January 2025

AlphaDrop is designed with privacy as a core principle.

Data Collection
AlphaDrop does not collect, store, or transmit any user data. All image processing occurs entirely within your browser on your local device.

Image Processing
- Images are processed locally using WebAssembly
- No images are uploaded to external servers
- No copies of your images are retained after processing
- Processed images exist only in your browser's memory until downloaded

Permissions Explained
- contextMenus: Adds "Remove Background" option to right-click menu
- activeTab: Accesses the current tab to retrieve image URLs
- storage: Saves your session locally within your browser
- offscreen: Runs the AI model in a background document
- host_permissions: Fetches images from websites you visit

Third-Party Services
AlphaDrop does not use any third-party analytics, tracking, or data collection services.

Local Storage
Session data (recent processed images) is stored locally in your browser's storage and can be cleared at any time through Chrome's settings.

Contact
For privacy concerns or questions, please open an issue on our GitHub repository.
```

---

## Notes for Submission

1. Screenshots are required - you must provide at least one
2. The store icon should be your icon128.png file
3. Fill in the Homepage URL and Support URL with your actual links
4. Select "No" for mature content
5. Review the description for any changes specific to your branding
6. Consider adding a promo video showing the extension in action (optional but recommended)
