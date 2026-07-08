/**
 * Extracts the WG vehicle tag from a replay playerVehicle key.
 * "uk-GB123_GSOR_1006_v7"  → "GB123_GSOR_1006_v7"
 * "sweden:S10_Strv_107_12" → "S10_Strv_107_12"
 *
 * The trailing _v<N> version suffix (added by WG when updating tank models)
 * is stripped because the WG encyclopedia API tag field does not include it —
 * the lookup would silently fail for any versioned tank otherwise.
 */
export function extractVehicleTag(tankKey: string): string {
  return tankKey.replace(/^[^:-]+-/, '').replace(/^[^:]+:/, '').replace(/_v\d+$/, '');
}

/**
 * Human-readable tank name from a vehicle key:
 * "uk-GB123_GSOR_1006_v7" → "GSOR 1006"
 */
export function formatTankName(vehicleKey: string): string {
  const tag = extractVehicleTag(vehicleKey);
  const underscoreIdx = tag.indexOf('_');
  if (underscoreIdx === -1) return tag;
  return tag.slice(underscoreIdx + 1).replace(/_/g, ' ');
}
