-- Add XP column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_decay_at TIMESTAMPTZ DEFAULT NOW();

-- Function to handle daily decay (called by client on startup)
CREATE OR REPLACE FUNCTION check_daily_decay()
RETURNS JSONB AS $$
DECLARE
  p_xp INTEGER;
  p_last_decay TIMESTAMPTZ;
  days_missed INTEGER;
  decay_amount INTEGER := 10; -- Lose 10 XP per day
  actual_decay INTEGER := 0;
BEGIN
  SELECT xp, last_decay_at INTO p_xp, p_last_decay 
  FROM profiles 
  WHERE id = auth.uid();

  -- Calculate days passed since last check.
  -- strict inequality ensures we only decay if a full day (or calendar day?) has passed.
  -- Let's use simple difference in days.
  days_missed := CAST(EXTRACT(DAY FROM (NOW() - p_last_decay)) AS INTEGER);

  IF days_missed > 0 THEN
    actual_decay := days_missed * decay_amount;
    
    -- Prevent negative XP
    IF (p_xp - actual_decay) < 0 THEN
       actual_decay := p_xp;
    END IF;

    UPDATE profiles
    SET xp = xp - actual_decay,
        last_decay_at = NOW()
    WHERE id = auth.uid();
    
    RETURN json_build_object('decayed', true, 'amount', actual_decay);
  END IF;

  RETURN json_build_object('decayed', false, 'amount', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add XP safely
CREATE OR REPLACE FUNCTION add_xp(user_id UUID, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET xp = xp + amount
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
