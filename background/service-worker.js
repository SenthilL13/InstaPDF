/**
 * InstaPDF - Background Service Worker (Manifest V3)
 * Coordinates download requests, tab inspection, background fetching,
 * and context menus.
 */

// Import parser in service worker
importScripts('../lib/instagram-parser.js');

// 1. Extension Installation & Setup
chrome.runtime.onInstalled.addListener(() => {
  // Setup default preferences
  chrome.storage.local.get(['preferredMode', 'downloadHistory'], (res) => {
    if (!res.preferredMode) {
      chrome.storage.local.set({ preferredMode: 'slides_only' });
    }
    if (!res.downloadHistory) {
      chrome.storage.local.set({ downloadHistory: [] });
    }
  });

  // Setup context menu
  chrome.contextMenus.create({
    id: 'instapdf_extract_menu',
    title: '📄 Download as PDF with InstaPDF',
    contexts: ['link', 'page'],
    targetUrlPatterns: ['*://*.instagram.com/p/*', '*://*.instagram.com/reel/*', '*://*.instagram.com/tv/*']
  });
});

// 2. Context Menu Click Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'instapdf_extract_menu') {
    const targetUrl = info.linkUrl || info.pageUrl || tab?.url;
    if (targetUrl) {
      // Store targeted URL so popup automatically opens with it
      await chrome.storage.local.set({ queuedUrl: targetUrl });
      chrome.action.openPopup();
    }
  }
});

// 3. Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_ACTIVE_TAB_URL') {
    handleGetActiveTab(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (request.action === 'FETCH_POST_DATA') {
    handleFetchPostData(request.url, sendResponse);
    return true;
  }

  if (request.action === 'DOWNLOAD_FILE') {
    handleDownloadFile(request, sendResponse);
    return true;
  }

  if (request.action === 'OPEN_URL_IN_TAB') {
    chrome.tabs.create({ url: request.url, active: true }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }
});

/**
 * Retrieves the URL of the user's currently focused browser tab.
 */
async function handleGetActiveTab(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }
    sendResponse({
      success: true,
      url: tab.url,
      title: tab.title,
      isInstagram: /instagram\.com/i.test(tab.url)
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Fetches Instagram post data using web API, page HTML, and public embed endpoints.
 * Prioritizes multi-slide carousel extraction (15+ slides) and respects platform security.
 */
async function handleFetchPostData(rawUrl, sendResponse) {
  try {
    const parsed = InstagramParser.parseInstagramUrl(rawUrl);
    if (!parsed.valid) {
      sendResponse({ success: false, error: parsed.error });
      return;
    }

    const shortcode = parsed.shortcode;

    // Strategy 1: Check if user has an open tab with this post (best reliability & session match)
    let fallbackPostFromTab = null;
    const matchingTabs = await chrome.tabs.query({ url: `*://*.instagram.com/*/${shortcode}*` });
    if (matchingTabs.length > 0) {
      try {
        const tabResponse = await chrome.tabs.sendMessage(matchingTabs[0].id, {
          action: 'EXTRACT_DOM_DATA',
          shortcode: shortcode
        });

        if (tabResponse && tabResponse.success && tabResponse.post) {
          if (tabResponse.post.images.length > 1) {
            sendResponse({
              success: true,
              source: 'active_tab_dom',
              post: tabResponse.post
            });
            return;
          }
          fallbackPostFromTab = tabResponse.post;
        }
      } catch (domErr) {
        // Content script might not be injected or ready, proceed to background fetch
      }
    }

    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': navigator.userAgent
    };

    // Strategy 2: Instagram Web API endpoint (__a=1&__d=dis with official App ID)
    // This endpoint returns all carousel_media items (15+ slides)
    try {
      const apiResp = await fetch(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
        headers,
        credentials: 'include'
      });

      if (apiResp.ok) {
        const contentType = apiResp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const apiJson = await apiResp.json();
          const images = InstagramParser.extractImagesFromAnyJson(apiJson);

          if (images.length > 0) {
            const item = apiJson.items?.[0] || apiJson.graphql?.shortcode_media;
            const caption = item?.caption?.text || item?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
            const author = item?.user?.username || item?.owner?.username || '';
            const pdfLinks = InstagramParser.extractPdfLinks(caption);

            await resolveShortlinksIfAny(pdfLinks);

            sendResponse({
              success: true,
              source: 'web_api',
              post: {
                shortcode,
                author,
                caption,
                images,
                pdfLinks,
                isVideo: !!item?.is_video
              }
            });
            return;
          }
        }
      }
    } catch (apiErr) {
      // API call failed, proceed to next strategy
    }

    // Strategy 3: GraphQL Query Endpoint
    try {
      const gqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`;
      const gqlResp = await fetch(gqlUrl, {
        headers,
        credentials: 'include'
      });

      if (gqlResp.ok) {
        const gqlJson = await gqlResp.json();
        const images = InstagramParser.extractImagesFromAnyJson(gqlJson);

        if (images.length > 0) {
          const media = gqlJson.data?.shortcode_media;
          const caption = media?.edge_media_to_caption?.edges?.[0]?.node?.text || '';
          const author = media?.owner?.username || '';
          const pdfLinks = InstagramParser.extractPdfLinks(caption);

          await resolveShortlinksIfAny(pdfLinks);

          sendResponse({
            success: true,
            source: 'graphql_api',
            post: {
              shortcode,
              author,
              caption,
              images,
              pdfLinks,
              isVideo: !!media?.is_video
            }
          });
          return;
        }
      }
    } catch (gqlErr) {
      // Proceed to HTML fetch
    }

    // Strategy 4: Direct Page HTML with credentials (contains script tags with full JSON)
    try {
      const pageResp = await fetch(parsed.canonicalUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': navigator.userAgent
        },
        credentials: 'include'
      });

      if (pageResp.ok) {
        const pageHtml = await pageResp.text();
        const pagePost = InstagramParser.parseEmbedHtml(pageHtml, shortcode);

        if (pagePost && pagePost.images.length > 0) {
          await resolveShortlinksIfAny(pagePost.pdfLinks);
          sendResponse({
            success: true,
            source: 'page_html_scripts',
            post: pagePost
          });
          return;
        }
      }
    } catch (pageErr) {
      // Proceed to embed
    }

    // Strategy 5: Embed captioned endpoint
    try {
      const embedResp = await fetch(parsed.embedUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': navigator.userAgent
        },
        credentials: 'include'
      });

      if (embedResp.status === 404) {
        sendResponse({
          success: false,
          isPrivate: true,
          error: 'Post not found or this account is private. Instagram requires you to follow this account and be logged in to view it.'
        });
        return;
      }

      const html = await embedResp.text();

      if (html.includes('Login * Instagram') || html.includes('This content isn\'t available right now')) {
        sendResponse({
          success: false,
          isPrivate: true,
          error: 'This post is private or restricted. Please ensure you are logged into Instagram in Chrome to access it.'
        });
        return;
      }

      const post = InstagramParser.parseEmbedHtml(html, shortcode);

      if (post && (post.images.length > 0 || post.pdfLinks.length > 0)) {
        await resolveShortlinksIfAny(post.pdfLinks);
        sendResponse({
          success: true,
          source: 'embed_endpoint',
          post: post
        });
        return;
      }
    } catch (embedErr) {
      // All strategies exhausted
    }

    // If background strategies failed, check if we had a single slide / tab post
    if (fallbackPostFromTab && (fallbackPostFromTab.images.length > 0 || fallbackPostFromTab.pdfLinks.length > 0)) {
      sendResponse({
        success: true,
        source: 'tab_dom_fallback',
        post: fallbackPostFromTab
      });
      return;
    }

    sendResponse({
      success: false,
      error: 'Could not extract carousel slides or document from this post. If this post is private, please open it in a tab while logged into Instagram.'
    });
  } catch (err) {
    sendResponse({
      success: false,
      error: `Extraction error: ${err.message}`
    });
  }
}

/**
 * Resolves potential shortened links (e.g. bit.ly, tinyurl) via HEAD requests
 * to verify if they redirect to a PDF document or cloud file.
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
          // Did not redirect to a PDF document, remove from PDF list
          pdfLinks.splice(i, 1);
        }
      } catch (err) {
        // Network timeout or CORS on HEAD, remove unresolved shortlink
        pdfLinks.splice(i, 1);
      }
    }
  }
}

/**
 * Downloads a file via chrome.downloads.download API.
 */
function handleDownloadFile(request, sendResponse) {
  const { url, filename, saveAs = true } = request;
  if (!url) {
    sendResponse({ success: false, error: 'No download URL provided.' });
    return;
  }

  // Sanitize filename to prevent invalid characters in Windows/macOS/Linux
  const sanitizedFilename = (filename || 'instagram_document.pdf')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_');

  chrome.downloads.download({
    url: url,
    filename: sanitizedFilename,
    saveAs: saveAs
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      // Save to download history
      saveDownloadHistory({
        downloadId,
        filename: sanitizedFilename,
        date: new Date().toISOString()
      });
      sendResponse({ success: true, downloadId });
    }
  });
}

function saveDownloadHistory(entry) {
  chrome.storage.local.get(['downloadHistory'], (res) => {
    const list = res.downloadHistory || [];
    list.unshift(entry);
    // Keep last 30 entries
    if (list.length > 30) list.pop();
    chrome.storage.local.set({ downloadHistory: list });
  });
}
