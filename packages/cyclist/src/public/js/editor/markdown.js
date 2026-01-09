/**
 * Markdown Serialization Module
 * Converts TipTap JSON documents to Markdown
 */

/**
 * Serialize TipTap marks (bold, italic, code) to markdown
 * @param {string} text - The text content
 * @param {Array} marks - Array of mark objects
 * @returns {string} Text with markdown formatting
 */
function serializeMarks(text, marks = []) {
  if (!marks || marks.length === 0) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'link':
        result = `[${result}](${mark.attrs?.href || ''})`;
        break;
    }
  }
  return result;
}

/**
 * Serialize a single TipTap node to markdown
 * @param {Object} node - TipTap node object
 * @param {number} depth - Nesting depth for lists
 * @param {number} [listIndex] - Index for ordered list items
 * @returns {string} Markdown string
 */
function serializeNode(node, depth = 0, listIndex = undefined) {
  if (!node) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map(n => serializeNode(n, depth)).join('\n\n');

    case 'paragraph':
      return (node.content || []).map(n => serializeNode(n, depth)).join('');

    case 'text':
      return serializeMarks(node.text || '', node.marks);

    case 'hardBreak':
      return '\n';

    case 'heading': {
      const level = node.attrs?.level || 1;
      const prefix = '#'.repeat(level) + ' ';
      const content = (node.content || []).map(n => serializeNode(n, depth)).join('');
      return prefix + content;
    }

    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const content = (node.content || []).map(n => n.text || '').join('');
      return '```' + lang + '\n' + content + '\n```';
    }

    case 'blockquote': {
      const content = (node.content || []).map(n => serializeNode(n, depth)).join('\n\n');
      return content.split('\n').map(line => '> ' + line).join('\n');
    }

    case 'bulletList':
      return (node.content || []).map(n => serializeNode(n, depth)).join('\n');

    case 'orderedList':
      return (node.content || []).map((n, i) => serializeNode(n, depth, i + 1)).join('\n');

    case 'listItem': {
      const indent = '  '.repeat(depth);
      const prefix = typeof listIndex === 'number' ? `${listIndex}. ` : '- ';
      const content = (node.content || []).map(n => serializeNode(n, depth + 1)).join('\n');
      return indent + prefix + content;
    }

    case 'horizontalRule':
      return '---';

    default:
      // Unknown node type - try to extract content
      if (node.content) {
        return (node.content || []).map(n => serializeNode(n, depth)).join('');
      }
      return node.text || '';
  }
}

/**
 * Convert TipTap JSON document to markdown
 * @param {Object} doc - TipTap document JSON
 * @returns {string} Markdown string
 */
export function jsonToMarkdown(doc) {
  if (!doc) return '';
  return serializeNode(doc).trim();
}
