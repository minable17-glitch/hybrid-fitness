-- 하이브리드 체력 프로그램 데이터베이스 스키마
-- Supabase SQL Editor에 통째로 붙여 넣고 Run 하면 됩니다. (다시 실행해도 안전: 데이터는 지우지 않음)
--
-- 사전 준비: Supabase 대시보드 → Authentication → Sign In / Providers 에서
-- "Anonymous Sign-Ins"를 켜주세요. 학생은 학번+이름, 교사는 아이디+비밀번호로
-- 로그인하며, 둘 다 내부적으로 익명 인증 세션을 쓴다 (양궁 앱과 같은 방식).
--
-- 설계: 모든 테이블에 RLS를 켜고 직접 접근은 막는다. 읽기/쓰기는 전부
-- SECURITY DEFINER RPC 함수로만 하고, 함수 안에서 auth.uid()로 신원을 확인한다.
-- 예외: 동작 라이브러리(moves)는 민감하지 않아 select만 직접 허용.
--
-- 학생 신원: roster.auth_user_id = 지금 익명 세션. 로그인할 때마다 덮어쓰므로
-- 다른 기기에서 로그인하면 이전 기기는 저장이 막히고 "다시 로그인" 안내가 뜬다.

create extension if not exists pgcrypto;

-- ── 테이블 ───────────────────────────────────────────────

create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- 교사는 여러 기기(노트북·태블릿)에서 동시에 로그인할 수 있게 세션을 따로 둔다
create table if not exists teacher_sessions (
  auth_user_id uuid primary key,
  teacher_id uuid not null references teachers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  diag_open boolean not null default false,      -- 자가진단·측정·약점 선택 입력 가능
  design_open boolean not null default false,    -- 설계도 작성·제출 가능
  suspicious_chars int not null default 20,      -- 한 번에 이만큼 늘면 '의심 입력'
  avg_overrides jsonb not null default '{}',     -- 학교 평균 기준값 {pushup: 20, run1km: 300(초) ...}
  signup_code text not null default 'hybrid-2026', -- 두 번째 교사부터 계정 만들 때 필요
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict do nothing;

-- 명렬표: 로그인 검증 기준
create table if not exists roster (
  student_no text primary key,          -- 학번
  class_name text not null,             -- 반 (예: '1', '2')
  number int,                           -- 번호
  name text not null,
  run_text text,                        -- 1km 기록 원문 (예: '4:35')
  run_sec int,                          -- 1km 기록 (초)
  auth_user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_roster_auth on roster(auth_user_id);

-- rev: 학생 기기에서 마지막으로 고친 시각(ms). 늦게 도착한 옛 저장이 최신본을 덮지 못하게 비교한다.
create table if not exists diagnoses (
  student_no text primary key references roster(student_no) on delete cascade on update cascade,
  answers int[] not null default '{}',  -- 18문항, 1=쉽다 2=가끔 힘듦 3=자주 힘듦, 0=미응답
  done boolean not null default false,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists measures (
  student_no text primary key references roster(student_no) on delete cascade on update cascade,
  vals jsonb not null default '{}',     -- {pushup, plank, jump, squat, weight, sitreach, grip}
  done boolean not null default false,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists weaknesses (
  student_no text primary key references roster(student_no) on delete cascade on update cascade,
  areas text[] not null default '{}',   -- 1~2개 부위 key
  reason text not null default '',
  done boolean not null default false,
  library_viewed boolean not null default false,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists designs (
  student_no text primary key references roster(student_no) on delete cascade on update cascade,
  data jsonb not null default '{}',     -- {moves:[5개 {name, area, muscle, posture, safety, daily, order, mode, val}], restMove, restRound, rounds, runDist, runWhere}
  est_min numeric,
  status text not null default '작성 중' check (status in ('작성 중', '제출')),
  submitted_at timestamptz,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id bigserial primary key,
  student_no text not null references roster(student_no) on delete cascade on update cascade,
  kind text not null check (kind in ('이탈', '의심 입력')),
  started_at timestamptz,               -- 이탈: 나간 시각 / 의심 입력: 그 시각
  ended_at timestamptz,                 -- 이탈: 돌아온 시각
  seconds int,                          -- 이탈: 머문 시간
  field text,                           -- 의심 입력: 입력란
  delta int,                            -- 의심 입력: 한 번에 늘어난 글자 수
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_student on activity_logs(student_no, started_at);

create table if not exists moves (
  id uuid primary key default gen_random_uuid(),
  area text not null,                   -- 부위 key (push, pull, core, legEnd, legPow, cardio)
  name text not null,
  link_3d text,
  muscles text, posture text, safety text, daily text, tools text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  student_no text primary key references roster(student_no) on delete cascade on update cascade,
  items int[] not null default array[null, null, null, null, null]::int[],  -- 설계 ①~⑤ (각 0~2)
  blank boolean not null default false,  -- 미참여·백지
  design_sum int, design_score int,
  perf1 text not null default '', perf2 text not null default '',  -- '2','1','0','미참여',''
  perf_score int, total int,
  updated_at timestamptz not null default now()
);

-- 설계 채점이 6항목 → 5항목(각 2점)으로 바뀜 (예전 스키마로 만든 DB도 맞춤)
alter table scores alter column items set default array[null, null, null, null, null]::int[];

alter table teachers enable row level security;
alter table teacher_sessions enable row level security;
alter table app_settings enable row level security;
alter table roster enable row level security;
alter table diagnoses enable row level security;
alter table measures enable row level security;
alter table weaknesses enable row level security;
alter table designs enable row level security;
alter table activity_logs enable row level security;
alter table moves enable row level security;
alter table scores enable row level security;

drop policy if exists "moves are readable" on moves;
create policy "moves are readable" on moves for select using (true);
grant select on moves to anon, authenticated;

-- ── 내부 도우미 (RPC로 부를 수 없게 막음) ─────────────────────

create or replace function try_num(t text) returns numeric
language sql immutable as $$
  select case when t ~ '^\s*-?\d+(\.\d+)?\s*$' then trim(t)::numeric end
$$;

create or replace function me_student() returns roster
language plpgsql security definer set search_path = public, extensions as $$
declare
  r roster%rowtype;
begin
  select * into r from roster where auth_user_id = auth.uid() and auth.uid() is not null;
  if not found then
    raise exception '로그인 정보를 찾을 수 없어요. 다시 로그인해주세요';
  end if;
  return r;
end;
$$;

create or replace function assert_teacher() returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v uuid;
begin
  select teacher_id into v from teacher_sessions where auth_user_id = auth.uid() and auth.uid() is not null;
  if v is null then
    raise exception '선생님 로그인이 필요해요. 다시 로그인해주세요';
  end if;
  return v;
end;
$$;

create or replace function settings_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('diagOpen', diag_open, 'designOpen', design_open, 'suspiciousChars', suspicious_chars)
  from app_settings where id = 1
$$;

-- 설계도 빈칸 검사 (src/lib/design.js 의 designErrors 와 같은 규칙)
create or replace function design_errors(d jsonb) returns text[]
language plpgsql immutable as $$
declare
  e text[] := '{}';
  m jsonb;
  lb text;
  i int;
  o numeric;
  orders numeric[] := '{}';
begin
  for i in 0..4 loop
    m := coalesce(d -> 'moves' -> i, '{}'::jsonb);
    lb := '동작 ' || (i + 1);
    if coalesce(trim(m ->> 'name'), '') = '' then e := e || (lb || ' 동작명'); end if;
    if coalesce(m ->> 'area', '') not in ('push', 'pull', 'core', 'legEnd', 'legPow') then e := e || (lb || ' 부위'); end if;
    if coalesce(trim(m ->> 'muscle'), '') = '' then e := e || (lb || ' 사용 근육'); end if;
    if coalesce(trim(m ->> 'posture'), '') = '' then e := e || (lb || ' 정확한 자세'); end if;
    if coalesce(trim(m ->> 'safety'), '') = '' then e := e || (lb || ' 안전 유의사항'); end if;
    if coalesce(trim(m ->> 'daily'), '') = '' then e := e || (lb || ' 일상 활용'); end if;
    if coalesce(try_num(m ->> 'val'), 0) <= 0 then e := e || (lb || ' 횟수/시간'); end if;
    o := try_num(m ->> 'order');
    if o is null or o < 1 then e := e || (lb || ' 순서'); else orders := orders || o; end if;
  end loop;
  if cardinality(orders) = 5 and (select count(distinct x) from unnest(orders) x) <> 5 then
    e := e || '동작 순서가 겹침'::text;
  end if;
  if coalesce(try_num(d ->> 'restMove'), -1) < 0 then e := e || '동작 사이 휴식'::text; end if;
  if coalesce(try_num(d ->> 'restRound'), -1) < 0 then e := e || '라운드 사이 휴식'::text; end if;
  if coalesce(try_num(d ->> 'rounds'), 0) < 1 then e := e || '라운드 수'::text; end if;
  if coalesce(try_num(d ->> 'runDist'), 0) <= 0 then e := e || '러닝 거리'::text; end if;
  if coalesce(d ->> 'runWhere', '') not in ('시작 전', '라운드마다', '마지막') then e := e || '러닝 위치'::text; end if;
  return e;
end;
$$;

-- 설계 환산 (5항목 합계 0~10): 9~10→14, 8→12, 7→10, 5~6→8, 3~4→6, 0~2(제출)→4, 미참여·백지→2
create or replace function design_convert(p_sum int, p_blank boolean) returns int
language sql immutable as $$
  select case
    when p_blank then 2
    when p_sum is null then null
    when p_sum >= 9 then 14 when p_sum >= 8 then 12 when p_sum >= 7 then 10
    when p_sum >= 5 then 8 when p_sum >= 3 then 6 else 4 end
$$;

-- 수행 환산: 2회 합계 4→6, 3→5, 2→4, 1→3, 미참여(또는 0)→2, 둘 다 빈칸→null
create or replace function perf_convert(p1 text, p2 text) returns int
language plpgsql immutable as $$
declare
  nums int[] := '{}';
  s int;
begin
  if coalesce(p1, '') = '' and coalesce(p2, '') = '' then return null; end if;
  if p1 in ('0', '1', '2') then nums := nums || p1::int; end if;
  if p2 in ('0', '1', '2') then nums := nums || p2::int; end if;
  if cardinality(nums) = 0 then return 2; end if;
  select sum(x) into s from unnest(nums) x;
  return case s when 4 then 6 when 3 then 5 when 2 then 4 when 1 then 3 else 2 end;
end;
$$;

create or replace function compute_averages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb := '{}';
  ov jsonb;
  k text;
  a numeric; sd numeric; n int;
  o numeric;
begin
  select avg_overrides into ov from app_settings where id = 1;
  foreach k in array array['pushup', 'plank', 'jump', 'squat', 'weight', 'sitreach', 'grip', 'run1km'] loop
    if k = 'run1km' then
      select avg(run_sec), stddev_samp(run_sec), count(run_sec) into a, sd, n from roster where run_sec is not null;
    else
      select avg((vals ->> k)::numeric), stddev_samp((vals ->> k)::numeric), count(*) into a, sd, n
      from measures where jsonb_typeof(vals -> k) = 'number';
    end if;
    o := try_num(ov ->> k);
    out := out || jsonb_build_object(k, jsonb_build_object(
      'auto', round(a, 2), 'sd', round(sd, 2), 'n', n,
      'avg', round(coalesce(o, a), 2), 'source', case when o is not null then '기준값' else '자동' end));
  end loop;
  return out;
end;
$$;

create or replace function recompute_score(p_student_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update scores set
    design_sum = case when array_position(items, null) is null and cardinality(items) = 5
                      then (select sum(x) from unnest(items) x) end,
    updated_at = now()
  where student_no = p_student_no;
  update scores set
    design_score = design_convert(design_sum, blank),
    perf_score = perf_convert(perf1, perf2)
  where student_no = p_student_no;
  update scores set total = case when design_score is not null and perf_score is not null then design_score + perf_score end
  where student_no = p_student_no;
end;
$$;

revoke execute on function me_student() from public, anon, authenticated;
revoke execute on function assert_teacher() from public, anon, authenticated;
revoke execute on function compute_averages() from public, anon, authenticated;
revoke execute on function recompute_score(text) from public, anon, authenticated;

-- ── 교사 계정 ────────────────────────────────────────────

create or replace function teacher_signup(p_username text, p_password text, p_signup_code text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요. 새로고침 후 다시 시도해주세요'; end if;
  if coalesce(trim(p_username), '') = '' then raise exception '아이디를 입력해주세요'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception '비밀번호는 4자 이상으로 입력해주세요'; end if;
  -- 첫 계정은 가입 코드 없이, 두 번째부터는 설정의 가입 코드가 필요
  if exists (select 1 from teachers) and coalesce(trim(p_signup_code), '') <> (select signup_code from app_settings where id = 1) then
    raise exception '가입 코드가 올바르지 않아요';
  end if;
  if exists (select 1 from teachers where username = trim(p_username)) then raise exception '이미 사용 중인 아이디예요'; end if;
  insert into teachers (username, password_hash) values (trim(p_username), crypt(p_password, gen_salt('bf'))) returning id into v_id;
  insert into teacher_sessions (auth_user_id, teacher_id) values (auth.uid(), v_id)
  on conflict (auth_user_id) do update set teacher_id = excluded.teacher_id, created_at = now();
  return jsonb_build_object('id', v_id, 'username', trim(p_username));
end;
$$;
grant execute on function teacher_signup(text, text, text) to anon, authenticated;

create or replace function teacher_login(p_username text, p_password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t teachers%rowtype;
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요. 새로고침 후 다시 시도해주세요'; end if;
  select * into t from teachers where username = trim(p_username);
  if not found or t.password_hash <> crypt(coalesce(p_password, ''), t.password_hash) then
    raise exception '아이디 또는 비밀번호가 올바르지 않아요';
  end if;
  insert into teacher_sessions (auth_user_id, teacher_id) values (auth.uid(), t.id)
  on conflict (auth_user_id) do update set teacher_id = excluded.teacher_id, created_at = now();
  return jsonb_build_object('id', t.id, 'username', t.username);
end;
$$;
grant execute on function teacher_login(text, text) to anon, authenticated;

create or replace function teacher_logout() returns void
language sql security definer set search_path = public as $$
  delete from teacher_sessions where auth_user_id = auth.uid()
$$;
grant execute on function teacher_logout() to anon, authenticated;

-- ── 학생 로그인·상태 ─────────────────────────────────────

create or replace function student_login(p_student_no text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r roster%rowtype;
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요. 새로고침 후 다시 시도해주세요'; end if;
  select * into r from roster where student_no = regexp_replace(coalesce(p_student_no, ''), '\s', '', 'g');
  if not found or regexp_replace(r.name, '\s', '', 'g') <> regexp_replace(coalesce(p_name, ''), '\s', '', 'g') then
    raise exception '명렬표에 없는 학생입니다';
  end if;
  update roster set auth_user_id = auth.uid() where student_no = r.student_no;
  return jsonb_build_object('studentNo', r.student_no, 'name', r.name, 'className', r.class_name, 'number', r.number);
end;
$$;
grant execute on function student_login(text, text) to anon, authenticated;

create or replace function student_logout() returns void
language sql security definer set search_path = public as $$
  update roster set auth_user_id = null where auth_user_id = auth.uid() and auth.uid() is not null
$$;
grant execute on function student_logout() to anon, authenticated;

create or replace function get_settings_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select settings_public()
$$;
grant execute on function get_settings_public() to anon, authenticated;

create or replace function get_my_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
begin
  return jsonb_build_object(
    'me', jsonb_build_object('studentNo', me.student_no, 'name', me.name, 'className', me.class_name, 'number', me.number),
    'run', jsonb_build_object('text', me.run_text, 'sec', me.run_sec),
    'diag', (select jsonb_build_object('answers', answers, 'rev', rev) from diagnoses where student_no = me.student_no),
    'measure', (select jsonb_build_object('vals', vals, 'rev', rev) from measures where student_no = me.student_no),
    'weak', (select jsonb_build_object('areas', areas, 'reason', reason, 'rev', rev, 'libraryViewed', library_viewed) from weaknesses where student_no = me.student_no),
    'design', (select jsonb_build_object('data', data, 'status', status, 'submittedAt', submitted_at, 'rev', rev) from designs where student_no = me.student_no),
    'settings', settings_public());
end;
$$;
grant execute on function get_my_state() to anon, authenticated;

-- 학교 평균: 학생에게는 평균·표준편차만 (인원·분포·다른 학생 기록은 보내지 않음)
create or replace function get_school_averages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a jsonb := compute_averages();
  out jsonb := '{}';
  k text;
begin
  perform me_student();
  for k in select jsonb_object_keys(a) loop
    out := out || jsonb_build_object(k, jsonb_build_object('avg', a -> k -> 'avg', 'sd', a -> k -> 'sd'));
  end loop;
  return out;
end;
$$;
grant execute on function get_school_averages() to anon, authenticated;

-- ── 학생 저장 (응답: {ok, code?, settings}) ────────────────

create or replace function save_diag(p_answers int[], p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  v int[];
begin
  if not (select diag_open from app_settings where id = 1) then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'settings', settings_public());
  end if;
  if coalesce(cardinality(p_answers), 0) <> 18 then raise exception '자가진단 응답 개수가 맞지 않아요'; end if;
  select array_agg(case when x between 1 and 3 then x else 0 end order by i) into v
  from unnest(p_answers) with ordinality as t(x, i);
  insert into diagnoses (student_no, answers, done, rev, updated_at)
  values (me.student_no, v, not (0 = any (v)), p_rev, now())
  on conflict (student_no) do update set answers = excluded.answers, done = excluded.done, rev = excluded.rev, updated_at = now()
  where diagnoses.rev <= excluded.rev;
  return jsonb_build_object('ok', true, 'settings', settings_public());
end;
$$;
grant execute on function save_diag(int[], bigint) to anon, authenticated;

create or replace function save_measure(p_vals jsonb, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  clean jsonb := '{}';
  k text;
  ok boolean := true;
begin
  if not (select diag_open from app_settings where id = 1) then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'settings', settings_public());
  end if;
  foreach k in array array['pushup', 'plank', 'jump', 'squat', 'weight', 'sitreach', 'grip'] loop
    if jsonb_typeof(p_vals -> k) = 'number' and (p_vals ->> k)::numeric between -40 and 900 then
      clean := clean || jsonb_build_object(k, p_vals -> k);
    else
      ok := false;
    end if;
  end loop;
  insert into measures (student_no, vals, done, rev, updated_at) values (me.student_no, clean, ok, p_rev, now())
  on conflict (student_no) do update set vals = excluded.vals, done = excluded.done, rev = excluded.rev, updated_at = now()
  where measures.rev <= excluded.rev;
  return jsonb_build_object('ok', true, 'settings', settings_public());
end;
$$;
grant execute on function save_measure(jsonb, bigint) to anon, authenticated;

create or replace function save_weak(p_areas text[], p_reason text, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  v_areas text[];
  v_reason text := left(coalesce(p_reason, ''), 1000);
begin
  if not (select diag_open from app_settings where id = 1) then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'settings', settings_public());
  end if;
  if exists (select 1 from designs where student_no = me.student_no and status = '제출') then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'settings', settings_public());
  end if;
  select coalesce(array_agg(a), '{}') into v_areas from (
    select distinct a from unnest(coalesce(p_areas, '{}')) a
    where a in ('push', 'pull', 'core', 'legEnd', 'legPow', 'cardio') limit 2) t;
  insert into weaknesses (student_no, areas, reason, done, rev, updated_at)
  values (me.student_no, v_areas, v_reason, cardinality(v_areas) between 1 and 2 and length(trim(v_reason)) >= 10, p_rev, now())
  on conflict (student_no) do update set areas = excluded.areas, reason = excluded.reason, done = excluded.done,
    rev = excluded.rev, updated_at = now()
  where weaknesses.rev <= excluded.rev;
  return jsonb_build_object('ok', true, 'settings', settings_public());
end;
$$;
grant execute on function save_weak(text[], text, bigint) to anon, authenticated;

create or replace function mark_library_viewed() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
begin
  insert into weaknesses (student_no, library_viewed) values (me.student_no, true)
  on conflict (student_no) do update set library_viewed = true;
  return jsonb_build_object('ok', true, 'settings', settings_public());
end;
$$;
grant execute on function mark_library_viewed() to anon, authenticated;

create or replace function save_design(p_data jsonb, p_est numeric, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  cur designs%rowtype;
begin
  if not (select design_open from app_settings where id = 1) then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'settings', settings_public());
  end if;
  if length(p_data::text) > 30000 then raise exception '설계도 내용이 너무 길어요'; end if;
  select * into cur from designs where student_no = me.student_no;
  if found and cur.status = '제출' then
    return jsonb_build_object('ok', false, 'code', 'LOCKED', 'settings', settings_public(),
      'design', jsonb_build_object('data', cur.data, 'status', cur.status, 'submittedAt', cur.submitted_at, 'rev', cur.rev));
  end if;
  insert into designs (student_no, data, est_min, status, rev, updated_at)
  values (me.student_no, p_data, p_est, '작성 중', p_rev, now())
  on conflict (student_no) do update set data = excluded.data, est_min = excluded.est_min, rev = excluded.rev, updated_at = now()
  where designs.rev <= excluded.rev and designs.status = '작성 중';
  return jsonb_build_object('ok', true, 'settings', settings_public());
end;
$$;
grant execute on function save_design(jsonb, numeric, bigint) to anon, authenticated;

create or replace function submit_design(p_data jsonb, p_est numeric, p_rev bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  errs text[];
  cur designs%rowtype;
begin
  if not (select design_open from app_settings where id = 1) then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'settings', settings_public());
  end if;
  if length(p_data::text) > 30000 then raise exception '설계도 내용이 너무 길어요'; end if;
  errs := design_errors(p_data);
  if cardinality(errs) > 0 then
    return jsonb_build_object('ok', false, 'code', 'INCOMPLETE', 'errors', to_jsonb(errs), 'settings', settings_public());
  end if;
  insert into designs (student_no) values (me.student_no) on conflict do nothing;
  select * into cur from designs where student_no = me.student_no for update;
  if cur.status <> '제출' then
    update designs set data = p_data, est_min = p_est, status = '제출', submitted_at = now(),
      rev = greatest(p_rev, (extract(epoch from now()) * 1000)::bigint), updated_at = now()
    where student_no = me.student_no
    returning * into cur;
  end if;
  return jsonb_build_object('ok', true, 'settings', settings_public(),
    'design', jsonb_build_object('data', cur.data, 'status', cur.status, 'submittedAt', cur.submitted_at, 'rev', cur.rev));
end;
$$;
grant execute on function submit_design(jsonb, numeric, bigint) to anon, authenticated;

-- entries: [{type:'leave', start, end, note?} | {type:'paste', field, at, delta}]  (시각은 ms)
create or replace function log_activity(p_entries jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
  e jsonb;
  n int := 0;
begin
  for e in select value from jsonb_array_elements(coalesce(p_entries, '[]')) limit 200 loop
    if e ->> 'type' = 'leave' and try_num(e ->> 'start') is not null and try_num(e ->> 'end') is not null then
      insert into activity_logs (student_no, kind, started_at, ended_at, seconds, note)
      values (me.student_no, '이탈', to_timestamp(try_num(e ->> 'start') / 1000), to_timestamp(try_num(e ->> 'end') / 1000),
        greatest(0, round((try_num(e ->> 'end') - try_num(e ->> 'start')) / 1000))::int, left(e ->> 'note', 100));
      n := n + 1;
    elsif e ->> 'type' = 'paste' and try_num(e ->> 'at') is not null then
      insert into activity_logs (student_no, kind, started_at, field, delta)
      values (me.student_no, '의심 입력', to_timestamp(try_num(e ->> 'at') / 1000), left(e ->> 'field', 60), try_num(e ->> 'delta')::int);
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end;
$$;
grant execute on function log_activity(jsonb) to anon, authenticated;

-- ── 교사 화면 ────────────────────────────────────────────

create or replace function admin_overview() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  return jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentNo', r.student_no, 'className', r.class_name, 'number', r.number, 'name', r.name,
        'runText', r.run_text, 'runSec', r.run_sec,
        'diag', coalesce(d.done, false), 'measure', coalesce(m.done, false), 'weak', coalesce(w.done, false),
        'designStatus', g.status, 'submittedAt', g.submitted_at, 'estMin', g.est_min,
        'leaves', coalesce(l.leaves, 0), 'leaveSec', coalesce(l.leave_sec, 0), 'sus', coalesce(l.sus, 0), 'maxDelta', coalesce(l.max_delta, 0),
        'score', case when sc.student_no is null then null else to_jsonb(sc) - 'student_no' end
      ) order by r.class_name, r.number)
      from roster r
      left join diagnoses d on d.student_no = r.student_no
      left join measures m on m.student_no = r.student_no
      left join weaknesses w on w.student_no = r.student_no
      left join designs g on g.student_no = r.student_no
      left join scores sc on sc.student_no = r.student_no
      left join (
        select student_no,
          count(*) filter (where kind = '이탈') as leaves,
          coalesce(sum(seconds) filter (where kind = '이탈'), 0) as leave_sec,
          count(*) filter (where kind = '의심 입력') as sus,
          coalesce(max(delta), 0) as max_delta
        from activity_logs group by student_no
      ) l on l.student_no = r.student_no
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object('diagOpen', diag_open, 'designOpen', design_open, 'suspiciousChars', suspicious_chars,
                   'avgOverrides', avg_overrides, 'signupCode', signup_code) from app_settings where id = 1),
    'averages', compute_averages());
end;
$$;
grant execute on function admin_overview() to anon, authenticated;

create or replace function admin_student_detail(p_student_no text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r roster%rowtype;
begin
  perform assert_teacher();
  select * into r from roster where student_no = p_student_no;
  if not found then raise exception '명렬표에 없는 학번이에요'; end if;
  return jsonb_build_object(
    'student', jsonb_build_object('studentNo', r.student_no, 'name', r.name, 'className', r.class_name, 'number', r.number,
                 'runText', r.run_text, 'runSec', r.run_sec),
    'diag', (select jsonb_build_object('answers', answers, 'done', done, 'updatedAt', updated_at) from diagnoses where student_no = r.student_no),
    'measure', (select jsonb_build_object('vals', vals, 'done', done) from measures where student_no = r.student_no),
    'weak', (select jsonb_build_object('areas', areas, 'reason', reason, 'done', done, 'updatedAt', updated_at) from weaknesses where student_no = r.student_no),
    'design', (select jsonb_build_object('data', data, 'status', status, 'submittedAt', submitted_at, 'estMin', est_min, 'updatedAt', updated_at)
               from designs where student_no = r.student_no),
    'score', (select to_jsonb(s) - 'student_no' from scores s where student_no = r.student_no),
    'logs', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'startedAt', started_at, 'endedAt', ended_at, 'seconds', seconds,
               'field', field, 'delta', delta, 'note', note) order by started_at, id) from activity_logs where student_no = r.student_no), '[]'::jsonb),
    'averages', compute_averages());
end;
$$;
grant execute on function admin_student_detail(text) to anon, authenticated;

create or replace function admin_save_score(p_student_no text, p_items int[], p_blank boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  maxes int[] := array[2, 2, 2, 2, 2];
  v int[] := '{}';
  i int;
  x int;
begin
  perform assert_teacher();
  if not exists (select 1 from roster where student_no = p_student_no) then raise exception '명렬표에 없는 학번이에요'; end if;
  for i in 1..5 loop
    x := p_items[i];
    v := v || case when x is null then null else greatest(0, least(maxes[i], x)) end;
  end loop;
  insert into scores (student_no, items, blank) values (p_student_no, v, coalesce(p_blank, false))
  on conflict (student_no) do update set items = excluded.items, blank = excluded.blank;
  perform recompute_score(p_student_no);
  return (select to_jsonb(s) - 'student_no' from scores s where student_no = p_student_no);
end;
$$;
grant execute on function admin_save_score(text, int[], boolean) to anon, authenticated;

create or replace function admin_save_perf(p_student_no text, p_p1 text, p_p2 text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  if not exists (select 1 from roster where student_no = p_student_no) then raise exception '명렬표에 없는 학번이에요'; end if;
  if coalesce(p_p1, '') not in ('', '0', '1', '2', '미참여') or coalesce(p_p2, '') not in ('', '0', '1', '2', '미참여') then
    raise exception '수행 기록은 2·1·0·미참여 중에서 골라주세요';
  end if;
  insert into scores (student_no, perf1, perf2) values (p_student_no, coalesce(p_p1, ''), coalesce(p_p2, ''))
  on conflict (student_no) do update set perf1 = excluded.perf1, perf2 = excluded.perf2;
  perform recompute_score(p_student_no);
  return (select to_jsonb(s) - 'student_no' from scores s where student_no = p_student_no);
end;
$$;
grant execute on function admin_save_perf(text, text, text) to anon, authenticated;

create or replace function admin_unlock_design(p_student_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  -- rev를 지금으로 올려서 학생 기기에 남은 옛 사본이 덮어쓰지 못하게 함
  update designs set status = '작성 중', rev = (extract(epoch from now()) * 1000)::bigint, updated_at = now()
  where student_no = p_student_no;
  if not found then raise exception '설계도가 없어요'; end if;
end;
$$;
grant execute on function admin_unlock_design(text) to anon, authenticated;

-- p_patch: {diagOpen?, designOpen?, suspiciousChars?, avgOverrides?, signupCode?}
create or replace function admin_save_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  update app_settings set
    diag_open = coalesce((p_patch ->> 'diagOpen')::boolean, diag_open),
    design_open = coalesce((p_patch ->> 'designOpen')::boolean, design_open),
    suspicious_chars = coalesce(greatest(5, try_num(p_patch ->> 'suspiciousChars')::int), suspicious_chars),
    avg_overrides = coalesce(p_patch -> 'avgOverrides', avg_overrides),
    signup_code = coalesce(nullif(trim(p_patch ->> 'signupCode'), ''), signup_code),
    updated_at = now()
  where id = 1;
  return admin_overview();
end;
$$;
grant execute on function admin_save_settings(jsonb) to anon, authenticated;

-- p_rows: [{studentNo, className, number, name, runText, runSec}]  — 학번 기준으로 추가/수정 (기존 기록은 유지)
create or replace function admin_import_roster(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  v_no text;
  ins int := 0;
  upd int := 0;
begin
  perform assert_teacher();
  for e in select value from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_no := regexp_replace(coalesce(e ->> 'studentNo', ''), '\s', '', 'g');
    if v_no = '' or coalesce(trim(e ->> 'name'), '') = '' or coalesce(trim(e ->> 'className'), '') = '' then
      raise exception '학번·이름·반이 비어 있는 줄이 있어요: %', e::text;
    end if;
    if exists (select 1 from roster where student_no = v_no) then upd := upd + 1; else ins := ins + 1; end if;
    insert into roster (student_no, class_name, number, name, run_text, run_sec)
    values (v_no, trim(e ->> 'className'), try_num(e ->> 'number')::int, trim(e ->> 'name'),
            nullif(trim(e ->> 'runText'), ''), try_num(e ->> 'runSec')::int)
    on conflict (student_no) do update set class_name = excluded.class_name, number = excluded.number,
      name = excluded.name, run_text = excluded.run_text, run_sec = excluded.run_sec;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd);
end;
$$;
grant execute on function admin_import_roster(jsonb) to anon, authenticated;

create or replace function admin_delete_student(p_student_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  delete from roster where student_no = p_student_no;   -- 그 학생의 모든 기록도 함께 지워짐
end;
$$;
grant execute on function admin_delete_student(text) to anon, authenticated;

create or replace function admin_upsert_move(p_id uuid, p_area text, p_name text, p_link_3d text, p_muscles text,
  p_posture text, p_safety text, p_daily text, p_tools text, p_order_index int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid;
begin
  perform assert_teacher();
  if coalesce(trim(p_name), '') = '' then raise exception '동작명을 입력해주세요'; end if;
  if p_id is null then
    insert into moves (area, name, link_3d, muscles, posture, safety, daily, tools, order_index)
    values (p_area, trim(p_name), nullif(trim(p_link_3d), ''), p_muscles, p_posture, p_safety, p_daily, p_tools, coalesce(p_order_index, 0))
    returning id into v;
  else
    update moves set area = p_area, name = trim(p_name), link_3d = nullif(trim(p_link_3d), ''), muscles = p_muscles,
      posture = p_posture, safety = p_safety, daily = p_daily, tools = p_tools, order_index = coalesce(p_order_index, 0)
    where id = p_id returning id into v;
  end if;
  return v;
end;
$$;
grant execute on function admin_upsert_move(uuid, text, text, text, text, text, text, text, text, int) to anon, authenticated;

create or replace function admin_delete_move(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  delete from moves where id = p_id;
end;
$$;
grant execute on function admin_delete_move(uuid) to anon, authenticated;

-- ── 예시 동작 (비어 있을 때만) ─────────────────────────────

insert into moves (area, name, muscles, posture, safety, daily, tools, order_index)
select * from (values
  ('push', '무릎 대고 푸시업', '대흉근, 삼두근, 전면 삼각근', '손은 어깨너비, 무릎~머리 일직선', '허리가 처지지 않게, 팔꿈치는 몸통 쪽 45°', '무거운 문 밀기, 바닥 짚고 일어나기', '매트', 1),
  ('push', '덤벨 숄더 프레스', '삼각근, 삼두근', '덤벨을 귀 옆에서 머리 위로 곧게 밀기', '허리 젖히지 않기, 가벼운 무게부터', '물건을 선반 위로 올리기', '덤벨', 2),
  ('pull', '덤벨 로우', '광배근, 능형근, 이두근', '상체 숙이고 등 평평, 팔꿈치를 뒤로 당기기', '등이 굽지 않게, 반동 쓰지 않기', '무거운 문 당기기, 가방 들어 올리기', '덤벨, 의자', 1),
  ('pull', '수건 쥐어짜기', '전완근(악력)', '수건을 양손으로 비틀어 짜기', '손목 통증이 있으면 멈추기', '병뚜껑 따기, 장바구니 들기', '수건', 2),
  ('core', '플랭크', '복직근, 복횡근, 척추기립근', '팔꿈치는 어깨 아래, 머리~발목 일직선', '엉덩이 들거나 처지지 않게, 숨 참지 않기', '오래 바른 자세로 앉기', '매트', 1),
  ('core', '데드버그', '복횡근, 복직근', '누워서 반대쪽 팔·다리를 천천히 뻗기', '허리가 바닥에서 뜨지 않게', '물건 들 때 허리 보호', '매트', 2),
  ('legEnd', '맨몸 스쿼트', '대퇴사두근, 둔근, 햄스트링', '발은 어깨너비, 엉덩이를 뒤로 빼며 앉기', '무릎이 안쪽으로 모이지 않게', '계단 오르기, 쪼그려 앉았다 일어나기', '없음', 1),
  ('legEnd', '런지', '대퇴사두근, 둔근', '한 발 앞으로 내딛고 양 무릎 90°', '앞 무릎이 발끝보다 너무 나가지 않게', '오래 걷기, 계단 오르기', '없음', 2),
  ('legPow', '점프 스쿼트', '대퇴사두근, 둔근, 종아리', '스쿼트 후 힘차게 위로 점프', '착지할 때 무릎을 살짝 굽혀 충격 흡수', '물웅덩이 뛰어넘기', '없음', 1),
  ('legPow', '스케이터 점프', '둔근, 대퇴사두근, 종아리', '옆으로 한 발씩 뛰며 착지', '미끄럽지 않은 바닥에서', '갑자기 방향 바꿔 뛰기', '없음', 2),
  ('cardio', '버피', '전신, 심폐', '스쿼트 → 엎드려 뻗기 → 일어나 점프', '처음엔 천천히, 어지러우면 쉬기', '버스 놓칠 때 달려가기', '매트', 1),
  ('cardio', '하이니(제자리 뛰기)', '장요근, 대퇴사두근, 심폐', '제자리에서 무릎을 허리 높이로 번갈아 들기', '발 앞쪽으로 가볍게 착지', '오래 뛰어 노는 놀이', '없음', 2)
) as t(area, name, muscles, posture, safety, daily, tools, order_index)
where not exists (select 1 from moves);
