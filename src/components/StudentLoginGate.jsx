import { useEffect, useState } from 'react';
import { studentLogin, ensureFreshAnonSession } from '../lib/api';
import { setSession } from '../lib/session';

export default function StudentLoginGate({ onLoggedIn, onBack, initialMessage }) {
  const [studentNo, setStudentNo] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialMessage || '');

  // 이 화면에 들어올 때 딱 한 번 새 익명 세션을 받아 둔다 (앞사람 세션과 섞이지 않게)
  useEffect(() => { ensureFreshAnonSession().catch(() => {}); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!studentNo.trim() || !name.trim()) {
      setError('학번과 이름을 모두 입력해주세요.');
      return;
    }
    setPending(true);
    try {
      const s = await studentLogin(studentNo.trim(), name.trim());
      setSession(s);
      onLoggedIn(s);
    } catch (err) {
      setError(err.network ? '인터넷 연결을 확인하고 다시 시도해주세요.' : (err.message || '로그인에 실패했어요.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="app-header">
        <h1>하이브리드 체력 프로그램</h1>
        <div className="sub">학생 로그인</div>
      </div>
      <div className="app-main">
        <div className="card">
          <h2>학생 로그인</h2>
          <p className="muted" style={{ marginTop: 0 }}>학번과 이름을 명렬표와 똑같이 입력하세요.</p>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="field">
              <label htmlFor="sno">학번</label>
              <input id="sno" type="text" inputMode="numeric" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder="예: 10101" />
            </div>
            <div className="field">
              <label htmlFor="sname">이름</label>
              <input id="sname" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
            </div>
            {error && <div className="msg msg-error">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={pending}>{pending ? '확인 중...' : '들어가기'}</button>
          </form>
        </div>
        <div className="center">
          <button className="btn btn-outline" type="button" onClick={onBack}>처음으로</button>
        </div>
      </div>
    </div>
  );
}
