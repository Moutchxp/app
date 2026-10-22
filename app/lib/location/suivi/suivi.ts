/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LE VOCABULAIRE ET LES RÈGLES PURES (Arno, 22/10/2026, migration 406) ══════════════════
 *
 * Modèle : le suivi mensuel d'Arno (CA_JBP_2026.xlsx). Une ligne d'activité = un bail signé dans le mois (ou un avenant, ou un
 * mandat de gestion seul) : honoraires propriétaire et locataire HT, négociateur, apporteur et sa commission, prime de nouvelle
 * gestion, avec / sans gestion, loyers, origine client.
 *
 * Honoraires : SAISIS EN HT au bail (décision d'Arno) ; le TTC (HT × 1,2) n'est que déduit, pour l'affichage existant.
 * Barèmes datés (apporteurs, commission) : la version la plus récente À LA DATE DE SIGNATURE fait foi — jamais rétroactif.
 * PUR : aucune base, aucun réseau ; sûr côté navigateur.
 */

export const TAUX_TVA = 0.2;

/** Aujourd'hui à Paris (AAAA-MM-JJ). */
export const aujourdhuiParis = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export const TYPES_APPORTEUR = ['partenaire', 'agence', 'internet', 'collaborateur'] as const;
export type TypeApporteur = typeof TYPES_APPORTEUR[number];
export const LIBELLE_TYPE_APPORTEUR: Record<TypeApporteur, string> = {
  partenaire: 'Partenaire externe', agence: 'Agence', internet: 'Internet', collaborateur: 'Collaborateur',
};

export const TYPES_ACTIVITE = ['bail', 'avenant', 'gestion_seule'] as const;
export type TypeActivite = typeof TYPES_ACTIVITE[number];
export const LIBELLE_TYPE_ACTIVITE: Record<TypeActivite, string> = { bail: 'Bail', avenant: 'Avenant', gestion_seule: 'Mandat de gestion seul' };

export const ORIGINES = ['nouveau', 'deja'] as const;
export type Origine = typeof ORIGINES[number];
export const LIBELLE_ORIGINE: Record<Origine, string> = { nouveau: 'Nouveau client', deja: 'Déjà client' };

export const CATEGORIES_PRIME = ['logement', 'parking'] as const;
export type CategoriePrime = typeof CATEGORIES_PRIME[number];

/** Arno (23/10/2026, 407) — L'ORIGINE DU CONTACT : liste fixe, obligatoire pour toute nouvelle location. */
export const ORIGINES_CONTACT = ['collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'passage_agence', 'campagne'] as const;
export type OrigineContact = typeof ORIGINES_CONTACT[number];
export const LIBELLE_ORIGINE_CONTACT: Record<OrigineContact, string> = {
  collegue: 'Collègue directement', apporteur: 'Apporteur d’affaires', internet: 'Internet', recommandation: 'Recommandation client',
  relocation: 'Relocation (portefeuille de gestion)', passage_agence: 'Passage agence', campagne: 'Campagne de communication',
};

/** Arno (23/10/2026, 407) — LA PRIME DE GESTION : la règle (150 € par défaut quand un mandat de gestion est signé), personnalisée, aucune. */
export const MODES_PRIME = ['regle', 'personnalise', 'aucune'] as const;
export type ModePrime = typeof MODES_PRIME[number];

/** Arrondi au centime (montants en euros). */
export const auCentime = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
/** TTC déduit d'un HT (× 1,2), au centime. */
export const htVersTtc = (ht: number): number => auCentime(ht * (1 + TAUX_TVA));
/** HT déduit d'un TTC (÷ 1,2), au centime — sert à la reprise des TTC déjà saisis et à la saisie côté TTC. */
export const ttcVersHt = (ttc: number): number => auCentime(ttc / (1 + TAUX_TVA));

/** Montant saisi (« 1 234,56 », « 1234.5 ») → euros, ou null si vide, ou undefined si illisible. */
export function lireMontant(brut: unknown): number | null | undefined {
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'number') return Number.isFinite(brut) && brut >= 0 ? auCentime(brut) : undefined;
  if (typeof brut !== 'string') return undefined;
  const t = brut.replace(/[\s  €]/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}

/** Taux saisi en pourcentage (« 10 », « 12,5 ») → fraction (0,10), ou null si vide, ou undefined si illisible / hors [0 ; 100]. */
export function lireTauxPourcent(brut: unknown): number | null | undefined {
  if (brut === null || brut === undefined || brut === '') return null;
  const t = typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut.replace(/[\s %]/g, '').replace(',', '.') : '';
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return undefined;
  const v = Number(t);
  return v >= 0 && v <= 100 ? Math.round(v * 10000) / 1000000 : undefined;
}

export const pourcent = (taux: number): string => `${String(Math.round(taux * 100 * 100) / 100).replace('.', ',')} %`;

/** Une version datée d'un barème (apporteur, règle de commission). */
export interface Datee { depuis: string }

/** La version en vigueur à `dateIso` (AAAA-MM-JJ) : la plus récente dont `depuis` ≤ date ; null si aucune. Jamais rétroactive. */
export function versionADate<T extends Datee>(versions: readonly T[], dateIso: string): T | null {
  let retenue: T | null = null;
  for (const v of versions) if (v.depuis <= dateIso && (retenue === null || v.depuis > retenue.depuis)) retenue = v;
  return retenue;
}

export interface RegleCommission extends Datee { tauxNegociateur: number; primeLogement: number; primeParking: number }
export interface BaremeApporteur extends Datee { taux: number; coutFixeMensuel: number }
/** Le collègue de rattachement d'un apporteur, daté (407) : la version en vigueur à la date d'une affaire fait foi. */
export interface CollegueDate extends Datee { collegueId: number | null; collegueLibelle: string }
export interface Apporteur {
  id: number; nom: string; type: TypeApporteur; baremes: BaremeApporteur[]; archive: boolean;
  societe?: string | null; telephone?: string | null; email?: string | null;
  /** Vide : « à rattacher » (407). Absent : base sans la 407. */
  collegues?: CollegueDate[];
}

/** « À rattacher » : aucun collègue de rattachement — l'apporteur ne peut pas être choisi pour une nouvelle location. PUR. */
export const aRattacher = (a: Pick<Apporteur, 'collegues'>): boolean => a.collegues !== undefined && a.collegues.length === 0;

/** Le collègue de rattachement d'un apporteur À UNE DATE : la version en vigueur ce jour-là (jamais rétroactif) ; avant la
 *  première version, la première (l'apporteur était déjà le sien). null : à rattacher. PUR. */
export function collegueADate(a: Pick<Apporteur, 'collegues'>, dateIso: string): CollegueDate | null {
  const v = a.collegues ?? [];
  if (v.length === 0) return null;
  return versionADate(v, dateIso) ?? [...v].sort((x, y) => x.depuis.localeCompare(y.depuis))[0];
}

/** Une date AAAA-MM-JJ valide (le calendrier, pas seulement la forme). */
export function dateIsoValide(t: unknown): t is string {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/** Le premier jour du mois d'une date (AAAA-MM-01). */
export const moisDe = (dateIso: string): string => `${dateIso.slice(0, 7)}-01`;

/** ── Saisie du « suivi commercial » au bail ─────────────────────────────────────────────────────────────────────── */
export interface SaisieActivite {
  type: TypeActivite;
  dateSignature: string;
  honoProprietaireHt: string;
  honoLocataireHt: string;
  negociateurId: number | null;
  apporteurId: number | null;
  /** Taux appliqué à CE bail, en % (vide = le barème de l'apporteur à la date de signature). */
  apporteurTaux: string;
  mandatGestion: boolean;
  avecGestion: boolean;
  origineProprietaire: Origine | null;
  origineLocataire: Origine | null;
  /** 407 — l'origine du contact (obligatoire), le collègue (« collègue directement »), la commission d'apporteur saisie (€),
   *  la prime (règle / personnalisée / aucune) et son montant personnalisé. */
  origineContact?: OrigineContact | null;
  collegueId?: number | null;
  commissionApporteur?: string;
  primeMode?: ModePrime | null;
  primeMontant?: string;
}

export interface ActiviteVerifiee {
  type: TypeActivite;
  dateSignature: string;
  honoProprietaireHt: number;
  honoLocataireHt: number;
  negociateurId: number | null;
  apporteurId: number | null;
  apporteurTaux: number | null;
  mandatGestion: boolean;
  avecGestion: boolean;
  origineProprietaire: Origine | null;
  origineLocataire: Origine | null;
  origineContact: OrigineContact | null;
  collegueId: number | null;
  commissionApporteur: number | null;
  primeMode: ModePrime | null;
  primeMontant: number | null;
}

const dans = <T extends string>(liste: readonly T[], v: unknown): T | null => (typeof v === 'string' && (liste as readonly string[]).includes(v) ? v as T : null);
const entierPositif = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** Vérifie la saisie reçue (navigateur ou serveur) : la date de signature est obligatoire ; montants ≥ 0 ; taux en %. */
export function verifierActivite(brut: unknown, o: { origineObligatoire?: boolean } = {}): { ok: true; valeurs: ActiviteVerifiee } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const type = dans(TYPES_ACTIVITE, b.type) ?? 'bail';
  if (!dateIsoValide(b.dateSignature)) return { ok: false, motif: 'La date de signature du bail est obligatoire.' };
  const c = verifierCommercial(b, o.origineObligatoire ?? true);
  if (!c.ok) return c;
  const hp = lireMontant(b.honoProprietaireHt);
  const hl = lireMontant(b.honoLocataireHt);
  if (hp === undefined) return { ok: false, motif: 'Honoraires propriétaire HT : un montant en euros (ex. 416,67).' };
  if (hl === undefined) return { ok: false, motif: 'Honoraires locataire HT : un montant en euros (ex. 226,95).' };
  const taux = lireTauxPourcent(b.apporteurTaux);
  if (taux === undefined) return { ok: false, motif: 'Taux de l’apporteur : un pourcentage entre 0 et 100.' };
  const apporteurId = c.valeurs.apporteurId;
  return {
    ok: true,
    valeurs: {
      type, dateSignature: b.dateSignature, honoProprietaireHt: hp ?? 0, honoLocataireHt: hl ?? 0,
      negociateurId: entierPositif(b.negociateurId), apporteurTaux: apporteurId === null ? null : taux,
      mandatGestion: b.mandatGestion === true, avecGestion: b.avecGestion === true,
      origineProprietaire: dans(ORIGINES, b.origineProprietaire), origineLocataire: dans(ORIGINES, b.origineLocataire),
      ...c.valeurs,
    },
  };
}

export interface ChampsCommerciaux {
  origineContact: OrigineContact | null; collegueId: number | null; apporteurId: number | null;
  commissionApporteur: number | null; primeMode: ModePrime | null; primeMontant: number | null;
}

/**
 * Arno (23/10/2026, 407) — les CHAMPS COMMERCIAUX d'une affaire (saisie au bail, ou correction dans la feuille du mois) :
 * l'origine du contact est OBLIGATOIRE ; « collègue directement » exige le collègue ; « apporteur d'affaires » exige
 * l'apporteur ; une prime « personnalisée » exige son montant. La commission d'apporteur saisie (€) est facultative (vide :
 * le taux). PUR.
 */
export function verifierCommercial(b: Record<string, unknown>, origineObligatoire = true): { ok: true; valeurs: ChampsCommerciaux } | { ok: false; motif: string } {
  const origineContact = dans(ORIGINES_CONTACT, b.origineContact);
  if (origineContact === null && origineObligatoire) return { ok: false, motif: 'L’origine du contact est obligatoire.' };
  const collegueId = entierPositif(b.collegueId);
  if (origineContact === 'collegue' && collegueId === null) return { ok: false, motif: 'Choisissez le collègue (origine « Collègue directement »).' };
  const apporteurId = origineContact === null || origineContact === 'apporteur' ? entierPositif(b.apporteurId) : null;
  if (origineContact === 'apporteur' && apporteurId === null) return { ok: false, motif: 'Choisissez l’apporteur d’affaires dans l’annuaire.' };
  const com = lireMontant(b.commissionApporteur);
  if (com === undefined) return { ok: false, motif: 'Honoraires d’apporteur : un montant en euros (ex. 64,39).' };
  const primeMode = dans(MODES_PRIME, b.primeMode);
  const pm = lireMontant(b.primeMontant);
  if (primeMode === 'personnalise' && (pm === undefined || pm === null)) return { ok: false, motif: 'Prime de gestion personnalisée : saisissez le montant (ex. 15).' };
  return { ok: true, valeurs: {
    origineContact, collegueId: origineContact === 'collegue' ? collegueId : null, apporteurId,
    commissionApporteur: apporteurId === null ? null : com, primeMode, primeMontant: primeMode === 'personnalise' ? (pm as number) : null,
  } };
}

/** Vérifie un apporteur nouveau (nom, type, taux par défaut en %, coût fixe mensuel en €, date d'effet). */
export function verifierApporteur(brut: unknown, o: { collegueObligatoire?: boolean } = {}): { ok: true; nom: string; type: TypeApporteur; taux: number; coutFixe: number; depuis: string;
  societe: string | null; telephone: string | null; email: string | null; collegueId: number | null } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const coord = verifierCoordonnees(b);
  if (!coord.ok) return coord;
  const collegueId = entierPositif(b.collegueId);
  if (o.collegueObligatoire && collegueId === null) return { ok: false, motif: 'Le collègue de rattachement de l’apporteur est obligatoire.' };
  const nom = typeof b.nom === 'string' ? b.nom.replace(/\s+/g, ' ').trim() : '';
  if (nom === '') return { ok: false, motif: 'Le nom de l’apporteur est obligatoire.' };
  const type = dans(TYPES_APPORTEUR, b.type);
  if (type === null) return { ok: false, motif: 'Le type de l’apporteur : partenaire externe, agence, Internet ou collaborateur.' };
  const taux = lireTauxPourcent(b.taux);
  if (taux === undefined) return { ok: false, motif: 'Taux de commission : un pourcentage entre 0 et 100.' };
  const cout = lireMontant(b.coutFixe);
  if (cout === undefined) return { ok: false, motif: 'Coût fixe mensuel : un montant en euros.' };
  const depuis = dateIsoValide(b.depuis) ? b.depuis : null;
  if (depuis === null) return { ok: false, motif: 'La date d’effet du taux est obligatoire.' };
  return { ok: true, nom, type, taux: taux ?? 0, coutFixe: cout ?? 0, depuis, ...coord.valeurs, collegueId };
}

const texteOuNull = (v: unknown): string | null => (typeof v === 'string' && v.replace(/\s+/g, ' ').trim() !== '' ? v.replace(/\s+/g, ' ').trim() : null);

/** La fiche de l'apporteur : société, téléphone, e-mail (facultatifs ; un e-mail mal écrit est refusé). PUR. */
export function verifierCoordonnees(b: Record<string, unknown>): { ok: true; valeurs: { societe: string | null; telephone: string | null; email: string | null } } | { ok: false; motif: string } {
  const email = texteOuNull(b.email);
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, motif: 'L’e-mail de l’apporteur est mal écrit (ex. nom@exemple.fr).' };
  return { ok: true, valeurs: { societe: texteOuNull(b.societe), telephone: texteOuNull(b.telephone), email } };
}

/** Vérifie une version de la règle de commission (taux du négociateur en %, primes en €, date d'effet). */
export function verifierRegle(brut: unknown): { ok: true; regle: RegleCommission } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (!dateIsoValide(b.depuis)) return { ok: false, motif: 'La date d’effet de la règle est obligatoire.' };
  const taux = lireTauxPourcent(b.tauxNegociateur);
  if (taux === undefined || taux === null) return { ok: false, motif: 'Taux du négociateur : un pourcentage entre 0 et 100.' };
  const pl = lireMontant(b.primeLogement);
  const pp = lireMontant(b.primeParking);
  if (pl === undefined || pl === null) return { ok: false, motif: 'Prime de nouvelle gestion (logement) : un montant en euros.' };
  if (pp === undefined || pp === null) return { ok: false, motif: 'Prime de nouvelle gestion (parking) : un montant en euros.' };
  return { ok: true, regle: { depuis: b.depuis, tauxNegociateur: taux, primeLogement: pl, primeParking: pp } };
}

/** Vérifie une rétrocession (négociateur, mois, montant > 0, libellé). */
export function verifierRetrocession(brut: unknown): { ok: true; negociateurId: number | null; negociateurLibelle: string; mois: string; montant: number; libelle: string } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const mois = typeof b.mois === 'string' && /^\d{4}-\d{2}$/.test(b.mois) ? `${b.mois}-01` : null;
  if (mois === null || !dateIsoValide(mois)) return { ok: false, motif: 'Le mois de la rétrocession est obligatoire.' };
  const montant = lireMontant(b.montant);
  if (montant === undefined || montant === null || montant <= 0) return { ok: false, motif: 'Le montant de la rétrocession : un montant en euros, supérieur à zéro.' };
  const libelle = typeof b.libelle === 'string' ? b.libelle.trim() : '';
  if (libelle === '') return { ok: false, motif: 'Le libellé de la rétrocession est obligatoire (ex. « Alex Coms »).' };
  const negociateurLibelle = typeof b.negociateurLibelle === 'string' ? b.negociateurLibelle.trim() : '';
  if (negociateurLibelle === '') return { ok: false, motif: 'Le négociateur concerné est obligatoire.' };
  return { ok: true, negociateurId: entierPositif(b.negociateurId), negociateurLibelle, mois, montant, libelle };
}

/** L'origine retenue : la correction manuelle si elle existe, sinon la déduction. */
export const origineRetenue = (deduite: Origine | null, saisie: Origine | null): Origine | null => saisie ?? deduite;
