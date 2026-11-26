import { useEffect, useState } from 'react';
import { adminStudentDetail, adminSaveScore, adminUnlockDesign, adminResetPin } from '../lib/api';
import { MEASURES, SCORE_ITEMS, SCORE_MAX, MOVE_AREAS, WARN_MIN, QUESTION_COUNT, areaName, moveAreaName } from '../lib/content';
import { normalizeDesign, estimate, moveLabel, weakShare, designConvert, diagSums, clsLabel, fmtSec, fmtNum, fmtTime } from '../lib/design';
import { timeline, timelineSummary } from '../lib/program';
import { gradingHints, cellState } from '../lib/grading';
import { LogTable } from './AdminTables';
import Distribution from './Distribution';
import { RadarPair } from './Radar';
import StudentPreview from './StudentPreview';
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
  const hints = gradingHints(normalizeDesign(detail.design?.data), detail.weak);
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
        const h = hints[i];
        return (
          <div key={it.label} className="grade-item">
            <b>{it.label}</b> <span className="suggest" title="설계도에서 센 결과로 계산한 추천 점수예요">추천 {h.suggest}</span>
            <div className="lv" data-item={i}>
              <button type="button" className={lv === 'full' ? 'on' : ''} onClick={() => pick(it.max)}>2점</button>
              <button type="button" className={lv === 'part' ? 'on' : ''} onClick={() => pick(it.max / 2)}>1점</button>
              <button type="button" className={lv === 'none' ? 'on' : ''} onClick={() => pick(0)}>0점</button>
            </div>
            <div className="grade-facts">{h.facts}</div>
            <div className="grade-rule">{h.rule}</div>
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

function Detail({ d, onUnlock, onPreview, onResetPin }) {
  const g = normalizeDesign(d.design?.data);
  const avg = d.averages || {};
  const answers = Array.from({ length: QUESTION_COUNT }, (_, i) => Number(d.diag?.answers?.[i]) || 0);
  const vals = d.measure?.vals || {};
  const e = estimate(g, d.student.runSec);
  const tl = timeline(g, d.student.runSec);
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
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn btn-accent btn-sm" type="button" id="preview" onClick={onPreview}>학생 화면 미리보기</button>
          <span className="muted">비밀번호: {d.student.hasPin ? '만듦' : '아직 없음 (첫 로그인 전)'}</span>
          {d.student.hasPin && <button className="btn btn-outline btn-sm" type="button" id="resetPin" onClick={onResetPin}>비밀번호 초기화</button>}
        </div>
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
      <div className="card" id="tdist">
        <h3>종목별 기록 분포 <span className="muted">(이름 없이 기록만 · 주황 막대가 이 학생)</span></h3>
        <RadarPair vals={vals} runSec={d.student.runSec} dist={d.distributions} answers={answers} />
        <div className="grid2">
          {MEASURES.map((m) => (
            <Distribution key={m.key} measureKey={m.key} name={m.name} unit={m.unit} mine={vals[m.key]} dist={d.distributions?.[m.key]} avgInfo={avg[m.key]} sex={d.student.sex} />
          ))}
          <Distribution measureKey="run1km" name="1km 달리기" mine={d.student.runSec} dist={d.distributions?.run1km} avgInfo={avg.run1km} lowerBetter isTime sex={d.student.sex} />
        </div>
      </div>
      <div className="msg msg-info" style={{ fontSize: 13 }}>칸 색: <span className="ro-key empty">빈칸</span> <span className="ro-key short">10자 미만(막연)</span> <span className="ro-key ok">구체적</span> — 오른쪽 '추천'은 이 색을 센 결과예요. 점수는 직접 눌러 주세요.</div>
      <div className="card">
        <h3>① 목표 부위 선정과 반영</h3>
        <p><b>{weakAreas.map(areaName).join(', ') || '-'}</b> · 목표 부위 동작 <b>{share.hit}개 / {share.total}개</b>
          <span className="muted"> ({MOVE_AREAS.map((a) => `${a.name} ${share.counts[a.key]}`).join(', ')})</span></p>
        <div className={`ro ${cellState(d.weak?.reason)}`}>{d.weak?.reason || ''}</div>
      </div>
      {g.moves.map((m, i) => {
        const hit = m.area && weakAreas.includes(m.area);
        return (
          <div className={`card move ${hit ? 'hit' : m.area ? '' : 'other'}`} key={i}>
            <h3>{hit && <span className="tag hit">목표 부위</span>}{moveLabel(i)} · {m.name || '-'} <span className="muted">[{moveAreaName(m.area) || '부위 -'}]</span>
              <span className="muted"> ({m.order ? `${m.order}번째` : '순서 -'}, {Number(m.val) > 0 ? `${m.val}${m.mode}` : '-'})</span></h3>
            <div className="grid2">
              <div><div className="muted">② 사용 근육</div><div className={`ro ${cellState(m.muscle)}`}>{m.muscle}</div></div>
              <div><div className="muted">④ 일상 활용</div><div className={`ro ${cellState(m.daily)}`}>{m.daily}</div></div>
              <div><div className="muted">③ 자세</div><div className={`ro ${cellState(m.posture)}`}>{m.posture}</div></div>
              <div><div className="muted">③ 안전</div><div className={`ro ${cellState(m.safety)}`}>{m.safety}</div></div>
            </div>
          </div>
        );
      })}
      <div className="card">
        <h3>⑤ 프로그램 구성</h3>
        <p><b>{timelineSummary(g)}</b></p>
        <p>예상 소요시간 <b className={e.total > WARN_MIN * 60 ? 'est over' : ''}>{fmtSec(e.total)}</b>{e.cap ? <span className="muted"> (시간 제한 {e.cap / 60}분)</span> : null}</p>
        <details><summary className="muted">진행표 보기 ({tl.segs.length}칸)</summary>
          <ol className="tl">{tl.segs.map((sg, k) => <li key={k} className={`tl-${sg.kind}`}>{sg.tag ? <span className="muted">{sg.tag} </span> : null}{sg.label} <span className="muted">{sg.sub}</span></li>)}</ol>
        </details>
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
  const [confirmPin, setConfirmPin] = useState(false);
  const [preview, setPreview] = useState(false);
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

  async function resetPin() {
    setConfirmPin(false);
    try {
      await adminResetPin(no);
      patchStudent(no, { hasPin: false });
      setReload((r) => r + 1);
      showToast('비밀번호를 초기화했어요. 학생이 다음 로그인 때 새로 만들어요');
    } catch (e) { showToast(e.message); }
  }

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
          <div><Detail d={detail} onUnlock={() => setConfirmUnlock(true)} onPreview={() => setPreview(true)} onResetPin={() => setConfirmPin(true)} /></div>
          <div className="side">
            <ScorePanel key={no} detail={detail} showToast={showToast} onSaved={(score) => patchStudent(no, { score })} />
          </div>
        </div>
      )}
      {preview && detail && <StudentPreview detail={detail} onClose={() => setPreview(false)} />}
      {confirmPin && (
        <Modal title="비밀번호 초기화" onClose={() => setConfirmPin(false)}
          buttons={[{ label: '취소', cls: 'btn-outline', onClick: () => setConfirmPin(false) }, { label: '초기화', cls: 'btn-danger', onClick: resetPin, id: 'resetPinOk' }]}>
          <p>{detail?.student.name} 학생의 비밀번호를 지워요. 지금 로그인된 기기는 로그아웃되고, 다음 로그인 때 학번·이름을 넣으면 새 비밀번호를 만들게 돼요. 기록은 그대로예요.</p>
        </Modal>
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
