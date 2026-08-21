create table if not exists players (
  id text primary key,
  display_name text not null,
  email text unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists player_progress (
  player_id text primary key references players(id) on delete cascade,
  language text not null default 'ru',
  campaign_state jsonb not null,
  saved_at timestamptz not null default now()
);

create table if not exists leaderboard_records (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  player_name text not null,
  mode text not null check (mode in ('squad', 'solo')),
  cycle_index integer not null,
  operation_index integer,
  operation_id text not null,
  operation_name text not null,
  biome_id text not null,
  biome_name text not null,
  board_rows integer not null,
  board_cols integer not null,
  mine_count integer not null,
  operative_id text not null,
  operative_name text not null,
  elapsed_seconds integer not null,
  score integer not null,
  result text not null check (result = 'win'),
  base_operation_xp integer not null,
  par_time_seconds integer not null,
  medals_earned_count integer not null default 0,
  remaining_hp integer not null default 0,
  rank_index integer not null default 0,
  rank_bonus integer not null default 0,
  score_breakdown jsonb not null,
  used_perks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_records_operation_idx
  on leaderboard_records(mode, cycle_index, operation_index, score desc, elapsed_seconds asc);

create table if not exists user_game_stats (
  player_id text primary key references players(id) on delete cascade,
  total_score integer not null default 0,
  wins integer not null default 0,
  best_cycle_index integer not null default 1,
  best_operation_index integer,
  top_operative_id text,
  top_operative_name text,
  updated_at timestamptz not null default now()
);
