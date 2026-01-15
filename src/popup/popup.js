
class PopupView {
  constructor() {
    this.loadSimilarPages();
  }

  async loadSimilarPages() {
    const loading = document.getElementById('loading');
    const similarPages = document.getElementById('similar-pages');
    const noResults = document.getElementById('no-results');

    try {
      // Get the current tab's URL
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        this.showNoResults();
        return;
      }

      // Request similar pages from the background worker
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SIMILAR_TO_URL',
        data: { url: tab.url, k: 10 }
      });

      loading.classList.add('hidden');

      if (response.status === 'success' && response.results.length > 0) {
        this.renderResults(response.results);
      } else {
        this.showNoResults();
      }
    } catch (error) {
      console.error('Error loading similar pages:', error);
      loading.classList.add('hidden');
      this.showNoResults();
    }
  }

  showNoResults() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('no-results').classList.remove('hidden');
  }

  renderResults(results) {
    const container = document.getElementById('similar-pages');
    container.innerHTML = '';

    for (const page of results) {
      const entry = document.createElement('div');
      entry.className = 'similar-entry';

      const link = document.createElement('a');
      link.href = page.url;
      link.target = '_blank';
      link.className = 'similar-title';
      link.textContent = page.title || page.url;

      const meta = document.createElement('div');
      meta.className = 'similar-meta';

      const similarity = Math.round((1 - page.distance) * 100);
      const date = new Date(page.timestamp).toLocaleDateString();

      meta.textContent = `${similarity}% similar | ${date}`;

      entry.appendChild(link);
      entry.appendChild(meta);
      container.appendChild(entry);
    }
  }
}

new PopupView();
