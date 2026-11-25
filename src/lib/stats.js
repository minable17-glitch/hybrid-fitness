// 분포·백분위 (순수 함수)

/** 상위 몇 %인지. 나보다 좋은 기록 수 + 같은 기록의 절반으로 계산, 1~100 */
export function topPercent(values, mine, lowerBetter) {
  const n = values.length;
  if (!n || mine == null || mine === '' || !Number.isFinite(Number(mine))) return null;
  const v = Number(mine);
  const better = values.filter((x) => (lowerBetter ? x < v : x > v)).length;
  const equal = values.filter((x) => x === v).length;
  return Math.min(100, Math.max(1, Math.round(((better + (equal + 1) / 2) / n) * 100)));
}

/** 히스토그램 구간. 값이 정수면 깔끔한 폭으로, bins 개 안팎 */
export function histogram(values, mine, bins = 10) {
  const all = mine != null && Number.isFinite(Number(mine)) ? [...values, Number(mine)] : values;
  if (!all.length) return { bars: [], lo: 0, hi: 0, width: 1 };
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / bins;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const width = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((w) => w >= raw) || raw;
  lo = Math.floor(lo / width) * width;
  const count = Math.max(1, Math.ceil((hi - lo) / width + 1e-9));
  const bars = Array.from({ length: count }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, n: 0 }));
  for (const x of values) bars[Math.min(count - 1, Math.floor((x - lo) / width))].n += 1;
  return { bars, lo, hi: lo + count * width, width };
}

/** 상위 50% 안쪽이면 '상위 n%', 아니면 '하위 m%' (상위 70% → 하위 31%) */
export function rankLabel(top) {
  if (top == null) return '';
  return top <= 50 ? `상위 ${top}%` : `하위 ${Math.max(1, 101 - top)}%`;
}

export const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
