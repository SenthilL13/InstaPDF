/**
 * InstaPDF Web Application - Frontend Client Controller
 * Manages URL extraction, interactive slide preview,
 * theme switching, session cookies, and client-side PDF generation.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Theme Management
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = themeToggleBtn?.querySelector('.theme-icon');
  
  function initTheme() {
    const savedTheme = localStorage.getItem('instapdf-theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      updateThemeIcon(savedTheme);
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      updateThemeIcon(prefersDark ? 'dark' : 'light');
    }
  }

  function updateThemeIcon(theme) {
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  themeToggleBtn?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('instapdf-theme', newTheme);
    updateThemeIcon(newTheme);
  });

  initTheme();

  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const samplePostBtn = document.getElementById('samplePostBtn');
  const pasteHtmlBtn = document.getElementById('pasteHtmlBtn');
  const cookieSettingsToggleBtn = document.getElementById('cookieSettingsToggleBtn');
  const cookieActiveBadge = document.getElementById('cookieActiveBadge');

  // Drawers
  const cookieDrawer = document.getElementById('cookieDrawer');
  const closeCookieDrawerBtn = document.getElementById('closeCookieDrawerBtn');
  const cookieInput = document.getElementById('cookieInput');
  const saveCookieBtn = document.getElementById('saveCookieBtn');
  const clearCookieBtn = document.getElementById('clearCookieBtn');

  const htmlSourceDrawer = document.getElementById('htmlSourceDrawer');
  const closeHtmlDrawerBtn = document.getElementById('closeHtmlDrawerBtn');
  const htmlSourceInput = document.getElementById('htmlSourceInput');
  const parseHtmlSubmitBtn = document.getElementById('parseHtmlSubmitBtn');

  const extractBtn = document.getElementById('extractBtn');

  // Status & Error
  const statusSection = document.getElementById('statusSection');
  const statusMessage = document.getElementById('statusMessage');
  const statusSubtext = document.getElementById('statusSubtext');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');

  const errorCard = document.getElementById('errorCard');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const errorSolutions = document.getElementById('errorSolutions');
  const errOpenExtensionBtn = document.getElementById('errOpenExtensionBtn');
  const errOpenHtmlBtn = document.getElementById('errOpenHtmlBtn');
  const errOpenCookieBtn = document.getElementById('errOpenCookieBtn');

  // Results Elements
  const resultsSection = document.getElementById('resultsSection');
  const postAvatar = document.getElementById('postAvatar');
  const postAuthor = document.getElementById('postAuthor');
  const postSubmeta = document.getElementById('postSubmeta');
  const postTypeBadge = document.getElementById('postTypeBadge');
  const captionBox = document.getElementById('captionBox');
  const captionText = document.getElementById('captionText');
  const toggleCaptionBtn = document.getElementById('toggleCaptionBtn');

  // Direct PDF
  const directPdfCard = document.getElementById('directPdfCard');
  const detectedPdfName = document.getElementById('detectedPdfName');
  const detectedPdfSource = document.getElementById('detectedPdfSource');
  const downloadDirectPdfBtn = document.getElementById('downloadDirectPdfBtn');
  const copyPdfLinkBtn = document.getElementById('copyPdfLinkBtn');

  // Carousel
  const carouselPdfCard = document.getElementById('carouselPdfCard');
  const carouselSubtitle = document.getElementById('carouselSubtitle');
  const slideCountBadge = document.getElementById('slideCountBadge');
  const selectedCountText = document.getElementById('selectedCountText');
  const toggleSelectAllBtn = document.getElementById('toggleSelectAllBtn');
  const slidesPreviewStrip = document.getElementById('slidesPreviewStrip');
  const showSlideNumbersCheck = document.getElementById('showSlideNumbersCheck');
  const customFilenameInput = document.getElementById('customFilenameInput');
  const downloadCarouselPdfBtn = document.getElementById('downloadCarouselPdfBtn');
  const downloadBtnLabel = document.getElementById('downloadBtnLabel');

  // State
  let currentPost = null;
  let selectedSlideIndices = new Set();
  let isExtracting = false;
  let isCompiling = false;

  // Session Cookie Setup
  function initCookie() {
    const saved = localStorage.getItem('instapdf-ig-cookie');
    if (saved) {
      if (cookieInput) cookieInput.value = saved;
      if (cookieActiveBadge) cookieActiveBadge.style.display = 'inline';
    } else {
      if (cookieActiveBadge) cookieActiveBadge.style.display = 'none';
    }
  }
  initCookie();

  cookieSettingsToggleBtn?.addEventListener('click', () => {
    htmlSourceDrawer.style.display = 'none';
    cookieDrawer.style.display = cookieDrawer.style.display === 'none' ? 'flex' : 'none';
  });

  closeCookieDrawerBtn?.addEventListener('click', () => {
    cookieDrawer.style.display = 'none';
  });

  saveCookieBtn?.addEventListener('click', () => {
    const val = cookieInput.value.trim();
    if (val) {
      localStorage.setItem('instapdf-ig-cookie', val);
      if (cookieActiveBadge) cookieActiveBadge.style.display = 'inline';
      showToast('Session cookie saved locally!');
      cookieDrawer.style.display = 'none';
    } else {
      localStorage.removeItem('instapdf-ig-cookie');
      if (cookieActiveBadge) cookieActiveBadge.style.display = 'none';
      showToast('Session cookie cleared.');
    }
  });

  clearCookieBtn?.addEventListener('click', () => {
    cookieInput.value = '';
    localStorage.removeItem('instapdf-ig-cookie');
    if (cookieActiveBadge) cookieActiveBadge.style.display = 'none';
    showToast('Session cookie cleared.');
    cookieDrawer.style.display = 'none';
  });

  // HTML Source Drawer Setup
  pasteHtmlBtn?.addEventListener('click', () => {
    cookieDrawer.style.display = 'none';
    htmlSourceDrawer.style.display = htmlSourceDrawer.style.display === 'none' ? 'flex' : 'none';
  });

  closeHtmlDrawerBtn?.addEventListener('click', () => {
    htmlSourceDrawer.style.display = 'none';
  });

  parseHtmlSubmitBtn?.addEventListener('click', () => {
    const rawHtml = htmlSourceInput.value.trim();
    if (!rawHtml) {
      showError('Empty Source', 'Please paste the HTML source code of the Instagram post.');
      return;
    }
    parseAndRenderHtmlSource(rawHtml);
  });

  function parseAndRenderHtmlSource(rawHtml) {
    hideError();
    hideResults();
    showStatus('Parsing HTML Source...', 'Extracting carousel slides and caption');

    try {
      const post = InstagramParser.parseEmbedHtml(rawHtml, 'post');
      hideStatus();

      if (!post || (!post.images.length && !post.pdfLinks.length)) {
        showError('No Media Found in HTML', 'Could not find carousel slides in the pasted HTML. Please make sure to copy the full View Page Source (Ctrl+U).');
        return;
      }

      // Proxy images through local server so canvas & PDF engine can load them without CORS
      post.originalImages = [...post.images];
      post.images = post.images.map(img => `/api/proxy-image?url=${encodeURIComponent(img)}`);

      currentPost = post;
      htmlSourceDrawer.style.display = 'none';
      renderPostResults(currentPost, { shortcode: post.shortcode || 'post' });
      showToast(`Successfully extracted ${post.images.length} slides!`);

    } catch (err) {
      hideStatus();
      showError('HTML Parse Error', err.message);
    }
  }

  // Error Solution quick actions
  errOpenExtensionBtn?.addEventListener('click', () => {
    alert('The Chrome Extension runs directly in your browser with your active Instagram login!\n\nOpen Chrome -> Extensions -> InstaPDF, or view the post in Instagram to download with 1-click.');
  });

  errOpenHtmlBtn?.addEventListener('click', () => {
    cookieDrawer.style.display = 'none';
    htmlSourceDrawer.style.display = 'flex';
    htmlSourceDrawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  errOpenCookieBtn?.addEventListener('click', () => {
    htmlSourceDrawer.style.display = 'none';
    cookieDrawer.style.display = 'flex';
    cookieDrawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // 1. Input Event Handlers
  urlInput.addEventListener('input', () => {
    clearInputBtn.style.display = urlInput.value.trim() ? 'block' : 'none';
    hideError();
  });

  clearInputBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearInputBtn.style.display = 'none';
    urlInput.focus();
    hideResults();
    hideError();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearInputBtn.style.display = 'block';
        startExtraction(urlInput.value);
      }
    } catch (e) {
      showError('Clipboard Access', 'Could not read from clipboard. Please paste manually into the input box.');
    }
  });

  samplePostBtn.addEventListener('click', () => {
    const sampleUrl = 'https://www.instagram.com/p/DfJ3eUBk6gh/?exln=bzF6b3dhZ3BmdmF4';
    urlInput.value = sampleUrl;
    clearInputBtn.style.display = 'block';
    startExtraction(sampleUrl);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      extractBtn.click();
    }
  });

  extractBtn.addEventListener('click', () => {
    const raw = urlInput.value.trim();
    if (!raw) {
      showError('Missing URL', 'Please paste an Instagram post URL to proceed.');
      return;
    }
    // Check if user accidentally pasted raw HTML into the URL input
    if (raw.startsWith('<') || raw.includes('<!DOCTYPE') || raw.includes('edge_sidecar_to_children')) {
      parseAndRenderHtmlSource(raw);
      return;
    }
    startExtraction(raw);
  });

  toggleCaptionBtn.addEventListener('click', () => {
    captionText.classList.toggle('expanded');
    toggleCaptionBtn.textContent = captionText.classList.contains('expanded') ? 'Show Less' : 'Show More';
  });

  // 2. Extraction Flow
  async function startExtraction(urlStr) {
    if (isExtracting || isCompiling) return;

    hideError();
    hideResults();
    showStatus('Validating URL...', 'Checking Instagram post link format');

    const parsed = InstagramParser.parseInstagramUrl(urlStr);
    if (!parsed.valid) {
      hideStatus();
      showError('Invalid URL', parsed.error);
      return;
    }

    isExtracting = true;
    extractBtn.disabled = true;
    showStatus('Connecting to Instagram...', `Inspecting post [${parsed.shortcode}]`);

    try {
      const savedCookie = localStorage.getItem('instapdf-ig-cookie');
      let apiUrl = `/api/extract?url=${encodeURIComponent(parsed.canonicalUrl)}`;
      if (savedCookie) {
        apiUrl += `&cookie=${encodeURIComponent(savedCookie)}`;
      }

      const response = await fetch(apiUrl);
      const data = await response.json();

      isExtracting = false;
      extractBtn.disabled = false;
      hideStatus();

      if (!data || !data.success) {
        showError(
          data?.requireLogin ? 'Post Requires Instagram Login' : 'Post Restricted or Unavailable',
          data?.error || 'Failed to extract post information from Instagram.',
          data?.requireLogin
        );
        return;
      }

      currentPost = data.post;
      renderPostResults(currentPost, parsed);

    } catch (err) {
      isExtracting = false;
      extractBtn.disabled = false;
      hideStatus();
      showError('Connection Error', `Failed to communicate with extraction service: ${err.message}`);
    }
  }

  // 3. Render Extracted Results
  function renderPostResults(post, parsed) {
    resultsSection.style.display = 'flex';

    // Author & avatar
    const authorName = post.author || 'instagram_user';
    postAuthor.textContent = `@${authorName}`;
    postAvatar.textContent = authorName.substring(0, 2).toUpperCase();
    postSubmeta.textContent = `Shortcode: ${post.shortcode || parsed.shortcode}`;

    // Post Type Badge
    const imageCount = post.images ? post.images.length : 0;
    postTypeBadge.textContent = imageCount > 1 ? `Carousel (${imageCount} Slides)` : 'Single Post';

    // Caption
    if (post.caption) {
      captionBox.style.display = 'block';
      captionText.textContent = post.caption;
      captionText.classList.remove('expanded');
      toggleCaptionBtn.textContent = 'Show More';
      toggleCaptionBtn.style.display = post.caption.length > 90 ? 'inline-block' : 'none';
    } else {
      captionBox.style.display = 'none';
    }

    // Direct PDF Section
    const hasPdfLinks = post.pdfLinks && post.pdfLinks.length > 0;
    if (hasPdfLinks) {
      directPdfCard.style.display = 'block';
      const firstPdf = post.pdfLinks[0];
      detectedPdfName.textContent = firstPdf.filename || 'document.pdf';
      detectedPdfSource.textContent = `Source: ${firstPdf.source || 'Post Caption'} (${firstPdf.label || 'PDF'})`;

      downloadDirectPdfBtn.onclick = () => {
        downloadDirectPdf(firstPdf);
      };

      if (copyPdfLinkBtn) {
        copyPdfLinkBtn.onclick = () => {
          navigator.clipboard.writeText(firstPdf.downloadUrl);
          showToast('Direct PDF link copied to clipboard!');
        };
      }
    } else {
      directPdfCard.style.display = 'none';
    }

    // Carousel Slides to PDF Section
    if (imageCount > 0) {
      carouselPdfCard.style.display = 'block';
      slideCountBadge.textContent = `${imageCount} Slide${imageCount > 1 ? 's' : ''}`;
      carouselSubtitle.textContent = imageCount > 1
        ? `Compile all ${imageCount} slides into a unified high-resolution PDF document`
        : 'Convert post image into a high-resolution PDF document';

      // Default custom filename
      const cleanAuthor = authorName.replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanShortcode = (post.shortcode || parsed.shortcode || 'post').replace(/[^a-zA-Z0-9_-]/g, '');
      customFilenameInput.value = `Instagram_${cleanAuthor}_${cleanShortcode}_${imageCount}slides`;

      // Initialize all slides as selected
      selectedSlideIndices = new Set(Array.from({ length: imageCount }, (_, i) => i));
      updateSelectedSlideUI(imageCount);

      if (toggleSelectAllBtn) {
        toggleSelectAllBtn.onclick = () => {
          const items = slidesPreviewStrip.querySelectorAll('.slide-item');
          if (selectedSlideIndices.size === imageCount) {
            // Keep first slide selected
            selectedSlideIndices = new Set([0]);
            toggleSelectAllBtn.textContent = 'Select All';
            items.forEach((item, idx) => {
              const indicator = item.querySelector('.slide-checkbox-indicator');
              if (idx === 0) {
                item.classList.add('selected');
                item.classList.remove('excluded');
                if (indicator) indicator.textContent = '✓';
              } else {
                item.classList.remove('selected');
                item.classList.add('excluded');
                if (indicator) indicator.textContent = '✕';
              }
            });
          } else {
            selectedSlideIndices = new Set(Array.from({ length: imageCount }, (_, i) => i));
            toggleSelectAllBtn.textContent = 'Deselect All';
            items.forEach((item) => {
              item.classList.add('selected');
              item.classList.remove('excluded');
              const indicator = item.querySelector('.slide-checkbox-indicator');
              if (indicator) indicator.textContent = '✓';
            });
          }
          updateSelectedSlideUI(imageCount);
        };
      }

      // Render interactive thumbnail items
      slidesPreviewStrip.innerHTML = '';
      post.images.forEach((imgUrl, idx) => {
        const item = document.createElement('div');
        item.className = 'slide-item selected';
        item.dataset.index = idx;

        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = `Slide ${idx + 1}`;
        img.loading = 'lazy';

        const numberBadge = document.createElement('span');
        numberBadge.className = 'slide-number-badge';
        numberBadge.textContent = `${idx + 1}`;

        const checkIndicator = document.createElement('span');
        checkIndicator.className = 'slide-checkbox-indicator';
        checkIndicator.textContent = '✓';

        item.appendChild(img);
        item.appendChild(numberBadge);
        item.appendChild(checkIndicator);

        item.addEventListener('click', () => {
          if (selectedSlideIndices.has(idx)) {
            if (selectedSlideIndices.size > 1) {
              selectedSlideIndices.delete(idx);
              item.classList.remove('selected');
              item.classList.add('excluded');
              checkIndicator.textContent = '✕';
            } else {
              showToast('At least one slide must remain selected.');
            }
          } else {
            selectedSlideIndices.add(idx);
            item.classList.remove('excluded');
            item.classList.add('selected');
            checkIndicator.textContent = '✓';
          }
          updateSelectedSlideUI(imageCount);
        });

        slidesPreviewStrip.appendChild(item);
      });

      downloadCarouselPdfBtn.onclick = () => {
        downloadCarouselAsPdf(post);
      };

    } else {
      carouselPdfCard.style.display = 'none';
    }

    if (!hasPdfLinks && imageCount === 0) {
      showError('No PDF or Media Found', 'No downloadable PDF document or images were detected in this post.');
    }

    // Smooth scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateSelectedSlideUI(total) {
    if (selectedCountText) {
      selectedCountText.textContent = `${selectedSlideIndices.size} of ${total} slides selected`;
    }
    if (downloadBtnLabel) {
      downloadBtnLabel.textContent = `Download ${selectedSlideIndices.size} Slide${selectedSlideIndices.size > 1 ? 's' : ''} as PDF`;
    }
    if (toggleSelectAllBtn) {
      toggleSelectAllBtn.textContent = selectedSlideIndices.size === total ? 'Deselect All' : 'Select All';
    }
  }

  // 4. Download Direct PDF
  function downloadDirectPdf(pdfItem) {
    const filename = `Instagram_${currentPost?.author || 'post'}_${pdfItem.filename || 'document.pdf'}`;
    showToast('Starting PDF download...');

    const a = document.createElement('a');
    a.href = pdfItem.downloadUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 5. Download Carousel as PDF
  async function downloadCarouselAsPdf(post) {
    if (isCompiling) return;
    isCompiling = true;
    downloadCarouselPdfBtn.disabled = true;

    // Filter only selected slides
    const selectedImages = post.images.filter((_, idx) => selectedSlideIndices.has(idx));
    if (selectedImages.length === 0) {
      isCompiling = false;
      downloadCarouselPdfBtn.disabled = false;
      showError('No Slides Selected', 'Please select at least one slide to compile into a PDF.');
      return;
    }

    const postToCompile = { ...post, images: selectedImages };

    // Format & Options
    const selectedRadio = document.querySelector('input[name="pdfMode"]:checked');
    const mode = selectedRadio ? selectedRadio.value : 'slides_only';
    const showSlideNumbers = showSlideNumbersCheck?.checked ?? true;

    // Custom filename
    let baseFilename = customFilenameInput.value.trim();
    if (!baseFilename) {
      baseFilename = `Instagram_${post.author || 'post'}_${post.shortcode || 'doc'}_${selectedImages.length}slides`;
    }
    baseFilename = baseFilename.replace(/\.pdf$/i, '');
    const finalFilename = `${baseFilename}.pdf`;

    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    showStatus('Preparing Slides...', `Processing ${selectedImages.length} high-resolution slides via local PDF engine`);

    try {
      const pdfBlob = await PdfBuilder.compileInstagramPostToPdf(postToCompile, { mode, showSlideNumbers }, (current, total, msg) => {
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = `${percent}%`;
        statusMessage.textContent = msg;
        statusSubtext.textContent = `Progress: ${current} / ${total} (${percent}%)`;
      });

      showStatus('Finalizing PDF...', 'Saving document to your browser');
      triggerBlobDownload(pdfBlob, finalFilename);

      isCompiling = false;
      downloadCarouselPdfBtn.disabled = false;
      hideStatus();
      showToast(`Successfully created ${finalFilename}!`);

    } catch (err) {
      isCompiling = false;
      downloadCarouselPdfBtn.disabled = false;
      hideStatus();
      showError('PDF Generation Failed', err.message);
    }
  }

  // 6. Utility Functions
  function triggerBlobDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 45000);
  }

  function showStatus(msg, subtext) {
    statusSection.style.display = 'flex';
    statusMessage.textContent = msg;
    statusSubtext.textContent = subtext || '';
  }

  function hideStatus() {
    statusSection.style.display = 'none';
    progressBarContainer.style.display = 'none';
  }

  function showError(title, message, isLoginRequired = false) {
    errorCard.style.display = 'flex';
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    if (errorSolutions) {
      errorSolutions.style.display = isLoginRequired ? 'block' : 'none';
    }
    errorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorCard.style.display = 'none';
  }

  function hideResults() {
    resultsSection.style.display = 'none';
    directPdfCard.style.display = 'none';
    carouselPdfCard.style.display = 'none';
  }

  let toastTimeout = null;
  function showToast(message) {
    let toast = document.getElementById('toastNotice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotice';
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }
});
