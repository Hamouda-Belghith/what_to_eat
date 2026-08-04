export interface LocalSession {
  user: {
    email: string;
  };
  access_token: string;
}

type StoredUser = {
  email: string;
  password: string;
};

const USERS_KEY = "meal-planner-local-users";
const SESSION_KEY = "meal-planner-local-session";

const listeners = new Set<(session: LocalSession | null) => void>();

function loadUsers(): Record<string, StoredUser> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredUser>) : {};
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, StoredUser>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LocalSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: LocalSession | null) {
  if (typeof window === "undefined") return;
  if (session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(SESSION_KEY);
  }
  for (const listener of listeners) {
    listener(session);
  }
}

function createSession(email: string): LocalSession {
  return {
    user: { email },
    access_token: crypto.randomUUID(),
  };
}

export async function getLocalSession(): Promise<LocalSession | null> {
  return loadSession();
}

export function onLocalAuthStateChange(
  callback: (session: LocalSession | null) => void
): { unsubscribe: () => void } {
  listeners.add(callback);

  return {
    unsubscribe: () => {
      listeners.delete(callback);
    },
  };
}

export async function signInLocal(
  email: string,
  password: string
): Promise<{ data: { session: LocalSession | null } | null; error: { message: string } | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = loadUsers();

  if (!normalizedEmail || !password) {
    return { data: null, error: { message: "Email et mot de passe requis." } };
  }

  const existing = users[normalizedEmail];
  if (!existing || existing.password !== password) {
    return { data: null, error: { message: "Email ou mot de passe incorrect." } };
  }

  const session = createSession(normalizedEmail);
  saveSession(session);
  return { data: { session }, error: null };
}

export async function signUpLocal(
  email: string,
  password: string
): Promise<{ data: { session: LocalSession | null } | null; error: { message: string } | null }> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = loadUsers();

  if (!normalizedEmail || !password) {
    return { data: null, error: { message: "Email et mot de passe requis." } };
  }

  if (users[normalizedEmail]) {
    return { data: null, error: { message: "Cet email existe déjà. Connecte-toi." } };
  }

  users[normalizedEmail] = { email: normalizedEmail, password };
  saveUsers(users);

  const session = createSession(normalizedEmail);
  saveSession(session);
  return { data: { session }, error: null };
}

export async function signOutLocal(): Promise<void> {
  saveSession(null);
}

export function isDemoMode(): boolean {
  return true;
}
