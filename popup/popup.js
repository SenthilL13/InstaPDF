/**
 * InstaPDF - Popup Controller
 * Manages user interactions, Instagram post extraction,
 * direct PDF downloads, and carousel-to-PDF compilation.
 */

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const urlInput = document.getElementById('urlInput');
  const clearInputBtn = document.getElementById('clearInputBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const currentTabBtn = document.getElementById('currentTabBtn');
  const extractBtn = document.getElementById('extractBtn');

  // Status & Error Elements
  const statusSection = document.getElementById('statusSection');
  const statusMessage = document.getElementById('statusMessage');
  const statusSubtext = document.getElementById('statusSubtext');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');

  const errorCard = document.getElementById('errorCard');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const errorActions = document.getElementById('errorActions');
  const openInTabBtn = document.getElementById('openInTabBtn');

  // Results Elements
  const resultsSection = document.getElementById('resultsSection');
  const postAvatar = document.getElementById('postAvatar');
  const postAuthor = document.getElementById('postAuthor');
  const postSubmeta = document.getElementById('postSubmeta');
  const postTypeBadge = document.getElementById('postTypeBadge');
  const captionText = document.getElementById('captionText');
  const captionBox = document.getElementById('captionBox');
  const toggleCaptionBtn = document.getElementById('toggleCaptionBtn');

  // Direct PDF Card Elements
  const directPdfCard = document.getElementById('directPdfCard');
  const detectedPdfName = document.getElementById('detectedPdfName');
  const detectedPdfSource = document.getElementById('detectedPdfSource');
  const downloadDirectPdfBtn = document.getElementById('downloadDirectPdfBtn');
  const copyPdfLinkBtn = document.getElementById('copyPdfLinkBtn');

  // Carousel PDF Card Elements
  const carouselPdfCard = document.getElementById('carouselPdfCard');
  const carouselSubtitle = document.getElementById('carouselSubtitle');
  const slideCountBadge = document.getElementById('slideCountBadge');
  const slidesPreviewStrip = document.getElementById('slidesPreviewStrip');
  const selectedCountText = document.getElementById('selectedCountText');
  const toggleSelectAllBtn = document.getElementById('toggleSelectAllBtn');
  const downloadCarouselPdfBtn = document.getElementById('downloadCarouselPdfBtn');
  const downloadBtnLabel = document.getElementById('downloadBtnLabel');

  // Drawers
  const navHelpBtn = document.getElementById('navHelpBtn');
  const navHistoryBtn = document.getElementById('navHistoryBtn');
  const helpView = document.getElementById('helpView');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const historyView = document.getElementById('historyView');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');

  // State
  let currentPost = null;
  let selectedSlideIndices = new Set();
  let isExtracting = false;
  let isCompiling = false;
  let lastFailedUrl = '';

  // 1. Initial State & Queued Context Menu check
  chrome.storage.local.get(['queuedUrl'], (res) => {
    if (res.queuedUrl) {
      urlInput.value = res.queuedUrl;
      clearInputBtn.style.display = 'block';
      chrome.storage.local.remove('queuedUrl');
      startExtraction(res.queuedUrl);
    }
  });

  // 2. Event Listeners for Input & Actions
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

  currentTabBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB_URL' }, (res) => {
      if (res && res.success && res.url) {
        if (/instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+/i.test(res.url)) {
          urlInput.value = res.url;
          clearInputBtn.style.display = 'block';
          startExtraction(res.url);
        } else {
          showError('Active Tab', 'The active browser tab is not an Instagram post. Please navigate to an Instagram post or paste a link.');
        }
      } else {
        showError('Tab Error', 'Could not access active tab.');
      }
    });
  });

  extractBtn.addEventListener('click', () => {
    const raw = urlInput.value.trim();
    if (!raw) {
      showError('Missing URL', 'Please paste an Instagram post URL to proceed.');
      return;
    }
    startExtraction(raw);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      extractBtn.click();
    }
  });

  toggleCaptionBtn.addEventListener('click', () => {
    captionText.classList.toggle('expanded');
    toggleCaptionBtn.textContent = captionText.classList.contains('expanded') ? 'Show Less' : 'Show More';
  });

  openInTabBtn.addEventListener('click', () => {
    if (lastFailedUrl) {
      chrome.tabs.create({ url: lastFailedUrl });
    }
  });

  // 3. Extraction Flow
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

    chrome.runtime.sendMessage({ action: 'FETCH_POST_DATA', url: parsed.canonicalUrl }, (response) => {
      isExtracting = false;
      extractBtn.disabled = false;
      hideStatus();

      if (!response) {
        showError('Service Error', 'The extension background service did not respond. Please try reloading.');
        return;
      }

      if (!response.success) {
        lastFailedUrl = parsed.canonicalUrl;
        showError('Post Restricted or Unavailable', response.error || 'Failed to extract post information.', response.isPrivate);
        return;
      }

      currentPost = response.post;
      renderPostResults(currentPost, parsed);
    });
  }

  // 4. Render Extracted Results
  function renderPostResults(post, parsed) {
    resultsSection.style.display = 'flex';

    // Author & avatar
    const authorName = post.author || 'instagram_user';
    postAuthor.textContent = `@${authorName}`;
    postAvatar.textContent = authorName.substring(0, 2).toUpperCase();
    postSubmeta.textContent = `Shortcode: ${post.shortcode || parsed.shortcode}`;

    // Post Type Badge
    const imageCount = post.images ? post.images.length : 0;
    postTypeBadge.textContent = imageCount > 1 ? `Carousel (${imageCount})` : 'Single Post';

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
          showTemporaryNotice('PDF link copied to clipboard!');
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
        ? `Compile all ${imageCount} slides into a single PDF document`
        : 'Convert post image into a PDF document';

      // Initialize all slides as selected
      selectedSlideIndices = new Set(Array.from({ length: imageCount }, (_, i) => i));
      updateSelectedSlideUI(imageCount);

      const customInput = document.getElementById('customFilenameInput');
      if (customInput) {
        const cleanAuthor = authorName.replace(/[^a-zA-Z0-9_-]/g, '');
        const cleanShortcode = (post.shortcode || parsed.shortcode || 'post').replace(/[^a-zA-Z0-9_-]/g, '');
        customInput.value = `Instagram_${cleanAuthor}_${cleanShortcode}_${imageCount}_slides`;
      }

      if (toggleSelectAllBtn) {
        toggleSelectAllBtn.onclick = () => {
          const wrappers = slidesPreviewStrip.querySelectorAll('.thumb-card-wrapper');
          if (selectedSlideIndices.size === imageCount) {
            // Keep first slide selected
            selectedSlideIndices = new Set([0]);
            toggleSelectAllBtn.textContent = 'Select All';
            wrappers.forEach((wr, idx) => {
              const badge = wr.querySelector('.slide-check-badge');
              if (idx === 0) {
                wr.classList.add('selected');
                wr.classList.remove('excluded');
                if (badge) badge.textContent = '✓';
              } else {
                wr.classList.remove('selected');
                wr.classList.add('excluded');
                if (badge) badge.textContent = '✕';
              }
            });
          } else {
            selectedSlideIndices = new Set(Array.from({ length: imageCount }, (_, i) => i));
            toggleSelectAllBtn.textContent = 'Deselect All';
            wrappers.forEach((wr) => {
              wr.classList.add('selected');
              wr.classList.remove('excluded');
              const badge = wr.querySelector('.slide-check-badge');
              if (badge) badge.textContent = '✓';
            });
          }
          updateSelectedSlideUI(imageCount);
        };
      }

      // Render rich interactive thumbnail cards
      slidesPreviewStrip.innerHTML = '';
      post.images.forEach((imgUrl, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumb-card-wrapper selected';
        wrapper.dataset.index = idx;

        const img = document.createElement('img');
        img.className = 'slide-thumb';
        img.src = imgUrl;
        img.alt = `Slide ${idx + 1}`;
        img.loading = 'lazy';

        const indexChip = document.createElement('span');
        indexChip.className = 'slide-number-chip';
        indexChip.textContent = `${idx + 1}`;

        const checkBadge = document.createElement('span');
        checkBadge.className = 'slide-check-badge';
        checkBadge.textContent = '✓';

        wrapper.appendChild(img);
        wrapper.appendChild(indexChip);
        wrapper.appendChild(checkBadge);

        wrapper.addEventListener('click', () => {
          if (selectedSlideIndices.has(idx)) {
            if (selectedSlideIndices.size > 1) {
              selectedSlideIndices.delete(idx);
              wrapper.classList.remove('selected');
              wrapper.classList.add('excluded');
              checkBadge.textContent = '✕';
            }
          } else {
            selectedSlideIndices.add(idx);
            wrapper.classList.remove('excluded');
            wrapper.classList.add('selected');
            checkBadge.textContent = '✓';
          }
          updateSelectedSlideUI(imageCount);
        });

        slidesPreviewStrip.appendChild(wrapper);
      });

      downloadCarouselPdfBtn.onclick = () => {
        downloadCarouselAsPdf(post);
      };
    } else {
      carouselPdfCard.style.display = 'none';
    }

    // If neither was found
    if (!hasPdfLinks && imageCount === 0) {
      showError('No PDF or Media Found', 'No downloadable PDF document or images were detected in this post.');
    }
  }

  function updateSelectedSlideUI(total) {
    if (selectedCountText) {
      selectedCountText.textContent = `${selectedSlideIndices.size} of ${total} slides selected`;
    }
    const label = document.getElementById('downloadBtnLabel') || downloadCarouselPdfBtn;
    if (label) {
      label.textContent = `Download ${selectedSlideIndices.size} Slide${selectedSlideIndices.size > 1 ? 's' : ''} as PDF`;
    }
    if (toggleSelectAllBtn) {
      toggleSelectAllBtn.textContent = selectedSlideIndices.size === total ? 'Deselect All' : 'Select All';
    }
  }

  // 5. Download Direct PDF
  function downloadDirectPdf(pdfItem) {
    const filename = `Instagram_${currentPost?.author || 'post'}_${pdfItem.filename}`;
    showStatus('Initiating PDF Download...', `Saving ${filename}`);

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_FILE',
      url: pdfItem.downloadUrl,
      filename: filename,
      saveAs: true
    }, (res) => {
      hideStatus();
      if (res && res.success) {
        showTemporaryNotice('Download started! Check your browser downloads.');
      } else {
        showError('Download Error', res?.error || 'Failed to start PDF download.');
      }
    });
  }

  // 6. Download Carousel as PDF
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

    // Get selected format mode & options
    const selectedRadio = document.querySelector('input[name="pdfMode"]:checked');
    const mode = selectedRadio ? selectedRadio.value : 'slides_only';
    const showSlideNumbers = document.getElementById('showSlideNumbersCheck')?.checked ?? true;

    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    showStatus('Preparing Slides...', `Fetching ${selectedImages.length} high-resolution slides from Instagram CDN`);

    try {
      const pdfBlob = await PdfBuilder.compileInstagramPostToPdf(postToCompile, { mode, showSlideNumbers }, (current, total, msg) => {
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = `${percent}%`;
        statusMessage.textContent = msg;
        statusSubtext.textContent = `Progress: ${current} / ${total} (${percent}%)`;
      });

      const customInput = document.getElementById('customFilenameInput');
      let baseFilename = customInput?.value?.trim();
      if (!baseFilename) {
        baseFilename = `Instagram_${post.author || 'post'}_${post.shortcode || 'doc'}_${selectedImages.length}_slides`;
      }
      baseFilename = baseFilename.replace(/\.pdf$/i, '');
      const filename = `${baseFilename}.pdf`;
      const blobUrl = URL.createObjectURL(pdfBlob);

      showStatus('Saving PDF...', 'Triggering Chrome download');

      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: blobUrl,
        filename: filename,
        saveAs: true
      }, (res) => {
        isCompiling = false;
        downloadCarouselPdfBtn.disabled = false;
        hideStatus();

        if (res && res.success) {
          showTemporaryNotice('PDF created successfully! Saved to your downloads folder.');
        } else {
          showError('Download Error', res?.error || 'Failed to save compiled PDF file.');
        }

        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      });

    } catch (err) {
      isCompiling = false;
      downloadCarouselPdfBtn.disabled = false;
      hideStatus();
      showError('PDF Generation Failed', err.message);
    }
  }

  // UI Helpers
  function showStatus(msg, subtext) {
    statusSection.style.display = 'flex';
    statusMessage.textContent = msg;
    statusSubtext.textContent = subtext || '';
  }

  function hideStatus() {
    statusSection.style.display = 'none';
    progressBarContainer.style.display = 'none';
  }

  function showError(title, message, isPrivate = false) {
    errorCard.style.display = 'flex';
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorActions.style.display = isPrivate ? 'block' : 'none';
  }

  function hideError() {
    errorCard.style.display = 'none';
    errorActions.style.display = 'none';
  }

  function hideResults() {
    resultsSection.style.display = 'none';
    currentPost = null;
  }

  function showTemporaryNotice(text) {
    const origText = statusMessage.textContent;
    statusSection.style.display = 'flex';
    statusMessage.textContent = text;
    statusSubtext.textContent = '';
    setTimeout(() => {
      hideStatus();
    }, 3000);
  }

  // Drawer Toggles
  navHelpBtn.addEventListener('click', () => {
    helpView.style.display = 'block';
    historyView.style.display = 'none';
  });

  closeHelpBtn.addEventListener('click', () => {
    helpView.style.display = 'none';
  });

  navHistoryBtn.addEventListener('click', () => {
    renderHistory();
    historyView.style.display = 'block';
    helpView.style.display = 'none';
  });

  closeHistoryBtn.addEventListener('click', () => {
    historyView.style.display = 'none';
  });

  function renderHistory() {
    chrome.storage.local.get(['downloadHistory'], (res) => {
      const list = res.downloadHistory || [];
      if (list.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No downloads yet. Paste an Instagram post link to get started!</div>';
        clearHistoryBtn.style.display = 'none';
        return;
      }

      clearHistoryBtn.style.display = 'block';
      historyList.innerHTML = '';
      list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const d = item.date ? new Date(item.date).toLocaleDateString() : '';
        div.innerHTML = `
          <div>
            <div class="history-name" title="${item.filename}">${item.filename}</div>
            <div class="history-date">${d}</div>
          </div>
          <span style="font-size: 14px;">📄</span>
        `;
        historyList.appendChild(div);
      });
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ downloadHistory: [] }, () => {
      renderHistory();
    });
  });
});
