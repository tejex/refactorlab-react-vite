import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthSessionState {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    isLoading: Boolean(supabase),
    session: null,
    user: null,
  });

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setState({
        isLoading: false,
        session: data.session,
        user: data.session?.user ?? null,
      });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        isLoading: false,
        session,
        user: session?.user ?? null,
      });
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
