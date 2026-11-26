-- 하이브리드 체력 프로그램 데이터베이스 스키마
-- Supabase SQL Editor에 통째로 붙여 넣고 Run 하면 됩니다. (다시 실행해도 안전: 데이터는 지우지 않음)
--
-- 사전 준비: Supabase 대시보드 → Authentication → Sign In / Providers 에서
-- "Anonymous Sign-Ins"를 켜주세요. 학생은 학번+이름, 교사는 아이디+비밀번호로
-- 로그인하며, 둘 다 내부적으로 익명 인증 세션을 쓴다 (양궁 앱과 같은 방식).
--
-- 설계: 모든 테이블에 RLS를 켜고 직접 접근은 막는다. 읽기/쓰기는 전부
-- SECURITY DEFINER RPC 함수로만 하고, 함수 안에서 auth.uid()로 신원을 확인한다.
-- 동작 라이브러리는 3D 움직임 교과서 링크(src/lib/content.js TEXTBOOK_URL)라 DB에 없다.
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
  sex text,                             -- '남' | '여' (학교 평균을 같은 성별끼리 비교)
  auth_user_id uuid,
  created_at timestamptz not null default now()
);
alter table roster add column if not exists sex text;
-- 학생 비밀번호 (처음 로그인할 때 학생이 만든다. bcrypt 해시만 저장. 틀려도 잠그지 않음 — 교사 결정 2026-11-26)
-- pin_fails·pin_locked_until 은 예전 잠금 기능의 흔적 (지금은 쓰지 않음)
alter table roster add column if not exists pin_hash text;
alter table roster add column if not exists pin_fails int not null default 0;
alter table roster add column if not exists pin_locked_until timestamptz;
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
  vals jsonb not null default '{}',     -- 팝스 기록, 교사가 명렬표와 함께 불러옴 {shuttle, sitreach, grip, jump, pushup, plank, pull}
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
  data jsonb not null default '{}',     -- {format, moves:[5개 {name, area, muscle, posture, safety, daily, order, mode, val}], 방식별 칸(rounds, restMove, restRound, cap, min, every, work, rest, runM), runDist, runWhere}
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

-- 예전 버전의 동작 라이브러리 표(이제 안 씀)
drop table if exists moves cascade;
drop function if exists admin_upsert_move(uuid, text, text, text, text, text, text, text, text, int);
drop function if exists admin_delete_move(uuid);

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
alter table scores enable row level security;


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

-- 설계도 빈칸 검사 (src/lib/program.js 의 programErrors 와 같은 규칙)
-- 훈련 방식(format): circuit 서킷 | fortime 포타임 | amrap AMRAP | emom EMOM | tabata 타바타 | race 하이록스식 (없으면 circuit)
create or replace function design_errors(d jsonb) returns text[]
language plpgsql immutable as $$
declare
  e text[] := '{}';
  m jsonb;
  lb text;
  i int;
  o numeric;
  orders numeric[] := '{}';
  f text := coalesce(nullif(d ->> 'format', ''), 'circuit');
  needs_amount boolean;
  fld record;
  v numeric;
begin
  if f not in ('circuit', 'fortime', 'amrap', 'emom', 'tabata', 'race') then
    e := e || '훈련 방식'::text;
    f := 'circuit';
  end if;
  needs_amount := f <> 'tabata';
  for i in 0..4 loop
    m := coalesce(d -> 'moves' -> i, '{}'::jsonb);
    lb := '동작 ' || (i + 1);
    if coalesce(trim(m ->> 'name'), '') = '' then e := e || (lb || ' 동작명'); end if;
    if coalesce(m ->> 'area', '') not in ('push', 'pull', 'core', 'legEnd', 'legPow') then e := e || (lb || ' 부위'); end if;
    if coalesce(trim(m ->> 'muscle'), '') = '' then e := e || (lb || ' 사용 근육'); end if;
    if coalesce(trim(m ->> 'posture'), '') = '' then e := e || (lb || ' 정확한 자세'); end if;
    if coalesce(trim(m ->> 'safety'), '') = '' then e := e || (lb || ' 안전 유의사항'); end if;
    if coalesce(trim(m ->> 'daily'), '') = '' then e := e || (lb || ' 일상 활용'); end if;
    if needs_amount and coalesce(try_num(m ->> 'val'), 0) <= 0 then e := e || (lb || ' 횟수/시간'); end if;
    o := try_num(m ->> 'order');
    if o is null or o < 1 then e := e || (lb || ' 순서'); else orders := orders || o; end if;
  end loop;
  if cardinality(orders) = 5 and (select count(distinct x) from unnest(orders) x) <> 5 then
    e := e || '동작 순서가 겹침'::text;
  end if;
  -- 방식별 칸과 범위 (program.js FIELDS)
  for fld in
    select * from (values
      ('circuit', 'rounds', '라운드(바퀴)', '번', 1, 20), ('circuit', 'restMove', '동작 사이 휴식', '초', 0, 180), ('circuit', 'restRound', '라운드 사이 휴식', '초', 0, 300),
      ('fortime', 'rounds', '라운드(바퀴)', '번', 1, 20), ('fortime', 'cap', '시간 제한', '분', 3, 30),
      ('amrap', 'min', '전체 시간', '분', 3, 20),
      ('emom', 'min', '전체 시간', '분', 3, 20), ('emom', 'every', '간격', '분', 1, 3),
      ('tabata', 'work', '운동', '초', 10, 60), ('tabata', 'rest', '휴식', '초', 5, 60), ('tabata', 'rounds', '라운드(바퀴)', '번', 1, 20),
      ('race', 'runM', '한 번 달리기', 'm', 50, 400), ('race', 'cap', '시간 제한', '분', 3, 30)
    ) as t(fmt, k, label, unit, lo, hi) where fmt = f
  loop
    v := try_num(d ->> fld.k);
    if v is null or v < fld.lo or v > fld.hi then
      e := e || (fld.label || ' (' || fld.lo || '~' || fld.hi || fld.unit || ')');
    end if;
  end loop;
  if f <> 'race' then
    if coalesce(try_num(d ->> 'runDist'), 0) <= 0 then e := e || '러닝 거리'::text; end if;
    -- 러닝 위치: 서킷·포타임은 라운드 시작 / 라운드 끝 / 동작 사이 (예전 '라운드마다' = 라운드 끝), 나머지는 시작 전 / 마지막
    if not ((f in ('circuit', 'fortime') and coalesce(d ->> 'runWhere', '') in ('라운드 시작', '라운드 끝', '동작 사이', '라운드마다'))
         or (f in ('amrap', 'emom', 'tabata') and coalesce(d ->> 'runWhere', '') in ('시작 전', '마지막'))) then
      e := e || '러닝 위치'::text;
    end if;
  end if;
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

-- 측정 항목별 평균. p_sex 가 있으면 그 성별만 (null 이면 1학년 전체)
drop function if exists compute_averages();
create or replace function compute_averages(p_sex text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb := '{}';
  ov jsonb;
  k text;
  a numeric; sd numeric; n int;
  o numeric;
begin
  select avg_overrides into ov from app_settings where id = 1;
  foreach k in array array['shuttle', 'sitreach', 'grip', 'jump', 'pushup', 'plank', 'pull', 'run1km'] loop
    if k = 'run1km' then
      select avg(run_sec), stddev_samp(run_sec), count(run_sec) into a, sd, n
      from roster where run_sec is not null and (p_sex is null or sex = p_sex);
    else
      select avg((m.vals ->> k)::numeric), stddev_samp((m.vals ->> k)::numeric), count(*) into a, sd, n
      from measures m join roster r on r.student_no = m.student_no
      where jsonb_typeof(m.vals -> k) = 'number' and (p_sex is null or r.sex = p_sex);
    end if;
    o := try_num(ov ->> k);
    out := out || jsonb_build_object(k, jsonb_build_object(
      'auto', round(a, 2), 'sd', round(sd, 2), 'n', n,
      'avg', round(coalesce(o, a), 2), 'source', case when o is not null then '기준값' else '자동' end));
  end loop;
  return out;
end;
$$;

-- 한 학생이 비교할 평균: 같은 성별 기록이 5명 이상이면 그 성별 평균, 아니면 1학년 전체 평균
create or replace function averages_for(p_sex text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a_all jsonb := compute_averages(null);
  a_sex jsonb := case when p_sex in ('남', '여') then compute_averages(p_sex) end;
  out jsonb := '{}';
  k text;
begin
  for k in select jsonb_object_keys(a_all) loop
    if a_sex is not null and coalesce((a_sex -> k ->> 'n')::int, 0) >= 5 and a_sex -> k ->> 'source' = '자동' then
      out := out || jsonb_build_object(k, (a_sex -> k) || jsonb_build_object('scope', p_sex || '학생 평균'));
    else
      out := out || jsonb_build_object(k, (a_all -> k) || jsonb_build_object('scope', case when a_all -> k ->> 'source' = '기준값' then '기준값' else '1학년 평균' end));
    end if;
  end loop;
  return out;
end;
$$;

-- 종목별 기록 분포 (이름 없이 값만, 오름차순). 같은 성별이 5명 이상이면 같은 성별, 아니면 1학년 전체
create or replace function distributions_for(p_sex text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb := '{}';
  k text;
  v_vals jsonb;
  n int;
  scope text;
begin
  foreach k in array array['shuttle', 'sitreach', 'grip', 'jump', 'pushup', 'plank', 'pull', 'run1km'] loop
    if k = 'run1km' then
      select coalesce(jsonb_agg(run_sec order by run_sec), '[]'), count(*) into v_vals, n
      from roster where run_sec is not null and sex = p_sex;
    else
      select coalesce(jsonb_agg((m.vals ->> k)::numeric order by (m.vals ->> k)::numeric), '[]'), count(*) into v_vals, n
      from measures m join roster r on r.student_no = m.student_no
      where jsonb_typeof(m.vals -> k) = 'number' and r.sex = p_sex;
    end if;
    scope := p_sex || '학생';
    if coalesce(n, 0) < 5 then
      if k = 'run1km' then
        select coalesce(jsonb_agg(run_sec order by run_sec), '[]') into v_vals from roster where run_sec is not null;
      else
        select coalesce(jsonb_agg((ms.vals ->> k)::numeric order by (ms.vals ->> k)::numeric), '[]') into v_vals
        from measures ms where jsonb_typeof(ms.vals -> k) = 'number';
      end if;
      scope := '1학년 전체';
    end if;
    out := out || jsonb_build_object(k, jsonb_build_object('values', v_vals, 'scope', scope));
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
revoke execute on function compute_averages(text) from public, anon, authenticated;
revoke execute on function averages_for(text) from public, anon, authenticated;
revoke execute on function distributions_for(text) from public, anon, authenticated;
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

-- 처음 로그인: 학번·이름 → {status:'setPin'} → 비밀번호를 만들어 다시 부름(p_new_pin = true)
-- 다음부터: 학번·이름 → {status:'pin'} → 비밀번호와 함께 다시 부름
-- 비밀번호 오류는 raise 대신 {status:'error', step, message} 로 돌려준다
drop function if exists student_login(text, text);
create or replace function student_login(p_student_no text, p_name text, p_pin text default null, p_new_pin boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r roster%rowtype;
  v_pin text := coalesce(p_pin, '');
begin
  if auth.uid() is null then raise exception '로그인 세션이 없어요. 새로고침 후 다시 시도해주세요'; end if;
  select * into r from roster where student_no = regexp_replace(coalesce(p_student_no, ''), '\s', '', 'g') for update;
  if not found or regexp_replace(r.name, '\s', '', 'g') <> regexp_replace(coalesce(p_name, ''), '\s', '', 'g') then
    raise exception '명렬표에 없는 학생입니다';
  end if;
  if r.pin_hash is null then
    if v_pin = '' or not p_new_pin then return jsonb_build_object('status', 'setPin'); end if;
    if v_pin !~ '^[0-9]{6}$' then
      return jsonb_build_object('status', 'error', 'step', 'setPin', 'message', '비밀번호는 숫자 6자리로 만들어주세요');
    end if;
    update roster set pin_hash = crypt(v_pin, gen_salt('bf')), pin_fails = 0, pin_locked_until = null, auth_user_id = auth.uid()
    where student_no = r.student_no;
  else
    if v_pin = '' or p_new_pin then return jsonb_build_object('status', 'pin'); end if;
    if r.pin_hash <> crypt(v_pin, r.pin_hash) then
      return jsonb_build_object('status', 'error', 'step', 'pin', 'message', '비밀번호가 맞지 않아요. 잊었으면 선생님께 초기화를 부탁하세요');
    end if;
    update roster set pin_fails = 0, pin_locked_until = null, auth_user_id = auth.uid() where student_no = r.student_no;
  end if;
  return jsonb_build_object('status', 'ok', 'studentNo', r.student_no, 'name', r.name, 'className', r.class_name, 'number', r.number);
end;
$$;
grant execute on function student_login(text, text, text, boolean) to anon, authenticated;

-- 선생님: 학생 비밀번호 초기화 (다음 로그인 때 새로 만듦, 지금 로그인된 기기는 로그아웃)
create or replace function admin_reset_pin(p_student_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  update roster set pin_hash = null, pin_fails = 0, pin_locked_until = null, auth_user_id = null where student_no = p_student_no;
  if not found then raise exception '명렬표에 없는 학번이에요'; end if;
end;
$$;
grant execute on function admin_reset_pin(text) to anon, authenticated;

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
    'me', jsonb_build_object('studentNo', me.student_no, 'name', me.name, 'className', me.class_name, 'number', me.number, 'sex', me.sex),
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
  me roster%rowtype := me_student();
  a jsonb := averages_for(me.sex);
  out jsonb := '{}';
  k text;
begin
  for k in select jsonb_object_keys(a) loop
    out := out || jsonb_build_object(k, jsonb_build_object('avg', a -> k -> 'avg', 'sd', a -> k -> 'sd', 'scope', a -> k -> 'scope'));
  end loop;
  return out;
end;
$$;
grant execute on function get_school_averages() to anon, authenticated;

-- 내 성별(또는 1학년 전체)의 종목별 기록 분포 — 이름 없이 값만 (상위 몇 %인지 계산·분포표용)
create or replace function get_my_distributions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me roster%rowtype := me_student();
begin
  return distributions_for(me.sex);
end;
$$;
grant execute on function get_my_distributions() to anon, authenticated;

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

-- 측정 기록은 학생이 입력하지 않고 교사가 명렬표와 함께 불러온다 (admin_import_roster)
drop function if exists save_measure(jsonb, bigint);

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
  -- 목표 부위: 설계도 동작 부위 5개 중 하나 (2026-11-25 사양: '약점' 1~2개 → '목표 부위' 1개)
  select coalesce(array_agg(a), '{}') into v_areas from (
    select distinct a from unnest(coalesce(p_areas, '{}')) a
    where a in ('push', 'pull', 'core', 'legEnd', 'legPow') limit 1) t;
  insert into weaknesses (student_no, areas, reason, done, rev, updated_at)
  values (me.student_no, v_areas, v_reason, cardinality(v_areas) = 1 and length(trim(v_reason)) >= 10, p_rev, now())
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
        'runText', r.run_text, 'runSec', r.run_sec, 'sex', r.sex, 'hasPin', r.pin_hash is not null,
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
    'averages', compute_averages(null),
    'averagesBySex', jsonb_build_object('남', compute_averages('남'), '여', compute_averages('여')));
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
                 'runText', r.run_text, 'runSec', r.run_sec, 'sex', r.sex, 'hasPin', r.pin_hash is not null),
    'diag', (select jsonb_build_object('answers', answers, 'done', done, 'updatedAt', updated_at) from diagnoses where student_no = r.student_no),
    'measure', (select jsonb_build_object('vals', vals, 'done', done) from measures where student_no = r.student_no),
    'weak', (select jsonb_build_object('areas', areas, 'reason', reason, 'done', done, 'updatedAt', updated_at) from weaknesses where student_no = r.student_no),
    'design', (select jsonb_build_object('data', data, 'status', status, 'submittedAt', submitted_at, 'estMin', est_min, 'updatedAt', updated_at)
               from designs where student_no = r.student_no),
    'score', (select to_jsonb(s) - 'student_no' from scores s where student_no = r.student_no),
    'logs', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'startedAt', started_at, 'endedAt', ended_at, 'seconds', seconds,
               'field', field, 'delta', delta, 'note', note) order by started_at, id) from activity_logs where student_no = r.student_no), '[]'::jsonb),
    'averages', averages_for(r.sex),
    'distributions', distributions_for(r.sex));
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

-- p_rows: [{studentNo, className, number, name, sex?, runText, runSec, vals?}]  — 학번 기준으로 추가/수정
-- vals(팝스 측정 기록)가 있으면 그 학생의 측정 기록을 그 값으로 바꾼다. 자가진단·설계도 등 다른 기록은 그대로.
-- 이름이 빈 줄은 '덧붙이기': 이미 있는 학번에 1km·측정 기록만 더한다 (예: 1km 기록 파일).
create or replace function admin_import_roster(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb;
  v_no text;
  ins int := 0;
  upd int := 0;
  skipped text[] := '{}';
begin
  perform assert_teacher();
  for e in select value from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_no := regexp_replace(coalesce(e ->> 'studentNo', ''), '\s', '', 'g');
    -- 이름 없이 학번 + 기록만 있는 줄: 이미 있는 학생의 1km·측정 기록만 덧붙임
    if v_no <> '' and coalesce(trim(e ->> 'name'), '') = '' and exists (select 1 from roster where student_no = v_no) then
      if try_num(e ->> 'runSec') is not null then
        update roster set run_text = nullif(trim(e ->> 'runText'), ''), run_sec = try_num(e ->> 'runSec')::int where student_no = v_no;
      end if;
      if jsonb_typeof(e -> 'vals') = 'object' then
        insert into measures (student_no, vals, done, rev, updated_at)
        values (v_no, (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(e -> 'vals')
                       where key in ('shuttle', 'sitreach', 'grip', 'jump', 'pushup', 'plank', 'pull') and jsonb_typeof(value) = 'number'),
                true, (extract(epoch from now()) * 1000)::bigint, now())
        on conflict (student_no) do update set vals = measures.vals || excluded.vals, done = true, rev = excluded.rev, updated_at = now();
      end if;
      upd := upd + 1;
      continue;
    end if;
    if v_no <> '' and coalesce(trim(e ->> 'name'), '') = '' then
      skipped := skipped || v_no;   -- 명렬표에 없는 학번의 덧붙이기 줄은 건너뜀
      continue;
    end if;
    if v_no = '' or coalesce(trim(e ->> 'name'), '') = '' or coalesce(trim(e ->> 'className'), '') = '' then
      raise exception '학번·이름·반이 비어 있는 줄이 있어요: %', e::text;
    end if;
    if exists (select 1 from roster where student_no = v_no) then upd := upd + 1; else ins := ins + 1; end if;
    insert into roster (student_no, class_name, number, name, sex, run_text, run_sec)
    values (v_no, trim(e ->> 'className'), try_num(e ->> 'number')::int, trim(e ->> 'name'),
            case when trim(e ->> 'sex') in ('남', '여') then trim(e ->> 'sex') end,
            nullif(trim(e ->> 'runText'), ''), try_num(e ->> 'runSec')::int)
    on conflict (student_no) do update set class_name = excluded.class_name, number = excluded.number,
      name = excluded.name, sex = coalesce(excluded.sex, roster.sex),
      -- 1km 칸이 없는 표(예: 팝스 시트)를 다시 불러와도 이미 등록한 1km 기록은 지우지 않음
      run_text = coalesce(excluded.run_text, roster.run_text), run_sec = coalesce(excluded.run_sec, roster.run_sec);
    if jsonb_typeof(e -> 'vals') = 'object' then
      insert into measures (student_no, vals, done, rev, updated_at)
      values (v_no, (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(e -> 'vals')
                     where key in ('shuttle', 'sitreach', 'grip', 'jump', 'pushup', 'plank', 'pull') and jsonb_typeof(value) = 'number'),
              true, (extract(epoch from now()) * 1000)::bigint, now())
      on conflict (student_no) do update set vals = excluded.vals, done = true, rev = excluded.rev, updated_at = now();
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'skipped', to_jsonb(skipped));
end;
$$;
grant execute on function admin_import_roster(jsonb) to anon, authenticated;

-- 설계도 전체 내려받기 (사양의 '설계도 탭' 열) — 명렬표 순서, 설계도·목표 부위가 없는 학생도 포함
create or replace function admin_export_designs() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'studentNo', r.student_no, 'className', r.class_name, 'number', r.number, 'name', r.name, 'runSec', r.run_sec,
      'target', w.areas, 'reason', w.reason,
      'data', g.data, 'estMin', g.est_min, 'status', g.status, 'submittedAt', g.submitted_at
    ) order by r.class_name, r.number)
    from roster r
    left join weaknesses w on w.student_no = r.student_no
    left join designs g on g.student_no = r.student_no
  ), '[]'::jsonb);
end;
$$;
grant execute on function admin_export_designs() to anon, authenticated;

create or replace function admin_delete_student(p_student_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_teacher();
  delete from roster where student_no = p_student_no;   -- 그 학생의 모든 기록도 함께 지워짐
end;
$$;
grant execute on function admin_delete_student(text) to anon, authenticated;


