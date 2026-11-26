import { useEffect, useState } from 'react';
import { studentLogin, ensureFreshAnonSession } from '../lib/api';
import { setSession } from '../lib/session';

/**
 * 1단계: 학번·이름 확인 → 2단계: 비밀번호
 *  - 처음이면 비밀번호 만들기(두 번 입력), 다음부터는 비밀번호 입력.
 *  - 비밀번호는 서버에 bcrypt 해시로만 저장. 잊으면 선생님이 '비밀번호 초기화'.
 */
export default function StudentLoginGate({ onLoggedIn, onBack, initialMessage }) {
  const [studentNo, setStudentNo] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('id'); // id | setPin | pin
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialMessage || '');

  // 이 화면에 들어올 때 딱 한 번 새 익명 세션을 받아 둔다 (앞사람 세션과 섞이지 않게)
  useEffect(() => { ensureFreshAnonSession().catch(() => {}); }, []);

  function backToId() { setStep('id'); setPin(''); setPin2(''); setError(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!studentNo.trim() || !name.trim()) { setError('학번과 이름을 모두 입력해주세요.'); return; }
    if (step === 'setPin') {
      if (!/^[0-9]{6}$/.test(pin)) { setError('비밀번호는 숫자 6자리로 만들어주세요.'); return; }
      if (pin !== pin2) { setError('두 비밀번호가 달라요. 다시 입력해주세요.'); setPin2(''); return; }
    }
    if (step === 'pin' && !pin) { setError('비밀번호를 입력해주세요.'); return; }
    setPending(true);
    try {
      const r = step === 'id'
        ? await studentLogin(studentNo.trim(), name.trim())
        : await studentLogin(studentNo.trim(), name.trim(), pin, step === 'setPin');
      if (r.status === 'ok') {
        const s = { studentNo: r.studentNo, name: r.name, className: r.className, number: r.number };
        setSession(s);
        onLoggedIn(s);
      } else if (r.status === 'setPin' || r.status === 'pin') {
        setStep(r.status); setPin(''); setPin2('');
      } else {
        if (r.step) setStep(r.step);
        setPin(''); setPin2('');
        setError(r.message || '로그인에 실패했어요.');
      }
    } catch (err) {
      setError(err.network ? '인터넷 연결을 확인하고 다시 시도해주세요.' : (err.message || '로그인에 실패했어요.'));
    } finally {
      setPending(false);
    }
  }

  const idLocked = step !== 'id';
  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="app-header">
        <h1>하이브리드 체력 프로그램</h1>
        <div className="sub">학생 로그인</div>
      </div>
      <div className="app-main">
        <div className="card">
          <h2>학생 로그인</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {step === 'id' && '학번과 이름을 명렬표와 똑같이 입력하세요.'}
            {step === 'setPin' && '처음 로그인이에요. 나만 아는 비밀번호를 만들어요. 다음부터는 이 비밀번호로 들어와요.'}
            {step === 'pin' && '비밀번호를 입력하세요.'}
          </p>
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="field">
              <label htmlFor="sno">학번</label>
              <input id="sno" type="text" inputMode="numeric" value={studentNo} disabled={idLocked} onChange={(e) => setStudentNo(e.target.value)} placeholder="예: 10101" />
            </div>
            <div className="field">
              <label htmlFor="sname">이름</label>
              <input id="sname" type="text" value={name} disabled={idLocked} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
            </div>
            {idLocked && (
              <div className="field">
                <label htmlFor="spin">{step === 'setPin' ? '새 비밀번호 (숫자 6자리)' : '비밀번호 (숫자 6자리)'}</label>
                <input id="spin" type="password" autoComplete={step === 'setPin' ? 'new-password' : 'current-password'} autoFocus
                  inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              </div>
            )}
            {step === 'setPin' && (
              <div className="field">
                <label htmlFor="spin2">비밀번호 한 번 더</label>
                <input id="spin2" type="password" autoComplete="new-password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>생일·123456처럼 쉬운 번호는 피하고, 친구에게 알려주지 마세요. 잊어버리면 선생님께 초기화를 부탁하면 돼요.</div>
              </div>
            )}
            {error && <div className="msg msg-error">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
              {pending ? '확인 중...' : step === 'id' ? '다음' : step === 'setPin' ? '비밀번호 만들고 들어가기' : '들어가기'}
            </button>
          </form>
        </div>
        <div className="center row" style={{ justifyContent: 'center' }}>
          {idLocked && <button className="btn btn-outline" type="button" onClick={backToId}>학번 다시 입력</button>}
          <button className="btn btn-outline" type="button" onClick={onBack}>처음으로</button>
        </div>
      </div>
    </div>
  );
}
