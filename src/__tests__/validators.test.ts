import { describe, it, expect } from 'vitest';
import {
  assertString,
  assertNumber,
  assertOptionalNumber,
  assertBoolean,
  assertConfig,
} from '../main/ipc/validators';

// ---------------------------------------------------------------------------
// assertString
// ---------------------------------------------------------------------------
describe('assertString', () => {
  it('returns the string unchanged', () => {
    expect(assertString('hello', 'x')).toBe('hello');
  });

  it('accepts empty string', () => {
    expect(assertString('', 'x')).toBe('');
  });

  it('throws for number', () => {
    expect(() => assertString(42, 'x')).toThrow('"x" must be a string');
  });

  it('throws for undefined', () => {
    expect(() => assertString(undefined, 'x')).toThrow('"x" must be a string');
  });

  it('throws for null', () => {
    expect(() => assertString(null, 'x')).toThrow('"x" must be a string');
  });

  it('throws for object', () => {
    expect(() => assertString({}, 'x')).toThrow('"x" must be a string');
  });
});

// ---------------------------------------------------------------------------
// assertNumber
// ---------------------------------------------------------------------------
describe('assertNumber', () => {
  it('returns the number unchanged', () => {
    expect(assertNumber(42, 'x')).toBe(42);
  });

  it('accepts 0', () => {
    expect(assertNumber(0, 'x')).toBe(0);
  });

  it('accepts negative numbers', () => {
    expect(assertNumber(-5, 'x')).toBe(-5);
  });

  it('throws for string', () => {
    expect(() => assertNumber('42', 'x')).toThrow('"x" must be a finite number');
  });

  it('throws for NaN', () => {
    expect(() => assertNumber(NaN, 'x')).toThrow('"x" must be a finite number');
  });

  it('throws for Infinity', () => {
    expect(() => assertNumber(Infinity, 'x')).toThrow('"x" must be a finite number');
  });

  it('throws for null', () => {
    expect(() => assertNumber(null, 'x')).toThrow('"x" must be a finite number');
  });
});

// ---------------------------------------------------------------------------
// assertOptionalNumber
// ---------------------------------------------------------------------------
describe('assertOptionalNumber', () => {
  it('returns the number when provided', () => {
    expect(assertOptionalNumber(10, 'x', 99)).toBe(10);
  });

  it('returns fallback for undefined', () => {
    expect(assertOptionalNumber(undefined, 'x', 99)).toBe(99);
  });

  it('returns fallback for null', () => {
    expect(assertOptionalNumber(null, 'x', 99)).toBe(99);
  });

  it('throws for non-number non-null value', () => {
    expect(() => assertOptionalNumber('bad', 'x', 0)).toThrow('"x" must be a finite number');
  });
});

// ---------------------------------------------------------------------------
// assertBoolean
// ---------------------------------------------------------------------------
describe('assertBoolean', () => {
  it('returns true', () => {
    expect(assertBoolean(true, 'x')).toBe(true);
  });

  it('returns false', () => {
    expect(assertBoolean(false, 'x')).toBe(false);
  });

  it('throws for string "true"', () => {
    expect(() => assertBoolean('true', 'x')).toThrow('"x" must be a boolean');
  });

  it('throws for number 1', () => {
    expect(() => assertBoolean(1, 'x')).toThrow('"x" must be a boolean');
  });

  it('throws for null', () => {
    expect(() => assertBoolean(null, 'x')).toThrow('"x" must be a boolean');
  });
});

// ---------------------------------------------------------------------------
// assertConfig
// ---------------------------------------------------------------------------
describe('assertConfig', () => {
  const valid = {
    claudeApiKey: 'sk-test',
    accountId: 12345,
    username: 'tanker99',
    region: 'EU',
    replaysDir: '/home/user/replays',
    autoRefresh: true,
  };

  it('returns the config unchanged when all fields are correct', () => {
    expect(assertConfig(valid)).toEqual(valid);
  });

  it('throws for null', () => {
    expect(() => assertConfig(null)).toThrow('"config" must be an object');
  });

  it('throws for non-object', () => {
    expect(() => assertConfig('string')).toThrow('"config" must be an object');
  });

  it('fills defaults for missing fields', () => {
    const result = assertConfig({});
    expect(result).toEqual({
      claudeApiKey: '',
      accountId: 0,
      username: '',
      region: 'EU',
      replaysDir: '',
      autoRefresh: true,
    });
  });

  it('fills defaults for wrong-typed fields', () => {
    const result = assertConfig({ claudeApiKey: 99, accountId: 'bad', region: null });
    expect(result.claudeApiKey).toBe('');
    expect(result.accountId).toBe(0);
    expect(result.region).toBe('EU');
  });

  it('rejects non-finite accountId and falls back to 0', () => {
    expect(assertConfig({ accountId: Infinity }).accountId).toBe(0);
    expect(assertConfig({ accountId: NaN }).accountId).toBe(0);
  });

  it('preserves valid partial config', () => {
    const result = assertConfig({ accountId: 777, region: 'NA' });
    expect(result.accountId).toBe(777);
    expect(result.region).toBe('NA');
    expect(result.claudeApiKey).toBe('');
  });
});
