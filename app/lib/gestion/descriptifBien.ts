/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — CE QUE LA PASTILLE « i » MONTRE D'UN BIEN. PUR. ═════════════════════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « une petite fenêtre flottante ancrée au bien, avec TOUT le descriptif connu du
 * bien : type, nature, étage, surface, nombre de pièces, annexes (parking, cave inclus), bâtiment ou escalier,
 * numéro de lot, immeuble, propriétaire(s), locataire en place, date d'entrée, en gestion depuis, dossier Drive,
 * et tout autre champ de la fiche bien. Un champ vide n'est pas affiché ; s'il ne reste presque rien, la fenêtre
 * l'indique (“descriptif à compléter dans la fiche du bien”). »
 *
 * ═══ 🔴🔴 CE QUE L'IMPORT WIPPIMMO PORTE RÉELLEMENT, MESURÉ LE 01/10/2026 ═══════════════════════════════════════
 *
 * `gestion_annuaire_lot` a EXACTEMENT ces colonnes descriptives : `nature`, `type_bien`, `immeuble`, `adresse`,
 * `code_postal`, `commune`, `gestion_debut`, `gestion_fin`. Il n'y a NI étage, NI surface, NI nombre de pièces,
 * NI annexes, NI escalier — ces champs n'existent nulle part dans la base, et aucune lecture ne peut les
 * inventer. Le reste du descriptif vient des tables voisines : propriétaires, occupations, dossier Drive.
 *
 * 🔴 C'EST EXACTEMENT POURQUOI LA RÈGLE « un champ vide n'est pas affiché » COMPTE ICI. Elle n'est pas une
 * politesse d'affichage : elle est ce qui permet d'écrire la liste COMPLÈTE qu'Arno demande sans mentir sur ce
 * que la base sait. Le jour où l'import portera l'étage, il suffira de l'ajouter à `LIGNES` — et il apparaîtra.
 *
 * ⚠️ AUCUNE E/S : l'appelant lit la fiche, ce module décide de ce qui s'affiche et dans quel ordre.
 */

/** Une ligne du descriptif : un libellé, une valeur. Jamais de valeur vide — c'est la règle du module. */
export interface LigneDescriptif {
  libelle: string;
  valeur: string;
}

/** Ce qu'on sait d'un bien. Tout est facultatif : on affiche ce qui est là, et rien d'autre. */
export interface BienDecrit {
  cle?: string | null;
  nature?: string | null;
  typeBien?: string | null;
  /** L'étage, la surface, le nombre de pièces, les annexes, l'escalier : ABSENTS de la base aujourd'hui. */
  etage?: string | null;
  surface?: string | null;
  pieces?: string | null;
  annexes?: string | null;
  escalier?: string | null;
  immeuble?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  commune?: string | null;
  gestionDebut?: string | null;
  gestionFin?: string | null;
  /** Les propriétaires, déjà nommés par l'appelant (l'annuaire sait les composer, pas nous). */
  proprietaires?: readonly string[] | null;
  /** Le ou les occupants EN PLACE, avec leur date d'entrée telle que la fiche la donne. */
  occupants?: readonly { nom: string; depuis?: string | null }[] | null;
  /** L'identifiant du dossier Drive du lot, quand l'arbre le connaît. */
  driveDossierId?: string | null;
}

const propre = (x: string | null | undefined): string => (x ?? '').trim();

/** Une date ISO écrite à la française, ou la chaîne telle quelle si elle n'en est pas une. PUR. */
function dateLisible(brut: string | null | undefined): string {
  const t = propre(brut);
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
  const [a, m, j] = t.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/**
 * ══ 🔴 L'ORDRE DES LIGNES, ET IL EST CELUI D'ARNO ═══════════════════════════════════════════════════════════════
 *
 * Il part de ce qui qualifie le bien (ce qu'il EST), passe à ce qui le situe (où il est, dans quel bâtiment),
 * puis à qui il appartient et qui l'occupe, et finit par l'administratif (gestion, dossier). C'est l'ordre dans
 * lequel on lit une fiche quand on cherche à reconnaître un bien, et c'est celui de sa demande.
 *
 * ⚠️ LE NUMÉRO DE LOT EST ICI, ET SEULEMENT ICI (avec la recherche). C'est la contrepartie exacte du titre, d'où
 * il vient d'être retiré : on ne le cache pas, on le range là où l'on va quand on veut l'identité du lot.
 */
export function descriptifDuBien(b: BienDecrit): LigneDescriptif[] {
  const out: LigneDescriptif[] = [];
  const ajouter = (libelle: string, valeur: string | null | undefined): void => {
    const v = propre(valeur);
    if (v !== '') out.push({ libelle, valeur: v });
  };

  // ① CE QUE LE BIEN EST.
  ajouter('Nature', b.nature);
  ajouter('Type', b.typeBien);
  ajouter('Nombre de pièces', b.pieces);
  ajouter('Surface', b.surface);
  ajouter('Annexes', b.annexes);
  // ② OÙ IL EST.
  ajouter('Adresse', adresseEntiere(b));
  ajouter('Étage', b.etage);
  ajouter('Escalier', b.escalier);
  // ⚠️ LE BÂTIMENT N'EST ÉCRIT QUE S'IL APPREND QUELQUE CHOSE : 283 lots sur 365 portent `immeuble` = `adresse`.
  if (!immeubleRepeteLAdresse(b)) ajouter('Bâtiment', b.immeuble);
  // ③ QUI.
  ajouter('Propriétaire', (b.proprietaires ?? []).map(propre).filter((x) => x !== '').join(', '));
  for (const o of b.occupants ?? []) {
    const nom = propre(o.nom);
    if (nom === '') continue;
    const depuis = dateLisible(o.depuis);
    ajouter('Locataire en place', depuis === '' ? nom : `${nom} — depuis le ${depuis}`);
  }
  // ④ L'ADMINISTRATIF.
  ajouter('N° de lot', b.cle);
  ajouter('En gestion depuis', dateLisible(b.gestionDebut));
  ajouter('Gestion terminée le', dateLisible(b.gestionFin));
  ajouter('Dossier Drive', propre(b.driveDossierId) === '' ? '' : 'ouvert dans le Drive');
  return out;
}

/** L'adresse complète, composée ici et nulle part ailleurs dans ce module. PUR. */
export function adresseEntiere(b: BienDecrit): string {
  const lieu = [propre(b.codePostal), propre(b.commune)].filter((x) => x !== '').join(' ');
  return [propre(b.adresse), lieu].filter((x) => x !== '').join(', ');
}

/** Le bâtiment répète-t-il l'adresse ? (C'est le cas le plus fréquent de l'import.) PUR. */
export function immeubleRepeteLAdresse(b: BienDecrit): boolean {
  const i = propre(b.immeuble).toLowerCase();
  const a = propre(b.adresse).toLowerCase();
  return i === '' || i === a || a.includes(i) || i.includes(a);
}

/**
 * 🔴 « S'IL NE RESTE PRESQUE RIEN, LA FENÊTRE L'INDIQUE » (Arno).
 *
 * « Presque rien » veut dire : au-delà de ce que le TITRE disait déjà. Nature, type et adresse sont dans le
 * titre — une fenêtre qui ne ferait que les répéter n'apprendrait rien, et laisserait croire que le bien est
 * décrit alors qu'il ne l'est pas. On compte donc ce qui AJOUTE quelque chose.
 */
export const LIGNES_DEJA_DANS_LE_TITRE: readonly string[] = ['Nature', 'Type', 'Adresse'];

/** La phrase écrite quand la fiche n'apprend rien de plus que le titre. Une seule formulation, un seul endroit. */
export const DESCRIPTIF_A_COMPLETER = 'Descriptif à compléter dans la fiche du bien.';

export function descriptifPauvre(lignes: readonly LigneDescriptif[]): boolean {
  return lignes.filter((l) => !LIGNES_DEJA_DANS_LE_TITRE.includes(l.libelle)).length === 0;
}
