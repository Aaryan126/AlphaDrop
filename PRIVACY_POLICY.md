# Privacy Policy for AlphaDrop

**Last Updated: January 2025**

## Overview

AlphaDrop is a Chrome extension that removes backgrounds from images using AI. This privacy policy explains how the extension handles user data.

## Data Collection

**AlphaDrop does not collect any user data.**

All image processing occurs entirely within your browser on your local device. No images, personal information, or usage data is collected, stored, or transmitted to external servers.

## How the Extension Works

1. When you select an image for background removal, the image is processed locally in your browser
2. The AI model runs entirely within your browser using WebAssembly
3. Processed images exist only in your browser's memory
4. No data is sent to any external server

## Permissions Explained

AlphaDrop requires the following permissions to function:

| Permission | Purpose |
|------------|---------|
| **contextMenus** | Adds "Remove Background" to the right-click menu |
| **activeTab** | Accesses images on the current webpage when you right-click them |
| **storage** | Saves your session locally so work is not lost if you close the popup |
| **offscreen** | Runs the AI model in a background document (required for WebAssembly) |
| **host_permissions** | Fetches images from websites for local processing |

## Local Storage

The extension uses Chrome's local storage to:
- Save your most recent processed image temporarily
- Preserve your session if you close and reopen the popup

This data is stored locally on your device and can be cleared at any time through Chrome's settings (Settings > Privacy and Security > Clear Browsing Data > Cookies and other site data).

## Third-Party Services

AlphaDrop does not use any third-party services including:
- No analytics or tracking
- No advertising
- No external APIs
- No cloud processing

## Data Sharing

AlphaDrop does not share any data because it does not collect any data. Your images are never uploaded anywhere.

## Children's Privacy

AlphaDrop does not collect any personal information from anyone, including children under 13.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date above. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Contact

For privacy concerns or questions, please open an issue on our GitHub repository:
https://github.com/yourusername/AlphaDrop/issues

## Summary

- No data collection
- No external servers
- No tracking
- All processing is local
- Your images stay on your device
