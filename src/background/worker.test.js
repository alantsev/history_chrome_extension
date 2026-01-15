import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.runtime API before any imports
const mockAddListener = vi.fn();
global.chrome = {
  runtime: {
    getURL: vi.fn(path => `chrome-extension://test-id/${path}`),
    onMessage: {
      addListener: mockAddListener
    }
  }
};

// Mock the transformers module
const mockPipeline = vi.fn().mockResolvedValue({
  data: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])
});

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(() => Promise.resolve(mockPipeline)),
  env: {
    useBrowserCache: true,
    allowRemoteModels: true,
    localModelPath: '',
    backends: {
      onnx: {
        wasm: {
          numThreads: 1
        }
      }
    }
  }
}));

// Mock the database
const mockSavePage = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/database.js', () => ({
  PageDatabase: class {
    init() { return Promise.resolve({}); }
    savePage(data) { return mockSavePage(data); }
    getAllPages() { return Promise.resolve([]); }
    iterate(cb) { return Promise.resolve(); }
    loadHNSWIndex() { return Promise.resolve(null); }
    saveHNSWIndex(data) { return Promise.resolve(); }
    getPageByUrl(url) { return Promise.resolve(null); }
  }
}));

describe('BackgroundWorker', () => {
  let messageHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAddListener.mockReset();

    // Capture the message listener
    mockAddListener.mockImplementation((handler) => {
      messageHandler = handler;
    });

    // Reset modules to re-run worker initialization
    vi.resetModules();

    // Re-setup global chrome mock after resetModules
    global.chrome = {
      runtime: {
        getURL: vi.fn(path => `chrome-extension://test-id/${path}`),
        onMessage: {
          addListener: mockAddListener
        }
      }
    };

    // Import the worker module to trigger initialization
    await import('./worker.js');
  });

  it('should register message listener on construction', () => {
    expect(mockAddListener).toHaveBeenCalled();
    expect(messageHandler).toBeDefined();
  });

  describe('PAGE_VISITED message handling', () => {
    it('should handle PAGE_VISITED message and return true for async', async () => {
      const sendResponse = vi.fn();
      const pageData = {
        url: 'https://example.com',
        title: 'Test Page',
        timestamp: '2024-01-15T12:00:00.000Z',
        markdown: 'Test content'
      };

      const result = messageHandler(
        { type: 'PAGE_VISITED', data: pageData },
        {},
        sendResponse
      );

      expect(result).toBe(true);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalled();
      }, { timeout: 1000 });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });
  });

  describe('GENERATE_EMBEDDINGS message handling', () => {
    it('should handle GENERATE_EMBEDDINGS message', async () => {
      const sendResponse = vi.fn();

      const result = messageHandler(
        { type: 'GENERATE_EMBEDDINGS', data: { text: 'test query' } },
        {},
        sendResponse
      );

      expect(result).toBe(true);

      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalled();
      }, { timeout: 1000 });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          embeddings: expect.any(Array)
        })
      );
    });
  });

  describe('unknown message handling', () => {
    it('should not respond to unknown message types', () => {
      const sendResponse = vi.fn();

      const result = messageHandler(
        { type: 'UNKNOWN_TYPE', data: {} },
        {},
        sendResponse
      );

      expect(result).toBeFalsy();
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});

describe('EmbeddingsGenerator', () => {
  it('should generate embeddings as an array', async () => {
    let capturedHandler;
    mockAddListener.mockImplementation((handler) => {
      capturedHandler = handler;
    });

    vi.resetModules();
    global.chrome = {
      runtime: {
        getURL: vi.fn(path => `chrome-extension://test-id/${path}`),
        onMessage: { addListener: mockAddListener }
      }
    };

    await import('./worker.js');

    const sendResponse = vi.fn();
    capturedHandler(
      { type: 'GENERATE_EMBEDDINGS', data: { text: 'hello world' } },
      {},
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    }, { timeout: 1000 });

    const response = sendResponse.mock.calls[0][0];
    expect(response.status).toBe('success');
    expect(Array.isArray(response.embeddings)).toBe(true);
    expect(response.embeddings.length).toBeGreaterThan(0);
  });
});
