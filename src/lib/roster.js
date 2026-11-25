// 명렬표·팝스 기록 읽기 (순수 함수). 선생님이 스프레드시트에서 복사해 붙여넣은 표(2차원 배열)를 앱 형식으로 바꾼다.
//
// 받아들이는 표
//  1) 기본 명렬표: 반 · 번호 · 학번 · 이름 · (성별) · (1km)   — 머리글이 없으면 이 순서로 읽음
//  2) 팝스 '전체(통합)' 탭 그대로: 반(1-1) · 번호 · 이름 · 성별 · 셔틀런 · 유연성1차/2차/최고 · 악력…최고 · 멀리뛰기…최고 · 푸쉬업 · 플랭크 · 당기기 …
//     - 학번 열이 없으면 학년·반·번호로 만든다: 1-1반 1번 → 10101
//     - 빈 칸·'-'는 무시. '최고' 칸이 0인데 1차·2차가 모두 비어 있으면 기록 없음으로 봄 (시트 수식이 0을 채운 경우)
//     - 악력은 '최고' 칸들(오른손·왼손) 중 높은 값
//  3) 덧붙이기: 학번 + 1km(또는 측정 기록)만 있고 이름이 없는 표 → 이미 등록된 학생에게 기록만 더함
import { parseRun } from './design';

const MEASURE_COLS = [
  { key: 'shuttle', re: /셔틀/ },
  { key: 'pushup', re: /^(푸[시쉬]업|팔굽혀)/, not: /무릎|여부/ },
  { key: 'pull', re: /당기기/ },
  { key: 'grip', re: /악력/, maxOfBest: true },
  { key: 'plank', re: /플랭크/ },
  { key: 'jump', re: /멀리/ },
  { key: 'sitreach', re: /유연|좌전굴|앞으로\s*굽히기/ },
];

const clean = (c) => String(c ?? '').trim();
const pad2 = (n) => String(n).padStart(2, '0');
function num(v) {
  const t = clean(v).replace(/,/g, '');
  if (!t || t === '-' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
/** 1km 기록: '4:35', '4분 35초', 또는 수행평가 시트처럼 '435'(분·초를 붙여 씀) */
export function parseRunLoose(v) {
  const t = clean(v);
  if (/^\d{3,4}$/.test(t)) {
    const m = Math.floor(Number(t) / 100), s = Number(t) % 100;
    if (s < 60 && m >= 2 && m <= 20) return m * 60 + s;
  }
  return parseRun(t);
}
/** '1-1' → { grade: 1, cls: '1' }, '1반' / '1 ' → { cls: '1' } */
function parseClass(v) {
  const t = clean(v).replace(/반$/, '');
  const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return { grade: Number(m[1]), cls: String(Number(m[2])) };
  return { grade: null, cls: /^\d+$/.test(t) ? String(Number(t)) : t };
}

export function parseRoster(table) {
  const rows = table.map((r) => r.map(clean)).filter((r) => r.some((c) => c));
  if (!rows.length) return { rows: [], problems: ['내용이 없어요'], hasMeasures: false };
  const h = rows[0];
  const hasHeader = h.some((c) => /학번|이름|성명|번호/.test(c));
  const find = (re, not) => h.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const idx = hasHeader
    ? { cls: find(/^반$|^반\b|학급/), no: find(/번호/), sno: find(/학번/), name: find(/이름|성명/), sex: find(/성별/), run: find(/1\s*k|1키로|1킬로|1000\s*m/i) }
    : { cls: 0, no: 1, sno: 2, name: 3, sex: -1, run: 4 };
  if (hasHeader && idx.cls < 0) idx.cls = find(/반/, /번호/);

  // 측정 항목별로 쓸 칸: '최고'가 있으면 최고 칸(들), 없으면 이름이 맞는 첫 칸
  const measureCols = hasHeader ? MEASURE_COLS.map((m) => {
    const all = h.map((c, i) => (m.re.test(c) && !(m.not && m.not.test(c)) ? i : -1)).filter((i) => i >= 0);
    if (!all.length) return null;
    const best = all.filter((i) => /최고/.test(h[i]));
    const trials = all.filter((i) => !/최고/.test(h[i]));
    return { key: m.key, use: best.length ? (m.maxOfBest ? best : [best[0]]) : [all[0]], trials };
  }).filter(Boolean) : [];

  const out = [];
  const problems = [];
  const seen = new Set();
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const line = `${i + (hasHeader ? 2 : 1)}행`;
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] || '' : '');
    const name = get('name');
    const { grade, cls } = parseClass(get('cls'));
    const number = num(get('no'));
    let studentNo = get('sno').replace(/\s/g, '');
    if (!studentNo && name && cls && number != null) studentNo = `${grade || 1}${pad2(cls)}${pad2(number)}`;
    const runText = get('run');
    const runSec = runText ? parseRunLoose(runText) : null;
    const runNorm = runSec != null ? `${Math.floor(runSec / 60)}:${pad2(runSec % 60)}` : '';

    const vals = {};
    for (const mc of measureCols) {
      const trialsEmpty = mc.trials.length > 0 && mc.trials.every((t) => !clean(r[t]));
      const v = mc.use.map((u) => num(r[u])).filter((x) => x != null);
      if (!v.length) continue;
      const val = Math.max(...v);
      if (trialsEmpty && val === 0) continue;   // 시트 수식이 빈 기록에 0을 넣은 경우
      vals[mc.key] = val;
    }

    if (!name) {
      // 덧붙이기 줄: 학번 + 기록만
      if (!studentNo) return;
      if (runSec == null && !Object.keys(vals).length) return;
      out.push({ studentNo, runText: runNorm, runSec, vals: measureCols.length ? vals : undefined, appendOnly: true });
      return;
    }
    if (!studentNo || !cls) { problems.push(`${line} ${name}: 반·번호(또는 학번)가 비어 있어 건너뜀`); return; }
    if (seen.has(studentNo)) { problems.push(`${line} ${name}: 학번 ${studentNo} 중복이라 건너뜀`); return; }
    const sex = /^남/.test(get('sex')) ? '남' : /^여/.test(get('sex')) ? '여' : '';
    if (idx.sex >= 0 && !sex) problems.push(`${line} ${name}: 성별 '${get('sex')}' 확인 필요 (평균은 1학년 전체와 비교)`);
    if (runText && runSec == null) problems.push(`${line} ${name}: 1km 기록 '${runText}' 형식 확인 — 비워서 등록`);
    seen.add(studentNo);
    out.push({ className: cls, number, studentNo, name, sex, runText: runNorm, runSec, vals: measureCols.length ? vals : undefined });
  });
  return { rows: out, problems, hasMeasures: measureCols.length > 0, measureKeys: measureCols.map((m) => m.key) };
}
