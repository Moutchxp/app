import type { DepsGoogle, Resultat } from './google';

/**
 * LOT DRIVE-DEPLACER — LES DEUX SEULES ÉCRITURES DE CE LOT : DÉPLACER, ET COPIER. IMPUR (Google).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 POURQUOI CE FICHIER EXISTE À PART, ET POURQUOI IL EST COURT.
 *
 * `driveEcriture.ts` ne fait que des `POST` (créer un dossier, créer un raccourci) et un test statique l'exige :
 * il compte les verbes HTTP de son source et refuse tout ce qui n'est pas `POST`. Ce lot ajoute un `PATCH`
 * (`files.update`, pour déplacer). Le mettre là-bas aurait obligé à relâcher ce test — et un garde qu'on relâche
 * une fois se relâche une seconde fois.
 *
 * Les deux nouvelles écritures vivent donc ICI, avec LEUR propre test statique, qui dit exactement ce que ce
 * fichier a le droit de faire :
 *   · `PATCH` sur `files/{id}` avec `addParents` et `removeParents`, et RIEN d'autre dans le corps ;
 *   · `POST` sur `files/{id}/copy`.
 *
 * 🔴🔴 ET CE QU'IL N'A PAS LE DROIT DE FAIRE, écrit noir sur blanc : aucun `DELETE`, aucun `trashed: true`, aucun
 * `name:` (ce serait un renommage), aucun `permissions`. L'application ne supprime pas, ne renomme pas, ne met pas
 * à la corbeille et ne partage pas. Le test cherche ces mots un par un dans ce fichier.
 *
 * ⚠️ LE GARDE N'EST PAS ICI. C'est la route qui prononce le verdict, en remontant les chaînes de parents de la
 * source ET de la cible chez Google. Ce fichier exécute ce qu'on lui a dit d'exécuter — et il ne doit jamais être
 * appelé sans ce verdict. C'est une séparation voulue : l'endroit qui décide et l'endroit qui écrit ne doivent pas
 * pouvoir être confondus (même raisonnement que `vidageRepo` / `supprimer`, au lot DRIVE-3).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';
/** Les Drive partagés exigent ce couple : sans lui, l'API répond « introuvable » sur un fichier d'équipe. */
const PARTAGES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } as const;

export interface ElementDeplace {
  id: string;
  nom: string;
  /** Le parent APRÈS le geste : c'est lui qu'on consigne, et lui qu'on relit pour « Annuler ». */
  parentId: string;
  /** LOT RANGER-PJ-FIABLE — l'adresse à ouvrir, quand Google la rend. `null` n'est pas un échec. */
  lien?: string | null;
}

function motif(statut: number, quoi: string): string {
  if (statut === 403) return `Google refuse ${quoi} : droits insuffisants sur ce dossier.`;
  if (statut === 404) return `Google ne trouve plus l’élément visé pour ${quoi}.`;
  if (statut === 429 || statut >= 500) return `Google est momentanément indisponible pour ${quoi}. Réessayez.`;
  return `Google a refusé ${quoi} (code ${statut}).`;
}

/**
 * ══ 🔴 DÉPLACER — `files.update` AVEC `addParents` ET `removeParents`, ET RIEN D'AUTRE ═══════════════════════════
 *
 * 🔴 LE CORPS DE LA REQUÊTE EST VIDE (`{}`), et c'est capital : tout ce qui se déplace passe par les paramètres
 * d'URL. Mettre quoi que ce soit dans le corps — un `name`, un `trashed` — serait un RENOMMAGE ou une MISE À LA
 * CORBEILLE, c'est-à-dire précisément ce que cette application ne fait pas. Un test le vérifie.
 *
 * ⚠️ `removeParents` EST OBLIGATOIRE. Sans lui, Drive AJOUTE un parent au lieu de déplacer : le fichier se
 * retrouverait dans les deux dossiers à la fois, et l'on croirait l'avoir déplacé alors qu'on l'a dupliqué en
 * place. C'est le piège classique de cette API.
 */
export async function deplacerVers(
  accessToken: string,
  o: { id: string; parentOrigine: string; parentCible: string },
  deps: DepsGoogle,
): Promise<Resultat<ElementDeplace>> {
  const p = new URLSearchParams({
    addParents: o.parentCible,
    removeParents: o.parentOrigine,
    fields: 'id,name,parents',
    ...PARTAGES,
  });
  let res: Response;
  try {
    res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(o.id)}?${p}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (e) {
    return { ok: false, motif: `Le Drive n’a pas répondu : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, motif: motif(res.status, 'ce déplacement') };
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; parents?: string[] };
  return {
    ok: true,
    valeur: { id: j.id ?? o.id, nom: j.name ?? '', parentId: j.parents?.[0] ?? o.parentCible },
  };
}

/**
 * ══ 🔴 COPIER UN FICHIER — `files.copy` ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE NOM N'EST PAS IMPOSÉ. On laisse Google nommer la copie comme il le fait lui-même (le même nom) : c'est le
 * comportement de Drive, et c'est ce qu'Arno a demandé pour les doublons — « les deux sont conservés, jamais
 * d'écrasement ». Imposer un nom serait, techniquement, un renommage.
 */
export async function copierFichier(
  accessToken: string, o: { id: string; parentCible: string }, deps: DepsGoogle,
): Promise<Resultat<ElementDeplace>> {
  /**
   * ⚠️ `webViewLink` EST DEMANDÉ (lot RANGER-PJ-FIABLE). Une pièce dont les octets locaux ont été libérés se range
   * PAR CETTE COPIE : sans ce champ, l'écran affichait « ✓ Rangée dans X » sans le « · ouvrir » qu'il affiche pour
   * toutes les autres — le rangement avait l'air moins abouti qu'il ne l'était. Il ne coûte rien de plus.
   */
  const p = new URLSearchParams({ fields: 'id,name,parents,webViewLink', ...PARTAGES });
  let res: Response;
  try {
    res = await deps.fetch(`${API_FICHIERS}/${encodeURIComponent(o.id)}/copy?${p}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parents: [o.parentCible] }),
    });
  } catch (e) {
    return { ok: false, motif: `Le Drive n’a pas répondu : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, motif: motif(res.status, 'cette copie') };
  const j = (await res.json().catch(() => ({}))) as {
    id?: string; name?: string; parents?: string[]; webViewLink?: string;
  };
  if (typeof j.id !== 'string' || j.id === '') {
    return { ok: false, motif: 'Google n’a pas rendu l’identifiant de la copie.' };
  }
  return {
    ok: true,
    valeur: {
      id: j.id, nom: j.name ?? '', parentId: j.parents?.[0] ?? o.parentCible,
      lien: j.webViewLink ?? null,
    },
  };
}

/**
 * ══ 🔴 CRÉER LE DOSSIER D'ACCUEIL D'UNE COPIE RÉCURSIVE ═════════════════════════════════════════════════════════
 *
 * ⚠️ POURQUOI PAS `creerDossier` DE `driveEcriture` : celui-là passe par le garde-fou de la LISTE BLANCHE, qui
 * n'autorise que les dossiers que ce programme a lui-même créés. Une copie se fait dans un dossier du cabinet,
 * créé à la main il y a des années — le garde de la liste blanche refuserait tout, et l'assouplir LÀ-BAS
 * relâcherait aussi la création ordinaire. Ici, c'est le verdict de la ROUTE (chaîne des parents réelle, archive
 * interdite) qui protège, et lui seul.
 */
export async function creerDossierPourCopie(
  accessToken: string, o: { nom: string; parentCible: string }, deps: DepsGoogle,
): Promise<Resultat<ElementDeplace>> {
  const p = new URLSearchParams({ fields: 'id,name,parents', ...PARTAGES });
  let res: Response;
  try {
    res = await deps.fetch(`${API_FICHIERS}?${p}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: o.nom, mimeType: 'application/vnd.google-apps.folder', parents: [o.parentCible],
      }),
    });
  } catch (e) {
    return { ok: false, motif: `Le Drive n’a pas répondu : ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!res.ok) return { ok: false, motif: motif(res.status, 'la création du dossier de copie') };
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; parents?: string[] };
  if (typeof j.id !== 'string' || j.id === '') {
    return { ok: false, motif: 'Google n’a pas rendu l’identifiant du dossier créé.' };
  }
  return { ok: true, valeur: { id: j.id, nom: j.name ?? o.nom, parentId: o.parentCible } };
}
