import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyState, getSettingsPublic, submitDesign } from '../lib/api';
import {
  markPending, getPending, clearPending, attemptSync, setQueueStudent, setResultHandler,
  onQueueChange, myPendingCount, flushAll, appendLog, getLastError,
} from '../lib/offlineQueue';
import { useOnlineStatus } from '../lib/useOnlineStatus';
import { QUESTION_COUNT } from '../lib/content';
import { normalizeDesign, diagDone, weakDone, estimate, clsLabel } from '../lib/design';
import { DiagStep, MeasureStep, ResultStep, LibraryStep } from './StudentSteps';
import DesignStep from './DesignStep';
import { Modal, useToast, useHeaderHeight } from './ui';

const STEPS = [
  { key: 'diag', label: '자가진단' },
  { key: 'measure', label: '측정 기록' },
  { key: 'result', label: '진단 결과' },
  { key: 'library', label: '동작 라이브러리' },
  { key: 'design', label: '설계도' },
];
const cacheKey = (no) => `hybrid_state_${no}`;
export const awayKey = (no) => `hybrid_away_${no}`;

function designFromServer(d) {
  return { data: normalizeDesign(d?.data), status: d?.status || '작성 중', submittedAt: d?.submittedAt || null, rev: Number(d?.rev) || 0 };
}
function fromServer(st) {
  const answers = Array.from({ length: QUESTION_COUNT }, (_, i) => Number(st.diag?.answers?.[i]) || 0);
  return {
    me: st.me,
    run: st.run || {},
    settings: st.settings || {},
    diag: { answers, rev: Number(st.diag?.rev) || 0 },
    measure: { vals: st.measure?.vals || {}, rev: Number(st.measure?.rev) || 0 },
    weak: { areas: st.weak?.areas || [], reason: st.weak?.reason || '', rev: Number(st.weak?.rev) || 0 },
    library: { viewed: !!st.weak?.libraryViewed, rev: 0 },
    design: designFromServer(st.design),
  };
}
/** 기기에 남은 미전송 입력이 서버보다 최신이면 그걸로 이어서 쓴다 */
function mergePending(s) {
  const d = getPending('diag');
  if (d && d.rev > s.diag.rev) s.diag = { answers: d.answers, rev: d.rev };
  const w = getPending('weak');
  if (w && w.rev > s.weak.rev) s.weak = { areas: w.areas, reason: w.reason, rev: w.rev };
  if (getPending('library')) s.library = { viewed: true, rev: 1 };
  const g = getPending('design');
  if (g && s.design.status === '제출') clearPending('design');
  else if (g && g.rev > s.design.rev) s.design = { ...s.design, data: normalizeDesign(g.data), rev: g.rev };
  return s;
}
function payloadOf(section, v, runSec) {
  switch (section) {
    case 'diag': return { answers: v.answers, rev: v.rev };
    case 'weak': return { areas: v.areas, reason: v.reason, rev: v.rev };
    case 'design': return { data: v.data, estMin: Math.round(estimate(v.data, runSec).total / 6) / 10, rev: v.rev };
    default: return { rev: v.rev };
  }
}

export default function StudentApp({ student, onLogout }) {
  setQueueStudent(student.studentNo);
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(null);
  const [pendingN, setPendingN] = useState(0);
  const [sessionLost, setSessionLost] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [toast, showToast] = useToast();
  const online = useOnlineStatus();
  const timers = useRef({});
  const headerRef = useRef(null);
  useHeaderHeight(headerRef);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const st = await getMyState();
      const s = fromServer(st);
      try { localStorage.setItem(cacheKey(student.studentNo), JSON.stringify(s)); } catch { /* 무시 */ }
      setState(mergePending(s));
    } catch (e) {
      if (!e.network) { onLogout(e.message); return; }
      // 와이파이가 끊긴 채 다시 열었을 때: 마지막으로 받은 내용 + 기기 보관본으로 이어서
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(cacheKey(student.studentNo)) || 'null'); } catch { /* 무시 */ }
      if (cached) setState(mergePending(cached));
      else setLoadError('인터넷 연결이 필요해요. 연결을 확인하고 다시 시도해주세요.');
    }
    void flushAll();
  }, [student.studentNo, onLogout]);

  useEffect(() => {
    void load();
    // 지난번 설계도 화면에서 나간 채로 창을 닫은 경우 → 다시 들어온 지금을 돌아온 시각으로 기록
    try {
      const away = Number(localStorage.getItem(awayKey(student.studentNo)));
      if (away) {
        appendLog({ type: 'leave', start: away, end: Date.now(), note: '화면을 닫은 뒤 다시 로그인' });
        localStorage.removeItem(awayKey(student.studentNo));
      }
    } catch { /* 무시 */ }
  }, [load, student.studentNo]);

  useEffect(() => {
    const update = () => setPendingN(myPendingCount());
    update();
    return onQueueChange(update);
  }, []);

  useEffect(() => {
    setResultHandler((section, res, err) => {
      if (res?.settings) setState((s) => (s ? { ...s, settings: res.settings } : s));
      if (res?.code === 'LOCKED' && res.design) setState((s) => (s ? { ...s, design: designFromServer(res.design) } : s));
      if (err && !err.network && /로그인 정보/.test(err.message)) setSessionLost(true);
    });
    return () => setResultHandler(null);
  }, []);

  // 교사가 열기/닫기를 바꾸면 20초 안에 반영
  useEffect(() => {
    const id = setInterval(() => {
      getSettingsPublic().then((st) => setState((s) => (s ? { ...s, settings: st } : s))).catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, []);

  const runSec = state?.run?.sec || null;
  const commit = useCallback((section, value) => {
    const v = { ...value, rev: Date.now() };
    setState((s) => ({ ...s, [section]: v }));
    markPending(section, payloadOf(section, v, runSec));
    clearTimeout(timers.current[section]);
    timers.current[section] = setTimeout(() => { void attemptSync(section); }, 800);
  }, [runSec]);

  const submitted = state?.design.status === '제출';
  const done = state && {
    diag: diagDone(state.diag.answers),
    measure: diagDone(state.diag.answers),   // 측정 기록은 선생님이 등록 → 학생은 보기만
    result: weakDone(state.weak),
    library: state.library.viewed,
    design: submitted,
  };
  const unlocked = (k) => {
    if (!done) return false;
    switch (k) {
      case 'diag': return true;
      case 'measure': return done.diag;
      case 'result': return done.diag && done.measure;
      case 'library': return unlocked('result') && done.result;
      case 'design': return unlocked('library') && done.library;
      default: return false;
    }
  };

  // 처음 들어오면 아직 안 끝난 단계부터
  useEffect(() => {
    if (state && step === null) setStep(STEPS.map((s) => s.key).find((k) => unlocked(k) && !done[k]) || 'design');
  }, [state, step]);

  function go(k) {
    if (!unlocked(k)) return;
    setStep(k);
    window.scrollTo(0, 0);
    void flushAll();
  }

  async function doSubmit() {
    const g = state.design.data;
    const estMin = Math.round(estimate(g, runSec).total / 6) / 10;
    const res = await submitDesign(g, estMin, Date.now());
    if (res.settings) setState((s) => ({ ...s, settings: res.settings }));
    if (res.ok || res.code === 'LOCKED') {
      clearTimeout(timers.current.design);
      clearPending('design');
      setState((s) => ({ ...s, design: designFromServer(res.design) }));
      showToast(res.ok ? '제출했어요!' : '이미 제출된 설계도예요');
    }
    return res;
  }

  function logout() {
    if (pendingN > 0) {
      setDialog({
        title: '아직 서버에 저장되지 않은 내용이 있어요',
        body: '작성한 내용은 이 기기에 보관돼 있어요. 같은 기기로 다시 로그인하면 이어서 저장돼요.',
        buttons: [
          { label: '머무르기', cls: 'btn-outline', onClick: () => setDialog(null) },
          { label: '그래도 나가기', cls: 'btn-danger', onClick: () => { setDialog(null); onLogout(); } },
        ],
      });
    } else onLogout();
  }

  const offline = !online || getLastError()?.network;
  const saveText = pendingN === 0 ? '저장됨' : offline ? '연결 끊김 · 기기에 보관 중' : '저장 중…';

  if (loadError) {
    return (
      <div className="app-shell"><div className="app-main">
        <div className="msg msg-error">{loadError}</div>
        <div className="row"><button className="btn btn-primary" type="button" onClick={load}>다시 시도</button>
          <button className="btn btn-outline" type="button" onClick={() => onLogout()}>로그아웃</button></div>
      </div></div>
    );
  }
  if (!state || !step) return <div className="app-shell"><div className="app-main"><div className="card">불러오는 중…</div></div></div>;

  const s = state.settings;
  const nextBtn = (k, label) => (
    <div className="row end" style={{ marginTop: 8 }}>
      <button className="btn btn-primary" type="button" disabled={!unlocked(k)} onClick={() => go(k)}>다음: {label} →</button>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-header" ref={headerRef}>
        <div className="header-row">
          <div className="grow">
            <h1>하이브리드 체력 프로그램</h1>
            <div className="sub">{clsLabel(state.me?.className ?? student.className)} {state.me?.number ?? student.number}번 {student.name}</div>
          </div>
          <span className={`save-chip ${pendingN && offline ? 'warn' : ''}`}>{saveText}</span>
          <button className="hbtn" type="button" onClick={logout}>로그아웃</button>
        </div>
        <nav className="steps">
          {STEPS.map((st, i) => (
            <button key={st.key} type="button" disabled={!unlocked(st.key)} onClick={() => go(st.key)}
              className={`${step === st.key ? 'active' : ''} ${done[st.key] ? 'done' : ''}`}>
              {i + 1}. {st.label}{done[st.key] ? ' ✓' : ''}
            </button>
          ))}
        </nav>
      </div>
      <div className="app-main">
        {sessionLost && (
          <div className="msg msg-error">
            다른 기기에서 같은 학번으로 로그인해서 이 기기의 저장이 멈췄어요. 작성한 내용은 이 기기에 보관돼 있으니 다시 로그인해주세요.
            <div style={{ marginTop: 8 }}><button className="btn btn-danger btn-sm" type="button" onClick={() => onLogout()}>다시 로그인</button></div>
          </div>
        )}
        {step === 'diag' && (
          <DiagStep answers={state.diag.answers} editable={s.diagOpen}
            onChange={(answers) => commit('diag', { answers })} next={nextBtn('measure', '측정 기록')} />
        )}
        {step === 'measure' && (
          <MeasureStep vals={state.measure.vals} run={state.run} next={nextBtn('result', '진단 결과')} />
        )}
        {step === 'result' && (
          <ResultStep answers={state.diag.answers} vals={state.measure.vals} run={state.run} weak={state.weak}
            editable={s.diagOpen && !submitted} submitted={submitted} showToast={showToast}
            onChange={(w) => commit('weak', w)} next={nextBtn('library', '동작 라이브러리')} />
        )}
        {step === 'library' && (
          <LibraryStep viewed={state.library.viewed}
            onViewed={() => commit('library', { viewed: true })} next={nextBtn('design', '설계도 작성')} />
        )}
        {step === 'design' && (
          <DesignStep key={`${state.design.status}`} studentNo={student.studentNo} design={state.design} weak={state.weak} runSec={runSec}
            settings={s} onChange={(data) => commit('design', { ...state.design, data })} onSubmit={doSubmit} showToast={showToast}
            onSaveNow={async () => { await flushAll(); showToast(myPendingCount() ? '연결이 끊겨 기기에 보관했어요' : '저장했어요'); }} />
        )}
      </div>
      {dialog && <Modal title={dialog.title} buttons={dialog.buttons} onClose={() => setDialog(null)}><p>{dialog.body}</p></Modal>}
      {toast}
    </div>
  );
}
