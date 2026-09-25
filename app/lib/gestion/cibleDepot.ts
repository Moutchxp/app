/**
 * MODULE « GESTION » — LOT 5-PJ-D : UNE CIBLE DE DÉPÔT EST-ELLE UN VRAI DOSSIER ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE DÉFAUT CONSTATÉ À L'ÉCRAN PAR ARNO LE 25/09/2026. À la racine du sélecteur, « Drives partagés » et « Partagés
 * avec moi » portaient un bouton « Déposer ici ». Ce sont des REGROUPEMENTS — deux mots à nous, `svav:drives` et
 * `svav:partages`, qui n'existent pas chez Google — et non des dossiers : un dépôt sur l'un des deux ne pouvait
 * qu'échouer, après le téléversement complet du fichier. Le bouton est retiré de ces DEUX entrées, et de celles-là
 * seulement (retrait validé par Arno) : « Mon Drive », chaque Drive partagé et chaque dossier gardent le leur.
 *
 * 🔴 ET LE SERVEUR REFUSE, LUI AUSSI. Retirer un bouton met l'écran d'accord avec la réalité ; ça ne protège de rien.
 * Une requête forgée, un vieil onglet, une capture rejouée arriveraient encore avec `svav:drives` dans le corps. La
 * règle est donc tenue ICI, à l'endroit qui décide, et pas seulement là où l'on clique.
 *
 * CE QUI EST UNE CIBLE VALABLE, ET C'EST TOUT :
 *   · `root` — la racine de « Mon Drive » de la personne. Google l'accepte comme parent, sans rien demander ;
 *   · un vrai DOSSIER (`mimeType` = dossier), pas à la corbeille ;
 *   · la RACINE d'un vrai Drive partagé — qui est, pour l'API, un dossier comme un autre (son identifiant est celui
 *     du Drive). Aucun cas particulier à écrire : la même vérification la couvre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MODULE PUR : la lecture du dossier est INJECTÉE. Les regroupements, eux, sont refusés SANS aucun appel à Google —
 * on ne demande pas à Google de trancher une question dont on connaît déjà la réponse.
 */
import { MIME_DOSSIER, type LecteurDossier } from './drive';

/** La racine de « Mon Drive ». Mot de Google, celui-là : l'API l'accepte tel quel comme identifiant de parent. */
export const RACINE_MON_DRIVE = 'root';
/** Les deux REGROUPEMENTS de la racine du sélecteur. Mots à NOUS : ils ne désignent aucun dossier chez Google. */
export const RACINE_DRIVES_PARTAGES = 'svav:drives';
export const RACINE_PARTAGES_AVEC_MOI = 'svav:partages';

/** Le libellé affiché pour chaque regroupement — et le mot employé dans le refus, pour que l'un explique l'autre. */
const LIBELLE_REGROUPEMENT: Record<string, string> = {
  [RACINE_DRIVES_PARTAGES]: 'Drives partagés',
  [RACINE_PARTAGES_AVEC_MOI]: 'Partagés avec moi',
};

/** Vrai pour les deux entrées qui ne sont PAS des dossiers. PUR. */
export function estRegroupement(dossierId: string): boolean {
  return dossierId in LIBELLE_REGROUPEMENT;
}

/**
 * Le refus d'un regroupement, en toutes lettres — ou `null` si ce n'en est pas un. PUR, et SANS réseau : c'est ce qui
 * permet à la route de trancher avant même d'avoir un jeton.
 */
export function refusRegroupement(dossierId: string): string | null {
  const nom = LIBELLE_REGROUPEMENT[dossierId];
  if (nom === undefined) return null;
  return `« ${nom} » n’est pas un dossier, c’est un regroupement : ouvrez-le et choisissez un dossier à l’intérieur.`;
}

export type VerdictCible = { ok: true } | { ok: false; motif: string };

/**
 * LA CIBLE EST-ELLE DÉPOSABLE ? Un seul endroit décide, pour les deux routes de dépôt (une pièce, tout un message) :
 * deux vérifications jumelles divergeraient à la première correction, et c'est toujours celle qu'on relit le moins
 * qui garderait l'ancienne règle.
 */
export async function verifierCibleDepot(dossierId: string, lire: LecteurDossier): Promise<VerdictCible> {
  const cible = dossierId.trim();
  if (cible === '') return { ok: false, motif: 'Aucun dossier choisi.' };

  const regroupement = refusRegroupement(cible);
  if (regroupement !== null) return { ok: false, motif: regroupement };

  // « Mon Drive » n'a pas de fiche à lire : `root` est un alias que l'API résout elle-même.
  if (cible === RACINE_MON_DRIVE) return { ok: true };

  const d = await lire(cible);
  if (!d.ok) return { ok: false, motif: d.motif };
  if (d.valeur.corbeille) {
    return { ok: false, motif: 'Ce dossier est à la corbeille du Drive : déposer dedans reviendrait à jeter le document.' };
  }
  if (d.valeur.mimeType !== MIME_DOSSIER) {
    return { ok: false, motif: 'La destination choisie n’est pas un dossier du Drive.' };
  }
  return { ok: true };
}
