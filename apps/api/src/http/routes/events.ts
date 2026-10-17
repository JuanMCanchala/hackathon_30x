import type { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Deps } from '../../services/deps';

/** Server-sent events: pipeline progress and sensor arrivals, for the web to refresh itself. */
export function registerEventRoutes(app: OpenAPIHono, deps: Deps) {
  app.get('/api/v1/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = deps.bus.subscribe((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' });
        await stream.sleep(25_000);
      }
      unsubscribe();
    }),
  );
}
