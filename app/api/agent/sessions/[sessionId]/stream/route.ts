import { NextRequest } from 'next/server';

const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_FAILURES = 5;

type SessionPayload = {
  session?: unknown;
};

type MetadataPayload = {
  scores?: unknown;
  retry_status?: unknown;
};

const encoder = new TextEncoder();

function formatEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

type RouteParams = {
  sessionId: string;
};

export async function GET(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { sessionId } = await params;
  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const base = new URL(req.url).origin;
  let failures = 0;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const abort = () => {
        if (isClosed) {
          return;
        }
        console.debug('[SessionStream] aborting stream', { sessionId, failures });
        controller.enqueue(encoder.encode('event: close\ndata: {}\n\n'));
        controller.close();
        isClosed = true;
      };

      const poll = async () => {
        try {
          const [sessionRes, metadataRes] = await Promise.all([
            fetch(`${base}/api/agent/sessions/${sessionId}`, { cache: 'no-store' }),
            fetch(`${base}/api/tasks/metadata?session_id=${sessionId}&status=all`, {
              cache: 'no-store',
            }),
          ]);

          if (!sessionRes.ok) {
            throw new Error(`Session request failed: ${sessionRes.status}`);
          }
          if (!metadataRes.ok) {
            throw new Error(`Metadata request failed: ${metadataRes.status}`);
          }

          const sessionJson = (await sessionRes.json()) as SessionPayload;
          const metadataJson = (await metadataRes.json()) as MetadataPayload;

          controller.enqueue(formatEvent('session', sessionJson));
          controller.enqueue(formatEvent('scores', metadataJson));

          failures = 0;
        } catch (error) {
          if (isClosed) {
            console.debug('[SessionStream] poll skipped: controller already closed', {
              sessionId,
              failures,
              error: String(error),
            });
            return;
          }
          failures += 1;
          console.debug('[SessionStream] poll failure', { sessionId, failures, error: String(error) });
          controller.enqueue(
            formatEvent('warning', { message: 'Polling failed', failures, error: String(error) })
          );
          if (failures >= MAX_FAILURES) {
            controller.enqueue(
              formatEvent('error', {
                message: 'Too many failures. Closing stream.',
                failures,
              })
            );
            abort();
          }
        }
      };

      await poll();
      const interval = setInterval(poll, DEFAULT_POLL_INTERVAL_MS);

      const closeListener = () => {
        clearInterval(interval);
        abort();
      };

      req.signal.addEventListener('abort', closeListener);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
