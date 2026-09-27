/**
 * MODULE « GESTION » — LOT CLASSEMENT-1 : DÉPLACER UNE PIÈCE DANS SON DOSSIER. TRANSPORT INJECTÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE FICHIER N'A PAS ÉTÉ EXÉCUTÉ, ET IL NE DOIT PAS L'ÊTRE avant qu'Arno ait tranché les choix du rapport de
 * nuit du 27/09/2026. Il est livré ÉPROUVÉ SUR DOUBLES : `classementDrive.test.ts` lui passe un espion à la place de
 * `fetch`, et vérifie ce qu'il émet — aucun appel réel n'a eu lieu.
 *
 * ═══ 🔴🔴 QUATRE GARDES, ET AUCUN N'EST FRANCHISSABLE ═════════════════════════════════════════════════════════════
 *   ① « Documents clients scannés » EST INTERDIT, EN DUR. Aucune destination, aucun parent retiré, aucun élément visé
 *      ne peut s'y trouver ni porter son nom. Ce garde est le premier testé et il ne dépend de rien : ni de la base,
 *      ni du réseau, ni de l'arbre mémorisé. Même une base entièrement fausse ne peut pas l'ouvrir.
 *   ② SOUS LA RACINE — le parent visé doit descendre de « Base de données locative » (`verifierEcriture`).
 *   ③ LISTE BLANCHE — le parent visé doit être un dossier que LE PROGRAMME a créé (`verifierEcriture`).
 *   ④ NOS PROPRES COPIES — le fichier déplacé doit figurer dans l'ensemble des copies que le programme a faites
 *      (`gestion_piece_drive`, origine « copie »). Ce garde est né d'un test : voir `nosCopies` plus bas.
 * Les gardes ② et ③ ne sont pas réécrits ici : c'est `driveGardeFou.ts`, éprouvé exhaustivement depuis le lot
 * DRIVE-1, qui les rend. Deux implémentations d'un garde-fou finiraient par diverger, et c'est la plus laxiste qui
 * servirait.
 *
 * ═══ 🔴 CE QUE « DÉPLACER » VEUT DIRE POUR DRIVE, ET CE QUE ÇA N'EST PAS ══════════════════════════════════════════
 * Un déplacement Drive est un `PATCH files/{id}?addParents=…&removeParents=…`. Il ne DUPLIQUE rien, ne renomme rien,
 * ne modifie pas le contenu : le fichier est le même, vu d'un autre dossier. C'est important pour ce lot, parce que
 * l'application lit ces fichiers par leur IDENTIFIANT (lot DRIVE-3) : un déplacement ne casse donc AUCUN lien, et les
 * pièces dont le contenu a quitté MinIO restent servies exactement comme avant.
 *
 * ⚠️ ON RETIRE L'ANCIEN PARENT, et ce n'est pas une option. Sans `removeParents`, Drive ajoute le fichier au nouveau
 * dossier SANS le retirer de l'ancien : il apparaîtrait dans les deux, et « 00 Arrivée des mails » ne se viderait
 * jamais. On ne saurait plus ce qui reste à classer.
 *
 * 🔴 UN RACCOURCI N'EST PAS UNE COPIE. Quand une pièce concerne plusieurs biens, le fichier va dans le premier et les
 * autres reçoivent un raccourci (`application/vnd.google-apps.shortcut`). Copier créerait deux fichiers à faire
 * vivre : corrigé d'un côté, périmé de l'autre, et plus personne ne saurait lequel fait foi.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { PRODUCTION_INTERDITE } from './classement';
import { verifierEcriture, type IndexArbre } from './driveGardeFou';

const API = 'https://www.googleapis.com/drive/v3';

export interface DepsClassement { fetch: typeof fetch }

export type IssueDeplacement =
  | { ok: true; parentsAvant: readonly string[] }
  | { ok: false; motif: string; garde?: 'production' | 'hors_racine' | 'hors_liste_blanche' | 'autre' };

/**
 * ① 🔴🔴 LE GARDE DE LA PRODUCTION, ET IL EST LE PREMIER. PUR.
 *
 * Il refuse sur DEUX signaux, parce qu'ils n'attrapent pas la même faute :
 *   · un NOM qui contient « Documents clients scannés » ou l'un de ses trois sous-dossiers — attrape un chemin
 *     recopié à la main, une clé lue dans un écran de production, une variable mal nommée ;
 *   · un identifiant présent dans la liste des dossiers de production CONNUS — attrape le cas où le nom ne dit rien
 *     mais où l'identifiant, lui, vient bien de là.
 *
 * ⚠️ IL NE DÉPEND DE RIEN. Pas de base, pas de réseau, pas d'arbre. Une base abîmée, un arbre vide, une réponse Drive
 * mensongère : aucun de ces accidents ne peut l'ouvrir. C'est pour cela qu'il est séparé des deux autres.
 */
export const SOUS_DOSSIERS_PRODUCTION = ['1 actifs', '2 vendus', '3 perdus'] as const;

export function toucheLaProduction(
  quoi: { chemins?: readonly (string | null | undefined)[]; driveIds?: readonly (string | null | undefined)[] },
  productionConnue: ReadonlySet<string> = new Set(),
): string | null {
  const interdits = [PRODUCTION_INTERDITE.toLowerCase(), ...SOUS_DOSSIERS_PRODUCTION.map((s) => s.toLowerCase())];
  for (const c of quoi.chemins ?? []) {
    const t = (c ?? '').toLowerCase();
    if (t === '') continue;
    const mot = interdits.find((i) => t.includes(i));
    if (mot !== undefined) return `le chemin « ${c} » désigne la production (« ${mot} »)`;
  }
  for (const id of quoi.driveIds ?? []) {
    const i = (id ?? '').trim();
    if (i !== '' && productionConnue.has(i)) return `l’identifiant ${i} est un dossier de production connu`;
  }
  return null;
}

/**
 * DÉPLACE UN FICHIER DANS UN DOSSIER. Les trois gardes passent AVANT le moindre appel réseau.
 *
 * ⚠️ `parentsAvant` EST FOURNI PAR L'APPELANT, pas relu ici : c'est lui qui a lu les métadonnées (et qui a donc pu
 * vérifier que le fichier est bien le nôtre). Le demander ici obligerait ce module à lire, donc à pouvoir se tromper
 * sur ce qu'il lit.
 */
export async function deplacerDansDossier(
  o: {
    accessToken: string;
    driveFileId: string;
    /** Le dossier de destination — un identifiant de la liste blanche, jamais un chemin. */
    versDossierId: string;
    /** Les parents actuels, à retirer. Vide ⇒ on refuse : un déplacement sans origine connue n'est pas un déplacement. */
    parentsAvant: readonly string[];
    /** Chemins connus, pour le garde ① (celui du fichier, celui de la destination). */
    chemins?: readonly (string | null | undefined)[];
    productionConnue?: ReadonlySet<string>;
    /**
     * ④ 🔴 LES FICHIERS QUE NOUS AVONS NOUS-MÊMES COPIÉS — `gestion_piece_drive` avec `origine = 'copie'`.
     *
     * CE GARDE EST NÉ D'UN TEST, le 27/09/2026. La première version passait le fichier à déplacer comme
     * `cibleDriveId` de `verifierEcriture`, en croyant l'y faire vérifier. Or la liste blanche du lot DRIVE-1 ne
     * contient que des DOSSIERS créés par le programme : un fichier n'y figure jamais, et TOUT déplacement était
     * refusé. Le test l'a montré tout de suite.
     *
     * La leçon n'est pas « retirer la vérification » mais « la faire porter sur la bonne chose » : pour un
     * déplacement, ce qu'il faut garantir est que le FICHIER est l'un des nôtres. On l'exige donc explicitement, par
     * un ensemble fourni par l'appelant — jamais par la discipline de l'appelant.
     */
    nosCopies: ReadonlySet<string>;
  },
  index: IndexArbre,
  deps: DepsClassement,
): Promise<IssueDeplacement> {
  // ── ① LA PRODUCTION, AVANT TOUT ET SANS DÉPENDANCE ──
  const production = toucheLaProduction(
    { chemins: o.chemins, driveIds: [o.versDossierId, o.driveFileId, ...o.parentsAvant] },
    o.productionConnue,
  );
  if (production !== null) {
    return {
      ok: false, garde: 'production',
      motif: `Déplacement REFUSÉ : ${production}. « ${PRODUCTION_INTERDITE} » ne doit jamais être modifié.`,
    };
  }

  // ── ④ LE FICHIER EST-IL L'UN DES NÔTRES ? ──
  if (!o.nosCopies.has(o.driveFileId.trim())) {
    return {
      ok: false, garde: 'autre',
      motif: `Déplacement refusé : le fichier ${o.driveFileId} n’est pas une copie que ce programme a faite. On ne `
        + 'déplace que nos propres copies, enregistrées dans `gestion_piece_drive` avec l’origine « copie ».',
    };
  }

  if (o.parentsAvant.length === 0) {
    return {
      ok: false, garde: 'autre',
      motif: 'Déplacement refusé : les parents actuels du fichier ne sont pas connus. Sans eux, Drive ajouterait le '
        + 'fichier au nouveau dossier sans le retirer de l’ancien — il serait dans les deux.',
    };
  }

  /**
   * ── ② et ③ LE DOUBLE GARDE-FOU DU LOT DRIVE-1, réemployé tel quel ──
   *
   * ⚠️ ON NE LUI PASSE PAS `cibleDriveId`, ET C'EST VOULU. Sa liste blanche ne contient que les DOSSIERS que le
   * programme a créés ; un fichier copié n'y figure pas, et le lui donner ferait refuser tout déplacement (constaté
   * par un test avant toute exécution réelle). Ce que ce garde doit établir ici est que la DESTINATION est à nous —
   * que le fichier soit à nous est établi par le garde ④ ci-dessus, qui interroge la bonne table.
   */
  const verdict = verifierEcriture({ operation: 'modifier', parentDriveId: o.versDossierId }, index);
  if (!verdict.ok) return { ok: false, garde: verdict.garde === 'racine_existante' ? 'autre' : verdict.garde, motif: verdict.motif };

  const u = new URL(`${API}/files/${encodeURIComponent(o.driveFileId)}`);
  u.searchParams.set('addParents', o.versDossierId);
  u.searchParams.set('removeParents', o.parentsAvant.join(','));
  u.searchParams.set('supportsAllDrives', 'true');
  u.searchParams.set('fields', 'id,parents');

  let res: Response;
  try {
    res = await deps.fetch(u.toString(), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
      // Corps VIDE : tout est dans les paramètres. On ne touche ni au nom, ni au contenu, ni aux droits.
      body: '{}',
    });
  } catch {
    return { ok: false, motif: 'Drive n’a pas répondu (réseau). Le fichier n’a pas bougé.' };
  }
  if (!res.ok) {
    const texte = await res.text().catch(() => '');
    return { ok: false, motif: `Drive a refusé le déplacement (${res.status}) : ${texte.slice(0, 160)}` };
  }
  return { ok: true, parentsAvant: o.parentsAvant };
}

/**
 * POSE UN RACCOURCI vers un fichier dans un autre dossier. Mêmes trois gardes, même ordre.
 *
 * 🔴 UN RACCOURCI, ET JAMAIS UNE COPIE : voir l'encadré du fichier. C'est la réponse au cas « une pièce concerne deux
 * logements », et Arno doit la confirmer avant tout usage.
 */
export async function poserRaccourci(
  o: {
    accessToken: string;
    /** Le fichier visé — celui qui reste unique. */
    versFichierId: string;
    dansDossierId: string;
    nom: string;
    chemins?: readonly (string | null | undefined)[];
    productionConnue?: ReadonlySet<string>;
    /** ④ Le fichier visé doit être l'une de NOS copies — même garde que pour le déplacement, même raison. */
    nosCopies: ReadonlySet<string>;
  },
  index: IndexArbre,
  deps: DepsClassement,
): Promise<{ ok: true; raccourciId: string | null } | { ok: false; motif: string; garde?: string }> {
  const production = toucheLaProduction(
    { chemins: [...(o.chemins ?? []), o.nom], driveIds: [o.dansDossierId, o.versFichierId] }, o.productionConnue);
  if (production !== null) {
    return {
      ok: false, garde: 'production',
      motif: `Raccourci REFUSÉ : ${production}. « ${PRODUCTION_INTERDITE} » ne doit jamais être modifié.`,
    };
  }
  if (!o.nosCopies.has(o.versFichierId.trim())) {
    return {
      ok: false, garde: 'autre',
      motif: `Raccourci refusé : le fichier ${o.versFichierId} n’est pas une copie que ce programme a faite.`,
    };
  }
  const verdict = verifierEcriture(
    { operation: 'creer_raccourci', parentDriveId: o.dansDossierId }, index);
  if (!verdict.ok) return { ok: false, garde: verdict.garde, motif: verdict.motif };

  let res: Response;
  try {
    res = await deps.fetch(`${API}/files?supportsAllDrives=true&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${o.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: o.nom,
        mimeType: 'application/vnd.google-apps.shortcut',
        parents: [o.dansDossierId],
        shortcutDetails: { targetId: o.versFichierId },
      }),
    });
  } catch {
    return { ok: false, motif: 'Drive n’a pas répondu (réseau). Aucun raccourci n’a été créé.' };
  }
  if (!res.ok) {
    const texte = await res.text().catch(() => '');
    return { ok: false, motif: `Drive a refusé le raccourci (${res.status}) : ${texte.slice(0, 160)}` };
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, raccourciId: j.id ?? null };
}
