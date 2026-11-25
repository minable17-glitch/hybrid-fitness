import { useCallback, useEffect, useRef, useState } from 'react';

/** 화면 안 모달 — 브라우저 alert/confirm은 설계도 화면에서 '이탈'로 잡힐 수 있어 쓰지 않음 */
export function Modal({ title, children, buttons, onClose, wide }) {
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && <h2>{title}</h2>}
        <div>{children}</div>
        <div className="row end" style={{ marginTop: 16 }}>
          {(buttons || [{ label: '확인', onClick: onClose }]).map((b) => (
            <button key={b.label} id={b.id} type="button" className={`btn ${b.cls || 'btn-primary'}`} onClick={b.onClick} disabled={b.disabled}>{b.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2600);
  }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  return [msg ? <div key="toast" className="toast" role="status">{msg}</div> : null, show];
}

/** 고정 머리글 높이를 CSS 변수(--hdr)로 — 설계도 상단 목표 부위 표시·채점 패널 위치용 */
export function useHeaderHeight(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
