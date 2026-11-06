/**
 * InstaPDF Web Application - Backend Server
 * Built with pure Node.js (zero external npm dependencies required).
 * Serves the responsive web frontend and provides proxy & extraction APIs.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load shared Instagram Parser
const InstagramParser = require('./public/lib/instagram-parser.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

const server = http.createServer(async (req, res) => {
  // CORS Headers for API requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // 1. API: Extract Instagram Post Data
  if (pathname === '/api/extract') {
    await handleExtractApi(query, res);
    return;
  }

  // 2. API: Image Proxy (Bypasses browser CORS for canvas/PDF slide rendering)
  if (pathname === '/api/proxy-image') {
    await handleProxyImageApi(query, res);
    return;
  }

  // 3. API: Health Check
  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', service: 'InstaPDF Web App', version: '1.2.0' });
    return;
  }

  // 4. Static File Server
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = 'index.html';

  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for single-page app routing
      serveStaticFile(path.join(PUBLIC_DIR, 'index.html'), res);
      return;
    }
    serveStaticFile(filePath, res);
  });
});

function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * Handles /api/extract?url=...
 */
async function handleExtractApi(query, res) {
  const rawUrl = query.url;
  if (!rawUrl) {
    sendJson(res, 400, { success: false, error: 'Missing "url" parameter.' });
    return;
  }

  const parsed = InstagramParser.parseInstagramUrl(rawUrl);
  if (!parsed.valid) {
    sendJson(res, 400, { success: false, error: parsed.error });
    return;
  }

  const shortcode = parsed.shortcode;
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  if (query.cookie) {
    headers['Cookie'] = query.cookie.trim();
  }

  let isLoginRequired = false;

  // Strategy 1: Instagram Web API (__a=1&__d=dis with official App ID)
  try {
    const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
    const apiResp = await fetch(apiUrl, { headers });

    if (apiResp.status === 401 || apiResp.status === 403) {
      isLoginRequired = true;
    }

    if (apiResp.ok) {
      const contentType = apiResp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const apiJson = await apiResp.json();
        if (apiJson.require_login || apiJson.message === 'login_required') {
          isLoginRequired = true;
        }
        const images = InstagramParser.extractImagesFromAnyJson(apiJson);

        if (images.length > 0) {
          const item = apiJson.items?.[0] || apiJson.graphql?.shortcode_media;
          const caption = item?.caption?.text || item?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
          const author = item?.user?.username || item?.owner?.username || '';
          const pdfLinks = InstagramParser.extractPdfLinks(caption);

          await resolveShortlinksIfAny(pdfLinks);

          sendJson(res, 200, {
            success: true,
            source: 'web_api',
            post: {
              shortcode,
              author,
              caption,
              images: images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`),
              originalImages: images,
              pdfLinks,
              isVideo: !!item?.is_video
            }
          });
          return;
        }
      }
    }
  } catch (e) {}

  // Strategy 2: GraphQL Query Endpoint
  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
    const gqlResp = await fetch(gqlUrl, { headers });

    if (gqlResp.status === 401 || gqlResp.status === 403) {
      isLoginRequired = true;
    }

    if (gqlResp.ok) {
      const gqlJson = await gqlResp.json();
      if (gqlJson.require_login || gqlJson.message === 'login_required') {
        isLoginRequired = true;
      }
      const images = InstagramParser.extractImagesFromAnyJson(gqlJson);

      if (images.length > 0) {
        const media = gqlJson.data?.shortcode_media;
        const caption = media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const author = media?.owner?.username || '';
        const pdfLinks = InstagramParser.extractPdfLinks(caption);

        await resolveShortlinksIfAny(pdfLinks);

        sendJson(res, 200, {
          success: true,
          source: 'graphql_api',
          post: {
            shortcode,
            author,
            caption,
            images: images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`),
            originalImages: images,
            pdfLinks,
            isVideo: !!media?.is_video
          }
        });
        return;
      }
    }
  } catch (e) {}

  // Strategy 3: Page HTML Fetch with script scanner
  try {
    const pageResp = await fetch(parsed.canonicalUrl, {
      headers: {
        ...headers,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    });

    if (pageResp.status === 401 || pageResp.status === 403) {
      isLoginRequired = true;
    }

    if (pageResp.ok) {
      const html = await pageResp.text();
      if (html.includes('httpErrorPage') || html.includes('login_required')) {
        isLoginRequired = true;
      }
      const post = InstagramParser.parseEmbedHtml(html, shortcode);

      if (post && post.images.length > 0) {
        await resolveShortlinksIfAny(post.pdfLinks);
        post.originalImages = [...post.images];
        post.images = post.images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`);

        sendJson(res, 200, {
          success: true,
          source: 'page_html_scripts',
          post
        });
        return;
      }
    }
  } catch (e) {}

  // Strategy 4: Embed Captioned endpoint
  try {
    const embedResp = await fetch(parsed.embedUrl, {
      headers: {
        ...headers,
        'Referer': 'https://www.instagram.com/',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
      }
    });

    if (embedResp.status === 404) {
      sendJson(res, 404, {
        success: false,
        isPrivate: true,
        error: 'Post not found or this account is private. Instagram requires login or permission to view it.'
      });
      return;
    }

    if (embedResp.ok) {
      const html = await embedResp.text();
      if (html.includes('httpErrorPage') || html.includes('login_required')) {
        isLoginRequired = true;
      }
      const post = InstagramParser.parseEmbedHtml(html, shortcode);

      if (post && (post.images.length > 0 || post.pdfLinks.length > 0)) {
        await resolveShortlinksIfAny(post.pdfLinks);
        post.originalImages = [...post.images];
        post.images = post.images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`);

        sendJson(res, 200, {
          success: true,
          source: 'embed_endpoint',
          post
        });
        return;
      }
    }
  } catch (e) {}

  sendJson(res, 200, {
    success: false,
    requireLogin: isLoginRequired,
    error: isLoginRequired
      ? 'Instagram requires a logged-in account to view this post. Since your Chrome extension runs inside your browser, it has access to your active tab. For this website, please connect your session cookie or paste the page source code.'
      : 'Could not extract slides or document from this post. The post might be private, restricted, or rate-limited.'
  });
}

/**
 * Handles /api/proxy-image?url=...
 * Streams images from Instagram CDN with CORS headers enabled.
 */
async function handleProxyImageApi(query, res) {
  const targetUrl = query.url;
  if (!targetUrl) {
    sendJson(res, 400, { success: false, error: 'Missing image "url" parameter' });
    return;
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!resp.ok) {
      sendJson(res, resp.status, { success: false, error: 'Failed to fetch remote image' });
      return;
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buffer = await resp.arrayBuffer();

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(Buffer.from(buffer));
  } catch (err) {
    sendJson(res, 500, { success: false, error: `Image proxy error: ${err.message}` });
  }
}

/**
 * Resolves shortened links to discover target PDFs.
 */
async function resolveShortlinksIfAny(pdfLinks) {
  if (!Array.isArray(pdfLinks)) return;

  for (let i = pdfLinks.length - 1; i >= 0; i--) {
    const item = pdfLinks[i];
    if (item.needsResolution) {
      try {
        const resp = await fetch(item.url, {
          method: 'HEAD',
          redirect: 'follow',
          cache: 'no-cache'
        });

        const finalUrl = resp.url || item.url;
        const contentType = (resp.headers.get('content-type') || '').toLowerCase();

        if (finalUrl.toLowerCase().includes('.pdf') || contentType.includes('application/pdf')) {
          item.downloadUrl = finalUrl;
          item.label = 'Resolved PDF Document';
          const matchName = finalUrl.split('?')[0].match(/\/([^\/?#]+\.pdf)$/i);
          if (matchName) item.filename = decodeURIComponent(matchName[1]);
          delete item.needsResolution;
        } else if (finalUrl.includes('drive.google.com/file/d/')) {
          const fid = finalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
          if (fid) {
            item.downloadUrl = `https://drive.google.com/uc?export=download&id=${fid}`;
            item.filename = `GoogleDrive_${fid}.pdf`;
            item.label = 'Google Drive PDF';
            delete item.needsResolution;
          }
        } else if (finalUrl.includes('dropbox.com/s/')) {
          item.downloadUrl = finalUrl.replace(/([?&])dl=0/i, '') + (finalUrl.includes('?') ? '&dl=1' : '?dl=1');
          item.label = 'Dropbox PDF';
          delete item.needsResolution;
        } else {
          pdfLinks.splice(i, 1);
        }
      } catch (err) {
        pdfLinks.splice(i, 1);
      }
    }
  }
}

// Start Server with automatic fallback if port is in use
function startServer(initialPort, maxAttempts = 10) {
  let currentPort = parseInt(initialPort, 10) || 3000;

  function tryListen(port, attemptsLeft) {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE') {
        server.removeListener('error', onError);
        if (attemptsLeft > 0) {
          console.log(`⚠️  Port ${port} is in use. Trying port ${port + 1}...`);
          tryListen(port + 1, attemptsLeft - 1);
        } else {
          console.error(`\n❌ Error: Could not find an available port starting from ${initialPort}.`);
          console.error(`To free port ${initialPort} on Windows, run this in PowerShell:`);
          console.error(`  Stop-Process -Id (Get-NetTCPConnection -LocalPort ${initialPort}).OwningProcess -Force\n`);
          process.exit(1);
        }
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    };

    server.once('error', onError);

    server.listen(port, () => {
      server.removeListener('error', onError);
      console.log(`\n======================================================`);
      console.log(`🚀 InstaPDF Web App is running!`);
      console.log(`📡 Local URL:   http://localhost:${port}`);
      console.log(`📂 Static Dir:  ${PUBLIC_DIR}`);
      console.log(`🔒 100% Client-Side PDF Generation + Proxy Engine`);
      console.log(`======================================================\n`);
    });
  }

  tryListen(currentPort, maxAttempts);
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = server;
