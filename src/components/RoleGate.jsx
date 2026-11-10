export default function RoleGate({ onPickStudent, onPickAdmin }) {
  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="app-header">
        <h1>하이브리드 체력 프로그램</h1>
        <div className="sub">진단하고, 설계하고, 수행하기</div>
      </div>
      <div className="app-main">
        <div className="card center">
          <h2 style={{ marginBottom: 4 }}>역할을 선택하세요</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>학생과 선생님의 화면이 달라요</p>
          <div className="stack">
            <button className="btn btn-accent btn-block" type="button" onClick={onPickStudent} style={{ padding: '14px 16px', fontSize: 16 }}>
              학생으로 로그인
            </button>
            <button className="btn btn-outline btn-block" type="button" onClick={onPickAdmin} style={{ padding: '14px 16px', fontSize: 16 }}>
              선생님으로 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
