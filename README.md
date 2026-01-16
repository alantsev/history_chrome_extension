# History Chrome Extension

A Chrome extension for semantic search through your browsing history using embeddings and HNSW.

> **Note:** This is a toy project for exploring AI-assisted coding and distributed search concepts.

## Features

- Local history tracking with text embeddings
- Semantic search using HNSW (Hierarchical Navigable Small World)
- 2D visualization of embedding space (planned)

## Roadmap

**Horizon 1** (current): Local semantic search through browsing history with 2D embedding visualization.

**Horizon 2**: Server-side sync with sharded Redis deployment (spatially sharded by embedding coordinates), enabling search across shared user history - essentially a distributed search engine.

**Horizon 3**: Peer-to-peer exchange protocol to decentralize and address bad actor mitigation.

## Tech Stack

- JavaScript / Chrome Extension APIs
- HNSW implementation (Redis-inspired)
- Transformers.js for local embeddings

## License

MIT

