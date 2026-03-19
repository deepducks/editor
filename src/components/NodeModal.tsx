import { useEffect, useCallback } from 'react';
import { useWorkflow } from '../hooks/useWorkflow';
import type { NodeMetadata } from '../core/mermaid-generator';

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return (
    <div className="mb-2">
      <span className="text-gray-400 text-xs uppercase tracking-wide">{label}</span>
      {typeof value === 'object' ? (
        <pre className="cel-expr mt-1 text-sm whitespace-pre-wrap">{display}</pre>
      ) : (
        <div className="cel-expr mt-1 text-sm">{display}</div>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded ${color}`}>
      {text}
    </span>
  );
}

function kindBadge(meta: NodeMetadata) {
  switch (meta.kind) {
    case 'participant': return <Badge text={meta.participantType ?? 'participant'} color="bg-blue-900 text-blue-200" />;
    case 'inline': return <Badge text={`${meta.participantType} (inline)`} color="bg-purple-900 text-purple-200" />;
    case 'anonymous': return <Badge text={`${meta.participantType} (anonymous)`} color="bg-gray-700 text-gray-300" />;
    case 'loop': return <Badge text="loop" color="bg-teal-900 text-teal-200" />;
    case 'parallel': return <Badge text="parallel" color="bg-cyan-900 text-cyan-200" />;
    case 'if': return <Badge text="condition" color="bg-yellow-900 text-yellow-200" />;
    case 'wait': return <Badge text="wait" color="bg-indigo-900 text-indigo-200" />;
    case 'emit': return <Badge text="emit" color="bg-orange-900 text-orange-200" />;
    case 'inputs': return <Badge text="inputs" color="bg-green-900 text-green-200" />;
    case 'output': return <Badge text="output" color="bg-green-900 text-green-200" />;
  }
}

function renderContent(meta: NodeMetadata) {
  switch (meta.kind) {
    case 'participant':
    case 'inline':
    case 'anonymous':
      return (
        <>
          <Field label="Type" value={meta.participantType} />
          {meta.when && <Field label="Guard (when)" value={meta.when} />}
          <Field label="Timeout" value={meta.timeout} />
          <Field label="On Error" value={meta.onError} />
          <Field label="Retry" value={meta.retry} />
          <Field label="Input" value={meta.input} />
          <Field label="Run" value={meta.run} />
          <Field label="CWD" value={meta.cwd} />
          <Field label="URL" value={meta.url} />
          <Field label="Method" value={meta.method} />
          <Field label="Headers" value={meta.headers} />
          <Field label="Body" value={meta.body} />
          <Field label="Path" value={meta.path} />
          <Field label="Server" value={meta.server} />
          <Field label="Tool" value={meta.tool} />
          <Field label="Event" value={meta.event} />
          <Field label="Payload" value={meta.payload} />
          <Field label="Ack" value={meta.ack} />
        </>
      );

    case 'loop':
      return (
        <>
          <Field label="Until" value={meta.until} />
          <Field label="Max" value={meta.max} />
          <Field label="As" value={meta.as} />
          <Field label="Steps" value={meta.loopSteps} />
        </>
      );

    case 'parallel':
      return <p className="text-gray-400 text-sm">Parallel execution block</p>;

    case 'if':
      return (
        <>
          <Field label="Condition" value={meta.condition} />
          <Field label="Then" value={meta.thenSteps} />
          <Field label="Else" value={meta.elseSteps} />
        </>
      );

    case 'wait':
      return (
        <>
          <Field label="Event" value={meta.waitEvent} />
          <Field label="Match" value={meta.match} />
          <Field label="Until" value={meta.waitUntil} />
          <Field label="Poll" value={meta.poll} />
          <Field label="Timeout" value={meta.waitTimeout} />
          <Field label="On Timeout" value={meta.onTimeout} />
        </>
      );

    case 'emit':
      return (
        <>
          <Field label="Event" value={meta.event} />
          <Field label="Payload" value={meta.payload} />
          <Field label="Ack" value={meta.ack} />
        </>
      );

    case 'inputs':
      return <Field label="Input Schema" value={meta.inputSchema} />;

    case 'output':
      return <Field label="Output Mapping" value={meta.outputMapping} />;
  }
}

export default function NodeModal() {
  const { selectedNodeId, setSelectedNodeId, nodeMap } = useWorkflow();

  const close = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  if (!selectedNodeId) return null;

  const meta = nodeMap.get(selectedNodeId);
  if (!meta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="bg-panel border border-panel-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-panel-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{meta.label}</h2>
            {kindBadge(meta)}
          </div>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-200 text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          {renderContent(meta)}
        </div>
      </div>
    </div>
  );
}
