/**
 * Agrégation DÉTERMINISTE de l'état d'avancement d'un dossier Sitadel à partir de TOUTES ses lignes (chantier S12b).
 * PURE, testable hors base. Résout le « plusieurs lignes, plusieurs ETAT_DAU » : un même NUM_DAU peut porter plusieurs
 * lignes (logements/locaux, tranches…) d'états divergents. L'ancien code écrivait le DERNIER état lu → dépendant de
 * l'ordre, donc un hasard, pas une règle.
 *
 * RÈGLE :
 *  - ANNULÉ (4) retenu UNIQUEMENT si TOUTES les lignes portent 4. ⚠️ MOTIF : une annulation PARTIELLE ne tue pas le
 *    programme ; le coût d'une exclusion À TORT (immeuble manqué) est plus élevé que celui d'une demande à tort (courrier
 *    de trop). On ne se prive donc jamais d'un dossier sur une seule ligne annulée.
 *  - sinon, état = le PLUS AVANCÉ parmi les lignes NON annulées (6 > 5 > 2 ; codes inattendus classés en dernier).
 *  - date_doc = la plus ANCIENNE date d'ouverture non nulle (le chantier a commencé à ce moment-là).
 *  - date_daact = la plus RÉCENTE date d'achèvement non nulle (le programme est fini quand la dernière tranche l'est).
 *  - ambigu = les lignes ne s'accordaient pas (≥ 2 états distincts). Informatif, N'EXCLUT PAS.
 * Aucun « dernier lu gagne » ne subsiste : l'ordre des lignes n'a aucun effet sur le résultat.
 */

export interface LigneEtat { etat: string | null; dateDoc: string | null; dateDaact: string | null }
export interface EtatAgrege { etatDau: string | null; dateDoc: string | null; dateDaact: string | null; ambigu: boolean }

/** Accumulateur incrémental (pour l'ingestion en flux) — équivalent à collecter toutes les `LigneEtat` d'un dossier. */
export interface AccumEtat { etats: Set<string>; dateDocMin: string | null; dateDaactMax: string | null }

export function accumInit(): AccumEtat {
  return { etats: new Set<string>(), dateDocMin: null, dateDaactMax: null };
}

/** Intègre une ligne. États vides ignorés ; dates comparées en ISO 'AAAA-MM-JJ' (ordre lexical = chronologique). */
export function accumAjouter(a: AccumEtat, etat: string | null, dateDoc: string | null, dateDaact: string | null): void {
  if (etat !== null && etat.trim() !== '') a.etats.add(etat.trim());
  const dd = (dateDoc ?? '').trim();
  if (dd !== '' && (a.dateDocMin === null || dd < a.dateDocMin)) a.dateDocMin = dd;
  const da = (dateDaact ?? '').trim();
  if (da !== '' && (a.dateDaactMax === null || da > a.dateDaactMax)) a.dateDaactMax = da;
}

const RANG: Record<string, number> = { '2': 1, '5': 2, '6': 3 };

/** Calcule l'agrégat final depuis un accumulateur. */
export function agreger(a: AccumEtat): EtatAgrege {
  const etats = [...a.etats];
  let etatDau: string | null;
  if (etats.length === 0) {
    etatDau = null;
  } else if (etats.every((e) => e === '4')) {
    etatDau = '4'; // annulé SEULEMENT si toutes les lignes sont annulées
  } else {
    // le PLUS AVANCÉ parmi les lignes NON annulées ; départage lexical stable pour les codes inattendus (rang 0).
    const nonAnnule = etats.filter((e) => e !== '4');
    etatDau = nonAnnule.reduce((best, e) => {
      const rb = RANG[best] ?? 0, re = RANG[e] ?? 0;
      if (re > rb) return e;
      if (re === rb && e > best) return e;
      return best;
    });
  }
  return { etatDau, dateDoc: a.dateDocMin, dateDaact: a.dateDaactMax, ambigu: a.etats.size >= 2 };
}

/** Agrège une liste de lignes en un seul passage (surtout pour les tests). */
export function agregerEtat(lignes: LigneEtat[]): EtatAgrege {
  const a = accumInit();
  for (const l of lignes) accumAjouter(a, l.etat, l.dateDoc, l.dateDaact);
  return agreger(a);
}
