// test-extension.js - Comprehensive validation suite for InstaPDF extension
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🧪 Starting InstaPDF Chrome Extension Test Suite');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
  }
}

// 1. Verify Manifest and File References
console.log('--- 1. Manifest V3 & File Integrity ---');
const manifestPath = path.join(__dirname, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.manifest_version === 3, 'Manifest version is 3');

// Check icon files
for (const [size, iconRelPath] of Object.entries(manifest.icons)) {
  const iconPath = path.join(__dirname, iconRelPath);
  assert(fs.existsSync(iconPath), `Icon ${size}x${size} exists at ${iconRelPath}`);
  const stat = fs.statSync(iconPath);
  assert(stat.size > 100, `Icon ${size}x${size} is valid non-empty file (${stat.size} bytes)`);
}

// Check popup files
const popupHtmlPath = path.join(__dirname, manifest.action.default_popup);
assert(fs.existsSync(popupHtmlPath), `Popup HTML exists at ${manifest.action.default_popup}`);

const popupCssPath = path.join(__dirname, 'popup', 'popup.css');
assert(fs.existsSync(popupCssPath), 'Popup CSS exists');

const popupJsPath = path.join(__dirname, 'popup', 'popup.js');
assert(fs.existsSync(popupJsPath), 'Popup JS exists');

// Check background service worker
const swPath = path.join(__dirname, manifest.background.service_worker);
assert(fs.existsSync(swPath), `Service worker exists at ${manifest.background.service_worker}`);

// Check content scripts
for (const cs of manifest.content_scripts) {
  for (const jsRel of cs.js) {
    assert(fs.existsSync(path.join(__dirname, jsRel)), `Content script JS exists: ${jsRel}`);
  }
  for (const cssRel of cs.css) {
    assert(fs.existsSync(path.join(__dirname, cssRel)), `Content script CSS exists: ${cssRel}`);
  }
}

// Check core libraries
const parserPath = path.join(__dirname, 'lib', 'instagram-parser.js');
const pdfBuilderPath = path.join(__dirname, 'lib', 'pdf-builder.js');
assert(fs.existsSync(parserPath), 'instagram-parser.js exists');
assert(fs.existsSync(pdfBuilderPath), 'pdf-builder.js exists');

// 2. Test Instagram Parser Logic
console.log('\n--- 2. Instagram URL & Caption Parsing ---');
const InstagramParser = require('./lib/instagram-parser.js');

// Test URL parsing
const url1 = InstagramParser.parseInstagramUrl('https://www.instagram.com/p/DBxyz123_45/?igsh=MWQ1Z==');
assert(url1.valid && url1.shortcode === 'DBxyz123_45' && url1.type === 'post', 'Standard post URL parsed properly');

const url2 = InstagramParser.parseInstagramUrl('https://instagram.com/reel/C89abcdef/');
assert(url2.valid && url2.shortcode === 'C89abcdef' && url2.type === 'reel', 'Reel URL parsed properly');

const invalidUrl = InstagramParser.parseInstagramUrl('https://google.com');
assert(!invalidUrl.valid, 'Invalid non-Instagram URL rejected');

// Test PDF Link Extraction from Caption
const sampleCaption = `
🚀 FREE RESOURCE: Download the Complete System Design CheatSheet (PDF)!
Direct download: https://cdn.techresource.org/books/system_design_handbook.pdf?token=sec123
Also mirrored on Google Drive: https://drive.google.com/file/d/1234567890abcdef_XYZ/view?usp=sharing
And Dropbox: https://www.dropbox.com/s/987654321/microservices_guide.pdf?dl=0
Check it out!
`;

const detectedPdfs = InstagramParser.extractPdfLinks(sampleCaption);
assert(detectedPdfs.length === 3, 'Found 3 PDF documents in caption');
const gdriveItem = detectedPdfs.find(d => d.type === 'google_drive');
const dropboxItem = detectedPdfs.find(d => d.type === 'dropbox');
const directItem = detectedPdfs.find(d => d.type === 'direct_pdf');

assert(directItem && directItem.filename === 'system_design_handbook.pdf', 'Direct PDF extracted correctly');
assert(gdriveItem && gdriveItem.downloadUrl.includes('export=download'), 'Google Drive download converted');
assert(dropboxItem && dropboxItem.downloadUrl.includes('dl=1'), 'Dropbox dl=1 converted');

// 3. Test PDF Builder Engine
console.log('\n--- 3. PDF Generation Engine ---');
const PdfBuilder = require('./lib/pdf-builder.js');

const sample1x1Jpeg = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
  0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
  0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
  0x00, 0x7F, 0x00, 0xFF, 0xD9
]);

const doc = new PdfBuilder.PdfDocument({
  title: 'Test Carousel Export',
  author: '@tech_creator'
});

// Add 3 slide pages to simulate a 3-slide carousel
doc.addSlidePage(sample1x1Jpeg, 1080, 1080);
doc.addSlidePage(sample1x1Jpeg, 1080, 1080);
doc.addSlidePage(sample1x1Jpeg, 1080, 1080);

const pdfBytes = doc.buildUint8Array();
assert(pdfBytes.length > 500, `Generated PDF is valid non-empty byte stream (${pdfBytes.length} bytes)`);

const pdfHeader = Buffer.from(pdfBytes.subarray(0, 8)).toString('ascii');
assert(pdfHeader.startsWith('%PDF-1.4'), 'Generated PDF starts with %PDF-1.4 header');

const pdfFooter = Buffer.from(pdfBytes.subarray(pdfBytes.length - 12)).toString('ascii');
assert(pdfFooter.includes('%%EOF'), 'Generated PDF ends with %%EOF marker');

// Verify word wrap logic
const wrapped = PdfBuilder.wrapText('This is a test of long caption sentence wrapping logic.', 20);
assert(wrapped.length > 1, `Word wrapping split lines correctly into ${wrapped.length} lines`);

// 4. Edge Cases & Security Sanitization
console.log('\n--- 4. Edge Cases & Filename Sanitization ---');

// Test filename sanitization
function sanitizeFilename(filename) {
  return (filename || 'instagram_document.pdf')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_');
}

const messyName = 'My "Dangerous" File: What / Why? * <Test>.pdf';
const cleanedName = sanitizeFilename(messyName);
assert(!/[<>:"/\\|?*]/.test(cleanedName), 'Filename sanitized properly with no dangerous characters');
assert(cleanedName.includes('Dangerous') && cleanedName.endsWith('.pdf'), 'Filename format preserved');

// Test caption with unicode and emoji escaping in PDF
const unicodeDoc = new PdfBuilder.PdfDocument();
const safeEscaped = unicodeDoc.escapePdfString('Check out this 🚀 guide: "Python 101" & (Tips) \\ Special!');
assert(!safeEscaped.includes('\\"') && safeEscaped.includes('\\(') && safeEscaped.includes('\\)'), 'PDF string literals properly escaped');

// Test embed HTML parser with mock data
const mockEmbed = `
<html><body>
  <span class="UsernameText">coding_academy</span>
  <img class="EmbeddedMediaImage" src="https://cdn.example.com/slide1.jpg" />
  <div class="Caption">Complete Cheat Sheet. Download PDF at https://files.org/cheatsheet.pdf</div>
</body></html>`;

const parsedEmbed = InstagramParser.parseEmbedHtml(mockEmbed, 'C12345');
assert(parsedEmbed.success, 'Embed parsed successfully');
assert(parsedEmbed.author === 'coding_academy', 'Author extracted correctly');
assert(parsedEmbed.images.length === 1, 'Image extracted from embed');
assert(parsedEmbed.pdfLinks.length === 1, 'PDF link detected in embed caption');

// 5. Test 15-Slide Carousel Extraction (User Case)
console.log('\n--- 5. 15-Slide Carousel Extraction ---');

const userUrl = 'https://www.instagram.com/p/DfJ3eUBk6gh/?exln=bzF6b3dhZ3BmdmF4';
const parsedUserUrl = InstagramParser.parseInstagramUrl(userUrl);
assert(parsedUserUrl.valid && parsedUserUrl.shortcode === 'DfJ3eUBk6gh', 'User 15-slide post URL correctly parsed with shortcode DfJ3eUBk6gh');

// Simulate 15-slide carousel in Instagram HTML script tag
const mock15SlideHtml = `
<html>
<head>
<script type="application/json" data-sjs>
{
  "require": [
    ["RelayPrefetchedStreamCache", "next", [], [
      {
        "data": {
          "xdt_shortcode_media": {
            "shortcode": "DfJ3eUBk6gh",
            "owner": { "username": "design_architect" },
            "edge_media_to_caption": { "edges": [{ "node": { "text": "15 architecture tips" } }] },
            "edge_sidecar_to_children": {
              "edges": ${JSON.stringify(Array.from({ length: 15 }, (_, i) => ({
                node: {
                  id: `slide_${i + 1}`,
                  display_url: `https://instagram.cdn.net/v/slide_${i + 1}.jpg`,
                  display_resources: [
                    { src: `https://instagram.cdn.net/v/slide_${i + 1}_640.jpg`, config_width: 640 },
                    { src: `https://instagram.cdn.net/v/slide_${i + 1}_1080.jpg`, config_width: 1080 }
                  ]
                }
              })))}
            }
          }
        }
      }
    ]]
  ]
}
</script>
</head>
<body>
  <img class="EmbeddedMediaImage" src="https://instagram.cdn.net/v/slide_1.jpg" />
</body>
</html>
`;

const parsed15SlidePost = InstagramParser.parseEmbedHtml(mock15SlideHtml, 'DfJ3eUBk6gh');
assert(parsed15SlidePost.success, '15-slide HTML parsed successfully');
assert(parsed15SlidePost.images.length === 15, `Extracted all 15 slide images (found: ${parsed15SlidePost.images.length})`);
assert(parsed15SlidePost.images[0].includes('1080'), '1080p high resolution slide selected');

// Test generating a 15-page PDF document
const doc15 = new PdfBuilder.PdfDocument({
  title: '15 Slides Architecture Guide',
  author: '@design_architect'
});

for (let i = 0; i < 15; i++) {
  doc15.addSlidePage(sample1x1Jpeg, 1080, 1080, i + 1, 15);
}

const pdf15Bytes = doc15.buildUint8Array();
assert(pdf15Bytes.length > 3000, `Generated 15-page PDF with slide badges successfully (${pdf15Bytes.length} bytes)`);

console.log('\n====================================================');
console.log(`📊 Summary: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
