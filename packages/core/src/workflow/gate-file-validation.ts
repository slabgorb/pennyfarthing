/**
 * Gate File Validation — Depth Limit and Cycle Detection
 *
 * Story 107-2: Validates gate file content (XML-like format) for:
 * 1. Maximum nesting depth (3 levels)
 * 2. Cyclic gate name references
 *
 * Gate files use nested <gate name="..."> elements.
 * Depth counted from root (Level 0) to max Level 3.
 * Cycles detected via DFS on gate name adjacency graph.
 */

/**
 * Error detail for gate file validation failures
 */
export interface GateFileValidationError {
  /** Error category: depth limit, cycle, or schema */
  type: 'depth' | 'cycle' | 'schema';
  /** Human-readable error message */
  message: string;
}

/**
 * Result of gate file validation
 */
export interface GateFileValidationResult {
  /** Whether the gate file is valid */
  valid: boolean;
  /** Root gate name (if parseable) */
  gate?: string;
  /** Maximum nesting depth found */
  depth?: number;
  /** Validation errors (only present if invalid) */
  errors?: GateFileValidationError[];
}

const MAX_DEPTH = 3;

// Matches <gate ... name="X" ...> (double or single quotes) and </gate>
const GATE_TAG_REGEX = /<gate\s+[^>]*name=["']([^"']+)["'][^>]*>|<\/gate>/g;

type GateToken = { type: 'open'; name: string } | { type: 'close' };

function parseGateTags(content: string): GateToken[] {
  const tokens: GateToken[] = [];
  const regex = new RegExp(GATE_TAG_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      tokens.push({ type: 'open', name: match[1] });
    } else {
      tokens.push({ type: 'close' });
    }
  }
  return tokens;
}

/**
 * Validate nesting depth of gate elements in a gate file.
 * Max allowed depth is 3 (Level 0 = root, Level 3 = max).
 */
export function validateGateDepth(content: string): GateFileValidationResult {
  const tokens = parseGateTags(content);
  if (tokens.length === 0) {
    return { valid: false, errors: [{ type: 'schema', message: 'No gate elements found' }] };
  }

  const errors: GateFileValidationError[] = [];
  let depth = -1;
  let maxDepth = 0;
  let rootName: string | undefined;

  for (const token of tokens) {
    if (token.type === 'open') {
      depth++;
      if (depth === 0) {
        rootName = token.name;
      }
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      if (depth > MAX_DEPTH) {
        errors.push({
          type: 'depth',
          message: `Gate depth limit exceeded: ${token.name} at depth ${depth} (max ${MAX_DEPTH})`,
        });
      }
    } else {
      depth--;
    }
  }

  return {
    valid: errors.length === 0,
    gate: rootName,
    depth: maxDepth,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Detect cycles in gate name references via DFS.
 * A cycle exists when a gate name appears as both an ancestor
 * and descendant in the nesting hierarchy.
 */
export function detectGateCycles(content: string): GateFileValidationResult {
  const tokens = parseGateTags(content);
  if (tokens.length === 0) {
    return { valid: false, errors: [{ type: 'schema', message: 'No gate elements found' }] };
  }

  const errors: GateFileValidationError[] = [];
  const ancestorStack: string[] = [];
  let rootName: string | undefined;

  for (const token of tokens) {
    if (token.type === 'open') {
      if (ancestorStack.length === 0) {
        rootName = token.name;
      }
      const ancestorIndex = ancestorStack.indexOf(token.name);
      if (ancestorIndex >= 0) {
        const cyclePath = [...ancestorStack.slice(ancestorIndex), token.name];
        errors.push({
          type: 'cycle',
          message: `Cycle detected: ${cyclePath.join(' \u2192 ')}`,
        });
      }
      ancestorStack.push(token.name);
    } else {
      ancestorStack.pop();
    }
  }

  return {
    valid: errors.length === 0,
    gate: rootName,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Full gate file validation — combines depth and cycle checks.
 */
export function validateGateFile(content: string): GateFileValidationResult {
  const tokens = parseGateTags(content);
  if (tokens.length === 0) {
    return { valid: false, errors: [{ type: 'schema', message: 'No gate elements found' }] };
  }

  const errors: GateFileValidationError[] = [];
  const ancestorStack: string[] = [];
  let depth = -1;
  let maxDepth = 0;
  let rootName: string | undefined;

  for (const token of tokens) {
    if (token.type === 'open') {
      depth++;
      if (depth === 0) {
        rootName = token.name;
      }
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      if (depth > MAX_DEPTH) {
        errors.push({
          type: 'depth',
          message: `Gate depth limit exceeded: ${token.name} at depth ${depth} (max ${MAX_DEPTH})`,
        });
      }
      const ancestorIndex = ancestorStack.indexOf(token.name);
      if (ancestorIndex >= 0) {
        const cyclePath = [...ancestorStack.slice(ancestorIndex), token.name];
        errors.push({
          type: 'cycle',
          message: `Cycle detected: ${cyclePath.join(' \u2192 ')}`,
        });
      }
      ancestorStack.push(token.name);
    } else {
      depth--;
      ancestorStack.pop();
    }
  }

  return {
    valid: errors.length === 0,
    gate: rootName,
    depth: maxDepth,
    errors: errors.length > 0 ? errors : undefined,
  };
}
