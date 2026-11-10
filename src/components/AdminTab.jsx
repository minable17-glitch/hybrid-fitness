import { useCallback, useEffect, useRef, useState } from 'react';
import { teacherLogin, teacherSignup, teacherLogout, ensureFreshAnonSession, adminOverview } from '../lib/api';
import { getTeacherSession, setTeacherSession, clearTeacherSession } from '../lib/session';
import { clsLabel } from '../lib/design';
import { useToast, useHeaderHeight } from './ui';
import { AdminProgress, AdminLogs, AdminPerf } from './AdminTables';
import AdminGrade from './AdminGrade';
import { AdminAverages, AdminSetup, AdminMoves } from './AdminSetup';

const TABS = [
  ['progress', '진행 현황'], ['logs', '이탈·의심 입력'], ['grade', '학생 상세·채점'], ['perf', '수행 기록'],
  ['avg', '학교 평균'], ['setup', '명렬표·설정·일람표'], ['moves', '동작 라이브러리'],
];

function AuthScreen({ onDone, onExit }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ensureFreshAnonSession().catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const t = mode === 'login' ? await teacherLogin(username.trim(), password) : await teacherSignup(username.trim(), password, code.trim());
      setTeacherSession(t);
      onDone(t);
    } catch (err) {
      setError(err.network ? '인터넷 연결을 확인해주세요.' : err.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="app-header"><h1>하이브리드 체력 프로그램</h1><div className="sub">선생님 화면</div></div>
      <div className="app-main">
        <div className="card">
          <h2>{mode === 'login' ? '선생님 로그인' : '선생님 계정 만들기'}</h2>
          <form onSubmit={submit}>
            <div className="field"><label htmlFor="tid">아이디</label><input id="tid" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></div>
            <div className="field"><label htmlFor="tpw">비밀번호</label><input id="tpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
            {mode === 'signup' && (
              <div className="field"><label htmlFor="tcode">가입 코드 (첫 계정은 비워 두세요)</label><input id="tcode" type="text" value={code} onChange={(e) => setCode(e.target.value)} /></div>
            )}
            {error && <div className="msg msg-error">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={pending}>{pending ? '확인 중...' : mode === 'login' ? '로그인' : '계정 만들기'}</button>
          </form>
          <div className="center" style={{ marginTop: 12 }}>
            <button className="btn btn-outline btn-sm" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? '처음이신가요? 계정 만들기' : '로그인으로 돌아가기'}
            </button>
          </div>
        </div>
        <div className="center"><button className="btn btn-outline" type="button" onClick={onExit}>처음으로</button></div>
      </div>
    </div>
  );
}

export default function AdminTab({ onExit }) {
  const [teacher, setTeacher] = useState(() => getTeacherSession());
  const [ov, setOv] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('progress');
  const [cls, setCls] = useState('');
  const [current, setCurrent] = useState(null);   // 학생 상세에서 보는 학번
  const [toast, showToast] = useToast();
  const headerRef = useRef(null);
  useHeaderHeight(headerRef);

  const refresh = useCallback(async () => {
    try {
      const o = await adminOverview();
      setOv(o);
      setError('');
      return o;
    } catch (e) {
      if (!e.network) { clearTeacherSession(); setTeacher(null); }
      setError(e.message);
      return null;
    }
  }, []);
  useEffect(() => { if (teacher) void refresh(); }, [teacher, refresh]);

  const classes = ov ? [...new Set(ov.students.map((s) => s.className))].sort((a, b) => String(a).localeCompare(String(b), 'ko', { numeric: true })) : [];
  const curCls = classes.includes(cls) ? cls : classes[0] || '';
  const students = ov ? ov.students.filter((s) => s.className === curCls).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)) : [];

  async function logout() {
    await teacherLogout();
    clearTeacherSession();
    setTeacher(null);
    setOv(null);
  }
  /** 다른 화면에서 받은 학생 한 명의 바뀐 점수/상태를 목록에 반영 */
  const patchStudent = useCallback((studentNo, patch) => {
    setOv((o) => o && { ...o, students: o.students.map((s) => (s.studentNo === studentNo ? { ...s, ...patch } : s)) });
  }, []);

  if (!teacher) return <AuthScreen onDone={setTeacher} onExit={onExit} />;

  const ctx = { ov, setOv, students, allStudents: ov?.students || [], refresh, showToast, patchStudent, cls: curCls,
    openStudent: (no) => { setCurrent(no); setTab('grade'); window.scrollTo(0, 0); } };

  return (
    <div className="app-shell wide">
      <div className="app-header" ref={headerRef}>
        <div className="header-row">
          <div className="grow"><h1>선생님 화면</h1><div className="sub">{teacher.username}</div></div>
          {classes.length > 0 && (
            <select className="hbtn" value={curCls} onChange={(e) => { setCls(e.target.value); setCurrent(null); }} aria-label="반 선택">
              {classes.map((c) => <option key={c} value={c}>{clsLabel(c)}</option>)}
            </select>
          )}
          <button className="hbtn" type="button" onClick={async () => { await refresh(); showToast('새로 불러왔어요'); }}>새로고침</button>
          <button className="hbtn" type="button" onClick={onExit}>처음으로</button>
          <button className="hbtn" type="button" onClick={logout}>로그아웃</button>
        </div>
        <nav className="tabs">
          {TABS.map(([k, t]) => <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t}</button>)}
        </nav>
      </div>
      <div className="app-main">
        {error && <div className="msg msg-error">{error}</div>}
        {!ov && !error && <div className="card">불러오는 중…</div>}
        {ov && !ov.students.length && tab !== 'setup' && tab !== 'moves' && (
          <div className="msg msg-info">아직 명렬표가 없어요. '명렬표·설정·일람표' 탭에서 명렬표를 먼저 등록해주세요.</div>
        )}
        {ov && tab === 'progress' && <AdminProgress {...ctx} />}
        {ov && tab === 'logs' && <AdminLogs {...ctx} />}
        {ov && tab === 'grade' && <AdminGrade {...ctx} current={current} setCurrent={setCurrent} />}
        {ov && tab === 'perf' && <AdminPerf {...ctx} />}
        {ov && tab === 'avg' && <AdminAverages {...ctx} />}
        {ov && tab === 'setup' && <AdminSetup {...ctx} />}
        {tab === 'moves' && <AdminMoves showToast={showToast} />}
      </div>
      {toast}
    </div>
  );
}
