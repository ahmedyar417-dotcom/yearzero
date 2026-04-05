import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://mypnnyamygoigaimdypd.supabase.co',
  'sb_publishable_cvF_nMtUyanot5WLaQAMYQ_V6V4eHQO',
  {
    auth: {
      persistSession: true,
      storageKey: 'yz-auth-session',
      storage: window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    }
  }
)
