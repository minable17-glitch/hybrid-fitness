# 하이브리드 체력 프로그램 (hybrid-fitness)

중1 2학기 '하이브리드 체력 프로그램 설계 및 수행' 단원용 웹앱. 학생이 자기 체력을 진단하고, 그 결과를 보며 약점을 보완하는
하이브리드 체력 프로그램 설계도를 한 앱에서 작성·제출합니다. 설계도는 그대로 설계 채점표(5항목 × 2점 → 14점 환산)가 됩니다.

React 19 + Vite + Supabase + GitHub Pages (양궁·캐치볼 앱과 같은 구조). 자세한 구조·설계 이유는 [`HANDOFF.md`](./HANDOFF.md).

- 🎒 **학생**: 학번+이름 로그인(명렬표와 정확히 일치할 때만) → ① 자가진단 → ② 측정 기록 → ③ 진단 결과·약점 선택 → ④ 동작 라이브러리(3D 움직임 교과서 링크) → ⑤ 설계도 작성·제출(동작 5칸마다 부위를 고르고, 약점 부위 동작은 색칠되어 비중이 보임). 앞 단계를 마쳐야 다음 단계가 열리고, 입력은 자동 저장(와이파이가 끊겨도 기기에 보관 후 자동 전송).
- 👩‍🏫 **선생님**: 진행 현황 · 이탈/의심 입력 기록 · 학생 상세+설계 채점 · 수행 기록 · 학교 평균 · 명렬표/열기·닫기/일람표(.xlsx). 주소 뒤에 `?teacher`를 붙이면 바로 선생님 화면.

## 처음 설정 (한 번만)

이 앱은 **전용 수파베이스 프로젝트**를 씁니다. 다른 앱과 표·계정을 공유하지 않습니다.

1. **수파베이스 프로젝트 만들기**: https://supabase.com/dashboard → New project → 이름 `hybrid-fitness`, 지역 Northeast Asia (Seoul). 무료 플랜은 조직당 활성 프로젝트 2개까지라, 자리가 없으면 안 쓰는 프로젝트를 Pause 하거나 새 Organization을 만드세요.
2. **익명 로그인 켜기**: Authentication → Sign In / Providers → **Anonymous Sign-Ins** 켜기.
3. **SQL 실행**: SQL Editor → `supabase/schema.sql` 내용을 붙여 넣고 Run. (다시 실행해도 데이터는 지워지지 않음)
4. **주소·키 넣기**: Project Settings → API 의 Project URL과 publishable key를 `.github/workflows/deploy.yml`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`에 넣고 커밋. (publishable key는 공개용 값이라 커밋해도 안전 — 실제 접근 제어는 RLS + RPC 함수가 담당)
5. **GitHub Pages 켜기**: 저장소 Settings → Pages → Source를 **GitHub Actions**로. 이후 `main`에 push하면 자동 배포 → `https://<아이디>.github.io/hybrid-fitness/`
6. **선생님 계정 만들기**: 배포된 주소 → 선생님으로 로그인 → "계정 만들기". 첫 계정은 가입 코드 없이, 두 번째부터는 가입 코드(기본 `hybrid-2026`, 선생님 화면에서 변경)가 필요.
7. **명렬표 등록**: 선생님 화면 → 명렬표·설정·일람표 → 스프레드시트에서 `반 · 번호 · 학번 · 이름 · 1km 기록` 열을 복사해 붙여넣기(또는 엑셀 파일) → 등록.

## 수업 운영

- 수업 시작 때 **진단 입력** / **설계도 작성**을 열고, 끝나면 닫기. 학생 화면에는 20초 안에 반영되고, 닫혀 있으면 보기만 됩니다.
- 설계도를 제출한 학생은 선생님이 **잠금 해제**하기 전까지 고칠 수 없습니다.
- 이탈·의심 입력 기록은 자동 감점이 아니라 확인용입니다 (알림·화면 꺼짐도 잡힐 수 있음).

## 로컬 개발

```bash
npm install
cp .env.example .env   # Supabase URL / publishable key 채우기
npm run dev            # http://localhost:5173/
```
