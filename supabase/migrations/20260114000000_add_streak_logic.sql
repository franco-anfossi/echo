-- Add usage stats to profiles
alter table public.profiles 
add column if not exists streak_current int default 0,
add column if not exists streak_longest int default 0,
add column if not exists last_practice_date timestamptz,
add column if not exists total_attempts int default 0;

-- Function to calculate streak on new completed attempt
create or replace function public.handle_new_attempt_stats()
returns trigger as $$
declare
  user_profile public.profiles%rowtype;
  last_date date;
  curr_date date;
begin
  -- Only proceed if status is completed
  if new.status <> 'completed' then
    return new;
  end if;

  select * into user_profile from public.profiles where id = new.user_id;
  
  -- If no profile (shouldn't happen), exit
  if not found then
    return new;
  end if;

  curr_date := (new.created_at at time zone 'UTC')::date;
  last_date := (user_profile.last_practice_date at time zone 'UTC')::date;

  -- Update total attempts
  update public.profiles 
  set total_attempts = total_attempts + 1
  where id = new.user_id;

  -- Streak Logic
  if last_date is null then
    -- First ever practice
    update public.profiles
    set streak_current = 1,
        streak_longest = 1,
        last_practice_date = new.created_at
    where id = new.user_id;
  
  elsif last_date = curr_date then
    -- Already practiced today, just update timestamp
    update public.profiles
    set last_practice_date = new.created_at
    where id = new.user_id;
    
  elsif last_date = (curr_date - interval '1 day')::date then
    -- Consecutive day!
    update public.profiles
    set streak_current = streak_current + 1,
        streak_longest = greatest(streak_current + 1, streak_longest),
        last_practice_date = new.created_at
    where id = new.user_id;
    
  else
    -- Streak broken (gap > 1 day or future date anomaly)
    if curr_date > last_date then
      update public.profiles
      set streak_current = 1,
          last_practice_date = new.created_at
      where id = new.user_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger
drop trigger if exists on_attempt_completed on public.attempts;
create trigger on_attempt_completed
  after insert or update on public.attempts
  for each row
  execute procedure public.handle_new_attempt_stats();
