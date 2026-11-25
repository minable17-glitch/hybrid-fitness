import { supabase } from './supabaseClient';

// 로그인 화면에 처음 들어올 때 한 번, 이전 익명 세션을 정리하고 새로 받는다
// (공용 태블릿에서 앞사람 세션과 섞이지 않게).
export async function ensureFreshAnonSession() {
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

// 로그인 제출 때는 세션이 있으면 그대로 쓴다 — 여러 번 틀려도 익명 로그인
// 횟수 제한에 걸리지 않게 (양궁 앱에서 겪은 문제).
async function ensureAnonSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  return ensureFreshAnonSession();
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const e = new Error(error.message || '서버 오류');
    // 네트워크 끊김과 서버가 거절한 경우를 구분 (오프라인 큐에서 사용)
    e.network = !error.code && /fetch|network|Failed|Load failed/i.test(error.message || '');
    throw e;
  }
  return data;
}

/* ── 학생 ── */
export async function studentLogin(studentNo, name) {
  await ensureAnonSession();
  return rpc('student_login', { p_student_no: studentNo, p_name: name });
}
export async function studentLogout() {
  try { await rpc('student_logout'); } catch { /* 오프라인이어도 로그아웃은 진행 */ }
  await supabase.auth.signOut().catch(() => {});
}
export const getMyState = () => rpc('get_my_state');
export const getSettingsPublic = () => rpc('get_settings_public');
export const getSchoolAverages = () => rpc('get_school_averages');
export const saveDiag = (answers, rev) => rpc('save_diag', { p_answers: answers, p_rev: rev });
export const saveMeasure = (vals, rev) => rpc('save_measure', { p_vals: vals, p_rev: rev });
export const saveWeak = (areas, reason, rev) => rpc('save_weak', { p_areas: areas, p_reason: reason, p_rev: rev });
export const markLibraryViewed = () => rpc('mark_library_viewed');
export const saveDesign = (data, estMin, rev) => rpc('save_design', { p_data: data, p_est: estMin, p_rev: rev });
export const submitDesign = (data, estMin, rev) => rpc('submit_design', { p_data: data, p_est: estMin, p_rev: rev });
export const logActivity = (entries) => rpc('log_activity', { p_entries: entries });


/* ── 교사 ── */
export async function teacherLogin(username, password) {
  await ensureAnonSession();
  return rpc('teacher_login', { p_username: username, p_password: password });
}
export async function teacherSignup(username, password, signupCode) {
  await ensureAnonSession();
  return rpc('teacher_signup', { p_username: username, p_password: password, p_signup_code: signupCode });
}
export async function teacherLogout() {
  try { await rpc('teacher_logout'); } catch { /* 무시 */ }
  await supabase.auth.signOut().catch(() => {});
}
export const adminOverview = () => rpc('admin_overview');
export const adminStudentDetail = (studentNo) => rpc('admin_student_detail', { p_student_no: studentNo });
export const adminSaveScore = (studentNo, items, isBlank) => rpc('admin_save_score', { p_student_no: studentNo, p_items: items, p_blank: isBlank });
export const adminSavePerf = (studentNo, p1, p2) => rpc('admin_save_perf', { p_student_no: studentNo, p_p1: p1, p_p2: p2 });
export const adminUnlockDesign = (studentNo) => rpc('admin_unlock_design', { p_student_no: studentNo });
export const adminSaveSettings = (patch) => rpc('admin_save_settings', { p_patch: patch });
export const adminImportRoster = (rows) => rpc('admin_import_roster', { p_rows: rows });
export const adminDeleteStudent = (studentNo) => rpc('admin_delete_student', { p_student_no: studentNo });
