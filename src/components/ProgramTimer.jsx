import { useEffect, useRef, useState } from 'react';
import { timeline, FORMATS } from '../lib/program';

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let audio = null;
function beep(freq = 880, len = 0.12) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), gn = audio.createGain();
    o.frequency.value = freq; gn.gain.value = 0.15;
    o.connect(gn); gn.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + len);
  } catch { /* 소리를 낼 수 없는 기기 */ }
}

/**
 * '바로 해 보기' 타이머 — 움직임 교과서 훈련장의 실행 화면을 단순하게 옮김.
 * 정해진 시간 칸(초 동작·휴식·EMOM·타바타)은 자동으로 넘어가고, 횟수 동작·달리기는 '다 했어요'로 넘김.
 * AMRAP은 전체 시간 동안 목록을 돌며 '다 했어요'를 누를 때마다 다음 동작. 포타임·하이록스식은 시간 제한에서 멈춤.
 */
export default function ProgramTimer({ design, runSec, onClose }) {
  const tl = useRef(timeline(design, runSec)).current;
  const F = FORMATS[tl.format];
  const [phase, setPhase] = useState('ready'); // ready → count → go → done
  const [, force] = useState(0);
  const st = useRef({ clock: 0, last: 0, idx: 0, segStart: 0, paused: false, count: 3, done: 0, result: '', lastBeep: '' });
  const wake = useRef(null);
  const s = st.current;

  useEffect(() => () => { try { wake.current?.release(); } catch { /* 무시 */ } }, []);
  useEffect(() => {
    if (phase !== 'count' && phase !== 'go') return undefined;
    s.last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(), dt = now - s.last;
      s.last = now;
      if (s.paused) return force((x) => x + 1);
      if (phase === 'count') {
        const left = Math.ceil(3 - (s.clock + dt) / 1000);
        s.clock += dt;
        if (left !== s.count) { s.count = left; if (left > 0) beep(660); }
        if (s.clock >= 3000) { s.clock = 0; s.segStart = 0; beep(1100, 0.25); setPhase('go'); }
        return force((x) => x + 1);
      }
      s.clock += dt;
      const seg = tl.segs[s.idx];
      // tl.cap 은 초 단위, s.clock 은 밀리초
      if (tl.cap && s.clock >= tl.cap * 1000) return finish(`시간 제한 ${mmss(tl.cap * 1000)} 도달 · ${s.idx}/${tl.segs.length}칸 완료`);
      if (seg?.dur) {
        const left = seg.dur * 1000 - (s.clock - s.segStart);
        const sec = Math.ceil(left / 1000);
        if (sec <= 3 && sec > 0 && s.lastBeep !== `${s.idx}-${sec}`) { s.lastBeep = `${s.idx}-${sec}`; beep(660); }
        if (left <= 0) {
          if (seg.kind === 'amrap') s.result = `${Math.floor(s.done / seg.items.length)}라운드 + ${s.done % seg.items.length}동작`;
          next();
        }
      }
      force((x) => x + 1);
    }, 200);
    return () => clearInterval(id);
    // phase 가 바뀔 때만 다시 건다 (나머지는 ref)
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    s.clock = 0; s.idx = 0; s.done = 0; s.count = 3; s.result = '';
    try { navigator.wakeLock?.request('screen').then((w) => { wake.current = w; }).catch(() => {}); } catch { /* 무시 */ }
    beep(660);
    setPhase('count');
  }
  function next() {
    s.idx += 1; s.segStart = s.clock;
    if (s.idx >= tl.segs.length) return finish(s.result || `완주 · ${mmss(s.clock)}`);
    beep(1100, 0.2);
  }
  function finish(text) {
    s.result = text; beep(1300, 0.4);
    setPhase('done');
  }
  function tapDone() {
    const seg = tl.segs[s.idx];
    if (seg.kind === 'amrap') { s.done += 1; beep(990, 0.08); force((x) => x + 1); return; }
    next(); force((x) => x + 1);
  }

  const seg = tl.segs[s.idx];
  const nextSeg = tl.segs[s.idx + 1];
  const segMs = s.clock - s.segStart;
  const amrapItem = seg?.kind === 'amrap' ? seg.items[s.done % seg.items.length] : null;
  const label = amrapItem ? amrapItem.label : seg?.label;
  const sub = amrapItem ? amrapItem.sub : seg?.sub;
  const big = seg?.dur ? mmss(seg.dur * 1000 - segMs) : mmss(segMs);
  const kind = seg?.kind === 'amrap' ? 'work' : seg?.kind;

  return (
    <div className="timer" role="dialog" aria-modal="true" aria-label="바로 해 보기">
      <div className="timer-top">
        <span>{F.name} · {tl.segs.length}칸{tl.cap ? ` · 제한 ${mmss(tl.cap * 1000)}` : ''}</span>
        <span className="timer-clock">{phase === 'go' ? mmss(s.clock) : ''}</span>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose} id="tmclose">닫기</button>
      </div>
      {phase === 'ready' && (
        <div className="timer-mid">
          <div className="timer-label">준비됐나요?</div>
          <p>{F.rule}</p>
          <p className="muted">횟수 동작과 달리기는 다 하면 <b>다 했어요</b>를 눌러요. 시간 칸은 자동으로 넘어가요.</p>
          <button type="button" className="btn btn-accent timer-btn" onClick={start} id="tmstart" disabled={!tl.segs.length}>시작 ▶</button>
        </div>
      )}
      {phase === 'count' && <div className="timer-mid"><div className="timer-big">{Math.max(1, s.count)}</div></div>}
      {phase === 'go' && seg && (
        <div className={`timer-mid k-${kind}`}>
          {seg.tag && <div className="muted">{seg.tag}</div>}
          {seg.round && <div className="muted">{seg.round}라운드</div>}
          <div className="timer-label" id="tmlabel">{label}</div>
          <div className="timer-sub">{sub}</div>
          <div className="timer-big" id="tmbig">{big}</div>
          {seg.kind === 'amrap' && <div className="timer-sub">완료 {Math.floor(s.done / seg.items.length)}라운드 + {s.done % seg.items.length}동작</div>}
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {(!seg.dur || seg.kind === 'amrap') && <button type="button" className="btn btn-accent timer-btn" onClick={tapDone} id="tmdone">다 했어요 ▶</button>}
            <button type="button" className="btn btn-outline" onClick={() => { s.paused = !s.paused; force((x) => x + 1); }} id="tmpause">{s.paused ? '계속 ▶' : '잠깐 멈춤 ⏸'}</button>
            <button type="button" className="btn btn-outline" onClick={() => finish(`그만함 · ${s.idx}/${tl.segs.length}칸 · ${mmss(s.clock)}`)}>그만하기</button>
          </div>
          {nextSeg && <div className="timer-next">다음: {nextSeg.label} {nextSeg.sub}</div>}
          <div className="timer-bar"><i style={{ width: `${(s.idx / tl.segs.length) * 100}%` }} /></div>
        </div>
      )}
      {phase === 'done' && (
        <div className="timer-mid">
          <div className="timer-label">끝!</div>
          <div className="timer-big" style={{ fontSize: 40 }} id="tmresult">{s.result}</div>
          <p className="muted">운동한 시간 {mmss(s.clock)}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-outline" onClick={() => setPhase('ready')}>다시 하기</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
