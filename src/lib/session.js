// localStorage 학생/교사 세션 (양궁 앱과 같은 방식)
const KEY = 'hybrid_student_session';
const TEACHER_KEY = 'hybrid_teacher_session';

function read(k) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch { /* 저장 실패해도 앱은 계속 사용 가능 */ }
}
function remove(k) {
  try {
    localStorage.removeItem(k);
  } catch { /* 무시 */ }
}

export const getSession = () => read(KEY);
export const setSession = (s) => write(KEY, s);
export const clearSession = () => remove(KEY);
export const getTeacherSession = () => read(TEACHER_KEY);
export const setTeacherSession = (s) => write(TEACHER_KEY, s);
export const clearTeacherSession = () => remove(TEACHER_KEY);
