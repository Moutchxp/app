import { MIME_DOSSIER, echapperQ, motifHttp } from './drive';
import type { DepsGoogle, Resultat } from './google';

/**
 * MODULE « GESTION » — LOT DRIVE-VISUALISER-ET-DOSSIERS : CRÉER UN DOSSIER DANS LE DRIVE DU CABINET.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE FICHIER EST LA SEULE ÉCRITURE DRIVE DE L'ÉDITEUR DE MAIL, ET IL NE SAIT FAIRE QU'UNE CHOSE : `files.create`
 * avec `mimeType = dossier`. Un seul verbe d'écriture dans tout le module, un seul POST, une seule fonction.
 *
 * 🔴 CE QUI N'EST PAS ÉCRIT ICI, ET QUI NE DOIT PAS L'ÊTRE : renommer (`files.update`), déplacer (`addParents` /
 * `removeParents`), supprimer (`files.delete`), mettre à la corbeille (`trashed: true`), partager
 * (`permissions.create`), copier (`files.copy`). AUCUNE fonction de suppression n'est écrite, MÊME « pour annuler »
 * une création qu'on regretterait — exigence d'Arno, mot pour mot. Ce qui n'existe pas ne s'appelle pas par erreur,
 * et ne s'ajoute pas « en deux lignes » un soir de correctif : `driveCreation.test.ts` compte les verbes HTTP de ce
 * fichier et échoue si un second apparaît.
 *
 * 🔴 CE MODULE NE DÉCIDE RIEN. Il ne sait pas où est « Documents clients scannés », il ne juge aucun nom, il ne
 * cherche aucun doublon. La règle vit dans `driveLectureFichier.peutCreerDossier` (pure), le nom et le doublon dans
 * `dossierNouveau` (pur), et la ROUTE les interroge tous avant d'arriver ici. Mélanger la règle et l'appel réseau
 * rendrait la règle invérifiable sans Google — c'est la même séparation que pour `lireContenuFichier`.
 *
 * 🔒 `fetch` est INJECTÉ : tout s'éprouve sans réseau, comme partout dans ce module.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const API_FICHIERS = 'https://www.googleapis.com/drive/v3/files';

/** Les paramètres sans lesquels un dossier d'un Drive PARTAGÉ est invisible — et une création dedans, refusée en 404. */
const PARTAGES = { supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' } as const;

export interface DossierCree {
  id: string;
  nom: string;
  /** L'adresse à ouvrir dans un navigateur. `null` si Google ne la rend pas — ce n'est pas un échec. */
  lien: string | null;
}

/**
 * ══ 🔴🔴 CRÉER UN DOSSIER. LA SEULE ÉCRITURE. ════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE NE VÉRIFIE NI LE NOM NI L'EMPLACEMENT : l'appelant l'a fait, et un test de la route le prouve. Si l'on
 * ajoutait ici une vérification « de plus », il y aurait deux règles à maintenir, donc un jour deux règles
 * différentes — et c'est toujours celle qu'on relit le moins qui garde l'ancienne.
 *
 * ⚠️ AUCUN RÉESSAI. Une création qu'on rejouerait après une réponse perdue créerait DEUX dossiers du même nom, ce
 * que ce lot interdit précisément. Un échec est rendu tel quel : on le dit, et c'est l'humain qui recommence, en
 * voyant d'abord si le dossier est là.
 */
export async function creerDossier(
  accessToken: string, o: { parentId: string; nom: string }, deps: DepsGoogle,
): Promise<Resultat<DossierCree>> {
  const p = new URLSearchParams({ fields: 'id,name,webViewLink', ...PARTAGES });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: o.nom, mimeType: MIME_DOSSIER, parents: [o.parentId] }),
  });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la création du dossier') };
  const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; webViewLink?: string };
  const id = (j.id ?? '').trim();
  if (id === '') return { ok: false, motif: 'Google n’a pas rendu d’identifiant pour ce dossier.' };
  return { ok: true, valeur: { id, nom: (j.name ?? o.nom).trim(), lien: j.webViewLink ?? null } };
}

/**
 * ══ LES HOMONYMES D'UN NOM DANS UN DOSSIER. LECTURE SEULE (`files.list`). ═════════════════════════════════════════
 *
 * 🔴 POURQUOI UNE REQUÊTE DÉDIÉE plutôt que de relire la liste déjà affichée à l'écran. Parce que la liste affichée
 * est bornée (200 entrées) et qu'un dossier de gestion en contient davantage : le doublon serait alors « pas vu,
 * donc pas là ». Ici on demande LE NOM à Google, qui répond sur tout le dossier.
 *
 * ⚠️ `name = '…'` est SENSIBLE À LA CASSE ET AUX ACCENTS chez Google. On demande donc aussi les voisins par
 * `name contains`, et c'est `dossierNouveau.homonymeParmi` — pur, normalisé — qui tranche. Se fier au `=` de Google
 * laisserait passer « Travaux » à côté de « travaux ».
 */
export async function voisinsDuNom(
  accessToken: string, o: { parentId: string; nom: string }, deps: DepsGoogle,
): Promise<Resultat<{ id: string; nom: string; dossier: boolean }[]>> {
  const p = new URLSearchParams({
    q: `'${echapperQ(o.parentId)}' in parents and trashed = false and name contains '${echapperQ(o.nom)}'`,
    fields: 'files(id,name,mimeType)',
    pageSize: '100',
    orderBy: 'name',
    ...PARTAGES,
  });
  const res = await deps.fetch(`${API_FICHIERS}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { ok: false, motif: motifHttp(res.status, 'la vérification du nom dans ce dossier') };
  const j = (await res.json().catch(() => ({}))) as { files?: { id?: string; name?: string; mimeType?: string }[] };
  return {
    ok: true,
    valeur: (j.files ?? [])
      .filter((f) => typeof f.id === 'string' && f.id !== '')
      .map((f) => ({ id: f.id as string, nom: (f.name ?? '').trim(), dossier: f.mimeType === MIME_DOSSIER })),
  };
}
