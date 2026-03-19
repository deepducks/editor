import { useState, useRef, useCallback, useEffect } from 'react';
import { WorkflowContext, useWorkflowProvider } from './hooks/useWorkflow';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import DiagramPanel from './components/DiagramPanel';
import NodeModal from './components/NodeModal';
import StatusBar from './components/StatusBar';
import { examples } from './examples';

const DEFAULT_YAML = examples[0].yaml;

function getInitialYaml(): string {
  const hash = window.location.hash;
  if (hash.startsWith('#code=')) {
    try {
      return atob(decodeURIComponent(hash.slice(6)));
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_YAML;
}

export default function App() {
  const workflow = useWorkflowProvider(getInitialYaml());
  const [splitRatio, setSplitRatio] = useState(50);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.max(20, Math.min(80, pct)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Listen for postMessage from parent (iframe embedding)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'set-yaml' && typeof e.data.yaml === 'string') {
        workflow.setYamlContent(e.data.yaml);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [workflow.setYamlContent]);

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const blob = new Blob([workflow.yamlContent], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'workflow.flow.yaml';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workflow.yamlContent]);

  return (
    <WorkflowContext.Provider value={workflow}>
      <div className="flex flex-col h-full bg-surface text-gray-100">
        <Toolbar />
        <div
          ref={containerRef}
          className="flex flex-1 overflow-hidden"
        >
          {/* Diagram - left */}
          <div
            className="overflow-hidden bg-surface"
            style={{ width: `${splitRatio}%` }}
          >
            <DiagramPanel />
          </div>

          {/* Resize handle */}
          <div
            className="w-1 bg-panel-border hover:bg-accent cursor-col-resize flex-shrink-0 transition-colors"
            onMouseDown={handleMouseDown}
          />

          {/* Editor - right */}
          <div
            className="overflow-hidden"
            style={{ width: `${100 - splitRatio}%` }}
          >
            <EditorPanel />
          </div>
        </div>
        <StatusBar />
        <NodeModal />
      </div>
    </WorkflowContext.Provider>
  );
}
