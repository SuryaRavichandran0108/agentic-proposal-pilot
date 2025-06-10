
-- First, drop any existing RLS policies on the sections table
DROP POLICY IF EXISTS "Users can view sections of their proposals" ON public.sections;
DROP POLICY IF EXISTS "Users can create sections for their proposals" ON public.sections;
DROP POLICY IF EXISTS "Users can update sections of their proposals" ON public.sections;
DROP POLICY IF EXISTS "Users can delete sections of their proposals" ON public.sections;

-- Create a security definer function to get user's proposal IDs
-- This prevents the recursive RLS issue by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_user_proposal_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.proposals WHERE created_by = auth.uid();
$$;

-- Enable RLS on sections table (if not already enabled)
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies using the security definer function
CREATE POLICY "Users can view their proposal sections" 
  ON public.sections 
  FOR SELECT 
  USING (proposal_id IN (SELECT public.get_user_proposal_ids()));

CREATE POLICY "Users can insert sections for their proposals" 
  ON public.sections 
  FOR INSERT 
  WITH CHECK (proposal_id IN (SELECT public.get_user_proposal_ids()));

CREATE POLICY "Users can update their proposal sections" 
  ON public.sections 
  FOR UPDATE 
  USING (proposal_id IN (SELECT public.get_user_proposal_ids()));

CREATE POLICY "Users can delete their proposal sections" 
  ON public.sections 
  FOR DELETE 
  USING (proposal_id IN (SELECT public.get_user_proposal_ids()));
