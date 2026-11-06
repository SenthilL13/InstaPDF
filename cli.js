#!/usr/bin/env node
/**
 * InstaPDF CLI - Instagram Post to PDF Command-Line Tool
 * Extracts multi-slide carousels, infographics, and PDF documents
 * directly from Instagram URLs and compiles them into PDFs.
 *
 * Zero external npm dependencies.
 */

const fs = require('fs');
const path = require('path');
const InstagramParser = require('./lib/instagram-parser.js');
const PdfBuilder = require('./lib/pdf-builder.js');

function printHelp() {
  console.log(`
InstaPDF CLI - Instagram Post to PDF Downloader
======================================================
Usage:
  node cli.js <instagram_url> [options]

Arguments:
  <instagram_url>        Instagram post URL (or shortcode)
                         e.g. https://www.instagram.com/p/DfJ3eUBk6gh/

Options:
  -m, --mode <type>      Layout mode: 'presentation' (default) or 'document' (A4)
  -o, --output <file>    Custom output file path (e.g. 'my_slides.pdf')
  -c, --cookie <string>  Instagram sessionid or Cookie header for restricted posts
  --no-numbers           Disable slide numbering badges (e.g. '1 / 15')
  -h, --help             Show this help guide

Examples:
  node cli.js https://www.instagram.com/p/DfJ3eUBk6gh/
  node cli.js DfJ3eUBk6gh --mode document --output report.pdf
  node cli.js https://www.instagram.com/p/DfJ3eUBk6gh/ -c "sessionid=YOUR_COOKIE"
`);
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  let rawUrl = '';
  let mode = 'presentation';
  let outputFile = '';
  let cookie = process.env.INSTAGRAM_COOKIE || '';
  let showSlideNumbers = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-m' || arg === '--mode') {
      mode = (args[++i] || '').toLowerCase() === 'document' ? 'document' : 'presentation';
    } else if (arg === '-o' || arg === '--output') {
      outputFile = args[++i] || '';
    } else if (arg === '-c' || arg === '--cookie') {
      cookie = args[++i] || '';
    } else if (arg === '--no-numbers') {
      showSlideNumbers = false;
    } else if (!arg.startsWith('-') && !rawUrl) {
      rawUrl = arg;
    }
  }

  if (!rawUrl) {
    console.error('❌ Error: Missing Instagram post URL.');
    printHelp();
    process.exit(1);
  }

  // Allow passing raw shortcode
  if (!rawUrl.includes('instagram.com') && /^[A-Za-z0-9_-]{5,}$/.test(rawUrl)) {
    rawUrl = `https://www.instagram.com/p/${rawUrl}/`;
  }

  const parsed = InstagramParser.parseInstagramUrl(rawUrl);
  if (!parsed.valid) {
    console.error(`❌ Error: ${parsed.error}`);
    process.exit(1);
  }

  const shortcode = parsed.shortcode;
  console.log(`\n🔍 Inspecting Instagram post: [${shortcode}]`);

  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  if (cookie) {
    headers['Cookie'] = cookie;
    console.log('🔒 Using provided session cookie for authenticated extraction.');
  }

  let post = null;
  let isLoginRequired = false;

  // Strategy 1: Web API
  try {
    const resp = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, { headers });
    if (resp.status === 401 || resp.status === 403) isLoginRequired = true;
    if (resp.ok) {
      const json = await resp.json();
      if (json.require_login || json.message === 'login_required') isLoginRequired = true;
      const images = InstagramParser.extractImagesFromAnyJson(json);
      if (images.length > 0) {
        const item = json.items?.[0] || json.graphql?.shortcode_media;
        post = {
          shortcode,
          author: item?.user?.username || item?.owner?.username || 'instagram_user',
          caption: item?.caption?.text || item?.edge_media_to_caption?.edges?.[0]?.node?.text || '',
          images,
          pdfLinks: InstagramParser.extractPdfLinks(item?.caption?.text || '')
        };
      }
    }
  } catch (e) {}

  // Strategy 2: Page HTML with Relay JSON
  if (!post) {
    try {
      const resp = await fetch(parsed.canonicalUrl, {
        headers: {
          ...headers,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        }
      });
      if (resp.status === 401 || resp.status === 403) isLoginRequired = true;
      if (resp.ok) {
        const html = await resp.text();
        if (html.includes('httpErrorPage') || html.includes('login_required')) isLoginRequired = true;
        const p = InstagramParser.parseEmbedHtml(html, shortcode);
        if (p && (p.images.length > 0 || p.pdfLinks.length > 0)) {
          post = p;
        }
      }
    } catch (e) {}
  }

  // Strategy 3: Embed Captioned
  if (!post) {
    try {
      const resp = await fetch(parsed.embedUrl, {
        headers: {
          ...headers,
          'Referer': 'https://www.instagram.com/',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site'
        }
      });
      if (resp.ok) {
        const html = await resp.text();
        if (html.includes('httpErrorPage') || html.includes('login_required')) isLoginRequired = true;
        const p = InstagramParser.parseEmbedHtml(html, shortcode);
        if (p && (p.images.length > 0 || p.pdfLinks.length > 0)) {
          post = p;
        }
      }
    } catch (e) {}
  }

  if (!post || (!post.images.length && !post.pdfLinks.length)) {
    console.error('\n❌ Extraction Failed:');
    if (isLoginRequired) {
      console.error('This post requires an Instagram login session to view.');
      console.error('You can provide your session cookie using:');
      console.error(`  node cli.js ${shortcode} -c "sessionid=YOUR_COOKIE"`);
      console.error('Or use the InstaPDF Chrome Extension directly from your logged-in browser.\n');
    } else {
      console.error('No downloadable slides or PDF documents detected in this post.');
    }
    process.exit(1);
  }

  console.log(`👤 Author:  @${post.author}`);
  if (post.caption) {
    const snippet = post.caption.slice(0, 100).replace(/\n/g, ' ');
    console.log(`📝 Caption: "${snippet}${post.caption.length > 100 ? '...' : ''}"`);
  }

  // 1. Direct PDF Link in Caption
  if (post.pdfLinks && post.pdfLinks.length > 0) {
    const firstPdf = post.pdfLinks[0];
    console.log(`\n🎯 Direct PDF Document Detected!`);
    console.log(`   Source: ${firstPdf.label} (${firstPdf.source})`);
    console.log(`   URL:    ${firstPdf.downloadUrl}`);

    const pdfTargetName = outputFile || `Instagram_${post.author}_${firstPdf.filename || 'document.pdf'}`;
    console.log(`⬇️ Downloading direct PDF document to: ${pdfTargetName}...`);

    try {
      const docResp = await fetch(firstPdf.downloadUrl);
      if (!docResp.ok) throw new Error(`HTTP ${docResp.status}`);
      const buf = Buffer.from(await docResp.arrayBuffer());
      fs.writeFileSync(pdfTargetName, buf);
      console.log(`✅ Direct PDF successfully saved: ${pdfTargetName} (${(buf.length / 1024).toFixed(1)} KB)\n`);
      if (post.images.length === 0) process.exit(0);
    } catch (docErr) {
      console.error(`⚠️ Could not auto-download direct PDF: ${docErr.message}`);
    }
  }

  // 2. Carousel Slides to PDF
  if (post.images && post.images.length > 0) {
    const total = post.images.length;
    console.log(`\n📑 Detected ${total} slide image(s). Compiling into PDF [Mode: ${mode}]...`);

    let finalName = outputFile;
    if (!finalName) {
      finalName = `Instagram_${post.author}_${post.shortcode}_${total}slides.pdf`;
    }
    if (!finalName.toLowerCase().endsWith('.pdf')) {
      finalName += '.pdf';
    }

    // Fetch and normalize all JPEG byte streams
    const normalizedSlides = [];
    for (let i = 0; i < total; i++) {
      process.stdout.write(`   [${i + 1}/${total}] Fetching slide ${i + 1}... `);
      const imgUrl = post.images[i];
      let imgResp;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          imgResp = await fetch(imgUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          if (imgResp.ok) break;
        } catch (e) {
          if (attempt === 3) throw e;
          await new Promise(r => setTimeout(r, 600));
        }
      }

      if (!imgResp || !imgResp.ok) {
        console.log('Failed!');
        throw new Error(`Failed to download slide ${i + 1} (HTTP ${imgResp?.status})`);
      }

      const ab = await imgResp.arrayBuffer();
      const bytes = new Uint8Array(ab);

      // Extract JPEG dimensions
      const dims = getJpegDimensions(bytes) || { width: 1080, height: 1080 };
      normalizedSlides.push({ bytes, width: dims.width, height: dims.height });
      console.log(`OK (${dims.width}x${dims.height})`);
    }

    console.log('   🔨 Assembling PDF-1.4 binary structure...');
    const doc = new PdfBuilder.PdfDocument({
      title: `Instagram Post by @${post.author}`,
      author: `@${post.author}`,
      subject: post.caption ? post.caption.slice(0, 120) : 'Instagram Carousel'
    });

    if (mode === 'document') {
      // Document Report Mode (A4 with cover)
      doc.addFormattedPage(595, 842, (page) => {
        page.elements.push({ type: 'text', text: 'Instagram Document Report', x: 45, y: 775, size: 22, bold: true, color: [0.1, 0.1, 0.1] });
        page.elements.push({ type: 'text', text: `Author: @${post.author}  •  Shortcode: ${post.shortcode}  •  Slides: ${total}`, x: 45, y: 750, size: 10, color: [0.45, 0.45, 0.45] });
        page.elements.push({ type: 'line', x1: 45, y1: 738, x2: 550, y2: 738, color: [0.85, 0.85, 0.85], width: 1 });

        if (post.caption) {
          const lines = PdfBuilder.wrapText(post.caption, 80, 12);
          let textY = 715;
          for (const line of lines) {
            page.elements.push({ type: 'text', text: line, x: 45, y: textY, size: 9.5, color: [0.25, 0.25, 0.25] });
            textY -= 15;
          }
        }
      });

      for (let i = 0; i < total; i++) {
        const slide = normalizedSlides[i];
        doc.addFormattedPage(595, 842, (page) => {
          page.elements.push({ type: 'text', text: `Slide ${i + 1} of ${total}`, x: 45, y: 810, size: 12, bold: true, color: [0.2, 0.2, 0.2] });
          page.elements.push({ type: 'text', text: `@${post.author}`, x: 470, y: 810, size: 10, color: [0.5, 0.5, 0.5] });
          page.elements.push({ type: 'line', x1: 45, y1: 798, x2: 550, y2: 798, color: [0.88, 0.88, 0.88], width: 0.8 });

          const boxW = 505;
          const boxH = 720;
          const aspect = slide.width / slide.height;
          let renderW = boxW;
          let renderH = renderW / aspect;
          if (renderH > boxH) {
            renderH = boxH;
            renderW = renderH * aspect;
          }
          const renderX = 45 + (boxW - renderW) / 2;
          const renderY = 60 + (boxH - renderH) / 2;

          page.elements.push({
            type: 'image',
            jpegBytes: slide.bytes,
            pixelWidth: slide.width,
            pixelHeight: slide.height,
            x: Math.round(renderX),
            y: Math.round(renderY),
            w: Math.round(renderW),
            h: Math.round(renderH)
          });
        });
      }
    } else {
      // Slide Presentation Mode (1080p full-bleed)
      for (let i = 0; i < total; i++) {
        const slide = normalizedSlides[i];
        doc.addSlidePage(slide.bytes, slide.width, slide.height, showSlideNumbers ? (i + 1) : null, showSlideNumbers ? total : null);
      }
    }

    const pdfBytes = doc.buildUint8Array();
    fs.writeFileSync(finalName, Buffer.from(pdfBytes));

    console.log(`\n🎉 PDF Compiled Successfully!`);
    console.log(`   📁 Output File: ${path.resolve(finalName)}`);
    console.log(`   📊 File Size:   ${(pdfBytes.length / 1024).toFixed(1)} KB`);
    console.log(`   📄 Pages:       ${mode === 'document' ? total + 1 : total} pages\n`);
  }
}

function getJpegDimensions(bytes) {
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width, height };
    }
    if (marker >= 0xD0 && marker <= 0xD9) {
      i += 2;
    } else {
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + length;
    }
  }
  return null;
}

runCli().catch(err => {
  console.error('\n❌ Unhandled Error:', err.message);
  process.exit(1);
});
