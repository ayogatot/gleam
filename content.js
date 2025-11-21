// content.js

let shadowRoot = null;
let hostElement = null;
let tooltipElement = null;
let currentSelection = null;

// Initialize Shadow DOM container
function initShadowDOM() {
    if (hostElement) return;

    hostElement = document.createElement('div');
    hostElement.id = 'highlight-me-host';
    document.body.appendChild(hostElement);

    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Inject styles
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('content.css');
    shadowRoot.appendChild(styleLink);
}

// Create Tooltip
function createTooltip(x, y) {
    if (tooltipElement) tooltipElement.remove();

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'hm-tooltip';
    tooltipElement.innerHTML = `
    <span>✨ Share!</span>
  `;

    // Position
    tooltipElement.style.left = `${x}px`;
    tooltipElement.style.top = `${y}px`;

    tooltipElement.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showModal();
        removeTooltip();
    });

    shadowRoot.appendChild(tooltipElement);
}

function removeTooltip() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
}

// Handle Selection
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0) {
        // Ensure Shadow DOM exists
        initShadowDOM();

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Calculate position relative to viewport (fixed positioning in CSS)
        const x = rect.left + (rect.width / 2);
        const y = rect.top - 10; // Slightly above

        currentSelection = {
            text: text,
            url: window.location.href,
            title: document.title
        };

        createTooltip(x, y);
    } else {
        // Clicked elsewhere, clear tooltip
        // Check if click was inside our shadow DOM (handled by event propagation usually, but shadow DOM is tricky)
        // For now, simple check: if selection is empty, remove tooltip.
        removeTooltip();
    }
}, true); // Use capture phase to ensure we detect it even if page stops propagation

// Show Modal
function showModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'hm-modal-overlay';

    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(currentSelection.url).hostname}&sz=32`;

    modalOverlay.innerHTML = `
    <div class="hm-modal">
      <div class="hm-modal-header">
        <h2 class="hm-modal-title">Gleam</h2>
        <button class="hm-close-btn">&times;</button>
      </div>
      
      <div class="hm-quote-card" id="hm-capture-target">
        <div class="hm-quote-text">
          ${escapeHtml(currentSelection.text)}
        </div>
        <div class="hm-quote-source">
          <img src="${faviconUrl}" alt="icon" />
          <span>${new URL(currentSelection.url).hostname}</span>
        </div>
      </div>

      <div class="hm-modal-footer">
        <button class="hm-btn hm-btn-secondary" id="hm-btn-save">Save</button>
        <button class="hm-btn hm-btn-primary" id="hm-btn-download">Download Image</button>
      </div>
    </div>
  `;

    shadowRoot.appendChild(modalOverlay);

    // Event Listeners
    const closeBtn = modalOverlay.querySelector('.hm-close-btn');
    closeBtn.addEventListener('click', () => modalOverlay.remove());

    const saveBtn = modalOverlay.querySelector('#hm-btn-save');
    saveBtn.addEventListener('click', () => {
        saveSnippet(currentSelection);
        saveBtn.textContent = 'Saved!';
        saveBtn.disabled = true;
        setTimeout(() => modalOverlay.remove(), 1000);
    });

    const downloadBtn = modalOverlay.querySelector('#hm-btn-download');
    downloadBtn.addEventListener('click', () => {
        downloadImage(modalOverlay.querySelector('#hm-capture-target'));
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
        }
    });
}

function saveSnippet(data) {
    chrome.storage.local.get(['snippets'], (result) => {
        const snippets = result.snippets || [];
        snippets.push({
            ...data,
            date: new Date().toISOString()
        });
        chrome.storage.local.set({ snippets: snippets });
    });
}

function downloadImage(element) {
    // Strategy: Clone to main DOM, inject styles inline to avoid loading delays, and use html2canvas.

    const clone = element.cloneNode(true);
    const container = document.createElement('div');

    // Position off-screen but ensure it's rendered
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '500px'; // Fixed width for consistency
    container.style.zIndex = '99999';
    container.style.backgroundColor = 'transparent';

    document.body.appendChild(container);
    container.appendChild(clone);

    // Fetch the CSS content to inject it directly
    // This avoids timing issues with <link> loading
    fetch(chrome.runtime.getURL('content.css'))
        .then(response => response.text())
        .then(cssText => {
            const style = document.createElement('style');
            style.textContent = cssText;
            container.appendChild(style);

            // Allow a moment for layout to settle and images to load
            // We can check if the favicon image is loaded
            const img = clone.querySelector('img');
            const imageLoadPromise = new Promise((resolve) => {
                if (!img || img.complete) {
                    resolve();
                } else {
                    img.onload = resolve;
                    img.onerror = resolve; // Proceed even if image fails
                }
            });

            return imageLoadPromise.then(() => {
                // Small delay to ensure rendering is complete
                return new Promise(resolve => setTimeout(resolve, 100));
            });
        })
        .then(() => {
            return html2canvas(clone, {
                backgroundColor: null,
                scale: 2, // Retina quality
                useCORS: true, // Important for the favicon
                logging: true, // Helpful for debugging
                allowTaint: false, // We need to export to data URL, so no tainting allowed
            });
        })
        .then(canvas => {
            const link = document.createElement('a');
            link.download = `highlight-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            // Cleanup
            container.remove();
        })
        .catch(err => {
            console.error('Screenshot failed:', err);
            alert('Could not generate image. This might be due to security restrictions on this page (CSP). Check the console for details.');
            container.remove();
        });
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
