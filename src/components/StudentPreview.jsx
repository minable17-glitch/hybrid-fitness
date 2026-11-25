import { useState } from 'react';
import { QUESTION_COUNT } from '../lib/content';
import { normalizeDesign, clsLabel } from '../lib/design';
import { DiagStep, MeasureStep, ResultStep, LibraryStep } from './StudentSteps';
import DesignStep from './DesignStep';

const STEPS = [
  { key: 'diag', label: '자가진단' }, { key: 'measure', label: '측정 기록' }, { key: 'result', label: '진단 결과' },
  { key: 'library', label: '동작 라이브러리' }, { key: 'design', label: '설계도' },
];
const noop = () => {};

/** 교사용: 한 학생이 보는 화면을 그 학생의 지금 기록으로 그대로 보여 줌 (읽기 전용, 아무것도 저장하지 않음) */
export default function StudentPreview({ detail: d, onClose }) {
  const [step, setStep] = useState('result');
  const answers = Array.from({ length: QUESTION_COUNT }, (_, i) => Number(d.diag?.answers?.[i]) || 0);
  const vals = d.measure?.vals || {};
  const run = { sec: d.student.runSec, text: d.student.runText };
  const weak = { areas: d.weak?.areas || [], reason: d.weak?.reason || '' };
  const design = { data: normalizeDesign(d.design?.data), status: d.design?.status || '작성 중', submittedAt: d.design?.submittedAt || null };
  const preload = { avg: d.averages || {}, dist: d.distributions || {} };
  return (
    <div className="preview-bg" role="dialog" aria-modal="true" aria-label="학생 화면 미리보기">
      <div className="preview-bar">
        <b>학생 화면 미리보기</b>
        <span>{clsLabel(d.student.className)} {d.student.number}번 {d.student.name} · 보기만 돼요</span>
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
            {step === 'diag' && <DiagStep answers={answers} editable={false} onChange={noop} preview />}
            {step === 'measure' && <MeasureStep vals={vals} run={run} sex={d.student.sex} />}
            {step === 'result' && (
              <ResultStep answers={answers} vals={vals} run={run} sex={d.student.sex} weak={weak} editable={false}
                submitted={design.status === '제출'} onChange={noop} showToast={noop} preview preload={preload} />
            )}
            {step === 'library' && <LibraryStep viewed onViewed={noop} />}
            {step === 'design' && (
              <DesignStep studentNo={d.student.studentNo} design={design} weak={weak} runSec={d.student.runSec}
                settings={{ designOpen: false }} onChange={noop} onSubmit={noop} onSaveNow={noop} showToast={noop} preview />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
