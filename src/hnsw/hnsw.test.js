/**
 * Tests for HNSW Implementation (Redis-style)
 */

import { describe, it, expect } from 'vitest';
import { HNSW, cosineDistance, normalize } from './hnsw.js';

// Helper to generate random vectors
function randomVector(dim) {
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.random() * 2 - 1;
  }
  return vec;
}

// Helper to compute cosine similarity for verification
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Brute force k-NN for ground truth
function bruteForceKNN(query, vectors, k) {
  const distances = vectors.map((v, i) => ({
    index: i,
    similarity: cosineSimilarity(query, v.vector)
  }));
  distances.sort((a, b) => b.similarity - a.similarity);
  return distances.slice(0, k);
}

describe('HNSW', () => {
  describe('basic operations', () => {
    it('should insert and search vectors', () => {
      const index = new HNSW({ M: 16, efConstruction: 100 });
      const dim = 128;

      for (let i = 0; i < 100; i++) {
        index.insert(randomVector(dim), { label: `item_${i}` });
      }

      const query = randomVector(dim);
      const results = index.search(query, 10);

      expect(results).toHaveLength(10);

      // Results should be sorted by distance (ascending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].distance).toBeLessThanOrEqual(results[i].distance);
      }
    });

    it('should return empty results for empty index', () => {
      const index = new HNSW();
      const results = index.search(randomVector(64), 10);
      expect(results).toHaveLength(0);
    });

    it('should return false when deleting non-existent node', () => {
      const index = new HNSW();
      expect(index.delete(999)).toBe(false);
    });
  });

  describe('recall quality', () => {
    it('should achieve at least 80% recall@10', () => {
      const index = new HNSW({ M: 16, efConstruction: 200 });
      const dim = 64;
      const n = 500;
      const vectors = [];

      for (let i = 0; i < n; i++) {
        const vec = randomVector(dim);
        const node = index.insert(vec);
        vectors.push({ id: node.id, vector: vec });
      }

      const numQueries = 20;
      const k = 10;
      let totalRecall = 0;

      for (let q = 0; q < numQueries; q++) {
        const query = randomVector(dim);
        const hnswResults = index.search(query, k);
        const bruteResults = bruteForceKNN(query, vectors, k);

        const trueTopK = new Set(bruteResults.map(r => vectors[r.index].id));
        let hits = 0;
        for (const r of hnswResults) {
          if (trueTopK.has(r.id)) hits++;
        }
        totalRecall += hits / k;
      }

      const avgRecall = totalRecall / numQueries;
      expect(avgRecall).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('deletion and reconnection', () => {
    it('should delete nodes and maintain search functionality', () => {
      const index = new HNSW({ M: 8, efConstruction: 50 });
      const dim = 32;
      const ids = [];

      for (let i = 0; i < 50; i++) {
        ids.push(index.insert(randomVector(dim)).id);
      }

      // Delete half
      for (let i = 0; i < 25; i++) {
        expect(index.delete(ids[i])).toBe(true);
      }

      expect(index.nodes.size).toBe(25);

      // Search should still work
      const results = index.search(randomVector(dim), 5);
      expect(results).toHaveLength(5);

      // Deleted IDs should not appear
      const deletedSet = new Set(ids.slice(0, 25));
      for (const r of results) {
        expect(deletedSet.has(r.id)).toBe(false);
      }
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const index = new HNSW({ M: 16, efConstruction: 100 });
      const dim = 64;

      for (let i = 0; i < 100; i++) {
        index.insert(randomVector(dim), `value_${i}`);
      }

      const serialized = index.serialize();
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);
      const restored = HNSW.deserialize(parsed);

      expect(restored.nodes.size).toBe(index.nodes.size);

      // Same query should return same results
      const query = randomVector(dim);
      const originalResults = index.search(query, 10);
      const restoredResults = restored.search(query, 10);

      expect(restoredResults).toHaveLength(originalResults.length);
      for (let i = 0; i < originalResults.length; i++) {
        expect(restoredResults[i].id).toBe(originalResults[i].id);
      }
    });
  });

  describe('worst neighbor tracking', () => {
    it('should correctly track worst neighbor per layer', () => {
      const index = new HNSW({ M: 4, efConstruction: 50 });
      const dim = 16;

      for (let i = 0; i < 30; i++) {
        index.insert(randomVector(dim));
      }

      for (const node of index.nodes.values()) {
        for (let lc = 0; lc <= node.level; lc++) {
          if (node.neighborCount(lc) > 0) {
            const cached = node.worstNeighbor[lc];
            let actualWorst = { id: null, distance: -Infinity };

            for (const [nid, dist] of node.layers[lc]) {
              if (dist > actualWorst.distance) {
                actualWorst = { id: nid, distance: dist };
              }
            }

            expect(cached.id).toBe(actualWorst.id);
            expect(cached.distance).toBe(actualWorst.distance);
          }
        }
      }
    });
  });

  describe('bidirectional links', () => {
    it('should maintain bidirectional link integrity', () => {
      const index = new HNSW({ M: 8, efConstruction: 50 });
      const dim = 32;

      for (let i = 0; i < 100; i++) {
        index.insert(randomVector(dim));
      }

      let violations = 0;
      for (const node of index.nodes.values()) {
        for (let lc = 0; lc <= node.level; lc++) {
          for (const [neighborId, _] of node.layers[lc]) {
            const neighbor = index.nodes.get(neighborId);
            if (neighbor && lc <= neighbor.level) {
              if (!neighbor.layers[lc].has(node.id)) {
                violations++;
              }
            }
          }
        }
      }

      expect(violations).toBe(0);
    });
  });

  describe('HNSW stress test - no duplicates', () => {
    it('should maintain single entry per URL after repeated inserts with delete', () => {
      const hnsw = new HNSW({ M: 16, efConstruction: 100 });
      const dim = 64;

      // Simulate 100 URLs
      const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/page${i}`);
      const vectors = urls.map(() => {
        const v = new Float32Array(dim);
        for (let j = 0; j < dim; j++) v[j] = Math.random() * 2 - 1;
        return v;
      });

      // Track nodeId per URL (like the extension does)
      const urlToNodeId = new Map();

      // Simulate 1000 page visits (revisiting same URLs)
      for (let round = 0; round < 1000; round++) {
        const idx = Math.floor(Math.random() * urls.length);
        const url = urls[idx];
        const vector = vectors[idx];

        // Delete old node if exists (mimics worker.js logic)
        if (urlToNodeId.has(url)) {
          hnsw.delete(urlToNodeId.get(url));
        }

        // Insert and track new node
        const node = hnsw.insert(vector, { url });
        urlToNodeId.set(url, node.id);
      }

      // Verify: node count should equal unique URLs
      expect(hnsw.nodes.size).toBe(urlToNodeId.size);

      // Verify: each URL appears exactly once in values
      const urlsInIndex = new Set();
      for (const node of hnsw.nodes.values()) {
        expect(urlsInIndex.has(node.value.url)).toBe(false);
        urlsInIndex.add(node.value.url);
      }

      expect(urlsInIndex.size).toBe(urlToNodeId.size);
    });
  });

});

