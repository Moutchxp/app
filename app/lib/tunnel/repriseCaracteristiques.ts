/**
 * ══ 🔴🔴 LOT REPRISE-CARACTERISTIQUES (Arno, 17/10/2026) — LES CARACTÉRISTIQUES DU BIEN, REPRISES À LA MÊME ADRESSE ══════
 *
 * ARNO : « Nouvelle analyse à la MÊME adresse : l'écran de description arrive pré-rempli avec les critères déjà validés
 * lors de la dernière demande de certificat à cette adresse. AUTRE adresse : tous les champs vides. A, puis B, puis A :
 * les critères les plus récents saisis pour A. »
 *   - « Même adresse » = même identifiant BAN, à défaut la même adresse normalisée ; JAMAIS les seules coordonnées GPS.
 *   - Les champs repris restent modifiables ; une ligne discrète le dit (« Caractéristiques reprises de votre analyse du
 *     JJ/MM — vérifiez-les »), et aucune ligne quand rien n'est repris.
 *   - Même internaute seulement : son compte s'il est connecté (route serveur), sinon la session en cours sur cet
 *     appareil (`sessionStorage`, lecture et écriture protégées, repli sur des champs vides).
 *   - Seules les caractéristiques du bien : type, surface, pièces, époque, balcon, terrasse, jardin. Les coordonnées, la
 *     résidence principale et le consentement suivent leurs règles, inchangées.
 *   - Un champ repris devenu invalide (valeur hors liste, nombre absurde) reste VIDE, sans bloquer les autres.
 *
 * PUR : aucune base, aucun réseau. Chargeable dans le navigateur ET par la route serveur (une seule règle).
 */

export const TYPES_BIEN = ['Maison', 'Appartement', 'Studio', 'Duplex', 'Triplex', 'Loft'] as const;

export const EPOQUES = [
  'Inconnu', 'Avant 1850', 'De 1850 à 1913', 'De 1914 à 1947',
  'De 1948 à 1969', 'De 1970 à 1980', 'De 1981 à 1991', 'De 1992 à 2000',
  'De 2001 à 2010', 'De 2011 à 2020', 'À partir de 2021',
] as const;

/** Les champs de l'écran, avec leurs valeurs « vides » exactes (celles de l'écran neuf). */
export interface CaracteristiquesBien {
  typeBien: string;
  surface: string;
  nbPieces: number;
  epoque: string;
  terrasse: boolean | null;
  balcon: boolean | null;
  jardin: boolean | null;
}

export const CARACTERISTIQUES_VIDES: CaracteristiquesBien = {
  typeBien: '', surface: '', nbPieces: 0, epoque: '', terrasse: null, balcon: null, jardin: null,
};

/** Bornes de plausibilité : au-delà, la valeur reprise est tenue pour invalide (le champ reste vide). */
const SURFACE_MAX_M2 = 100_000;
const PIECES_MAX = 200;

/** Les clés d'une adresse : l'identifiant BAN quand on le connaît, et toujours le libellé normalisé. */
export interface ClesAdresse { ban: string | null; texte: string | null }

/** « 12, Rue de l’Église » et « 12 rue de l'eglise » → « 12 rue de l eglise ». PUR. */
export function normaliserAdresse(libelle: string | null | undefined): string | null {
  const t = (libelle ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return t === '' ? null : t;
}

export function clesAdresse(cleBan: string | null | undefined, libelle: string | null | undefined): ClesAdresse {
  const ban = typeof cleBan === 'string' && cleBan.trim() !== '' ? cleBan.trim().toLowerCase() : null;
  return { ban, texte: normaliserAdresse(libelle) };
}

/** Même adresse : même identifiant BAN si les deux le portent, sinon même adresse normalisée. Jamais vide = vide. PUR. */
export function memeAdresse(a: ClesAdresse, b: ClesAdresse): boolean {
  if (a.ban !== null && b.ban !== null) return a.ban === b.ban;
  return a.texte !== null && a.texte === b.texte;
}

/** Valide CHAMP PAR CHAMP ce qui est repris : un champ invalide reste vide, les autres sont gardés. PUR. */
export function validerCaracteristiques(brut: unknown): CaracteristiquesBien {
  const o = (brut !== null && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const typeBien = typeof o.typeBien === 'string' && (TYPES_BIEN as readonly string[]).includes(o.typeBien) ? o.typeBien : '';
  const epoque = typeof o.epoque === 'string' && (EPOQUES as readonly string[]).includes(o.epoque) ? o.epoque : '';
  const surfaceTexte = typeof o.surface === 'number' ? String(o.surface) : typeof o.surface === 'string' ? o.surface.trim() : '';
  const surfaceNombre = Number(surfaceTexte.replace(',', '.'));
  const surface = surfaceTexte !== '' && Number.isFinite(surfaceNombre) && surfaceNombre > 0 && surfaceNombre <= SURFACE_MAX_M2 ? surfaceTexte : '';
  const n = typeof o.nbPieces === 'number' ? o.nbPieces : typeof o.nbPieces === 'string' && /^\d+$/.test(o.nbPieces) ? Number(o.nbPieces) : NaN;
  const nbPieces = Number.isInteger(n) && n > 0 && n <= PIECES_MAX ? n : 0;
  const oui = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
  return { typeBien, surface, nbPieces, epoque, terrasse: oui(o.terrasse), balcon: oui(o.balcon), jardin: oui(o.jardin) };
}

export function sontVides(c: CaracteristiquesBien): boolean {
  return c.typeBien === '' && c.surface === '' && c.nbPieces === 0 && c.epoque === ''
    && c.terrasse === null && c.balcon === null && c.jardin === null;
}

export function memesCaracteristiques(a: CaracteristiquesBien, b: CaracteristiquesBien): boolean {
  return a.typeBien === b.typeBien && a.surface === b.surface && a.nbPieces === b.nbPieces && a.epoque === b.epoque
    && a.terrasse === b.terrasse && a.balcon === b.balcon && a.jardin === b.jardin;
}

/** Une demande de certificat passée : ses clés d'adresse, ses caractéristiques, sa date (ISO). */
export interface EntreeReprise { cles: ClesAdresse; caracteristiques: unknown; le: string }

/** Ce que l'écran reçoit : les champs (validés) et la date de l'analyse d'origine ; `null` = rien à reprendre. */
export interface Reprise { caracteristiques: CaracteristiquesBien; le: string }

/**
 * La reprise pour CETTE adresse : la demande la PLUS RÉCENTE à la même adresse (A → B → A : celle de A la plus récente).
 * Champs validés un par un ; tout invalide → rien à reprendre (`null`, pas de ligne). PUR.
 */
export function choisirReprise(historique: readonly EntreeReprise[], cles: ClesAdresse): Reprise | null {
  const candidates = historique
    .filter((e) => memeAdresse(e.cles, cles) && !Number.isNaN(new Date(e.le).getTime()))
    .sort((a, b) => new Date(b.le).getTime() - new Date(a.le).getTime());
  const e = candidates[0];
  if (!e) return null;
  const caracteristiques = validerCaracteristiques(e.caracteristiques);
  return sontVides(caracteristiques) ? null : { caracteristiques, le: e.le };
}

/** « Caractéristiques reprises de votre analyse du 17/10 — vérifiez-les » (jour de Paris). PUR. */
export function phraseReprise(le: string): string {
  const jjmm = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(le));
  return `Caractéristiques reprises de votre analyse du ${jjmm} — vérifiez-les`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   NON CONNECTÉ : LA SESSION EN COURS SUR CET APPAREIL (sessionStorage)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CLE_SESSION_REPRISE = 'svav.repriseCaracteristiques.v1';
const MAX_ENTREES_SESSION = 20;

type Rangement = Pick<Storage, 'getItem' | 'setItem'>;

/** Lit l'historique de la session ; toute erreur (stockage bloqué, contenu abîmé) → historique vide. */
export function lireHistoriqueSession(stockage: Rangement | null | undefined): EntreeReprise[] {
  try {
    const brut = stockage?.getItem(CLE_SESSION_REPRISE);
    if (!brut) return [];
    const liste = JSON.parse(brut) as unknown;
    if (!Array.isArray(liste)) return [];
    return liste.filter((e): e is EntreeReprise => e !== null && typeof e === 'object'
      && typeof (e as EntreeReprise).le === 'string' && typeof (e as EntreeReprise).cles === 'object' && (e as EntreeReprise).cles !== null);
  } catch {
    return [];
  }
}

/** Ajoute la demande qu'on vient de valider (la plus récente en tête) ; un échec d'écriture est silencieux. */
export function ajouterHistoriqueSession(stockage: Rangement | null | undefined, entree: EntreeReprise): void {
  try {
    if (!stockage) return;
    const liste = [entree, ...lireHistoriqueSession(stockage)].slice(0, MAX_ENTREES_SESSION);
    stockage.setItem(CLE_SESSION_REPRISE, JSON.stringify(liste));
  } catch {
    /* stockage plein ou interdit : la reprise n'aura simplement pas lieu */
  }
}
