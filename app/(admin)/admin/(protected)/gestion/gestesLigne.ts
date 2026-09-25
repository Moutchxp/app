/**
 * LOT 5-BOITE-3 — LES GESTES DU MENU D'UNE LIGNE. Même patron que `gestesMail.tsx` : l'appel réseau vit ICI, jamais
 * dans le composant d'écran.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE. Un garde d'écran (`BoiteMail.parts.test.ts`) exige que `PleinEcranBoite` ne
 * contienne AUCUN `fetch(` : il dispose des composants, il ne va rien chercher tout seul — c'est ce qui a empêché,
 * depuis le lot 5a, qu'une seconde lecture de la boîte soit recopiée à côté de la première. Les gestes suivent la
 * même règle : ils sont ici, éprouvables et réutilisables, et l'écran ne fait que les appeler.
 *
 * 🔴 CHACUN RAPPORTE, AUCUN NE DÉCIDE. Ces fonctions rendent ce qui s'est passé ; c'est l'écran qui choisit quoi en
 * faire (relire la liste, afficher un bandeau, rendre le focus).
 */

/** Ce qu'un geste rapporte. `ok` dit s'il a eu lieu ; `message` est TOUJOURS lisible par un humain. */
export interface IssueGeste { ok: boolean; message: string }

/**
 * MARQUE UN ÉCHANGE LU OU NON LU. Passe par la route du lot 5-BOITE-2 : c'est le lu/non lu de GMAIL, commun à toute
 * l'équipe. On ne crée pas un second chemin pour le même geste.
 */
export async function marquerLectureLigne(filId: number, lu: boolean): Promise<IssueGeste> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/lecture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lu }),
    });
    const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string };
    if (d.etat !== 'ok') return { ok: false, message: d.message ?? 'Marquage impossible.' };
    return { ok: true, message: lu ? 'Échange marqué comme lu.' : 'Échange marqué comme non lu.' };
  } catch {
    return { ok: false, message: 'Marquage impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * MET UN ÉCHANGE À LA CORBEILLE, ou l'en SORT.
 *
 * 🔴 AUCUNE CONFIRMATION N'EST DEMANDÉE, et c'est délibéré : le geste est réversible d'un clic (bandeau « Annuler »,
 * puis l'étiquette « Corbeille » et son « Restaurer »), rien n'est supprimé en base, et le mail reste intact dans
 * Gmail. Une question posée avant un geste qu'on défait en une seconde apprend surtout à cliquer « oui » sans lire.
 */
export async function gesteCorbeille(filId: number, versLaCorbeille: boolean): Promise<IssueGeste> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/corbeille`, {
      method: versLaCorbeille ? 'POST' : 'DELETE',
    });
    const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string };
    if (d.etat !== 'ok') return { ok: false, message: d.message ?? 'Geste impossible.' };
    return {
      ok: true,
      message: d.message ?? (versLaCorbeille ? 'Échange mis à la corbeille.' : 'Échange restauré.'),
    };
  } catch {
    return { ok: false, message: 'Geste impossible : le serveur n’a pas répondu.' };
  }
}
