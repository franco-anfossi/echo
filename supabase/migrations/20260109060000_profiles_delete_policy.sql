
-- Add DELETE policy to profiles
-- This allows the user to delete their own profile row.
-- Once the row is deleted, the trigger 'on_profile_deleted' will fire and delete the auth user.
CREATE POLICY "Users can delete own profile." ON profiles
  FOR DELETE USING (auth.uid() = id);
