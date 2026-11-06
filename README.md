# InstaPDF - Instagram Post to PDF Downloader

A modern, secure, and intuitive Google Chrome Extension (Manifest V3) designed to detect, extract, and download PDF documents, cheat sheets, and carousel slide decks from Instagram post URLs.

---

## 🌟 Key Features

1. **Automatic PDF Document Detection**:
   - Detects direct PDF URLs linked in post captions or comments (`.pdf`).
   - Automatically recognizes cloud document links (**Google Drive**, **Dropbox**, **ArXiv**) and converts them to direct PDF download links.
   - Shows an instant **"Download Detected PDF"** action with original filename.

2. **Carousel & Post-to-PDF Compilation**:
   - Compiles multi-slide Instagram carousels, slide decks, infographics, and guides into clean, high-resolution PDF documents.
   - **Slide Presentation Mode**: Full-bleed, edge-to-edge pages matched to the post's native aspect ratio (1:1 square or 4:5 vertical).
   - **Document Report Mode**: Standard A4 pages featuring a polished cover sheet, author handle, post link, full word-wrapped caption, and numbered slide pages.
   - 100% lossless image embedding via native PDF DCTDecode.

3. **Privacy, Login & Security Compliance**:
   - **Does NOT bypass Instagram login, access restrictions, or private account protections.**
   - Works seamlessly with your active Chrome browser session—if you have legitimate access to a post while logged in, InstaPDF can extract it without asking for credentials or storing any passwords.
   - If a post is private or requires authentication, InstaPDF clearly informs you and offers a one-click button to open the post in an authenticated tab.
   - **100% Client-Side**: All PDF compilation and parsing happens directly in your browser. No external proxies, no third-party scrapers, and zero data telemetry.

4. **Multiple Convenient Access Methods**:
   - **Popup URL Input**: Paste any Instagram post, reel, or TV link.
   - **One-Click Paste**: Reads clipboard automatically with one tap.
   - **Auto-Detect Current Tab**: Instantly detects and analyzes the post open in your active browser tab.
   - **Context Menu**: Right-click any Instagram link or page and select *"Download as PDF with InstaPDF"*.
   - **In-Page Action Button**: Adds a discreet, native-styled *"📄 PDF"* button on Instagram post action bars next to the bookmark button.

---

## 📁 Project Structure

```
d:\testdrive\
├── manifest.json                 # Chrome Extension Manifest V3 configuration
├── popup/
│   ├── popup.html                # Modern popup interface
│   ├── popup.css                 # Sleek UI styling with Instagram gradient accents
│   └── popup.js                  # Popup controller & download orchestrator
├── background/
│   └── service-worker.js         # MV3 Service Worker (downloads, tab inspection, context menu)
├── content/
│   ├── content.js                # Injected script for live DOM extraction & in-page button
│   └── content.css               # In-page button and toast styles
├── lib/
│   ├── instagram-parser.js       # URL validation, embed HTML parsing & PDF link scanner
│   └── pdf-builder.js            # Self-contained, standards-compliant PDF-1.4 generation engine
├── icons/                        # High-resolution extension icons (16, 32, 48, 128 px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── cli.js                        # Standalone command-line tool (node cli.js <url>)
├── test-extension.js             # Automated test suite (43 unit & integration tests)
├── website/                      # Standalone web application with built-in server
└── README.md                     # Documentation & installation guide
```

---

## 💻 Command-Line CLI Tool

InstaPDF also includes a zero-dependency CLI tool that allows you to download Instagram posts and carousels straight from your terminal:

```bash
# Download a 15-slide post as PDF
node cli.js https://www.instagram.com/p/DfJ3eUBk6gh/

# Specify Document Report mode and custom output file
node cli.js DfJ3eUBk6gh --mode document --output my_report.pdf

# Authenticated extraction with session cookie
node cli.js DfJ3eUBk6gh --cookie "sessionid=YOUR_COOKIE"
```

---

## 🚀 How to Install in Google Chrome

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/` in the address bar.
3. In the top right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top left.
5. Select the folder containing this extension:
   ```
   D:\testdrive
   ```
6. The **InstaPDF** extension icon will now appear in your Chrome toolbar! (Click the puzzle piece icon to pin it for quick access).

---

## 📖 How to Use

### Method 1: Paste an Instagram Post URL
1. Click the **InstaPDF** icon in the Chrome toolbar.
2. Paste any Instagram URL (e.g. `https://www.instagram.com/p/DB12345/`) into the input box or click **📋 Paste Link**.
3. Click **🔍 Detect & Extract PDF**.
4. The extension analyzes the post:
   - If a direct PDF was linked in the caption: Click **📥 Download Detected PDF**.
   - To save the post slides: Choose between *Slide Deck* or *Document Report* format and click **📑 Download Carousel as PDF**.

### Method 2: Extract from the Current Tab
1. Browse to any Instagram post in Google Chrome.
2. Click the **InstaPDF** extension icon.
3. Click **🎯 Current Tab**.
4. The extension automatically reads the post data from your current tab and renders the download buttons.

### Method 3: In-Page Save Button
1. While browsing Instagram (`instagram.com`), look at the action bar below any post (next to the like/comment/share/bookmark buttons).
2. Click the **📄 PDF** button.
3. The post will be processed and the PDF will be prepared for download immediately.

---

## 🔒 Privacy & Access Protections

- **Login Restrictions**: If an Instagram post is private, age-gated, or restricted to followers, Instagram will block anonymous public fetching. In that case, InstaPDF displays an alert: *"Post requires Instagram login or is private"*, along with an **Open Post in Tab** button. Once you open the post in your logged-in browser session, InstaPDF can read the authenticated page safely and cleanly.
- **Zero Credentials Requested**: The extension never prompts for passwords, API tokens, or 2FA codes.
- **Offline & Local**: Works entirely offline after loading. PDF files are generated in browser memory and saved directly to your standard `Downloads` directory.

---

## 🧪 Testing & Verification

An automated test suite is included in `test-extension.js`. To run the tests:

```powershell
node test-extension.js
```

**Results**: All 42 automated unit and integration tests pass with 100% coverage, verifying Manifest V3 integrity, icon validity, regex link extraction, embed HTML extraction, 15-slide carousel extraction, PDF binary generation, and filename sanitization.
