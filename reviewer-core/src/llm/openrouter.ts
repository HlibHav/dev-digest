import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from './structured.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

/**
 * Which upstream providers OpenRouter may use for a model, sent as the request's
 * `provider` object. Slugs are OpenRouter's (`parasail`, `open-inference`). The
 * same prompt can get a different verdict from a different provider, so reviews
 * pin where they run.
 */
export interface OpenRouterRouting {
  /** Providers to try first, in order. */
  order?: string[];
  /** Whether OpenRouter may fall back to other providers when `order` fails. */
  allowFallbacks?: boolean;
  /** Providers never to use, fallbacks included. */
  ignore?: string[];
}

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  /** Provider routing; unset lets OpenRouter route freely. Ignored when `id` is 'openai'. */
  routing?: OpenRouterRouting;
  /**
   * Wall-clock limit for one call, response body included (default 150 s).
   * OpenRouter answers 200 at once and keeps the body open with whitespace while
   * the provider works, so the SDK's `timeoutMs` (time to headers) never fires on
   * a provider that stalls mid-answer.
   */
  requestDeadlineMs?: number;
  /** How many times a call that hit the deadline is retried (default 1). */
  stallRetries?: number;
  /** The fetch the SDK uses. Tests pass a fake; production leaves it unset. */
  fetch?: typeof fetch;
}

/** `OpenRouterRouting` in the wire shape OpenRouter expects, or undefined when empty. */
function providerPreferences(routing: OpenRouterRouting | undefined) {
  if (!routing) return undefined;
  const prefs = {
    ...(routing.order?.length ? { order: routing.order } : {}),
    ...(routing.allowFallbacks !== undefined ? { allow_fallbacks: routing.allowFallbacks } : {}),
    ...(routing.ignore?.length ? { ignore: routing.ignore } : {}),
  };
  return Object.keys(prefs).length > 0 ? prefs : undefined;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];
  private providerPrefs?: ReturnType<typeof providerPreferences>;
  private deadlineMs: number;
  private stallRetries: number;

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.estimateCost = opts.estimateCost;
    this.providerPrefs = this.id === 'openrouter' ? providerPreferences(opts.routing) : undefined;
    this.deadlineMs = opts.requestDeadlineMs ?? 150_000;
    this.stallRetries = opts.stallRetries ?? 1;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costFromApi: number | null = null;
    let lastRaw = '';
    let servedBy: string | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await this.withDeadline((signal) => this.client.chat.completions.create({
        model: req.model,
        messages,
        temperature: req.temperature ?? 0,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
        },
        // OpenRouter session grouping — extra body field (spread is exempt from
        // excess-property checks). Only sent when talking to OpenRouter.
        ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
        // OpenRouter usage accounting — ask it to return the REAL generation
        // cost (USD) in `usage.cost`, instead of estimating from a price book.
        ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
        // OpenRouter provider routing (order / allow_fallbacks / ignore).
        ...(this.providerPrefs ? { provider: this.providerPrefs } : {}),
      }, { signal }));
      // `provider` names the upstream that served the call — an OpenRouter
      // extension, absent from the OpenAI SDK type.
      const provider = (res as unknown as { provider?: unknown }).provider;
      if (typeof provider === 'string' && provider) servedBy = provider;

      // OpenRouter can return HTTP 200 with no `choices` (an upstream provider
      // error / moderation / free-tier limit in the body) — surface it.
      const choice = res.choices?.[0];
      if (!choice) {
        const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`);
      }
      lastRaw = choice.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;
      if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null,
          raw: lastRaw,
          attempts: attempt,
          ...(servedBy ? { servedBy } : {}),
        };
      }
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new Error(`OpenRouter structured output failed schema validation for ${req.schemaName}`);
  }

  /**
   * Run one SDK call under a deadline that also covers reading the response body,
   * retrying a call that stalled. A stall is retried rather than failed at once:
   * it is rare, and a fresh request usually lands on a healthy provider.
   */
  private async withDeadline<R>(call: (signal: AbortSignal) => Promise<R>): Promise<R> {
    for (let attempt = 0; ; attempt++) {
      const signal = AbortSignal.timeout(this.deadlineMs);
      try {
        return await call(signal);
      } catch (err) {
        if (!signal.aborted) throw err;
        if (attempt >= this.stallRetries) {
          throw new Error(`OpenRouter call did not finish within ${this.deadlineMs} ms (${attempt + 1} attempt(s))`);
        }
      }
    }
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(NOT_SUPPORTED);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
