require("dotenv").config()

const fs = require("fs");
const path = require("path");
const packageJson = require(path.join(__dirname, "..", "package.json"));
async function main() {
  const version = packageJson.version

  const serverUrl = "https://time-studies.webarts.pl/upload";
  const filePath = path.join(__dirname, "..", "dist", `Cycle Time Analyzer Setup ${version}.exe`);
  const token = process.env.API_KEY;

  const fileBuffer = fs.readFileSync(filePath);
  const fileName = `Time-Studies-Setup-v${version}.exe`;

  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), fileName);
  form.append("version", version)

  console.log(`Uploading ${fileName} (${fileBuffer.length} bytes) to ${serverUrl} ...`);

  try {
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "X-Upload-Token": token,
      },
      body: form,
    });

    const text = await res.text();

    if (!res.ok) {
      console.error(`Upload failed (${res.status}): ${text}`);
      process.exit(1);
    }

    console.log(`Success: ${text.trim()}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
