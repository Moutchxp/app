import { normaliserTexte } from './annuaire';

/**
 * ══ 🔴🔴 COPROPRIÉTÉS EN DOUBLE PAR VARIANTES D'ADRESSE (Arno, 19/11/2026). PUR. ════════════════════════════════════════════════════════════════
 *
 * LE CAS RÉEL : six « copropriétés » pour le 54 avenue Puvis de Chavannes, 92400 Courbevoie — « 54 avenue du Puvis de Chavannes / AUGIER »,
 * « 54 avenue Puvis de Chavannes », « … (HARY) », « 54 avenue puvis de Chavannes, 92400, Courbevoie », « 54 Avneue Puvis de Chavannes »,
 * « 54 Puvis de Chavannes ». La clé d'immeuble (`cleImmeuble` = `normaliserTexte`, annuaire.ts:44) n'efface que la casse, les accents et la
 * ponctuation : chaque écriture devient sa propre copropriété.
 *
 * CE MODULE NE CHANGE PAS LA CLÉ D'IMMEUBLE (elle relie déjà les biens, les syndics, les digicodes, les AG) : il calcule une SIGNATURE TOLÉRANTE,
 * qui sert UNIQUEMENT à PROPOSER un regroupement (« Ces N fiches semblent être la même copropriété — Regrouper ? »). JAMAIS de fusion automatique :
 * c'est Arno qui regroupe, d'un clic confirmé.
 *
 * LA SIGNATURE ignore : ce qui suit « / » et ce qui est entre parenthèses (« / AUGIER », « (HARY) » : des noms, pas des adresses) ; le code postal
 * et tout ce qui le suit, la commune en fin d'adresse ; les petits mots (« du », « de », « de la », « des »…) ; le pluriel ; le TYPE de voie, rangé
 * à part et corrigé des fautes courantes (« avneue », « aveune », « av. », « bd »…). Le NUMÉRO (avec bis/ter) compte toujours : le 56 n'est jamais
 * proposé avec le 54.
 *
 * DEUX ÉCRITURES SONT COMPATIBLES quand leur signature est la même ET qu'elles ne se contredisent ni sur le type de voie (« rue » contre
 * « avenue ») ni sur le code postal ni sur la parcelle cadastrale — une valeur INCONNUE ne contredit rien, mais une écriture sans type (ou sans
 * code postal, ou sans parcelle) n'est rattachée que si le groupe n'hésite pas entre deux valeurs.
 */

/** Les fautes et abréviations courantes du type de voie → le type écrit en entier. */
const TYPES_VOIE: Readonly<Record<string, string>> = {
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
/** Les petits mots qui ne distinguent jamais deux adresses (« du Puvis de Chavannes » = « Puvis de Chavannes »). */
const PETITS_MOTS = new Set(['du', 'de', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et']);
const ABREGES: Readonly<Record<string, string>> = { st: 'saint', ste: 'sainte', gal: 'general', gen: 'general', mal: 'marechal', pdt: 'president', dr: 'docteur' };
const INDICES = new Set(['bis', 'ter', 'quater', 'b', 't', 'q']);
const INDICE_ENTIER: Readonly<Record<string, string>> = { b: 'bis', t: 'ter', q: 'quater' };

export interface AdresseTolerante {
  /** la signature : numéro (et indice) + mots de la voie, sans type ni petits mots — `''` quand il n'y a pas de numéro (rien n'est proposé) */
  signature: string;
  /** le type de voie, écrit en entier ; `null` : absent de l'écriture */
  type: string | null;
}

/** Le singulier d'un mot (« chavannes » → « chavanne ») : la forme qu'on compare. PUR. */
const singulier = (m: string): string => (m.length > 3 && /[^s]s$/.test(m) ? m.slice(0, -1) : m);

/**
 * LA SIGNATURE TOLÉRANTE d'une écriture d'immeuble (et de la commune connue de ses biens, pour l'ôter en fin d'adresse). PUR.
 * « 54 avenue du Puvis de Chavannes / AUGIER » et « 54 Avneue Puvis de Chavannes » → { signature: '54 puvi chavanne', type: 'avenue' }.
 */
export function adresseTolerante(libelle: string | null | undefined, commune: string | null = null): AdresseTolerante {
  let brut = (libelle ?? '').split('/')[0].replace(/\([^)]*\)?/g, ' ');
  brut = brut.replace(/\b\d{5}\b[\s\S]*$/, ' '); // le code postal, et la commune qui le suit
  let mots = normaliserTexte(brut).split(' ').filter((m) => m !== '');
  const c = normaliserTexte(commune).split(' ').filter((m) => m !== '');
  // la commune écrite en fin d'adresse (« 54 rue X Courbevoie ») : ôtée seulement si la voie garde au moins un mot après le numéro
  if (c.length > 0 && mots.length > c.length + 1 && c.every((m, i) => mots[mots.length - c.length + i] === m)) mots = mots.slice(0, mots.length - c.length);
  const colle = /^(\d+)(bis|ter|quater|[btq])$/.exec(mots[0] ?? ''); // « 12bis » → « 12 bis »
  if (colle !== null) mots.splice(0, 1, colle[1], colle[2]);
  const numero = /^\d+$/.test(mots[0] ?? '') ? mots.shift()! : null;
  if (numero === null) return { signature: '', type: null };
  const tete = [String(Number(numero))];
  if (mots.length > 1 && INDICES.has(mots[0])) { const i = mots.shift()!; tete.push(INDICE_ENTIER[i] ?? i); }
  // le premier mot de type de voie rencontré (« avneue » → avenue) ; s'il est en tête, il sort de la signature
  let type: string | null = null;
  if (mots.length > 1 && TYPES_VOIE[mots[0]] !== undefined) type = TYPES_VOIE[mots.shift()!];
  const voie = mots.filter((m) => !PETITS_MOTS.has(m)).map((m) => singulier(ABREGES[m] ?? m));
  if (voie.length === 0) return { signature: '', type };
  return { signature: [...tete.filter((x) => x !== ''), ...voie].join(' '), type };
}

export interface FicheARegrouper {
  /** la clé d'immeuble de la ligne (`cleImmeuble`) */
  cle: string;
  /** l'écriture d'immeuble (ce qui s'affiche) */
  immeuble: string;
  codePostal: string | null;
  commune: string | null;
  /** la fiche est-elle déjà enregistrée (« fiche à créer » sinon) */
  declaree: boolean;
  nbBiens: number;
  /** la parcelle cadastrale, quand elle est connue (la Base Adresse locale et le cadastre la donnent) ; `null` : inconnue */
  parcelle?: string | null;
}

export interface PropositionRegroupement {
  /** les clés des fiches, triées : ce qui identifie la proposition (et la mémoire « Ignorer ») */
  cles: string[];
  /** la fiche proposée comme adresse principale : la seule déjà enregistrée, sinon celle qui a le plus de biens */
  principale: string;
}

/** La signature d'une proposition, pour « Ignorer » : ses clés triées. Une nouvelle écriture la change, et la proposition revient. PUR. */
export const signatureProposition = (cles: readonly string[]): string => [...new Set(cles)].sort().join(' | ');

/**
 * Sépare un groupe selon un attribut (type de voie, code postal, parcelle) : une seule valeur connue → tout le groupe (les inconnues comprises) ;
 * plusieurs → un groupe par valeur, et les inconnues ne sont rattachées à aucun (on ne devine pas). PUR.
 */
function separer<T>(groupe: readonly T[], val: (x: T) => string | null): T[][] {
  const connues = [...new Set(groupe.map(val).filter((v): v is string => v !== null && v !== ''))];
  if (connues.length <= 1) return [[...groupe]];
  return connues.map((v) => groupe.filter((x) => val(x) === v));
}

/**
 * LES PROPOSITIONS : les fiches qui semblent être la même copropriété (même signature, rien qui se contredit), au moins deux, dont AU PLUS UNE déjà
 * enregistrée (deux fiches enregistrées se regroupent depuis la fiche, « Même syndic : regrouper ? » — rien n'est déplacé d'office). Les
 * propositions ignorées (leur signature) ne reviennent pas. Triées par nombre de biens décroissant. PUR.
 */
export function propositionsRegroupement(fiches: readonly FicheARegrouper[], ignorees: ReadonlySet<string> = new Set()): PropositionRegroupement[] {
  const parSig = new Map<string, { f: FicheARegrouper; type: string | null }[]>();
  for (const f of fiches) {
    const t = adresseTolerante(f.immeuble, f.commune);
    if (t.signature === '') continue;
    parSig.set(t.signature, [...(parSig.get(t.signature) ?? []), { f, type: t.type }]);
  }
  const out: (PropositionRegroupement & { biens: number })[] = [];
  for (const groupe of parSig.values()) {
    for (const parType of separer(groupe, (x) => x.type)) {
      for (const parCp of separer(parType, (x) => (x.f.codePostal ?? '').trim() || null)) {
        for (const g of separer(parCp, (x) => x.f.parcelle ?? null)) {
          const uniques = [...new Map(g.map((x) => [x.f.cle, x.f])).values()];
          if (uniques.length < 2 || uniques.filter((f) => f.declaree).length > 1) continue;
          const cles = uniques.map((f) => f.cle).sort();
          if (ignorees.has(signatureProposition(cles))) continue;
          const principale = uniques.find((f) => f.declaree) ?? [...uniques].sort((a, b) => b.nbBiens - a.nbBiens || a.cle.localeCompare(b.cle))[0];
          out.push({ cles, principale: principale.cle, biens: uniques.reduce((n, f) => n + f.nbBiens, 0) });
        }
      }
    }
  }
  return out.sort((a, b) => b.biens - a.biens || a.principale.localeCompare(b.principale)).map(({ cles, principale }) => ({ cles, principale }));
}
