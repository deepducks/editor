import { useRef, useEffect, useCallback, useState } from 'react';
import mermaid from 'mermaid';
import panzoom, { type PanZoom } from 'panzoom';
import { useWorkflow } from '../hooks/useWorkflow';

let mermaidInitialized = false;

export default function DiagramPanel() {
  const { mermaidCode, setSelectedNodeId } = useWorkflow();
  const containerRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<PanZoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize mermaid
  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
        },
      });
      mermaidInitialized = true;
    }
  }, []);

  // Global click callback
  useEffect(() => {
    (window as any).onNodeClick = (nodeId: string) => {
      setSelectedNodeId(nodeId);
    };
    return () => {
      delete (window as any).onNodeClick;
    };
  }, [setSelectedNodeId]);

  // Render diagram
  useEffect(() => {
    if (!containerRef.current || !mermaidCode) {
      if (containerRef.current) containerRef.current.innerHTML = '';
      setError(null);
      return;
    }

    const render = async () => {
      try {
        const { svg, bindFunctions } = await mermaid.render('duckflux-diagram', mermaidCode);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);

          // Bind Mermaid click callbacks to the rendered DOM
          if (bindFunctions) {
            bindFunctions(containerRef.current);
          }

          // Also manually bind click handlers on .clickable nodes
          // as a fallback (Mermaid node IDs follow: flowchart-{nodeId}-{index})
          const clickableNodes = containerRef.current.querySelectorAll('.node.clickable');
          clickableNodes.forEach((node) => {
            node.addEventListener('click', () => {
              // Extract nodeId from element id: "flowchart-{nodeId}-{number}"
              const elId = node.id;
              const match = elId.match(/^flowchart-(.+)-\d+$/);
              if (match) {
                const nodeId = match[1];
                (window as any).onNodeClick?.(nodeId);
              }
            });
            (node as HTMLElement).style.cursor = 'pointer';
          });

          // Setup panzoom
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            if (panzoomRef.current) panzoomRef.current.dispose();
            panzoomRef.current = panzoom(svgEl, {
              maxZoom: 5,
              minZoom: 0.2,
              smoothScroll: false,
            });
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Mermaid render error');
        if (containerRef.current) containerRef.current.innerHTML = '';
      }
    };

    render();

    return () => {
      if (panzoomRef.current) {
        panzoomRef.current.dispose();
        panzoomRef.current = null;
      }
    };
  }, [mermaidCode]);

  const resetZoom = useCallback(() => {
    if (panzoomRef.current) {
      panzoomRef.current.moveTo(0, 0);
      panzoomRef.current.zoomAbs(0, 0, 1);
    }
  }, []);

  if (!mermaidCode && !error) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Edit the YAML to see the workflow diagram.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {error && (
        <div className="absolute top-2 left-2 right-2 bg-red-900/80 text-red-200 text-sm p-2 rounded z-10">
          {error}
        </div>
      )}
      <button
        onClick={resetZoom}
        className="absolute top-2 right-2 z-10 bg-panel-border text-gray-300 text-xs px-2 py-1 rounded hover:bg-surface-hover cursor-pointer"
      >
        Reset zoom
      </button>
      <div ref={containerRef} className="h-full w-full p-4" />
    </div>
  );
}
