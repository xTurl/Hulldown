/**
 * free-ai.ts — the Groq-backed free AI proxy client. Covers: missing proxy
 * URL, successful response parsing, rate-limit error surfacing, and generic
 * upstream failures.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/hulldown-test') },
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(() => 'fixed-test-device-id'),
    writeFileSync: vi.fn(),
  },
  readFileSync: vi.fn(() => 'fixed-test-device-id'),
  writeFileSync: vi.fn(),
}));

import { callFreeAI, FreeAILimitError, getFreeAIUsage } from '../main/services/free-ai';

const schema = z.object({ summary: z.string() });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('callFreeAI', () => {
  it('throws a friendly error when AI_PROXY_URL is not configured', async () => {
    vi.stubEnv('AI_PROXY_URL', '');
    await expect(callFreeAI({ feature: 'debrief', user: '{}', schema }))
      .rejects.toThrow('Add your own Claude API key in Settings');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends feature, deviceId, and user content to the proxy', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: JSON.stringify({ summary: 'ok' }) }),
    });

    const result = await callFreeAI({ feature: 'tank-tips', user: '{"tank":"E100"}', schema });

    expect(result).toEqual({ summary: 'ok' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proxy.example.com/v1/ai');
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({ feature: 'tank-tips', deviceId: 'fixed-test-device-id', user: '{"tank":"E100"}' });
  });

  it('strips markdown fences before parsing the proxy response', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: '```json\n' + JSON.stringify({ summary: 'fenced' }) + '\n```' }),
    });

    const result = await callFreeAI({ feature: 'debrief', user: '{}', schema });
    expect(result.summary).toBe('fenced');
  });

  it('throws FreeAILimitError with the server message on 429 (per-device limit)', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'DEVICE_LIMIT', message: 'Free AI limit reached for today.' }),
    });

    const err = await callFreeAI({ feature: 'debrief', user: '{}', schema }).catch(e => e);
    expect(err).toBeInstanceOf(FreeAILimitError);
    expect(err.message).toBe('Free AI limit reached for today.');
  });

  it('throws FreeAILimitError on 503 (global limit)', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'GLOBAL_LIMIT', message: 'Free AI is at capacity for today.' }),
    });

    await expect(callFreeAI({ feature: 'weekly-coach', user: '{}', schema }))
      .rejects.toThrow('Free AI is at capacity for today.');
  });

  it('throws a generic error on other non-ok statuses', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    await expect(callFreeAI({ feature: 'debrief', user: '{}', schema }))
      .rejects.toThrow('HTTP 502');
  });

  it('throws when the proxy response fails schema validation', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: JSON.stringify({ wrongField: 1 }) }),
    });

    await expect(callFreeAI({ feature: 'debrief', user: '{}', schema }))
      .rejects.toThrow('schema validation');
  });
});

describe('getFreeAIUsage', () => {
  it('returns null when AI_PROXY_URL is not configured, without calling fetch', async () => {
    vi.stubEnv('AI_PROXY_URL', '');
    await expect(getFreeAIUsage()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches usage from the proxy with the device id as a query param', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    const usage = {
      day: '2026-07-08',
      features: {
        debrief: { used: 1, limit: 50, remaining: 49, globalAvailable: true },
        'tank-tips': { used: 0, limit: 50, remaining: 50, globalAvailable: true },
        'weekly-coach': { used: 0, limit: 20, remaining: 20, globalAvailable: true },
      },
    };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => usage });

    const result = await getFreeAIUsage();

    expect(result).toEqual(usage);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://proxy.example.com/v1/usage?deviceId=fixed-test-device-id');
    expect(init.method).toBe('GET');
  });

  it('throws when the usage request fails', async () => {
    vi.stubEnv('AI_PROXY_URL', 'https://proxy.example.com');
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(getFreeAIUsage()).rejects.toThrow('HTTP 500');
  });
});
