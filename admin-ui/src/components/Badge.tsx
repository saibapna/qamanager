import clsx from 'clsx';
export function Badge({ variant, children }: { variant: 'success'|'danger'|'warning'|'info'|'neutral'; children: React.ReactNode }) {
  const c = { success: 'bg-green-100 text-green-800', danger: 'bg-red-100 text-red-800', warning: 'bg-yellow-100 text-yellow-800', info: 'bg-blue-100 text-blue-800', neutral: 'bg-slate-100 text-slate-700' }[variant];
  return <span className={clsx('inline-flex px-2 py-0.5 rounded text-xs font-medium', c)}>{children}</span>;
}
