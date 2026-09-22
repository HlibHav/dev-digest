import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

/**
 * The provider routing and the served-by attribution, checked at the wire: a
 * fake fetch records the request body the SDK sends and answers with a chat
 * completion shaped like OpenRouter's, including its `provider` extension.
 */
const Answer = z.object({ ok: z.boolean() });

function fakeOpenRouter(provider?: string) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    const completion = {
      id: 'gen-1',
      object: 'chat.completion',
      created: 0,
      model: 'deepseek/deepseek-v4-flash',
      ...(provider ? { provider } : {}),
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: '{"ok":true}' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    };
    return new Response(JSON.stringify(completion), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, bodies };
}

const request = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Answer,
  schemaName: 'Answer',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('OpenRouterProvider routing', () => {
  it('sends the routing as the provider object and reports who served the call', async () => {
    const { fetch, bodies } = fakeOpenRouter('Parasail');
    const llm = new OpenRouterProvider('test-key', {
      fetch,
      routing: { order: ['parasail'], allowFallbacks: true, ignore: ['open-inference'] },
    });

    const res = await llm.completeStructured(request);

    expect(bodies[0]!.provider).toEqual({
      order: ['parasail'],
      allow_fallbacks: true,
      ignore: ['open-inference'],
    });
    expect(res.data).toEqual({ ok: true });
    expect(res.servedBy).toBe('Parasail');
  });

  it('sends no provider object when routing is unset or empty', async () => {
    for (const routing of [undefined, {}, { order: [], ignore: [] }]) {
      const { fetch, bodies } = fakeOpenRouter();
      const llm = new OpenRouterProvider('test-key', { fetch, ...(routing ? { routing } : {}) });

      const res = await llm.completeStructured(request);

      expect(bodies[0]).not.toHaveProperty('provider');
      expect(res.servedBy).toBeUndefined();
    }
  });

  it('retries a call whose body stalls after an early 200, then succeeds', async () => {
    const { fetch: answer } = fakeOpenRouter('Parasail');
    let calls = 0;
    const fetch = (async (url: unknown, init?: { signal?: AbortSignal }) => {
      calls += 1;
      if (calls > 1) return answer(url as string, init as RequestInit);
      // What OpenRouter does while a provider works: 200 at once, whitespace,
      // then nothing until the answer — here, until the caller gives up.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('   '));
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    const llm = new OpenRouterProvider('test-key', { fetch, requestDeadlineMs: 50, stallRetries: 1 });

    const res = await llm.completeStructured(request);

    expect(calls).toBe(2);
    expect(res.data).toEqual({ ok: true });
  });

  it('fails with a clear error when every attempt stalls', async () => {
    const fetch = (async (_url: unknown, init?: { signal?: AbortSignal }) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(' '));
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    const llm = new OpenRouterProvider('test-key', { fetch, requestDeadlineMs: 30, stallRetries: 1 });

    await expect(llm.completeStructured(request)).rejects.toThrow(/did not finish within 30 ms \(2 attempt/);
  });

  it('ignores routing when talking to OpenAI directly', async () => {
    const { fetch, bodies } = fakeOpenRouter();
    const llm = new OpenRouterProvider('test-key', {
      id: 'openai',
      baseURL: 'https://api.openai.com/v1',
      fetch,
      routing: { order: ['parasail'] },
    });

    await llm.completeStructured(request);

    expect(bodies[0]).not.toHaveProperty('provider');
  });
});
