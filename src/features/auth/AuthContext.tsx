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
  signOutLocal,
} from "@/features/auth/localAuth";
import { flushPendingMutations } from "@/features/shopping-list/syncQueue";
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

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const hasAuthCallback =
      typeof window !== "undefined" &&
      (window.location.hash.includes("access_token") ||
        window.location.hash.includes("refresh_token") ||
        window.location.search.includes("code=") ||
        window.location.search.includes("token="));

    if (hasAuthCallback) {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tokenHash = hashParams.get("token_hash") ?? params.get("token_hash");
      const type = hashParams.get("type") ?? params.get("type");
      const code = params.get("code");

      const finalizeAuth = async () => {
        if (!active) return;

        try {
          if (tokenHash && type) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as "email" | "magiclink" | "recovery" | "invite" | "signup" | "email_change",
            });

            if (error) {
              console.error("Auth callback error", error);
              return;
            }

            if (data.session) {
              setSession(data.session);
              void flushPendingMutations();
            }
          } else if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error("Auth callback error", error);
              return;
            }

            if (data.session) {
              setSession(data.session);
              void flushPendingMutations();
            }
          }
        } finally {
          if (typeof window !== "undefined") {
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState({}, "", cleanUrl);
          }
        }
      };

      void finalizeAuth();
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;

      setSession(newSession);
      // Au retour d'une session (connexion), on rejoue les mutations
      // offline restées en attente : l'utilisateur est maintenant
      // authentifié et peut écrire côté Supabase.
      if (newSession) {
        void flushPendingMutations();
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
      await signOutLocal();
    }
  }, []);
}
