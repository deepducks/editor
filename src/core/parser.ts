import { Document, parseDocument, LineCounter } from 'yaml';
import type { Workflow } from '../types/workflow';

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  workflow: Workflow | null;
  document: Document | null;
  errors: ParseError[];
}

export function parseWorkflow(yamlString: string): ParseResult {
  const lineCounter = new LineCounter();
  const errors: ParseError[] = [];

  let doc: Document;
  try {
    doc = parseDocument(yamlString, { lineCounter, keepSourceTokens: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'YAML parse error';
    return { workflow: null, document: null, errors: [{ message: msg, line: 1, column: 1, severity: 'error' }] };
  }

  // Collect YAML parsing errors
  for (const err of doc.errors) {
    const pos = err.pos?.[0];
    if (pos != null) {
      const lc = lineCounter.linePos(pos);
      errors.push({ message: err.message, line: lc.line, column: lc.col, severity: 'error' });
    } else {
      errors.push({ message: err.message, line: 1, column: 1, severity: 'error' });
    }
  }

  for (const warn of doc.warnings) {
    const pos = warn.pos?.[0];
    if (pos != null) {
      const lc = lineCounter.linePos(pos);
      errors.push({ message: warn.message, line: lc.line, column: lc.col, severity: 'warning' });
    } else {
      errors.push({ message: warn.message, line: 1, column: 1, severity: 'warning' });
    }
  }

  if (errors.some(e => e.severity === 'error')) {
    return { workflow: null, document: doc, errors };
  }

  const workflow = doc.toJSON() as Workflow;

  if (!workflow || typeof workflow !== 'object') {
    return {
      workflow: null,
      document: doc,
      errors: [{ message: 'Document is not a valid YAML object', line: 1, column: 1, severity: 'error' }],
    };
  }

  if (!workflow.flow) {
    return {
      workflow: null,
      document: doc,
      errors: [{ message: "Missing required field 'flow'", line: 1, column: 1, severity: 'error' }],
    };
  }

  return { workflow, document: doc, errors };
}

/**
 * Resolve YAML source line/column for a JSON pointer path (e.g., "/flow/0/loop").
 * Falls back to line 1 col 1 if path cannot be resolved.
 */
export function resolvePathPosition(
  doc: Document,
  lineCounter: LineCounter,
  jsonPath: string,
): { line: number; column: number } {
  try {
    const parts = jsonPath.replace(/^\//, '').split('/').filter(Boolean);
    let node: any = doc.contents;

    for (const part of parts) {
      if (!node) break;
      if (node.items) {
        // YAML Seq or Map
        const idx = Number(part);
        if (!isNaN(idx) && node.items[idx]) {
          node = node.items[idx]?.value ?? node.items[idx];
        } else {
          // Map key lookup
          const pair = node.items.find(
            (p: any) => p.key?.value === part || p.key === part,
          );
          node = pair?.value ?? null;
        }
      } else {
        break;
      }
    }

    if (node?.range?.[0] != null) {
      const pos = lineCounter.linePos(node.range[0]);
      return { line: pos.line, column: pos.col };
    }
  } catch {
    // fall through
  }
  return { line: 1, column: 1 };
}
