import { useRef, useCallback } from 'react';
import { useWorkflow } from '../hooks/useWorkflow';
import { examples } from '../examples';

export default function Toolbar() {
  const { setYamlContent, yamlContent } = useWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setYamlContent(reader.result as string);
      reader.readAsText(file);
      e.target.value = '';
    },
    [setYamlContent],
  );

  const handleSave = useCallback(() => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.duck.yaml';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [yamlContent]);

  const handleNew = useCallback(() => {
    setYamlContent(`flow:\n  - type: exec\n    run: echo "hello"\n`);
  }, [setYamlContent]);

  const handleExample = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      if (!isNaN(idx) && examples[idx]) {
        setYamlContent(examples[idx].yaml);
      }
      e.target.value = '';
    },
    [setYamlContent],
  );

  const btnCls =
    'px-3 py-1.5 text-sm bg-surface hover:bg-surface-hover rounded border border-panel-border text-gray-300 cursor-pointer';

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-panel border-b border-panel-border">
      <span className="text-accent font-bold text-sm mr-2">duckflux editor</span>

      <button className={btnCls} onClick={handleNew}>New</button>
      <button className={btnCls} onClick={handleLoad}>Open</button>
      <button className={btnCls} onClick={handleSave}>Save</button>

      <select
        className={`${btnCls} appearance-none`}
        onChange={handleExample}
        defaultValue=""
      >
        <option value="" disabled>
          Examples...
        </option>
        {examples.map((ex, i) => (
          <option key={ex.label} value={i}>
            {ex.label}
          </option>
        ))}
      </select>

      <div className="flex-1" />

      <span className="text-xs text-gray-500">duckflux v0.3</span>

      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
