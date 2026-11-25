import { useEffect, useRef, useState } from 'react';
import { MOVE_COUNT, MOVE_AREAS, RUN_WHERE, REP_SEC, WARN_MIN, areaName, moveAreaName } from '../lib/content';
import { designErrors, estimate, moveLabel, weakShare, fmtSec, fmtTime } from '../lib/design';
import { appendLog } from '../lib/offlineQueue';
import { Modal } from './ui';

const awayKey = (no) => `hybrid_away_${no}`;
const NUM_FIELDS = ['order', 'val', 'restMove', 'restRound', 'rounds', 'runDist'];

/**
 * 설계도 화면 보안 (PRD):
 *  - 붙여넣기·끌어 놓기·우클릭 차단 (paste/drop/contextmenu + beforeinput insertFromPaste)
 *  - 한 번에 많은 글자가 늘면(키보드 클립보드·음성 입력) '의심 입력' 기록
 *  - 다른 탭·앱으로 나갔다 오면(visibilitychange·blur) 1초 이상일 때 '이탈' 기록
 *  - 첫 진입 안내 팝업의 확인을 눌러야 작성·기록 시작
 * 기록은 오프라인 큐(appendLog)에 쌓였다가 서버로 전송된다.
 */
function useGuard({ active, studentNo }) {
  const away = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const start = () => {
      if (away.current) return;
      away.current = Date.now();
      try { localStorage.setItem(awayKey(studentNo), String(away.current)); } catch { /* 무시 */ }
    };
    const end = (force) => {
      if (!away.current) return;
      if (!force && (document.hidden || !document.hasFocus())) return;
      const s = away.current;
      away.current = null;
      try { localStorage.removeItem(awayKey(studentNo)); } catch { /* 무시 */ }
      if (Date.now() - s >= 1000) appendLog({ type: 'leave', start: s, end: Date.now() });
    };
    const onVis = () => (document.hidden ? start() : end());
    const onBlur = () => {
      // 태블릿에서 선택 목록(select)이 열릴 때 창 포커스가 빠지는 경우는 제외
      if (document.activeElement?.tagName === 'SELECT') return;
      start();
    };
    const onFocus = () => end();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', start);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', start);
      end(true);   // 화면을 떠날 때(다른 단계로 이동) 진행 중이던 이탈은 마무리
    };
  }, [active, studentNo]);
}

export default function DesignStep({ studentNo, design, weak, runSec, settings, onChange, onSubmit, onSaveNow, showToast, preview }) {
  const submitted = design.status === '제출';
  const editable = !preview && !!settings.designOpen && !submitted;
  const [introOk, setIntroOk] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);
  const g = design.data;
  useGuard({ active: editable && introOk, studentNo });

  // 붙여넣기 차단 — React 합성 이벤트에는 beforeinput 의 inputType 이 없어 직접 등록
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !editable) return undefined;
    const block = (e) => {
      e.preventDefault();
      if (e.type === 'paste' || e.type === 'drop') showToast('이 화면에서는 붙여넣기를 할 수 없어요');
    };
    const before = (e) => {
      if (/^insertFrom(Paste|Drop|Yank)/.test(e.inputType || '')) { e.preventDefault(); showToast('이 화면에서는 붙여넣기를 할 수 없어요'); }
    };
    ['paste', 'drop', 'dragover', 'contextmenu'].forEach((t) => el.addEventListener(t, block));
    el.addEventListener('beforeinput', before);
    return () => {
      ['paste', 'drop', 'dragover', 'contextmenu'].forEach((t) => el.removeEventListener(t, block));
      el.removeEventListener('beforeinput', before);
    };
  }, [editable, showToast]);

  function set(path, value, label, prev) {
    const keys = path.split('.');
    const last = keys.pop();
    const next = structuredClone(g);
    const target = keys.reduce((o, k) => o[k], next);
    target[last] = NUM_FIELDS.includes(last) ? (value === '' ? '' : Number(value)) : value;
    if (label && typeof value === 'string') {
      const delta = value.length - String(prev ?? '').length;
      if (delta >= (settings.suspiciousChars || 20)) appendLog({ type: 'paste', field: label, at: Date.now(), delta });
    }
    onChange(next);
  }
  const text = (path, label, value, multiline) => {
    const props = {
      value: value ?? '', disabled: !editable, autoComplete: 'off', spellCheck: false, 'data-d': path,
      onChange: (e) => set(path, e.target.value, label, value),
    };
    return multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />;
  };
  const numIn = (path, value, label) => (
    <input type="number" inputMode="numeric" min="0" value={value ?? ''} disabled={!editable} data-d={path} aria-label={label}
      onChange={(e) => set(path, e.target.value)} />
  );

  const e = estimate(g, runSec);
  const share = weakShare(g, weak.areas);
  const over = e.total > WARN_MIN * 60;
  const ordered = g.moves.map((m, i) => ({ m, i })).filter((x) => Number(x.m.order) >= 1).sort((a, b) => a.m.order - b.m.order);
  const dup = new Set(ordered.map((x) => x.m.order)).size !== ordered.length;
  const runLi = g.runDist ? <li key="run">러닝 {g.runDist}m</li> : null;
  const moveLis = ordered.map((x) => <li key={x.i}>{x.m.name || moveLabel(x.i)}{Number(x.m.val) > 0 ? ` (${x.m.val}${x.m.mode})` : ''}</li>);

  function askSubmit() {
    const errs = designErrors(g);
    if (errs.length) {
      setDialog({ title: '아직 비어 있는 칸이 있어요', body: <ul>{errs.map((x) => <li key={x}>{x}</li>)}</ul> });
      return;
    }
    setDialog({
      title: '최종 제출할까요?',
      body: <>
        <p>제출하면 선생님이 풀어 주기 전까지 <b>고칠 수 없어요.</b></p>
        {over && <div className="msg msg-warn">예상 시간이 {WARN_MIN}분을 넘어요. 그래도 제출할까요?</div>}
      </>,
      buttons: [
        { label: '더 고칠래요', cls: 'btn-outline', onClick: () => setDialog(null) },
        { label: '제출하기', onClick: doSubmit },
      ],
    });
  }
  async function doSubmit() {
    setDialog(null);
    setBusy(true);
    try {
      const res = await onSubmit();
      if (res.code === 'INCOMPLETE') setDialog({ title: '아직 비어 있는 칸이 있어요', body: <ul>{res.errors.map((x) => <li key={x}>{x}</li>)}</ul> });
      else if (res.code === 'CLOSED') setDialog({ title: '제출 시간이 아니에요', body: <p>선생님이 설계도 작성을 닫았어요. 작성한 내용은 저장되어 있어요.</p> });
    } catch (err) {
      setDialog({
        title: '제출하지 못했어요',
        body: <p>{err.network ? '인터넷 연결이 끊겼어요. 작성한 내용은 이 기기에 보관돼 있으니, 연결되면 다시 제출하세요.' : err.message}</p>,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef}>
      <div className="pin"><b>내가 고른 약점:</b> {weak.areas.map(areaName).join(', ') || '-'} · 약점 부위 동작 <b>{share.hit}/{share.total}칸</b><br /><b>이유:</b> {weak.reason}</div>
      {submitted && <div className="msg msg-ok">제출 완료 ({fmtTime(design.submittedAt)}). 고치려면 선생님께 잠금 해제를 요청하세요.</div>}
      {!preview && !submitted && !settings.designOpen && <div className="msg msg-warn">지금은 설계도 작성 시간이 아니에요. 선생님이 열어 주면 작성할 수 있어요. (보는 것은 가능)</div>}
      <div className="card">
        <h2>하이브리드 체력 프로그램 설계도</h2>
        <p className="muted" style={{ margin: 0 }}>동작 5개를 직접 적고, 동작마다 부위를 골라요. 내 약점 부위와 같은 동작은 색이 칠해져요. 이 화면은 붙여넣기가 안 되고, 나갔다 오면 기록돼요.</p>
      </div>

      <div className="card share" id="share">
        <div className="row between">
          <b>약점 부위 동작 비중</b>
          <span className={`big ${share.hit ? 'hit' : ''}`}>{share.hit}<span className="muted"> / {share.total}칸</span></span>
        </div>
        <div className="share-bar" aria-hidden="true">
          {g.moves.map((m, i) => <i key={i} className={!m.area ? 'empty' : weak.areas.includes(m.area) ? 'hit' : 'fill'} />)}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {MOVE_AREAS.map((a) => (
            <span key={a.key} className={`chip static ${weak.areas.includes(a.key) ? 'on' : ''}`}>{a.name} {share.counts[a.key]}</span>
          ))}
        </div>
        {weak.areas.includes('cardio') && <p className="muted" style={{ marginBottom: 0 }}>심폐는 동작 부위에 없어요. 러닝 구간(거리·위치)으로 보완해요.</p>}
      </div>

      {g.moves.slice(0, MOVE_COUNT).map((m, i) => {
        const hit = m.area && weak.areas.includes(m.area);
        const lb = moveLabel(i);
        return (
          <div className={`card move ${hit ? 'hit' : m.area ? '' : 'other'}`} key={i} data-move={i}>
            <h3>{hit && <span className="tag hit">약점 보완</span>}{lb}{m.area ? ` · ${moveAreaName(m.area)}` : ''}</h3>
            <div className="grid2">
              <div className="field"><label>동작명</label>{text(`moves.${i}.name`, `${lb} 동작명`, m.name)}</div>
              <div className="field"><label>부위</label>
                <select value={m.area || ''} disabled={!editable} data-d={`moves.${i}.area`} onChange={(ev) => set(`moves.${i}.area`, ev.target.value)}>
                  <option value="">선택</option>
                  {MOVE_AREAS.map((a) => <option key={a.key} value={a.key}>{a.name}{weak.areas.includes(a.key) ? ' (내 약점)' : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>사용 근육</label>{text(`moves.${i}.muscle`, `${lb} 사용 근육`, m.muscle)}</div>
            <div className="grid2">
              <div className="field"><label>정확한 자세</label>{text(`moves.${i}.posture`, `${lb} 정확한 자세`, m.posture, true)}</div>
              <div className="field"><label>안전 유의사항</label>{text(`moves.${i}.safety`, `${lb} 안전 유의사항`, m.safety, true)}</div>
            </div>
            <div className="field"><label>일상 활용</label>{text(`moves.${i}.daily`, `${lb} 일상 활용`, m.daily, true)}</div>
            <div className="grid2">
              <div className="field"><label>순서</label>
                <select value={m.order ?? ''} disabled={!editable} data-d={`moves.${i}.order`} onChange={(ev) => set(`moves.${i}.order`, ev.target.value)}>
                  <option value="">선택</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}번째</option>)}
                </select>
              </div>
              <div className="field"><label>횟수 또는 시간</label>
                <div className="amount">
                  <select value={m.mode} disabled={!editable} data-d={`moves.${i}.mode`} onChange={(ev) => set(`moves.${i}.mode`, ev.target.value)}>
                    <option value="회">횟수(회)</option><option value="초">시간(초)</option>
                  </select>
                  {numIn(`moves.${i}.val`, m.val, `${lb} 횟수/시간`)}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="card">
        <h2>프로그램 구성</h2>
        <div className="grid3">
          <div className="field"><label>동작 사이 휴식 (초)</label>{numIn('restMove', g.restMove, '동작 사이 휴식')}</div>
          <div className="field"><label>라운드 사이 휴식 (초)</label>{numIn('restRound', g.restRound, '라운드 사이 휴식')}</div>
          <div className="field"><label>라운드 수</label>{numIn('rounds', g.rounds, '라운드 수')}</div>
        </div>
        <div className="grid2">
          <div className="field"><label>러닝 거리 (m)</label>{numIn('runDist', g.runDist, '러닝 거리')}</div>
          <div className="field"><label>러닝 위치</label>
            <select value={g.runWhere} disabled={!editable} data-d="runWhere" onChange={(ev) => set('runWhere', ev.target.value)}>
              <option value="">선택</option>
              {RUN_WHERE.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>미리 보기</h2>
        <div className="grid2">
          <div className="preview">
            <b>진행 순서</b>
            <ol id="orderpv">
              {g.runWhere === '시작 전' && runLi}
              {moveLis.length ? moveLis : <li className="muted">순서를 정하면 여기에 보여요</li>}
              {g.runWhere === '라운드마다' && runLi}
            </ol>
            {g.rounds ? <div className="muted">{g.runWhere === '라운드마다' ? '위 묶음(러닝 포함)을' : '위 동작을'} {g.rounds}라운드 반복{g.runWhere === '마지막' && g.runDist ? ` → 마지막에 러닝 ${g.runDist}m` : ''}</div> : null}
            {dup && <div className="msg msg-warn" style={{ marginTop: 8 }}>순서 번호가 겹쳐요.</div>}
          </div>
          <div>
            <b>예상 소요시간</b>
            <div className={`est ${over ? 'over' : ''}`} id="est">{fmtSec(e.total)}</div>
            <div className="muted">
              한 라운드 {fmtSec(e.perRound)} × {e.rounds}라운드 + 라운드 휴식 {fmtSec(e.restRounds)}
              {e.runTimes ? ` + 러닝 ${fmtSec(e.runOnce)} × ${e.runTimes}번` : ''}<br />
              횟수는 1회 약 {REP_SEC}초, 러닝은 {runSec ? '내 1km 기록보다 조금 느린 속도' : '1km 7분 속도'}로 계산
            </div>
            {over && <div className="msg msg-warn" style={{ marginTop: 8 }}>{WARN_MIN}분을 넘어요. 라운드·횟수·휴식을 줄여 보세요.</div>}
          </div>
        </div>
      </div>

      {!submitted && !preview && (
        <div className="row end">
          <button className="btn btn-outline" type="button" disabled={!editable} onClick={onSaveNow} id="dsave">임시저장</button>
          <button className="btn btn-primary" type="button" disabled={!editable || busy} onClick={askSubmit} id="dsubmit">{busy ? '제출 중…' : '최종 제출'}</button>
        </div>
      )}

      {editable && !introOk && (
        <Modal title="설계도 작성 전에 꼭 읽어 주세요" buttons={[{ label: '확인하고 작성 시작', onClick: () => setIntroOk(true) }]}>
          <p>이 화면은 <b>붙여넣기가 안 되고</b>, 다른 탭이나 앱으로 <b>나갔다 오면 기록</b>됩니다.</p>
          <p className="muted">기록은 감점이 아니라 선생님이 확인하는 용도예요. 알림·화면 꺼짐도 기록될 수 있으니, 그런 일이 있었다면 선생님께 말씀드리면 돼요.</p>
        </Modal>
      )}
      {dialog && (
        <Modal title={dialog.title} buttons={dialog.buttons} onClose={() => setDialog(null)}>{dialog.body}</Modal>
      )}
    </div>
  );
}
