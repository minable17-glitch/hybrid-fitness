import { useState } from 'react';
import RoleGate from './components/RoleGate';
import StudentLoginGate from './components/StudentLoginGate';
import StudentApp from './components/StudentApp';
import AdminTab from './components/AdminTab';
import { getSession, clearSession, getTeacherSession } from './lib/session';
import { studentLogout } from './lib/api';
import { startAutoFlush, flushAll, setQueueStudent } from './lib/offlineQueue';

// 오프라인 중에 쓴 내용을 인터넷이 연결되면 자동으로 다시 보냄
startAutoFlush();

export default function App() {
  const [student, setStudent] = useState(() => getSession());
  // 'student' | 'admin' | null(=역할 선택). 주소에 ?teacher 를 붙이면 바로 교사 화면.
  const [mode, setMode] = useState(() => {
    if (new URLSearchParams(window.location.search).has('teacher')) return 'admin';
    if (getSession()) return 'student';
    if (getTeacherSession()) return 'admin';
    return null;
  });
  const [loginMsg, setLoginMsg] = useState('');

  async function handleLogout(msg) {
    await flushAll();
    await studentLogout();
    setQueueStudent(null);
    clearSession();
    setStudent(null);
    setLoginMsg(typeof msg === 'string' ? msg : '');
  }

  if (mode === null) return <RoleGate onPickStudent={() => setMode('student')} onPickAdmin={() => setMode('admin')} />;
  if (mode === 'admin') return <AdminTab onExit={() => setMode(null)} />;
  if (!student) {
    return <StudentLoginGate initialMessage={loginMsg} onLoggedIn={(s) => { setLoginMsg(''); setStudent(s); }} onBack={() => setMode(null)} />;
  }
  return <StudentApp key={student.studentNo} student={student} onLogout={handleLogout} />;
}
