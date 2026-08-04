import { getDb, type PendingMutation } from "@/lib/db/dexie";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";

// Principe : toute modification (ex: cocher un article) est écrite
// IMMÉDIATEMENT en local (réponse instantanée, marche offline), puis
// empilée ici. On tente de la rejouer vers Supabase dès que possible.
//
// Comme l'app n'a que 2 utilisateurs, le risque de conflit est
// négligeable : on applique une stratégie "dernière écriture gagne"
// (pas besoin d'un système de résolution de conflits plus complexe).

export async function queueMutation(
  itemId: string,
  action: PendingMutation["action"],
  payload: PendingMutation["payload"]
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  await getDb().pendingMutations.add({
    id: crypto.randomUUID(),
    userId,
    itemId,
    action,
    payload,
    createdAt: new Date().toISOString(),
  });

  // Tentative immédiate si le réseau est là ; sinon on réessaiera
  // au prochain événement "online" (voir setupAutoSync ci-dessous).
  if (navigator.onLine) {
    void flushPendingMutations();
  }
}

export async function flushPendingMutations(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const pending = await getDb()
    .pendingMutations.where("userId")
    .equals(userId)
    .toArray();

  pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const mutation of pending) {
    try {
      if (mutation.action === "toggle_checked") {
        const supabase = getSupabase();
        if (!supabase) {
          // Pas de configuration Supabase : on garde les mutations en
          // attente et on réessaiera plus tard (à l'apparition du réseau).
          break;
        }

        const userId = await getCurrentUserId();
        if (!userId) break;

        const { error } = await supabase
          .from("shopping_list_items")
          .update({
            is_checked: mutation.payload.isChecked,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("user_id", userId)
          .eq("id", mutation.itemId);

        if (error) throw error;
      }

      // Succès : on retire la mutation de la file.
      await getDb().pendingMutations.delete(mutation.id);
    } catch (err) {
      // Échec réseau probable : on arrête ici, on réessaiera plus tard.
      // Les mutations suivantes ne sont pas tentées pour garder l'ordre.
      console.warn("Synchronisation interrompue, nouvelle tentative plus tard", err);
      break;
    }
  }
}

// À appeler une fois au démarrage de l'app (ex: dans un composant racine).
export function setupAutoSync(): () => void {
  const handleOnline = () => void flushPendingMutations();
  window.addEventListener("online", handleOnline);
  return () => window.removeEventListener("online", handleOnline);
}
