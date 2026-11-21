export function FormField({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span aria-hidden="true" className="text-red-600">*</span>}
        </span>
        {children}
      </label>
      {error && <p role="alert" className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  );
}

export const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-600 outline-none text-sm';
