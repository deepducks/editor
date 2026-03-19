import { useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useWorkflow } from '../hooks/useWorkflow';

export default function EditorPanel() {
  const { yamlContent, setYamlContent, diagnostics } = useWorkflow();
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  // Update markers when diagnostics change
  const prevDiagRef = useRef(diagnostics);
  if (prevDiagRef.current !== diagnostics && editorRef.current && monacoRef.current) {
    prevDiagRef.current = diagnostics;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (model) {
      const markers: monacoEditor.IMarkerData[] = diagnostics.map(d => ({
        severity:
          d.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.column + 1,
      }));
      monaco.editor.setModelMarkers(model, 'duckflux', markers);
    }
  }

  return (
    <Editor
      height="100%"
      language="yaml"
      theme="vs-dark"
      value={yamlContent}
      onChange={(value) => setYamlContent(value ?? '')}
      onMount={handleMount}
      options={{
        tabSize: 2,
        minimap: { enabled: false },
        wordWrap: 'on',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
      }}
    />
  );
}
