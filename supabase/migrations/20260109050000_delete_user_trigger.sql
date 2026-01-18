
-- Function to delete user from auth.users
-- This runs with SECURITY DEFINER to bypass RLS and delete the auth user
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a profile is deleted
-- Ensure it's AFTER DELETE so we have the OLD data but the profiles row is removed
CREATE OR REPLACE TRIGGER on_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();
