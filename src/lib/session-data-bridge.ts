import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface SessionDataEvent {
  session_id: string;
  data: number[];
}

type DataCallback = (data: Uint8Array) => void;

interface SessionBridge {
  buffer: Uint8Array[];
  consumer: DataCallback | null;
  unlistenPromise: Promise<UnlistenFn>;
}

const bridges = new Map<string, SessionBridge>();

/**
 * Begin listening for session data immediately after connection is established.
 * Data arriving before a consumer is attached will be buffered in memory.
 */
export function startBuffering(sessionId: string, eventName: string) {
  if (bridges.has(sessionId)) return;

  const bridge: SessionBridge = {
    buffer: [],
    consumer: null,
    unlistenPromise: listen<SessionDataEvent>(eventName, (event) => {
      if (event.payload.session_id !== sessionId) return;
      const data = new Uint8Array(event.payload.data);
      if (bridge.consumer) {
        bridge.consumer(data);
      } else {
        bridge.buffer.push(data);
      }
    }),
  };
  bridges.set(sessionId, bridge);
}

/**
 * Attach a consumer (typically xterm.write) to receive data.
 * Any buffered data is flushed to the consumer immediately.
 */
export function attachConsumer(sessionId: string, callback: DataCallback) {
  const bridge = bridges.get(sessionId);
  if (!bridge) return;

  for (const data of bridge.buffer) {
    callback(data);
  }
  bridge.buffer.length = 0;
  bridge.consumer = callback;
}

export function detachConsumer(sessionId: string) {
  const bridge = bridges.get(sessionId);
  if (bridge) {
    bridge.consumer = null;
  }
}

export async function stopBuffering(sessionId: string) {
  const bridge = bridges.get(sessionId);
  if (bridge) {
    const unlisten = await bridge.unlistenPromise;
    unlisten();
    bridges.delete(sessionId);
  }
}
