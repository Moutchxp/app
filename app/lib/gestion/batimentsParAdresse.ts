import { cleImmeuble } from './syndics';

/**
 * ══ 🔴🔴 LES BÂTIMENTS RATTACHÉS À LEUR ADRESSE — LE PLAN DE REPRISE (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 2). MODULE PUR. ══
 *
 * LA DÉCISION : « BÂTIMENTS RATTACHÉS À LEUR ADRESSE, pas à la copropriété entière : un nom de bâtiment est unique pour une même adresse […] un bâtiment
 * est identifié par (adresse, nom) » ; la reprise « sans perte des bâtiments existants (et leur répartition par adresse quand c'est déductible ; sinon à
 * arbitrer, jamais deviné en silence) » ; puis les réponses d'Arno : « 1. Bâtiment dont l'adresse n'est pas déductible → « adresse à préciser » sur la
 * fiche Copropriété, choix par Arno ; jamais deviné. 2. Bâtiment trouvé à deux adresses → séparé automatiquement en deux bâtiments distincts (un par
 * adresse), listé dans le rapport. » ; « le rapport à blanc dans .captures/copropriete/ : chaque bâtiment → son adresse et la règle qui l'a déduite, plus
 * la liste « à préciser » et les séparations. Aucune reprise réelle avant validation d'Arno. »
 *
 * LES RÈGLES, dans l'ordre (la première qui conclut l'emporte) :
 *   ① déjà rattaché (l'adresse est déjà notée) : rien à faire ;
 *   ② la copropriété n'a qu'UNE adresse : c'est la sienne ;
 *   ③ les PREUVES : les adresses de la copropriété où ce bâtiment a des digicodes (478, lignes non annulées) et celles des biens qui lui sont reliés
 *      (lien sûr) — une seule adresse : c'est la sienne ; DEUX OU PLUS : SÉPARÉ, un bâtiment par adresse (le bâtiment existant garde la première
 *      adresse — celle de la copropriété d'abord, puis l'ordre des adresses — et son historique ; un nouveau bâtiment par autre adresse ; chaque bien
 *      relié suit le bâtiment de SON adresse) ;
 *   ④ rien de tout cela : « adresse à préciser » (choix par Arno).
 * Une preuve hors des adresses de la copropriété (un bien relié dont l'adresse n'en est pas une) n'est jamais une adresse : elle est SIGNALÉE.
 */

export interface CoproLue { id: number; libelle: string; adresses: { cle: string; libelle: string }[] }
export interface BatimentLu { id: number; coproId: number; cle: string; libelle: string; adresseCle: string | null }
export interface PreuveDigicode { adresseCle: string; batimentCle: string }
export interface BienRelie { lotId: number; batimentId: number; immeuble: string | null; adresse: string | null }

export type RegleAdresse = 'deja' | 'adresse_unique' | 'digicodes' | 'biens_relies' | 'digicodes_et_biens' | 'separation' | 'a_preciser';
export const MOT_REGLE: Record<RegleAdresse, string> = {
  deja: 'déjà rattaché', adresse_unique: 'la copropriété n’a qu’une adresse', digicodes: 'ses digicodes sont à cette adresse',
  biens_relies: 'ses biens reliés sont à cette adresse', digicodes_et_biens: 'ses digicodes et ses biens reliés sont à cette adresse',
  separation: 'trouvé à plusieurs adresses : séparé', a_preciser: 'adresse à préciser (aucune preuve)',
};

export interface DecisionBatiment {
  batiment: BatimentLu; copro: CoproLue; regle: RegleAdresse;
  /** l'adresse retenue pour le bâtiment existant (`null` : à préciser) */
  adresseCle: string | null;
  /** une séparation : les NOUVEAUX bâtiments, un par autre adresse, et les biens qui les suivent */
  nouveaux: { adresseCle: string; lots: number[] }[];
  /** les biens reliés qui restent sur le bâtiment existant */
  lotsGardes: number[];
  /** les biens reliés dont l'adresse n'est pas une adresse de la copropriété (signalés, jamais une preuve) */
  horsAdresses: { lotId: number; adresse: string }[];
}

/** La clé de l'adresse d'un bien : son « Immeuble », sinon son adresse (la règle de la copropriété). PUR. */
const cleDuBien = (l: Pick<BienRelie, 'immeuble' | 'adresse'>): string => cleImmeuble((l.immeuble ?? '').trim() !== '' ? l.immeuble : l.adresse);

/** LE PLAN : une décision par bâtiment du registre. PUR. */
export function planBatimentsParAdresse(copros: readonly CoproLue[], batiments: readonly BatimentLu[], digicodes: readonly PreuveDigicode[],
  biens: readonly BienRelie[]): DecisionBatiment[] {
  return batiments.map((b) => {
    const copro = copros.find((c) => c.id === b.coproId) ?? { id: b.coproId, libelle: `copropriété ${b.coproId}`, adresses: [] };
    const siennes = copro.adresses.map((a) => a.cle);
    const relies = biens.filter((x) => x.batimentId === b.id).map((x) => ({ lotId: x.lotId, cle: cleDuBien(x), adresse: (x.immeuble ?? '').trim() || (x.adresse ?? '') }));
    const horsAdresses = relies.filter((x) => !siennes.includes(x.cle)).map((x) => ({ lotId: x.lotId, adresse: x.adresse }));
    const base = { batiment: b, copro, horsAdresses };
    if (b.adresseCle !== null && b.adresseCle !== '') return { ...base, regle: 'deja', adresseCle: b.adresseCle, nouveaux: [], lotsGardes: relies.map((x) => x.lotId) };
    if (siennes.length === 1) return { ...base, regle: 'adresse_unique', adresseCle: siennes[0], nouveaux: [], lotsGardes: relies.map((x) => x.lotId) };
    const parDigicodes = new Set(digicodes.filter((d) => d.batimentCle === b.cle && siennes.includes(d.adresseCle)).map((d) => d.adresseCle));
    const parBiens = new Set(relies.filter((x) => siennes.includes(x.cle)).map((x) => x.cle));
    // l'ordre des adresses de la copropriété (la principale d'abord) : le bâtiment existant garde la première
    const trouvees = siennes.filter((c) => parDigicodes.has(c) || parBiens.has(c));
    if (trouvees.length === 0) return { ...base, regle: 'a_preciser', adresseCle: null, nouveaux: [], lotsGardes: relies.map((x) => x.lotId) };
    if (trouvees.length === 1) {
      const regle: RegleAdresse = parDigicodes.size > 0 && parBiens.size > 0 ? 'digicodes_et_biens' : parDigicodes.size > 0 ? 'digicodes' : 'biens_relies';
      return { ...base, regle, adresseCle: trouvees[0], nouveaux: [], lotsGardes: relies.map((x) => x.lotId) };
    }
    const [premiere, ...autres] = trouvees;
    return { ...base, regle: 'separation', adresseCle: premiere,
      nouveaux: autres.map((c) => ({ adresseCle: c, lots: relies.filter((x) => x.cle === c).map((x) => x.lotId) })),
      lotsGardes: relies.filter((x) => x.cle === premiere || !siennes.includes(x.cle)).map((x) => x.lotId) };
  });
}

/** Le libellé d'une adresse de la copropriété, par sa clé. PUR. */
const libelleAdresse = (c: CoproLue, cle: string | null): string => (cle === null ? '—' : c.adresses.find((a) => a.cle === cle)?.libelle ?? cle);

/** LE RAPPORT À BLANC, lisible : le résumé, chaque bâtiment, la liste « à préciser », les séparations, les signalements. PUR. */
export function texteRapportBatiments(d: readonly DecisionBatiment[], base: string, quand: string): string {
  const compte = (r: RegleAdresse) => d.filter((x) => x.regle === r).length;
  const lignes: string[] = [
    'RAPPORT À BLANC — LES BÂTIMENTS RATTACHÉS À LEUR ADRESSE (« Adresses multiples d’une copropriété », lot 2)',
    `Base : ${base} — le ${quand}. AUCUNE ÉCRITURE : ce rapport dit ce que la reprise ferait ; rien n’est repris avant la validation d’Arno.`,
    '',
    'RÉSUMÉ',
    `  Bâtiments au registre : ${d.length}`,
    `  Déjà rattachés à leur adresse : ${compte('deja')}`,
    `  Copropriété à une seule adresse : ${compte('adresse_unique')}`,
    `  Déduits de leurs digicodes et/ou de leurs biens reliés : ${compte('digicodes') + compte('biens_relies') + compte('digicodes_et_biens')}`,
    `  Séparés (trouvés à plusieurs adresses) : ${compte('separation')} — ${d.reduce((n, x) => n + x.nouveaux.length, 0)} nouveau(x) bâtiment(s)`,
    `  Adresse à préciser (choix par Arno) : ${compte('a_preciser')}`,
    `  Biens reliés hors des adresses de leur copropriété (signalés) : ${d.reduce((n, x) => n + x.horsAdresses.length, 0)}`,
    '',
    'CHAQUE BÂTIMENT → SON ADRESSE, ET LA RÈGLE',
  ];
  for (const x of d) {
    lignes.push(`  · ${x.copro.libelle} — bâtiment ${x.batiment.libelle} (n° ${x.batiment.id}) → ${x.regle === 'a_preciser' ? 'ADRESSE À PRÉCISER' : libelleAdresse(x.copro, x.adresseCle)} — ${MOT_REGLE[x.regle]}`
      + (x.lotsGardes.length > 0 ? ` ; biens reliés : ${x.lotsGardes.join(', ')}` : ''));
  }
  const aPreciser = d.filter((x) => x.regle === 'a_preciser');
  lignes.push('', `À PRÉCISER (${aPreciser.length}) — sur la fiche Copropriété, choix par Arno`);
  if (aPreciser.length === 0) lignes.push('  (aucun)');
  for (const x of aPreciser) lignes.push(`  · ${x.copro.libelle} — bâtiment ${x.batiment.libelle} (n° ${x.batiment.id}) ; adresses possibles : ${x.copro.adresses.map((a) => a.libelle).join(' ; ')}`);
  const separes = d.filter((x) => x.regle === 'separation');
  lignes.push('', `SÉPARATIONS (${separes.length}) — un bâtiment par adresse`);
  if (separes.length === 0) lignes.push('  (aucune)');
  for (const x of separes) {
    lignes.push(`  · ${x.copro.libelle} — bâtiment ${x.batiment.libelle} (n° ${x.batiment.id}) garde ${libelleAdresse(x.copro, x.adresseCle)} et son historique${x.lotsGardes.length > 0 ? ` (biens ${x.lotsGardes.join(', ')})` : ''}`);
    for (const n of x.nouveaux) lignes.push(`      + nouveau bâtiment ${x.batiment.libelle} à ${libelleAdresse(x.copro, n.adresseCle)}${n.lots.length > 0 ? ` (biens ${n.lots.join(', ')})` : ''}`);
  }
  const hors = d.filter((x) => x.horsAdresses.length > 0);
  lignes.push('', `SIGNALÉS (${hors.length}) — un bien relié dont l’adresse n’est pas une adresse de sa copropriété (jamais une preuve)`);
  if (hors.length === 0) lignes.push('  (aucun)');
  for (const x of hors) lignes.push(`  · ${x.copro.libelle} — bâtiment ${x.batiment.libelle} : ${x.horsAdresses.map((h) => `bien ${h.lotId} (${h.adresse})`).join(' ; ')}`);
  return `${lignes.join('\n')}\n`;
}
