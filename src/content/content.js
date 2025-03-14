
class ContentScript {
  constructor() {
    // Wait for DOM to be fully loaded before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    try {
      if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      }

      const moduleURL = chrome.runtime.getURL('content/page_data_collector.js');
      const module = await import(moduleURL).catch(e => {
        console.error('Module import error:', e);
        throw e;
      });

      const pageData = await module.PageDataCollector.collect();
      await this.sendToBackground(pageData);
    } catch (error) {
      console.error('ContentScript init error:', error);
    }
  }

  async sendToBackground(pageData) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PAGE_VISITED',
        data: pageData
      });

      if (response.status === 'error') {
        console.error('Error saving page data:', response.error);
      }
    } catch (error) {
      console.error('Error communicating with background worker:', error);
    }
  }
}

// Initialize the content script
new ContentScript();

