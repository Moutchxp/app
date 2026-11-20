import { normaliserTexte } from '../gestion/annuaire';

/**
 * ══ 🔴🔴 LE RAPPROCHEMENT D'UNE ADRESSE AVEC LA BASE ADRESSE NATIONALE — LA RÈGLE (Arno, 20/11/2026, « Adresse officielle BAN », lot 2). PUR. ══════
 *
 * UN SEUL MODULE pour toute l'application : le stock, l'import WIPPIMMO, la vérification des saisies et les permis passeront par lui (et par son
 * accès à la base, `banRepo.ts`) — jamais une seconde règle ailleurs. La décision, ici, ne lit rien : elle reçoit l'adresse écrite et les adresses
 * officielles candidates (même commune, même numéro), et dit si le rapprochement est CERTAIN, À VÉRIFIER par un humain, ou INTROUVABLE.
 *
 * LES RÈGLES (validées par Arno le 20/11/2026, mesurées sur la recette : 191 écritures au-dessus de 0,90, aucune fausse ; sous 0,90, de vrais
 * pièges — « 142 avenue Gambetta » / « 142 Rue Gambetta » à 0,53, « 1 rue des Lilas » / « Rue des Lilas d'Espagne » à 0,61) :
 *   · même commune (INSEE), même numéro et même indice (bis, ter, quater) : OBLIGATOIRES — sinon ce n'est pas un candidat ;
 *   · la ressemblance des noms de voie (trigrammes, la mesure de PostgreSQL `pg_trgm`, reproduite ici), le TYPE de voie et les petits mots ôtés des
 *     deux côtés : CERTAIN à partir de 0,90 (`SEUIL_CERTAIN`) ;
 *   · un type de voie CONTRADICTOIRE (« avenue » contre « rue ») n'est JAMAIS certain ;
 *   · une PLAGE de numéros (« 28-32 avenue Marceau ») est TOUJOURS à vérifier : un immeuble à plusieurs adresses officielles ;
 *   · deux candidats au-dessus du seuil : à vérifier (on ne choisit pas au hasard) — sauf si le type écrit les départage (« 3 rue du Ratrait »
 *     n'est pas la « Place du Ratrait », qui porte le même numéro).
 */
export const SEUIL_CERTAIN = 0.9;

/** Les types de voie, leurs abréviations et les fautes courantes → le type écrit en entier. LA table de toute l'application. */
export const TYPES_VOIE: Readonly<Record<string, string>> = {
  avenue: 'avenue', av: 'avenue', ave: 'avenue', avn: 'avenue', avenu: 'avenue', avneue: 'avenue', aveune: 'avenue', avnue: 'avenue', avnee: 'avenue',
  avene: 'avenue', avenus: 'avenue', aveneu: 'avenue', avennue: 'avenue', avvenue: 'avenue',
  boulevard: 'boulevard', bd: 'boulevard', bld: 'boulevard', blvd: 'boulevard', bvd: 'boulevard', boul: 'boulevard', boulvard: 'boulevard', bouelvard: 'boulevard', boulevrad: 'boulevard',
  rue: 'rue', r: 'rue', reu: 'rue',
  place: 'place', pl: 'place', plce: 'place',
  allee: 'allee', all: 'allee', al: 'allee',
  impasse: 'impasse', imp: 'impasse',
  chemin: 'chemin', ch: 'chemin', che: 'chemin', chem: 'chemin',
  square: 'square', sq: 'square',
  quai: 'quai', qu: 'quai',
  route: 'route', rte: 'route',
  cours: 'cours', crs: 'cours',
  passage: 'passage', pass: 'passage', pas: 'passage',
  faubourg: 'faubourg', fbg: 'faubourg', fg: 'faubourg',
  villa: 'villa', cite: 'cite', residence: 'residence', res: 'residence', sentier: 'sentier', sen: 'sentier', promenade: 'promenade', prom: 'promenade',
  esplanade: 'esplanade', parvis: 'parvis', rond: 'rond', hameau: 'hameau', ham: 'hameau', voie: 'voie', mail: 'mail',
};
/** Les petits mots qui ne distinguent jamais deux voies (« boulevard de Magenta » = « boulevard Magenta »). */
export const PETITS_MOTS: ReadonlySet<string> = new Set(['du', 'de', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et']);
/** Les abréviations des noms (« St », « Gal ») → le mot entier. */
export const ABREGES: Readonly<Record<string, string>> = { st: 'saint', ste: 'sainte', gal: 'general', gen: 'general', mal: 'marechal', pdt: 'president', dr: 'docteur' };
const INDICES: Readonly<Record<string, string>> = { bis: 'bis', b: 'bis', ter: 'ter', t: 'ter', quater: 'quater', q: 'quater' };

/** L'indice écrit en entier (« b » → « bis », « t » → « ter ») ; `null` : aucun. Les deux côtés (écriture et BAN) passent par lui. PUR. */
export function indiceNormalise(s: string | null | undefined): string | null {
  const x = normaliserTexte(s);
  return x === '' ? null : (INDICES[x] ?? x);
}

export interface AdresseAnalysee {
  /** le numéro (le premier d'une plage) ; `null` : aucun numéro */
  numero: number | null;
  indice: string | null;
  /** « 28-32 avenue Marceau » : plusieurs numéros — toujours à vérifier */
  plage: boolean;
  /** le type de voie écrit (en entier) ; `null` : absent */
  type: string | null;
  /** le nom de la voie comparé : sans type, sans petits mots, abréviations développées */
  voie: string;
}

/** Ce qui suit « / » et ce qui est entre parenthèses (des noms, pas des adresses), le code postal et ce qui le suit : ôtés. PUR. */
export function nettoyerEcriture(texte: string | null | undefined): string {
  return (texte ?? '').split('/')[0].replace(/\([^)]*\)?/g, ' ').replace(/,?\s*\b\d{5}\b[\s\S]*$/, ' ').replace(/\s+/g, ' ').trim();
}

/** Le nom d'une voie, prêt à comparer : normalisé, type de tête ôté (rendu à part), petits mots ôtés, abréviations développées. PUR. */
export function voieComparable(nom: string | null | undefined): { type: string | null; voie: string } {
  const mots = normaliserTexte(nom).split(' ').filter((m) => m !== '');
  const type = mots.length > 1 && TYPES_VOIE[mots[0]] !== undefined ? TYPES_VOIE[mots.shift()!] : null;
  return { type, voie: mots.filter((m) => !PETITS_MOTS.has(m)).map((m) => ABREGES[m] ?? m).join(' ') };
}

/** L'ANALYSE d'une adresse écrite (et de la commune connue, pour l'ôter en fin de texte). PUR. */
export function analyserAdresse(texte: string | null | undefined, commune: string | null = null): AdresseAnalysee {
  const brut = nettoyerEcriture(texte);
  const plage = /^\s*\d+\s*(?:bis|ter|[bt])?\s*(?:-|–|à|au)\s*\d+/i.test(brut);
  let mots = normaliserTexte(brut).split(' ').filter((m) => m !== '');
  const c = normaliserTexte(commune).split(' ').filter((m) => m !== '');
  if (c.length > 0 && mots.length > c.length + 1 && c.every((m, i) => mots[mots.length - c.length + i] === m)) mots = mots.slice(0, mots.length - c.length);
  const colle = /^(\d+)(bis|ter|quater|[btq])$/.exec(mots[0] ?? ''); // « 12bis » → « 12 bis »
  if (colle !== null) mots.splice(0, 1, colle[1], colle[2]);
  if (!/^\d+$/.test(mots[0] ?? '')) return { numero: null, indice: null, plage: false, type: null, voie: voieComparable(mots.join(' ')).voie };
  const numero = Number(mots.shift());
  let indice: string | null = null;
  if (mots.length > 1 && INDICES[mots[0]] !== undefined) indice = INDICES[mots.shift()!];
  if (plage) while (/^\d+$/.test(mots[0] ?? '') || INDICES[mots[0] ?? ''] !== undefined) mots.shift(); // « 28 32 avenue … » → « avenue … »
  const v = voieComparable(mots.join(' '));
  return { numero, indice, plage, type: v.type, voie: v.voie };
}

/** Les trigrammes d'un texte, exactement comme `pg_trgm` : chaque mot (lettres et chiffres) encadré « ␣␣mot␣ ». PUR. */
function trigrammes(s: string): Set<string> {
  const out = new Set<string>();
  for (const mot of s.toLowerCase().split(/[^a-z0-9]+/).filter((m) => m !== '')) {
    const p = `  ${mot} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** La ressemblance de deux textes (0 à 1), la `similarity()` de `pg_trgm` : trigrammes communs / trigrammes de l'un ou de l'autre. PUR. */
export function ressemblance(a: string, b: string): number {
  const ta = trigrammes(a); const tb = trigrammes(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let communs = 0;
  for (const t of ta) if (tb.has(t)) communs++;
  return communs / (ta.size + tb.size - communs);
}

/** Une adresse officielle candidate (lue dans la BAN locale). */
export interface CandidatBan {
  /** l'identifiant officiel (`cle_d_interoperabilite`, celui de l'auto-complétion) */
  id: string;
  numero: number;
  suffixe: string | null;
  nomVoie: string;
  insee: string;
  commune: string;
  x: number | null;
  y: number | null;
}

export type StatutRapprochement = 'certain' | 'a_verifier' | 'introuvable';
export interface PropositionBan extends CandidatBan { score: number; libelle: string; typeContradictoire: boolean }
export interface Rapprochement {
  statut: StatutRapprochement;
  /** pourquoi (en clair, pour la file « Adresses à vérifier » et le rapport) */
  motif: string;
  /** l'adresse retenue (certain) ou la meilleure proposition (à vérifier) ; `null` : aucune */
  ban: PropositionBan | null;
  score: number | null;
  /** les propositions, de la plus ressemblante à la moins (3 au plus) */
  propositions: PropositionBan[];
  analyse: AdresseAnalysee;
}

/** Le libellé officiel : « 54 Avenue Puvis De Chavannes », « 12 ter Rue des Pavillons ». PUR. */
export const libelleOfficiel = (c: Pick<CandidatBan, 'numero' | 'suffixe' | 'nomVoie'>): string =>
  [String(c.numero), indiceNormalise(c.suffixe) ?? '', c.nomVoie.trim()].filter((x) => x !== '').join(' ');

/**
 * LA DÉCISION. `candidats` : les adresses officielles de la commune À CE NUMÉRO (tous indices) — `null` quand la commune est absente de la BAN
 * locale. PUR.
 */
export function deciderRapprochement(analyse: AdresseAnalysee, candidats: readonly CandidatBan[] | null): Rapprochement {
  const sans = (statut: StatutRapprochement, motif: string, propositions: PropositionBan[] = []): Rapprochement =>
    ({ statut, motif, ban: propositions[0] ?? null, score: propositions[0]?.score ?? null, propositions, analyse });
  if (analyse.numero === null) return sans('introuvable', 'Adresse sans numéro : une copropriété est un immeuble précis.');
  if (candidats === null) return sans('introuvable', 'Commune absente de la Base Adresse locale.');
  const memeIndice = candidats.filter((c) => c.numero === analyse.numero && indiceNormalise(c.suffixe) === analyse.indice);
  if (memeIndice.length === 0) {
    return sans('introuvable', `Aucune adresse officielle au ${analyse.numero}${analyse.indice ? ` ${analyse.indice}` : ''} dans cette commune.`);
  }
  const propositions = memeIndice.map((c) => {
    const v = voieComparable(c.nomVoie);
    return { ...c, score: ressemblance(analyse.voie, v.voie), libelle: libelleOfficiel(c), typeContradictoire: analyse.type !== null && v.type !== null && analyse.type !== v.type };
  // un candidat de type CONTRADICTOIRE (« Place du Ratrait » pour « 3 rue du Ratrait ») passe après ceux qui ne contredisent pas l'écriture, et
  // ne rend jamais l'adresse ambiguë ; sans type écrit, deux voies homonymes de types différents restent à vérifier
  }).sort((a, b) => Number(a.typeContradictoire) - Number(b.typeContradictoire) || b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
  const [p] = propositions;
  const second = propositions.slice(1).find((x) => !x.typeContradictoire);
  if (analyse.plage) return sans('a_verifier', 'Plage de numéros : un immeuble à plusieurs adresses officielles, à vérifier par un humain.', propositions);
  if (p.score < SEUIL_CERTAIN) return sans('a_verifier', `Nom de voie trop différent (ressemblance ${p.score.toFixed(2)} sous ${SEUIL_CERTAIN.toFixed(2)}).`, propositions);
  if (p.typeContradictoire) return sans('a_verifier', 'Type de voie contradictoire (par exemple « avenue » contre « rue ») : jamais certain.', propositions);
  if (second !== undefined && second.score >= SEUIL_CERTAIN) return sans('a_verifier', 'Plusieurs adresses officielles se ressemblent : on ne choisit pas au hasard.', propositions);
  return { statut: 'certain', motif: `Même commune, même numéro et même indice ; voie ressemblante à ${p.score.toFixed(2)}.`, ban: p, score: p.score, propositions, analyse };
}
