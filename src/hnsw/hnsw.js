/**
 * HNSW (Hierarchical Navigable Small World) Implementation
 * A JavaScript implementation for approximate nearest neighbor search.
 *
 * Based on the paper by Yu. A. Malkov, D. A. Yashunin.
 * Implementation details follow Redis vector-sets module approach.
 */

const HNSW_DEFAULT_M = 16;      // Max connections per layer
const HNSW_DEFAULT_EF = 200;    // Size of dynamic candidate list during construction
const HNSW_MAX_LEVEL = 16;      // Maximum level a node can reach
const HNSW_P = 0.25;            // Probability of level increase

// Aggressiveness levels for neighbor selection (Redis approach)
const HNSW_AGGRESSIVE_NONE = 0;      // Diversity + quality checks
const HNSW_AGGRESSIVE_NO_DIV = 1;    // Skip diversity check
const HNSW_AGGRESSIVE_REPLACE = 2;   // Can replace existing links

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
 * HNSW Node - with cached worst neighbor tracking (Redis approach)
 */
class HNSWNode {
  constructor(id, vector, level, value = null) {
    this.id = id;
    this.vector = vector;
    this.level = level;
    this.value = value;
    // Connections per layer: layers[i] = Map of node ID -> distance
    this.layers = [];
    // Cached worst neighbor per layer for O(1) lookup
    this.worstNeighbor = [];
    for (let i = 0; i <= level; i++) {
      this.layers.push(new Map());  // neighborId -> distance
      this.worstNeighbor.push({ id: null, distance: -Infinity });
    }
  }

  /**
   * Update worst neighbor cache after adding a neighbor.
   */
  updateWorstOnAdd(layer, neighborId, distance) {
    if (distance > this.worstNeighbor[layer].distance) {
      this.worstNeighbor[layer] = { id: neighborId, distance };
    }
  }

  /**
   * Recompute worst neighbor cache after removal.
   */
  recomputeWorst(layer) {
    let worst = { id: null, distance: -Infinity };
    for (const [id, dist] of this.layers[layer]) {
      if (dist > worst.distance) {
        worst = { id, distance: dist };
      }
    }
    this.worstNeighbor[layer] = worst;
  }

  /**
   * Add a neighbor connection with distance caching.
   */
  addNeighbor(layer, neighborId, distance) {
    this.layers[layer].set(neighborId, distance);
    this.updateWorstOnAdd(layer, neighborId, distance);
  }

  /**
   * Remove a neighbor connection and update cache.
   */
  removeNeighbor(layer, neighborId) {
    const wasWorst = this.worstNeighbor[layer].id === neighborId;
    this.layers[layer].delete(neighborId);
    if (wasWorst) {
      this.recomputeWorst(layer);
    }
  }

  /**
   * Get neighbor IDs for iteration.
   */
  getNeighborIds(layer) {
    return this.layers[layer].keys();
  }

  /**
   * Get neighbor count at layer.
   */
  neighborCount(layer) {
    return this.layers[layer].size;
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
      const neighborIds = current.node.layers[layer] ? current.node.getNeighborIds(layer) : [];
      for (const neighborId of neighborIds) {
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
   * Check diversity: is candidate closer to existing selected neighbors
   * than to the node we're selecting for? (Redis heuristic)
   */
  _checkDiversity(candidateVector, selectedNeighbors, distToNode) {
    for (const sel of selectedNeighbors) {
      const distToSelected = cosineDistance(candidateVector, sel.node.vector);
      if (distToSelected < distToNode) {
        return false;  // Candidate is closer to an already-selected neighbor
      }
    }
    return true;
  }

  /**
   * Select neighbors using Redis-style heuristic with diversity check.
   */
  _selectNeighbors(node, candidates, maxConnections) {
    if (candidates.length <= maxConnections) {
      return candidates;
    }

    const selected = [];
    const remaining = [...candidates];

    // Greedily select neighbors with diversity consideration
    while (selected.length < maxConnections && remaining.length > 0) {
      // Find best candidate that passes diversity check
      let bestIdx = -1;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (this._checkDiversity(candidate.node.vector, selected, candidate.distance)) {
          bestIdx = i;
          break;  // Take first (closest) that passes
        }
      }

      if (bestIdx === -1) {
        // No candidate passes diversity, take closest remaining
        bestIdx = 0;
      }

      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    return selected;
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
      const neighbors = this._selectNeighbors(node, results, this._maxConnections(lc));

      // Connect new node to neighbors using Redis-style multi-level aggressive linking
      for (const { node: neighbor, distance } of neighbors) {
        this._addBidirectionalLink(node, neighbor, lc, distance);
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
   * Add bidirectional link with Redis-style aggressive retries.
   * Ensures links are always bidirectional - if one direction fails, neither is added.
   */
  _addBidirectionalLink(nodeA, nodeB, layer, distance) {
    // Already connected in both directions?
    const aHasB = nodeA.layers[layer].has(nodeB.id);
    const bHasA = nodeB.layers[layer].has(nodeA.id);
    if (aHasB && bHasA) return true;

    // Try to add both directions
    const maxConn = this._maxConnections(layer);
    
    // Check if A can accept B
    let canAddAtoB = aHasB || nodeA.neighborCount(layer) < maxConn;
    if (!canAddAtoB) {
      // Try aggressive: can we replace worst?
      const worstA = nodeA.worstNeighbor[layer];
      canAddAtoB = distance < worstA.distance;
    }

    // Check if B can accept A  
    let canAddBtoA = bHasA || nodeB.neighborCount(layer) < maxConn;
    if (!canAddBtoA) {
      // Try aggressive: can we replace worst?
      const worstB = nodeB.worstNeighbor[layer];
      canAddBtoA = distance < worstB.distance;
    }

    // Only proceed if both directions are possible
    if (!canAddAtoB || !canAddBtoA) return false;

    // Add A -> B
    if (!aHasB) {
      if (nodeA.neighborCount(layer) >= maxConn) {
        // Replace worst
        const worst = nodeA.worstNeighbor[layer];
        const worstNeighbor = this.nodes.get(worst.id);
        if (worstNeighbor) {
          nodeA.removeNeighbor(layer, worst.id);
          worstNeighbor.removeNeighbor(layer, nodeA.id);
        }
      }
      nodeA.addNeighbor(layer, nodeB.id, distance);
    }

    // Add B -> A
    if (!bHasA) {
      if (nodeB.neighborCount(layer) >= maxConn) {
        // Replace worst
        const worst = nodeB.worstNeighbor[layer];
        const worstNeighbor = this.nodes.get(worst.id);
        if (worstNeighbor) {
          nodeB.removeNeighbor(layer, worst.id);
          worstNeighbor.removeNeighbor(layer, nodeB.id);
        }
      }
      nodeB.addNeighbor(layer, nodeA.id, distance);
    }

    return true;
  }

  /**
   * Prune connections to maintain max connections limit.
   * Does NOT remove reverse links (Redis approach preserves bidirectional property).
   */
  _pruneConnections(node, layer) {
    const maxConn = this._maxConnections(layer);
    if (node.neighborCount(layer) <= maxConn) return;

    // Get all neighbors with distances
    const neighbors = [];
    for (const [neighborId, dist] of node.layers[layer]) {
      const neighbor = this.nodes.get(neighborId);
      if (neighbor) {
        neighbors.push({ node: neighbor, id: neighborId, distance: dist });
      }
    }

    // Sort by distance and keep closest (with diversity consideration)
    neighbors.sort((a, b) => a.distance - b.distance);
    const selected = this._selectNeighbors(node, neighbors, maxConn);
    const toKeep = new Set(selected.map(n => n.node.id));

    // Remove connections not in toKeep (maintaining bidirectionality)
    const toRemove = [];
    for (const [neighborId, _] of node.layers[layer]) {
      if (!toKeep.has(neighborId)) {
        toRemove.push(neighborId);
      }
    }
    for (const neighborId of toRemove) {
      node.removeNeighbor(layer, neighborId);
      // Remove reverse link to maintain bidirectionality
      const neighbor = this.nodes.get(neighborId);
      if (neighbor && neighbor.layers[layer]) {
        neighbor.removeNeighbor(layer, node.id);
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
   * Delete a node from the index with reconnection (Redis approach).
   * Reconnects orphaned neighbors to maintain graph connectivity.
   */
  delete(id) {
    const node = this.nodes.get(id);
    if (!node) return false;

    // For each layer, collect neighbors and reconnect them
    for (let lc = 0; lc <= node.level; lc++) {
      const orphanedNeighbors = [];
      
      // Remove connections to this node and collect orphaned neighbors
      for (const [neighborId, _] of node.layers[lc]) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.removeNeighbor(lc, id);
          orphanedNeighbors.push(neighbor);
        }
      }

      // Reconnect orphaned neighbors using scoring matrix (Redis approach)
      if (orphanedNeighbors.length >= 2) {
        this._reconnectNodes(orphanedNeighbors, lc);
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
   * Reconnect orphaned nodes after deletion using a scoring matrix.
   * Pairs nodes that would benefit most from connection (Redis approach).
   */
  _reconnectNodes(nodes, layer) {
    const maxConn = this._maxConnections(layer);
    const n = nodes.length;
    
    // Build scoring matrix: score = how much node i wants to connect to node j
    // Higher score = more slots available AND closer distance
    const scores = [];
    for (let i = 0; i < n; i++) {
      scores[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          scores[i][j] = -Infinity;
          continue;
        }
        
        const nodeI = nodes[i];
        const nodeJ = nodes[j];
        
        // Already connected?
        if (nodeI.layers[layer].has(nodeJ.id)) {
          scores[i][j] = -Infinity;
          continue;
        }
        
        // Calculate score based on available slots and distance
        const slotsAvailable = maxConn - nodeI.neighborCount(layer);
        if (slotsAvailable <= 0) {
          scores[i][j] = -Infinity;
          continue;
        }
        
        const distance = cosineDistance(nodeI.vector, nodeJ.vector);
        // Score: prioritize nodes with more slots and closer distance
        // Using inverse distance so closer = higher score
        scores[i][j] = slotsAvailable * (1 / (distance + 0.001));
      }
    }

    // Greedy pairing: repeatedly find best pair and connect
    const paired = new Set();
    for (let round = 0; round < n; round++) {
      let bestScore = -Infinity;
      let bestI = -1, bestJ = -1;
      
      for (let i = 0; i < n; i++) {
        if (paired.has(i)) continue;
        for (let j = i + 1; j < n; j++) {
          if (paired.has(j)) continue;
          
          // Combined score: both directions
          const combinedScore = scores[i][j] + scores[j][i];
          if (combinedScore > bestScore) {
            bestScore = combinedScore;
            bestI = i;
            bestJ = j;
          }
        }
      }
      
      if (bestI === -1 || bestScore <= 0) break;
      
      // Connect the pair
      const nodeI = nodes[bestI];
      const nodeJ = nodes[bestJ];
      const distance = cosineDistance(nodeI.vector, nodeJ.vector);
      
      if (nodeI.neighborCount(layer) < maxConn) {
        nodeI.addNeighbor(layer, nodeJ.id, distance);
      }
      if (nodeJ.neighborCount(layer) < maxConn) {
        nodeJ.addNeighbor(layer, nodeI.id, distance);
      }
      
      // Update scores (mark as connected)
      scores[bestI][bestJ] = -Infinity;
      scores[bestJ][bestI] = -Infinity;
      
      // Check if nodes are full
      if (nodeI.neighborCount(layer) >= maxConn) paired.add(bestI);
      if (nodeJ.neighborCount(layer) >= maxConn) paired.add(bestJ);
    }
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
        // Serialize Map as array of [id, distance] pairs
        layers: node.layers.map(layer => Array.from(layer.entries()))
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
      // Deserialize layers - handle both old Set format and new Map format
      node.layers = nodeData.layers.map((layer, layerIdx) => {
        const map = new Map();
        for (const entry of layer) {
          if (Array.isArray(entry) && entry.length === 2) {
            // New format: [id, distance]
            map.set(entry[0], entry[1]);
          } else {
            // Old format: just id (need to recompute distance later)
            map.set(entry, 0);  // Distance will be recalculated
          }
        }
        return map;
      });
      // Recompute worst neighbor caches
      node.worstNeighbor = node.layers.map(() => ({ id: null, distance: -Infinity }));
      for (let lc = 0; lc < node.layers.length; lc++) {
        node.recomputeWorst(lc);
      }
      hnsw.nodes.set(node.id, node);
    }

    // Recompute distances if needed (for old format compatibility)
    for (const node of hnsw.nodes.values()) {
      for (let lc = 0; lc < node.layers.length; lc++) {
        for (const [neighborId, dist] of node.layers[lc]) {
          if (dist === 0) {
            const neighbor = hnsw.nodes.get(neighborId);
            if (neighbor) {
              const realDist = cosineDistance(node.vector, neighbor.vector);
              node.layers[lc].set(neighborId, realDist);
            }
          }
        }
        node.recomputeWorst(lc);
      }
    }

    // Set entry point
    if (data.entryPointId !== null) {
      hnsw.entryPoint = hnsw.nodes.get(data.entryPointId);
    }

    return hnsw;
  }
}

export { HNSW, HNSWNode, cosineDistance, normalize };

