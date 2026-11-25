// 오프라인 대응 (양궁 앱 offlineQueue 방식):
// 학생 입력은 항상 먼저 localStorage 큐에 남기고(markPending) 서버 저장을 시도한다.
// 성공하면 큐에서 지우고, 실패(와이파이 끊김 등)하면 남겨 뒀다가 'online' 이벤트·주기적 재시도로 다시 보낸다.
//
// 공용 태블릿 주의: 저장 RPC는 "지금 로그인한 학생"으로 저장되므로, 큐 항목마다 학번을 붙이고
// 지금 로그인한 학생의 항목만 보낸다. (앞 학생의 미전송 항목은 그 학생이 이 기기로 다시 로그인하면 전송됨)
import { saveDiag, saveWeak, saveDesign, markLibraryViewed, logActivity } from './api';

const STORAGE_KEY = 'hybrid_pending_v1';
let currentStudent = null;
const listeners = new Set();

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return memQueue;
  }
}
let memQueue = {};
function writeQueue(q) {
  memQueue = q;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch { /* 사생활 보호 모드 등 — 메모리에만 유지 */ }
  listeners.forEach((fn) => fn());
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setQueueStudent(studentNo) { currentStudent = studentNo; }

const keyOf = (section) => `${currentStudent}:${section}`;

/** section: diag | measure | weak | library | design */
export function markPending(section, payload) {
  if (!currentStudent) return;
  const q = readQueue();
  q[keyOf(section)] = { payload, updatedAt: Date.now() };
  writeQueue(q);
}
export function getPending(section) {
  return readQueue()[keyOf(section)]?.payload ?? null;
}
export function clearPending(section) {
  const q = readQueue();
  if (q[keyOf(section)]) {
    delete q[keyOf(section)];
    writeQueue(q);
  }
}
export function appendLog(entry) {
  if (!currentStudent) return;
  const q = readQueue();
  const k = keyOf('logs');
  q[k] = { payload: [...(q[k]?.payload || []), entry], updatedAt: Date.now() };
  writeQueue(q);
}
export function myPendingCount() {
  const prefix = `${currentStudent}:`;
  return Object.keys(readQueue()).filter((k) => k.startsWith(prefix)).length;
}

async function saveOne(section, p) {
  switch (section) {
    case 'diag': return saveDiag(p.answers, p.rev);
    case 'weak': return saveWeak(p.areas, p.reason, p.rev);
    case 'library': return markLibraryViewed();
    case 'design': return saveDesign(p.data, p.estMin, p.rev);
    case 'logs': return logActivity(p);
    default: return { ok: true };
  }
}

let onServerResult = () => {};
/** 서버 응답(설정 변경·잠김 등)을 화면에 알려 줄 콜백 */
export function setResultHandler(fn) { onServerResult = fn || (() => {}); }

let lastError = null;
export const getLastError = () => lastError;

/** 한 항목 전송. 성공(또는 서버가 받지 않기로 확정)하면 큐에서 지운다. */
export async function attemptSync(section) {
  const q = readQueue();
  const k = keyOf(section);
  const entry = q[k];
  if (!entry) return true;
  try {
    const res = await saveOne(section, entry.payload);
    lastError = null;
    onServerResult(section, res);
    if (res && res.ok === false && res.code === 'CLOSED') return false;   // 열리면 다시 보냄
    const now = readQueue();
    // 보내는 동안 학생이 더 고쳤으면 남겨 둠 (다음에 최신본 전송)
    if (now[k] && now[k].updatedAt === entry.updatedAt) {
      delete now[k];
      writeQueue(now);
    } else if (section === 'logs' && now[k]) {
      now[k] = { ...now[k], payload: now[k].payload.slice(entry.payload.length) };
      if (!now[k].payload.length) delete now[k];
      writeQueue(now);
    }
    return true;
  } catch (e) {
    lastError = e;
    onServerResult(section, null, e);
    return false;
  }
}

let flushing = false;
export async function flushAll() {
  if (flushing || !currentStudent) return;
  flushing = true;
  try {
    const prefix = `${currentStudent}:`;
    for (const k of Object.keys(readQueue()).filter((x) => x.startsWith(prefix))) {
      await attemptSync(k.slice(prefix.length));
    }
  } finally {
    flushing = false;
    listeners.forEach((fn) => fn());
  }
}

let started = false;
export function startAutoFlush() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { void flushAll(); });
  setInterval(() => { if (myPendingCount() > 0) void flushAll(); }, 8000);
}
