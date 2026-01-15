/**
 * HNSW (Hierarchical Navigable Small World) Implementation
 * A simple JavaScript implementation for approximate nearest neighbor search.
 *
 * Based on the paper by Yu. A. Malkov, D. A. Yashunin.
 */

const HNSW_DEFAULT_M = 16;      // Max connections per layer
const HNSW_DEFAULT_EF = 200;    // Size of dynamic candidate list during construction
const HNSW_MAX_LEVEL = 16;      // Maximum level a node can reach
const HNSW_P = 0.25;            // Probability of level increase

/**
 * Calculate cosine distance between two vectors.
 * Assumes vectors are normalized (distance = 1 - dot_product).
 */
function cosineDistance(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return 1 - dot;
}

/**
 * Normalize a vector in place.
 */
function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }
  return vec;
}

/**
 * Simple priority queue (min-heap by distance).
 */
class PriorityQueue {
  constructor() {
    this.items = [];
  }

  push(node, distance) {
    this.items.push({ node, distance });
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const result = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._bubbleDown(0);
    }
    return result;
  }

  peek() {
    return this.items[0] || null;
  }

  get size() {
    return this.items.length;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.items[parent].distance <= this.items[idx].distance) break;
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }

  _bubbleDown(idx) {
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let smallest = idx;

      if (left < this.items.length && this.items[left].distance < this.items[smallest].distance) {
        smallest = left;
      }
      if (right < this.items.length && this.items[right].distance < this.items[smallest].distance) {
        smallest = right;
      }
      if (smallest === idx) break;

      [this.items[smallest], this.items[idx]] = [this.items[idx], this.items[smallest]];
      idx = smallest;
    }
  }
}

/**
 * Max priority queue (for keeping worst candidates).
 */
class MaxPriorityQueue extends PriorityQueue {
  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.items[parent].distance >= this.items[idx].distance) break;
      [this.items[parent], this.items[idx]] = [this.items[idx], this.items[parent]];
      idx = parent;
    }
  }

  _bubbleDown(idx) {
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let largest = idx;

      if (left < this.items.length && this.items[left].distance > this.items[largest].distance) {
        largest = left;
      }
      if (right < this.items.length && this.items[right].distance > this.items[largest].distance) {
        largest = right;
      }
      if (largest === idx) break;

      [this.items[largest], this.items[idx]] = [this.items[idx], this.items[largest]];
      idx = largest;
    }
  }
}

/**
 * HNSW Node
 */
class HNSWNode {
  constructor(id, vector, level, value = null) {
    this.id = id;
    this.vector = vector;
    this.level = level;
    this.value = value;
    // Connections per layer: layers[i] = Set of node IDs
    this.layers = [];
    for (let i = 0; i <= level; i++) {
      this.layers.push(new Set());
    }
  }
}

/**
 * HNSW Index
 */
class HNSW {
  constructor(options = {}) {
    this.M = options.M || HNSW_DEFAULT_M;
    this.efConstruction = options.efConstruction || HNSW_DEFAULT_EF;
    this.nodes = new Map();  // id -> HNSWNode
    this.entryPoint = null;
    this.maxLevel = 0;
    this.nextId = 0;
  }

  /**
   * Generate random level for a new node.
   */
  _randomLevel() {
    let level = 0;
    while (Math.random() < HNSW_P && level < HNSW_MAX_LEVEL) {
      level++;
    }
    return level;
  }

  /**
   * Get max connections for a layer.
   */
  _maxConnections(layer) {
    return layer === 0 ? this.M * 2 : this.M;
  }

  /**
   * Search a single layer for nearest neighbors.
   */
  _searchLayer(query, entryPoints, ef, layer) {
    const visited = new Set();
    const candidates = new PriorityQueue();      // Min queue - best candidates
    const results = new MaxPriorityQueue();      // Max queue - worst at top

    // Initialize with entry points
    for (const ep of entryPoints) {
      const dist = cosineDistance(query, ep.vector);
      candidates.push(ep, dist);
      results.push(ep, dist);
      visited.add(ep.id);
    }

    while (candidates.size > 0) {
      const current = candidates.pop();
      const furthestResult = results.peek();

      // If current is further than the worst result, we're done
      if (current.distance > furthestResult.distance) {
        break;
      }

      // Explore neighbors at this layer
      const neighbors = current.node.layers[layer] || new Set();
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const dist = cosineDistance(query, neighbor.vector);
        const furthest = results.peek();

        if (results.size < ef || dist < furthest.distance) {
          candidates.push(neighbor, dist);
          results.push(neighbor, dist);

          if (results.size > ef) {
            results.pop();
          }
        }
      }
    }

    // Convert results to sorted array
    const sorted = [];
    while (results.size > 0) {
      sorted.push(results.pop());
    }
    return sorted.reverse();  // Nearest first
  }

  /**
   * Select neighbors using simple heuristic.
   */
  _selectNeighbors(candidates, maxConnections) {
    // Simple strategy: take the closest ones
    return candidates.slice(0, maxConnections);
  }

  /**
   * Insert a vector into the index.
   */
  insert(vector, value = null) {
    // Normalize the vector
    const normalizedVector = normalize([...vector]);
    const level = this._randomLevel();
    const id = this.nextId++;
    const node = new HNSWNode(id, normalizedVector, level, value);

    this.nodes.set(id, node);

    // First node becomes entry point
    if (!this.entryPoint) {
      this.entryPoint = node;
      this.maxLevel = level;
      return node;
    }

    let currentNode = this.entryPoint;

    // Descend from top to node's level + 1, finding closest node
    for (let lc = this.maxLevel; lc > level; lc--) {
      const results = this._searchLayer(normalizedVector, [currentNode], 1, lc);
      if (results.length > 0) {
        currentNode = results[0].node;
      }
    }

    // For each layer from min(level, maxLevel) down to 0
    for (let lc = Math.min(level, this.maxLevel); lc >= 0; lc--) {
      const results = this._searchLayer(normalizedVector, [currentNode], this.efConstruction, lc);
      const neighbors = this._selectNeighbors(results, this._maxConnections(lc));

      // Connect new node to neighbors
      for (const { node: neighbor } of neighbors) {
        node.layers[lc].add(neighbor.id);
        neighbor.layers[lc].add(node.id);

        // Prune neighbor's connections if needed
        if (neighbor.layers[lc].size > this._maxConnections(lc)) {
          this._pruneConnections(neighbor, lc);
        }
      }

      if (results.length > 0) {
        currentNode = results[0].node;
      }
    }

    // Update entry point if new node has higher level
    if (level > this.maxLevel) {
      this.entryPoint = node;
      this.maxLevel = level;
    }

    return node;
  }

  /**
   * Prune connections to maintain max connections limit.
   */
  _pruneConnections(node, layer) {
    const maxConn = this._maxConnections(layer);
    if (node.layers[layer].size <= maxConn) return;

    // Get all neighbors with distances
    const neighbors = [];
    for (const neighborId of node.layers[layer]) {
      const neighbor = this.nodes.get(neighborId);
      if (neighbor) {
        neighbors.push({
          node: neighbor,
          distance: cosineDistance(node.vector, neighbor.vector)
        });
      }
    }

    // Sort by distance and keep closest
    neighbors.sort((a, b) => a.distance - b.distance);
    const toKeep = new Set(neighbors.slice(0, maxConn).map(n => n.node.id));

    // Remove connections not in toKeep
    for (const neighborId of node.layers[layer]) {
      if (!toKeep.has(neighborId)) {
        node.layers[layer].delete(neighborId);
        // Remove reverse connection
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.layers[layer].delete(node.id);
        }
      }
    }
  }

  /**
   * Search for k nearest neighbors.
   */
  search(query, k = 10, ef = null) {
    if (!this.entryPoint) return [];

    ef = ef || Math.max(k, this.efConstruction);
    const normalizedQuery = normalize([...query]);

    let currentNode = this.entryPoint;

    // Descend from top to layer 1
    for (let lc = this.maxLevel; lc > 0; lc--) {
      const results = this._searchLayer(normalizedQuery, [currentNode], 1, lc);
      if (results.length > 0) {
        currentNode = results[0].node;
      }
    }

    // Search layer 0 with ef candidates
    const results = this._searchLayer(normalizedQuery, [currentNode], ef, 0);

    // Return top k
    return results.slice(0, k).map(r => ({
      id: r.node.id,
      distance: r.distance,
      value: r.node.value
    }));
  }

  /**
   * Delete a node from the index.
   */
  delete(id) {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove all connections
    for (let lc = 0; lc <= node.level; lc++) {
      for (const neighborId of node.layers[lc]) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.layers[lc].delete(id);
        }
      }
    }

    this.nodes.delete(id);

    // Update entry point if needed
    if (this.entryPoint && this.entryPoint.id === id) {
      if (this.nodes.size > 0) {
        // Find new entry point (node with highest level)
        let maxLevel = -1;
        for (const n of this.nodes.values()) {
          if (n.level > maxLevel) {
            maxLevel = n.level;
            this.entryPoint = n;
          }
        }
        this.maxLevel = maxLevel;
      } else {
        this.entryPoint = null;
        this.maxLevel = 0;
      }
    }

    return true;
  }

  /**
   * Get index stats.
   */
  stats() {
    let totalConnections = 0;
    for (const node of this.nodes.values()) {
      for (const layer of node.layers) {
        totalConnections += layer.size;
      }
    }

    return {
      nodeCount: this.nodes.size,
      maxLevel: this.maxLevel,
      totalConnections: totalConnections / 2,  // Bidirectional
      M: this.M,
      efConstruction: this.efConstruction
    };
  }

  /**
   * Serialize the index to a plain object.
   */
  serialize() {
    const nodes = [];
    for (const node of this.nodes.values()) {
      nodes.push({
        id: node.id,
        vector: Array.from(node.vector),
        level: node.level,
        value: node.value,
        layers: node.layers.map(layer => Array.from(layer))
      });
    }

    return {
      M: this.M,
      efConstruction: this.efConstruction,
      maxLevel: this.maxLevel,
      nextId: this.nextId,
      entryPointId: this.entryPoint ? this.entryPoint.id : null,
      nodes
    };
  }

  /**
   * Deserialize an index from a plain object.
   */
  static deserialize(data) {
    const hnsw = new HNSW({
      M: data.M,
      efConstruction: data.efConstruction
    });

    hnsw.maxLevel = data.maxLevel;
    hnsw.nextId = data.nextId;

    // Reconstruct nodes
    for (const nodeData of data.nodes) {
      const node = new HNSWNode(
        nodeData.id,
        nodeData.vector,
        nodeData.level,
        nodeData.value
      );
      node.layers = nodeData.layers.map(layer => new Set(layer));
      hnsw.nodes.set(node.id, node);
    }

    // Set entry point
    if (data.entryPointId !== null) {
      hnsw.entryPoint = hnsw.nodes.get(data.entryPointId);
    }

    return hnsw;
  }
}

export { HNSW, HNSWNode, cosineDistance, normalize };
