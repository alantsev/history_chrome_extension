import { describe, it, expect, beforeEach } from 'vitest';
import { HNSW, cosineDistance, normalize } from './hnsw.js';

describe('cosineDistance', () => {
  it('should return 0 for identical normalized vectors', () => {
    const v = normalize([1, 2, 3]);
    expect(cosineDistance(v, v)).toBeCloseTo(0, 5);
  });

  it('should return 2 for opposite vectors', () => {
    const v1 = normalize([1, 0, 0]);
    const v2 = normalize([-1, 0, 0]);
    expect(cosineDistance(v1, v2)).toBeCloseTo(2, 5);
  });

  it('should return 1 for orthogonal vectors', () => {
    const v1 = normalize([1, 0, 0]);
    const v2 = normalize([0, 1, 0]);
    expect(cosineDistance(v1, v2)).toBeCloseTo(1, 5);
  });
});

describe('normalize', () => {
  it('should normalize a vector to unit length', () => {
    const v = normalize([3, 4, 0]);
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    expect(length).toBeCloseTo(1, 5);
  });

  it('should handle zero vector', () => {
    const v = normalize([0, 0, 0]);
    expect(v).toEqual([0, 0, 0]);
  });
});

describe('HNSW', () => {
  let hnsw;

  beforeEach(() => {
    hnsw = new HNSW({ M: 8, efConstruction: 100 });
  });

  describe('insert', () => {
    it('should insert a single vector', () => {
      const node = hnsw.insert([1, 0, 0], { url: 'test.com' });

      expect(node).toBeDefined();
      expect(node.id).toBe(0);
      expect(hnsw.nodes.size).toBe(1);
    });

    it('should insert multiple vectors', () => {
      hnsw.insert([1, 0, 0]);
      hnsw.insert([0, 1, 0]);
      hnsw.insert([0, 0, 1]);

      expect(hnsw.nodes.size).toBe(3);
    });

    it('should set entry point on first insert', () => {
      const node = hnsw.insert([1, 0, 0]);
      expect(hnsw.entryPoint).toBe(node);
    });

    it('should store associated value', () => {
      const value = { url: 'example.com', title: 'Example' };
      const node = hnsw.insert([1, 0, 0], value);

      expect(node.value).toEqual(value);
    });
  });

  describe('search', () => {
    it('should return empty array for empty index', () => {
      const results = hnsw.search([1, 0, 0], 5);
      expect(results).toEqual([]);
    });

    it('should find exact match', () => {
      hnsw.insert([1, 0, 0], { id: 'a' });
      hnsw.insert([0, 1, 0], { id: 'b' });
      hnsw.insert([0, 0, 1], { id: 'c' });

      const results = hnsw.search([1, 0, 0], 1);

      expect(results).toHaveLength(1);
      expect(results[0].value.id).toBe('a');
      expect(results[0].distance).toBeCloseTo(0, 5);
    });

    it('should return k nearest neighbors', () => {
      // Insert vectors at different distances from query
      hnsw.insert([1, 0, 0], { id: 'closest' });
      hnsw.insert([0.9, 0.1, 0], { id: 'close' });
      hnsw.insert([0, 1, 0], { id: 'far' });
      hnsw.insert([0, 0, 1], { id: 'farther' });

      const results = hnsw.search([1, 0, 0], 2);

      expect(results).toHaveLength(2);
      expect(results[0].value.id).toBe('closest');
    });

    it('should handle k larger than index size', () => {
      hnsw.insert([1, 0, 0]);
      hnsw.insert([0, 1, 0]);

      const results = hnsw.search([1, 0, 0], 10);

      expect(results).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete a node', () => {
      const node = hnsw.insert([1, 0, 0]);
      expect(hnsw.nodes.size).toBe(1);

      const deleted = hnsw.delete(node.id);

      expect(deleted).toBe(true);
      expect(hnsw.nodes.size).toBe(0);
    });

    it('should return false for non-existent node', () => {
      const deleted = hnsw.delete(999);
      expect(deleted).toBe(false);
    });

    it('should update entry point when deleted', () => {
      const node1 = hnsw.insert([1, 0, 0]);
      hnsw.insert([0, 1, 0]);

      if (hnsw.entryPoint === node1) {
        hnsw.delete(node1.id);
        expect(hnsw.entryPoint).not.toBe(node1);
        expect(hnsw.entryPoint).not.toBeNull();
      }
    });

    it('should remove connections from neighbors', () => {
      hnsw.insert([1, 0, 0]);
      const node2 = hnsw.insert([0.9, 0.1, 0]);
      hnsw.insert([0.8, 0.2, 0]);

      hnsw.delete(node2.id);

      // Verify no node references the deleted node
      for (const node of hnsw.nodes.values()) {
        for (const layer of node.layers) {
          expect(layer.has(node2.id)).toBe(false);
        }
      }
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      hnsw.insert([1, 0, 0]);
      hnsw.insert([0, 1, 0]);
      hnsw.insert([0, 0, 1]);

      const stats = hnsw.stats();

      expect(stats.nodeCount).toBe(3);
      expect(stats.M).toBe(8);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize empty index', () => {
      const serialized = hnsw.serialize();
      const restored = HNSW.deserialize(serialized);

      expect(restored.nodes.size).toBe(0);
      expect(restored.entryPoint).toBeNull();
    });

    it('should serialize and deserialize index with nodes', () => {
      hnsw.insert([1, 0, 0], { id: 'a' });
      hnsw.insert([0, 1, 0], { id: 'b' });
      hnsw.insert([0, 0, 1], { id: 'c' });

      const serialized = hnsw.serialize();
      const restored = HNSW.deserialize(serialized);

      expect(restored.nodes.size).toBe(3);
      expect(restored.entryPoint).not.toBeNull();

      // Search should work on restored index
      const results = restored.search([1, 0, 0], 1);
      expect(results[0].value.id).toBe('a');
    });

    it('should preserve connections after deserialization', () => {
      for (let i = 0; i < 20; i++) {
        hnsw.insert([Math.random(), Math.random(), Math.random()]);
      }

      const originalStats = hnsw.stats();
      const serialized = hnsw.serialize();
      const restored = HNSW.deserialize(serialized);
      const restoredStats = restored.stats();

      expect(restoredStats.nodeCount).toBe(originalStats.nodeCount);
      expect(restoredStats.totalConnections).toBe(originalStats.totalConnections);
    });
  });

  describe('high-dimensional vectors', () => {
    it('should handle 384-dimensional vectors (like embeddings)', () => {
      const dim = 384;

      // Generate random vectors
      for (let i = 0; i < 50; i++) {
        const vec = Array.from({ length: dim }, () => Math.random() - 0.5);
        hnsw.insert(vec, { id: i });
      }

      expect(hnsw.nodes.size).toBe(50);

      // Search should return results
      const query = Array.from({ length: dim }, () => Math.random() - 0.5);
      const results = hnsw.search(query, 5);

      expect(results).toHaveLength(5);
      // Results should be sorted by distance
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });
  });

  describe('recall quality', () => {
    it('should have good recall for nearest neighbor', () => {
      const dim = 32;
      const numVectors = 100;
      const vectors = [];

      // Insert random vectors
      for (let i = 0; i < numVectors; i++) {
        const vec = Array.from({ length: dim }, () => Math.random() - 0.5);
        vectors.push(vec);
        hnsw.insert(vec, { id: i });
      }

      // Test recall: for each vector, its nearest neighbor should be itself
      let correctCount = 0;
      for (let i = 0; i < numVectors; i++) {
        const results = hnsw.search(vectors[i], 1);
        if (results[0].value.id === i) {
          correctCount++;
        }
      }

      const recall = correctCount / numVectors;
      expect(recall).toBeGreaterThan(0.95);  // Should find itself most of the time
    });
  });
});
