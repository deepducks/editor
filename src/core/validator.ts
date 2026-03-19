import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { Document, LineCounter, parseDocument } from 'yaml';
import schema from '../schema/duckflux.schema.json';
import type { ParseError } from './parser';
import type { Workflow } from '../types/workflow';

// --- JSON Schema validation ---

const schemaCopy = { ...schema } as Record<string, unknown>;
delete schemaCopy.$schema;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile(schemaCopy);

// --- Semantic constants ---

const RESERVED_NAMES = new Set([
  'workflow', 'execution', 'input', 'output', 'env', 'loop', 'event',
]);
const BUILTIN_ONERROR = new Set(['fail', 'skip', 'retry']);

// --- Helpers ---

function isInlineParticipant(step: unknown): step is Record<string, unknown> & { type: string } {
  return typeof step === 'object' && step !== null && 'type' in step;
}

function isWaitStep(step: unknown): step is { wait: Record<string, unknown> } {
  return typeof step === 'object' && step !== null && 'wait' in step && Object.keys(step as object).length === 1;
}

function collectParticipantReferences(
  flow: unknown[],
  refs: Array<{ name: string; path: string }>,
  inlineNames: Array<{ name: string; path: string }>,
  basePath = 'flow',
): void {
  for (const [index, step] of flow.entries()) {
    const stepPath = `${basePath}[${index}]`;

    if (typeof step === 'string') {
      refs.push({ name: step, path: stepPath });
      continue;
    }

    if (!step || typeof step !== 'object') continue;

    if (isInlineParticipant(step)) {
      if (step.as && typeof step.as === 'string') {
        inlineNames.push({ name: step.as, path: stepPath });
      }
      continue;
    }

    if (isWaitStep(step)) continue;

    const obj = step as Record<string, unknown>;

    if (obj.parallel) {
      collectParticipantReferences(obj.parallel as unknown[], refs, inlineNames, `${stepPath}.parallel`);
      continue;
    }

    if (obj.loop) {
      const loopDef = obj.loop as Record<string, unknown>;
      collectParticipantReferences(
        (loopDef.steps ?? []) as unknown[],
        refs,
        inlineNames,
        `${stepPath}.loop.steps`,
      );
      continue;
    }

    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      collectParticipantReferences((ifDef.then ?? []) as unknown[], refs, inlineNames, `${stepPath}.if.then`);
      if (ifDef.else) {
        collectParticipantReferences(ifDef.else as unknown[], refs, inlineNames, `${stepPath}.if.else`);
      }
      continue;
    }

    // Participant override
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      refs.push({ name: keys[0], path: `${stepPath}.${keys[0]}` });
    }
  }
}

function validateLoopConstraints(flow: unknown[], errors: ParseError[], lineCounter: LineCounter, doc: Document, basePath = 'flow'): void {
  for (const [index, step] of flow.entries()) {
    if (!step || typeof step !== 'object') continue;
    const obj = step as Record<string, unknown>;

    if (obj.loop) {
      const loopDef = obj.loop as Record<string, unknown>;
      if (loopDef.until == null && loopDef.max == null) {
        errors.push({ message: "loop must define at least one of 'until' or 'max'", line: 1, column: 1, severity: 'error' });
      }
      if (loopDef.as && typeof loopDef.as === 'string' && RESERVED_NAMES.has(loopDef.as)) {
        errors.push({ message: `loop.as '${loopDef.as}' conflicts with reserved name`, line: 1, column: 1, severity: 'error' });
      }
      validateLoopConstraints((loopDef.steps ?? []) as unknown[], errors, lineCounter, doc, `${basePath}[${index}].loop.steps`);
    }
    if (obj.parallel) {
      validateLoopConstraints(obj.parallel as unknown[], errors, lineCounter, doc, `${basePath}[${index}].parallel`);
    }
    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      validateLoopConstraints((ifDef.then ?? []) as unknown[], errors, lineCounter, doc, `${basePath}[${index}].if.then`);
      if (ifDef.else) validateLoopConstraints(ifDef.else as unknown[], errors, lineCounter, doc, `${basePath}[${index}].if.else`);
    }
  }
}

function validateWaitSteps(flow: unknown[], errors: ParseError[], basePath = 'flow'): void {
  for (const [index, step] of flow.entries()) {
    if (!step || typeof step !== 'object') continue;

    if (isWaitStep(step)) {
      const waitDef = (step as { wait: Record<string, unknown> }).wait;
      const hasEvent = !!waitDef.event;
      const hasUntil = !!waitDef.until;

      if (hasEvent && hasUntil) {
        errors.push({ message: "wait step cannot have both 'event' and 'until'", line: 1, column: 1, severity: 'error' });
      }
      if (waitDef.match && !hasEvent) {
        errors.push({ message: 'wait.match requires wait.event', line: 1, column: 1, severity: 'error' });
      }
      if (waitDef.poll && !hasUntil) {
        errors.push({ message: 'wait.poll requires wait.until', line: 1, column: 1, severity: 'error' });
      }
      continue;
    }

    const obj = step as Record<string, unknown>;
    if (obj.loop) validateWaitSteps(((obj.loop as Record<string, unknown>).steps ?? []) as unknown[], errors, `${basePath}[${index}].loop.steps`);
    if (obj.parallel) validateWaitSteps(obj.parallel as unknown[], errors, `${basePath}[${index}].parallel`);
    if (obj.if) {
      const ifDef = obj.if as Record<string, unknown>;
      validateWaitSteps((ifDef.then ?? []) as unknown[], errors, `${basePath}[${index}].if.then`);
      if (ifDef.else) validateWaitSteps(ifDef.else as unknown[], errors, `${basePath}[${index}].if.else`);
    }
  }
}

function validateEmitParticipants(
  participants: Record<string, { type: string; event?: string }>,
  errors: ParseError[],
): void {
  for (const [name, p] of Object.entries(participants)) {
    if (p.type === 'emit' && !p.event) {
      errors.push({ message: `emit participant '${name}' requires 'event' field`, line: 1, column: 1, severity: 'error' });
    }
  }
}

// --- Public API ---

export function validateWorkflow(
  yamlString: string,
  parsedDoc: Document,
  workflow: Workflow,
): ParseError[] {
  const errors: ParseError[] = [];

  // 1. JSON Schema validation
  const rawObj = parsedDoc.toJSON();
  const valid = validateFn(rawObj);
  if (!valid) {
    for (const err of validateFn.errors ?? []) {
      const lineCounter = new LineCounter();
      const doc = parseDocument(yamlString, { lineCounter });
      let line = 1;
      let column = 1;

      // Try to map instancePath to source position
      if (err.instancePath) {
        try {
          const parts = err.instancePath.split('/').filter(Boolean);
          let node: any = doc.contents;
          for (const part of parts) {
            if (!node) break;
            if (node.items) {
              const idx = Number(part);
              if (!isNaN(idx) && node.items[idx]) {
                node = node.items[idx]?.value ?? node.items[idx];
              } else {
                const pair = node.items.find((p: any) => p.key?.value === part);
                node = pair?.value ?? null;
              }
            } else break;
          }
          if (node?.range?.[0] != null) {
            const pos = lineCounter.linePos(node.range[0]);
            line = pos.line;
            column = pos.col;
          }
        } catch { /* use defaults */ }
      }

      const path = err.instancePath || '/';
      const keyword = err.keyword ?? '';
      const msg = err.message ?? 'schema validation error';
      errors.push({
        message: `${path}: ${msg}${keyword ? ` (${keyword})` : ''}`,
        line,
        column,
        severity: 'error',
      });
    }
  }

  // 2. Semantic validation
  const participants = workflow.participants ?? {};
  const participantNames = new Set(Object.keys(participants));

  // Reserved names
  for (const name of participantNames) {
    if (RESERVED_NAMES.has(name)) {
      errors.push({ message: `participant name '${name}' is reserved`, line: 1, column: 1, severity: 'error' });
    }
  }

  // Collect references
  const refs: Array<{ name: string; path: string }> = [];
  const inlineNames: Array<{ name: string; path: string }> = [];
  collectParticipantReferences(workflow.flow ?? [], refs, inlineNames);

  // Validate participant references
  for (const ref of refs) {
    if (!participantNames.has(ref.name)) {
      errors.push({ message: `participant '${ref.name}' does not exist`, line: 1, column: 1, severity: 'error' });
    }
  }

  // Validate inline as uniqueness
  const seenInlineNames = new Set<string>();
  for (const inline of inlineNames) {
    if (participantNames.has(inline.name)) {
      errors.push({ message: `inline 'as: ${inline.name}' conflicts with top-level participant`, line: 1, column: 1, severity: 'error' });
    }
    if (RESERVED_NAMES.has(inline.name)) {
      errors.push({ message: `inline 'as: ${inline.name}' uses a reserved name`, line: 1, column: 1, severity: 'error' });
    }
    if (seenInlineNames.has(inline.name)) {
      errors.push({ message: `inline 'as: ${inline.name}' is not unique`, line: 1, column: 1, severity: 'error' });
    }
    seenInlineNames.add(inline.name);
  }

  // onError references
  const defaultsOnError = workflow.defaults?.onError;
  if (defaultsOnError && !BUILTIN_ONERROR.has(defaultsOnError) && !participantNames.has(defaultsOnError)) {
    errors.push({ message: `onError '${defaultsOnError}' does not reference an existing participant`, line: 1, column: 1, severity: 'error' });
  }
  for (const [name, participant] of Object.entries(participants)) {
    if (participant.onError && !BUILTIN_ONERROR.has(participant.onError) && !participantNames.has(participant.onError)) {
      errors.push({ message: `participant '${name}' onError '${participant.onError}' does not exist`, line: 1, column: 1, severity: 'error' });
    }
  }

  // Emit participants
  validateEmitParticipants(participants as Record<string, { type: string; event?: string }>, errors);

  // Loop constraints
  const lineCounter = new LineCounter();
  const reparsedDoc = parseDocument(yamlString, { lineCounter });
  validateLoopConstraints(workflow.flow ?? [], errors, lineCounter, reparsedDoc);

  // Wait steps
  validateWaitSteps(workflow.flow ?? [], errors);

  return errors;
}
