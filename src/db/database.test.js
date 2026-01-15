import { describe, it, expect, beforeEach } from 'vitest';
import { PageDatabase } from './database.js';

describe('PageDatabase', () => {
  let db;
  let testDbCounter = 0;

  beforeEach(() => {
    // Use unique database name for each test to avoid state pollution
    testDbCounter++;
    db = new PageDatabase();
    db.dbName = `testDB_${testDbCounter}_${Date.now()}`;
  });

  describe('init', () => {
    it('should initialize the database', async () => {
      const result = await db.init();
      expect(result).toBeDefined();
      expect(result.name).toBe(db.dbName);
    });

    it('should create the pages object store', async () => {
      const result = await db.init();
      expect(result.objectStoreNames.contains('pages')).toBe(true);
    });
  });

  describe('savePage', () => {
    it('should save a page with all required fields', async () => {
      const pageData = {
        url: 'https://example.com',
        title: 'Example Page',
        timestamp: '2024-01-15T12:00:00.000Z',
        embeddings: [0.1, 0.2, 0.3]
      };

      await db.savePage(pageData);
      const pages = await db.getAllPages();

      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual(pageData);
    });

    it('should update existing page with same URL', async () => {
      const pageData1 = {
        url: 'https://example.com',
        title: 'Original Title',
        timestamp: '2024-01-15T12:00:00.000Z',
        embeddings: [0.1, 0.2, 0.3]
      };

      const pageData2 = {
        url: 'https://example.com',
        title: 'Updated Title',
        timestamp: '2024-01-16T12:00:00.000Z',
        embeddings: [0.4, 0.5, 0.6]
      };

      await db.savePage(pageData1);
      await db.savePage(pageData2);
      const pages = await db.getAllPages();

      expect(pages).toHaveLength(1);
      expect(pages[0].title).toBe('Updated Title');
    });

    it('should save multiple pages with different URLs', async () => {
      const page1 = {
        url: 'https://example1.com',
        title: 'Page 1',
        timestamp: '2024-01-15T12:00:00.000Z',
        embeddings: [0.1]
      };

      const page2 = {
        url: 'https://example2.com',
        title: 'Page 2',
        timestamp: '2024-01-15T13:00:00.000Z',
        embeddings: [0.2]
      };

      await db.savePage(page1);
      await db.savePage(page2);
      const pages = await db.getAllPages();

      expect(pages).toHaveLength(2);
    });
  });

  describe('getAllPages', () => {
    it('should return empty array when no pages exist', async () => {
      const pages = await db.getAllPages();
      expect(pages).toEqual([]);
    });

    it('should return all saved pages', async () => {
      const page1 = { url: 'https://a.com', title: 'A', timestamp: '2024-01-01', embeddings: [] };
      const page2 = { url: 'https://b.com', title: 'B', timestamp: '2024-01-02', embeddings: [] };
      const page3 = { url: 'https://c.com', title: 'C', timestamp: '2024-01-03', embeddings: [] };

      await db.savePage(page1);
      await db.savePage(page2);
      await db.savePage(page3);

      const pages = await db.getAllPages();
      expect(pages).toHaveLength(3);
    });
  });

  describe('iterate', () => {
    it('should call callback for each page', async () => {
      const page1 = { url: 'https://a.com', title: 'A', timestamp: '2024-01-01', embeddings: [] };
      const page2 = { url: 'https://b.com', title: 'B', timestamp: '2024-01-02', embeddings: [] };

      await db.savePage(page1);
      await db.savePage(page2);

      const collected = [];
      await db.iterate(page => collected.push(page));

      expect(collected).toHaveLength(2);
    });

    it('should not call callback when database is empty', async () => {
      let callCount = 0;
      await db.iterate(() => callCount++);

      expect(callCount).toBe(0);
    });
  });
});
