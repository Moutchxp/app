/**
 * ══ 🔴🔴 LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET — QUAND LES NOUVELLES RÈGLES S'APPLIQUENT. PUR. ══
 *
 * DÉCISIONS D'ARNO (13/10/2026), à comparer à `docs/RECON_RATTACHEMENT_AUTO.md` :
 *   R1 expéditeur locataire actuel → son bien, même avec un propriétaire à plusieurs biens en copie ;
 *   R2 propriétaire d'un seul bien → ce bien, la règle propriétaire passant AVANT la carte de contact ;
 *   R3 propriétaire de plusieurs biens → « À classer », tous ses biens proposés (inchangé) ;
 *   R4 tout rattachement automatique pose le suivi de fond « Ce mail + futurs échanges », signé par l'automate ;
 *   A  locataire d'un bien ET propriétaire d'un autre → aucun rattachement automatique, les deux proposés ;
 *   B  ancien locataire qui écrit après son départ → son DERNIER bien, automatiquement pendant N mois (15 par défaut).
 *
 * 🔴 DÉCISION C : RIEN SUR L'EXISTANT. Les règles ne valent que pour un mail REÇU à partir de la mise en service
 * (migration 345, `gestion_rattachement_reglage.mise_en_service`). Sans la table, ou pour un mail plus ancien, ou pour
 * un mail que NOUS envoyons, le moteur se comporte EXACTEMENT comme avant ce lot.
 */

/** Le réglage tel que la base le donne (migration 345). `null` = la table n'existe pas : aucune nouvelle règle. */
export interface ReglageRattachement {
  /** ISO 8601. Les mails reçus à partir de cet instant suivent les nouvelles règles. */
  miseEnService: string;
  /** Règle B : durée pendant laquelle un ancien locataire est rattaché automatiquement à son dernier bien. */
  ancienLocataireMois: number;
}

/** La durée de la règle B quand rien n'est réglé (décision d'Arno). */
export const ANCIEN_LOCATAIRE_MOIS_DEFAUT = 15;

/** Ce que le moteur reçoit pour UN mail : les règles jouent-elles, et avec quelle durée ? */
export interface ReglesDuMail {
  actives: boolean;
  ancienLocataireMois: number;
  /** La date du mail (ISO), pour la règle B. */
  dateMail: string | null;
}

/** Les règles d'avant ce lot, telles quelles. */
export const REGLES_D_AVANT: ReglesDuMail = { actives: false, ancienLocataireMois: ANCIEN_LOCATAIRE_MOIS_DEFAUT, dateMail: null };

/**
 * LES NOUVELLES RÈGLES JOUENT-ELLES POUR CE MAIL ? PUR.
 *   · il faut le réglage (migration 345) ;
 *   · il faut un mail REÇU (« mails REÇUS après la mise en service ») — nos envois gardent le moteur d'avant ;
 *   · il faut qu'il soit arrivé à partir de la mise en service (décision C).
 */
export function reglesDuMail(
  m: { sens: string | null | undefined; recuLe: string | null | undefined },
  reglage: ReglageRattachement | null,
): ReglesDuMail {
  if (reglage === null || m.sens !== 'recu' || (m.recuLe ?? '') === '') return { ...REGLES_D_AVANT, dateMail: m.recuLe ?? null };
  const recu = Date.parse(m.recuLe as string);
  const depuis = Date.parse(reglage.miseEnService);
  const actives = Number.isFinite(recu) && Number.isFinite(depuis) && recu >= depuis;
  return { actives, ancienLocataireMois: reglage.ancienLocataireMois, dateMail: m.recuLe ?? null };
}

/**
 * RÈGLE B — LE MAIL TOMBE-T-IL DANS LES N MOIS QUI SUIVENT LA SORTIE ? PUR.
 * Les mois sont des mois CIVILS (sortie le 31/08 + 15 mois = 30/11 de l'année suivante, jour borné au dernier du mois).
 * ⚠️ Comparaison sur la DATE CIVILE (AAAA-MM-JJ), jamais sur un horodatage UTC : une sortie à minuit reculerait d'un jour.
 */
export function dansLesMoisApresSortie(sortie: string, dateMail: string, mois: number): boolean {
  const s = sortie.slice(0, 10);
  const d = dateMail.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (d < s) return false;
  return d <= ajouterMois(s, mois);
}

/** « 2026-08-31 » + 15 mois → « 2027-11-30 ». PUR. */
export function ajouterMois(jour: string, mois: number): string {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  const total = a * 12 + (m - 1) + mois;
  const an = Math.floor(total / 12);
  const mo = total % 12;
  const dernier = new Date(Date.UTC(an, mo + 1, 0)).getUTCDate();
  const jj = Math.min(j, dernier);
  return `${an}-${String(mo + 1).padStart(2, '0')}-${String(jj).padStart(2, '0')}`;
}

/** « 23/08/2026 », depuis une date civile. PUR. */
export function jourLisible(jour: string): string {
  const [a, m, j] = jour.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/* ══ R4 — LE SUIVI DE FOND POSÉ PAR L'AUTOMATE ═════════════════════════════════════════════════════════════════════ */

/**
 * La SIGNATURE du suivi de fond posé par l'automate : un auteur dédié, distinct d'un humain et de la reprise des
 * périodes. ⚠️ Jamais « automatique » tout court : la base le refuse pour un suivi (`gestion_fil_periode_humain_chk`),
 * et ce libellé-ci le dit mieux, en toutes lettres, à l'écran.
 */
export const AUTEUR_SUIVI_AUTOMATIQUE = 'suivi de fond posé automatiquement';

/** Ce suivi a-t-il été posé par l'automate ? PUR. */
export function estSuiviAutomatique(parLibelle: string | null | undefined): boolean {
  return (parLibelle ?? '').trim().toLowerCase() === AUTEUR_SUIVI_AUTOMATIQUE;
}

/** « suivi de fond posé automatiquement le 13/10/2026 à 14:02 ». `quand` = la date déjà mise en forme par l'écran. PUR. */
export function motSuiviAutomatique(quand: string | null): string {
  return quand === null || quand.trim() === '' ? AUTEUR_SUIVI_AUTOMATIQUE : `${AUTEUR_SUIVI_AUTOMATIQUE} le ${quand}`;
}

/**
 * LE SUIVI AUTOMATIQUE QUI COUVRE CE MAIL, s'il y en a un : la date de sa pose (ISO), sinon `null`. PUR.
 * Sert à la fenêtre de rattachement (« Biens actuellement suivi(s) ») : elle dit qui a posé le suivi en vigueur.
 */
export function suiviAutomatiqueDuMail(
  mails: readonly number[], periodes: readonly { depuisMessageId: number; parLibelle?: string | null; le?: string | null }[],
  mailId: number,
): string | null {
  const i = mails.indexOf(mailId);
  if (i < 0) return null;
  const rang = new Map(mails.map((m, k) => [m, k]));
  const couvrantes = periodes.filter((p) => (rang.get(p.depuisMessageId) ?? Infinity) <= i)
    .sort((a, b) => (rang.get(a.depuisMessageId) as number) - (rang.get(b.depuisMessageId) as number));
  const p = couvrantes[couvrantes.length - 1];
  return p !== undefined && estSuiviAutomatique(p.parLibelle) ? (p.le ?? '') : null;
}
