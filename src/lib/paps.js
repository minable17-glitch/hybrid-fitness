// 팝스(PAPS) 등급 — 중학교 1학년 기준
//
// ⚠ 공식 기준표 값을 그대로 넣어야 한다. (이 앱을 만든 환경에서는 paps.go.kr 에 접속할 수 없어 아직 비어 있음)
// 각 항목은 [1등급 하한, 2등급 하한, 3등급 하한, 4등급 하한] — 이 값 이상이면 그 등급, 4등급 하한보다 낮으면 5등급.
// 값이 없는 항목은 등급을 표시하지 않는다. 플랭크·당기기·1km는 팝스 항목이 아니라 등급 없음.
export const PAPS_GRADE_CUTS = {
  남: {
    // shuttle: [ , , , ],   // 왕복오래달리기 (회)
    // sitreach: [ , , , ],  // 앉아윗몸앞으로굽히기 (cm)
    // grip: [ , , , ],      // 악력 (kg)
    // jump: [ , , , ],      // 제자리멀리뛰기 (cm)
    // pushup: [ , , , ],    // 팔굽혀펴기 (회)
  },
  여: {
    // shuttle: [ , , , ],
    // sitreach: [ , , , ],
    // grip: [ , , , ],
    // jump: [ , , , ],
    // pushup: [ , , , ],    // 무릎 대고 팔굽혀펴기 (회)
  },
};
export const PAPS_KEYS = ['shuttle', 'sitreach', 'grip', 'jump', 'pushup'];

/** 1~5 등급, 기준이 없거나 기록이 없으면 null */
export function papsGrade(key, sex, value) {
  const cuts = PAPS_GRADE_CUTS[sex]?.[key];
  if (!cuts || cuts.length !== 4 || value == null || value === '' || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const i = cuts.findIndex((c) => v >= c);
  return i < 0 ? 5 : i + 1;
}
export const hasPapsGrades = () => Object.values(PAPS_GRADE_CUTS).some((o) => Object.keys(o).length > 0);
