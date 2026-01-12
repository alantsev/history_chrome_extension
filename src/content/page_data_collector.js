
class HtmlToMarkdownConverter {
  static convert(node) {
    let result = '';

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim();
    }

    // Get tag name
    const tag = node.tagName ? node.tagName.toLowerCase() : '';

    // Handle different elements
    switch (tag) {
      case 'h1':
        result += '# ' + HtmlToMarkdownConverter.getInnerText(node) + '\n\n';
        break;
      case 'h2':
        result += '## ' + HtmlToMarkdownConverter.getInnerText(node) + '\n\n';
        break;
      case 'h3':
        result += '### ' + HtmlToMarkdownConverter.getInnerText(node) + '\n\n';
        break;
      case 'p':
        result += HtmlToMarkdownConverter.getInnerText(node) + '\n\n';
        break;
      case 'a':
        result += HtmlToMarkdownConverter.getInnerText(node);
        break;
      case 'strong':
      case 'b':
        result += '**' + HtmlToMarkdownConverter.getInnerText(node) + '**';
        break;
      case 'em':
      case 'i':
        result += '_' + HtmlToMarkdownConverter.getInnerText(node) + '_';
        break;
      case 'img':
        result += '![' + (node.alt || '') + '](' + node.src + ')';
        break;
      case 'script':
        break;
      case 'style':
        break;
      case 'table':
        result += HtmlToMarkdownConverter.handleTable(node) + '\n\n';
        break;
      default:
        // Recursively process child nodes
        for (const child of node.childNodes) {
          result += HtmlToMarkdownConverter.convert(child);
        }
    }

    return result;
  }

  static handleTable(tableNode) {
    let result = '';
    const rows = tableNode.rows;

    if (rows.length === 0) return result;

    // Handle header row
    const headerCells = rows[0].cells;
    result += '| ' + Array.from(headerCells).map(cell => cell.textContent.trim()).join(' | ') + ' |\n';

    // Add separator row
    result += '| ' + Array.from(headerCells).map(() => '---').join(' | ') + ' |\n';

    // Handle data rows
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].cells;
      result += '| ' + Array.from(cells).map(cell => cell.textContent.trim()).join(' | ') + ' |\n';
    }

    return result;
  }

  static getInnerText(node) {
    return node.innerText || node.textContent;
  }
}

class HeadingSkeletonExtractor {
  static extract() {
    const sections = [];

    // Get meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc ? metaDesc.getAttribute('content')?.trim() : '';

    // Find all headings h1-h3
    const headings = document.querySelectorAll('h1, h2, h3');

    for (const heading of headings) {
      const level = parseInt(heading.tagName[1]);
      const text = this.cleanText(heading.innerText || heading.textContent);

      if (!text) continue;

      // Get first meaningful content after this heading
      const context = this.getFollowingContext(heading);

      sections.push({ level, text, context });
    }

    return { description, sections };
  }

  static getFollowingContext(heading) {
    // Walk through siblings to find first meaningful content
    let node = heading.nextElementSibling;
    const maxChars = 200;

    while (node) {
      const tag = node.tagName?.toLowerCase();

      // Stop if we hit another heading
      if (/^h[1-6]$/.test(tag)) break;

      // Skip nav, header, footer, aside elements
      if (['nav', 'header', 'footer', 'aside', 'script', 'style'].includes(tag)) {
        node = node.nextElementSibling;
        continue;
      }

      // Extract text from content elements
      if (['p', 'div', 'span', 'li', 'td', 'article', 'section'].includes(tag)) {
        const text = this.cleanText(node.innerText || node.textContent);
        if (text && text.length > 20) {
          // Return first sentence or truncated text
          return this.getFirstSentence(text, maxChars);
        }
      }

      node = node.nextElementSibling;
    }

    return '';
  }

  static getFirstSentence(text, maxChars) {
    // Try to find first sentence
    const sentenceEnd = text.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < maxChars) {
      return text.substring(0, sentenceEnd + 1).trim();
    }
    // Truncate at word boundary
    if (text.length <= maxChars) return text;
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  static cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  static toMarkdown(title, skeleton) {
    let result = `# ${title}\n\n`;

    if (skeleton.description) {
      result += `${skeleton.description}\n\n`;
    }

    for (const section of skeleton.sections) {
      const prefix = '#'.repeat(Math.min(section.level + 1, 6));
      result += `${prefix} ${section.text}\n`;
      if (section.context) {
        result += `${section.context}\n`;
      }
      result += '\n';
    }

    return result.trim();
  }
}

class PageDataCollector {
  static async collect() {
    const title = document.title;

    // Full markdown extraction (existing approach)
    const markdown = HtmlToMarkdownConverter.convert(document.body);

    // Skeleton extraction (heading-weighted approach)
    const skeleton = HeadingSkeletonExtractor.extract();
    const skeletonMarkdown = HeadingSkeletonExtractor.toMarkdown(title, skeleton);

    return {
      url: window.location.href,
      title: title,
      timestamp: new Date().toISOString(),
      markdown: markdown,
      skeletonMarkdown: skeletonMarkdown
    };
  }
}

export { PageDataCollector };




