import { useWorkflow } from '../hooks/useWorkflow';

export default function StatusBar() {
  const { diagnostics, isParsing, isValid } = useWorkflow();
  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  const warnCount = diagnostics.filter(d => d.severity === 'warning').length;

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-panel border-t border-panel-border text-xs text-gray-400">
      {isParsing ? (
        <span className="text-warning">Parsing...</span>
      ) : isValid ? (
        <span className="text-success">Valid</span>
      ) : (
        <span className="text-danger">
          {errorCount} error{errorCount !== 1 ? 's' : ''}
          {warnCount > 0 && `, ${warnCount} warning${warnCount !== 1 ? 's' : ''}`}
        </span>
      )}
    </div>
  );
}
