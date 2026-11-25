// 교사 채점 도우미 — 설계도에서 각 항목의 판단 근거를 세어 '추천 점수'로 보여 줌 (점수는 교사가 직접 누름)
// 사양: ②③④ 4~5칸 → 2 / 2~3칸 또는 전부 막연 → 1 / 0~1칸 → 0, ⑤ 4요소 모두+수치 → 2 / 2~3개 또는 수치 없음 → 1 / 0~1개 → 0
import { MOVE_AREAS } from './content';
import { FORMATS, FIELDS, RUN_WHERE_ALIAS, formatOf } from './program';

export const SPECIFIC_MIN = 10;   // 10자 미만은 '막연' (화면에서 노란색)
const len = (v) => String(v ?? '').trim().length;
export const cellState = (v) => (len(v) === 0 ? 'empty' : len(v) < SPECIFIC_MIN ? 'short' : 'ok');
const num = (v) => (v === '' || v == null ? NaN : Number(v));

function countRule(nSpecific, nFilled, total = 5) {
  if (nSpecific >= 4) return 2;
  if (nSpecific >= 2 || nFilled >= total - 1) return 1;   // 2~3칸 구체적, 또는 다 채웠지만 막연
  return 0;
}

const EVIDENCE = /기록|평균|자가진단|상위|하위|%|회|초|cm|kg|등급|힘듦|힘들|쉬움|분포|셔틀런|악력|플랭크|푸시업|멀리뛰기|유연성|1km|당기기/;

/** 항목별 { facts, suggest(0|1|2), rule } — 순서는 SCORE_ITEMS ①~⑤ */
export function gradingHints(g, weak) {
  const target = weak?.areas?.[0];
  const moves = g.moves;
  const counts = Object.fromEntries(MOVE_AREAS.map((a) => [a.key, moves.filter((m) => m.area === a.key).length]));
  const tCount = target ? counts[target] || 0 : 0;
  const otherMax = Math.max(0, ...MOVE_AREAS.filter((a) => a.key !== target).map((a) => counts[a.key]));
  const reason = weak?.reason || '';
  const hasEvidence = len(reason) >= SPECIFIC_MIN && EVIDENCE.test(reason);
  const most = target && tCount > otherMax;
  const one = {
    facts: `이유에 진단 근거 ${hasEvidence ? '있음' : '없음'} · 목표 부위 동작 ${tCount}개 (다른 부위 최대 ${otherMax}개)`,
    suggest: (hasEvidence ? 1 : 0) + (most ? 1 : 0),
    rule: '근거 있음 + 목표 부위 동작이 가장 많음 → 2 / 하나만 → 1 / 둘 다 없음 → 0',
  };
  const cells = (pick) => {
    const st = moves.map(pick);
    return { spec: st.filter((x) => x === 'ok').length, filled: st.filter((x) => x !== 'empty').length };
  };
  const rule = '4~5칸 → 2 / 2~3칸 또는 전부 막연 → 1 / 0~1칸 → 0';
  const mus = cells((m) => cellState(m.muscle));
  const ps = cells((m) => (cellState(m.posture) === 'ok' && cellState(m.safety) === 'ok' ? 'ok'
    : cellState(m.posture) === 'empty' || cellState(m.safety) === 'empty' ? 'empty' : 'short'));
  const dl = cells((m) => cellState(m.daily));
  const fmt = (c) => `구체적 ${c.spec}칸 · 막연 ${c.filled - c.spec}칸 · 빈칸 ${5 - c.filled}칸`;

  // ⑤ 4요소: 순서 / 횟수·시간 / 휴식 / 라운드·러닝
  const f = formatOf(g), F = FORMATS[f];
  const orders = moves.map((m) => num(m.order)).filter((n) => n >= 1);
  const okField = (k) => num(g[k]) >= FIELDS[k].min && num(g[k]) <= FIELDS[k].max;
  const els = {
    순서: orders.length === 5 && new Set(orders).size === 5,
    '횟수·시간': F.amounts ? moves.every((m) => num(m.val) > 0) : okField('work'),
    휴식: f === 'circuit' ? okField('restMove') && okField('restRound') : f === 'tabata' ? okField('rest') : true,
    '라운드·러닝': F.fields.filter((k) => !['restMove', 'restRound', 'rest', 'work'].includes(k)).every(okField)
      && (f === 'race' || (num(g.runDist) > 0 && F.runWhere.includes(RUN_WHERE_ALIAS[g.runWhere] || g.runWhere))),
  };
  const nEl = Object.values(els).filter(Boolean).length;
  const five = {
    facts: Object.entries(els).map(([k, v]) => `${k} ${v ? '✓' : '✗'}`).join(' · ') + (f !== 'circuit' && f !== 'tabata' ? ` (${F.name}: 휴식은 방식에 포함)` : ''),
    suggest: nEl >= 4 ? 2 : nEl >= 2 ? 1 : 0,
    rule: '4요소 모두 + 수치 → 2 / 2~3개 또는 수치 없음 → 1 / 0~1개 → 0',
  };
  return [
    one,
    { facts: fmt(mus), suggest: countRule(mus.spec, mus.filled), rule },
    { facts: `자세·안전 둘 다 ${fmt(ps)}`, suggest: countRule(ps.spec, ps.filled), rule },
    { facts: fmt(dl), suggest: countRule(dl.spec, dl.filled), rule },
    five,
  ];
}
