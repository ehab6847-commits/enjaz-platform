import { io, Socket } from 'socket.io-client';
import { getToken } from './auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        cb({ token: getToken() });
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[Socket] متصل بالخادم:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] انقطع الاتصال:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] خطأ في الاتصال:', err.message);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[Socket] إعادة الاتصال - المحاولة:', attempt);
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.auth = (cb: (data: { token: string | null }) => void) => {
      cb({ token: getToken() });
    };
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
}

export default getSocket;
