document.addEventListener('DOMContentLoaded', () => {
    loadSnippets();
    setupModalListeners();
});

function loadSnippets() {
    chrome.storage.local.get(['snippets'], (result) => {
        const snippets = result.snippets || [];

        // Calculate Stats
        const total = snippets.length;
        const today = new Date().toISOString().split('T')[0];
        const todayCount = snippets.filter(s => s.date && s.date.startsWith(today)).length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-today').textContent = todayCount;

        const listElement = document.getElementById('saved-list');
        listElement.innerHTML = '';

        if (snippets.length === 0) {
            listElement.innerHTML = '<li class="empty-state">No saved highlights yet.</li>';
            return;
        }

        snippets.reverse().forEach((snippet, index) => {
            const li = document.createElement('li');
            li.className = 'snippet-item';

            const originalIndex = snippets.length - 1 - index;

            li.innerHTML = `
        <div class="snippet-text">"${escapeHtml(snippet.text)}"</div>
        <a href="${escapeHtml(snippet.url)}" target="_blank" class="snippet-source">${new URL(snippet.url).hostname}</a>
        <div class="actions">
          <button class="btn-view" data-index="${originalIndex}">View</button>
          <button class="btn-delete" data-index="${originalIndex}">Delete</button>
        </div>
      `;
            listElement.appendChild(li);
        });

        // Add event listeners
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                deleteSnippet(index);
            });
        });

        document.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                // We need to get the snippet data again or store it in the DOM
                // Let's fetch from storage to be safe
                chrome.storage.local.get(['snippets'], (res) => {
                    const s = res.snippets[index];
                    openModal(s);
                });
            });
        });
    });
}

function deleteSnippet(index) {
    chrome.storage.local.get(['snippets'], (result) => {
        const snippets = result.snippets || [];
        snippets.splice(index, 1);
        chrome.storage.local.set({ snippets: snippets }, () => {
            loadSnippets();
        });
    });
}

// Modal Logic
const modal = document.getElementById('view-modal');
const modalText = document.getElementById('modal-text');
const modalHostname = document.getElementById('modal-hostname');
const modalFavicon = document.getElementById('modal-favicon');

function setupModalListeners() {
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    document.getElementById('btn-download-modal').addEventListener('click', () => {
        const target = document.getElementById('capture-target');
        downloadImage(target);
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function openModal(snippet) {
    modalText.textContent = snippet.text; // textContent is safe
    const hostname = new URL(snippet.url).hostname;
    modalHostname.textContent = hostname;
    modalFavicon.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

    modal.classList.add('active');
}

function downloadImage(element) {
    html2canvas(element, {
        backgroundColor: null,
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `highlight-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }).catch(err => {
        console.error('Screenshot failed:', err);
        alert('Failed to generate image.');
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
