
class PageDatabase {
  constructor() {
    this.dbName = 'pageEmbeddingsDB';
    this.dbVersion = 2;
    this.storeName = 'pages';
    this.hnswStoreName = 'hnsw';
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'url' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.hnswStoreName)) {
          db.createObjectStore(this.hnswStoreName, { keyPath: 'id' });
        }
      };
    });
  }

  async savePage(pageData) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(pageData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async iterate(callback) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          callback(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllPages() {
    const pages = [];
    await this.iterate(page => pages.push(page));
    return pages;
  }

  async saveHNSWIndex(serializedIndex) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.hnswStoreName], 'readwrite');
      const store = transaction.objectStore(this.hnswStoreName);
      const request = store.put({ id: 'main', data: serializedIndex });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async loadHNSWIndex() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.hnswStoreName], 'readonly');
      const store = transaction.objectStore(this.hnswStoreName);
      const request = store.get('main');
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getPageByUrl(url) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
}

export { PageDatabase };

