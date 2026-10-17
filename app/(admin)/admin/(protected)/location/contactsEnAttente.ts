import type { ChampsSaisis } from '../gestion/CartesPersonnes';

/**
 * TUILE LOCATION — LES CONTACTS DU PROPRIÉTAIRE, DE « Créer un nouveau propriétaire » À « Ajouter un nouveau bien ».
 *
 * Une carte de contact se range sur un BIEN (clé de sa table, comme dans la Gestion) : les contacts saisis avec le
 * propriétaire ne peuvent donc être enregistrés qu'avec le bien, à l'écran suivant. Ils voyagent dans le stockage de
 * l'ONGLET (`sessionStorage`), liés aux propriétaires créés : rien n'est écrit en base tant que le bien n'est pas
 * enregistré, et un onglet fermé ne laisse rien derrière lui. Chaque accès est protégé (stockage indisponible ⇒ rien).
 */
const CLE = 'svav-location-contacts-proprietaire';

export function poserContactsEnAttente(proprietaireIds: readonly number[], contacts: readonly ChampsSaisis[]): void {
  try {
    if (contacts.length === 0) { window.sessionStorage.removeItem(CLE); return; }
    window.sessionStorage.setItem(CLE, JSON.stringify({ proprietaireIds: [...proprietaireIds].sort((a, b) => a - b), contacts }));
  } catch { /* stockage indisponible : les contacts se saisiront depuis la fiche du bien */ }
}

/** Les contacts en attente, s'ils ont été saisis pour CES propriétaires ; sinon une liste vide. */
export function lireContactsEnAttente(proprietaireIds: readonly number[]): ChampsSaisis[] {
  try {
    const brut = window.sessionStorage.getItem(CLE);
    if (brut === null) return [];
    const d = JSON.parse(brut) as { proprietaireIds?: number[]; contacts?: ChampsSaisis[] };
    const attendus = [...proprietaireIds].sort((a, b) => a - b).join(',');
    return (d.proprietaireIds ?? []).join(',') === attendus && Array.isArray(d.contacts) ? d.contacts : [];
  } catch {
    return [];
  }
}

export function oublierContactsEnAttente(): void {
  try { window.sessionStorage.removeItem(CLE); } catch { /* rien à faire */ }
}
