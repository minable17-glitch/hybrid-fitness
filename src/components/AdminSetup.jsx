import { useState } from 'react';
import { adminSaveSettings, adminImportRoster, adminDeleteStudent } from '../lib/api';
import { MEASURES, RUN, SCORE_ITEMS } from '../lib/content';
import { parseRun, fmtSec, fmtNum, clsLabel } from '../lib/design';
import { Modal } from './ui';

/* ── 학교 평균 ── */
export function AdminAverages({ ov, setOv, showToast }) {
  const rows = MEASURES.map((m) => ({ key: m.key, name: m.name, unit: m.unit })).concat([{ key: RUN.key, name: RUN.name, unit: '초', isRun: true }]);
  const [draft, setDraft] = useState(() => {
    const o = {};
    rows.forEach((r) => {
      const v = ov.settings.avgOverrides?.[r.key];
      o[r.key] = v == null || v === '' ? '' : r.isRun ? fmtSec(v).replace('분 ', ':').replace('초', '') : String(v);
    });
    return o;
  });
  async function save() {
    const out = {};
    for (const r of rows) {
      const t = String(draft[r.key] || '').trim();
      if (!t) continue;
      const v = r.isRun ? parseRun(t) : Number(t);
      if (v == null || !Number.isFinite(v)) { showToast(`${r.name} 기준값 형식을 확인해주세요`); return; }
      out[r.key] = v;
    }
    try {
      setOv(await adminSaveSettings({ avgOverrides: out }));
      showToast('저장했어요');
    } catch (e) { showToast(e.message); }
  }
  const f = (r, v) => (v == null ? '-' : r.isRun ? fmtSec(v) : `${fmtNum(v)}${r.unit}`);
  return (
    <div className="card">
      <h2>학교 평균</h2>
      <p className="muted" style={{ marginTop: 0 }}>학생 기록이 쌓이면 자동으로 계산돼요. 기준값을 넣으면 자동 평균 대신 그 값을 써요. 1km는 4:35 또는 초.</p>
      <div className="tbl-wrap"><table>
        <thead><tr><th>항목</th><th className="c">자동 평균</th><th className="c">인원</th><th>기준값 (선택)</th><th className="c">지금 쓰는 값</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const a = ov.averages[r.key] || {};
            return (
              <tr key={r.key}>
                <td>{r.name}</td><td className="c">{f(r, a.auto)}</td><td className="c">{a.n || 0}명</td>
                <td><input className="inp" style={{ width: 130, padding: '6px 8px' }} placeholder="비우면 자동" value={draft[r.key]}
                  onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })} /></td>
                <td className="c">{f(r, a.avg)} {a.source === '기준값' && <span className="muted">(기준값)</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={save}>기준값 저장</button></div>
    </div>
  );
}

/* ── 명렬표 읽기: 붙여넣기(탭/쉼표) 또는 엑셀 파일. 머리글이 있으면 열 이름으로, 없으면 반·번호·학번·이름·1km 순서 ── */
function parseRoster(table) {
  const rows = table.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c));
  if (!rows.length) return { rows: [], problems: ['내용이 없어요'] };
  let idx = { cls: 0, no: 1, sno: 2, name: 3, run: 4 };
  let start = 0;
  const h = rows[0];
  if (h.some((c) => c.includes('학번'))) {
    const find = (re) => h.findIndex((c) => re.test(c));
    idx = { cls: find(/반/), no: find(/번호/), sno: find(/학번/), name: find(/이름|성명/), run: find(/1\s*km|달리기|오래/i) };
    start = 1;
  }
  const out = [];
  const problems = [];
  const seen = new Set();
  rows.slice(start).forEach((r, i) => {
    const line = `${i + start + 1}행`;
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] || '' : '');
    const studentNo = get('sno').replace(/\s/g, '');
    const runText = get('run');
    const item = { className: get('cls').replace(/반$/, ''), number: Number(get('no')) || null, studentNo, name: get('name'), runText, runSec: parseRun(runText) };
    if (!studentNo || !item.name || !item.className) { problems.push(`${line}: 반·학번·이름 중 빈칸`); return; }
    if (seen.has(studentNo)) { problems.push(`${line}: 학번 ${studentNo} 중복`); return; }
    if (runText && item.runSec == null) problems.push(`${line}: 1km 기록 형식 확인 (예: 4:35) — 비워서 등록`);
    seen.add(studentNo);
    out.push(item);
  });
  return { rows: out, problems };
}

async function exportScores(students) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const head = ['반', '번호', '학번', '이름', ...SCORE_ITEMS.map((s) => s.label), '설계합계(10)', '설계점수(14)', '수행1', '수행2', '수행점수(6)', '합계(20)', '설계도 상태'];
  const classes = [...new Set(students.map((s) => s.className))].sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true }));
  for (const c of classes) {
    const rows = students.filter((s) => s.className === c).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)).map((s) => {
      const sc = s.score || {};
      // 제출도 채점도 안 된 학생은 미참여 2점
      const design = sc.design_score ?? (s.designStatus !== '제출' ? 2 : '');
      const perf = sc.perf_score ?? '';
      const total = design !== '' && perf !== '' ? design + perf : '';
      return [s.className, s.number, s.studentNo, s.name, ...(sc.items || SCORE_ITEMS.map(() => null)).slice(0, SCORE_ITEMS.length).map((v) => v ?? ''),
        sc.design_sum ?? '', design, sc.perf1 || '', sc.perf2 || '', perf, total, s.designStatus || '미작성'];
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), clsLabel(c).slice(0, 31));
  }
  const d = new Date();
  XLSX.writeFile(wb, `하이브리드체력_일람표_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}

/* ── 명렬표·설정·일람표 ── */
export function AdminSetup({ ov, setOv, allStudents, refresh, showToast }) {
  const s = ov.settings;
  const [sus, setSus] = useState(String(s.suspiciousChars));
  const [code, setCode] = useState(s.signupCode || '');
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  async function patch(p, msg) {
    try { setOv(await adminSaveSettings(p)); showToast(msg || '저장했어요'); } catch (e) { showToast(e.message); }
  }
  function readPaste() {
    const lines = paste.split(/\r?\n/);
    const sep = paste.includes('\t') ? '\t' : ',';
    setParsed(parseRoster(lines.map((l) => l.split(sep))));
  }
  async function readFile(file) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames[0]];
    setParsed(parseRoster(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })));
  }
  async function upload() {
    setBusy(true);
    try {
      const r = await adminImportRoster(parsed.rows);
      showToast(`새로 ${r.inserted}명, 수정 ${r.updated}명`);
      setParsed(null);
      setPaste('');
      await refresh();
    } catch (e) { showToast(e.message); } finally { setBusy(false); }
  }
  async function removeStudent() {
    try { await adminDeleteStudent(del.studentNo); setDel(null); await refresh(); showToast('삭제했어요'); } catch (e) { showToast(e.message); }
  }

  const counts = {};
  allStudents.forEach((x) => { counts[x.className] = (counts[x.className] || 0) + 1; });
  return (
    <>
      <div className="grid2">
        <div className="card">
          <h2>수업 열기 / 닫기</h2>
          <div className="switch"><div><b>진단 입력</b><div className="muted">자가진단 · 측정 기록 · 약점 선택</div></div>
            <button className={`btn ${s.diagOpen ? 'btn-primary' : 'btn-outline'}`} type="button" data-sw="diagOpen" onClick={() => patch({ diagOpen: !s.diagOpen }, s.diagOpen ? '진단을 닫았어요' : '진단을 열었어요')}>{s.diagOpen ? '열림 → 닫기' : '닫힘 → 열기'}</button></div>
          <div className="switch"><div><b>설계도 작성</b><div className="muted">임시저장 · 최종 제출</div></div>
            <button className={`btn ${s.designOpen ? 'btn-primary' : 'btn-outline'}`} type="button" data-sw="designOpen" onClick={() => patch({ designOpen: !s.designOpen }, s.designOpen ? '설계도를 닫았어요' : '설계도를 열었어요')}>{s.designOpen ? '열림 → 닫기' : '닫힘 → 열기'}</button></div>
          <div className="switch"><div><b>의심 입력 기준</b><div className="muted">한 번에 늘어난 글자 수</div></div>
            <div className="row"><input className="inp" type="number" style={{ width: 80 }} value={sus} onChange={(e) => setSus(e.target.value)} />
              <button className="btn btn-outline btn-sm" type="button" onClick={() => patch({ suspiciousChars: sus })}>저장</button></div></div>
          <div className="switch"><div><b>교사 가입 코드</b><div className="muted">다른 선생님이 계정을 만들 때 필요</div></div>
            <div className="row"><input className="inp" style={{ width: 140 }} value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn btn-outline btn-sm" type="button" onClick={() => patch({ signupCode: code })}>저장</button></div></div>
          <p className="muted">학생 화면에는 20초 안에 반영돼요.</p>
        </div>
        <div className="card">
          <h2>일람표</h2>
          <p className="muted" style={{ marginTop: 0 }}>반별 설계·수행·합계 점수를 엑셀 파일(반마다 시트 하나)로 내려받아요. 설계도를 제출하지 않았고 채점도 안 된 학생은 설계 2점(미참여)으로 들어가요.</p>
          <button className="btn btn-primary" type="button" id="export" disabled={!allStudents.length}
            onClick={() => exportScores(allStudents).catch((e) => showToast(e.message))}>일람표 내려받기 (.xlsx)</button>
        </div>
      </div>

      <div className="card">
        <h2>명렬표</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {Object.keys(counts).sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true })).map((c) => `${clsLabel(c)} ${counts[c]}명`).join(' · ') || '등록된 학생 없음'}
        </p>
        <p className="muted">스프레드시트에서 <b>반 · 번호 · 학번 · 이름 · 1km 기록</b> 열을 복사해 붙여넣거나 엑셀 파일을 올리세요. 학번이 같으면 고쳐지고, 기존 기록은 그대로 남아요. 로그인은 이 명렬표와 정확히 일치해야 해요.</p>
        <div className="field"><textarea id="rpaste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'반\t번호\t학번\t이름\t1km\n1\t1\t10101\t홍길동\t4:35'} /></div>
        <div className="row">
          <button className="btn btn-outline" type="button" disabled={!paste.trim()} onClick={readPaste} id="rread">붙여넣은 내용 확인</button>
          <label className="btn btn-outline">엑셀·CSV 파일 선택<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0]).catch((er) => showToast(er.message))} /></label>
        </div>
        {parsed && (
          <div style={{ marginTop: 12 }}>
            {parsed.problems.length > 0 && <div className="msg msg-warn">{parsed.problems.map((p) => <div key={p}>{p}</div>)}</div>}
            <div className="msg msg-ok" id="rmsg">{parsed.rows.length}명을 읽었어요. 앞의 3명: {parsed.rows.slice(0, 3).map((r) => `${clsLabel(r.className)} ${r.number ?? ''}번 ${r.name}(${r.studentNo}${r.runSec ? `, ${fmtSec(r.runSec)}` : ''})`).join(', ')}</div>
            <button className="btn btn-primary" type="button" disabled={busy || !parsed.rows.length} onClick={upload} id="rupload">{busy ? '등록 중…' : `${parsed.rows.length}명 등록`}</button>
          </div>
        )}
        {allStudents.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary className="muted">전체 명단 보기 · 학생 삭제</summary>
            <div className="tbl-wrap" style={{ marginTop: 8 }}><table>
              <thead><tr><th>반</th><th>번호</th><th>학번</th><th>이름</th><th>1km</th><th /></tr></thead>
              <tbody>{allStudents.map((x) => (
                <tr key={x.studentNo}><td>{clsLabel(x.className)}</td><td>{x.number}</td><td>{x.studentNo}</td><td>{x.name}</td><td>{x.runSec ? fmtSec(x.runSec) : ''}</td>
                  <td><button className="btn btn-outline btn-sm" type="button" onClick={() => setDel(x)}>삭제</button></td></tr>
              ))}</tbody>
            </table></div>
          </details>
        )}
      </div>
      {del && (
        <Modal title="학생 삭제" onClose={() => setDel(null)}
          buttons={[{ label: '취소', cls: 'btn-outline', onClick: () => setDel(null) }, { label: '삭제', cls: 'btn-danger', onClick: removeStudent }]}>
          <p><b>{del.name}</b>({del.studentNo}) 학생을 명렬표에서 지우면 그 학생의 진단·설계도·이탈 기록·점수도 모두 지워져요. 되돌릴 수 없어요.</p>
        </Modal>
      )}
    </>
  );
}
