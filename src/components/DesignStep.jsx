import { useEffect, useRef, useState } from 'react';
import { MOVE_COUNT, MOVE_AREAS, REP_SEC, WARN_MIN, areaName, moveAreaName } from '../lib/content';
import { designErrors, moveLabel, weakShare, fmtSec, fmtTime } from '../lib/design';
import { FORMATS, FORMAT_KEYS, FIELDS, formatOf, timeline, timelineSummary, programHints, withFormatDefaults } from '../lib/program';
import { TextbookPanel } from './Textbook';
import ProgramTimer from './ProgramTimer';
import { appendLog } from '../lib/offlineQueue';
import { Modal } from './ui';

const awayKey = (no) => `hybrid_away_${no}`;
const NUM_FIELDS = ['order', 'val', 'restMove', 'restRound', 'rounds', 'runDist', 'cap', 'min', 'every', 'work', 'rest', 'runM'];

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
      // 앱 안 교과서 창(iframe)을 누르면 창 포커스가 iframe 으로 가지만 앱을 떠난 게 아님
      if (document.activeElement?.tagName === 'IFRAME') return;
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
  // 미리보기(교사)는 열기/닫기와 상관없이 눌러 볼 수 있게 — 저장·기록은 하지 않음
  const editable = (preview || !!settings.designOpen) && !submitted;
  const [introOk, setIntroOk] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showTb, setShowTb] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const boxRef = useRef(null);
  const g = design.data;
  useGuard({ active: editable && introOk && !preview, studentNo });

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
    if (label && typeof value === 'string' && !preview) {
      const delta = value.length - String(prev ?? '').length;
      if (delta >= (settings.suspiciousChars || 20)) appendLog({ type: 'paste', field: label, at: Date.now(), delta });
    }
    onChange(next);
  }
  const text = (path, label, value, multiline, placeholder) => {
    const props = {
      value: value ?? '', disabled: !editable, autoComplete: 'off', spellCheck: false, 'data-d': path, placeholder,
      onChange: (e) => set(path, e.target.value, label, value),
    };
    return multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />;
  };
  const numIn = (path, value, label) => (
    <input type="number" inputMode="numeric" min="0" value={value ?? ''} disabled={!editable} data-d={path} aria-label={label}
      onChange={(e) => set(path, e.target.value)} />
  );

  const share = weakShare(g, weak.areas);
  const f = formatOf(g), F = FORMATS[f];
  const tl = timeline(g, runSec);
  const over = tl.total > WARN_MIN * 60;
  const hints = programHints(g, runSec);
  const orders = g.moves.map((m) => Number(m.order)).filter((n) => n >= 1);
  const dup = new Set(orders).size !== orders.length;

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
      <div className="pin"><b>목표 부위:</b> {weak.areas.map(areaName).join(', ') || '-'} · 목표 부위 동작 <b>{share.hit}개 / {share.total}개</b><br /><b>이유:</b> {weak.reason}</div>
      {submitted && <div className="msg msg-ok">제출 완료 ({fmtTime(design.submittedAt)}). 고치려면 선생님께 잠금 해제를 요청하세요.</div>}
      {!preview && !submitted && !settings.designOpen && <div className="msg msg-warn">지금은 설계도 작성 시간이 아니에요. 선생님이 열어 주면 작성할 수 있어요. (보는 것은 가능)</div>}
      <div className="card">
        <h2>하이브리드 체력 프로그램 설계도</h2>
        <button type="button" className="btn btn-outline btn-sm" style={{ float: 'right' }} onClick={() => setShowTb(true)} id="dtextbook">📖 교과서 보기</button>
        <p className="muted" style={{ margin: 0 }}>동작 5개를 직접 적고, 동작마다 부위를 골라요. 목표 부위와 같은 동작은 배경색이 칠해져요. 이 화면은 붙여넣기가 안 되고, 나갔다 오면 기록돼요.</p>
      </div>

      <div className="card share" id="share">
        <div className="row between">
          <b>목표 부위 동작</b>
          <span className={`big ${share.hit ? 'hit' : ''}`}>{share.hit}개<span className="muted"> / {share.total}개</span></span>
        </div>
        <div className="share-bar" aria-hidden="true">
          {g.moves.map((m, i) => <i key={i} className={!m.area ? 'empty' : weak.areas.includes(m.area) ? 'hit' : 'fill'} />)}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {MOVE_AREAS.map((a) => (
            <span key={a.key} className={`chip static ${weak.areas.includes(a.key) ? 'on' : ''}`}>{a.name} {share.counts[a.key]}</span>
          ))}
        </div>
      </div>

      {g.moves.slice(0, MOVE_COUNT).map((m, i) => {
        const hit = m.area && weak.areas.includes(m.area);
        const lb = moveLabel(i);
        return (
          <div className={`card move ${hit ? 'hit' : m.area ? '' : 'other'}`} key={i} data-move={i}>
            <h3>{hit && <span className="tag hit">목표 부위</span>}{lb}{m.area ? ` · ${moveAreaName(m.area)}` : ''}</h3>
            <div className="grid2">
              <div className="field"><label>부위</label>
                <select value={m.area || ''} disabled={!editable} data-d={`moves.${i}.area`} onChange={(ev) => set(`moves.${i}.area`, ev.target.value)}>
                  <option value="">선택</option>
                  {MOVE_AREAS.map((a) => <option key={a.key} value={a.key}>{a.name}{weak.areas.includes(a.key) ? ' (목표)' : ''}</option>)}
                </select>
              </div>
              <div className="field"><label>동작명</label>{text(`moves.${i}.name`, `${lb} 동작명`, m.name)}</div>
            </div>
            <div className="field"><label>사용 근육</label>{text(`moves.${i}.muscle`, `${lb} 사용 근육`, m.muscle, false, '어느 근육을 쓰나요? (예: 가슴·삼두)')}</div>
            <div className="grid2">
              <div className="field"><label>정확한 자세</label>{text(`moves.${i}.posture`, `${lb} 정확한 자세`, m.posture, true, '핵심 포인트 (예: 무릎이 발끝을 넘지 않게)')}</div>
              <div className="field"><label>안전 유의사항</label>{text(`moves.${i}.safety`, `${lb} 안전 유의사항`, m.safety, true, '다칠 수 있는 지점과 예방법 (예: 반동 쓰면 허리 다침)')}</div>
            </div>
            <div className="field"><label>일상 활용</label>{text(`moves.${i}.daily`, `${lb} 일상 활용`, m.daily, true, '이 힘을 일상 어디에 쓰나요? (예: 무거운 가방 들 때)')}</div>
            <div className="grid2">
              <div className="field"><label>순서</label>
                <select value={m.order ?? ''} disabled={!editable} data-d={`moves.${i}.order`} onChange={(ev) => set(`moves.${i}.order`, ev.target.value)}>
                  <option value="">선택</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}번째</option>)}
                </select>
              </div>
              <div className="field"><label>횟수 또는 시간</label>
                {!F.amounts ? <div className="muted" style={{ padding: '10px 0' }}>타바타는 운동·휴식 시간을 따라요</div> : <div className="amount">
                  <select value={m.mode} disabled={!editable} data-d={`moves.${i}.mode`} onChange={(ev) => set(`moves.${i}.mode`, ev.target.value)}>
                    <option value="회">횟수(회)</option><option value="초">시간(초)</option>
                  </select>
                  {numIn(`moves.${i}.val`, m.val, `${lb} 횟수/시간`)}
                </div>}
              </div>
            </div>
          </div>
        );
      })}

      <div className="card" id="formatCard">
        <h2>훈련 방식</h2>
        <p className="muted" style={{ margin: 0 }}>움직임 교과서 '하이브리드 훈련장'의 방식 중 하나를 골라 구성해요.
          <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 6 }} onClick={() => setShowTb(true)}>방식 배우기 (교과서)</button></p>
        <div className="fmt-grid" role="radiogroup" aria-label="훈련 방식">
          {FORMAT_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f === k} className={`fmt ${f === k ? 'on' : ''}`} disabled={!editable}
              data-format={k} onClick={() => onChange(withFormatDefaults(g, k))}>
              <b>{FORMATS[k].name}</b><small>{FORMATS[k].ko}</small>
            </button>
          ))}
        </div>
        <div className="fmt-desc">
          <b>{F.name}</b> <span className="muted">({F.from})</span>
          <p>{F.rule}</p>
          <p className="muted">💡 {F.tip}</p>
        </div>
        <div className="grid3">
          {F.fields.map((k) => (
            <div className="field" key={k}><label>{FIELDS[k].label} ({FIELDS[k].unit})</label>{numIn(k, g[k], FIELDS[k].label)}</div>
          ))}
        </div>
        {f === 'race' ? (
          <p className="muted" style={{ margin: 0 }}>러닝은 동작(스테이션) 앞마다 {g.runM || '?'}m씩 들어가요. 모두 {MOVE_COUNT}번 달려요.</p>
        ) : (
          <div className="grid2">
            <div className="field"><label>러닝 거리 (m)</label>{numIn('runDist', g.runDist, '러닝 거리')}</div>
            <div className="field"><label>러닝 위치</label>
              <select value={g.runWhere} disabled={!editable} data-d="runWhere" onChange={(ev) => set('runWhere', ev.target.value)}>
                <option value="">선택</option>
                {F.runWhere.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>미리 보기</h2>
        <div className="grid2">
          <div className="preview">
            <b>진행표</b> <span className="muted">{timelineSummary(g)}</span>
            <ol className="tl" id="orderpv">
              {tl.segs.slice(0, 30).map((sg, k) => (
                <li key={k} className={`tl-${sg.kind}`}>{sg.tag ? <span className="muted">{sg.tag} </span> : null}{sg.label} <span className="muted">{sg.sub}</span></li>
              ))}
              {tl.segs.length > 30 && <li className="muted">… 모두 {tl.segs.length}칸</li>}
              {!tl.segs.length && <li className="muted">동작을 적으면 여기에 보여요</li>}
            </ol>
            {dup && <div className="msg msg-warn" style={{ marginTop: 8 }}>순서 번호가 겹쳐요.</div>}
          </div>
          <div>
            <b>예상 소요시간</b>
            <div className={`est ${over ? 'over' : ''}`} id="est">{fmtSec(tl.total)}</div>
            <div className="muted">
              {tl.cap ? `시간 제한 ${tl.cap / 60}분 · ` : ''}횟수는 1회 약 {REP_SEC}초, 러닝은 {runSec ? '내 1km 기록보다 조금 느린 속도' : '1km 7분 속도'}로 계산
            </div>
            {over && <div className="msg msg-warn" style={{ marginTop: 8 }}>{WARN_MIN}분을 넘어요. 시간·라운드·횟수를 줄여 보세요.</div>}
            {hints.map((h) => <div key={h} className="msg msg-info" style={{ marginTop: 8 }}>{h}</div>)}
            <button type="button" className="btn btn-accent" style={{ marginTop: 10 }} disabled={!tl.segs.length} onClick={() => setShowTimer(true)} id="dplay">▶ 바로 해 보기</button>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>타이머로 내 프로그램을 따라 해 봐요. 저장과는 상관없어요.</div>
          </div>
        </div>
      </div>

      {!submitted && (
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
      {showTb && <TextbookPanel weakAreas={weak.areas} onClose={() => setShowTb(false)} />}
      {showTimer && <ProgramTimer design={g} runSec={runSec} onClose={() => setShowTimer(false)} />}
    </div>
  );
}
