require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Configuration
const TARGET_URL = 'http://time-studies.hopto.org/upload';
const API_KEY = process.env.API_KEY;
const DIST_DIR = path.join(__dirname, '..', 'dist'); // Directory where your built .exe lives

async function uploadBuild() {
  try {
    // 1. Read version from package.json
    const pkgPath = path.join(__dirname, "..", 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.version;

    // 2. Construct the expected .exe file path
    const fileName = `Time-Studies-Setup-v${version}.exe`;
    const filePath = path.join(DIST_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    console.log(`Preparing to upload: ${fileName}...`);

    // 3. Prepare FormData payload using native Node Blob/FormData
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });

    const formData = new FormData();
    formData.append('file', blob, fileName);

    // 4. Send POST request with API Key header
    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
      },
      body: formData,
    });

    const result = await response.text();

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status}): ${result}`);
    }

    console.log(`Success! Server response: ${result}`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

uploadBuild();
