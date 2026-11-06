/**
 * InstaPDF - Client-Side PDF Generation Engine
 * Standards-compliant PDF-1.4 generation without external dependencies.
 * Lossless JPEG embedding via DCTDecode, text layout, and A4/custom page geometry.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PdfBuilder = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class PdfDocument {
    constructor(metadata = {}) {
      this.title = metadata.title || 'Instagram Post PDF';
      this.author = metadata.author || 'InstaPDF Downloader';
      this.subject = metadata.subject || 'Instagram Carousel Document';
      this.keywords = metadata.keywords || 'Instagram, PDF, Carousel';
      this.creator = 'InstaPDF Chrome Extension';
      this.pages = [];
    }

    addSlidePage(jpegBytes, width, height, slideNumber = null, totalSlides = null) {
      // Normalize dimensions: Instagram images are often 1080x1080 or 1080x1350.
      // In PDF points (72 DPI), 1080 is large, but standard PDF viewers handle any MediaBox points.
      // Scaling to reasonable PDF points (e.g., standard points based on width 612 pt / 8.5 in)
      const targetWidth = 612;
      const targetHeight = (height / width) * targetWidth;

      const page = {
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        elements: []
      };

      page.elements.push({
        type: 'image',
        jpegBytes: jpegBytes,
        pixelWidth: width,
        pixelHeight: height,
        x: 0,
        y: 0,
        w: page.width,
        h: page.height
      });

      // Optional slide number badge for presentation mode
      if (slideNumber !== null && totalSlides !== null && totalSlides > 1) {
        const badgeText = `${slideNumber} / ${totalSlides}`;
        const badgeW = 48;
        const badgeH = 18;
        const badgeX = page.width - badgeW - 14;
        const badgeY = 14;

        page.elements.push({
          type: 'rect',
          x: badgeX,
          y: badgeY,
          w: badgeW,
          h: badgeH,
          color: [0.12, 0.12, 0.14]
        });

        page.elements.push({
          type: 'text',
          text: badgeText,
          x: badgeX + 7,
          y: badgeY + 5,
          size: 9,
          bold: true,
          color: [1, 1, 1]
        });
      }

      this.pages.push(page);
      return page;
    }

    addFormattedPage(width = 595, height = 842, renderFn) {
      const page = {
        width: width,
        height: height,
        elements: []
      };
      if (typeof renderFn === 'function') {
        renderFn(page);
      }
      this.pages.push(page);
      return page;
    }

    escapePdfString(str) {
      if (!str) return '';
      return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        // Replace non-ascii/special characters with safe latin1 approximations
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, function (c) {
          const code = c.charCodeAt(0);
          if (code === 8217 || code === 8216) return "'";
          if (code === 8220 || code === 8221) return '"';
          if (code === 8211 || code === 8212) return '-';
          if (code === 8230) return '...';
          return ' ';
        });
    }

    buildUint8Array() {
      const objRegistry = [];
      function alloc() {
        objRegistry.push(null);
        return objRegistry.length; // 1-based index
      }

      const fontRegularId = alloc();
      const fontBoldId = alloc();
      const pagesParentId = alloc();

      const pageObjIds = [];
      const imageMap = new Map(); // jpegBytes -> { id, pixelWidth, pixelHeight, length }

      const pageBuildData = [];

      for (const page of this.pages) {
        const pageId = alloc();
        pageObjIds.push(pageId);

        const pageImages = [];
        for (const el of page.elements) {
          if (el.type === 'image') {
            let imgEntry = imageMap.get(el.jpegBytes);
            if (!imgEntry) {
              const imgId = alloc();
              imgEntry = {
                id: imgId,
                pixelWidth: el.pixelWidth,
                pixelHeight: el.pixelHeight,
                jpegBytes: el.jpegBytes
              };
              imageMap.set(el.jpegBytes, imgEntry);
            }
            pageImages.push({
              name: `Im${imgEntry.id}`,
              id: imgEntry.id,
              el: el
            });
          }
        }

        const contentId = alloc();
        pageBuildData.push({ page, pageId, contentId, pageImages });
      }

      const infoObjId = alloc();
      const catalogObjId = alloc();

      // Register Objects:
      // Fonts
      objRegistry[fontRegularId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objRegistry[fontBoldId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

      // Pages Parent
      const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
      objRegistry[pagesParentId - 1] = `<< /Type /Pages /Kids [${kidsStr}] /Count ${this.pages.length} >>`;

      // Image XObjects
      for (const entry of imageMap.values()) {
        const header = `<< /Type /XObject /Subtype /Image /Width ${entry.pixelWidth} /Height ${entry.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${entry.jpegBytes.length} >>\nstream\n`;
        const footer = '\nendstream';
        objRegistry[entry.id - 1] = {
          rawHeader: header,
          rawStream: entry.jpegBytes,
          rawFooter: footer
        };
      }

      // Page objects & Content Streams
      for (const pd of pageBuildData) {
        const { page, pageId, contentId, pageImages } = pd;
        let cmds = '';

        // Draw background if specified
        if (page.bgColor) {
          const [r, g, b] = page.bgColor;
          cmds += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 0 0 ${page.width} ${page.height} re f\n`;
        }

        // Render page elements
        for (const el of page.elements) {
          if (el.type === 'image') {
            const imgRef = pageImages.find(p => p.el === el);
            cmds += `q ${el.w} 0 0 ${el.h} ${el.x} ${el.y} cm /${imgRef.name} Do Q\n`;
          } else if (el.type === 'rect') {
            const [r, g, b] = el.color || [0.9, 0.9, 0.9];
            cmds += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${el.x} ${el.y} ${el.w} ${el.h} re f\n`;
          } else if (el.type === 'line') {
            const [r, g, b] = el.color || [0.8, 0.8, 0.8];
            cmds += `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${el.width || 1} w ${el.x1} ${el.y1} m ${el.x2} ${el.y2} l S\n`;
          } else if (el.type === 'text') {
            const fontName = el.bold ? '/F2' : '/F1';
            const size = el.size || 12;
            const [r, g, b] = el.color || [0, 0, 0];
            cmds += `BT ${fontName} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${el.x} ${el.y} Td (${this.escapePdfString(el.text)}) Tj ET\n`;
          }
        }

        const streamBytes = new TextEncoder().encode(cmds);
        objRegistry[contentId - 1] = `<< /Length ${streamBytes.length} >>\nstream\n${cmds}endstream`;

        let xobjDict = '';
        if (pageImages.length > 0) {
          xobjDict = ` /XObject << ${pageImages.map(pi => `/${pi.name} ${pi.id} 0 R`).join(' ')} >>`;
        }

        objRegistry[pageId - 1] = `<< /Type /Page /Parent ${pagesParentId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xobjDict} >> /Contents ${contentId} 0 R >>`;
      }

      // Metadata Info Dictionary
      const nowStr = formatPdfDate(new Date());
      objRegistry[infoObjId - 1] = `<< /Title (${this.escapePdfString(this.title)}) /Author (${this.escapePdfString(this.author)}) /Creator (${this.escapePdfString(this.creator)}) /CreationDate (${nowStr}) >>`;

      // Catalog
      objRegistry[catalogObjId - 1] = `<< /Type /Catalog /Pages ${pagesParentId} 0 R >>`;

      // Assemble binary buffers
      const chunks = [];
      let totalBytes = 0;

      function pushChunk(chunk) {
        if (typeof chunk === 'string') {
          chunk = new TextEncoder().encode(chunk);
        }
        chunks.push(chunk);
        totalBytes += chunk.length;
      }

      pushChunk('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

      const xrefOffsets = [0];

      for (let i = 0; i < objRegistry.length; i++) {
        const id = i + 1;
        xrefOffsets[id] = totalBytes;

        pushChunk(`${id} 0 obj\n`);
        const item = objRegistry[i];

        if (typeof item === 'string') {
          pushChunk(item);
          pushChunk('\nendobj\n');
        } else if (item && item.rawHeader) {
          pushChunk(item.rawHeader);
          pushChunk(item.rawStream);
          pushChunk(item.rawFooter);
          pushChunk('\nendobj\n');
        }
      }

      const startXref = totalBytes;
      pushChunk(`xref\n0 ${objRegistry.length + 1}\n0000000000 65535 f \n`);

      for (let i = 1; i <= objRegistry.length; i++) {
        const offStr = String(xrefOffsets[i]).padStart(10, '0');
        pushChunk(`${offStr} 00000 n \n`);
      }

      pushChunk(`trailer\n<< /Size ${objRegistry.length + 1} /Root ${catalogObjId} 0 R /Info ${infoObjId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

      // Combine all chunks into one single Uint8Array
      const finalBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        finalBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      return finalBuffer;
    }

    buildBlob() {
      const uint8 = this.buildUint8Array();
      return new Blob([uint8], { type: 'application/pdf' });
    }
  }

  function formatPdfDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}Z`;
  }

  /**
   * Helper: fetches image URL, inspects dimensions, converts to JPEG Uint8Array if needed.
   */
  async function fetchAndNormalizeJpeg(imageUrl) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch slide image (${resp.status}): ${imageUrl}`);
    }

    const blob = await resp.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Check if it's already a JPEG (starts with 0xFF, 0xD8)
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;

    let width = 1080;
    let height = 1080;

    if (isJpeg) {
      const dim = getJpegDimensions(bytes);
      if (dim) {
        width = dim.width;
        height = dim.height;
      }
      return { bytes, width, height };
    }

    // If not JPEG (e.g. WebP or PNG), convert via Canvas/Image
    const converted = await convertBlobToJpeg(blob);
    return converted;
  }

  function getJpegDimensions(bytes) {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xFF) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      // SOF markers: 0xC0 (baseline), 0xC1 (extended), 0xC2 (progressive)
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        return { width, height };
      }
      // Skip variable-length marker segment
      if (marker >= 0xD0 && marker <= 0xD9) {
        i += 2; // standalone markers (RST, SOI, EOI)
      } else {
        const length = (bytes[i + 2] << 8) | bytes[i + 3];
        i += 2 + length;
      }
    }
    return null;
  }

  async function convertBlobToJpeg(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1080;
        canvas.height = img.naturalHeight || 1080;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((jpegBlob) => {
          if (!jpegBlob) return reject(new Error('Canvas JPEG conversion failed'));
          jpegBlob.arrayBuffer().then(buf => {
            resolve({
              bytes: new Uint8Array(buf),
              width: canvas.width,
              height: canvas.height
            });
          });
        }, 'image/jpeg', 0.94);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for conversion'));
      };
      img.src = url;
    });
  }

  /**
   * Word wrap helper for PDF text layout.
   */
  function wrapText(text, maxCharsPerLine = 75) {
    if (!text) return [];
    const lines = [];
    const rawParagraphs = text.split('\n');

    for (const paragraph of rawParagraphs) {
      if (!paragraph.trim()) {
        lines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }
    return lines;
  }

  /**
   * High-level compiler: converts an Instagram post object into a PDF blob.
   * mode: 'slides_only' | 'document'
   */
  async function compileInstagramPostToPdf(post, options = {}, progressCallback) {
    const mode = options.mode || 'slides_only'; // 'slides_only' or 'document'
    const imageUrls = post.images || [];

    if (imageUrls.length === 0) {
      throw new Error('No images found in this Instagram post to generate PDF.');
    }

    const doc = new PdfDocument({
      title: `Instagram Post @${post.author || 'post'} [${post.shortcode || ''}]`,
      author: post.author ? `@${post.author}` : 'Instagram Creator',
      subject: post.caption ? post.caption.substring(0, 100) : 'Instagram Post'
    });

    // If 'document' mode selected, add a polished A4 cover sheet
    if (mode === 'document') {
      doc.addFormattedPage(595, 842, (page) => {
        // Gradient-like Header Bar
        page.elements.push({ type: 'rect', x: 0, y: 760, w: 595, h: 82, color: [0.83, 0.18, 0.45] });
        page.elements.push({ type: 'text', text: 'Instagram Document Export', x: 45, y: 805, size: 20, bold: true, color: [1, 1, 1] });
        page.elements.push({ type: 'text', text: 'Generated with InstaPDF Downloader', x: 45, y: 780, size: 11, color: [0.95, 0.95, 0.95] });

        // Metadata box
        let curY = 720;
        page.elements.push({ type: 'text', text: `Creator: @${post.author || 'unknown'}`, x: 45, y: curY, size: 14, bold: true, color: [0.15, 0.15, 0.15] });
        curY -= 20;

        if (post.shortcode) {
          page.elements.push({ type: 'text', text: `Shortcode: ${post.shortcode}  |  Slides: ${imageUrls.length}`, x: 45, y: curY, size: 11, color: [0.4, 0.4, 0.4] });
          curY -= 20;
        }

        page.elements.push({ type: 'text', text: `Original Post: https://www.instagram.com/p/${post.shortcode}/`, x: 45, y: curY, size: 10, color: [0.1, 0.4, 0.8] });
        curY -= 25;

        // Divider
        page.elements.push({ type: 'line', x1: 45, y1: curY, x2: 550, y2: curY, color: [0.85, 0.85, 0.85], width: 1 });
        curY -= 25;

        // Caption header
        page.elements.push({ type: 'text', text: 'Post Caption:', x: 45, y: curY, size: 12, bold: true, color: [0.2, 0.2, 0.2] });
        curY -= 20;

        // Wrap and render caption
        const captionLines = wrapText(post.caption || 'No caption provided.', 78);
        const maxLines = 26; // limit lines on cover sheet to prevent overflow
        for (let i = 0; i < Math.min(captionLines.length, maxLines); i++) {
          const line = captionLines[i];
          if (line) {
            page.elements.push({ type: 'text', text: line, x: 45, y: curY, size: 10, color: [0.25, 0.25, 0.25] });
          }
          curY -= 15;
          if (curY < 80) break;
        }

        if (captionLines.length > maxLines) {
          page.elements.push({ type: 'text', text: '... (caption continued)', x: 45, y: curY, size: 9, color: [0.5, 0.5, 0.5] });
        }

        // Footer
        page.elements.push({ type: 'line', x1: 45, y1: 50, x2: 550, y2: 50, color: [0.88, 0.88, 0.88], width: 0.8 });
        page.elements.push({ type: 'text', text: `InstaPDF Export  *  ${imageUrls.length} Slides Attached Below`, x: 45, y: 35, size: 9, color: [0.5, 0.5, 0.5] });
      });
    }

    // Download each slide and append as a page
    const total = imageUrls.length;
    for (let i = 0; i < total; i++) {
      if (typeof progressCallback === 'function') {
        progressCallback(i + 1, total, `Processing slide ${i + 1} of ${total}...`);
      }

      const imgUrl = imageUrls[i];
      const normalized = await fetchAndNormalizeJpeg(imgUrl);

      if (mode === 'document') {
        // In document mode: A4 page with centered slide and slide title
        doc.addFormattedPage(595, 842, (page) => {
          // Slide counter header
          page.elements.push({ type: 'text', text: `Slide ${i + 1} of ${total}`, x: 45, y: 810, size: 12, bold: true, color: [0.2, 0.2, 0.2] });
          page.elements.push({ type: 'text', text: `@${post.author || 'instagram'}`, x: 550 - 80, y: 810, size: 10, color: [0.5, 0.5, 0.5] });
          page.elements.push({ type: 'line', x1: 45, y1: 798, x2: 550, y2: 798, color: [0.88, 0.88, 0.88], width: 0.8 });

          // Calculate fit in 505 x 720 box
          const boxW = 505;
          const boxH = 720;
          const aspect = normalized.width / normalized.height;
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
            jpegBytes: normalized.bytes,
            pixelWidth: normalized.width,
            pixelHeight: normalized.height,
            x: Math.round(renderX),
            y: Math.round(renderY),
            w: Math.round(renderW),
            h: Math.round(renderH)
          });
        });
      } else {
        // In slides_only mode: pure full-bleed presentation slide (with optional slide numbers)
        const showBadge = options.showSlideNumbers !== false;
        doc.addSlidePage(normalized.bytes, normalized.width, normalized.height, showBadge ? (i + 1) : null, showBadge ? total : null);
      }
    }

    if (typeof progressCallback === 'function') {
      progressCallback(total, total, 'Compiling PDF document...');
    }

    return doc.buildBlob();
  }

  return {
    PdfDocument,
    compileInstagramPostToPdf,
    fetchAndNormalizeJpeg,
    wrapText
  };
});
