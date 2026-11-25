import { useEffect, useState } from 'react';
import { AREAS, ANSWERS, MEASURES, RUN, MIN_REASON, TEXTBOOK_URL } from '../lib/content';
import { diagSums, fmtSec, fmtNum } from '../lib/design';
import { getSchoolAverages, getMyDistributions } from '../lib/api';
import Distribution from './Distribution';
import { papsGrade } from '../lib/paps';

function Closed({ what }) {
  return <div className="msg msg-warn">지금은 {what} 시간이 아니에요. 선생님이 열어 주면 입력할 수 있어요. (보는 것은 가능)</div>;
}

/* ── 2. 일상 자가진단 ── */
export function DiagStep({ answers, editable, onChange, next }) {
  const n = answers.filter((v) => v >= 1).length;
  const offsets = AREAS.map((_, ai) => AREAS.slice(0, ai).reduce((t, a) => t + a.questions.length, 0));
  return (
    <>
      {!editable && <Closed what="진단 입력" />}
      <div className="card">
        <h2>일상 자가진단</h2>
        <p className="muted" style={{ margin: 0 }}>평소 생활을 떠올리며 솔직하게 골라 주세요. 점수가 아니라 나를 알아보는 기록이에요.</p>
        <p className="muted" style={{ marginBottom: 0 }}>{answers.length}문항 중 {n}문항 응답{n === answers.length ? ' — 모두 끝났어요!' : ''}</p>
      </div>
      {AREAS.map((area, ai) => (
        <div className="card" key={area.key}>
          <h3>{area.name}</h3>
          {area.questions.map((q, qj) => {
            const i = offsets[ai] + qj;
            return (
              <div className="q" key={i}>
                <p>{q}</p>
                <div className="seg" role="radiogroup" aria-label={q}>
                  {ANSWERS.map((t, v) => (
                    <button key={t} type="button" role="radio" aria-checked={answers[i] === v + 1} disabled={!editable}
                      className={answers[i] === v + 1 ? 'on' : ''}
                      onClick={() => { const a = answers.slice(); a[i] = v + 1; onChange(a); }}>{t}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {next}
    </>
  );
}

/* ── 3. 간이측정 기록 ── */
export function MeasureStep({ vals, run, sex, next }) {
  return (
    <>
      <div className="card">
        <h2>내 측정 기록</h2>
        <p className="muted" style={{ marginTop: 0 }}>체육 시간에 측정한 팝스 기록이에요. 선생님이 등록한 값이라 직접 입력하지 않아요. 친구와 비교하는 점수가 아니에요.</p>
        {MEASURES.map((m) => {
          const v = vals?.[m.key];
          return (
            <div className="meas" key={m.key} data-m={m.key}>
              <div><b>{m.name}</b><div className="muted">{m.note}</div></div>
              <div><b>{v == null || v === '' ? <span className="muted">기록 없음</span> : `${fmtNum(v)}${m.unit}`}</b>
                {papsGrade(m.key, sex, v) != null && <> <span className={`grade g${papsGrade(m.key, sex, v)}`}>팝스 {papsGrade(m.key, sex, v)}등급</span></>}</div>
            </div>
          );
        })}
        <div className="meas" data-m="run1km">
          <div><b>1km 달리기</b><div className="muted">수행평가 기록</div></div>
          <div><b>{run?.sec ? fmtSec(run.sec) : <span className="muted">기록 없음</span>}</b></div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>기록이 틀리거나 비어 있으면 선생님께 말씀드리세요.</p>
      </div>
      {next}
    </>
  );
}

/* ── 4. 진단 결과 + 약점 선택 ── */
let avgCache = null;

function level(sum) {
  if (sum == null) return { t: '응답 없음', c: '#c5cfcb', w: 0 };
  if (sum <= 4) return { t: '대체로 쉬움', c: '#2f9e78', w: (sum / 9) * 100 };
  if (sum <= 6) return { t: '가끔 힘듦', c: '#e0a00b', w: (sum / 9) * 100 };
  return { t: '자주 힘듦', c: '#e0613a', w: (sum / 9) * 100 };
}

let distCache = null;

export function ResultStep({ answers, vals, run, sex, weak, editable, submitted, onChange, next, showToast }) {
  const [avg, setAvg] = useState(avgCache);
  const [dist, setDist] = useState(distCache);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([getSchoolAverages(), getMyDistributions()]).then(([a, d]) => {
      avgCache = a; distCache = d;
      if (alive) { setAvg(a); setDist(d); }
    }).catch(() => { if (alive && !distCache) setErr('인터넷 연결이 끊겨 기록 분포를 불러오지 못했어요.'); });
    return () => { alive = false; };
  }, []);
  const sums = diagSums(answers);
  const rlen = String(weak.reason || '').trim().length;

  function toggle(k) {
    const a = weak.areas.slice();
    const i = a.indexOf(k);
    if (i >= 0) a.splice(i, 1);
    else if (a.length >= 2) { showToast('약점은 2개까지 고를 수 있어요'); return; }
    else a.push(k);
    onChange({ areas: a, reason: weak.reason });
  }

  const measureFor = (areaKey) => MEASURES.filter((m) => m.area === areaKey).map((m) => (
    <Distribution key={m.key} measureKey={m.key} name={m.name} mine={vals?.[m.key]} unit={m.unit} dist={dist?.[m.key]} avgInfo={avg?.[m.key]} sex={sex} />
  ));
  return (
    <>
      <div className="card">
        <h2>내 진단 결과</h2>
        <p className="muted" style={{ marginTop: 0 }}>왼쪽은 내가 느끼는 일상 속 어려움, 오른쪽은 내 측정 기록이 같은 성별 1학년 분포에서 어디쯤인지(상위 몇 %)예요. 주황 막대가 내 기록 구간, 점선이 평균이에요.</p>
        {err && <div className="msg msg-warn">{err}</div>}
        {!dist && !err && <p className="muted">기록 분포를 불러오는 중…</p>}
        {sums.map((s) => {
          const lv = level(s.sum);
          const ms = measureFor(s.key);
          if (s.key === RUN.area) ms.push(<Distribution key="run" measureKey="run1km" name="1km 달리기" mine={run?.sec} dist={dist?.run1km} avgInfo={avg?.run1km} lowerBetter isTime sex={sex} />);
          return (
            <div className="area" key={s.key}>
              <div>
                <h3>{s.name}</h3>
                <div className="muted">일상 자가진단</div>
                <div className="lvl"><i style={{ width: `${lv.w}%`, background: lv.c }} /></div>
                <b style={{ color: lv.c }}>{lv.t}</b>
              </div>
              <div>{ms.length ? ms : <span className="muted">관련 측정 항목 없음</span>}</div>
            </div>
          );
        })}
        <div className="area">
          <div><h3>유연성</h3><div className="muted">자가진단 부위에는 없는 체력</div></div>
          <div>{measureFor('etc')}</div>
        </div>
      </div>

      {submitted ? <div className="msg msg-info">설계도를 제출해서 약점 선택은 바꿀 수 없어요.</div> : !editable && <Closed what="약점 선택" />}
      <div className="card">
        <h2>우선 보완할 약점 부위</h2>
        <p className="muted" style={{ marginTop: 0 }}>위 결과를 보고 1~2개를 고르세요.</p>
        <div className="chips">
          {AREAS.map((a) => (
            <button key={a.key} type="button" data-weak={a.key} disabled={!editable} className={`chip ${weak.areas.includes(a.key) ? 'on' : ''}`} onClick={() => toggle(a.key)}>{a.name}</button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="wreason">고른 이유 — 진단 결과에서 찾은 근거를 들어 적어 보세요</label>
          <textarea id="wreason" rows={4} disabled={!editable} value={weak.reason}
            placeholder="예: 플랭크 기록이 학교 평균보다 낮고, 수업 시간에 오래 앉아 있으면 허리가 자주 힘들다."
            onChange={(e) => onChange({ areas: weak.areas, reason: e.target.value })} />
          <div className="muted">{rlen < MIN_REASON ? `조금 더 자세히 적어 주세요 (${rlen}/${MIN_REASON}자 이상)` : `${rlen}자`}</div>
        </div>
      </div>
      {next}
    </>
  );
}

/* ── 5. 동작 라이브러리: 3D 움직임 교과서 링크 ── */
export function LibraryStep({ viewed, onViewed, next }) {
  // 이 화면을 열면 '동작 학습'을 한 것으로 보고 설계도를 연다
  useEffect(() => { if (!viewed) onViewed(); }, [viewed, onViewed]);
  return (
    <>
      <div className="card">
        <h2>동작 라이브러리</h2>
        <p className="muted" style={{ marginTop: 0 }}>3D 움직임 교과서에서 부위별 동작의 사용 근육, 바른 자세, 안전, 일상 활용을 보고 배워요. 설계도에는 자동으로 들어가지 않으니, 이해한 내용을 내 말로 적어야 해요.</p>
        <a className="btn btn-accent" href={TEXTBOOK_URL} target="_blank" rel="noopener noreferrer" id="textbook">3D 움직임 교과서 열기 ↗</a>
      </div>
      {next}
    </>
  );
}
