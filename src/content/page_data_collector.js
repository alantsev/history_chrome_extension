
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

class PageDataCollector {
  static async collect() {

    const markdown = HtmlToMarkdownConverter.convert(document.body);

    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      markdown: markdown
    };
  }
}

export { PageDataCollector };




