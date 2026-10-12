import { normaliserTexte } from './annuaire';
import { cleEmail, cleTelephone } from './syndics';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — CE SYNDIC EXISTE-T-IL DÉJÀ ? ═══════════════════════════
 *
 * MODULE PUR (navigateur ET serveur : le bandeau pendant la saisie et le contrôle au « Valider » disent la même chose).
 *
 * DEMANDE D'ARNO (12/10/2026) : à la création d'un syndic, le comparer à TOUS ceux de l'annuaire sur quatre critères —
 *   ① le NOM du cabinet (sans casse, sans accents, sans ponctuation ni mots creux ; les noms très proches aussi) ;
 *   ② l'ADRESSE postale (numéro + voie + code postal + ville normalisés : « rue » / « r. », « avenue » / « av. »,
 *      bis / ter, espaces) ;
 *   ③ l'E-MAIL (générique du cabinet ET e-mails de ses contacts, sans casse) ;
 *   ④ le TÉLÉPHONE (standard ET téléphones des contacts : +33 / 0, espaces, points).
 * Un seul critère suffit pour AVERTIR — jamais pour interdire : deux cabinets peuvent partager une adresse ou un
 * standard (« Créer quand même » reste possible, et la création est alors tracée avec le critère ignoré).
 *
 * Ce module COMPLÈTE l'existant (doublons de contacts, coordonnées déjà utilisées, parcelle, conflit entre deux
 * syndics) : il ne remplace rien.
 */

/* ══ ① LE NOM DU CABINET ══════════════════════════════════════════════════════════════════════════════════════════ */

/** Les mots qui ne distinguent pas un cabinet d'un autre : formes juridiques, « cabinet », « syndic », articles. */
export const MOTS_CREUX_CABINET: ReadonlySet<string> = new Set([
  'cabinet', 'syndic', 'syndics', 'syndicat', 'sarl', 'sas', 'sasu', 'sa', 'eurl', 'sci', 'snc', 'scp', 'selarl',
  'societe', 'ste', 'ets', 'etablissements', 'groupe', 'agence', 'gestion', 'immobilier', 'immobiliere', 'immo',
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'en', 'a', 'au', 'aux',
]);

/** La clé d'un nom de cabinet : « Cabinet FONCIA S.A.S. » = « foncia ». Vide si rien ne reste. PUR. */
export function cleNomCabinet(nom: string | null | undefined): string {
  const mots = normaliserTexte((nom ?? '').replace(/\./g, '')).split(' ').filter((m) => m !== '');
  const utiles = mots.filter((m) => !MOTS_CREUX_CABINET.has(m));
  /* Un nom fait QUE de mots creux (« Cabinet Gestion Immobilière ») garde ses mots : sinon il ne ressemblerait à rien. */
  return (utiles.length > 0 ? utiles : mots).join(' ');
}

/** Distance d'édition (Levenshtein). PUR. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prec[0];
    prec[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const haut = prec[j];
      prec[j] = Math.min(prec[j] + 1, prec[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = haut;
    }
  }
  return prec[b.length];
}

/**
 * Deux noms de cabinet : `identique` (même clé), `proche` (une faute de frappe, un mot de plus : « Foncia » et
 * « Foncia Courbevoie », « Citya » et « Cytia »), ou `null`. PUR.
 */
export function rapprocherNoms(a: string | null | undefined, b: string | null | undefined): 'identique' | 'proche' | null {
  const x = cleNomCabinet(a);
  const y = cleNomCabinet(b);
  if (x === '' || y === '') return null;
  if (x === y) return 'identique';
  const sx = x.replace(/ /g, '');
  const sy = y.replace(/ /g, '');
  if (sx === sy) return 'identique';
  /* Un nom contenu dans l'autre, mot pour mot (« foncia » ⊂ « foncia courbevoie ») — au moins 4 lettres. */
  const motsX = x.split(' ');
  const motsY = y.split(' ');
  const contenu = (p: string[], g: string[]) => p.join('').length >= 4 && p.every((m) => g.includes(m));
  if (contenu(motsX, motsY) || contenu(motsY, motsX)) return 'proche';
  /* Une faute de frappe : au plus une erreur par tranche de six lettres, et jamais sur un nom de moins de 5 lettres. */
  const n = Math.max(sx.length, sy.length);
  if (Math.min(sx.length, sy.length) >= 5 && distance(sx, sy) <= Math.max(1, Math.floor(n / 6))) return 'proche';
  return null;
}

/* ══ ② L'ADRESSE POSTALE ═════════════════════════════════════════════════════════════════════════════════════════ */

/** Les abréviations de type de voie, ramenées au mot entier. */
const VOIES: Readonly<Record<string, string>> = {
  r: 'rue', av: 'avenue', ave: 'avenue', avn: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard',
  bvd: 'boulevard', pl: 'place', all: 'allee', al: 'allee', imp: 'impasse', ch: 'chemin', chem: 'chemin',
  rte: 'route', sq: 'square', fg: 'faubourg', fbg: 'faubourg', pas: 'passage', pass: 'passage', qu: 'quai',
  crs: 'cours', res: 'residence', resid: 'residence', st: 'saint', ste: 'sainte', mal: 'marechal', gal: 'general',
  pdt: 'president', prof: 'professeur', dr: 'docteur',
};
/** Les indices de répétition : « 12 bis », « 12bis », « 12 b » sont la même adresse. */
const INDICES: Readonly<Record<string, string>> = { b: 'bis', bis: 'bis', t: 'ter', ter: 'ter', q: 'quater', quater: 'quater' };

/**
 * La clé d'une adresse postale : « 12 bis r. Edith-Cavell, 92400 Courbevoie » = « 12bis|rue edith cavell|92400|courbevoie ».
 * Vide si la voie manque. Le code postal ou la ville peuvent manquer : la clé compare alors ce qui est là. PUR.
 */
export function cleAdressePostale(voie: string | null | undefined, codePostal?: string | null, ville?: string | null): string {
  const mots = normaliserTexte(voie).split(' ').filter((m) => m !== '');
  let numero = '';
  const m0 = /^(\d+)([a-z]*)$/.exec(mots[0] ?? '');
  if (m0 !== null) {
    numero = m0[1].replace(/^0+(?=\d)/, '');
    mots.shift();
    let indice = m0[2] !== '' ? INDICES[m0[2]] ?? '' : '';
    if (indice === '' && mots[0] !== undefined && INDICES[mots[0]] !== undefined && mots.length > 1) indice = INDICES[mots.shift() as string];
    numero += indice;
  }
  const rue = mots.map((m) => VOIES[m] ?? m).join(' ');
  if (rue === '') return '';
  const cp = (codePostal ?? '').replace(/\s/g, '');
  const commune = normaliserTexte(ville).replace(/\bcedex( \d+)?\b/g, '').replace(/\s+/g, ' ').trim();
  return `${numero}|${rue}|${cp}|${commune}`;
}

/**
 * Deux clés d'adresse désignent-elles la même adresse ? Même numéro et même voie ; puis le code postal s'ils sont
 * connus tous deux, sinon la ville. PUR.
 */
export function memeAdressePostale(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  const [na, ra, ca, va] = a.split('|');
  const [nb, rb, cb, vb] = b.split('|');
  if (na !== nb || ra !== rb || na === '') return false;
  if (ca !== '' && cb !== '') return ca === cb;
  if (va !== '' && vb !== '') return va === vb;
  return false;
}

/* ══ ③ ④ E-MAILS ET TÉLÉPHONES, PUIS LA COMPARAISON ═════════════════════════════════════════════════════════════════ */

/** Un syndic, tel que la comparaison le voit (l'annuaire, ou la saisie en cours). */
export interface SyndicComparable {
  id: number | null;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  /** E-mail générique du cabinet ET e-mails de ses contacts. */
  emails: readonly string[];
  /** Standard(s) ET téléphones des contacts. */
  telephones: readonly string[];
}

export type CritereDoublon = 'nom' | 'nom_proche' | 'adresse' | 'email' | 'telephone';

export interface DoublonSyndic {
  syndic: { id: number; nom: string; ville: string; adresse: string; codePostal: string };
  criteres: CritereDoublon[];
  /** Ce qui correspond, pour le dire : l'e-mail commun, le téléphone commun. */
  email: string | null;
  telephone: string | null;
}

const MOTS_CRITERE: Record<CritereDoublon, string> = {
  nom: 'même nom', nom_proche: 'nom très proche', adresse: 'même adresse', email: 'même e-mail', telephone: 'même téléphone',
};
export const motCritere = (c: CritereDoublon): string => MOTS_CRITERE[c];

/** Les e-mails utiles d'une liste, en clé. */
const emailsCles = (l: readonly string[]): string[] => [...new Set(l.map(cleEmail).filter((e) => e.includes('@')))];
/** Les téléphones utiles d'une liste, en clé (au moins 9 chiffres : un poste ne désigne personne). */
const telsCles = (l: readonly string[]): string[] => [...new Set(l.map(cleTelephone).filter((t) => t.length >= 9))];

/**
 * 🔴 LA COMPARAISON : la saisie contre l'annuaire entier (`id` de la saisie écarté). Rend les syndics qui
 * correspondent sur AU MOINS un critère, les plus nombreux critères d'abord. PUR.
 */
export function doublonsDuSyndic(saisie: SyndicComparable, annuaire: readonly SyndicComparable[]): DoublonSyndic[] {
  const adr = cleAdressePostale(saisie.adresse, saisie.codePostal, saisie.ville);
  const emails = emailsCles(saisie.emails);
  const tels = telsCles(saisie.telephones);
  const out: DoublonSyndic[] = [];
  for (const s of annuaire) {
    if (s.id === null || (saisie.id !== null && s.id === saisie.id)) continue;
    const criteres: CritereDoublon[] = [];
    const n = rapprocherNoms(saisie.nom, s.nom);
    if (n === 'identique') criteres.push('nom');
    else if (n === 'proche') criteres.push('nom_proche');
    if (memeAdressePostale(adr, cleAdressePostale(s.adresse, s.codePostal, s.ville))) criteres.push('adresse');
    const sesEmails = emailsCles(s.emails);
    const email = emails.find((e) => sesEmails.includes(e)) ?? null;
    if (email !== null) criteres.push('email');
    const sesTels = telsCles(s.telephones);
    const telephone = tels.find((t) => sesTels.includes(t)) ?? null;
    if (telephone !== null) criteres.push('telephone');
    if (criteres.length === 0) continue;
    out.push({
      syndic: { id: s.id, nom: s.nom, ville: s.ville, adresse: s.adresse, codePostal: s.codePostal },
      criteres, email, telephone,
    });
  }
  return out.sort((a, b) => b.criteres.length - a.criteres.length || a.syndic.nom.localeCompare(b.syndic.nom, 'fr'));
}

/** L'adresse d'un syndic trouvé, lisible : « 12 rue …, 75008 Paris ». */
export function adresseLisible(d: DoublonSyndic['syndic']): string {
  const lieu = [d.codePostal, d.ville].map((x) => x.trim()).filter((x) => x !== '').join(' ');
  return [d.adresse.trim(), lieu].filter((x) => x !== '').join(', ');
}

/**
 * La ligne du bandeau : « CABINET X — 12 rue …, 75008 Paris — même e-mail (a@b.fr), même téléphone ». PUR.
 * ⚠️ Le syndic est nommé avec sa VILLE quand on la connaît : deux agences Foncia ne se distinguent que par elle.
 */
export function motDoublonSyndic(d: DoublonSyndic): string {
  const nom = d.syndic.ville.trim() !== '' && !normaliserTexte(d.syndic.nom).includes(normaliserTexte(d.syndic.ville))
    ? `${d.syndic.nom} / ${d.syndic.ville}` : d.syndic.nom;
  const adresse = adresseLisible(d.syndic);
  const criteres = d.criteres.map((c) => (c === 'email' && d.email !== null ? `${motCritere(c)} (${d.email})`
    : c === 'telephone' && d.telephone !== null ? `${motCritere(c)} (${d.telephone})` : motCritere(c)));
  return [nom, adresse, criteres.join(', ')].filter((x) => x !== '').join(' — ');
}

export const TITRE_DOUBLON_SYNDIC = 'Ce syndic existe peut-être déjà :';

/**
 * La saisie en cours, vue par la comparaison : le cabinet, ses standards et son e-mail générique, plus les
 * coordonnées de ses contacts. PUR.
 */
export function comparableDeLaSaisie(f: {
  nom: string; adresse: string; codePostal: string; ville: string; email: string; telephones: readonly string[];
  contacts: readonly { coordonnees: readonly { sorte: string; valeur: string }[] }[];
}, id: number | null = null): SyndicComparable {
  const coords = f.contacts.flatMap((c) => c.coordonnees);
  return {
    id, nom: f.nom, adresse: f.adresse, codePostal: f.codePostal, ville: f.ville,
    emails: [f.email, ...coords.filter((k) => k.sorte === 'email').map((k) => k.valeur)],
    telephones: [...f.telephones, ...coords.filter((k) => k.sorte === 'telephone').map((k) => k.valeur)],
  };
}

/** Une saisie « assez remplie » pour comparer : au moins un champ qui compte. */
export function saisieComparable(s: SyndicComparable): boolean {
  return cleNomCabinet(s.nom) !== '' || cleAdressePostale(s.adresse, s.codePostal, s.ville) !== ''
    || emailsCles(s.emails).length > 0 || telsCles(s.telephones).length > 0;
}

/* ══ L'ACCUSÉ DE « CRÉER QUAND MÊME » ═══════════════════════════════════════════════════════════════════════════════ */

/** Ce que l'écran renvoie quand on crée malgré l'avertissement : chaque syndic écarté, et ses critères. */
export interface DoublonIgnore { id: number; criteres: CritereDoublon[] }

/** Tous les doublons trouvés par le serveur sont-ils couverts par l'accusé de l'écran ? PUR. */
export function doublonsCouverts(trouves: readonly DoublonSyndic[], ignores: readonly DoublonIgnore[] | undefined): boolean {
  if (trouves.length === 0) return true;
  if (ignores === undefined) return false;
  return trouves.every((d) => {
    const i = ignores.find((x) => x.id === d.syndic.id);
    return i !== undefined && d.criteres.every((c) => i.criteres.includes(c));
  });
}

/** La trace écrite au journal : « créé malgré : CABINET X (même e-mail, même téléphone) ; … ». PUR. */
export function motTraceIgnore(trouves: readonly DoublonSyndic[]): string {
  return `Syndic créé malgré l’avertissement de doublon : ${trouves
    .map((d) => `${d.syndic.nom} n° ${d.syndic.id} (${d.criteres.map(motCritere).join(', ')})`).join(' ; ')}`;
}
