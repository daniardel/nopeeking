// Minimal ntfy client: publish a message, stream messages from a topic.

export function createNtfy({ baseUrl = 'https://ntfy.sh', fetchImpl = globalThis.fetch } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    baseUrl: base,

    async publish(topic, message) {
      const res = await fetchImpl(`${base}/${topic}`, { method: 'POST', body: message });
      if (!res.ok) throw new Error(`Relay publish failed: HTTP ${res.status}`);
      return res.json();
    },

    /** Calls onMessage(text, id) for each message until the stream ends or `signal` aborts. */
    async subscribe(topic, onMessage, { since, signal } = {}) {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      const res = await fetchImpl(`${base}/${topic}/json${query}`, { signal });
      if (!res.ok) throw new Error(`Relay subscribe failed: HTTP ${res.status}`);
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.event === 'message') await onMessage(event.message, event.id);
        }
      }
    },
  };
}
