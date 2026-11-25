import { histogram, topPercent, mean, rankLabel } from '../lib/stats';
import { papsGrade } from '../lib/paps';
import { fmtSec, fmtNum } from '../lib/design';

/**
 * 한 종목의 기록 분포(막대) + 내 위치.
 * values: 같은 성별(또는 1학년 전체) 기록, 이름 없음. lowerBetter: 1km처럼 작을수록 좋은 기록.
 */
export default function Distribution({ name, unit, mine, dist, lowerBetter, isTime, sex, measureKey, avgInfo }) {
  const values = (dist?.values || []).map(Number);
  const show = (v) => (isTime ? fmtSec(v) : `${fmtNum(v)}${unit}`);
  const has = mine != null && mine !== '' && Number.isFinite(Number(mine));
  const grade = has ? papsGrade(measureKey, sex, mine) : null;
  if (!values.length) {
    return <div className="dist"><div className="dist-head"><b>{name}</b> {has ? show(mine) : <span className="muted">기록 없음</span>}</div><p className="muted">분포 자료가 아직 없어요.</p></div>;
  }
  const top = has ? topPercent(values, Number(mine), lowerBetter) : null;
  const h = histogram(values, has ? Number(mine) : null);
  const maxN = Math.max(...h.bars.map((b) => b.n), 1);
  const W = 300, H = 72;
  const x = (v) => ((v - h.lo) / (h.hi - h.lo)) * W;
  const avg = avgInfo?.avg != null ? Number(avgInfo.avg) : mean(values);
  const myBar = has ? Math.min(h.bars.length - 1, Math.floor((Number(mine) - h.lo) / h.width)) : -1;
  return (
    <div className="dist" data-measure={measureKey}>
      <div className="dist-head">
        <b>{name}</b> {has ? <span>{show(mine)}</span> : <span className="muted">기록 없음</span>}
        {top != null && <span className={`dist-top ${top > 50 ? 'low' : ''}`}>{rankLabel(top)}</span>}
        {grade != null && <span className={`grade g${grade}`}>{grade}등급</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="dist-svg" role="img"
        aria-label={`${name} 분포${top != null ? `, ${rankLabel(top)}` : ''}`}>
        {h.bars.map((b, i) => {
          const bh = (b.n / maxN) * (H - 6);
          return <rect key={i} x={x(b.from) + 1} width={Math.max(1, x(b.to) - x(b.from) - 2)} y={H - bh} height={bh} rx="2"
            className={i === myBar ? 'me' : ''}><title>{`${show(b.from)}~${show(b.to)}: ${b.n}명`}</title></rect>;
        })}
        {avg != null && <line x1={x(avg)} x2={x(avg)} y1="0" y2={H} className="avg" />}
        {has && <path d={`M ${x(Number(mine))} ${H + 2} l -6 10 h 12 z`} className="me-mark" />}
      </svg>
      <div className="pos-lb">
        <span>{show(h.lo)}{lowerBetter ? ' (빠름)' : ''}</span>
        <span>┆ 평균 {avg != null ? show(avg) : '-'}</span>
        <span>{show(h.hi)}{lowerBetter ? ' (느림)' : ''}</span>
      </div>
      <div className="muted dist-foot">{dist.scope} {values.length}명 기준 · 주황 막대가 내 기록 구간</div>
    </div>
  );
}
