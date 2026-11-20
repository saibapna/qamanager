import { X } from 'lucide-react';
import clsx from 'clsx';

export function Modal({ open, onClose, title, size = 'md', children }: {
  open: boolean; onClose: () => void; title: string;
  size?: 'sm' | 'md' | 'lg'; children: React.ReactNode;
}) {
  if (!open) return null;
  const sizeCls = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={clsx('bg-white rounded-2xl shadow-2xl w-full', sizeCls)}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
