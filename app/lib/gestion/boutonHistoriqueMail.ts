/**
 * ══ 🔴🔴 LOT BOUTON-HISTORIQUE-SUR-LES-MAILS-RATTACHES — CE QUE MONTRE LE BOUTON « Historique », ET OÙ IL MÈNE. PUR ══
 *
 * DEMANDE D'ARNO (13/10/2026) : sur un mail déplié qui porte le gros bouton VERT « Rattaché · N logement(s) », un bouton
 * « Historique » au-dessus de lui ouvre la fiche historique du bien. Un seul bien ⇒ la fiche directement ; plusieurs ⇒
 * une liste, un bien par ligne. Jamais sur un mail « À classer », jamais sur un mail Interne sans bien. Ouvert depuis
 * l'historique d'un bien, il ne propose QUE les autres biens, et disparaît si ce bien était le seul.
 *
 * 🔴 LA RÈGLE DE PRÉSENCE EST CELLE DU BOUTON VERT, mot pour mot : un lien CONFIRMÉ vers un LOT (`etatClassement` rend
 * « rattaché » dès qu'une cible `lot` existe ; l'encart ne lui passe que les liens confirmés). Deux règles différentes
 * finiraient par montrer « Historique » sous un bouton rouge.
 */

/** Ce que le bouton lit d'un lien de rattachement (la forme de `LienAffiche`, réduite à ce qui sert ici). */
export interface LienPourHistorique {
  statut: string;
  cible: { sorte: string; cle: string | null };
  libelle: string;
  bien?: { adresse: string | null; commune: string | null } | null;
}

/** Un bien que le bouton propose : sa clé WIPPIMMO (celle de `fiche=bien-<n>`) et son adresse. */
export interface BienHistorique {
  cle: string;
  adresse: string;
}

export const MOT_HISTORIQUE = 'Historique';

/** L'adresse d'un bien : « 70ter rue de la République, PUTEAUX », ou le libellé figé quand l'annuaire ne dit rien. */
function adresseDuLien(l: LienPourHistorique): string {
  const a = [l.bien?.adresse ?? '', l.bien?.commune ?? ''].map((x) => x.trim()).filter((x) => x !== '').join(', ');
  return a !== '' ? a : l.libelle;
}

/**
 * LES BIENS DU BOUTON, dans l'ordre des liens, sans doublon (un lien « cette pièce seulement » et un lien du mail entier
 * vers le même lot sont UN bien). `bienCourant` = la clé du bien dont on regarde l'historique : il est retiré. PUR.
 * Liste vide ⇒ pas de bouton.
 */
export function biensDuBoutonHistorique(
  liens: readonly LienPourHistorique[] | null | undefined,
  bienCourant: string | null = null,
): BienHistorique[] {
  const vus = new Set<string>();
  const biens: BienHistorique[] = [];
  for (const l of liens ?? []) {
    if (l.statut !== 'confirme' || l.cible.sorte !== 'lot' || l.cible.cle === null) continue;
    const cle = l.cible.cle;
    if (vus.has(cle)) continue;
    vus.add(cle);
    if (bienCourant !== null && cle === bienCourant) continue;
    biens.push({ cle, adresse: adresseDuLien(l) });
  }
  return biens;
}

/** Le sous-libellé discret : l'adresse du bien s'il n'y en a qu'un, « N biens » sinon. PUR. */
export function sousLibelleHistorique(biens: readonly BienHistorique[]): string {
  return biens.length === 1 ? biens[0].adresse : `${biens.length} biens`;
}

/** Un clic : la fiche directement (un bien), ou la liste de choix (plusieurs). PUR. */
export function gesteHistorique(biens: readonly BienHistorique[]): 'aucun' | 'direct' | 'liste' {
  if (biens.length === 0) return 'aucun';
  return biens.length === 1 ? 'direct' : 'liste';
}

/**
 * L'adresse de la fiche historique d'un bien : `?ecran=annuaire&fiche=bien-<clé>&bloc=vie` — `bloc=vie` pose la page sur
 * l'historique (« Vie du bien »), en haut. `null` si la clé n'est pas un numéro de lot. PUR.
 * ⚠️ PAS DE CENTRAGE SUR LE MAIL : l'adresse n'a aucune entrée pour viser un mail de l'historique (le jeton `hdb` porte
 * un état de RETOUR complet — réglages, page, défilement — qu'on ne peut pas fabriquer sans le deviner).
 */
export function ficheHistoriqueDuBien(cle: string): { sorte: 'bien'; id: number } | null {
  const n = Number(cle);
  return /^\d+$/.test(cle.trim()) && Number.isSafeInteger(n) && n > 0 ? { sorte: 'bien', id: n } : null;
}
