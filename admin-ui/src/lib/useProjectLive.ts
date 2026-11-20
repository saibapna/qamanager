import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/authStore';

export type ChangeEvent = {
  type: 'change';
  projectId: number;
  sessionId?: number | null;
  action: string;
  actorId: number;
  revision?: number;
  at: string;
};

type Presence = { userId: string; name: string; sessionId: number | null; connections: number };
export function useProjectLive(projectId: number, sessionId?: number) {
  const queryClient = useQueryClient();
  const userId = useAuth(s => s.user?.id);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Presence[]>([]);
  const [lastChange, setLastChange] = useState<ChangeEvent | null>(null);

  useEffect(() => {
    if (!projectId || !userId) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retries = 0;

    async function connect() {
      if (stopped) return;
      try {
        const url = new URL(`/api/live/projects/${projectId}/ws`, location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        if (sessionId) url.searchParams.set('sessionId', String(sessionId));
        socket = new WebSocket(url, ['qa-live-v1']);
        socket.onopen = () => { retries = 0; setConnected(true); };
        socket.onmessage = (msg) => {
          let event: any;
          try { event = JSON.parse(String(msg.data)); } catch { return; }
          if (event.type === 'presence' && Array.isArray(event.users)) {
            setOnline(event.users);
          }
          if (event.type === 'change' && event.projectId === projectId) {
            setLastChange(event as ChangeEvent);
            queryClient.invalidateQueries({ queryKey: ['project', projectId] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['templates', projectId] });
            queryClient.invalidateQueries({ queryKey: ['aplikasi', projectId] });
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] });
            queryClient.invalidateQueries({ queryKey: ['activity', projectId] });
            if (event.sessionId) {
              queryClient.invalidateQueries({ queryKey: ['sesi', event.sessionId] });
              queryClient.invalidateQueries({ queryKey: ['outputs', event.sessionId] });
            }
          }
        };
        socket.onclose = () => {
          if (stopped) return;
          setConnected(false);
          setOnline([]);
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retries++, 5)));
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (!stopped) {
          setConnected(false);
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(retries++, 5)));
        }
      }
    }
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close(1000, 'Navigated away');
      setConnected(false);
      setOnline([]);
    };
  }, [projectId, sessionId, userId, queryClient]);
  return { connected, online, lastChange };
}
