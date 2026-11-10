import { useState } from 'react';
import { adminStudentDetail, adminSavePerf } from '../lib/api';
import { PERF_OPTIONS } from '../lib/content';
import { clsLabel, fmtSec, fmtTime, perfConvert } from '../lib/design';
import { Modal } from './ui';

const Yes = ({ v }) => (v ? <span className="y">✓</span> : <span className="n">–</span>);
export function DesignPill({ s }) {
  if (s.designStatus === '제출') return <><span className="pill sub">제출</span> <span className="muted">{fmtTime(s.submittedAt).slice(-8, -3)}</span></>;
  if (s.designStatus) return <span className="pill ing">작성 중</span>;
  return <span className="n">–</span>;
}

/* ── 진행 현황 ── */
export function AdminProgress({ students, ov, cls, openStudent }) {
  const c = (f) => students.filter(f).length;
  const st = ov.settings;
  return (
    <>
      <div className="card row between">
        <div><b>{clsLabel(cls)}</b> {students.length}명 · 자가진단 {c((s) => s.diag)} · 측정 {c((s) => s.measure)} · 약점 {c((s) => s.weak)} · <b>설계도 제출 {c((s) => s.designStatus === '제출')}</b></div>
        <div className="muted">진단 {st.diagOpen ? <b className="y">열림</b> : '닫힘'} · 설계 {st.designOpen ? <b className="y">열림</b> : '닫힘'}</div>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>번호</th><th>이름</th><th className="c">자가진단</th><th className="c">측정</th><th className="c">약점 선택</th><th>설계도</th><th className="c">예상(분)</th><th className="c">이탈</th><th className="c">의심 입력</th></tr></thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentNo} className="click" data-no={s.studentNo} onClick={() => openStudent(s.studentNo)}>
              <td>{s.number}</td><td><b>{s.name}</b></td>
              <td className="c"><Yes v={s.diag} /></td><td className="c"><Yes v={s.measure} /></td><td className="c"><Yes v={s.weak} /></td>
              <td><DesignPill s={s} /></td><td className="c">{s.estMin ?? ''}</td>
              <td className="c">{s.leaves ? <span className="pill warn">{s.leaves}</span> : ''}</td>
              <td className="c">{s.sus ? <span className="pill warn">{s.sus}</span> : ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted">행을 누르면 학생 상세·채점으로 이동해요.</p>
    </>
  );
}

/* ── 이탈·의심 입력 ── */
export function LogTable({ logs }) {
  if (!logs?.length) return <p className="muted">기록이 없어요.</p>;
  const nth = logs.map((_, i) => logs.slice(0, i + 1).filter((l) => l.kind === '이탈').length);
  return (
    <div className="tbl-wrap"><table>
      <thead><tr><th>구분</th><th>나간 시각</th><th>돌아온 시각</th><th className="c">머문 시간</th><th>입력란·메모</th><th className="c">늘어난 글자</th><th className="c">누적</th></tr></thead>
      <tbody>
        {logs.map((l, i) => {
          const leave = l.kind === '이탈';
          return (
            <tr key={i}>
              <td>{leave ? <span className="pill warn">이탈</span> : <span className="pill ing">의심 입력</span>}</td>
              <td>{fmtTime(l.startedAt)}</td><td>{leave ? fmtTime(l.endedAt) : ''}</td>
              <td className="c">{leave ? fmtSec(l.seconds) : ''}</td><td>{l.field || l.note || ''}</td>
              <td className="c">{l.delta ?? ''}</td><td className="c">{leave ? `${nth[i]}회` : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}

export function AdminLogs({ students }) {
  const [detail, setDetail] = useState(null);
  async function open(s) {
    setDetail({ name: s.name, logs: null });
    try {
      const d = await adminStudentDetail(s.studentNo);
      setDetail({ name: s.name, logs: d.logs });
    } catch (e) { setDetail({ name: s.name, logs: [], error: e.message }); }
  }
  return (
    <>
      <div className="msg msg-info">자동 감점이 아니에요. 알림 팝업·화면 꺼짐·네트워크 끊김도 이탈로 잡힐 수 있으니, 기록을 보고 즉석 질문으로 확인하세요.</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>번호</th><th>이름</th><th className="c">이탈 횟수</th><th className="c">머문 시간 합계</th><th className="c">의심 입력</th><th className="c">최대 글자 수</th></tr></thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.studentNo} className="click" data-no={s.studentNo} onClick={() => open(s)}>
              <td>{s.number}</td><td><b>{s.name}</b></td>
              <td className="c">{s.leaves || ''}</td><td className="c">{s.leaves ? fmtSec(s.leaveSec) : ''}</td>
              <td className="c">{s.sus || ''}</td><td className="c">{s.maxDelta || ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="muted">이름을 누르면 상세 기록을 볼 수 있어요.</p>
      {detail && (
        <Modal wide title={`${detail.name} 이탈·의심 입력 기록`} onClose={() => setDetail(null)}>
          {detail.error && <div className="msg msg-error">{detail.error}</div>}
          {detail.logs ? <LogTable logs={detail.logs} /> : <p>불러오는 중…</p>}
        </Modal>
      )}
    </>
  );
}

/* ── 수행 기록 ── */
export function AdminPerf({ students, patchStudent, showToast }) {
  async function save(s, p1, p2) {
    patchStudent(s.studentNo, { score: { ...(s.score || {}), perf1: p1, perf2: p2, perf_score: perfConvert(p1, p2) } });
    try {
      const score = await adminSavePerf(s.studentNo, p1, p2);
      patchStudent(s.studentNo, { score });
    } catch (e) { showToast(`저장 실패: ${e.message}`); }
  }
  const sel = (s, which) => {
    const sc = s.score || {};
    const v = which === 1 ? sc.perf1 || '' : sc.perf2 || '';
    return (
      <select className="inp" style={{ width: 100, padding: '6px 8px' }} value={v} data-p={which}
        onChange={(e) => (which === 1 ? save(s, e.target.value, sc.perf2 || '') : save(s, sc.perf1 || '', e.target.value))}>
        {PERF_OPTIONS.map((o) => <option key={o} value={o}>{o === '' ? '-' : o}</option>)}
      </select>
    );
  };
  return (
    <>
      <div className="msg msg-info">회차별 2·1·0 또는 미참여를 고르면 바로 저장돼요. 환산: 4→6, 3→5, 2→4, 1→3, 미참여→2</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>번호</th><th>이름</th><th>1회</th><th>2회</th><th className="c">수행 점수</th><th className="c">설계 점수</th><th className="c">총점</th></tr></thead>
        <tbody>
          {students.map((s) => {
            const sc = s.score || {};
            return (
              <tr key={s.studentNo} data-no={s.studentNo}>
                <td>{s.number}</td><td><b>{s.name}</b></td><td>{sel(s, 1)}</td><td>{sel(s, 2)}</td>
                <td className="c" data-perf>{sc.perf_score ?? '-'}</td><td className="c">{sc.design_score ?? '-'}</td><td className="c" data-total>{sc.total ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </>
  );
}
