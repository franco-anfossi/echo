-- Create Topic Difficulty logic
create type difficulty_level as enum ('beginner', 'intermediate', 'advanced');

-- Topics Table
create table public.topics (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  difficulty difficulty_level default 'beginner',
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.topics enable row level security;
create policy "Topics are viewable by everyone" on public.topics for select using (true);

-- Attempts Table
create table public.attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  topic_id uuid references public.topics(id) on delete set null,
  audio_path text, -- Path in storage bucket
  duration_seconds integer,
  status text check (status in ('created', 'uploaded', 'processing', 'completed', 'failed')) default 'created',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.attempts enable row level security;
create policy "Users can view own attempts" on public.attempts for select using (auth.uid() = user_id);
create policy "Users can insert own attempts" on public.attempts for insert with check (auth.uid() = user_id);
create policy "Users can update own attempts" on public.attempts for update using (auth.uid() = user_id);
create policy "Users can delete own attempts" on public.attempts for delete using (auth.uid() = user_id);

-- Metrics Table
create table public.attempt_metrics (
  id uuid default gen_random_uuid() primary key,
  attempt_id uuid references public.attempts(id) on delete cascade not null unique,
  wpm integer,
  filler_word_count integer,
  pause_count integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.attempt_metrics enable row level security;
create policy "Users can view own metrics" on public.attempt_metrics 
  for select using (exists (select 1 from public.attempts where id = attempt_metrics.attempt_id and user_id = auth.uid()));

-- Scores Table
create table public.attempt_scores (
  id uuid default gen_random_uuid() primary key,
  attempt_id uuid references public.attempts(id) on delete cascade not null unique,
  overall_score integer check (overall_score between 0 and 100),
  fluency_score integer check (fluency_score between 0 and 100),
  vocabulary_score integer check (vocabulary_score between 0 and 100),
  grammar_score integer check (grammar_score between 0 and 100),
  coherence_score integer check (coherence_score between 0 and 100),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.attempt_scores enable row level security;
create policy "Users can view own scores" on public.attempt_scores 
  for select using (exists (select 1 from public.attempts where id = attempt_scores.attempt_id and user_id = auth.uid()));

-- Feedback Table
create table public.attempt_feedback (
  id uuid default gen_random_uuid() primary key,
  attempt_id uuid references public.attempts(id) on delete cascade not null unique,
  transcript text,
  feedback_points jsonb, -- Array of strings or objects
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.attempt_feedback enable row level security;
create policy "Users can view own feedback" on public.attempt_feedback 
  for select using (exists (select 1 from public.attempts where id = attempt_feedback.attempt_id and user_id = auth.uid()));


-- Storage Bucket Setup (Idempotent-ish)
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "Users can upload own recordings" on storage.objects
  for insert with check (
    bucket_id = 'recordings' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "Users can view own recordings" on storage.objects
  for select using (
    bucket_id = 'recordings' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );
  
create policy "Users can delete own recordings" on storage.objects
  for delete using (
    bucket_id = 'recordings' and
    auth.uid() = (storage.foldername(name))[1]::uuid
  );
