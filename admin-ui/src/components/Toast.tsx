import { create } from 'zustand';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import clsx from 'clsx';

type T = 'success' | 'error' | 'info';
interface Item { id: number; type: T; message: string; }
interface Store { toasts: Item[]; push: (t: T, m: string) => void; remove: (id: number) => void; }

export const useToast = create<Store>((set, get) => ({
  toasts: [],
  push: (type, message) => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, type, message }] });
    setTimeout(() => get().remove(id), 4000);
  },
  remove: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) })
}));

export function ToastContainer() {
  const { toasts, remove } = useToast();
  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-[60]">
      {toasts.map(t => (
        <div key={t.id} className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm min-w-[280px]',
          t.type === 'success' && 'bg-green-600', t.type === 'error' && 'bg-red-600', t.type === 'info' && 'bg-blue-600')}>
          {t.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
