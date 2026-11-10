// 설계도·채점 규칙 (순수 함수). 서버(schema.sql)의 design_errors / design_convert / perf_convert 와 같은 규칙.
import { MOVE_COUNT, WEAK_MOVES, RUN_WHERE, REP_SEC, DEFAULT_RUN_PACE, QUESTION_COUNT, AREAS, MEASURES, MIN_REASON } from './content';

export function emptyDesign() {
  return {
    moves: Array.from({ length: MOVE_COUNT }, () => ({ name: '', muscle: '', form: '', daily: '', order: '', mode: '회', val: '' })),
    restMove: '', restRound: '', rounds: '', runDist: '', runWhere: '',
  };
}

/** 서버에서 온 data를 항상 5칸 구조로 맞춘다 */
export function normalizeDesign(data) {
  const base = emptyDesign();
  if (!data || typeof data !== 'object') return base;
  base.moves = base.moves.map((m, i) => ({ ...m, ...(data.moves?.[i] || {}) }));
  for (const k of ['restMove', 'restRound', 'rounds', 'runDist', 'runWhere']) if (data[k] != null) base[k] = data[k];
  return base;
}

export const moveLabel = (i) => (i < WEAK_MOVES ? `약점 동작 ${i + 1}` : `그 외 동작 ${i - WEAK_MOVES + 1}`);
const blank = (v) => String(v ?? '').trim() === '';
const num = (v) => (v === '' || v == null ? NaN : Number(v));

export function designErrors(g) {
  const e = [];
  g.moves.forEach((m, i) => {
    const lb = moveLabel(i);
    if (blank(m.name)) e.push(`${lb} 동작명`);
    if (blank(m.muscle)) e.push(`${lb} 사용 근육`);
    if (blank(m.form)) e.push(`${lb} 자세·안전`);
    if (blank(m.daily)) e.push(`${lb} 일상 활용`);
    if (!(num(m.val) > 0)) e.push(`${lb} 횟수/시간`);
    if (!(num(m.order) >= 1)) e.push(`${lb} 순서`);
  });
  const orders = g.moves.map((m) => num(m.order)).filter((n) => n >= 1);
  if (orders.length === MOVE_COUNT && new Set(orders).size !== MOVE_COUNT) e.push('동작 순서가 겹침');
  if (!(num(g.restMove) >= 0)) e.push('동작 사이 휴식');
  if (!(num(g.restRound) >= 0)) e.push('라운드 사이 휴식');
  if (!(num(g.rounds) >= 1)) e.push('라운드 수');
  if (!(num(g.runDist) > 0)) e.push('러닝 거리');
  if (!RUN_WHERE.includes(g.runWhere)) e.push('러닝 위치');
  return e;
}

/** 예상 소요시간(초). 러닝은 본인 1km 기록보다 15% 느린 속도, 기록이 없으면 1km 7분 */
export function estimate(g, runSec) {
  const moves = g.moves.reduce((t, m) => t + (num(m.val) > 0 ? (m.mode === '초' ? num(m.val) : num(m.val) * REP_SEC) : 0), 0);
  const rounds = Math.max(0, num(g.rounds) || 0);
  const perRound = moves + (num(g.restMove) || 0) * (MOVE_COUNT - 1);
  const pace = runSec ? (runSec * 1.15) / 1000 : DEFAULT_RUN_PACE;
  const runOnce = (num(g.runDist) || 0) * pace;
  const runTimes = g.runWhere === '라운드마다' ? rounds : g.runWhere ? 1 : 0;
  const restRounds = Math.max(0, rounds - 1) * (num(g.restRound) || 0);
  return { total: Math.round(rounds * perRound + restRounds + runOnce * runTimes), perRound, rounds, restRounds, runOnce, runTimes };
}

export function designConvert(sum, isBlank) {
  if (isBlank) return 2;
  if (sum == null || sum === '') return null;
  return sum >= 13 ? 14 : sum >= 11 ? 12 : sum >= 9 ? 10 : sum >= 7 ? 8 : sum >= 5 ? 6 : 4;
}
export function perfConvert(p1, p2) {
  const v = [p1, p2].map((x) => String(x ?? ''));
  if (v.every((x) => x === '')) return null;
  const nums = v.filter((x) => /^[012]$/.test(x)).map(Number);
  if (!nums.length) return 2;
  return { 4: 6, 3: 5, 2: 4, 1: 3, 0: 2 }[nums.reduce((a, b) => a + b, 0)];
}

/* 단계 완료 판정 (서버도 같은 기준으로 done 을 저장) */
export const diagDone = (answers) => answers.length === QUESTION_COUNT && answers.every((v) => v >= 1 && v <= 3);
export const validMeasure = (m, v) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= m.min && Number(v) <= m.max;
export const measureDone = (vals) => MEASURES.every((m) => validMeasure(m, vals[m.key]));
export const weakDone = (w) => w.areas.length >= 1 && w.areas.length <= 2 && String(w.reason || '').trim().length >= MIN_REASON;

/** 부위별 자가진단 합계 (3~9, 미응답이 있으면 null) */
export function diagSums(answers) {
  let i = 0;
  return AREAS.map((a) => {
    const part = a.questions.map(() => answers[i++] || 0);
    return { key: a.key, name: a.name, sum: part.every((v) => v >= 1) ? part.reduce((x, y) => x + y, 0) : null };
  });
}

/** "4:35", "4분 35초", "275" → 초. 스프레드시트가 시각(4:35:00)으로 바꾼 것도 4분 35초로 읽음 */
export function parseRun(v) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1]) === 0 ? Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+)\s*[:분'′]\s*(\d+)\s*(초|"|″)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+)\s*분$/);
  if (m) return Number(m[1]) * 60;
  m = t.match(/^(\d+(?:\.\d+)?)\s*(초)?$/);
  if (m) return Math.round(Number(m[1]));
  return null;
}

export function fmtSec(s) {
  if (s == null || s === '' || !Number.isFinite(Number(s))) return '-';
  s = Math.round(Number(s));
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
}
export const fmtNum = (v, d = 1) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '-' : String(Math.round(Number(v) * 10 ** d) / 10 ** d));
export const clsLabel = (c) => (/반$/.test(String(c ?? '')) ? String(c) : `${c}반`);
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
