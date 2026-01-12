import { pipeline, env } from '@xenova/transformers';
import { PageDatabase } from '../db/database.js';

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

        this.pipe = await pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
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
    this.setupMessageListeners();
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
  }
}

// Initialize the worker
new BackgroundWorker();


