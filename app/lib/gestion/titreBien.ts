/**
 * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE D'UN BIEN : L'ADRESSE ET LE TYPE, PLUS LE NUMÉRO. PUR. ════════
 *
 * DEMANDE D'ARNO (01/10/2026) : « Partout dans la modale, et dans la ligne “BIEN(S) RATTACHÉ(S)” ainsi que dans
 * le “voir plus”, le titre d'un bien devient “adresse — Type de bien”, par exemple “10 rue Chateaubriand,
 * CHATILLON — Appartement meublé · Type 2” et “10 rue Chateaubriand, CHATILLON — Parking”. Le numéro de lot
 * n'apparaît plus dans le titre. Il reste seulement dans la fenêtre d'information, et la recherche par numéro de
 * lot fonctionne toujours. »
 *
 * ═══ 🔴 POURQUOI LE NUMÉRO DE LOT PART ══════════════════════════════════════════════════════════════════════════
 *
 * « lot 432 » est une clé d'import. Elle désigne le bien pour la MACHINE — c'est la cible de rattachement, celle
 * qui survit à un ré-import — mais elle ne dit rien à qui lit un mail. Entre « 10 rue Chateaubriand — lot 397 »
 * et « 10 rue Chateaubriand — Parking », seule la seconde apprend quelque chose. Le numéro n'est pas supprimé :
 * il descend dans la fenêtre d'information, où l'on va précisément quand on veut l'identité exacte du lot.
 *
 * ═══ 🔴🔴 POURQUOI « Parking » SEUL, ET « Appartement meublé · Type 2 » À DEUX ═══════════════════════════════════
 *
 * Ce sont les deux exemples d'Arno, et ils ne se contredisent pas — ils disent la règle. L'import porte DEUX
 * champs : `nature` (« Appartement », « Parking », « Box ») et `type_bien` (« Studio », « Type 2 », « Garage »).
 *   · POUR UN LOGEMENT, le type dit la TAILLE, c'est-à-dire ce qu'on veut savoir après l'adresse ;
 *   · POUR UN PARKING OU UNE CAVE, le type ne dit que la forme (« Garage » d'un « Parking ») : il répète la
 *     nature sans rien apprendre, et « Parking · Garage » se lit comme une hésitation.
 * On s'appuie donc sur la CATÉGORIE (module `categorieBien`), déjà la règle du résumé de la case verte. Deux
 * décisions tirées du même fait, jamais deux lectures parallèles des mêmes champs.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE E/S : c'est une décision d'affichage, elle doit s'éprouver sur une table de cas.
 * ⚠️ `categorieDuBien` EST RECOPIÉE ICI EN MINIATURE — non : elle est IMPORTÉE (voir plus bas). Ce module n'est
 * pas « sans import » au sens de `redaction.ts` ; il est sans E/S, ce qui est la propriété qui compte.
 */
import { categorieDuBien } from './categorieBien';

/** Ce qu'il faut savoir d'un lot pour le titrer. Volontairement minimal : ce module ne connaît pas la base. */
export interface BienATitrer {
  /** La clé WIPPIMMO — JAMAIS affichée dans le titre, mais c'est elle qui identifie le bien. */
  cle?: string | null;
  /** « 10 rue Chateaubriand, CHATILLON » ou « 10 rue Chateaubriand » : l'appelant compose, on n'invente pas. */
  adresse?: string | null;
  nature?: string | null;
  typeBien?: string | null;
  /** L'immeuble ou le bâtiment, quand l'import le porte. Sert à DÉPARTAGER deux biens identiques. */
  immeuble?: string | null;
}

const vide = (x: string | null | undefined): boolean => (x ?? '').trim() === '';
const propre = (x: string | null | undefined): string => (x ?? '').trim();

/**
 * LA QUALITÉ D'UN BIEN : « Appartement meublé · Type 2 », « Parking », « Studio ». PUR.
 *
 * ⚠️ ELLE PEUT ÊTRE VIDE. Un lot sans nature ni type (« A renseigner » sans type, 1 lot en base le 01/10/2026)
 * n'a rien à dire de plus que son adresse — et une qualité inventée serait pire qu'une qualité absente.
 */
export function qualiteDuBien(b: BienATitrer): string {
  const nature = propre(b.nature);
  const type = propre(b.typeBien);
  // 🔴 PARKING ET CAVE : la nature suffit, le type ne fait que la répéter (voir l'encadré du module).
  if (categorieDuBien(b) !== 'logement') return nature !== '' ? nature : type;
  if (nature === '') return type;
  if (type === '') return nature;
  // ⚠️ ET JAMAIS DEUX FOIS LE MÊME MOT : « Studio · Studio » arrive dès qu'un import remplit les deux pareil.
  if (nature.toLowerCase() === type.toLowerCase()) return nature;
  return `${nature} · ${type}`;
}

/**
 * LE TITRE D'UN BIEN : « adresse — qualité ». PUR.
 *
 * ⚠️ SANS ADRESSE, LA QUALITÉ SUFFIT — et si les deux manquent, on rend la clé plutôt qu'une chaîne vide : un
 * titre blanc dans une liste à cocher est une ligne qu'on ne peut ni lire ni désigner.
 */
export function titreDuBien(b: BienATitrer): string {
  const adresse = propre(b.adresse);
  const qualite = qualiteDuBien(b);
  if (adresse === '' && qualite === '') return propre(b.cle) === '' ? '' : `Lot ${propre(b.cle)}`;
  if (adresse === '') return qualite;
  return qualite === '' ? adresse : `${adresse} — ${qualite}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 DEUX BIENS QUI SE RESSEMBLENT : COMMENT ON LES DÉPARTAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Deux biens de même adresse et même type : départager par l'étage ou la mention utile la plus
   courte (“2e étage”, “bât. B”), jamais par le numéro de lot seul. »

   🔴 CE QUE LA BASE PORTE RÉELLEMENT, mesuré le 01/10/2026 : `gestion_annuaire_lot` n'a NI colonne d'étage, NI
   surface, NI nombre de pièces. La seule mention utile disponible est `immeuble` — le bâtiment. C'est donc elle
   qu'on emploie, et elle n'est écrite QUE lorsqu'elle départage : l'ajouter partout rallongerait tous les titres
   pour résoudre un cas rare.

   🔴 LE NUMÉRO DE LOT RESTE LE DERNIER RECOURS, ET SEULEMENT LUI. Arno écrit « jamais par le numéro de lot
   SEUL » : deux titres rigoureusement identiques dans une liste à cocher sont pires que le numéro qu'on voulait
   cacher — on ne saurait plus laquelle des deux cases on coche. On ne l'emploie donc que lorsque rien d'autre ne
   distingue les deux biens, et il est alors le signe que la fiche est à compléter. */

/** Un bien, et le titre qu'on lui donne finalement. */
export interface BienTitre {
  cle: string;
  titre: string;
}

export function titresDistincts(biens: readonly (BienATitrer & { cle: string })[]): BienTitre[] {
  const bruts = biens.map((b) => ({ b, titre: titreDuBien(b) }));
  const combien = new Map<string, number>();
  for (const x of bruts) combien.set(x.titre, (combien.get(x.titre) ?? 0) + 1);

  return bruts.map(({ b, titre }) => {
    if ((combien.get(titre) ?? 0) < 2) return { cle: b.cle, titre };
    // ① LA MENTION UTILE LA PLUS COURTE : le bâtiment, quand il n'est pas déjà l'adresse elle-même.
    const immeuble = propre(b.immeuble);
    const memeQueAdresse = immeuble.toLowerCase() === propre(b.adresse).toLowerCase()
      || propre(b.adresse).toLowerCase().includes(immeuble.toLowerCase());
    if (immeuble !== '' && !memeQueAdresse) return { cle: b.cle, titre: `${titre} · ${immeuble}` };
    // ② DERNIER RECOURS : le numéro. Deux titres identiques seraient pires (voir l'encadré ci-dessus).
    return { cle: b.cle, titre: `${titre} · lot ${b.cle}` };
  });
}

/**
 * LE TITRE D'UN BIEN PARMI D'AUTRES. PUR.
 *
 * Raccourci pour les écrans qui titrent une ligne à la fois mais connaissent la liste entière — c'est le cas de
 * toutes les listes à cocher de la modale.
 */
export function titreParmi(
  biens: readonly (BienATitrer & { cle: string })[], cle: string,
): string {
  return titresDistincts(biens).find((x) => x.cle === cle)?.titre ?? '';
}

/** Vrai quand ce texte ne porte plus aucun numéro de lot — ce que ce lot promet des titres. PUR. */
export function sansNumeroDeLot(titre: string): boolean {
  return !/\blot\s+\S/i.test(titre);
}
