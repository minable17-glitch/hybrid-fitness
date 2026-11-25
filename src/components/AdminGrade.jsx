import { useEffect, useState } from 'react';
import { adminStudentDetail, adminSaveScore, adminUnlockDesign } from '../lib/api';
import { MEASURES, SCORE_ITEMS, SCORE_MAX, MOVE_AREAS, WARN_MIN, QUESTION_COUNT, areaName, moveAreaName } from '../lib/content';
import { normalizeDesign, estimate, moveLabel, weakShare, designConvert, diagSums, clsLabel, fmtSec, fmtNum, fmtTime } from '../lib/design';
import { LogTable } from './AdminTables';
import { Modal } from './ui';

function levelOf(v, max) {
  if (v == null) return '';
  return v >= max ? 'full' : v > 0 ? 'part' : 'none';
}

function ScorePanel({ detail, onSaved, showToast }) {
  const sc = detail.score || {};
  const [items, setItems] = useState(() => (sc.items || SCORE_ITEMS.map(() => null)).slice(0, SCORE_ITEMS.length).map((v) => (v == null ? null : Number(v))));
  const [blank, setBlank] = useState(!!sc.blank);
  const [savedAt, setSavedAt] = useState(sc.updated_at || null);
  const all = items.every((v) => v != null);
  const sum = all ? items.reduce((a, b) => a + b, 0) : null;
  const conv = designConvert(sum, blank);

  async function save(nextItems, nextBlank) {
    setSavedAt('saving');
    try {
      const s = await adminSaveScore(detail.student.studentNo, nextItems, nextBlank);
      setSavedAt(s.updated_at);
      onSaved(s);
    } catch (e) {
      setSavedAt(null);
      showToast(`저장 실패: ${e.message}`);
    }
  }
  return (
    <div className="card">
      <h2>설계 채점</h2>
      {SCORE_ITEMS.map((it, i) => {
        const lv = levelOf(items[i], it.max);
        const pick = (v) => { const n = items.slice(); n[i] = v; setItems(n); void save(n, blank); };
        return (
          <div key={it.label}>
            <b>{it.label}</b> <span className="muted">({it.max}점)</span>
            <div className="lv" data-item={i}>
              <button type="button" className={lv === 'full' ? 'on' : ''} onClick={() => pick(it.max)}>충족 {it.max}</button>
              <button type="button" className={lv === 'part' ? 'on' : ''} onClick={() => pick(it.max / 2)}>부분 {it.max / 2}</button>
              <button type="button" className={lv === 'none' ? 'on' : ''} onClick={() => pick(0)}>미흡 0</button>
            </div>
          </div>
        );
      })}
      <label className="row" style={{ gap: 8, margin: '6px 0' }}>
        <input type="checkbox" checked={blank} onChange={(e) => { setBlank(e.target.checked); void save(items, e.target.checked); }} /> 미참여·백지 (설계 2점)
      </label>
      <div className="row between" style={{ marginTop: 8 }}>
        <div>합계 <span className="big" id="ssum">{all ? sum : `${items.filter((v) => v != null).length}/${SCORE_ITEMS.length}`}</span>{all && <span className="muted">/{SCORE_MAX}</span>}</div>
        <div>설계 점수 <span className="big" id="sconv" style={{ color: 'var(--primary)' }}>{conv ?? '-'}</span></div>
      </div>
      <p className="muted" id="ssaved">{savedAt === 'saving' ? '저장 중…' : savedAt ? `저장됨 ${fmtTime(savedAt)}` : '아직 저장 안 됨'}</p>
      <div className="muted" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
        수행 {sc.perf1 || '-'} / {sc.perf2 || '-'} → {sc.perf_score ?? '-'}점 · 총점 {sc.total ?? '-'}
      </div>
    </div>
  );
}

function Detail({ d, onUnlock }) {
  const g = normalizeDesign(d.design?.data);
  const avg = d.averages || {};
  const answers = Array.from({ length: QUESTION_COUNT }, (_, i) => Number(d.diag?.answers?.[i]) || 0);
  const vals = d.measure?.vals || {};
  const e = estimate(g, d.student.runSec);
  const weakAreas = d.weak?.areas || [];
  const share = weakShare(g, weakAreas);
  const row = (name, v, key, unit, isRun) => (
    <tr key={key}><td>{name}</td>
      <td className="c">{isRun ? fmtSec(v) : v === '' || v == null ? '-' : `${v}${unit}`}</td>
      <td className="c">{avg[key]?.avg != null ? (isRun ? fmtSec(avg[key].avg) : `${fmtNum(avg[key].avg)}${unit}`) : '-'}</td></tr>
  );
  return (
    <>
      <div className="card">
        <h2>{clsLabel(d.student.className)} {d.student.number}번 {d.student.name} <span className="muted">{d.student.studentNo}{d.student.sex ? ` · ${d.student.sex}` : ''}</span></h2>
        <div className="row">설계도:
          {d.design?.status === '제출'
            ? <><span className="pill sub">제출</span> {fmtTime(d.design.submittedAt)} <button className="btn btn-danger btn-sm" type="button" id="unlock" onClick={onUnlock}>잠금 해제</button></>
            : d.design ? <span className="pill ing">작성 중</span> : <span className="muted">미작성</span>}
        </div>
      </div>
      <div className="card">
        <h3>진단 (점수 미반영)</h3>
        <div className="stack">
          <div className="tbl-wrap"><table><thead><tr><th>부위</th><th className="c">자가진단 합계 (3~9, 높을수록 힘듦)</th></tr></thead>
            <tbody>{diagSums(answers).map((s) => <tr key={s.key}><td>{s.name}</td><td className="c">{s.sum ?? '-'}</td></tr>)}</tbody></table></div>
          <div className="tbl-wrap"><table><thead><tr><th>측정</th><th className="c">기록</th><th className="c">비교 평균 (같은 성별)</th></tr></thead>
            <tbody>{MEASURES.map((m) => row(m.name, vals[m.key], m.key, m.unit))}{row('1km 달리기', d.student.runSec, 'run1km', '', true)}</tbody></table></div>
        </div>
      </div>
      <div className="card">
        <h3>① 약점 진단과 보완</h3>
        <p><b>{weakAreas.map(areaName).join(', ') || '-'}</b> · 약점 부위 동작 <b>{share.hit}/{share.total}칸</b>
          <span className="muted"> ({MOVE_AREAS.map((a) => `${a.name} ${share.counts[a.key]}`).join(', ')})</span></p>
        <div className="ro">{d.weak?.reason || ''}</div>
      </div>
      {g.moves.map((m, i) => {
        const hit = m.area && weakAreas.includes(m.area);
        return (
          <div className={`card move ${hit ? 'hit' : m.area ? '' : 'other'}`} key={i}>
            <h3>{hit && <span className="tag hit">약점 보완</span>}{moveLabel(i)} · {m.name || '-'} <span className="muted">[{moveAreaName(m.area) || '부위 -'}]</span>
              <span className="muted"> ({m.order ? `${m.order}번째` : '순서 -'}, {Number(m.val) > 0 ? `${m.val}${m.mode}` : '-'})</span></h3>
            <div className="grid2">
              <div><div className="muted">② 사용 근육</div><div className="ro">{m.muscle}</div></div>
              <div><div className="muted">④ 일상 활용</div><div className="ro">{m.daily}</div></div>
              <div><div className="muted">③ 정확한 자세</div><div className="ro">{m.posture}</div></div>
              <div><div className="muted">③ 안전 유의사항</div><div className="ro">{m.safety}</div></div>
            </div>
          </div>
        );
      })}
      <div className="card">
        <h3>⑤ 프로그램 구성</h3>
        <p>동작 사이 휴식 <b>{g.restMove === '' ? '-' : `${g.restMove}초`}</b> · 라운드 사이 휴식 <b>{g.restRound === '' ? '-' : `${g.restRound}초`}</b> · 라운드 <b>{g.rounds || '-'}</b> · 러닝 <b>{g.runDist ? `${g.runDist}m` : '-'}</b> ({g.runWhere || '-'})</p>
        <p>예상 소요시간 <b className={e.total > WARN_MIN * 60 ? 'est over' : ''}>{fmtSec(e.total)}</b></p>
      </div>
      <div className="card"><h3>이탈·의심 입력 기록</h3><LogTable logs={d.logs} /></div>
    </>
  );
}

export default function AdminGrade({ students, current, setCurrent, patchStudent, showToast }) {
  const no = students.some((s) => s.studentNo === current) ? current : students[0]?.studentNo;
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!no) return undefined;
    let alive = true;
    setDetail(null);
    setError('');
    adminStudentDetail(no).then((d) => { if (alive) setDetail(d); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [no, reload]);

  if (!students.length) return <div className="card muted">학생이 없어요.</div>;
  const idx = students.findIndex((s) => s.studentNo === no);

  async function unlock() {
    setConfirmUnlock(false);
    try {
      await adminUnlockDesign(no);
      patchStudent(no, { designStatus: '작성 중' });
      setReload((r) => r + 1);
      showToast('잠금을 풀었어요');
    } catch (e) { showToast(e.message); }
  }

  return (
    <>
      <div className="card row">
        <button className="btn btn-outline btn-sm" type="button" disabled={idx <= 0} onClick={() => setCurrent(students[idx - 1].studentNo)} id="gprev">← 이전</button>
        <select className="inp" style={{ flex: 1, width: 'auto' }} value={no} onChange={(e) => setCurrent(e.target.value)} aria-label="학생 선택">
          {students.map((s) => (
            <option key={s.studentNo} value={s.studentNo}>
              {s.number}번 {s.name}{s.designStatus === '제출' ? ' · 제출' : ''}{s.score?.design_score != null ? ' · 채점됨' : ''}
            </option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" type="button" disabled={idx >= students.length - 1} onClick={() => setCurrent(students[idx + 1].studentNo)} id="gnext">다음 →</button>
      </div>
      {error && <div className="msg msg-error">{error}</div>}
      {!detail && !error && <div className="card">불러오는 중…</div>}
      {detail && (
        <div className="split">
          <div><Detail d={detail} onUnlock={() => setConfirmUnlock(true)} /></div>
          <div className="side">
            <ScorePanel key={no} detail={detail} showToast={showToast} onSaved={(score) => patchStudent(no, { score })} />
          </div>
        </div>
      )}
      {confirmUnlock && (
        <Modal title="제출 잠금 해제" onClose={() => setConfirmUnlock(false)}
          buttons={[{ label: '취소', cls: 'btn-outline', onClick: () => setConfirmUnlock(false) }, { label: '잠금 해제', cls: 'btn-danger', onClick: unlock }]}>
          <p>{detail?.student.name} 학생이 설계도를 다시 고칠 수 있게 됩니다.</p>
        </Modal>
      )}
    </>
  );
}
