import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// We need to set up the DOM before importing the module
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://test.example.com/page'
});
global.document = dom.window.document;
global.window = dom.window;
global.Node = dom.window.Node;

// Dynamic import after DOM setup
const { PageDataCollector } = await import('./page_data_collector.js');

// Helper to create DOM elements
function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

describe('HtmlToMarkdownConverter', () => {
  describe('header conversion', () => {
    it('should convert h1 to markdown', async () => {
      document.body.innerHTML = '<h1>Main Title</h1>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('# Main Title');
    });

    it('should convert h2 to markdown', async () => {
      document.body.innerHTML = '<h2>Section Title</h2>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('## Section Title');
    });

    it('should convert h3 to markdown', async () => {
      document.body.innerHTML = '<h3>Subsection</h3>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('### Subsection');
    });
  });

  describe('paragraph handling', () => {
    it('should convert paragraphs with spacing', async () => {
      document.body.innerHTML = '<p>First paragraph</p><p>Second paragraph</p>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('First paragraph');
      expect(result.markdown).toContain('Second paragraph');
    });
  });

  describe('text formatting', () => {
    it('should convert strong/bold to markdown', async () => {
      document.body.innerHTML = '<strong>bold text</strong>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('**bold text**');
    });

    it('should convert b tag to markdown', async () => {
      document.body.innerHTML = '<b>bold text</b>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('**bold text**');
    });

    it('should convert em/italic to markdown', async () => {
      document.body.innerHTML = '<em>italic text</em>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('_italic text_');
    });

    it('should convert i tag to markdown', async () => {
      document.body.innerHTML = '<i>italic text</i>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('_italic text_');
    });
  });

  describe('link handling', () => {
    it('should extract link text', async () => {
      document.body.innerHTML = '<p><a href="https://example.com">Click here</a></p>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('Click here');
    });
  });

  describe('image handling', () => {
    it('should convert images to markdown syntax', async () => {
      document.body.innerHTML = '<img src="https://example.com/img.png" alt="Test image">';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('![Test image](https://example.com/img.png)');
    });

    it('should handle images without alt text', async () => {
      document.body.innerHTML = '<img src="https://example.com/img.png">';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('![](https://example.com/img.png)');
    });
  });

  describe('script and style skipping', () => {
    it('should skip script tags', async () => {
      document.body.innerHTML = '<script>alert("test")</script><p>Content</p>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).not.toContain('alert');
      expect(result.markdown).toContain('Content');
    });

    it('should skip style tags', async () => {
      document.body.innerHTML = '<style>.red { color: red; }</style><p>Content</p>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).not.toContain('color');
      expect(result.markdown).toContain('Content');
    });
  });

  describe('table conversion', () => {
    it('should convert simple table to markdown', async () => {
      document.body.innerHTML = `
        <table>
          <tr><th>Header 1</th><th>Header 2</th></tr>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
        </table>
      `;
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('| Header 1 | Header 2 |');
      expect(result.markdown).toContain('| --- | --- |');
      expect(result.markdown).toContain('| Cell 1 | Cell 2 |');
    });

    it('should handle empty tables', async () => {
      document.body.innerHTML = '<table></table><p>After table</p>';
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('After table');
    });
  });
});

describe('PageDataCollector', () => {
  beforeEach(() => {
    document.title = 'Test Page Title';
    document.body.innerHTML = '<h1>Test Content</h1>';
  });

  describe('collect', () => {
    it('should return page data object with all fields', async () => {
      const result = await PageDataCollector.collect();

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('markdown');
    });

    it('should capture the current URL', async () => {
      const result = await PageDataCollector.collect();
      expect(result.url).toBe('https://test.example.com/page');
    });

    it('should capture the document title', async () => {
      const result = await PageDataCollector.collect();
      expect(result.title).toBe('Test Page Title');
    });

    it('should include ISO timestamp', async () => {
      const result = await PageDataCollector.collect();
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include markdown content', async () => {
      const result = await PageDataCollector.collect();
      expect(result.markdown).toContain('# Test Content');
    });
  });
});
