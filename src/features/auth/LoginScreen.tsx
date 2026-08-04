"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { signInLocal, signUpLocal } from "@/features/auth/localAuth";
import { isDemoMode } from "@/lib/localDemo";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const supabase = getSupabase();
  const demo = isDemoMode();
  const showConfigWarning = !supabase && !demo;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSending(true);

    try {
      if (demo) {
        if (mode === "signin") {
          const { data, error } = await signInLocal(email.trim(), password);
          if (error) {
            setError(error.message);
          } else if (data?.session) {
            await router.replace("/");
          }
        } else {
          const { data, error } = await signUpLocal(email.trim(), password);
          if (error) {
            setError(error.message);
          } else if (data?.session) {
            await router.replace("/");
          }
        }

        return;
      }

      if (!supabase) {
        setError(
          "Supabase n'est pas configuré (variables d'environnement manquantes)."
        );
        return;
      }

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
        } else {
          await router.replace("/");
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
        } else if (data.session) {
          await router.replace("/");
        } else {
          setMessage(
            "Compte créé. Vérifie ton email pour confirmer l'inscription, puis connecte-toi."
          );
          setMode("signin");
        }
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 420 }}>
        <h1 style={{ fontSize: "1.5rem" }}>🍽️ Meal Planner</h1>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Planification de repas et liste de courses.
        </p>

        {showConfigWarning ? (
          <div
            className="card"
            style={{ background: "var(--warn-soft)", boxShadow: "none" }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>
              ⚠️ Configuration manquante
            </p>
            <p style={{ marginBottom: 0 }}>
              Les variables <code>NEXT_PUBLIC_SUPABASE_URL</code> et <code>
              NEXT_PUBLIC_SUPABASE_ANON_KEY</code> ne sont pas définies. Copie
              <code>.env.local.example</code> vers <code>.env.local</code> et
              renseigne les valeurs de ton projet Supabase.
            </p>
          </div>
        ) : (
          <>
            {demo ? (
              <div
                className="card"
                style={{ background: "var(--accent-soft)", boxShadow: "none" }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>Mode démo activé</p>
                <p style={{ marginBottom: 0 }}>
                  L'application fonctionne localement sans Supabase. Les données
                  sont stockées dans ton navigateur uniquement.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
              <Field
                label="Email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.fr"
              />
              <Field
                label="Mot de passe"
                name="password"
                type="password"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error ? (
                <p style={{ color: "var(--danger)", fontWeight: 700 }}>{error}</p>
              ) : null}
              {message ? (
                <p style={{ color: "var(--accent-dark)", fontWeight: 700 }}>
                  {message}
                </p>
              ) : null}

              <Button type="submit" disabled={sending} className="btn-block">
                {sending ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
              </Button>
            </form>
          </>
        )}

        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: "0.75rem" }}
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
        >
          {mode === "signin"
            ? "Pas encore de compte ? Créer un compte"
            : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
