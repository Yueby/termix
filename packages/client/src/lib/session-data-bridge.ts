import { Channel } from "@tauri-apps/api/core";

type DataCallback = (data: Uint8Array) => void;

interface SessionBridge {
  channel: Channel<ArrayBuffer>;
  buffer: Uint8Array[];
  consumer: DataCallback | null;
}

const bridges = new Map<string, SessionBridge>();

/**
 * Starts capturing a session's output and returns the channel that must be handed
 * to `ssh_connect` / `local_open`.
 *
 * The channel is created before the session exists, so the caller generates the
 * session id. Output that arrives before a consumer attaches (typically `xterm`
 * mounting) is buffered in memory.
 *
 * Chunks arrive as raw `ArrayBuffer`s: the Rust side sends
 * `InvokeResponseBody::Raw`, so nothing is JSON- or base64-encoded on the way.
 */
export function startBuffering(sessionId: string): Channel<ArrayBuffer> {
  const existing = bridges.get(sessionId);
  if (existing) return existing.channel;

  const channel = new Channel<ArrayBuffer>();
  const bridge: SessionBridge = { channel, buffer: [], consumer: null };

  channel.onmessage = (chunk) => {
    const data = new Uint8Array(chunk);
    if (bridge.consumer) bridge.consumer(data);
    else bridge.buffer.push(data);
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

export function stopBuffering(sessionId: string) {
  const bridge = bridges.get(sessionId);
  if (!bridge) return;
  // `cleanupCallback` exists at runtime but is marked private in the typings.
  (bridge.channel as unknown as { cleanupCallback?: () => void }).cleanupCallback?.();
  bridge.consumer = null;
  bridge.buffer.length = 0;
  bridges.delete(sessionId);
}
