import { DurableObject } from 'cloudflare:workers';

// Project-scoped, server-authorized broadcast hub. Never accepts client-originated mutations.
export class ProjectLive extends DurableObject {
  broadcast(event) {
    const data = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(data); } catch { try { socket.close(); } catch {} }
    }
  }
  presence() {
    const users = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      const a = socket.deserializeAttachment();
      if (!a || !a.uid) continue;
      const old = users.get(a.uid);
      users.set(a.uid, { userId: a.uid, name: a.name, sessionId: a.sessionId || null, connections: (old?.connections || 0) + 1 });
    }
    this.broadcast({ type: 'presence', online: users.size, users: [...users.values()] });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/connect' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const uid = request.headers.get('X-QA-User');
      const name = request.headers.get('X-QA-Name') || 'Tester';
      const sid = request.headers.get('X-QA-Session');
      if (!uid || !/^\d+$/.test(uid)) return new Response('Unauthorized', { status: 401 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ uid, name: name.slice(0, 80), sessionId: sid && /^\d+$/.test(sid) ? Number(sid) : null });
      this.presence();
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'qa-live-v1' } });
    }
    if (path === '/publish' && request.method === 'POST') {
      const event = await request.json();
      if (event?.type !== 'change' || !Number.isSafeInteger(event.projectId)) return new Response('Bad event', { status: 400 });
      this.broadcast(event);
      return new Response(null, { status: 204 });
    }
    return new Response('Not found', { status: 404 });
  }
  webSocketMessage(ws, message) {
    if (message === 'ping') { try { ws.send(JSON.stringify({ type: 'pong' })); } catch {} }
    // No message from a client is ever treated as a database change or broadcast.
  }
  webSocketClose(ws, code, reason) {
    try { ws.close(code >= 1000 && code < 5000 && ![1004,1005,1006,1015].includes(code) ? code : 1000, reason || 'Closed'); } catch {}
    this.presence();
  }
  webSocketError(ws) {
    try { ws.close(1011, 'Connection error'); } catch {}
    this.presence();
  }
}
