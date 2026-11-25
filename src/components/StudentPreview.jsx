import { useState } from 'react';
import { useToast } from './ui';
import { QUESTION_COUNT } from '../lib/content';
import { normalizeDesign, clsLabel } from '../lib/design';
import { DiagStep, MeasureStep, ResultStep, LibraryStep } from './StudentSteps';
import DesignStep from './DesignStep';

const STEPS = [
  { key: 'diag', label: '자가진단' }, { key: 'measure', label: '측정 기록' }, { key: 'result', label: '진단 결과' },
  { key: 'library', label: '동작 라이브러리' }, { key: 'design', label: '설계도' },
];
const noop = () => {};

/**
 * 교사용: 한 학생이 보는 화면을 그 학생의 지금 기록으로 그대로 보여 줌.
 * 학생처럼 눌러 보고 입력해 볼 수 있지만, 바뀐 내용은 이 화면 안에만 있고 서버에는 아무것도 저장하지 않음.
 */
export default function StudentPreview({ detail: d, onClose }) {
  const [step, setStep] = useState('result');
  const [toast, showToast] = useToast();
  const [answers, setAnswers] = useState(() => Array.from({ length: QUESTION_COUNT }, (_, i) => Number(d.diag?.answers?.[i]) || 0));
  const [weak, setWeak] = useState(() => ({ areas: d.weak?.areas || [], reason: d.weak?.reason || '' }));
  const [design, setDesign] = useState(() => ({ data: normalizeDesign(d.design?.data), status: d.design?.status || '작성 중', submittedAt: d.design?.submittedAt || null }));
  const vals = d.measure?.vals || {};
  const run = { sec: d.student.runSec, text: d.student.runText };
  const preload = { avg: d.averages || {}, dist: d.distributions || {} };
  const notSaved = () => showToast('미리보기라 저장되지 않아요');
  // 제출도 체험만: 빈칸 검사는 실제와 같고, 통과하면 이 화면에서만 '제출됨'으로 보임
  const fakeSubmit = async () => {
    setDesign((g) => ({ ...g, status: '제출', submittedAt: new Date().toISOString() }));
    showToast('미리보기 제출 — 실제로는 제출되지 않았어요');
    return { ok: true };
  };
  return (
    <div className="preview-bg" role="dialog" aria-modal="true" aria-label="학생 화면 미리보기">
      <div className="preview-bar">
        <b>학생 화면 미리보기</b>
        <span>{clsLabel(d.student.className)} {d.student.number}번 {d.student.name} · 눌러 볼 수 있지만 저장되지 않아요 (닫으면 원래대로)</span>
        <button className="btn btn-outline btn-sm" type="button" onClick={onClose} id="pvclose">닫기</button>
      </div>
      <div className="preview-scroll">
        <div className="app-shell">
          <div className="app-header" style={{ position: 'static' }}>
            <h1>하이브리드 체력 프로그램</h1>
            <div className="sub">{clsLabel(d.student.className)} {d.student.number}번 {d.student.name}</div>
            <nav className="steps">
              {STEPS.map((s, i) => (
                <button key={s.key} type="button" className={step === s.key ? 'active' : ''} onClick={() => setStep(s.key)} data-pv={s.key}>{i + 1}. {s.label}</button>
              ))}
            </nav>
          </div>
          <div className="app-main">
            {step === 'diag' && <DiagStep answers={answers} editable onChange={setAnswers} preview />}
            {step === 'measure' && <MeasureStep vals={vals} run={run} sex={d.student.sex} />}
            {step === 'result' && (
              <ResultStep answers={answers} vals={vals} run={run} sex={d.student.sex} weak={weak} editable={design.status !== '제출'}
                submitted={design.status === '제출'} onChange={setWeak} showToast={showToast} preview preload={preload} />
            )}
            {step === 'library' && <LibraryStep viewed onViewed={noop} />}
            {step === 'design' && (
              <DesignStep studentNo={d.student.studentNo} design={design} weak={weak} runSec={d.student.runSec}
                settings={{ designOpen: true, suspiciousChars: 20 }} onChange={(data) => setDesign((g) => ({ ...g, data }))}
                onSubmit={fakeSubmit} onSaveNow={notSaved} showToast={showToast} preview />
            )}
          </div>
        </div>
      </div>
      {toast}
    </div>
  );
}
