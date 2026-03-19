import { useState, useEffect, useMemo, createContext, useContext } from 'react';
import type { Workflow } from '../types/workflow';
import type { ParseError } from '../core/parser';
import type { NodeMetadata } from '../core/mermaid-generator';
import { parseWorkflow } from '../core/parser';
import { validateWorkflow } from '../core/validator';
import { generateMermaid } from '../core/mermaid-generator';
import { useDebounce } from './useDebounce';

export interface WorkflowState {
  yamlContent: string;
  setYamlContent: (yaml: string) => void;
  parsedWorkflow: Workflow | null;
  diagnostics: ParseError[];
  mermaidCode: string;
  nodeMap: Map<string, NodeMetadata>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  isValid: boolean;
  isParsing: boolean;
}

export const WorkflowContext = createContext<WorkflowState | null>(null);

export function useWorkflowProvider(initialYaml: string): WorkflowState {
  const [yamlContent, setYamlContent] = useState(initialYaml);
  const [parsedWorkflow, setParsedWorkflow] = useState<Workflow | null>(null);
  const [diagnostics, setDiagnostics] = useState<ParseError[]>([]);
  const [mermaidCode, setMermaidCode] = useState('');
  const [nodeMap, setNodeMap] = useState<Map<string, NodeMetadata>>(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const debouncedYaml = useDebounce(yamlContent, 800);

  useEffect(() => {
    if (debouncedYaml !== yamlContent) {
      setIsParsing(true);
    }
  }, [yamlContent]);

  useEffect(() => {
    setIsParsing(false);

    if (!debouncedYaml.trim()) {
      setParsedWorkflow(null);
      setDiagnostics([]);
      setMermaidCode('');
      setNodeMap(new Map());
      return;
    }

    // 1. Parse
    const parseResult = parseWorkflow(debouncedYaml);
    const allErrors: ParseError[] = [...parseResult.errors];

    if (!parseResult.workflow || !parseResult.document) {
      setParsedWorkflow(null);
      setDiagnostics(allErrors);
      setMermaidCode('');
      setNodeMap(new Map());
      return;
    }

    // 2. Validate
    const validationErrors = validateWorkflow(debouncedYaml, parseResult.document, parseResult.workflow);
    allErrors.push(...validationErrors);

    setParsedWorkflow(parseResult.workflow);
    setDiagnostics(allErrors);

    // 3. Generate Mermaid (even with warnings, generate if we have a workflow)
    const hasErrors = allErrors.some(e => e.severity === 'error');
    if (!hasErrors) {
      try {
        const mermaidResult = generateMermaid(parseResult.workflow);
        setMermaidCode(mermaidResult.code);
        setNodeMap(mermaidResult.nodeMap);
      } catch {
        setMermaidCode('');
        setNodeMap(new Map());
      }
    } else {
      // Still try to generate if parse succeeded
      try {
        const mermaidResult = generateMermaid(parseResult.workflow);
        setMermaidCode(mermaidResult.code);
        setNodeMap(mermaidResult.nodeMap);
      } catch {
        setMermaidCode('');
        setNodeMap(new Map());
      }
    }
  }, [debouncedYaml]);

  const isValid = useMemo(
    () => diagnostics.length === 0 && parsedWorkflow !== null,
    [diagnostics, parsedWorkflow],
  );

  return {
    yamlContent,
    setYamlContent,
    parsedWorkflow,
    diagnostics,
    mermaidCode,
    nodeMap,
    selectedNodeId,
    setSelectedNodeId,
    isValid,
    isParsing,
  };
}

export function useWorkflow(): WorkflowState {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowContext');
  return ctx;
}
