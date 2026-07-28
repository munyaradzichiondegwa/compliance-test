import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';

let io: IOServer | null = null;

export function initSocket(httpServer: HttpServer) {
  io = new IOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    socket.on('identify', (userId: string) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });

  return io;
}

/** Push a real-time event to a specific user's connected clients (bell icon, live worklist updates). */
export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitBroadcast(event: string, payload: unknown) {
  if (!io) return;
  io.emit(event, payload);
}
