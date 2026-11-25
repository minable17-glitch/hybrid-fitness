import { useState } from 'react';
import { AREAS, TEXTBOOK_LINKS, TEXTBOOK_SCENES, areaName } from '../lib/content';

/** 교과서 바로가기 버튼들 (내 약점 부위 먼저) */
export function TextbookShortcuts({ weakAreas = [], onOpen }) {
  const order = [...weakAreas, ...AREAS.map((a) => a.key).filter((k) => !weakAreas.includes(k))];
  return (
    <div className="tb-links">
      <div className="chips">
        <button type="button" className="chip" onClick={() => onOpen(TEXTBOOK_LINKS.home)}>교과서 처음</button>
        <button type="button" className="chip" onClick={() => onOpen(TEXTBOOK_LINKS.train)} data-tb="train">훈련 방식 배우기</button>
      </div>
      {order.map((k) => (
        <div key={k} className="tb-row">
          <span className={`tag ${weakAreas.includes(k) ? 'hit' : 'other'}`}>{areaName(k)}{weakAreas.includes(k) ? ' · 내 약점' : ''}</span>
          {(TEXTBOOK_SCENES[k] || []).map(([name, move, scene]) => (
            <button key={name} type="button" className="chip" onClick={() => onOpen(TEXTBOOK_LINKS.scene(move, scene))}>{name}</button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 앱 안에 교과서 띄우기 (iframe). 교과서는 원래 사이트에서 불러오므로 앱이 무거워지지 않음 */
export function TextbookFrame({ src, height = '72vh' }) {
  return (
    <div className="tb-frame" style={{ height }}>
      <iframe src={src} title="움직임 교과서" allow="fullscreen; camera" allowFullScreen />
    </div>
  );
}

/** 설계도 화면용: 화면 위에 교과서 창 (앱 안이라 이탈로 기록되지 않음) */
export function TextbookPanel({ weakAreas, onClose }) {
  const [src, setSrc] = useState(TEXTBOOK_LINKS.home);
  return (
    <div className="tb-panel" role="dialog" aria-modal="true" aria-label="움직임 교과서">
      <div className="preview-bar">
        <b>움직임 교과서</b>
        <span>앱 안에서 보는 중 · 설계도는 내 말로 적어요</span>
        <a className="btn btn-outline btn-sm" href={src} target="_blank" rel="noopener noreferrer" id="tbnew">새 창</a>
        <button className="btn btn-outline btn-sm" type="button" onClick={onClose} id="tbclose">닫기</button>
      </div>
      <div className="tb-panel-links"><TextbookShortcuts weakAreas={weakAreas} onOpen={setSrc} /></div>
      <iframe key={src} src={src} title="움직임 교과서" allow="fullscreen" allowFullScreen />
    </div>
  );
}
