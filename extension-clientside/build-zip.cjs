/**
 * Build script to create a clean ZIP for Chrome Web Store upload.
 * Run with: node build-zip.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST_DIR = 'dist';
const ZIP_NAME = 'alphadrop-extension.zip';

// Files and folders to include in the ZIP
const INCLUDE = [
  'manifest.json',
  'background.js',
  'offscreen.html',
  'offscreen.bundle.js',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'popup',
  'icons',
];

// Clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true });
}
fs.mkdirSync(DIST_DIR);

// Copy files
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('📦 Building AlphaDrop extension package...\n');

// Copy each included file/folder
for (const item of INCLUDE) {
  const src = path.join(__dirname, item);
  const dest = path.join(__dirname, DIST_DIR, item);

  if (fs.existsSync(src)) {
    copyRecursive(src, dest);
    console.log(`  ✓ ${item}`);
  } else {
    console.log(`  ✗ ${item} (not found)`);
  }
}

// Create ZIP using PowerShell (Windows) or zip command (Unix)
const distPath = path.join(__dirname, DIST_DIR);
const zipPath = path.join(__dirname, ZIP_NAME);

// Remove old ZIP if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log('\n📦 Creating ZIP file...');

try {
  if (process.platform === 'win32') {
    // Windows: Use PowerShell
    execSync(
      `powershell -Command "Compress-Archive -Path '${distPath}\\*' -DestinationPath '${zipPath}'"`,
      { stdio: 'inherit' }
    );
  } else {
    // Unix: Use zip command
    execSync(`cd "${distPath}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  }

  // Get file size
  const stats = fs.statSync(zipPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ Success! Created: ${ZIP_NAME} (${sizeMB} MB)`);
  console.log(`\n📍 Location: ${zipPath}`);
  console.log('\n🚀 Ready to upload to Chrome Web Store!');
} catch (error) {
  console.error('\n❌ Failed to create ZIP:', error.message);
  process.exit(1);
}

// Clean up dist directory
fs.rmSync(DIST_DIR, { recursive: true });
console.log('\n🧹 Cleaned up temporary files.');
