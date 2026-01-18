-- Add breakdown scores to attempt_scores
alter table public.attempt_scores
add column if not exists wpm_score integer check (wpm_score between 0 and 100),
add column if not exists filler_score integer check (filler_score between 0 and 100),
add column if not exists pause_score integer check (pause_score between 0 and 100);
