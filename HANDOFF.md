# 하이브리드 체력 프로그램 — 프로젝트 인수인계 문서

다른 AI 코딩 도구/세션이 처음부터 맥락을 파악할 수 있도록 쓴 문서입니다.

## 1. 프로젝트 개요

- **무엇**: 중1 2학기 '하이브리드 체력 프로그램 설계 및 수행' 단원(5~6차시)용 웹앱. 학생이 일상 자가진단 + 간이측정으로 자기 체력을 진단하고, 학교 평균 대비 위치를 보며 약점 부위를 고른 뒤, 동작 5칸(칸마다 부위 선택)으로 된 설계도를 작성·제출한다.
- **평가 연계**: 설계 14점은 이 앱의 설계도로 채점(5항목 × 2점 = 10점 → 환산), 수행 6점은 교사 관찰(2회).
- **PRD 개정 (2026-11-10)**: 처음 PRD는 '약점 동작 3 + 그 외 2' 고정 칸 + 6항목 채점(②만 4점)이었는데, 개정판에서 ① 동작 5칸마다 부위(상체 밀기/상체 당기기/코어/하체 지구력/하체 순발력)를 고르고 약점 부위와 같은 동작은 색칠해 비중을 보여 주며 ② 자세와 안전을 칸 분리 ③ 채점 5항목 각 2점 + 새 환산표로 바뀌었다. 지금 코드는 개정판 기준. 진단 기록(자가진단·측정·평균 대비 위치)은 **점수에 넣지 않는다.**
- **누구를 위해**: 비개발자 교사가 실제 학급(태블릿, 체육관·교실)에서 운영.
- **원본 기획서**: 교사가 준 PRD(구글 앱스크립트 + 구글 시트 기준). 처음엔 PRD대로 앱스크립트로 만들었다가, 교사 요청으로 **기존 앱들(새싹책방·양궁·캐치볼)과 같은 React + Vite + Supabase + GitHub Pages 구조**로 다시 만들었다. 인증·RPC·오프라인 큐·PWA 설정은 `level-up-archery` 저장소 패턴을 그대로 따랐다.

## 2. 기술 스택

```
React 19 + Vite 8, 단일 페이지 앱 (라우터 없음, state로 화면 전환)
Supabase (Postgres + Anonymous Auth) — 이 앱 전용 프로젝트
vite-plugin-pwa (양궁 앱과 같은 NetworkFirst 전략)
xlsx — 명렬표 파일 읽기, 일람표 내보내기 (교사 화면에서만 동적 import)
```

**인증**: 학생·교사 모두 내부적으로 Supabase **익명 세션**. 로그인 화면에 들어올 때 `ensureFreshAnonSession()`(signOut → signInAnonymously)으로 새 세션을 받고, 신원 확인은 SECURITY DEFINER RPC 안에서 한다.
- 학생: `student_login(학번, 이름)` — PRD대로 PIN 없음. 명렬표와 공백 무시하고 정확히 일치해야 함. 성공하면 `roster.auth_user_id = auth.uid()`. **한 학생 = 한 세션**이라 다른 기기에서 로그인하면 이전 기기 저장은 "로그인 정보를 찾을 수 없어요"로 막히고, 화면에 다시 로그인 안내가 뜬다(미전송 입력은 그 기기 큐에 남음).
- 교사: 아이디+비밀번호(bcrypt). `teacher_sessions` 테이블이라 여러 기기 동시 로그인 가능. 첫 계정은 가입 코드 없이, 이후는 `app_settings.signup_code` 필요.

**환경변수**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.example`). 배포 시에는 `.github/workflows/deploy.yml`에 직접 적는다(publishable key는 공개용).

## 3. 화면 구조

```
App.jsx  RoleGate(학생/선생님) → StudentLoginGate → StudentApp   /  AdminTab
StudentApp   상단 단계 버튼 5개 (앞 단계 완료 시 열림)
  1 자가진단      DiagStep      6부위 × 3문항, 쉽다/가끔 힘듦/자주 힘듦
  2 측정 기록     MeasureStep   7항목 입력 + 1km(교사가 명렬표로 등록, 읽기 전용)
  3 진단 결과     ResultStep    부위별 [자가진단 막대 | 측정 기록의 학교 평균 대비 위치] + 약점 1~2개·이유(10자 이상)
  4 동작 라이브러리 LibraryStep  부위별 카드(3D 링크 iframe / "준비 중"). 열면 '봤음' 기록 → 설계도 열림
  5 설계도        DesignStep    상단 고정 약점·이유·약점 동작 비중(n/5칸), 비중 막대, 동작 5칸(동작명·부위·근육·자세·안전·일상 활용·순서·횟수/시간,
                                약점 부위 동작은 주황색), 구성, 진행 순서·예상 시간 미리보기, 임시저장/최종 제출
AdminTab  교사 로그인/가입 → 반 선택 + 탭 7개
  진행 현황 / 이탈·의심 입력 / 학생 상세·채점(AdminGrade) / 수행 기록 / 학교 평균 / 명렬표·설정·일람표 / 동작 라이브러리
```

## 4. 파일 지도

```
src/
  App.jsx                  역할·세션 셸
  index.css                디자인 토큰 + 유틸 클래스 (양궁 앱과 같은 클래스 이름: card, field, btn btn-primary, msg msg-error …)
  lib/
    content.js             ★ 문항·측정 항목·설계 동작 부위(MOVE_AREAS)·채점 항목(SCORE_ITEMS) 정의 — 내용 바꿀 때 여기만
    design.js              설계도 빈칸 검사·약점 동작 비중(weakShare)·예상 시간·환산표·완료 판정·1km 파싱 (순수 함수, schema.sql 과 같은 규칙)
    api.js                 모든 Supabase RPC 래퍼. 네트워크 오류는 err.network=true
    offlineQueue.js        학생 저장 큐 (양궁 앱 방식 + 학번별 분리)
    session.js / supabaseClient.js / useOnlineStatus.js
  components/
    StudentApp.jsx         상태 로드·오프라인 병합·단계 잠금·저장 상태 표시·설정 폴링(20초)
    StudentSteps.jsx       Diag/Measure/Result/Library 단계 + MoveCard
    DesignStep.jsx         설계도 + 화면 보안(useGuard)
    AdminTab.jsx           교사 로그인·셸
    AdminTables.jsx        진행 현황·이탈 기록·수행 기록 표
    AdminGrade.jsx         학생 상세 + 설계 채점 패널(충족/부분/미흡 클릭 즉시 저장)
    AdminSetup.jsx         학교 평균·열기/닫기·명렬표 등록·일람표·동작 라이브러리 편집
    ui.jsx                 Modal, useToast, useHeaderHeight
supabase/schema.sql        전체 스키마 + RPC (다시 실행해도 안전)
```

## 5. DB 요약 (`supabase/schema.sql`)

| 테이블 | 용도 |
|---|---|
| `teachers`, `teacher_sessions` | 교사 계정, 익명 세션 ↔ 교사 연결 |
| `app_settings` (1행) | 진단 열기/설계 열기, 의심 입력 기준(기본 20자), 평균 기준값 jsonb, 교사 가입 코드 |
| `roster` | 명렬표(학번 PK, 반, 번호, 이름, 1km 원문·초), `auth_user_id` |
| `diagnoses` | 18문항 응답 int[], done |
| `measures` | 7항목 jsonb, done |
| `weaknesses` | 약점 부위 text[], 이유, done, library_viewed |
| `designs` | 설계도 jsonb `{moves:[{name, area, muscle, posture, safety, daily, order, mode, val}×5], restMove, restRound, rounds, runDist, runWhere}`, 예상 분, 상태, 제출 시각 |
| `activity_logs` | 이탈(나간·돌아온 시각, 머문 초) / 의심 입력(입력란, 늘어난 글자 수) |
| `moves` | 동작 라이브러리 (select만 공개) |
| `scores` | 설계 5항목(각 0~2), 미참여·백지, 설계합계(0~10)·환산, 수행 1·2회, 수행 점수, 총점 |

- 모든 테이블 RLS on, `moves` select 외 직접 접근 없음. 내부 도우미(`me_student`, `assert_teacher`, `compute_averages`, `recompute_score`)는 `revoke execute`로 RPC 호출을 막았다.
- 학생 저장 RPC는 `{ok, code?, settings}`를 돌려준다. `code`: `CLOSED`(교사가 닫음 → 큐에 남겨 두고 열리면 재전송), `LOCKED`(제출됨 → 서버본으로 교체), `INCOMPLETE`(제출 시 빈칸 목록).
- **rev**: 학생 기기에서 마지막으로 고친 시각(ms). upsert의 `where 기존.rev <= 새.rev`로, 늦게 도착한 옛 저장이 최신본을 덮지 못한다. 교사 잠금 해제는 rev를 지금으로 올려서 기기의 옛 사본을 무효화.
- 환산: `design_convert`(합계 9~10→14, 8→12, 7→10, 5~6→8, 3~4→6, 0~2(제출)→4, 백지→2), `perf_convert`(4→6, 3→5, 2→4, 1→3, 미참여→2). **참여했는데 2회 합계 0점은 PRD에 없어 2점으로 처리 — 교사 확인 필요.**
- 학교 평균: 학생에게는 `get_school_averages()`로 평균·표준편차만(인원·분포·다른 학생 값 없음). 위치 표시는 (내 기록-평균)/표준편차를 ±2로 자른 막대 + "평균보다 높음/비슷/낮음" 문구, 순위·점수 없음.

## 6. 설계도 화면 보안 (PRD)

`DesignStep.jsx`
- 붙여넣기 차단: `paste`/`drop`/`dragover`/`contextmenu` preventDefault + 네이티브 `beforeinput`의 `insertFromPaste|Drop|Yank` 차단 (React 합성 이벤트엔 inputType이 없어 직접 등록).
- 의심 입력: 입력란 값이 한 번에 `suspiciousChars`(기본 20) 이상 늘면 기록. 태블릿 키보드 클립보드·음성 입력 대응. 음성으로 한 문장을 말해도 잡히는 건 의도된 동작(교사 확인용).
- 이탈: 안내 팝업 확인 후, `visibilitychange`/`blur`(select 목록 열림 제외)/`pagehide` → 돌아오면 1초 이상일 때 기록. 나간 채 창을 닫으면 `hybrid_away_<학번>`이 남아 다음 로그인 때 "화면을 닫은 뒤 다시 로그인"으로 기록.
- 확인 창은 전부 화면 안 모달(브라우저 alert/confirm은 blur를 일으켜 이탈로 잡힐 수 있음).

## 7. 오프라인·동시 접속

- 입력 즉시 `markPending` → 800ms 뒤 서버 전송, 8초마다·`online` 이벤트마다 재시도. 큐 키는 `학번:섹션`이고 **지금 로그인한 학생 것만 전송**(공용 태블릿에서 앞 학생 큐가 다음 학생 이름으로 저장되는 사고 방지).
- 와이파이가 끊긴 채 앱을 다시 열면 마지막으로 받은 상태(`hybrid_state_<학번>`) + 큐로 이어서 작성 가능.
- 동시 접속: 학생마다 자기 행만 upsert. 30명 × 2건 동시 저장 테스트에서 오류·섞임 없음.

## 8. 테스트 방법 (이 세션에서 한 것)

실제 Supabase 대신 로컬 Postgres 16에 `schema.sql`을 그대로 올리고, `auth.uid()`를 `request.jwt.claim.sub` 설정값으로 대신하는 스텁 + `anon` 역할로 RPC를 실행하는 작은 HTTP 브리지를 두고, Vite 별칭으로 `supabaseClient`만 가짜로 바꾼 빌드를 Playwright로 돌렸다. 확인한 것:
- 명렬표 붙여넣기(머리글 인식, 중복 학번 경고, "6:02:00" 시각 형식 → 6분 2초), 잘못된 이름 차단, 단계 잠금, 약점 3개째 거부
- 붙여넣기 차단(paste·beforeinput), 의심 입력(32자) 기록, 이탈 1회 기록, 예상 시간 계산(16분 52초 → 15분 초과 경고)
- 오프라인 중 저장 → 기기 큐 보관 → 복구 후 자동 전송, 제출 후 입력 잠김
- 설계도 부위 선택 → 약점 부위 동작 3/5칸 표시·주황 칸 3개
- 교사 채점 5항목(충족 4 + 부분 1 = 9/10) → 14점, 수행 2+1 → 5점, 총 19점, 환산표 0~10 전 구간 SQL 확인
- 예전 스키마(6항목) DB 위에 새 schema.sql 재실행 → 오류 없이 5항목으로 바뀜, 일람표 xlsx(반별 시트, 미제출 학생 설계 2점)
- 잠금 해제 → 학생 다시 수정 가능(오프라인 때 고친 내용 유지)
- 학생 세션으로 교사 함수 호출 거부, 세션 없이 호출 거부, 다른 기기 로그인 후 이전 기기 저장 거부
- 30명 동시 저장 오류 0건·섞임 없음, rev 보호(옛 저장이 최신본을 덮지 않음)
- 태블릿 세로(820)·가로(1180)·폰(390)에서 가로 스크롤 없음

**실제 Supabase 프로젝트에서는 아직 안 돌려 봤다.** 배포 후 학생 2~3명으로 한 번 확인할 것.

## 9. 결정 필요 항목 (PRD) — 지금 정해 둔 값

1. 교사 화면 범위: 채점·수행 기록까지 앱에 넣음.
   - 약점 부위에 '심폐'를 고르면 동작 부위에는 심폐가 없으므로, 설계도에 "러닝 구간으로 보완" 안내만 띄운다(비중 계산에는 안 들어감).
2. 명렬표 열: 반·번호·학번·이름·1km 기록. 반 수·인원 제한 없음.
3. 자가진단 문항: 부위별 3문항 초안 → `src/lib/content.js`의 `AREAS`. **문항 수를 바꾸면** `schema.sql`의 `save_diag`(18 고정)도 함께 고칠 것.
4. 3D 콘텐츠: 링크 방식(https 주소 → 카드 안 iframe + 새 창 링크). 교사 화면 '동작 라이브러리'에서 입력.
