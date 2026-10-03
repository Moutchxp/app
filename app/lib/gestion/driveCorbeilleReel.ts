import type { DepsGoogle, Resultat } from './google';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA SEULE ÉCRITURE QUI MET À LA CORBEILLE. IMPUR (Google) ════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 POURQUOI CE FICHIER EXISTE À PART, ET POURQUOI IL EST COURT.
 *
 * `driveMouvement.ts` porte un test statique qui ÉNUMÈRE ce qu'il a le droit de faire, et qui cherche le mot
 * `trashed` pour le REFUSER. Ajouter la corbeille là-bas aurait obligé à relâcher ce test — et un garde qu'on
 * relâche une fois se relâche une seconde. La nouvelle écriture vit donc ICI, avec SON propre test statique, qui
 * dit exactement ce que ce fichier a le droit de faire :
 *
 *     · `PATCH` sur `files/{id}` avec, dans le corps, `{ trashed: true }` ou `{ trashed: false }`, et RIEN d'autre.
 *
 * 🔴🔴 ET CE QU'IL N'A PAS LE DROIT DE FAIRE, écrit noir sur blanc, cherché mot par mot par son test :
 *     · aucun `DELETE` — `files.delete` SUPPRIME DÉFINITIVEMENT, et cela ne se défait pas ;
 *     · aucun `emptyTrash` — vider la corbeille détruirait aussi ce que d'autres y ont mis ;
 *     · aucun `name` (ce serait un renommage), aucun `parents` (ce serait un déplacement), aucun `permissions`.
 *
 * C'est toute la différence qui a permis à Arno de lever l'interdit : la corbeille se défait (30 jours chez
 * Google, et tout de suite par « Annuler »). La suppression définitive, non — elle reste absente de ce dépôt.
 *
 * ⚠️ LE GARDE N'EST PAS ICI. C'est la route qui prononce le verdict, en remontant la chaîne des parents du fichier
 * chez Google et en interrogeant le module PUR `driveCorbeille`. Ce fichier exécute ce qu'on lui a dit d'exécuter,
 * et il ne doit jamais être appelé sans ce verdict. Séparation voulue : l'endroit qui décide et l'endroit qui écrit
 * ne doivent pas pouvoir être confondus.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
/** Les Drive partagés exigent ce couple : sans lui, l'API répond « introuvable » sur un fichier d'équipe. */
const PARTAGES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } as const;

export interface ElementCorbeille {
  id: string;
  nom: string;
  /** Vrai = il est à la corbeille ; faux = il en est sorti. Lu dans la RÉPONSE de Google, jamais supposé. */
  aLaCorbeille: boolean;
}

function motif(statut: number, quoi: string): string {
  if (statut === 403) {
    return `Google refuse ${quoi} : votre compte n’a pas les droits suffisants sur ce fichier. `
      + 'Demandez-les au propriétaire du dossier, ou faites le geste depuis Google Drive.';
  }
  if (statut === 404) return `Google ne trouve plus ce fichier pour ${quoi}.`;
  if (statut === 429 || statut >= 500) return `Google est momentanément indisponible pour ${quoi}. Réessayez.`;
  return `Google a refusé ${quoi} (code ${statut}).`;
}

/**
 * ══ 🔴 METTRE À LA CORBEILLE, OU L'EN SORTIR — `files.update` AVEC `trashed`, ET RIEN D'AUTRE ════════════════════
 *
 * 🔴 LE CORPS NE CONTIENT QUE `trashed`, et c'est capital : y glisser un `name` serait un renommage, un `parents`
 * un déplacement. Un seul champ, écrit à un seul endroit, et un test le vérifie.
 *
 * 🔴 ELLE S'EXÉCUTE AVEC LE COMPTE DE L'UTILISATEUR (le jeton lui appartient, comme pour le renommage) : c'est SA
 * corbeille qui reçoit le fichier, c'est son nom qui apparaît dans l'historique de Google, et ce sont SES droits
 * qui décident. Un refus 403 est donc une information exacte sur ce que cette personne a le droit de faire — et on
 * le lui dit en toutes lettres plutôt que de le faire passer pour une panne.
 *
 * ⚠️ `fields` DEMANDE `trashed` : on rend ce que Google AFFIRME, pas ce qu'on a demandé. Un geste qui « réussit »
 * sans que l'état ait changé est le genre de mensonge dont on ne se remet qu'en ouvrant le Drive à la main.
 */
export async function basculerCorbeille(
  accessToken: string,
  o: { id: string; versLaCorbeille: boolean },
  deps: DepsGoogle,
): Promise<Resultat<ElementCorbeille>> {
  const p = new URLSearchParams({ fields: 'id,name,trashed', ...PARTAGES });
  const quoi = o.versLaCorbeille ? 'cette mise à la corbeille' : 'cette restauration';
  let res: Response;
  try {
    res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(o.id)}?${p}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: o.versLaCorbeille }),
    });
  } catch (e) {
    return { ok: false, motif: `Le Drive n’a pas répondu : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, motif: motif(res.status, quoi) };
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; trashed?: boolean };
  return {
    ok: true,
    valeur: { id: j.id ?? o.id, nom: j.name ?? '', aLaCorbeille: j.trashed === true },
  };
}
