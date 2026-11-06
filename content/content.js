/**
 * InstaPDF - Content Script
 * Runs on instagram.com pages. Enables live DOM post extraction and adds
 * an inline 'Save PDF' button on Instagram posts.
 */

(function () {
  'use strict';

  // Listen for messages from the extension popup or background worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_DOM_DATA') {
      const data = extractCurrentPostData(request.shortcode);
      sendResponse(data);
      return false;
    }
  });

  /**
   * Extracts post details directly from the live Instagram page DOM.
   */
  function extractCurrentPostData(targetShortcode) {
    try {
      // Find the main post container (article element in modal or standalone post page)
      const article = document.querySelector('article') || document.querySelector('main');
      if (!article) {
        return { success: false, error: 'No Instagram post article found on page.' };
      }

      // 1. Author username
      let author = '';
      const authorAnchor = article.querySelector('header a[role="link"]') ||
                           article.querySelector('header a') ||
                           document.querySelector('header a[role="link"]');
      if (authorAnchor) {
        author = authorAnchor.textContent.trim().replace(/^@/, '');
      }

      // 2. Caption text
      let caption = '';
      // Caption is typically inside an h1 or span in the post content list
      const captionElement = article.querySelector('h1') ||
                             article.querySelector('ul li div span[dir="auto"]') ||
                             article.querySelector('div[dir="auto"]');
      if (captionElement) {
        caption = captionElement.innerText || captionElement.textContent || '';
      }

      // 3. Carousel / Slide Images
      let images = [];

      // Scan page script tags first (contains ALL 15+ carousel slides from Instagram's Relay store)
      const scriptTags = document.querySelectorAll('script[type="application/json"]');
      for (const st of scriptTags) {
        const text = st.textContent;
        if (text && (text.includes('edge_sidecar_to_children') || text.includes('carousel_media') || text.includes('xdt_shortcode_media') || text.includes('display_resources'))) {
          try {
            const parsed = JSON.parse(text);
            if (typeof InstagramParser !== 'undefined' && InstagramParser.extractImagesFromAnyJson) {
              const scriptImages = InstagramParser.extractImagesFromAnyJson(parsed);
              if (scriptImages.length > images.length) {
                images = scriptImages;
              }
            }
          } catch (e) {}
        }
      }

      // If scripts didn't yield multiple slides, extract from rendered DOM
      if (images.length === 0) {
        const seenSrcs = new Set();
        const imgElements = article.querySelectorAll('img');
        for (const img of imgElements) {
          // Skip avatar images (usually small or circular)
          const isAvatar = img.closest('header') || img.width < 120 || img.height < 120;
          if (isAvatar) continue;

          // Extract highest resolution from srcset or src
          let bestSrc = '';
          if (img.srcset) {
            const candidates = img.srcset.split(',').map(s => s.trim().split(' '));
            let maxWidth = 0;
            for (const [src, widthDesc] of candidates) {
              const w = parseInt(widthDesc) || 0;
              if (w >= maxWidth) {
                maxWidth = w;
                bestSrc = src;
              }
            }
          }

          if (!bestSrc) {
            bestSrc = img.src;
          }

          if (bestSrc && !seenSrcs.has(bestSrc) && (bestSrc.includes('cdninstagram') || bestSrc.includes('fbcdn') || bestSrc.includes('/p/'))) {
            seenSrcs.add(bestSrc);
            images.push(bestSrc);
          }
        }
      }

      // 4. Extract external links present in caption
      const extraUrls = [];
      if (captionElement) {
        const anchors = captionElement.querySelectorAll('a[href]');
        for (const a of anchors) {
          extraUrls.push(a.href);
        }
      }

      // 5. Scan for PDF links in caption
      let pdfLinks = [];
      if (typeof InstagramParser !== 'undefined' && InstagramParser.extractPdfLinks) {
        pdfLinks = InstagramParser.extractPdfLinks(caption, extraUrls);
      } else {
        pdfLinks = scanForPdfLinks(caption, extraUrls);
      }

      // Determine shortcode from URL if not supplied
      let shortcode = targetShortcode;
      if (!shortcode) {
        const m = window.location.pathname.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
        if (m) shortcode = m[2];
      }

      return {
        success: true,
        post: {
          shortcode: shortcode || '',
          author: author || 'instagram_user',
          caption: caption.trim(),
          images: images,
          pdfLinks: pdfLinks
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function scanForPdfLinks(text = '', extraUrls = []) {
    const results = [];
    const seen = new Set();

    function add(item) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        results.push(item);
      }
    }

    for (const url of extraUrls) {
      if (/\.pdf(\?.*)?$/i.test(url)) {
        add({
          type: 'direct_pdf',
          url: url,
          downloadUrl: url,
          filename: 'document.pdf',
          label: 'Direct PDF File',
          source: 'Post Link'
        });
      }
    }

    const directRegex = /https?:\/\/[^\s<>"')]+?\.pdf(?:[?#][^\s<>"')]*)?/gi;
    let m;
    while ((m = directRegex.exec(text)) !== null) {
      add({
        type: 'direct_pdf',
        url: m[0],
        downloadUrl: m[0],
        filename: 'document.pdf',
        label: 'Direct PDF File',
        source: 'Post Caption'
      });
    }

    const gdriveRegex = /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/gi;
    while ((m = gdriveRegex.exec(text)) !== null) {
      const fileId = m[1];
      add({
        type: 'google_drive',
        url: m[0],
        downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
        filename: `GoogleDrive_Doc_${fileId}.pdf`,
        label: 'Google Drive Document',
        source: 'Post Caption'
      });
    }

    return results;
  }

  /**
   * Injects a subtle, native-feeling "Save PDF" button into Instagram post action bars
   */
  function injectInlineButtons() {
    // Look for Instagram's action bar sections (containing Like, Comment, Share)
    const actionSections = document.querySelectorAll('section:not(.instapdf-processed)');

    for (const section of actionSections) {
      // Must contain SVGs with like/comment/share aria-labels or roles
      const hasPostActions = section.querySelector('svg[aria-label="Like"]') ||
                             section.querySelector('svg[aria-label="Comment"]') ||
                             section.querySelector('svg[aria-label="Share Post"]') ||
                             section.querySelector('svg[aria-label="Save"]');

      if (hasPostActions) {
        section.classList.add('instapdf-processed');

        // Create the button
        const btn = document.createElement('button');
        btn.className = 'instapdf-action-btn';
        btn.title = 'InstaPDF - Download Post as PDF';
        btn.setAttribute('type', 'button');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <span class="instapdf-badge">PDF</span>
        `;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleInlinePdfClick(btn);
        });

        // Insert right next to the right-most button or save button
        const saveWrapper = section.querySelector('div:last-child') || section;
        saveWrapper.appendChild(btn);
      }
    }
  }

  function handleInlinePdfClick(btn) {
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';

    showToast('Extracting post...', 'InstaPDF is scanning slides and documents in this post.', 'info');

    const data = extractCurrentPostData();
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';

    if (!data.success || (!data.post.images.length && !data.post.pdfLinks.length)) {
      showToast('No PDF / Media Found', 'Could not detect slides or document links in this post.', 'error');
      return;
    }

    const { post } = data;

    // If direct PDF link is available, notify user
    if (post.pdfLinks.length > 0) {
      const firstPdf = post.pdfLinks[0];
      showToast('PDF Document Detected!', `Found linked PDF: ${firstPdf.filename}. Initiating download...`, 'success');
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: firstPdf.downloadUrl,
        filename: firstPdf.filename
      });
      return;
    }

    // If slides are available, compile directly to PDF
    if (typeof PdfBuilder !== 'undefined' && post.images.length > 0) {
      showToast('Compiling Slides...', `Preparing ${post.images.length} slides for PDF download...`, 'info');
      PdfBuilder.compileInstagramPostToPdf(post, { mode: 'slides_only' }, (curr, tot) => {
        const titleEl = document.querySelector('.instapdf-toast .instapdf-toast-title');
        if (titleEl) titleEl.textContent = `Compiling slide ${curr}/${tot}...`;
      }).then(pdfBlob => {
        const url = URL.createObjectURL(pdfBlob);
        const fn = `Instagram_${post.author || 'post'}_${post.shortcode || 'doc'}_${post.images.length}_slides.pdf`;
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_FILE',
          url: url,
          filename: fn
        });
        showToast('Download Started!', `Saved ${post.images.length} slides to your Downloads folder.`, 'success');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }).catch(err => {
        showToast('PDF Export Error', err.message, 'error');
      });
      return;
    }

    // Otherwise notify that user can open the InstaPDF extension popup to compile slides
    showToast('Post Ready for PDF Export', `Detected ${post.images.length} slide(s). Click the InstaPDF extension icon on your toolbar to download!`, 'success');
  }

  function showToast(title, message, type = 'info') {
    const existing = document.querySelector('.instapdf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `instapdf-toast instapdf-${type}`;
    toast.innerHTML = `
      <div class="instapdf-toast-icon">${type === 'success' ? '✅' : type === 'error' ? '⚠️' : '📑'}</div>
      <div class="instapdf-toast-content">
        <div class="instapdf-toast-title">${title}</div>
        <div>${message}</div>
      </div>
      <button class="instapdf-toast-close" title="Close">&times;</button>
    `;

    toast.querySelector('.instapdf-toast-close').addEventListener('click', () => toast.remove());
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
  }

  // Observe page dynamically for single-page app navigation
  const observer = new MutationObserver(() => {
    injectInlineButtons();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectInlineButtons);
  } else {
    injectInlineButtons();
  }
})();
