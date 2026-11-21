import { useQuery } from '@tanstack/react-query';
import { liveApi } from '@/api/live';
import { useProjectLive } from '@/lib/useProjectLive';

export function ProjectLivePanel({ projectId }: { projectId: number }) {
  const { connected, online, lastChange } = useProjectLive(projectId);
  const { data: sessions = [] } = useQuery({ queryKey: ['dashboard', projectId], queryFn: () => liveApi.dashboard(projectId), refetchInterval: 15000 });
  const { data: events = [] } = useQuery({ queryKey: ['activity', projectId], queryFn: () => liveApi.activity(projectId), refetchInterval: 15000 });
  const summary = sessions.reduce((acc, s) => ({
    total: acc.total + s.total, lulus: acc.lulus + s.lulus,
    gagal: acc.gagal + s.gagal, belum: acc.belum + s.belum
  }), { total: 0, lulus: 0, gagal: 0, belum: 0 });
  return <div className="space-y-4 mb-7">
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className={connected ? 'w-2 h-2 rounded-full bg-emerald-500' : 'w-2 h-2 rounded-full bg-amber-500'} />
      <span role="status" aria-live="polite">{connected ? 'Real-time tersambung' : 'Koneksi real-time terputus; sinkronisasi 15 detik'}</span>
      {connected && <span>· {online.length} tester online</span>}
      {lastChange && <span>· Terakhir: {lastChange.action}</span>}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Object.entries({ Total: summary.total, PASS: summary.lulus, FAIL: summary.gagal, BELUM: summary.belum }).map(([k, value]) =>
        <div key={k} className="border rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{k}</p><p className="font-bold text-xl">{value}</p></div>)}
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-2">Progres sesi</h3>
        {sessions.length === 0 && <p className="text-xs text-slate-500">Belum ada sesi</p>}
        {sessions.map(s => <div key={s.id} className="flex justify-between text-xs border-t py-2 gap-3">
          <span>{s.nama_singkat} · Sesi #{s.id} · {s.status}</span><span>{s.lulus}/{s.total} PASS</span>
        </div>)}
      </section>
      <section className="bg-white border rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-2">Aktivitas tester terbaru</h3>
        {events.length === 0 && <p className="text-xs text-slate-500">Belum ada aktivitas</p>}
        <div className="max-h-48 overflow-y-auto">
          {events.map(e => <div key={e.id} className="text-xs border-t py-2">
            <span className="font-medium">{e.actor || 'Sistem'}</span> · {e.action}
            <span className="block text-slate-500">{new Date(e.occurred_at).toLocaleString('id-ID')}</span>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}
