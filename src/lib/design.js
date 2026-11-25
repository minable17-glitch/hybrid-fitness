// 설계도·채점 규칙 (순수 함수). 서버(schema.sql)의 design_errors / design_convert / perf_convert 와 같은 규칙.
import { MOVE_COUNT, MOVE_AREAS, QUESTION_COUNT, AREAS, MIN_REASON } from './content';
import { FORMATS, RUN_WHERE_ALIAS, programErrors, programEstimate } from './program';

export function emptyDesign() {
  return {
    moves: Array.from({ length: MOVE_COUNT }, () => ({ name: '', area: '', muscle: '', posture: '', safety: '', daily: '', order: '', mode: '회', val: '' })),
    format: 'circuit',
    restMove: '', restRound: '', rounds: '', runDist: '', runWhere: '',
    cap: '', min: '', every: '', work: '', rest: '', runM: '',
  };
}

/** 서버에서 온 data를 항상 5칸 구조로 맞춘다 */
export function normalizeDesign(data) {
  const base = emptyDesign();
  if (!data || typeof data !== 'object') return base;
  base.moves = base.moves.map((m, i) => ({ ...m, ...(data.moves?.[i] || {}) }));
  // 예전 형식(자세·안전을 한 칸 'form'에)으로 저장된 설계도는 '정확한 자세' 칸으로 옮김
  base.moves.forEach((m) => { if (m.form && !m.posture) m.posture = m.form; delete m.form; });
  for (const k of ['format', 'restMove', 'restRound', 'rounds', 'runDist', 'runWhere', 'cap', 'min', 'every', 'work', 'rest', 'runM']) if (data[k] != null) base[k] = data[k];
  if (!FORMATS[base.format]) base.format = 'circuit';   // 형식이 없던 예전 설계도는 서킷
  if (RUN_WHERE_ALIAS[base.runWhere]) base.runWhere = RUN_WHERE_ALIAS[base.runWhere];
  return base;
}

export const moveLabel = (i) => `동작 ${i + 1}`;

/** 목표 부위와 같은 동작이 몇 칸인지 (설계도 상단·채점 ① 에 표시) */
export function weakShare(g, weakAreas) {
  const counts = Object.fromEntries(MOVE_AREAS.map((a) => [a.key, 0]));
  g.moves.forEach((m) => { if (m.area in counts) counts[m.area] += 1; });
  const hit = g.moves.filter((m) => m.area && weakAreas.includes(m.area)).length;
  return { counts, hit, total: g.moves.length };
}

/** 빈칸 검사 — 훈련 방식별 규칙은 program.js */
export const designErrors = (g) => programErrors(g);

/** 예상 소요시간(초) — 훈련 방식별 진행표로 계산 (program.js) */
export const estimate = (g, runSec) => programEstimate(g, runSec);

export function designConvert(sum, isBlank) {
  if (isBlank) return 2;
  if (sum == null || sum === '') return null;
  // 5항목 합계(0~10): 9~10→14, 8→12, 7→10, 5~6→8, 3~4→6, 0~2(제출)→4
  return sum >= 9 ? 14 : sum >= 8 ? 12 : sum >= 7 ? 10 : sum >= 5 ? 8 : sum >= 3 ? 6 : 4;
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
/** 목표 부위: 5개 동작 부위 중 하나 + 이유 10자 이상 (예전 '약점' 1~2개 → 사양 변경으로 1개) */
export const weakDone = (w) => w.areas.length === 1 && MOVE_AREAS.some((a) => a.key === w.areas[0]) && String(w.reason || '').trim().length >= MIN_REASON;

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
