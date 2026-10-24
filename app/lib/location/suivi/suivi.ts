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

import { estLotParking } from '../bienComplet';
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

export const CATEGORIES_PRIME = ['logement', 'local', 'parking'] as const;
export type CategoriePrime = typeof CATEGORIES_PRIME[number];
/** Arno (24/10/2026) — « Local » (local commercial ou bureaux) : Logement · Local · Parking. */
export const LIBELLE_CATEGORIE_PRIME: Record<CategoriePrime, string> = { logement: 'Logement', local: 'Local', parking: 'Parking' };
/** La catégorie de prime d'une famille de bien (logement → Logement, local → Local, parking → Parking). PUR. */
/**
 * 🔴 Arno (24/10/2026) — LE « TYPE DE BIEN » (anciennement « Prime de nouvelle gestion ») d'après les LOTS LOUÉS cochés :
 *   · « Parking » n'est proposé — et alors pré-sélectionné — QUE si TOUS les lots loués sont des parkings (place ou box) ;
 *   · sinon, la famille du LOT PRINCIPAL loué : le logement de la fiche s'il est coché, sinon le premier lot qui n'est pas un
 *     parking — « Local » pour un local, « Logement » pour tout le reste (une cave, une catégorie inconnue).
 * `null` : aucun lot coché (on garde la famille du bien). PUR.
 */
export function typeDeBienDesLots(lots: readonly { role: 'logement' | 'annexe'; categorie?: string | null; place: boolean; type?: string | null; libelle?: string | null }[]):
  { type: CategoriePrime; parkingPermis: boolean } | null {
  if (lots.length === 0) return null;
  // Arno (24/10/2026) — `estLotParking` : catégorie parking/box, ou catégorie vide et type/libellé « parking », « garage », « box »…
  const estParking = (l: (typeof lots)[number]): boolean => l.place || estLotParking(l);
  if (lots.every(estParking)) return { type: 'parking', parkingPermis: true };
  const autres = lots.filter((l) => !estParking(l));
  const principal = autres.find((l) => l.role === 'logement') ?? autres[0];
  return { type: principal.categorie === 'local' ? 'local' : 'logement', parkingPermis: false };
}

export const categoriePrimeDeFamille = (f: string | null | undefined): CategoriePrime => (f === 'parking' ? 'parking' : f === 'local' ? 'local' : 'logement');

/** Arno (23/10/2026, 407) — L'ORIGINE DU CONTACT : liste fixe, obligatoire pour toute nouvelle location. */
export const ORIGINES_CONTACT = ['collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'proprietaire_deja_client', 'passage_agence', 'campagne', 'personnalise'] as const;
export type OrigineContact = typeof ORIGINES_CONTACT[number];
export const LIBELLE_ORIGINE_CONTACT: Record<OrigineContact, string> = {
  collegue: 'Collègue directement', apporteur: 'Apporteur d’affaires', internet: 'Internet', recommandation: 'Recommandation client',
  relocation: 'Relocation (portefeuille de gestion)', proprietaire_deja_client: 'Propriétaire déjà client', passage_agence: 'Passage agence', campagne: 'Campagne de communication',
  personnalise: 'Personnalisé',
};

/**
 * 🔴 Arno (24/10/2026, migration 411) — « PERSONNALISÉ » : en fin de liste ; choisi, un texte OBLIGATOIRE (80 caractères au plus) dit
 * l'origine voulue. Stocké et affiché tel quel ; regroupé sous « Personnalisé » dans les totaux par origine. Sans la 411, le choix
 * n'est pas proposé (`originesProposees`) : la base refuserait la valeur.
 */
export const PRECISION_ORIGINE_MAX = 80;
/**
 * 🔴 Arno (24/10/2026, migration 415) — « PROPRIÉTAIRE DÉJÀ CLIENT » (un propriétaire déjà dans notre portefeuille qui nous confie un
 * nouveau bien en gestion), juste après « Relocation ». Sans la 415, pas proposé (la base refuserait la valeur).
 */
export function originesProposees(personnalisable: boolean, dejaClient = false): readonly OrigineContact[] {
  return ORIGINES_CONTACT.filter((o) => (o !== 'personnalise' || personnalisable) && (o !== 'proprietaire_deja_client' || dejaClient));
}
/** Le libellé affiché d'une origine : « Personnalisé : <texte> » quand il y en a un, sinon le libellé de la liste. PUR. */
export function libelleOrigineContact(o: OrigineContact | null | undefined, precision?: string | null): string {
  if (o === null || o === undefined) return '';
  return o === 'personnalise' && precision ? `${LIBELLE_ORIGINE_CONTACT.personnalise} : ${precision}` : LIBELLE_ORIGINE_CONTACT[o];
}
/** La clé de regroupement des totaux par origine : toutes les origines personnalisées sous « personnalise ». PUR. */
export const cleTotauxOrigine = (o: OrigineContact | null | undefined): OrigineContact | 'sans' => o ?? 'sans';

/**
 * ══ 🔴🔴 Arno (24/10/2026) — LA SITUATION DU BIEN À LA SIGNATURE, ET CE QUE « NOUVEAU LOCATAIRE » EN PRÉ-REMPLIT ════════════════════
 *
 *   · « nouveau_mandat » : sous mandat de gestion et JAMAIS loué par nous depuis l'entrée en gestion (première location d'un nouveau
 *     mandat, y compris un nouveau bien d'un propriétaire déjà client) → « Nouveau mandat de gestion signé (prime) », prime 150 € ;
 *   · « relocation » : déjà loué dans notre portefeuille de gestion, il revient à la location → « Relocation » (portefeuille de gestion), aucune
 *     prime, origine « Relocation (portefeuille de gestion) » ;
 *   · « deja_prime » : en gestion, jamais reloué depuis son (re)entrée, mais SA prime a déjà été versée (un bien n'en génère qu'UNE
 *     dans toute sa vie de gestion, même s'il sort puis revient) → « Relocation » (portefeuille de gestion), aucune prime, case Nouveau mandat
 *     désactivée ;
 *   · « hors_gestion » : location seule → aucune case, aucune prime. PUR.
 */
export type CasGestion = 'nouveau_mandat' | 'relocation' | 'deja_prime' | 'hors_gestion';
export function casGestionDuBien(o: { enGestion: boolean; dejaLoueEnGestion: boolean; primeDejaVersee: boolean }): CasGestion {
  if (!o.enGestion) return 'hors_gestion';
  if (o.dejaLoueEnGestion) return 'relocation';
  return o.primeDejaVersee ? 'deja_prime' : 'nouveau_mandat';
}
/** Ce que le cas pré-remplit (modifiable). Les deux cases sont EXCLUSIVES. PUR. */
export function preremplissageGestion(cas: CasGestion): { mandatGestion: boolean; avecGestion: boolean; primeMode: ModePrime; origineRelocation: boolean } {
  if (cas === 'nouveau_mandat') return { mandatGestion: true, avecGestion: false, primeMode: 'regle', origineRelocation: false };
  if (cas === 'hors_gestion') return { mandatGestion: false, avecGestion: false, primeMode: 'aucune', origineRelocation: false };
  return { mandatGestion: false, avecGestion: true, primeMode: 'aucune', origineRelocation: cas === 'relocation' };
}
/**
 * 🔴 Arno (24/10/2026, après c308b3cf) — L'ORIGINE DU CONTACT SUIT LES DEUX CASES (exclusives), EN DIRECT :
 *   · « Relocation » cochée → l'origine est « Relocation (portefeuille de gestion) », IMPOSÉE ; cette origine n'existe qu'avec la case ;
 *   · « Nouvelle gestion » cochée → jamais « Relocation » : une origine vide (ou « Relocation ») devient « Propriétaire déjà client »
 *     si le propriétaire avait déjà un bien ou un bail chez nous avant la signature (`dejaClient`), sinon elle se VIDE (à choisir) ;
 *     une origine choisie à la main et cohérente est conservée ;
 *   · décocher efface l'origine que la case avait mise AUTOMATIQUEMENT (`auto`) ; un choix fait à la main reste s'il est cohérent.
 * PUR.
 */
export function origineApresCases(o: { origine: OrigineContact | null; auto: boolean; avecGestion: boolean; mandatGestion: boolean; dejaClient: boolean }):
  { origine: OrigineContact | null; auto: boolean } {
  if (o.avecGestion) return { origine: 'relocation', auto: true };
  // Sans la case « Relocation », l'origine « Relocation » n'a plus de sens : elle s'efface.
  const origine = o.origine === 'relocation' ? null : o.origine;
  const auto = o.origine === 'relocation' ? false : o.auto;
  if (o.mandatGestion) {
    if (origine === null) return o.dejaClient ? { origine: 'proprietaire_deja_client', auto: true } : { origine: null, auto: false };
    return { origine, auto };
  }
  return auto ? { origine: null, auto: false } : { origine, auto };
}

/** « Prime déjà versée le 12/03/2025 (bail DUPONT) ». PUR. */
export function motPrimeDejaVersee(p: { date: string; bail: string }): string {
  return `Prime déjà versée le ${p.date.split('-').reverse().join('/')} (bail ${p.bail})`;
}
/**
 * « Cette affaire porte-t-elle une prime de nouvelle gestion ? », en SQL sur l'alias `a` de `gestion_location_activite` — la MÊME
 * règle que `primeDe` (tableauBord.ts) : « Aucune » → non ; « Personnalisé » → le montant saisi > 0 ; un montant saisi → lui ; sinon
 * un mandat (ou « 150 € ») → oui. Aucun accent dans le SQL émis.
 */
export function sqlPorteUnePrime(a: string, avecModes: boolean): string {
  const mode = avecModes ? `${a}.prime_mode` : 'NULL::text';
  return `(${mode} IS DISTINCT FROM 'aucune' AND CASE WHEN ${mode} = 'personnalise' THEN coalesce(${a}.prime_gestion_saisie, 0) > 0
             WHEN ${a}.prime_gestion_saisie IS NOT NULL THEN ${a}.prime_gestion_saisie > 0
             ELSE (${a}.mandat_gestion OR ${mode} = 'regle') END)`;
}

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

export interface RegleCommission extends Datee {
  tauxNegociateur: number; primeLogement: number; primeParking: number;
  /** Arno (24/10/2026, migration 412) — la prime d'un LOCAL. Vide (versions d'avant, ou sans la 412) : celle du logement. */
  primeLocal?: number | null;
}
/** Le montant de la prime de nouvelle gestion d'une catégorie, selon une version de la règle. Jamais rétroactif. PUR. */
export function montantPrime(r: RegleCommission, c: CategoriePrime): number {
  if (c === 'parking') return r.primeParking;
  if (c === 'local') return r.primeLocal ?? r.primeLogement;
  return r.primeLogement;
}
/**
 * 🔴 Arno (24/10/2026, migration 413) — LA COMMISSION D'UN APPORTEUR a deux parts et un mode :
 *   · `taux` : le taux sur la LOCATION (honoraires propriétaire HT + locataire HT du bail) ;
 *   · `tauxGestion` : le taux sur la GESTION (honoraires de gestion mensuels HT du bail = loyer CC × taux de gestion du bien) ;
 *   · `mode` : « One shot » (part gestion = taux × honoraires mensuels × 12, la première année, due une fois à la signature) ou
 *     « Récurrent » (part gestion = taux × honoraires mensuels, due CHAQUE MOIS tant que le bien reste en gestion).
 * Les règles d'avant la 413 se lisent « One shot — gestion 0 % » : aucun montant historique ne change.
 */
export const MODES_APPORTEUR = ['one_shot', 'recurrent'] as const;
export type ModeApporteur = (typeof MODES_APPORTEUR)[number];
export const LIBELLE_MODE_APPORTEUR: Record<ModeApporteur, string> = { one_shot: 'One shot', recurrent: 'Récurrent' };
export interface BaremeApporteur extends Datee {
  taux: number; coutFixeMensuel: number; mode?: ModeApporteur; tauxGestion?: number;
  /** 🔴 Arno (24/10/2026, 419) — la durée du « Récurrent », en années entières (≥ 1). null / absente : « Indéterminée ». */
  dureeAnnees?: number | null;
}

/** « pendant 3 ans » / « pendant 1 an » / « durée indéterminée ». PUR. */
export const libelleDuree = (d: number | null | undefined): string => (d === null || d === undefined ? 'durée indéterminée' : `pendant ${d} an${d > 1 ? 's' : ''}`);

/**
 * 🔴 Arno (24/10/2026, 419) — LA RÉMUNÉRATION DU COLLÈGUE DE RATTACHEMENT d'un apporteur EXTERNE (« il a apporté cet apporteur ») :
 * « Aucune rémunération » (`remunere: false`, et le défaut quand aucune version n'existe), ou One shot / Récurrent avec SES taux et
 * sa durée — les mêmes formules que la commission de l'apporteur, sur les dossiers de cet apporteur. Versionnée : la version en
 * vigueur à la signature du dossier fait foi (jamais rétroactif).
 */
export interface RemunerationCollegue extends Datee { remunere: boolean; mode: ModeApporteur; taux: number; tauxGestion: number; dureeAnnees: number | null }

/** « 10 % » (fraction 0,1 → texte), sans arrondi au-delà de 4 décimales du pourcentage. PUR. */
const pctTexte = (x: number): string => `${String(Math.round(x * 1000000) / 10000).replace('.', ',')} %`;

/**
 * La règle d'un apporteur, telle que la fiche l'écrit : « One shot — location 10 %, gestion 20 % » ou « Récurrent — location
 * 10 %, gestion 10 % / mois ». PUR.
 */
export function libelleRegleApporteur(b: Pick<BaremeApporteur, 'taux' | 'mode' | 'tauxGestion' | 'dureeAnnees'>): string {
  const mode = b.mode ?? 'one_shot';
  // 419 — la durée du récurrent (« pendant 3 ans », « durée indéterminée »).
  return `${LIBELLE_MODE_APPORTEUR[mode]} — location ${pctTexte(b.taux)}, gestion ${pctTexte(b.tauxGestion ?? 0)}${mode === 'recurrent' ? ` / mois, ${libelleDuree(b.dureeAnnees)}` : ''}`;
}
/** « Aucune rémunération », ou la règle du collègue (« Récurrent — location 5 %, gestion 10 % / mois, pendant 3 ans »). PUR. */
export const libelleRemuneration = (r: RemunerationCollegue | null): string => (r === null || !r.remunere ? 'Aucune rémunération' : libelleRegleApporteur(r));
/** Le collègue de rattachement d'un apporteur, daté (407) : la version en vigueur à la date d'une affaire fait foi. */
export interface CollegueDate extends Datee { collegueId: number | null; collegueLibelle: string }
/**
 * Arno (23/10/2026, 409) — un rattachement « DEPUIS TOUJOURS » (date d'effet vide en base) se lit avec cette date, la plus petite
 * qui soit : il couvre tout l'historique, et un rattachement daté ultérieur prend le relais à sa date.
 */
export const DEPUIS_TOUJOURS = '0001-01-01';
export const depuisLibelle = (c: Pick<CollegueDate, 'depuis'>): string => (c.depuis === DEPUIS_TOUJOURS ? 'depuis toujours' : `depuis le ${c.depuis.split('-').reverse().join('/')}`);
export interface Apporteur {
  id: number; nom: string; type: TypeApporteur; baremes: BaremeApporteur[]; archive: boolean;
  societe?: string | null; telephone?: string | null; email?: string | null;
  /**
   * Arno (24/10/2026, migration 414) — le nom de FAMILLE et le prénom, séparés (« NOM Prénom », tri par nom de famille). null :
   * pas encore séparés (sans la 414, ou jamais repris) — la séparation est alors PROPOSÉE (`separerNomPrenom`). '' : séparés à la
   * main comme « pas une personne » (une structure : le nom tel quel).
   */
  nomFamille?: string | null;
  prenom?: string | null;
  /** Vide : « à rattacher » (407). Absent : base sans la 407. */
  collegues?: CollegueDate[];
  /**
   * 🔴 Arno (24/10/2026, 419) — un apporteur INTERNE est lié à son COMPTE de l'interface (quelles que soient ses permissions) et n'est
   * rattaché à personne. null / absent : un partenaire EXTERNE (collègue de rattachement obligatoire).
   */
  compteId?: number | null;
  /** 419 — la rémunération du collègue de rattachement (externe), versions datées ; vide : aucune. */
  remunerations?: RemunerationCollegue[];
}

/** 419 — l'apporteur est-il INTERNE (lié à un compte de l'interface) ? PUR. */
export const estInterne = (a: Pick<Apporteur, 'compteId'>): boolean => a.compteId !== null && a.compteId !== undefined;
/** Le badge : « INTERNE » / « PARTENAIRE EXTERNE ». */
export const badgeApporteur = (a: Pick<Apporteur, 'compteId'>): string => (estInterne(a) ? 'INTERNE' : 'PARTENAIRE EXTERNE');

// ── Arno (24/10/2026, 414) — « NOM Prénom » et le tri par nom de famille ──────────────────────────────────────────────────

/** Une STRUCTURE (agence, Internet) : son nom, tel quel ; jamais découpé en nom / prénom. */
export const estStructure = (a: Pick<Apporteur, 'type'>): boolean => a.type === 'agence' || a.type === 'internet';

/** La séparation PROPOSÉE (reprise) : le DERNIER mot est le nom de famille, le reste le prénom. Un seul mot : le nom seul. PUR. */
export function separerNomPrenom(nom: string): { nomFamille: string; prenom: string | null } {
  const mots = nom.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (mots.length <= 1) return { nomFamille: mots[0] ?? '', prenom: null };
  return { nomFamille: mots[mots.length - 1], prenom: mots.slice(0, -1).join(' ') };
}

const MOTS_DOUTEUX = /^(m|mr|mme|mlle|monsieur|madame|gardien|gardienne|immo|immobilier|agence|sarl|sas|sci|eurl|salle|sport|rue|du|de|la|le)$/i;
/** Une séparation à faire vérifier : pas exactement deux mots, ou un mot de civilité, de métier, d'adresse ou d'entreprise. PUR. */
export function separationDouteuse(nom: string): boolean {
  const mots = nom.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return mots.length !== 2 || mots.some((m) => MOTS_DOUTEUX.test(m.replace(/[.,]/g, '')));
}

/** Le nom de famille et le prénom d'un apporteur (null : une structure, ou séparé à la main comme telle). PUR. */
export function nomEtPrenom(a: Pick<Apporteur, 'nom' | 'type' | 'nomFamille' | 'prenom'>): { nomFamille: string; prenom: string | null } | null {
  if (estStructure(a)) return null;
  if (a.nomFamille !== undefined && a.nomFamille !== null) {
    return a.nomFamille.trim() === '' ? null : { nomFamille: a.nomFamille.trim(), prenom: a.prenom?.trim() || null };
  }
  return separerNomPrenom(a.nom);
}

/** L'affichage : « NOM Prénom » pour une personne ; le nom tel quel pour une structure (ou un nom sans prénom). PUR. */
export function libelleApporteur(a: Pick<Apporteur, 'nom' | 'type' | 'nomFamille' | 'prenom'>): string {
  const p = nomEtPrenom(a);
  if (p === null || p.prenom === null) return p === null ? a.nom : p.nomFamille;
  return `${p.nomFamille.toLocaleUpperCase('fr-FR')} ${p.prenom}`;
}

/** Le tri : par nom de famille, puis prénom ; une structure par son nom (accents et casse ignorés). PUR, sans modifier l'entrée. */
export function trierApporteurs<T extends Pick<Apporteur, 'id' | 'nom' | 'type' | 'nomFamille' | 'prenom'>>(liste: readonly T[]): T[] {
  const cle = (a: T): [string, string] => { const p = nomEtPrenom(a); return p === null ? [a.nom, ''] : [p.nomFamille, p.prenom ?? '']; };
  const comparer = (x: string, y: string): number => x.localeCompare(y, 'fr', { sensitivity: 'base' });
  return [...liste].sort((a, b) => { const [na, pa] = cle(a); const [nb, pb] = cle(b); return comparer(na, nb) || comparer(pa, pb) || a.id - b.id; });
}

/**
 * « À rattacher » : un EXTERNE sans collègue de rattachement — il ne peut pas être choisi pour une nouvelle location. Un INTERNE n'est
 * jamais « à rattacher » (419 : il n'est rattaché à personne). PUR.
 */
export const aRattacher = (a: Pick<Apporteur, 'collegues' | 'compteId'>): boolean => !estInterne(a) && a.collegues !== undefined && a.collegues.length === 0;

/** 419 — la rémunération du collègue EN VIGUEUR à une date (null : aucune version, ou un interne). PUR. */
export function remunerationADate(a: Pick<Apporteur, 'remunerations' | 'compteId'>, dateIso: string): RemunerationCollegue | null {
  if (estInterne(a)) return null;
  return versionADate(a.remunerations ?? [], dateIso);
}

/**
 * 419 — LA DURÉE saisie : « Indéterminée » (vide, « indeterminee », null) → null ; sinon un nombre d'années ENTIER, 1 au moins ;
 * `undefined` : illisible. PUR.
 */
export function lireDuree(brut: unknown): number | null | undefined {
  if (brut === null || brut === undefined || brut === '' || brut === 'indeterminee') return null;
  const t = typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut.trim() : '';
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= 99 ? n : undefined;
}
export const MOT_DUREE = 'Durée du récurrent : un nombre d’années entier (1 au moins), ou « Indéterminée ».';

/** 419 — vérifie une version de la rémunération du collègue (aucune / mode, taux en %, durée, date d'effet). PUR. */
export function verifierRemuneration(brut: unknown): { ok: true; r: RemunerationCollegue } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (!dateIsoValide(b.depuis)) return { ok: false, motif: 'La date d’effet de la rémunération est obligatoire.' };
  if (b.remunere !== true) return { ok: true, r: { depuis: b.depuis, remunere: false, mode: 'one_shot', taux: 0, tauxGestion: 0, dureeAnnees: null } };
  const mode = dans(MODES_APPORTEUR, b.mode);
  if (mode === null) return { ok: false, motif: 'Le mode de la rémunération : « One shot » ou « Récurrent ».' };
  const taux = lireTauxPourcent(b.taux);
  const tauxGestion = lireTauxPourcent(b.tauxGestion);
  if (taux === undefined) return { ok: false, motif: 'Rémunération — taux sur la location : un pourcentage entre 0 et 100.' };
  if (tauxGestion === undefined) return { ok: false, motif: 'Rémunération — taux sur la gestion : un pourcentage entre 0 et 100.' };
  if ((taux ?? 0) === 0 && (tauxGestion ?? 0) === 0) return { ok: false, motif: 'Rémunération : saisissez au moins un taux (location ou gestion), ou choisissez « Aucune rémunération ».' };
  const duree = mode === 'recurrent' ? lireDuree(b.dureeAnnees) : null;
  if (duree === undefined) return { ok: false, motif: MOT_DUREE };
  return { ok: true, r: { depuis: b.depuis, remunere: true, mode, taux: taux ?? 0, tauxGestion: tauxGestion ?? 0, dureeAnnees: duree } };
}

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
  /** 411 — le texte de l'origine « Personnalisé ». */
  origineContactPrecision?: string;
  /** 413 — le mode de CE bail (null = celui de la règle de l'apporteur à la signature) et son taux sur la gestion, en % (vide = la règle). */
  apporteurMode?: ModeApporteur | null;
  apporteurTauxGestion?: string;
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
  origineContactPrecision: string | null;
  /** 413 — null : la règle de l'apporteur à la date de signature. */
  apporteurMode: ModeApporteur | null;
  apporteurTauxGestion: number | null;
}

const dans = <T extends string>(liste: readonly T[], v: unknown): T | null => (typeof v === 'string' && (liste as readonly string[]).includes(v) ? v as T : null);
const entierPositif = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** Vérifie la saisie reçue (navigateur ou serveur) : la date de signature est obligatoire ; montants ≥ 0 ; taux en %. */
export function verifierActivite(brut: unknown, o: { origineObligatoire?: boolean } = {}): { ok: true; valeurs: ActiviteVerifiee } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const type = dans(TYPES_ACTIVITE, b.type) ?? 'bail';
  if (!dateIsoValide(b.dateSignature)) return { ok: false, motif: 'La date de signature du bail est obligatoire.' };
  // Arno (24/10/2026) — les deux cases sont EXCLUSIVES.
  if (b.mandatGestion === true && b.avecGestion === true) return { ok: false, motif: 'Cochez « Relocation » (portefeuille de gestion) OU « Nouveau mandat de gestion signé (prime) » (nouvelle gestion), pas les deux.' };
  // 🔴 Arno (24/10/2026) — l'origine « Relocation » n'existe qu'avec la case « Relocation » ; jamais avec « Nouvelle gestion ».
  if (b.origineContact === 'relocation' && b.mandatGestion === true) return { ok: false, motif: 'Origine « Relocation » et « Nouvelle gestion » : incohérent. Choisissez l’origine du propriétaire (apporteur, Internet, propriétaire déjà client…).' };
  if (b.origineContact === 'relocation' && b.avecGestion !== true) return { ok: false, motif: 'L’origine « Relocation (portefeuille de gestion) » suppose la case « Relocation » cochée.' };
  const c = verifierCommercial(b, o.origineObligatoire ?? true);
  if (!c.ok) return c;
  const hp = lireMontant(b.honoProprietaireHt);
  const hl = lireMontant(b.honoLocataireHt);
  if (hp === undefined) return { ok: false, motif: 'Honoraires propriétaire HT : un montant en euros (ex. 416,67).' };
  if (hl === undefined) return { ok: false, motif: 'Honoraires locataire HT : un montant en euros (ex. 226,95).' };
  const taux = lireTauxPourcent(b.apporteurTaux);
  if (taux === undefined) return { ok: false, motif: 'Taux de l’apporteur : un pourcentage entre 0 et 100.' };
  const apporteurId = c.valeurs.apporteurId;
  // 413 — le mode et le taux sur la gestion du bail : facultatifs (vides = la règle de l'apporteur à la signature).
  const tauxGestion = lireTauxPourcent(b.apporteurTauxGestion);
  if (tauxGestion === undefined) return { ok: false, motif: 'Taux de l’apporteur sur la gestion : un pourcentage entre 0 et 100.' };
  return {
    ok: true,
    valeurs: {
      type, dateSignature: b.dateSignature, honoProprietaireHt: hp ?? 0, honoLocataireHt: hl ?? 0,
      negociateurId: entierPositif(b.negociateurId), apporteurTaux: apporteurId === null ? null : taux,
      mandatGestion: b.mandatGestion === true, avecGestion: b.avecGestion === true,
      origineProprietaire: dans(ORIGINES, b.origineProprietaire), origineLocataire: dans(ORIGINES, b.origineLocataire),
      ...c.valeurs,
      apporteurMode: apporteurId === null ? null : dans(MODES_APPORTEUR, b.apporteurMode),
      apporteurTauxGestion: apporteurId === null ? null : tauxGestion,
    },
  };
}

export interface ChampsCommerciaux {
  origineContact: OrigineContact | null; collegueId: number | null; apporteurId: number | null;
  commissionApporteur: number | null; primeMode: ModePrime | null; primeMontant: number | null;
  /** 411 — le texte d'une origine « Personnalisé » (obligatoire, 80 caractères au plus) ; `null` pour toute autre origine. */
  origineContactPrecision: string | null;
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
  const precision = origineContact === 'personnalise' && typeof b.origineContactPrecision === 'string'
    ? b.origineContactPrecision.replace(/\s+/g, ' ').trim() : '';
  if (origineContact === 'personnalise' && precision === '') return { ok: false, motif: 'Origine « Personnalisé » : saisissez l’origine du contact.' };
  if (precision.length > PRECISION_ORIGINE_MAX) return { ok: false, motif: `Origine personnalisée : ${PRECISION_ORIGINE_MAX} caractères au plus.` };
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
    origineContactPrecision: origineContact === 'personnalise' ? precision : null,
  } };
}

/** Vérifie un apporteur nouveau (nom, type, taux par défaut en %, coût fixe mensuel en €, date d'effet). */
export const MOT_COLLEGUE_OBLIGATOIRE = 'Un partenaire externe doit être rattaché à un collègue (de qui vient ce contact) : choisissez le collègue de rattachement.';
export function verifierApporteur(brut: unknown, o: { collegueObligatoire?: boolean } = {}): { ok: true; nom: string; type: TypeApporteur; taux: number; coutFixe: number; depuis: string;
  societe: string | null; telephone: string | null; email: string | null; collegueId: number | null; mode: ModeApporteur; tauxGestion: number;
  /** 419 — un INTERNE (`compteId`, rattaché à personne) ; la durée du récurrent (null : indéterminée). */
  compteId: number | null; dureeAnnees: number | null } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const coord = verifierCoordonnees(b);
  if (!coord.ok) return coord;
  // 🔴 Arno (24/10/2026, 419) — INTERNE : lié à un compte (le nom vient du compte), aucun collègue ; EXTERNE : collègue obligatoire.
  const interne = b.interne === true;
  const compteId = interne ? entierPositif(b.compteId) : null;
  if (interne && compteId === null) return { ok: false, motif: 'Un apporteur interne est lié à son compte de l’interface : choisissez le compte.' };
  const collegueId = interne ? null : entierPositif(b.collegueId);
  if (!interne && o.collegueObligatoire && collegueId === null) return { ok: false, motif: MOT_COLLEGUE_OBLIGATOIRE };
  const nom = typeof b.nom === 'string' ? b.nom.replace(/\s+/g, ' ').trim() : interne ? 'compte' : '';
  if (nom === '') return { ok: false, motif: 'Le nom de l’apporteur est obligatoire.' };
  const type = interne ? 'collaborateur' : dans(TYPES_APPORTEUR, b.type);
  if (type === null) return { ok: false, motif: 'Le type de l’apporteur : partenaire externe, agence, Internet ou collaborateur.' };
  const taux = lireTauxPourcent(b.taux);
  if (taux === undefined) return { ok: false, motif: 'Taux de commission : un pourcentage entre 0 et 100.' };
  const cout = lireMontant(b.coutFixe);
  if (cout === undefined) return { ok: false, motif: 'Coût fixe mensuel : un montant en euros.' };
  const depuis = dateIsoValide(b.depuis) ? b.depuis : null;
  if (depuis === null) return { ok: false, motif: 'La date d’effet du taux est obligatoire.' };
  // 413 — le mode (défaut « One shot ») et le taux sur la gestion (vide = 0 %).
  const mode = b.mode === undefined || b.mode === null || b.mode === '' ? 'one_shot' : dans(MODES_APPORTEUR, b.mode);
  if (mode === null) return { ok: false, motif: 'Le mode de la commission : « One shot » ou « Récurrent ».' };
  const tauxGestion = lireTauxPourcent(b.tauxGestion);
  if (tauxGestion === undefined) return { ok: false, motif: 'Taux sur la gestion : un pourcentage entre 0 et 100.' };
  const dureeAnnees = mode === 'recurrent' ? lireDuree(b.dureeAnnees) : null;
  if (dureeAnnees === undefined) return { ok: false, motif: MOT_DUREE };
  return { ok: true, nom, type, taux: taux ?? 0, coutFixe: cout ?? 0, depuis, ...coord.valeurs, collegueId, mode, tauxGestion: tauxGestion ?? 0, compteId, dureeAnnees };
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
  // Arno (24/10/2026) — le local : facultatif (vide = le montant du logement), un montant en euros s'il est saisi.
  const plo = lireMontant(b.primeLocal);
  if (plo === undefined) return { ok: false, motif: 'Prime de nouvelle gestion (local) : un montant en euros.' };
  return { ok: true, regle: { depuis: b.depuis, tauxNegociateur: taux, primeLogement: pl, primeParking: pp, primeLocal: plo } };
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
