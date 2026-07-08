/**
 * getVehicleEncyclopedia chunking — WG API rejects more than 100 IDs in a
 * single tank_id parameter with TANK_ID_LIST_LIMIT_EXCEEDED. Regression test
 * for veteran accounts owning more than 100 tanks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVehicleEncyclopedia } from '../main/services/wargaming';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('getVehicleEncyclopedia', () => {
  it('splits more than 100 tank IDs into multiple requests', async () => {
    const tankIds = Array.from({ length: 250 }, (_, i) => i + 1);

    fetchMock.mockImplementation(async (url: string) => {
      const params = new URL(url).searchParams;
      const ids = params.get('tank_id')!.split(',').map(Number);
      expect(ids.length).toBeLessThanOrEqual(100);
      const data: Record<number, unknown> = {};
      for (const id of ids) data[id] = { tank_id: id, name: `Tank ${id}`, tag: `t${id}`, tier: 1, type: 'mediumTank', nation: 'ussr', is_premium: false };
      return jsonResponse({ status: 'ok', data });
    });

    const result = await getVehicleEncyclopedia('key', 'EU', tankIds);

    expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(Object.keys(result)).toHaveLength(250);
    expect(result[1]).toMatchObject({ tank_id: 1 });
    expect(result[250]).toMatchObject({ tank_id: 250 });
  });

  it('makes a single unfiltered request when no tankIds are given', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const params = new URL(url).searchParams;
      expect(params.has('tank_id')).toBe(false);
      return jsonResponse({ status: 'ok', data: {} });
    });

    await getVehicleEncyclopedia('key', 'EU');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a single request when tankIds fit within the limit', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ status: 'ok', data: {} }));

    await getVehicleEncyclopedia('key', 'EU', [1, 2, 3]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
