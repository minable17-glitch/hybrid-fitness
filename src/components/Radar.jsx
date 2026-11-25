import { MEASURES, AREAS } from '../lib/content';
import { topPercent } from '../lib/stats';
import { diagSums } from '../lib/design';

/** 방사형 그래프. axes: [{label, value: 0~100 | null, sub?}] — 바깥(100)일수록 좋음, 점선 원 = 50 */
export function Radar({ title, note, axes, color = 'var(--primary)' }) {
  const S = 300, C = S / 2, R = 104;
  const n = axes.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [C + Math.cos(a) * R * (v / 100), C + Math.sin(a) * R * (v / 100)];
  };
  const ring = (v) => axes.map((_, i) => pt(i, v).join(',')).join(' ');
  const has = axes.filter((a) => a.value != null);
  const poly = axes.map((a, i) => pt(i, a.value ?? 0).join(',')).join(' ');
  return (
    <div className="radar">
      <b>{title}</b>
      <svg viewBox={`-75 -10 ${S + 150} ${S + 20}`} role="img" aria-label={`${title}: ${axes.map((a) => `${a.label} ${a.value ?? '기록 없음'}`).join(', ')}`}>
        {[25, 75, 100].map((v) => <polygon key={v} points={ring(v)} className="r-grid" />)}
        <polygon points={ring(50)} className="r-mid" />
        {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={C} y1={C} x2={x} y2={y} className="r-axis" />; })}
        {has.length >= 3 && <polygon points={poly} className="r-shape" style={{ fill: color, stroke: color }} />}
        {axes.map((a, i) => a.value != null && (() => { const [x, y] = pt(i, a.value); return <circle key={i} cx={x} cy={y} r="4" style={{ fill: color }} />; })())}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 122);
          const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end';
          return (
            <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="r-label">
              <tspan x={x} dy="-0.4em">{a.label}</tspan>
              <tspan x={x} dy="1.2em" className={a.value == null ? 'r-none' : 'r-sub'}>{a.value == null ? '기록 없음' : a.sub}</tspan>
            </text>
          );
        })}
      </svg>
      {note && <div className="muted" style={{ fontSize: 12 }}>{note}</div>}
    </div>
  );
}

/** 측정 기록 → 같은 성별 1학년 중 앞서는 비율(100 - 상위%) */
export function measureAxes(vals, runSec, dist) {
  const items = MEASURES.map((m) => ({ key: m.key, label: m.name.replace('제자리멀리뛰기', '멀리뛰기'), mine: vals?.[m.key] }))
    .concat([{ key: 'run1km', label: '1km', mine: runSec, lowerBetter: true }]);
  return items.map((it) => {
    const values = (dist?.[it.key]?.values || []).map(Number);
    const top = it.mine == null || it.mine === '' ? null : topPercent(values, Number(it.mine), it.lowerBetter);
    return { label: it.label, value: top == null ? null : Math.max(0, 100 - top), sub: top == null ? '' : `상위 ${top}%` };
  });
}

/** 자가진단 → 부위별 '쉬운 정도' (합계 3 = 100, 9 = 0) */
export function diagAxes(answers) {
  return diagSums(answers).map((s) => ({
    label: (AREAS.find((a) => a.key === s.key)?.name || s.name).replace('상체 당기는 힘·악력', '당기기·악력').replace('상체 미는 힘', '미는 힘'),
    value: s.sum == null ? null : Math.round(((9 - s.sum) / 6) * 100),
    sub: s.sum == null ? '' : s.sum <= 4 ? '쉬움' : s.sum <= 6 ? '가끔 힘듦' : '자주 힘듦',
  }));
}

export function RadarPair({ vals, runSec, dist, answers }) {
  return (
    <div className="grid2 radar-pair">
      <Radar title="측정 기록" axes={measureAxes(vals, runSec, dist)} note="바깥일수록 좋은 기록 · 점선 = 같은 성별 1학년의 가운데" />
      <Radar title="일상 자가진단" axes={diagAxes(answers)} color="var(--accent)" note="바깥일수록 일상에서 쉬움 · 점선 = 가끔 힘듦" />
    </div>
  );
}
