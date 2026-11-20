import { useState } from 'react';

export type PlanItem = {
  no: string;
  kategori: string;
  kebutuhan: string;
  urutan: number;
  gate_required: boolean;
};
type Props = {
  items: PlanItem[];
  editable: boolean;
  saving: boolean;
  onSave: (items: PlanItem[]) => Promise<unknown>;
};
const field = 'w-full min-w-20 rounded border px-2 py-1.5 text-sm disabled:bg-slate-100';

export function TestPlanTable({ items, editable, saving, onSave }: Props) {
  const [draft, setDraft] = useState<PlanItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const rows = draft ?? items;
  const categories = [...new Set(rows.map(x => x.kategori))].sort();
  const matches = rows.map((item, index) => ({ item, index })).filter(({ item }) =>
    (category === 'ALL' || item.kategori === category) &&
    [item.no, item.kategori, item.kebutuhan].some(value => value.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const pages = Math.max(1, Math.ceil(matches.length / 20));
  const safePage = Math.min(page, pages);
  const visible = matches.slice((safePage - 1) * 20, safePage * 20);

  function patch(index: number, change: Partial<PlanItem>) {
    setDraft(previous => (previous ?? items).map((row, i) => i === index ? { ...row, ...change } : row));
    setError('');
  }
  function reorder(index: number, step: number) {
    setDraft(previous => {
      const copy = [...(previous ?? items)];
      const next = index + step;
      if (next < 0 || next >= copy.length) return copy;
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy.map((row, i) => ({ ...row, urutan: i + 1 }));
    });
  }
  async function submit() {
    if (!draft || !editable) return;
    const normalized = draft.map((row, index) => ({
      ...row,
      no: row.no.trim(),
      kategori: row.kategori.trim().toUpperCase(),
      kebutuhan: row.kebutuhan.trim(),
      urutan: index + 1
    }));
    if (!normalized.length || normalized.some(row => !row.no || !row.kategori || !row.kebutuhan)) {
      setError('Setiap item harus memiliki nomor, kategori dan kebutuhan.');
      return;
    }
    if (new Set(normalized.map(row => row.no)).size !== normalized.length) {
      setError('Nomor test case harus unik.');
      return;
    }
    setPending(true);
    try {
      await onSave(normalized);
      setDraft(null);
      setError('');
    } catch {
      setError('Penyimpanan ditolak. Periksa validasi atau apakah project sudah memiliki sesi.');
    } finally {
      setPending(false);
    }
  }
  const busy = saving || pending;

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm flex-1 min-w-48">Cari nomor, kategori atau kebutuhan
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className={field} aria-label="Cari test plan" />
      </label>
      <label className="text-sm min-w-32">Kategori
        <select className={field} aria-label="Filter kategori test plan" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="ALL">Semua kategori</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <span className="text-xs text-slate-500 pb-2">{matches.length} dari {rows.length} item</span>
    </div>
    {editable && <div className="flex flex-wrap gap-2">
      {draft === null ? <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setDraft(items.map(row => ({ ...row })))}>
        Edit tabel test plan
      </button> : <>
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => { setDraft(previous => [...(previous ?? items), { no: '', kategori: 'A', kebutuhan: '', gate_required: false, urutan: (previous ?? items).length + 1 }]); setPage(pages); }}>Tambah item</button>
        <button type="button" className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void submit()}>Simpan perubahan</button>
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Batal edit</button>
      </>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left"><tr>
          <th scope="col" className="p-2">Nomor</th><th scope="col" className="p-2">Kategori</th>
          <th scope="col" className="p-2">Kebutuhan</th><th scope="col" className="p-2">Urutan</th>
          <th scope="col" className="p-2">Gate</th>{draft !== null && <th scope="col" className="p-2">Aksi</th>}
        </tr></thead>
        <tbody>{visible.map(({ item, index }) => <tr className="border-t" key={index}>
          <td className="p-2">{draft === null ? item.no :
            <input className={field} aria-label={'Nomor item '+(index + 1)} value={item.no} maxLength={20} disabled={busy} onChange={e => patch(index, { no: e.target.value })}/>}</td>
          <td className="p-2">{draft === null ? item.kategori :
            <input className={field} aria-label={'Kategori item '+(index + 1)} value={item.kategori} maxLength={5} disabled={busy} onChange={e => patch(index, { kategori: e.target.value })}/>}</td>
          <td className="p-2 min-w-48">{draft === null ? item.kebutuhan :
            <textarea className={field} aria-label={'Kebutuhan item '+(index + 1)} value={item.kebutuhan} maxLength={5000} rows={2} disabled={busy} onChange={e => patch(index, { kebutuhan: e.target.value })}/>}</td>
          <td className="p-2">{item.urutan}</td>
          <td className="p-2">{draft === null ? (item.gate_required ? 'Wajib' : '—') :
            <input type="checkbox" aria-label={'Gate wajib item '+(index + 1)} checked={item.gate_required} disabled={busy} onChange={e => patch(index, { gate_required: e.target.checked })}/>}</td>
          {draft !== null && <td className="p-2 whitespace-nowrap">
            <button className="underline mr-2 disabled:opacity-40" disabled={busy || index === 0} aria-label={'Naikkan item '+(index + 1)} onClick={() => reorder(index, -1)}>Naik</button>
            <button className="underline mr-2 disabled:opacity-40" disabled={busy || index === rows.length - 1} aria-label={'Turunkan item '+(index + 1)} onClick={() => reorder(index, 1)}>Turun</button>
            <button className="underline text-red-700 disabled:opacity-40" disabled={busy} aria-label={'Hapus item '+(index + 1)} onClick={() => setDraft(previous => (previous ?? items).filter((_, i) => i !== index).map((row, i) => ({ ...row, urutan: i + 1 })))}>Hapus</button>
          </td>}
        </tr>)}</tbody>
      </table>
    </div>
    <nav aria-label="Halaman test plan" className="flex flex-wrap gap-3 items-center justify-between text-sm">
      <span>Halaman {safePage} dari {pages}</span>
      <div className="flex gap-2">
        <button type="button" className="border rounded px-3 py-2 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage(x => Math.max(1,x-1))}>Sebelumnya</button>
        <button type="button" className="border rounded px-3 py-2 disabled:opacity-40" disabled={safePage >= pages} onClick={() => setPage(x => Math.min(pages,x+1))}>Berikutnya</button>
      </div>
    </nav>
    {draft !== null && <p className="text-xs text-slate-600">Pengurutan mengubah urutan item kanonis. Perubahan hanya dapat disimpan sebelum project memiliki sesi UAT.</p>}
  </div>;
}
