/**
 * ISO-8601 week utilities.
 *
 * ISO weeks start on Monday. Week 1 of a year is the week containing the first
 * Thursday of that year (equivalently, the week containing Jan 4th).
 */

/**
 * Returns the ISO week string for a given ms timestamp in the format 'YYYY-Www'.
 * Examples: 2026-W01, 2026-W16, 2015-W53
 */
export function getIsoWeek(ms: number): string {
  const date = new Date(ms);
  const dayOfWeek = date.getDay(); // 0=Sun … 6=Sat

  // Remap JavaScript's Sunday=0 to ISO Mon=1 … Sun=7
  const d = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Offset to reach the Thursday of this ISO week.
  // Thursday is the pivot (Thu=4): Mon+3, Tue+2, Wed+1, Thu0, Fri-1, Sat-2, Sun-3
  const thursdayOffset = 4 - d;

  const thursday = new Date(date.getTime() + thursdayOffset * 86400000);

  // ISO year is the calendar year of that Thursday
  const isoYear = thursday.getFullYear();

  // Week 01 starts on the Monday that contains Jan 4 of isoYear.
  // (Jan 4 is always in W01 per ISO 8601.)
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Iso = jan4.getDay() === 0 ? 7 : jan4.getDay(); // remap Sun
  const w01Monday = new Date(jan4.getTime() - (jan4Iso - 1) * 86400000);

  const weekNum = Math.round((thursday.getTime() - w01Monday.getTime()) / (7 * 86400000)) + 1;

  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`;
}
