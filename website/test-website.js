/**
 * Automated Test Suite for InstaPDF Web Application
 * Verifies server endpoints, static file serving, API handlers,
 * and client-side PDF engine integration.
 */

const assert = require('assert');
const path = require('path');
const { Readable } = require('stream');
const InstagramParser = require('./public/lib/instagram-parser.js');
const PdfBuilder = require('./public/lib/pdf-builder.js');
const server = require('./server.js');

/**
 * Socket-free in-memory HTTP dispatcher.
 * Dispatches simulated requests directly through the server request listener.
 */
function dispatch(urlPath, method = 'GET') {
  return new Promise((resolve) => {
    const req = new Readable({
      read() {
        this.push(null);
      }
    });
    req.url = urlPath;
    req.method = method;
    req.headers = { host: 'localhost:3000' };

    let statusCode = 200;
    const headers = {};
    let body = Buffer.alloc(0);

    const res = {
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
      },
      writeHead(code, head) {
        statusCode = code;
        if (head) {
          for (const k in head) headers[k.toLowerCase()] = head[k];
        }
      },
      write(chunk) {
        if (chunk) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          body = Buffer.concat([body, buf]);
        }
      },
      end(chunk) {
        if (chunk) this.write(chunk);
        resolve({
          status: statusCode,
          headers,
          body: body.toString('utf8'),
          rawBody: body
        });
      }
    };

    const handler = server.listeners('request')[0];
    if (!handler) {
      throw new Error('Server has no request listener registered');
    }
    handler(req, res);
  });
}

async function runTests() {
  console.log('--- Starting InstaPDF Website Automated Tests ---\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✕ ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Health API
  await test('GET /api/health returns 200 and ok status', async () => {
    const res = await dispatch('/api/health');
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'ok');
    assert.strictEqual(json.service, 'InstaPDF Web App');
  });

  // 2. Static HTML
  await test('GET / serves index.html with HTML title and form elements', async () => {
    const res = await dispatch('/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.body.includes('InstaPDF'));
    assert.ok(res.body.includes('id="urlInput"'));
    assert.ok(res.body.includes('id="extractBtn"'));
    assert.ok(res.body.includes('id="samplePostBtn"'));
  });

  // 3. Static CSS
  await test('GET /style.css serves responsive stylesheet', async () => {
    const res = await dispatch('/style.css');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/css'));
    assert.ok(res.body.includes('--primary-gradient'));
    assert.ok(res.body.includes('.slides-preview-strip'));
  });

  // 4. Static JS
  await test('GET /app.js serves frontend controller', async () => {
    const res = await dispatch('/app.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('javascript'));
    assert.ok(res.body.includes('startExtraction'));
    assert.ok(res.body.includes('downloadCarouselAsPdf'));
  });

  // 5. Shared Libraries
  await test('GET /lib/instagram-parser.js and /lib/pdf-builder.js are served', async () => {
    const pRes = await dispatch('/lib/instagram-parser.js');
    assert.strictEqual(pRes.status, 200);
    assert.ok(pRes.body.includes('InstagramParser'));

    const bRes = await dispatch('/lib/pdf-builder.js');
    assert.strictEqual(bRes.status, 200);
    assert.ok(bRes.body.includes('PdfBuilder'));
  });

  // 6. Extraction API Error Handling
  await test('GET /api/extract without URL returns 400', async () => {
    const res = await dispatch('/api/extract');
    assert.strictEqual(res.status, 400);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes('Missing "url"'));
  });

  await test('GET /api/extract with invalid URL returns 400 validation error', async () => {
    const res = await dispatch('/api/extract?url=https://google.com/test');
    assert.strictEqual(res.status, 400);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes('Instagram'));
  });

  // 7. Proxy Image API Error Handling
  await test('GET /api/proxy-image without URL returns 400', async () => {
    const res = await dispatch('/api/proxy-image');
    assert.strictEqual(res.status, 400);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, false);
  });

  // 8. CORS OPTIONS preflight check
  await test('OPTIONS /api/extract returns 204 with CORS headers', async () => {
    const res = await dispatch('/api/extract', 'OPTIONS');
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], '*');
  });

  // 9. Parser Multi-Slide Relay Extraction
  await test('InstagramParser handles 15-slide relay JSON correctly', () => {
    const mockJson = {
      items: [{
        carousel_media_count: 15,
        carousel_media: Array.from({ length: 15 }, (_, i) => ({
          image_versions2: {
            candidates: [
              { url: `https://instagram.fcdn.net/v/slide_${i + 1}_thumb.jpg`, width: 320, height: 320 },
              { url: `https://instagram.fcdn.net/v/slide_${i + 1}_full.jpg`, width: 1080, height: 1080 }
            ]
          }
        }))
      }]
    };
    const images = InstagramParser.extractImagesFromAnyJson(mockJson);
    assert.strictEqual(images.length, 15);
    assert.strictEqual(images[0], 'https://instagram.fcdn.net/v/slide_1_full.jpg');
    assert.strictEqual(images[14], 'https://instagram.fcdn.net/v/slide_15_full.jpg');
  });

  // 10. Direct Caption PDF Link Detection
  await test('InstagramParser detects Google Drive, Dropbox, and direct PDF links', () => {
    const sampleCaption = 'Read our paper at https://arxiv.org/pdf/2301.00001.pdf or download the slides from https://drive.google.com/file/d/1A2B3C4D5E6F7G/view?usp=sharing';
    const pdfLinks = InstagramParser.extractPdfLinks(sampleCaption);
    assert.strictEqual(pdfLinks.length, 2);
    const gDrive = pdfLinks.find(l => l.label === 'Google Drive PDF');
    const arxiv = pdfLinks.find(l => l.label === 'ArXiv Academic PDF');
    assert.ok(gDrive, 'Should find Google Drive PDF');
    assert.ok(arxiv, 'Should find ArXiv PDF');
    assert.ok(gDrive.downloadUrl.includes('export=download'));
  });

  // 11. PDF Builder Multi-Slide Compilation in pure JS
  await test('PdfBuilder creates valid 15-slide PDF document binary', () => {
    // 1x1 valid sample JPEG header & EOI
    const sampleJpeg = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
      0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xD2,
      0xFF, 0xD9
    ]);

    const doc = new PdfBuilder.PdfDocument({ title: '15-Slide Presentation Test', author: 'Instagram Creator' });
    for (let i = 0; i < 15; i++) {
      doc.addSlidePage(sampleJpeg, 1080, 1080, i + 1, 15);
    }
    const pdfBytes = doc.buildUint8Array();
    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 500);

    const pdfStr = Buffer.from(pdfBytes).toString('latin1');
    assert.ok(pdfStr.startsWith('%PDF-1.4'));
    assert.ok(pdfStr.includes('%%EOF'));
    assert.ok(pdfStr.includes('/Count 15'));
    assert.ok(pdfStr.includes('/Filter /DCTDecode'));
  });

  // 12. PDF Builder Document Report Mode with Formatted Cover and Metadata
  await test('PdfBuilder generates Document Report mode with formatted pages', () => {
    const doc = new PdfBuilder.PdfDocument({ title: 'Report Mode Test', author: 'Techorc' });
    doc.addFormattedPage(595, 842, (page) => {
      page.elements.push({ type: 'text', text: 'Report Mode Test', x: 50, y: 780, size: 20, bold: true });
      page.elements.push({ type: 'text', text: 'Author: @Techorc', x: 50, y: 750, size: 12 });
    });
    const pdfBytes = doc.buildUint8Array();
    assert.ok(pdfBytes.length > 200);
    const pdfStr = Buffer.from(pdfBytes).toString('latin1');
    assert.ok(pdfStr.includes('Report Mode Test'));
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed to run:', err);
  process.exit(1);
});
