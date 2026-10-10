/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 1 — LES PASTILLES SOUS L'ADRESSE D'UN BIEN ══════════════════
 *
 * ARNO : « Les pastilles sous l'adresse, dans cet ordre : ① type de bien (Appartement, Studio, Maison, Parking,
 * Cave… — libellé actuel conservé, “Appartement meublé” reste tel quel) ② nombre de pièces “1 pièce”, “2 pièces”…
 * (déduit de “Type N” s'il existe ; JAMAIS pour parking, cave, box ou autre annexe) ③ surface “63 m²” ④ étage
 * “Étage -2”, “Rdc”, “1er étage”, “2e étage”…, “Dernier étage”. Le n° de lot reste en première pastille. Une
 * pastille dont l'information est inconnue n'apparaît pas (aucune valeur inventée). »
 *
 * Module PUR et client-safe : les trois endroits qui montrent un bien (carte de la fiche propriétaire, carte de la
 * fiche locataire, en-tête de la fiche du bien) le lisent, et ne peuvent donc pas diverger.
 *
 * ⚠️ CE QUE DEVIENT LA PASTILLE « Type 2 » : elle se lit désormais « 2 pièces » — c'est la même information, dans
 * le mot demandé. Les autres libellés du champ (`Studio`, `Garage`) ne disent pas un nombre de pièces : ils restent
 * tels quels, à leur place, dans le groupe ① « type de bien ». « Studio » ne devient PAS « 1 pièce » : Arno
 * demande de déduire le nombre de « Type N » seulement, et rien d'autre.
 *
 * ⚠️ SURFACE ET ÉTAGE N'ONT AUJOURD'HUI AUCUNE SOURCE (mesuré le 10/10/2026 : aucune colonne dans l'export
 * WIPPIMMO ni en base). Leurs pastilles sont prêtes et ne s'affichent donc jamais — c'est la règle ②.
 */

export interface DonneesPastilles {
  nature: string | null;
  typeBien: string | null;
  surfaceM2?: number | null;
  /** L'étage : négatif en sous-sol, 0 = rez-de-chaussée. */
  etage?: number | null;
  /** Vrai quand le bien est au dernier étage : la pastille le dit, à la place du numéro. */
  dernierEtage?: boolean | null;
}

/** « Type 2 », « type 3 », « T4 » → 2, 3, 4. Autre chose → `null`. PUR. */
export function piecesDeType(typeBien: string | null | undefined): number | null {
  const m = /^\s*(?:type|t)\s*(\d{1,2})\s*$/i.exec(typeBien ?? '');
  if (m === null) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/** Une annexe ne compte pas de pièces : parking, cave, box, garage, cellier, annexe. PUR. */
export function estAnnexe(d: Pick<DonneesPastilles, 'nature' | 'typeBien'>): boolean {
  const re = /parking|cave|box|garage|cellier|annexe|stationnement/i;
  return re.test(d.nature ?? '') || re.test(d.typeBien ?? '');
}

/** « 1 pièce », « 2 pièces ». PUR. */
export function motPieces(n: number): string {
  return n === 1 ? '1 pièce' : `${n} pièces`;
}

/** « 63 m² », « 63,5 m² » — la valeur exacte, jamais arrondie. PUR. */
export function motSurface(m2: number): string {
  return `${String(m2).replace('.', ',')} m²`;
}

/** « Étage -2 », « Rdc », « 1er étage », « 2e étage », « Dernier étage ». PUR. */
export function motEtage(etage: number | null | undefined, dernier?: boolean | null): string | null {
  if (dernier === true) return 'Dernier étage';
  if (etage === null || etage === undefined || !Number.isInteger(etage)) return null;
  if (etage < 0) return `Étage ${etage}`;
  if (etage === 0) return 'Rdc';
  if (etage === 1) return '1er étage';
  return `${etage}e étage`;
}

/**
 * LES PASTILLES APRÈS « lot N », DANS L'ORDRE DEMANDÉ. Une information inconnue ne donne aucune pastille. PUR.
 */
export function pastillesBien(d: DonneesPastilles): string[] {
  const out: string[] = [];
  const nature = (d.nature ?? '').trim();
  const type = (d.typeBien ?? '').trim();
  const pieces = piecesDeType(type);
  // ① le type de bien : les libellés actuels, tels quels. « Type N » n'en est pas un — il passe en ②.
  if (nature !== '') out.push(nature);
  //   ⚠️ Une annexe qui porterait un « Type N » le garde tel quel : on ne lui compte pas de pièces, mais on ne
  //   fait pas disparaître pour autant le libellé qu'elle avait.
  if (type !== '' && (pieces === null || estAnnexe(d))) out.push(type);
  // ② les pièces, jamais pour une annexe.
  if (pieces !== null && !estAnnexe(d)) out.push(motPieces(pieces));
  // ③ la surface, seulement si elle est connue et positive.
  if (typeof d.surfaceM2 === 'number' && Number.isFinite(d.surfaceM2) && d.surfaceM2 > 0) out.push(motSurface(d.surfaceM2));
  // ④ l'étage.
  const etage = motEtage(d.etage, d.dernierEtage);
  if (etage !== null) out.push(etage);
  return out;
}
