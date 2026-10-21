/**
 * ══ 🔴🔴 LE STATUT D'UN BIEN — EN GESTION · ANCIENNE GESTION · LOCATION SEULE (Arno, 21/10/2026, migration 403). PUR. ═════════
 *
 * Trois statuts, portés par CHAQUE BIEN (jamais par le propriétaire) :
 *   · EN GESTION       — visible dans la tuile Gestion ; Drive « Base de données locative › Actifs » ;
 *   · ANCIENNE GESTION — géré, puis sorti de gestion : « Anciens biens » de la Gestion ; Drive « … › Inactifs » ;
 *   · LOCATION SEULE   — le stock permanent de la Location, sans actif / inactif ; invisible dans la Gestion ;
 *                        Drive « Base de données location seule ».
 * Le statut « en gestion » d'un PROPRIÉTAIRE se déduit de ses biens (au moins un bien en gestion).
 *
 * LES TRANSITIONS PERMISES (et aucune autre) — chacune avec une date d'effet, un auteur, un motif facultatif, au journal :
 *   · location seule   → en gestion        « Passer en gestion » (mandat de gestion proposé, facultatif) ;
 *   · en gestion       → SORTIE DE GESTION, destination OBLIGATOIRE :
 *                          ancienne gestion  (Anciens biens ; Drive → Inactifs),
 *                          location seule    (quitte la Gestion ; mandat de transaction locative proposé, facultatif) ;
 *   · ancienne gestion → en gestion        « Reprendre en gestion » ;
 *   · ancienne gestion → location seule    « Remettre en location seule ».
 * Une annexe RATTACHÉE suit son bien principal (la base l'applique) ; une annexe DÉTACHÉE a son propre statut.
 * 🔴 Les mails ne bougent pas : un bien qui n'est plus en gestion garde tous ses mails (historique, boîte, sélecteurs).
 */

export type StatutBien = 'en_gestion' | 'ancienne_gestion' | 'location_seule';
export const STATUTS_BIEN: readonly StatutBien[] = ['en_gestion', 'location_seule', 'ancienne_gestion'];

export const LIBELLE_STATUT: Record<StatutBien, string> = {
  en_gestion: 'En gestion', ancienne_gestion: 'Ancienne gestion', location_seule: 'Location seule',
};
/** La pastille : vert (en gestion), bleu (location seule), gris (ancienne gestion). */
export const TEINTE_STATUT: Record<StatutBien, 'vert' | 'bleu' | 'gris'> = {
  en_gestion: 'vert', location_seule: 'bleu', ancienne_gestion: 'gris',
};

export const estStatutBien = (x: unknown): x is StatutBien => x === 'en_gestion' || x === 'ancienne_gestion' || x === 'location_seule';

export type CleGeste = 'passer-en-gestion' | 'sortie-de-gestion' | 'reprendre-en-gestion' | 'remettre-en-location-seule';

export interface GesteStatut {
  cle: CleGeste;
  libelle: string;
  depuis: StatutBien;
  /** Les destinations : une seule, sauf la sortie de gestion (le choix est OBLIGATOIRE). */
  vers: readonly StatutBien[];
}

export const GESTES_STATUT: readonly GesteStatut[] = [
  { cle: 'passer-en-gestion', libelle: 'Passer en gestion', depuis: 'location_seule', vers: ['en_gestion'] },
  { cle: 'sortie-de-gestion', libelle: 'Sortie de gestion', depuis: 'en_gestion', vers: ['ancienne_gestion', 'location_seule'] },
  { cle: 'reprendre-en-gestion', libelle: 'Reprendre en gestion', depuis: 'ancienne_gestion', vers: ['en_gestion'] },
  { cle: 'remettre-en-location-seule', libelle: 'Remettre en location seule', depuis: 'ancienne_gestion', vers: ['location_seule'] },
];

/** Les gestes offerts à un bien de ce statut. */
export const gestesPour = (s: StatutBien): GesteStatut[] => GESTES_STATUT.filter((g) => g.depuis === s);

/** La destination d'une sortie de gestion, dite au choix. */
export const LIBELLE_DESTINATION: Record<StatutBien, string> = {
  ancienne_gestion: 'Ancienne gestion — le bien rejoint les « Anciens biens » de la Gestion ; son dossier Drive passe dans « Inactifs ».',
  location_seule: 'Location seule — le bien quitte la Gestion ; son dossier Drive passe dans « Base de données location seule ».',
  en_gestion: 'En gestion — le bien revient dans la Gestion ; son dossier Drive passe dans « Actifs ».',
};

/** Le mandat PROPOSÉ (facultatif) à une transition : de gestion vers « en gestion » depuis la location seule, de transaction vers la location seule. */
export function mandatPropose(depuis: StatutBien, vers: StatutBien): 'gestion' | 'transaction' | null {
  if (depuis === 'location_seule' && vers === 'en_gestion') return 'gestion';
  if (depuis === 'en_gestion' && vers === 'location_seule') return 'transaction';
  return null;
}

/** La transition est-elle permise ? `null` = oui ; sinon le motif, dit à l'écran. */
export function refusTransition(depuis: StatutBien, vers: unknown): string | null {
  if (!estStatutBien(vers)) return 'Choisissez la destination du bien.';
  if (vers === depuis) return `Le bien est déjà « ${LIBELLE_STATUT[vers]} ».`;
  const permis = gestesPour(depuis).some((g) => g.vers.includes(vers));
  return permis ? null : `Transition impossible : « ${LIBELLE_STATUT[depuis]} » → « ${LIBELLE_STATUT[vers]} ».`;
}

/** Le geste qui mène de `depuis` à `vers` (le libellé du journal). */
export const gesteDe = (depuis: StatutBien, vers: StatutBien): GesteStatut | null =>
  GESTES_STATUT.find((g) => g.depuis === depuis && g.vers.includes(vers)) ?? null;

/** Date civile « AAAA-MM-JJ » d'aujourd'hui à Paris. */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
}

/**
 * LA DATE D'EFFET : obligatoire, « AAAA-MM-JJ », une vraie date, pas dans le futur (le statut change MAINTENANT ; une date à
 * venir dirait le contraire de l'écran). PUR.
 */
export function verifierDateEffet(brut: unknown, maintenant: Date = new Date()): { ok: true; date: string } | { ok: false; motif: string } {
  const s = typeof brut === 'string' ? brut.trim() : '';
  if (s === '') return { ok: false, motif: 'La date d’effet est à renseigner.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, motif: 'La date d’effet est à saisir au format JJ/MM/AAAA.' };
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false, motif: 'La date d’effet n’existe pas.' };
  if (s > aujourdhuiParis(maintenant)) return { ok: false, motif: 'La date d’effet ne peut pas être dans le futur : le statut change aujourd’hui.' };
  return { ok: true, date: s };
}

/** Le motif facultatif : nettoyé, 500 caractères au plus ; `null` si vide. */
export const motifTransition = (brut: unknown): string | null => {
  const s = typeof brut === 'string' ? brut.trim() : '';
  return s === '' ? null : s.slice(0, 500);
};

/**
 * LA RÈGLE DE REPRISE (miroir de `gestion_statut_bien_deduit`, migration 403) : sert aussi tant que la 403 n'est pas appliquée.
 * « Bien en gestion ? = Non » (jamais géré) → location seule ; sinon une fin de gestion ou une sortie du portefeuille →
 * ancienne gestion ; sinon → en gestion.
 */
export function statutDeduit(enGestion: boolean | null, fin: string | null, sorti: string | null): StatutBien {
  if (enGestion === false) return 'location_seule';
  if (fin !== null || sorti !== null) return 'ancienne_gestion';
  return 'en_gestion';
}

/** Combien de biens d'un propriétaire, par statut (ses annexes rattachées ne comptent pas : elles suivent leur bien). */
export type ComptesStatuts = Record<StatutBien, number>;

const biens = (n: number): string => `${n} bien${n > 1 ? 's' : ''}`;

/**
 * Arno (21/10/2026) — LA MENTION, CALCULÉE et en lecture seule, de la fiche propriétaire (elle remplace la bascule « en gestion »
 * qui écrivait une colonne plus lue) : « En gestion : oui (2 biens) · 1 en location seule » ; « Non : location seule (1 bien) » ;
 * « Non : ancienne gestion (3 biens) » ; « Non : aucun bien ». PUR.
 */
export function mentionEnGestionProprietaire(c: ComptesStatuts): string {
  const autres = (sauf: StatutBien): string => (['en_gestion', 'location_seule', 'ancienne_gestion'] as const)
    .filter((s) => s !== sauf && c[s] > 0).map((s) => ` · ${c[s]} en ${LIBELLE_STATUT[s].toLowerCase()}`).join('');
  if (c.en_gestion > 0) return `En gestion : oui (${biens(c.en_gestion)})${autres('en_gestion')}`;
  if (c.location_seule > 0) return `Non : location seule (${biens(c.location_seule)})${autres('location_seule')}`;
  if (c.ancienne_gestion > 0) return `Non : ancienne gestion (${biens(c.ancienne_gestion)})`;
  return 'Non : aucun bien';
}

/** Le propriétaire est « en gestion » s'il a AU MOINS un bien en gestion. */
export const proprietaireEnGestion = (statuts: readonly StatutBien[]): boolean => statuts.includes('en_gestion');

/** « Sortie de gestion : En gestion → Location seule, au 21/10/2026 — motif » (le journal, l'Historique). */
export function phraseTransition(depuis: StatutBien | null, vers: StatutBien, effetLe: string, motif: string | null): string {
  const g = depuis === null ? null : gesteDe(depuis, vers);
  const date = effetLe.split('-').reverse().join('/');
  return `${g?.libelle ?? 'Statut'} : ${depuis === null ? '' : `${LIBELLE_STATUT[depuis]} → `}${LIBELLE_STATUT[vers]}, au ${date}${motif ? ` — ${motif}` : ''}`;
}
