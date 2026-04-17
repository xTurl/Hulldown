/**
 * claude.ts tests — callClaude generic helper + generateTankRecommendations shape
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sdk
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } };
  });
  return { default: MockAnthropic };
});

// Import AFTER mock
import { callClaude, generateTankRecommendations } from '../main/services/claude';
import { z } from 'zod';
import type { Tank } from '../shared/types';

function makeApiResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

const TestSchema = z.object({ value: z.string(), count: z.number() });

// ===========================================================================
// callClaude generic helper
// ===========================================================================

describe('callClaude', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed + validated object on valid response', async () => {
    mockCreate.mockResolvedValue(makeApiResponse(JSON.stringify({ value: 'hello', count: 42 })));
    const result = await callClaude({ apiKey: 'key', model: 'model', system: 'sys', user: 'usr', schema: TestSchema });
    expect(result.value).toBe('hello');
    expect(result.count).toBe(42);
  });

  it('strips markdown code fences before parsing', async () => {
    const json = '```json\n' + JSON.stringify({ value: 'hi', count: 1 }) + '\n```';
    mockCreate.mockResolvedValue(makeApiResponse(json));
    const result = await callClaude({ apiKey: 'key', model: 'model', system: 'sys', user: 'usr', schema: TestSchema });
    expect(result.value).toBe('hi');
  });

  it('throws on non-text response block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] });
    await expect(callClaude({ apiKey: 'key', model: 'm', system: 's', user: 'u', schema: TestSchema }))
      .rejects.toThrow('Unexpected response type');
  });

  it('throws on invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeApiResponse('not json'));
    await expect(callClaude({ apiKey: 'key', model: 'm', system: 's', user: 'u', schema: TestSchema }))
      .rejects.toThrow('invalid JSON');
  });

  it('throws on schema validation failure', async () => {
    // Missing required field 'count'
    mockCreate.mockResolvedValue(makeApiResponse(JSON.stringify({ value: 'hi' })));
    await expect(callClaude({ apiKey: 'key', model: 'm', system: 's', user: 'u', schema: TestSchema }))
      .rejects.toThrow('schema validation');
  });

  it('uses default maxTokens 1024 when not specified', async () => {
    mockCreate.mockResolvedValue(makeApiResponse(JSON.stringify({ value: 'x', count: 1 })));
    await callClaude({ apiKey: 'key', model: 'm', system: 's', user: 'u', schema: TestSchema });
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(1024);
  });

  it('passes custom maxTokens to the API', async () => {
    mockCreate.mockResolvedValue(makeApiResponse(JSON.stringify({ value: 'x', count: 1 })));
    await callClaude({ apiKey: 'key', model: 'm', system: 's', user: 'u', maxTokens: 500, schema: TestSchema });
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(500);
  });
});

// ===========================================================================
// generateTankRecommendations — refactored to use callClaude; verify same shape
// ===========================================================================

const baseTank: Tank = {
  tankId: 1, name: 'E 100', tier: 10, type: 'heavyTank', nation: 'germany',
  isPremium: false, battles: 500, wins: 280, winRate: 56.0, wn8: 2100, wnx: 2200,
  hasExpectedValues: true, avgDamage: 3100, avgDamageAssisted: 200,
  avgDamageAssistedTrack: 50, avgDamageBlocked: 800, avgFrags: 1.2, avgSpots: 0.5,
  survivalRate: 42.0, avgXp: 950,
};

const validAIResponse = {
  summary: 'Good performance.',
  strengths: ['High damage'],
  weaknesses: ['Low mobility'],
  tips: ['Aim for weak spots'],
};

describe('generateTankRecommendations (refactored to use callClaude)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed recommendations with generatedAt timestamp', async () => {
    mockCreate.mockResolvedValue(makeApiResponse(JSON.stringify(validAIResponse)));
    const result = await generateTankRecommendations(baseTank, [], 'test-key');
    expect(result.summary).toBe(validAIResponse.summary);
    expect(result.strengths).toEqual(validAIResponse.strengths);
    expect(result.weaknesses).toEqual(validAIResponse.weaknesses);
    expect(result.tips).toEqual(validAIResponse.tips);
    expect(typeof result.generatedAt).toBe('number');
  });

  it('strips markdown code fences from Claude response', async () => {
    const withFences = '```json\n' + JSON.stringify(validAIResponse) + '\n```';
    mockCreate.mockResolvedValue(makeApiResponse(withFences));
    const result = await generateTankRecommendations(baseTank, [], 'test-key');
    expect(result.summary).toBe(validAIResponse.summary);
  });

  it('throws when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeApiResponse('not json at all'));
    await expect(generateTankRecommendations(baseTank, [], 'test-key')).rejects.toThrow();
  });
});
