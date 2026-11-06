/**
 * Netlify Serverless Function: /api/extract
 * Handles Instagram post inspection, multi-slide carousel discovery,
 * and direct PDF detection.
 */

const InstagramParser = require('../../public/lib/instagram-parser.js');

exports.handler = async (event, context) => {
  // Handle CORS Preflight
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  const query = event.queryStringParameters || {};
  const rawUrl = query.url;

  if (!rawUrl) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Missing "url" parameter.' })
    };
  }

  const parsed = InstagramParser.parseInstagramUrl(rawUrl);
  if (!parsed.valid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: parsed.error })
    };
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

  // Strategy 1: Instagram Web API (__a=1&__d=dis)
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

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
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
            })
          };
        }
      }
    }
  } catch (e) {}

  // Strategy 2: GraphQL Query Endpoint
  try {
    const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
    const gqlResp = await fetch(gqlUrl, { headers });

    if (gqlResp.status === 401 || gqlResp.status === 403) isLoginRequired = true;

    if (gqlResp.ok) {
      const gqlJson = await gqlResp.json();
      if (gqlJson.require_login || gqlJson.message === 'login_required') isLoginRequired = true;
      const images = InstagramParser.extractImagesFromAnyJson(gqlJson);

      if (images.length > 0) {
        const media = gqlJson.data?.shortcode_media;
        const caption = media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
        const author = media?.owner?.username || '';
        const pdfLinks = InstagramParser.extractPdfLinks(caption);

        await resolveShortlinksIfAny(pdfLinks);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
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
          })
        };
      }
    }
  } catch (e) {}

  // Strategy 3: Page HTML with Relay JSON
  try {
    const pageResp = await fetch(parsed.canonicalUrl, {
      headers: {
        ...headers,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    });

    if (pageResp.status === 401 || pageResp.status === 403) isLoginRequired = true;

    if (pageResp.ok) {
      const html = await pageResp.text();
      if (html.includes('httpErrorPage') || html.includes('login_required')) isLoginRequired = true;
      const post = InstagramParser.parseEmbedHtml(html, shortcode);

      if (post && post.images.length > 0) {
        await resolveShortlinksIfAny(post.pdfLinks);
        post.originalImages = [...post.images];
        post.images = post.images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            source: 'page_html_scripts',
            post
          })
        };
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
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          isPrivate: true,
          error: 'Post not found or account is private. Instagram requires login or permission to view it.'
        })
      };
    }

    if (embedResp.ok) {
      const html = await embedResp.text();
      if (html.includes('httpErrorPage') || html.includes('login_required')) isLoginRequired = true;
      const post = InstagramParser.parseEmbedHtml(html, shortcode);

      if (post && (post.images.length > 0 || post.pdfLinks.length > 0)) {
        await resolveShortlinksIfAny(post.pdfLinks);
        post.originalImages = [...post.images];
        post.images = post.images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            source: 'embed_endpoint',
            post
          })
        };
      }
    }
  } catch (e) {}

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: false,
      requireLogin: isLoginRequired,
      error: isLoginRequired
        ? 'Instagram requires a logged-in account to view this post. You can paste the page HTML source code or connect your session cookie.'
        : 'Could not extract slides or document from this post. The post might be private, restricted, or rate-limited.'
    })
  };
};

async function resolveShortlinksIfAny(pdfLinks) {
  if (!pdfLinks || !Array.isArray(pdfLinks)) return;
  for (let i = pdfLinks.length - 1; i >= 0; i--) {
    const item = pdfLinks[i];
    if (item.needsResolution) {
      try {
        const head = await fetch(item.downloadUrl, { method: 'HEAD', redirect: 'follow' });
        const finalUrl = head.url;
        if (finalUrl.includes('drive.google.com')) {
          const match = finalUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match) {
            item.downloadUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
            item.filename = `GoogleDrive_Doc_${match[1]}.pdf`;
            item.label = 'Google Drive PDF';
            delete item.needsResolution;
          }
        } else if (finalUrl.includes('dropbox.com')) {
          item.downloadUrl = finalUrl.replace(/[?&]dl=0/, '') + (finalUrl.includes('?') ? '&dl=1' : '?dl=1');
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
