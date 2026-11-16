/**
 * ══ 🔴🔴 LES DOUBLONS PROBABLES D'ADRESSES (Arno, 17/11/2026, « Adresses uniformisées », lot 1). MODULE PUR. ═══════════════════
 *
 * Une même adresse écrite de plusieurs façons (« 54 avenue Puvis de Chavannes » / « 54 Avenue du Puvis De Chavannes ») : on la
 * REPÈRE, on ne la réécrit JAMAIS (décision d'Arno : aucune adresse existante n'est réécrite). Deux niveaux, du plus sûr au plus large :
 *   · niveau 1 — majuscules, accents, ponctuation, espaces (« Kléber » = « kleber », « 10  rue » = « 10 rue ») ;
 *   · niveau 2 — en plus, les abréviations (bd, av, r, st…), les petits mots (de, du, la…) et « 12ter » = « 12 ter ».
 * Deux écritures ne se rapprochent que sous le MÊME code postal (une même rue existe dans plusieurs communes).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export type NiveauDoublon = 1 | 2;

/** Les abréviations courantes des voies et des titres, développées au niveau 2. */
const ABREVIATIONS: Record<string, string> = {
  bd: 'boulevard', bld: 'boulevard', blvd: 'boulevard', boul: 'boulevard', av: 'avenue', ave: 'avenue', avn: 'avenue', r: 'rue', pl: 'place',
  st: 'saint', ste: 'sainte', ch: 'chemin', chem: 'chemin', all: 'allee', imp: 'impasse', fg: 'faubourg', fbg: 'faubourg', sq: 'square',
  crs: 'cours', rte: 'route', pass: 'passage', psg: 'passage', res: 'residence', resid: 'residence', gal: 'general', gen: 'general',
  mal: 'marechal', pdt: 'president', prom: 'promenade', qu: 'quai', sent: 'sentier', vla: 'villa', b: 'bis', t: 'ter', dr: 'docteur',
  prof: 'professeur', cdt: 'commandant',
};
/** Les petits mots ignorés au niveau 2 (« rue DES Pavillons » = « rue Pavillons »). */
const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux']);

/** L'écriture normalisée d'une adresse, au niveau demandé. PUR. */
export function normaliserAdresse(s: string, niveau: NiveauDoublon): string {
  const n1 = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`\-.,;:/()"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (niveau === 1) return n1;
  return n1.replace(/(\d+)\s*(bis|ter|quater|b|t)\b/g, '$1 $2').split(' ').map((w) => ABREVIATIONS[w] ?? w).filter((w) => !PETITS_MOTS.has(w)).join(' ');
}

/** Une adresse lue en base : sa source (« biens », « locataires »…), la fiche, l'écriture et le code postal. */
export interface AdresseLue { source: string; id: number; adresse: string | null; codePostal: string | null }
/** Une écriture d'un groupe : telle qu'en base, avec où elle se trouve. */
export interface EcritureDoublon { ecriture: string; codePostal: string; fiches: { source: string; id: number }[] }
export interface GroupeDoublon { cle: string; codePostal: string; ecritures: EcritureDoublon[] }

const cp = (x: string | null): string => (x ?? '').trim();

/**
 * Les GROUPES DE DOUBLONS PROBABLES : sous un même code postal, des écritures DIFFÉRENTES en base qui donnent la même adresse
 * normalisée. Toutes sources confondues (une adresse écrite autrement chez le bien et chez le locataire compte). Trié par nombre
 * d'écritures décroissant, puis par clé. PUR.
 */
export function groupesDoublons(lignes: readonly AdresseLue[], niveau: NiveauDoublon): GroupeDoublon[] {
  const groupes = new Map<string, Map<string, EcritureDoublon>>();
  for (const l of lignes) {
    const brute = (l.adresse ?? '').trim();
    if (brute === '') continue;
    const cle = `${normaliserAdresse(brute, niveau)}|${cp(l.codePostal)}`;
    const g = groupes.get(cle) ?? new Map<string, EcritureDoublon>();
    const e = g.get(brute) ?? { ecriture: brute, codePostal: cp(l.codePostal), fiches: [] };
    e.fiches.push({ source: l.source, id: l.id });
    g.set(brute, e);
    groupes.set(cle, g);
  }
  return [...groupes.entries()].filter(([, g]) => g.size > 1)
    .map(([cle, g]) => ({ cle: cle.split('|')[0], codePostal: cle.split('|')[1], ecritures: [...g.values()].sort((a, b) => b.fiches.length - a.fiches.length || a.ecriture.localeCompare(b.ecriture, 'fr')) }))
    .sort((a, b) => b.ecritures.length - a.ecritures.length || a.cle.localeCompare(b.cle, 'fr'));
}

/** Les chiffres d'une source : lignes, écritures distinctes, sans code postal à 5 chiffres. PUR. */
export function chiffresSource(lignes: readonly AdresseLue[]): { lignes: number; ecritures: number; sansCodePostal: number } {
  const remplies = lignes.filter((l) => (l.adresse ?? '').trim() !== '');
  return { lignes: remplies.length, ecritures: new Set(remplies.map((l) => `${(l.adresse ?? '').trim()}|${cp(l.codePostal)}`)).size,
    sansCodePostal: remplies.filter((l) => !/^\d{5}$/.test(cp(l.codePostal))).length };
}

/** Le TEXTE DU RAPPORT : les chiffres par source, puis chaque groupe (niveau 1, puis ce que le niveau 2 ajoute). PUR. */
export function texteRapportDoublons(sources: readonly { nom: string; lignes: readonly AdresseLue[] }[], base: string, quand: string): string {
  const tout = sources.flatMap((s) => s.lignes);
  const g1 = groupesDoublons(tout, 1);
  const g2 = groupesDoublons(tout, 2);
  const cles1 = new Set(g1.map((g) => g.ecritures.map((e) => `${e.ecriture}|${e.codePostal}`).sort().join('§')));
  const ajoutes = g2.filter((g) => !cles1.has(g.ecritures.map((e) => `${e.ecriture}|${e.codePostal}`).sort().join('§')));
  const fiche = (f: { source: string; id: number }[]): string => {
    const parSource = new Map<string, number[]>();
    for (const x of f) parSource.set(x.source, [...(parSource.get(x.source) ?? []), x.id]);
    return [...parSource.entries()].map(([s, ids]) => `${s} ${ids.length > 6 ? `${ids.slice(0, 6).join(', ')}… (${ids.length})` : ids.join(', ')}`).join(' ; ');
  };
  const bloc = (gs: GroupeDoublon[]): string[] => gs.flatMap((g, i) => [`${i + 1}. ${g.codePostal || '(sans code postal)'} — ${g.ecritures.length} écritures`,
    ...g.ecritures.map((e) => `     « ${e.ecriture} » — ${fiche(e.fiches)}`)]);
  return [
    'DOUBLONS PROBABLES D’ADRESSES — LECTURE SEULE (aucune adresse n’est réécrite)',
    `Base : ${base} — ${quand}`,
    '',
    'PAR SOURCE (lignes avec une adresse ; écritures distinctes ; sans code postal à 5 chiffres) :',
    ...sources.map((s) => { const c = chiffresSource(s.lignes); return `  · ${s.nom} : ${c.lignes} ; ${c.ecritures} ; ${c.sansCodePostal}`; }),
    '',
    `TOUTES SOURCES CONFONDUES : niveau 1 (majuscules, accents, ponctuation, espaces) : ${g1.length} groupes (${g1.reduce((a, g) => a + g.ecritures.length, 0)} écritures) ;`
      + ` niveau 2 (+ abréviations, petits mots, « 12ter ») : ${g2.length} groupes (${g2.reduce((a, g) => a + g.ecritures.length, 0)} écritures).`,
    '',
    `NIVEAU 1 — ${g1.length} groupes :`,
    ...bloc(g1),
    '',
    `NIVEAU 2 — ${ajoutes.length} groupes de plus (ou élargis) :`,
    ...bloc(ajoutes),
    '',
  ].join('\n');
}
