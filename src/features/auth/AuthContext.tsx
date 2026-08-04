"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import {
  getLocalSession,
  onLocalAuthStateChange,
} from "@/features/auth/localAuth";
import { isDemoMode } from "@/lib/localDemo";

type SessionOrLocal = Session | { user: { email: string } };

interface AuthContextValue {
  /** null = pas encore connu (session en cours de chargement). */
  session: SessionOrLocal | null | undefined;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: undefined,
  loading: true,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionOrLocal | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    if (!supabase || isDemoMode()) {
      void getLocalSession().then((session) => {
        if (!active) return;
        setSession(session);
        setLoading(false);
      });

      const subscription = onLocalAuthStateChange((newSession) => {
        if (!active) return;
        setSession(newSession);
      });

      return () => {
        active = false;
        subscription.unsubscribe();
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;

      setSession(newSession);
      // Au retour d'une session (connexion), on rejoue les mutations
      // offline restées en attente : l'utilisateur est maintenant
      // authentifié et peut écrire côté Supabase.
      if (newSession) {
        void import("@/features/shopping-list/syncQueue").then(
          ({ flushPendingMutations }) => flushPendingMutations()
        );
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSignOut(): () => Promise<void> {
  return useCallback(async () => {
    const supabase = getSupabase();
    if (supabase && !isDemoMode()) {
      await supabase.auth.signOut();
    } else {
      const { signOutLocal } = await import("@/features/auth/localAuth");
      await signOutLocal();
    }
  }, []);
}
