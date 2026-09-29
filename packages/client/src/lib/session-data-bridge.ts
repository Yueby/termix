import { Channel } from "@tauri-apps/api/core";

type DataCallback = (data: Uint8Array) => void;

/**
 * Cap on buffered unconsumed terminal output (1 MiB).
 * If output arrives before a consumer attaches (or while no consumer is attached),
 * we keep at most 1 MiB of the latest data so memory cannot grow without bound.
 */
const MAX_BUFFERED_BYTES = 1024 * 1024;

interface SessionBridge {
  channel: Channel<ArrayBuffer>;
  buffer: Uint8Array[];
  bufferedBytes: number;
  consumer: DataCallback | null;
}

const bridges = new Map<string, SessionBridge>();

/**
 * Starts capturing a session's output and returns the channel that must be handed
 * to `ssh_connect` / `local_open`.
 *
 * The channel is created before the session exists, so the caller generates the
 * session id. Output that arrives before a consumer attaches (typically `xterm`
 * mounting) is buffered in memory up to `MAX_BUFFERED_BYTES`.
 *
 * Chunks arrive as raw `ArrayBuffer`s: the Rust side sends
 * `InvokeResponseBody::Raw`, so nothing is JSON- or base64-encoded on the way.
 */
export function startBuffering(sessionId: string): Channel<ArrayBuffer> {
  const existing = bridges.get(sessionId);
  if (existing) return existing.channel;

  const channel = new Channel<ArrayBuffer>();
  const bridge: SessionBridge = {
    channel,
    buffer: [],
    bufferedBytes: 0,
    consumer: null,
  };

  channel.onmessage = (chunk) => {
    const data = new Uint8Array(chunk);
    if (bridge.consumer) {
      bridge.consumer(data);
    } else {
      bridge.buffer.push(data);
      bridge.bufferedBytes += data.byteLength;
      while (bridge.bufferedBytes > MAX_BUFFERED_BYTES && bridge.buffer.length > 1) {
        const dropped = bridge.buffer.shift();
        if (dropped) {
          bridge.bufferedBytes -= dropped.byteLength;
        }
      }
    }
  };

  bridges.set(sessionId, bridge);
  return channel;
}

/**
 * Attach a consumer (typically xterm.write) to receive data.
 * Any buffered data is flushed to the consumer immediately.
 */
export function attachConsumer(sessionId: string, callback: DataCallback) {
  const bridge = bridges.get(sessionId);
  if (!bridge) return;

  const buffered = bridge.buffer;
  bridge.buffer = [];
  bridge.bufferedBytes = 0;
  bridge.consumer = callback;

  for (const data of buffered) {
    try {
      callback(data);
    } catch {
      // Ignore consumer write errors to ensure all chunks are flushed
    }
  }
}

export function detachConsumer(sessionId: string, callback?: DataCallback) {
  const bridge = bridges.get(sessionId);
  if (bridge) {
    if (!callback || bridge.consumer === callback) {
      bridge.consumer = null;
    }
  }
}

export function stopBuffering(sessionId: string) {
  const bridge = bridges.get(sessionId);
  if (!bridge) return;
  bridge.channel.onmessage = () => {};
  // `cleanupCallback` exists at runtime but is marked private in the typings.
  (bridge.channel as unknown as { cleanupCallback?: () => void }).cleanupCallback?.();
  bridge.consumer = null;
  bridge.buffer = [];
  bridge.bufferedBytes = 0;
  bridges.delete(sessionId);
}
