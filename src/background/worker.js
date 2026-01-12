import { pipeline, env } from '@xenova/transformers';
import { PageDatabase } from '../db/database.js';
import { HNSW } from '../hnsw/hnsw.js';

class EmbeddingsGenerator {
  constructor() {
    this.pipe = null;
  }

  async initializeTransformers() {
    // Disable caching
    env.useBrowserCache = false;
    env.allowRemoteModels = false;
    env.localModelPath = chrome.runtime.getURL('models/');
    //env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/');
    env.backends.onnx.wasm.numThreads = 1;
  }

  async generateEmbeddings(text) {
    try {
      if (!this.pipe) {
        await this.initializeTransformers();

        // this.pipe = await pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
        this.pipe = await pipeline('feature-extraction', 'gte-small', {
          cache: false,
          useCache: false
        });
      }

      const output = await this.pipe(text, {
        pooling: 'mean',
        normalize: true,
      });

      return Array.from(output.data);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }
}

class BackgroundWorker {
  // static embeddings generator field
  static embeddingsGenerator = new EmbeddingsGenerator();

  constructor() {
    this.db = new PageDatabase();
    this.hnsw = null;
    this.hnswDirty = false;
    this.initHNSW();
    this.setupMessageListeners();
    this.setupPeriodicSave();
  }

  async initHNSW() {
    try {
      const savedIndex = await this.db.loadHNSWIndex();
      if (savedIndex) {
        this.hnsw = HNSW.deserialize(savedIndex);
        console.log('HNSW index loaded:', this.hnsw.stats());
      } else {
        this.hnsw = new HNSW({ M: 16, efConstruction: 200 });
        console.log('Created new HNSW index');
      }
    } catch (error) {
      console.error('Error initializing HNSW:', error);
      this.hnsw = new HNSW({ M: 16, efConstruction: 200 });
    }
  }

  setupPeriodicSave() {
    // Save HNSW index every 30 seconds if dirty
    setInterval(async () => {
      if (this.hnswDirty && this.hnsw) {
        try {
          await this.db.saveHNSWIndex(this.hnsw.serialize());
          this.hnswDirty = false;
          console.log('HNSW index saved');
        } catch (error) {
          console.error('Error saving HNSW index:', error);
        }
      }
    }, 30000);
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PAGE_VISITED') {
        this.handlePageVisited(message.data)
          .then(() => sendResponse({ status: 'success' }))
          .catch(error => sendResponse({ status: 'error', error: error.message }));
        return true; // Required for async response
      }
      if (message.type === 'GENERATE_EMBEDDINGS') {
        BackgroundWorker.embeddingsGenerator.generateEmbeddings(message.data.text)
          .then(embeddings => sendResponse({
            status: 'success',
            embeddings
          }))
          .catch(error => sendResponse({
            status: 'error',
            error: error.message
          }));
        return true; // Required for async response
      }
      if (message.type === 'SEARCH_SIMILAR') {
        this.handleSearch(message.data)
          .then(results => sendResponse({ status: 'success', results }))
          .catch(error => sendResponse({ status: 'error', error: error.message }));
        return true;
      }
      if (message.type === 'GET_HNSW_STATS') {
        const stats = this.hnsw ? this.hnsw.stats() : null;
        sendResponse({ status: 'success', stats });
        return false;
      }
      if (message.type === 'GET_SIMILAR_TO_URL') {
        this.handleSimilarToUrl(message.data)
          .then(results => sendResponse({ status: 'success', results }))
          .catch(error => sendResponse({ status: 'error', error: error.message }));
        return true;
      }
    });
  }

  async handlePageVisited(pageData) {
    const embeddings = await BackgroundWorker.embeddingsGenerator.generateEmbeddings(pageData.markdown);

    const db_data = {
      url: pageData.url,
      title: pageData.title,
      timestamp: pageData.timestamp,
      embeddings: embeddings
    };
    await this.db.savePage(db_data);

    // Add to HNSW index
    if (this.hnsw) {
      this.hnsw.insert(embeddings, { url: pageData.url, title: pageData.title });
      this.hnswDirty = true;
    }
  }

  async handleSearch(data) {
    const { text, k = 10 } = data;

    // Generate embeddings for query
    const queryEmbeddings = await BackgroundWorker.embeddingsGenerator.generateEmbeddings(text);

    if (!this.hnsw || this.hnsw.nodes.size === 0) {
      return [];
    }

    // Search HNSW
    const results = this.hnsw.search(queryEmbeddings, k);

    // Enrich with full page data
    const enrichedResults = [];
    for (const result of results) {
      const page = await this.db.getPageByUrl(result.value.url);
      if (page) {
        enrichedResults.push({
          url: page.url,
          title: page.title,
          timestamp: page.timestamp,
          distance: result.distance
        });
      }
    }

    return enrichedResults;
  }

  async handleSimilarToUrl(data) {
    const { url, k = 10 } = data;

    // Get the page's embeddings from database
    const page = await this.db.getPageByUrl(url);
    if (!page || !page.embeddings) {
      return [];
    }

    if (!this.hnsw || this.hnsw.nodes.size === 0) {
      return [];
    }

    // Search HNSW with the page's embeddings (k+1 to exclude self)
    const results = this.hnsw.search(page.embeddings, k + 1);

    // Filter out the query page itself and enrich with full data
    const enrichedResults = [];
    for (const result of results) {
      if (result.value.url === url) continue;  // Skip self
      if (enrichedResults.length >= k) break;

      const resultPage = await this.db.getPageByUrl(result.value.url);
      if (resultPage) {
        enrichedResults.push({
          url: resultPage.url,
          title: resultPage.title,
          timestamp: resultPage.timestamp,
          distance: result.distance
        });
      }
    }

    return enrichedResults;
  }
}

// Initialize the worker
new BackgroundWorker();


