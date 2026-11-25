// 수업 내용 정의 — 문항·측정 항목을 바꾸려면 이 파일만 고치면 된다.
// (부위 key·측정 key는 supabase/schema.sql 의 save_weak / save_measure / compute_averages 와 맞춰야 함)

export const AREAS = [
  { key: 'push', name: '상체 미는 힘', questions: [
    '무거운 문을 밀어서 열기',
    '엎드린 자세에서 손으로 바닥을 밀고 일어나기',
    '무거운 상자를 선반 위로 밀어 올리기'] },
  { key: 'pull', name: '상체 당기는 힘·악력', questions: [
    '페트병·잼병 뚜껑 따기',
    '무거운 장바구니나 책가방을 손에 들고 오래 걷기',
    '흔들리는 버스에서 손잡이를 잡고 버티기'] },
  { key: 'core', name: '코어', questions: [
    '수업 시간 내내 바른 자세로 앉아 있기',
    '서서 가는 버스·지하철에서 몸의 균형 잡기',
    '바닥에 놓인 무거운 물건을 허리 다치지 않게 들어 올리기'] },
  { key: 'legEnd', name: '하체 지구력', questions: [
    '계단을 쉬지 않고 여러 층 오르기',
    '체험학습에서 오래 서 있거나 오래 걷기',
    '청소할 때 쪼그려 앉았다 일어나기를 여러 번 반복하기'] },
  { key: 'legPow', name: '하체 순발력', questions: [
    '물웅덩이를 한 번에 뛰어넘기',
    '신호가 바뀌기 전에 횡단보도를 재빨리 뛰어 건너기',
    '높은 곳에 있는 물건을 점프해서 손으로 치기'] },
  { key: 'cardio', name: '심폐', questions: [
    '떠나려는 버스를 놓치지 않으려고 달려가기',
    '친구들과 술래잡기·축구처럼 뛰는 놀이를 오래 하기',
    '언덕길을 쉬지 않고 걸어 오르기'] },
];
export const QUESTION_COUNT = AREAS.reduce((n, a) => n + a.questions.length, 0);
export const ANSWERS = ['쉽다', '가끔 힘듦', '자주 힘듦'];
export const areaName = (key) => AREAS.find((a) => a.key === key)?.name || key;

// 측정 기록: 학생이 입력하지 않고, 선생님이 팝스 시트를 명렬표와 함께 불러와 채운다 (빈 값은 '기록 없음').
// key 는 schema.sql 의 compute_averages / admin_import_roster 와 맞춰야 함
export const MEASURES = [
  { key: 'shuttle', name: '셔틀런', unit: '회', note: '왕복오래달리기 (팝스)', area: 'cardio' },
  { key: 'pushup', name: '푸시업', unit: '회', note: '팝스 측정', area: 'push' },
  { key: 'pull', name: '당기기', unit: 'kg', note: '당기기 무게', area: 'pull' },
  { key: 'grip', name: '악력', unit: 'kg', note: '오른손·왼손 중 높은 기록', area: 'pull' },
  { key: 'plank', name: '플랭크', unit: '초', note: '버틴 시간', area: 'core' },
  { key: 'jump', name: '제자리멀리뛰기', unit: 'cm', note: '두 번 중 좋은 기록', area: 'legPow' },
  { key: 'sitreach', name: '유연성', unit: 'cm', note: '앉아 윗몸 앞으로 굽히기, 두 번 중 좋은 기록', area: 'etc' },
];
// 동작 라이브러리 화면에 거는 3D 교과서 링크 (squat-coach 저장소의 움직임 교과서)
export const TEXTBOOK_URL = 'https://minable17-glitch.github.io/squat-coach/textbook/';

export const RUN = { key: 'run1km', name: '1km 달리기', area: 'cardio' };

export const MOVE_COUNT = 5;   // 동작 5칸 고정, 칸마다 부위를 고름
// 설계도 동작 부위 (심폐는 러닝 구간으로 채우므로 동작 부위에는 없음). key는 AREAS 와 같음
export const MOVE_AREAS = [
  { key: 'push', name: '상체 밀기' },
  { key: 'pull', name: '상체 당기기' },
  { key: 'core', name: '코어' },
  { key: 'legEnd', name: '하체 지구력' },
  { key: 'legPow', name: '하체 순발력' },
];
export const moveAreaName = (key) => MOVE_AREAS.find((a) => a.key === key)?.name || '';
export const RUN_WHERE = ['시작 전', '라운드마다', '마지막'];
export const REP_SEC = 3;            // 횟수 → 시간: 1회 약 3초
export const DEFAULT_RUN_PACE = 0.42; // 1km 기록이 없을 때 1m당 초 (1km 7분)
export const WARN_MIN = 15;
export const MIN_REASON = 10;

// 설계 5항목 × 2점 = 10점 → 설계 환산 14점 (schema.sql design_convert 와 같은 표)
export const SCORE_ITEMS = [
  { label: '① 약점 진단과 보완', short: '①', max: 2 },
  { label: '② 근육 부위', short: '②', max: 2 },
  { label: '③ 정확한 자세·안전', short: '③', max: 2 },
  { label: '④ 일상 활용', short: '④', max: 2 },
  { label: '⑤ 프로그램 구성', short: '⑤', max: 2 },
];
export const SCORE_MAX = SCORE_ITEMS.reduce((t, s) => t + s.max, 0);
export const PERF_OPTIONS = ['', '2', '1', '0', '미참여'];
