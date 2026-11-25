// 훈련 방식(형식)별 프로그램 규칙 — 움직임 교과서 '하이브리드 훈련장'(train.html)의 구성 방식을 학교 수업용으로 줄인 것.
// 진행표(timeline)는 미리 보기·예상 시간·'바로 해 보기' 타이머가 같이 쓴다.
// 빈칸 검사(programErrors)는 supabase/schema.sql 의 design_errors 와 같은 규칙이어야 한다.
import { MOVE_COUNT, MOVE_AREAS, REP_SEC, DEFAULT_RUN_PACE } from './content';

// 러닝 위치 — 라운드가 있는 방식(서킷·포타임)은 사양대로 라운드 시작/끝/동작 사이, 나머지는 프로그램 시작 전/마지막
const ROUND_RUN = ['라운드 시작', '라운드 끝', '동작 사이'];
// 예전 값 → 새 값 (저장된 설계도 호환)
export const RUN_WHERE_ALIAS = { 라운드마다: '라운드 끝' };

export const FORMATS = {
  circuit: {
    name: '서킷', ko: '동작을 차례로 돌기', from: 'F45식 스테이션',
    rule: '동작을 정한 횟수·시간만큼 하고 다음 동작으로 넘어가요. 다섯 동작을 다 하면 한 바퀴예요.',
    tip: '동작 사이 휴식으로 자세를 다시 잡을 시간을 주세요.',
    fields: ['rounds', 'restMove', 'restRound'], amounts: true, runWhere: ROUND_RUN,
  },
  fortime: {
    name: '포타임', ko: '정해진 양을 빨리', from: '크로스핏 와드 (For Time)',
    rule: '정한 라운드만큼 목록을 최대한 빨리 끝내요. 기록은 걸린 시간이에요.',
    tip: '너무 길어지지 않게 시간 제한을 둬요. 지난 기록보다 빨라졌는지 비교하면 점진성의 원리를 확인할 수 있어요.',
    fields: ['rounds', 'cap'], amounts: true, runWhere: ROUND_RUN,
  },
  amrap: {
    name: 'AMRAP', ko: '시간 안에 최대한 많이', from: '크로스핏 와드 (As Many Rounds As Possible)',
    rule: '정한 시간 동안 목록을 계속 반복해요. 기록은 "몇 라운드 + 몇 동작"이에요.',
    tip: '처음에 힘을 다 쓰면 뒤에서 멈춰요. 끝까지 같은 속도를 지키는 게 요령이에요.',
    fields: ['min'], amounts: true, runWhere: ['시작 전', '마지막'],
  },
  emom: {
    name: 'EMOM', ko: '매 분 시작마다', from: '크로스핏 와드 (Every Minute On the Minute)',
    rule: '간격이 시작될 때 한 동작을 정한 횟수만큼 하고, 남은 시간은 쉬어요. 동작은 차례로 돌아가요.',
    tip: '간격의 2/3 안에 끝낼 수 있는 횟수로 정해야 쉬는 시간이 생겨요.',
    fields: ['min', 'every'], amounts: true, runWhere: ['시작 전', '마지막'],
  },
  tabata: {
    name: '타바타', ko: '20초 운동·10초 휴식', from: '인터벌 훈련',
    rule: '짧게 최대 강도로 운동하고 쉬기를 반복해요. 동작은 차례로 돌아가요.',
    tip: '짧지만 아주 힘들어요. 준비 운동을 충분히 한 뒤에 하세요.',
    fields: ['work', 'rest', 'rounds'], amounts: false, runWhere: ['시작 전', '마지막'],
  },
  race: {
    name: '하이록스식', ko: '달리기 + 스테이션', from: '하이록스 방식',
    rule: '달리기와 동작(스테이션)을 번갈아 해요. 달리기 → 동작 1 → 달리기 → 동작 2 …',
    tip: '달리기에서 힘을 아껴야 스테이션에서 자세가 무너지지 않아요.',
    fields: ['runM', 'cap'], amounts: true, runWhere: [],
  },
};
export const FORMAT_KEYS = Object.keys(FORMATS);

// 칸 이름·단위·범위·기본값
export const FIELDS = {
  rounds: { label: '라운드(바퀴)', unit: '번', min: 1, max: 20, def: 3 },
  restMove: { label: '동작 사이 휴식', unit: '초', min: 0, max: 180, def: 15 },
  restRound: { label: '라운드 사이 휴식', unit: '초', min: 0, max: 300, def: 60 },
  cap: { label: '시간 제한', unit: '분', min: 3, max: 30, def: 15 },
  min: { label: '전체 시간', unit: '분', min: 3, max: 20, def: 10 },
  every: { label: '간격', unit: '분', min: 1, max: 3, def: 1 },
  work: { label: '운동', unit: '초', min: 10, max: 60, def: 20 },
  rest: { label: '휴식', unit: '초', min: 5, max: 60, def: 10 },
  runM: { label: '한 번 달리기', unit: 'm', min: 50, max: 400, def: 200 },
};
// 타바타는 라운드 기본값이 다름 (다섯 동작을 두 바퀴)
export const fieldDefault = (format, k) => (format === 'tabata' && k === 'rounds' ? 10 : FIELDS[k].def);

const num = (v) => (v === '' || v == null ? NaN : Number(v));
export const formatOf = (g) => (FORMATS[g?.format] ? g.format : 'circuit');

/** 순서대로 정렬한 동작 (순서를 안 정한 동작은 뒤에) */
export function orderedMoves(g) {
  return g.moves.map((m, i) => ({ ...m, i }))
    .sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99) || a.i - b.i);
}
const moveSec = (m) => (num(m.val) > 0 ? (m.mode === '초' ? num(m.val) : num(m.val) * REP_SEC) : 0);
const amountTxt = (m) => (num(m.val) > 0 ? `${m.val}${m.mode}` : '');
const paceOf = (runSec) => (runSec ? (runSec * 1.15) / 1000 : DEFAULT_RUN_PACE);

/**
 * 진행표. seg = { kind: 'work'|'rest'|'run'|'amrap', label, sub, dur(초, 정해진 시간이면), est(예상 초) }
 * dur 가 없으면 '다 했으면 누르기'로 넘어감 (횟수 동작·달리기)
 */
export function timeline(g, runSec) {
  const f = formatOf(g), P = (k) => (num(g[k]) >= 0 ? num(g[k]) : fieldDefault(f, k));
  const ms = orderedMoves(g).filter((m) => String(m.name || '').trim() || num(m.val) > 0);
  const pace = paceOf(runSec);
  const segs = [];
  const work = (m, extra = {}) => ({ kind: 'work', label: m.name || `동작 ${m.i + 1}`, sub: amountTxt(m), dur: m.mode === '초' && num(m.val) > 0 ? num(m.val) : null, est: moveSec(m), area: m.area, ...extra });
  const rest = (s, label = '휴식') => (s > 0 ? { kind: 'rest', label, sub: `${s}초`, dur: s, est: s } : null);
  const run = (d) => (d > 0 ? { kind: 'run', label: '러닝', sub: `${d}m`, dur: null, est: Math.round(d * pace) } : null);
  const push = (s) => { if (s) segs.push(s); };
  const runD = num(g.runDist) > 0 ? num(g.runDist) : 0;
  const where = RUN_WHERE_ALIAS[g.runWhere] || g.runWhere;
  if (f !== 'race' && where === '시작 전') push(run(runD));
  if (f === 'circuit' || f === 'fortime') {
    const R = Math.max(1, P('rounds'));
    for (let r = 0; r < R; r++) {
      if (where === '라운드 시작') push(run(runD));
      ms.forEach((m, k) => {
        push(work(m, { round: r + 1 }));
        if (k < ms.length - 1) {
          if (where === '동작 사이') push(run(runD));
          if (f === 'circuit') push(rest(P('restMove')));
        }
      });
      if (where === '라운드 끝') push(run(runD));
      if (f === 'circuit' && r < R - 1) push(rest(P('restRound'), '라운드 휴식'));
    }
  } else if (f === 'amrap') {
    if (ms.length) segs.push({ kind: 'amrap', label: `AMRAP ${P('min')}분`, sub: ms.map((m) => `${m.name} ${amountTxt(m)}`).join(' → '), dur: P('min') * 60, est: P('min') * 60, items: ms.map((m) => work(m)) });
  } else if (f === 'emom') {
    const ev = Math.max(1, P('every')), n = Math.max(1, Math.floor(P('min') / ev));
    if (ms.length) for (let i = 0; i < n; i++) { const m = ms[i % ms.length]; push(work(m, { dur: ev * 60, est: ev * 60, sub: `${amountTxt(m)} 하고 남은 시간 쉬기`, tag: `${i * ev + 1}분째` })); }
  } else if (f === 'tabata') {
    const W = P('work'), Rr = P('rest'), n = Math.max(1, P('rounds'));
    if (ms.length) for (let i = 0; i < n; i++) { push(work(ms[i % ms.length], { dur: W, est: W, sub: `${W}초 최대한`, tag: `${i + 1}/${n}` })); if (i < n - 1) push(rest(Rr)); }
  } else if (f === 'race') {
    ms.forEach((m) => { push(run(P('runM'))); push(work(m)); });
  }
  if (f !== 'race' && where === '마지막') push(run(runD));
  const sum = segs.reduce((t, s) => t + (s.est || 0), 0);
  const cap = f === 'fortime' || f === 'race' ? P('cap') * 60 : null;
  return { format: f, segs, total: Math.round(cap ? Math.min(sum, cap) : sum), raw: Math.round(sum), cap };
}

/** 예상 소요시간 (초) — 예전 estimate() 와 같은 모양으로도 돌려줌 */
export function programEstimate(g, runSec) {
  const t = timeline(g, runSec);
  return { total: t.total, raw: t.raw, cap: t.cap, segs: t.segs.length, format: t.format };
}

/** 빈칸·형식 검사 (schema.sql design_errors 와 같은 규칙) */
export function programErrors(g) {
  const f = formatOf(g), F = FORMATS[f], e = [];
  if (g.format && !FORMATS[g.format]) e.push('훈련 방식');
  g.moves.forEach((m, i) => {
    const lb = `동작 ${i + 1}`;
    const blank = (v) => String(v ?? '').trim() === '';
    if (blank(m.name)) e.push(`${lb} 동작명`);
    if (!MOVE_AREAS.some((a) => a.key === m.area)) e.push(`${lb} 부위`);
    if (blank(m.muscle)) e.push(`${lb} 사용 근육`);
    if (blank(m.posture)) e.push(`${lb} 정확한 자세`);
    if (blank(m.safety)) e.push(`${lb} 안전 유의사항`);
    if (blank(m.daily)) e.push(`${lb} 일상 활용`);
    if (F.amounts && !(num(m.val) > 0)) e.push(`${lb} 횟수/시간`);
    if (!(num(m.order) >= 1)) e.push(`${lb} 순서`);
  });
  const orders = g.moves.map((m) => num(m.order)).filter((n) => n >= 1);
  if (orders.length === MOVE_COUNT && new Set(orders).size !== MOVE_COUNT) e.push('동작 순서가 겹침');
  for (const k of F.fields) {
    const v = num(g[k]), d = FIELDS[k];
    if (!(v >= d.min && v <= d.max)) e.push(`${d.label} (${d.min}~${d.max}${d.unit})`);
  }
  if (f !== 'race') {
    if (!(num(g.runDist) > 0)) e.push('러닝 거리');
    if (!F.runWhere.includes(RUN_WHERE_ALIAS[g.runWhere] || g.runWhere)) e.push('러닝 위치');
  }
  return e;
}

/** 지금 형식에서 고칠 만한 점 (제출은 막지 않음) */
export function programHints(g, runSec) {
  const f = formatOf(g), h = [];
  if (f === 'emom') {
    const ev = (num(g.every) || 1) * 60;
    g.moves.forEach((m, i) => { if (moveSec(m) > ev * 0.75) h.push(`동작 ${i + 1}은 ${Math.round(ev / 60)}분 간격 안에 끝내기 어려워요. 횟수를 줄여 보세요.`); });
  }
  const t = timeline(g, runSec);
  if (t.cap && t.raw > t.cap) h.push(`예상 시간이 시간 제한(${t.cap / 60}분)보다 길어요. 다 못 끝낼 수 있어요.`);
  return h;
}

/** 형식을 바꿀 때 비어 있는 칸에 기본값 채우기 */
export function withFormatDefaults(g, format) {
  const next = { ...g, format };
  for (const k of FORMATS[format].fields) if (next[k] === '' || next[k] == null) next[k] = fieldDefault(format, k);
  if (RUN_WHERE_ALIAS[next.runWhere]) next.runWhere = RUN_WHERE_ALIAS[next.runWhere];
  if (format !== 'race' && !FORMATS[format].runWhere.includes(next.runWhere)) next.runWhere = '';
  return next;
}

/** 진행표를 한 줄씩 짧게 (미리 보기·교사 화면) */
export function timelineSummary(g) {
  const f = formatOf(g), F = FORMATS[f], P = (k) => (g[k] === '' || g[k] == null ? '?' : g[k]);
  const parts = {
    circuit: `${P('rounds')}바퀴 · 동작 사이 ${P('restMove')}초 · 라운드 사이 ${P('restRound')}초`,
    fortime: `${P('rounds')}라운드 · 제한 ${P('cap')}분`,
    amrap: `${P('min')}분 동안 반복`,
    emom: `${P('min')}분 · ${Number(P('every')) > 1 ? `${P('every')}분마다` : '매 분'} 한 동작`,
    tabata: `${P('work')}초 운동 / ${P('rest')}초 휴식 × ${P('rounds')}`,
    race: `${P('runM')}m 달리기 × ${MOVE_COUNT} · 제한 ${P('cap')}분`,
  };
  const run = f === 'race' ? '' : g.runDist ? ` · 러닝 ${g.runDist}m (${g.runWhere || '위치 미정'})` : '';
  return `${F.name} — ${parts[f]}${run}`;
}
