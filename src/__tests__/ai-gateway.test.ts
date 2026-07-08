/**
 * ai-gateway.callAI — dispatch logic: BYO Claude key routes to Claude,
 * empty key routes to the free AI proxy. Each provider's own behavior is
 * tested in claude.test.ts / free-ai.test.ts respectively.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('../main/services/claude', () => ({
  callClaude: vi.fn(),
}));
vi.mock('../main/services/free-ai', () => ({
  callFreeAI: vi.fn(),
  FreeAILimitError: class FreeAILimitError extends Error {},
}));

import { callAI } from '../main/services/ai-gateway';
import { callClaude } from '../main/services/claude';
import { callFreeAI } from '../main/services/free-ai';

const schema = z.object({ value: z.string() });

describe('callAI', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes to callClaude when an apiKey is provided', async () => {
    vi.mocked(callClaude).mockResolvedValue({ value: 'from-claude' });

    const result = await callAI({
      apiKey: 'sk-ant-test', feature: 'debrief', model: 'claude-haiku', system: 'sys', user: 'usr', schema,
    });

    expect(result).toEqual({ value: 'from-claude' });
    expect(callClaude).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'sk-ant-test', model: 'claude-haiku', system: 'sys', user: 'usr',
    }));
    expect(callFreeAI).not.toHaveBeenCalled();
  });

  it('routes to callFreeAI when apiKey is empty', async () => {
    vi.mocked(callFreeAI).mockResolvedValue({ value: 'from-free-ai' });

    const result = await callAI({
      apiKey: '', feature: 'weekly-coach', model: 'claude-sonnet', system: 'sys', user: 'usr', schema,
    });

    expect(result).toEqual({ value: 'from-free-ai' });
    expect(callFreeAI).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'weekly-coach', user: 'usr',
    }));
    expect(callClaude).not.toHaveBeenCalled();
  });

  it('propagates errors from the free AI path', async () => {
    vi.mocked(callFreeAI).mockRejectedValue(new Error('AI is not available in this build.'));

    await expect(callAI({
      apiKey: '', feature: 'tank-tips', model: 'm', system: 's', user: 'u', schema,
    })).rejects.toThrow('AI is not available in this build.');
  });
});
