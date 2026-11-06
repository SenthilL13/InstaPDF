# InstaPDF - Instagram Post to PDF Downloader (Web Application)

A standalone, responsive web application with **zero external npm dependencies** that extracts multi-slide carousels, infographics, and PDF documents from Instagram posts and compiles them into publication-quality PDF files.

---

## 🌟 Highlights

- **Full Multi-Slide Carousel Support**: Accurately extracts all slides (including massive 10–15+ slide infographic decks like `https://www.instagram.com/p/DfJ3eUBk6gh/`) in 1080p high resolution.
- **Interactive Slide Selection**: Preview all slides with index numbering and click any thumbnail to include or exclude it (`✓` / `✕`) before compiling.
- **Dual PDF Export Modes**:
  - **Slide Presentation Mode**: Full-bleed, edge-to-edge slides in native aspect ratio (1:1 or 4:5) with optional slide number badges (`1 / 15`).
  - **Document Report Mode**: Standard A4 report layout with cover page, creator metadata, and captions.
- **Direct PDF Link Detection**: Automatically detects and extracts PDFs linked in post captions or external links (Google Drive, Dropbox, ArXiv, OneDrive, MediaFire, direct `.pdf`).
- **100% Client-Side Engine**: PDF compilation runs purely in the browser with lossless DCTDecode JPEG embedding—lightning-fast and privacy-respecting.
- **Login-Restricted Post Support**: 
  - Direct integration with **Paste Page Source** (Ctrl+U &rarr; Ctrl+A &rarr; Ctrl+C) to extract slides from private or login-restricted posts without credentials.
  - Optional **Session Cookie** connector for automated extraction of restricted content.
- **Clean Output Filenames**: Clean, customizable filenames (`Instagram_username_shortcode_15slides.pdf`) without awkward suffixes.
- **Light & Dark Theme**: Built-in toggle with persistent preferences and sleek Instagram-inspired gradients.
- **Zero External Dependencies**: Powered entirely by native Node.js standard libraries (`http`, `fs`, `path`, `stream`).

---

## 🚀 Quick Start

### 1. Requirements
- Node.js (version 18 or higher)
- No `npm install` required!

### 2. Start the Server
Open a terminal in this directory (`d:\testdrive\website`):

```bash
node server.js
```

Or using npm:
```bash
npm start
```

### 3. Open in Your Browser
Visit [http://localhost:3000](http://localhost:3000) in Chrome, Edge, Firefox, or Safari.

---

## 🛠️ Project Structure

```
d:\testdrive\website/
├── package.json                   # App manifest and npm scripts
├── server.js                      # Zero-dependency Node.js HTTP server & proxy
├── test-website.js                # Automated test suite (13 passing tests)
├── README.md                      # Documentation
└── public/
    ├── index.html                 # Responsive web application interface
    ├── style.css                  # Modern stylesheet with Dark/Light theme & glassmorphism
    ├── app.js                     # Frontend interactive controller
    ├── icons/                     # Web application icons (16, 32, 48, 128 px)
    └── lib/
        ├── instagram-parser.js    # Shared URL & Relay multi-slide parser
        └── pdf-builder.js         # Pure JavaScript PDF-1.4 binary compiler
```

---

## 🧪 Automated Testing

To run the automated test suite verifying server endpoints, static assets, and PDF generation:

```bash
node test-website.js
```

Output:
```
--- Starting InstaPDF Website Automated Tests ---

  ✓ GET /api/health returns 200 and ok status
  ✓ GET / serves index.html with HTML title and form elements
  ✓ GET /style.css serves responsive stylesheet
  ✓ GET /app.js serves frontend controller
  ✓ GET /lib/instagram-parser.js and /lib/pdf-builder.js are served
  ✓ GET /api/extract without URL returns 400
  ✓ GET /api/extract with invalid URL returns 400 validation error
  ✓ GET /api/proxy-image without URL returns 400
  ✓ OPTIONS /api/extract returns 204 with CORS headers
  ✓ InstagramParser handles 15-slide relay JSON correctly
  ✓ InstagramParser detects Google Drive, Dropbox, and direct PDF links
  ✓ PdfBuilder creates valid 15-slide PDF document binary
  ✓ PdfBuilder generates Document Report mode with formatted pages

========================================
Results: 13 passed, 0 failed
========================================
```

---

## 🔒 Privacy & Compliance

- Operates strictly within Meta Platform public data terms.
- Does not bypass login walls, access restrictions, or private account protections.
- Slide images and documents are processed locally without persistent server-side caching.
