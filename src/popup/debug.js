import { PageDatabase } from '../db/database.js';

class DebugView {
  constructor() {
    this.db = new PageDatabase();
    this.container = document.getElementById('pages-container');
    document.getElementById('debug').addEventListener('click', async () => {
      this.init();
    });
  }

  async init() {
    try {
      await this.displayPages();
    } catch (error) {
      this.container.innerHTML = `<div class="error">Error loading data: ${error.message}</div>`;
    }
  }

  async displayPages() {
    const pages = await this.db.getAllPages();

    // Sort by timestamp, most recent first
    pages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    this.container.innerHTML = pages.map(page => `
            <div class="page-entry">
                <div><strong>${page.title}</strong></div>
                <div>${page.embeddings}</div>
                <div><a href="${page.url}" target="_blank">${page.url}</a></div>
                <div>${page.timestamp}</div>
                <div class="timestamp">${new Date(page.timestamp).toLocaleString()}</div>
            </div>
        `).join('');
  }
}

// Initialize the debug view
new DebugView();

