/**
 * InstaPDF - Instagram Parser & Link Extractor
 * Parses Instagram URLs, extracts media/captions from HTML/DOM,
 * and detects linked PDF documents.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InstagramParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  /**
   * Parse and validate an Instagram URL.
   * Supports /p/, /reel/, /tv/, and /share/p/ URLs.
   */
  function parseInstagramUrl(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      return { valid: false, error: 'Please enter an Instagram post URL.' };
    }

    const trimmed = rawInput.trim();

    // Regex matching standard and mobile Instagram post links
    const pattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[^\/]+\/)?(p|reel|tv|share\/p)\/([A-Za-z0-9_-]+)/i;
    const match = trimmed.match(pattern);

    if (!match) {
      return {
        valid: false,
        error: 'Invalid URL. Please enter a valid Instagram post link (e.g., https://www.instagram.com/p/ABC123xyz/).'
      };
    }

    const rawType = match[1].toLowerCase();
    const shortcode = match[2];
    const type = rawType.includes('reel') ? 'reel' : rawType.includes('tv') ? 'tv' : 'post';

    return {
      valid: true,
      shortcode: shortcode,
      type: type,
      canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
      embedUrl: `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
      apiUrl: `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`
    };
  }

  /**
   * Scans text (caption, bio, comments) and an optional list of anchor URLs
   * for downloadable PDF documents and direct cloud file links.
   */
  function extractPdfLinks(text = '', extraUrls = []) {
    const results = [];
    const seenUrls = new Set();
    const seenBaseUrls = new Set();

    function normalizeKey(u) {
      try {
        const parsed = new URL(u);
        return (parsed.hostname + parsed.pathname).toLowerCase();
      } catch (e) {
        return u.toLowerCase().split('?')[0].split('#')[0];
      }
    }

    function addResult(item) {
      const key = normalizeKey(item.url);
      if (!seenBaseUrls.has(key)) {
        seenBaseUrls.add(key);
        results.push(item);
      }
    }

    // 1. Google Drive document links
    const gdriveRegex = /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/gi;
    let match;
    while ((match = gdriveRegex.exec(text)) !== null) {
      const fileId = match[1];
      const url = match[0];
      addResult({
        type: 'google_drive',
        url: url,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        filename: `GoogleDrive_Doc_${fileId}.pdf`,
        label: 'Google Drive PDF',
        source: 'Post Caption'
      });
    }

    // 2. Dropbox document links
    const dropboxRegex = /https?:\/\/(?:www\.)?dropbox\.com\/s(?:h)?\/([a-zA-Z0-9_-]+)\/([^\s?#]+)/gi;
    while ((match = dropboxRegex.exec(text)) !== null) {
      const url = match[0];
      let fn = decodeURIComponent(match[2] || 'document.pdf');
      if (!fn.toLowerCase().endsWith('.pdf')) fn += '.pdf';
      const downloadUrl = url.replace(/([?&])dl=0/i, '') + (url.includes('?') ? '&dl=1' : '?dl=1');
      addResult({
        type: 'dropbox',
        url: url,
        downloadUrl: downloadUrl,
        filename: fn,
        label: 'Dropbox PDF Document',
        source: 'Post Caption'
      });
    }

    // 3. ArXiv documents
    const arxivRegex = /https?:\/\/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+)(?:\.pdf)?/gi;
    while ((match = arxivRegex.exec(text)) !== null) {
      const paperId = match[1];
      addResult({
        type: 'arxiv',
        url: match[0],
        downloadUrl: `https://arxiv.org/pdf/${paperId}.pdf`,
        filename: `arxiv_${paperId}.pdf`,
        label: 'ArXiv Academic PDF',
        source: 'Post Caption'
      });
    }

    // 4. Scan extraUrls passed directly (e.g. from DOM <a> tags)
    if (Array.isArray(extraUrls)) {
      for (const rawUrl of extraUrls) {
        if (!rawUrl || typeof rawUrl !== 'string') continue;
        const cleaned = rawUrl.trim();
        if (/\.pdf(\?.*)?$/i.test(cleaned)) {
          const fn = extractFilenameFromUrl(cleaned) || 'document.pdf';
          addResult({
            type: 'direct_pdf',
            url: cleaned,
            downloadUrl: cleaned,
            filename: fn,
            label: 'Direct PDF File',
            source: 'Post Link'
          });
        }
      }
    }

    // 5. Cloud Storage: OneDrive & Box & MediaFire
    const onedriveRegex = /https?:\/\/(?:1drv\.ms|onedrive\.live\.com)\/[^\s<>"')]+/gi;
    while ((match = onedriveRegex.exec(text)) !== null) {
      addResult({
        type: 'onedrive',
        url: match[0],
        downloadUrl: match[0],
        filename: 'OneDrive_Document.pdf',
        label: 'OneDrive Document',
        source: 'Post Caption'
      });
    }

    const mediafireRegex = /https?:\/\/(?:www\.)?mediafire\.com\/(?:file|download)\/([^\s<>"')]+)/gi;
    while ((match = mediafireRegex.exec(text)) !== null) {
      addResult({
        type: 'mediafire',
        url: match[0],
        downloadUrl: match[0],
        filename: 'MediaFire_Document.pdf',
        label: 'MediaFire Document',
        source: 'Post Caption'
      });
    }

    // 6. Direct .pdf URLs in text
    if (text && typeof text === 'string') {
      const directPdfRegex = /https?:\/\/[^\s<>"')]+?\.pdf(?:[?#][^\s<>"')]*)?/gi;
      while ((match = directPdfRegex.exec(text)) !== null) {
        const url = match[0];
        const fn = extractFilenameFromUrl(url) || 'document.pdf';
        addResult({
          type: 'direct_pdf',
          url: url,
          downloadUrl: url,
          filename: fn,
          label: 'Direct PDF File',
          source: 'Post Caption'
        });
      }
    }

    // 7. Detect Potential Shortlinks (e.g. bit.ly, tinyurl, t.co) for background resolution
    const shortlinkRegex = /https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|shorturl\.at|is\.gd|buff\.ly)\/[a-zA-Z0-9_-]+/gi;
    while ((match = shortlinkRegex.exec(text)) !== null) {
      const shortUrl = match[0];
      const key = normalizeKey(shortUrl);
      if (!seenBaseUrls.has(key)) {
        results.push({
          type: 'shortlink',
          url: shortUrl,
          downloadUrl: shortUrl,
          filename: 'linked_document.pdf',
          label: 'Shortened Document Link',
          source: 'Post Caption',
          needsResolution: true
        });
      }
    }

    return results;
  }

  function extractFilenameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const part = pathname.substring(pathname.lastIndexOf('/') + 1);
      const decoded = decodeURIComponent(part);
      return decoded.replace(/[^a-zA-Z0-9._-]/g, '_');
    } catch (e) {
      return null;
    }
  }

  /**
   * Recursively traverses any Instagram JSON payload (Relay, GraphQL, REST API)
   * to extract all carousel slides in highest available resolution.
   */
  function extractImagesFromAnyJson(root) {
    const images = [];
    const seenUrls = new Set();

    function addUrl(u) {
      if (u && typeof u === 'string' && u.startsWith('http') && !seenUrls.has(u)) {
        seenUrls.add(u);
        images.push(u);
      }
    }

    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;

      // 1. edge_sidecar_to_children (GraphQL format for multi-slide carousels)
      if (obj.edge_sidecar_to_children?.edges?.length > 0) {
        for (const edge of obj.edge_sidecar_to_children.edges) {
          const node = edge.node;
          if (node) {
            if (node.display_resources?.length > 0) {
              const best = node.display_resources.reduce(
                (max, r) => (r.config_width > (max.config_width || 0) ? r : max),
                node.display_resources[0]
              );
              addUrl(best.src);
            } else if (node.display_url) {
              addUrl(node.display_url);
            }
          }
        }
        return;
      }

      // 2. carousel_media (REST API format for multi-slide carousels)
      if (Array.isArray(obj.carousel_media) && obj.carousel_media.length > 0) {
        for (const item of obj.carousel_media) {
          const candidates = item.image_versions2?.candidates;
          if (candidates?.length > 0) {
            const best = candidates.reduce(
              (max, c) => (c.width > (max.width || 0) ? c : max),
              candidates[0]
            );
            addUrl(best.url);
          } else if (item.image_versions2?.url) {
            addUrl(item.image_versions2.url);
          }
        }
        return;
      }

      for (const key of Object.keys(obj)) {
        walk(obj[key]);
      }
    }

    walk(root);

    // If no carousel was found, walk again for single display_url / display_resources
    if (images.length === 0) {
      function walkSingle(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.display_url && typeof obj.display_url === 'string') {
          addUrl(obj.display_url);
        } else if (obj.image_versions2?.candidates?.[0]?.url) {
          addUrl(obj.image_versions2.candidates[0].url);
        }
        for (const key of Object.keys(obj)) {
          walkSingle(obj[key]);
        }
      }
      walkSingle(root);
    }

    return images;
  }

  /**
   * Parse HTML returned by Instagram embed or web page to extract metadata & media.
   */
  function parseEmbedHtml(html, shortcode) {
    if (!html || typeof html !== 'string') {
      return { success: false, error: 'Empty HTML received.' };
    }

    const post = {
      success: true,
      shortcode: shortcode || '',
      author: '',
      authorAvatar: '',
      caption: '',
      images: [],
      pdfLinks: [],
      takenAt: null,
      isVideo: false
    };

    // 1. Scan ALL script tags for JSON data (Relay prefetch, GraphQL, data-sjs, etc.)
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let scriptMatch;

    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const scriptContent = scriptMatch[1].trim();
      if (!scriptContent) continue;

      // Check if script contains carousel or media indicators
      if (
        scriptContent.includes('edge_sidecar_to_children') ||
        scriptContent.includes('carousel_media') ||
        scriptContent.includes('xdt_shortcode_media') ||
        scriptContent.includes('shortcode_media') ||
        scriptContent.includes('display_resources') ||
        scriptContent.includes('display_url')
      ) {
        try {
          let parsed = null;
          if (scriptContent.startsWith('{') || scriptContent.startsWith('[')) {
            parsed = JSON.parse(scriptContent);
          } else {
            const addMatch = scriptContent.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{.+?\})\s*\);/s);
            if (addMatch && addMatch[1]) {
              parsed = JSON.parse(addMatch[1]);
            }
          }

          if (parsed) {
            const foundImages = extractImagesFromAnyJson(parsed);
            if (foundImages.length > post.images.length) {
              post.images = foundImages;
            }
            extractMetaFromJson(parsed, post);
          }
        } catch (e) {
          try {
            const rawJsonMatch = scriptContent.match(/(\{[\s\S]*"xdt_shortcode_media"[\s\S]*\})/i) ||
                                 scriptContent.match(/(\{[\s\S]*"edge_sidecar_to_children"[\s\S]*\})/i) ||
                                 scriptContent.match(/(\{[\s\S]*"carousel_media"[\s\S]*\})/i);
            if (rawJsonMatch && rawJsonMatch[1]) {
              const parsed = JSON.parse(rawJsonMatch[1]);
              const foundImages = extractImagesFromAnyJson(parsed);
              if (foundImages.length > post.images.length) {
                post.images = foundImages;
              }
              extractMetaFromJson(parsed, post);
            }
          } catch (e2) {}
        }
      }
    }

    // 2. Check JSON-LD structured data: <script type="application/ld+json">
    const ldJsonMatches = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (ldJsonMatches) {
      for (const scriptTag of ldJsonMatches) {
        try {
          const rawJson = scriptTag.replace(/<script[^>]*>|<\/script>/gi, '').trim();
          const ldObj = JSON.parse(rawJson);
          if (ldObj) {
            if (ldObj.caption && !post.caption) post.caption = ldObj.caption;
            if (ldObj.author?.identifier && !post.author) post.author = ldObj.author.identifier;
            if (ldObj.author?.name && !post.author) post.author = ldObj.author.name;
            if (ldObj.image && post.images.length === 0) {
              const imgs = Array.isArray(ldObj.image) ? ldObj.image : [ldObj.image];
              for (const img of imgs) {
                const u = typeof img === 'string' ? img : img?.url;
                if (u && !post.images.includes(u)) post.images.push(u);
              }
            }
          }
        } catch (e) {}
      }
    }

    // 3. Fallback: Parse HTML tags via Regex (author & caption)
    if (!post.author) {
      const authorMatch = html.match(/class="[^"]*UsernameText[^"]*"[^>]*>([^<]+)<\/span>/i) ||
                          html.match(/class="[^"]*HoverCard[^"]*"[^>]*href="\/([^\/\?"]+)/i) ||
                          html.match(/<meta property="instapp:owner_user_id" content="([^"]+)"/i) ||
                          html.match(/by\s+<a[^>]*href="https?:\/\/(?:www\.)?instagram\.com\/([^\/\?"]+)/i);
      if (authorMatch) {
        post.author = authorMatch[1].trim();
      }
    }

    if (!post.caption) {
      const captionMatch = html.match(/<div class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                           html.match(/<meta property="og:description" content="([^"]*)"/i);
      if (captionMatch) {
        post.caption = cleanHtmlText(captionMatch[1]);
      }
    }

    // If still no images found from JSON, check EmbeddedMediaImage
    if (post.images.length === 0) {
      const imgRegex = /<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^">]+)"/gi;
      let m;
      while ((m = imgRegex.exec(html)) !== null) {
        const src = m[1].replace(/&amp;/g, '&');
        if (!post.images.includes(src)) {
          post.images.push(src);
        }
      }
    }

    // og:image fallback
    if (post.images.length === 0) {
      const ogImgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImgMatch) {
        const ogSrc = ogImgMatch[1].replace(/&amp;/g, '&');
        post.images.push(ogSrc);
      }
    }

    // Extract any <a> links in the HTML
    const aRegex = /<a[^>]+href="([^">]+)"/gi;
    const foundLinks = [];
    let linkMatch;
    while ((linkMatch = aRegex.exec(html)) !== null) {
      foundLinks.push(linkMatch[1].replace(/&amp;/g, '&'));
    }

    post.pdfLinks = extractPdfLinks(post.caption, foundLinks);

    return post;
  }

  function extractMetaFromJson(obj, post) {
    if (!obj || typeof obj !== 'object') return;

    function walkMeta(curr) {
      if (!curr || typeof curr !== 'object') return;

      if (curr.owner?.username && !post.author) post.author = curr.owner.username;
      if (curr.user?.username && !post.author) post.author = curr.user.username;
      if (curr.owner?.profile_pic_url && !post.authorAvatar) post.authorAvatar = curr.owner.profile_pic_url;

      const captionNode = curr.edge_media_to_caption?.edges?.[0]?.node?.text || curr.caption?.text;
      if (captionNode && !post.caption) {
        post.caption = captionNode;
      }

      if (curr.taken_at_timestamp && !post.takenAt) {
        post.takenAt = new Date(curr.taken_at_timestamp * 1000);
      }

      for (const k of Object.keys(curr)) {
        walkMeta(curr[k]);
      }
    }

    walkMeta(obj);
  }

  function cleanHtmlText(raw) {
    if (!raw) return '';
    return raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  return {
    parseInstagramUrl,
    extractPdfLinks,
    parseEmbedHtml,
    cleanHtmlText,
    extractImagesFromAnyJson
  };
});
