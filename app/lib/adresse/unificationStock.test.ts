import { describe, expect, it } from 'vitest';
import type { RapprochementComplet } from './banRepo';
import { planUnification, texteResumeUnification, type AdresseCoproStock, type BienStock, type CoproStock, type EntreeUnification } from './unificationStock';
import { cleImmeuble } from '../gestion/syndics';

/** 🔴🔴 Arno (20/11/2026, lot 5) — le plan d'unification : une seule adresse officielle par adresse réelle ; rien n'est écrasé, rien n'est supprimé. */
const R = (id: string | null, libelle = '', statut: RapprochementComplet['statut'] = id === null ? 'introuvable' : 'certain'): RapprochementComplet =>
  ({ statut, motif: '', ban: id === null ? null : { id, numero: 1, suffixe: null, nomVoie: libelle, insee: '92026', commune: 'Courbevoie', x: 0, y: 0, score: 1, libelle, typeContradictoire: false },
    score: 1, propositions: [], analyse: { numero: 1, indice: null, plage: false, plageTexte: null, type: null, voie: '' }, insee: '92026', codePostal: '92400', parcelle: null, texteSource: '' });
let n = 0;
const bien = (immeuble: string): BienStock => ({ id: ++n, immeuble, adresse: null, codePostal: '92400', commune: 'Courbevoie' });
const copro = (id: number, libelle: string, o: Partial<CoproStock> = {}): CoproStock => ({ id, cle: cleImmeuble(libelle), libelle, nom: null, banId: null, syndic: null, ag: 0, contacts: 0, batiments: 0, ...o });
const principale = (c: CoproStock): AdresseCoproStock => ({ id: null, coproId: c.id, cle: c.cle, libelle: c.libelle, codePostal: '92400', commune: 'Courbevoie', principale: true, sorte: 'adresse' });
const secondaire = (id: number, c: CoproStock, libelle: string): AdresseCoproStock => ({ id, coproId: c.id, cle: cleImmeuble(libelle), libelle, codePostal: '92400', commune: 'Courbevoie', principale: false, sorte: 'adresse' });
function entree(o: { biens: BienStock[]; banDe: Record<string, string | null>; copros?: CoproStock[]; adresses?: AdresseCoproStock[]; digicodes?: EntreeUnification['digicodes']; regroupements?: EntreeUnification['regroupements'] }): EntreeUnification {
  const r = (t: string) => { const id = o.banDe[t] ?? null; return R(id, id === null ? '' : `Libellé ${id}`); };
  return { biens: o.biens, rapprochementDesBiens: new Map(o.biens.map((b) => [b.id, r(b.immeuble!)])), copros: o.copros ?? [], adressesCopro: o.adresses ?? [],
    rapprochementDesAdresses: new Map((o.adresses ?? []).map((a) => [a.cle, r(a.libelle)])), digicodes: o.digicodes ?? [], regroupements: o.regroupements ?? [], autresParCle: new Map() };
}

describe('le plan d’unification', () => {
  it('le 54 (regroupé par la 504) : ses variantes deviennent des écritures d’origine, le regroupement est absorbé, aucune réunion à faire', () => {
    const P = '54 avenue puvis de Chavannes, 92400, Courbevoie'; const V = ['54 Avneue Puvis de Chavannes', '54 Puvis de Chavannes'];
    const c = copro(276, P);
    const banDe = Object.fromEntries([P, ...V].map((t) => [t, '92026_7184_00054']));
    const p = planUnification(entree({ biens: [bien(P), bien(V[0]), bien(V[1]), bien(V[1])], banDe, copros: [c], adresses: [principale(c), secondaire(26, c, V[0]), secondaire(27, c, V[1])],
      regroupements: [{ id: 9, coproId: 276, regroupees: V }] }));
    expect(p.coproprietes).toEqual({ avant: 1, apres: 1 });
    const [i] = p.immeubles;
    expect([i.cible, i.ecritures.map((x) => [x.ecriture, x.biens])]).toEqual([276, [['54 Puvis de Chavannes', 2], [P, 1], ['54 Avneue Puvis de Chavannes', 1]]]);
    expect(i.actions.filter((a) => a.sorte === 'ban_adresse').map((a) => (a as { devient: string }).devient)).toEqual(['ecriture', 'ecriture']);
    expect(i.actions.some((a) => a.sorte === 'absorber_504')).toBe(true);
    expect(p.regroupements.absorbes).toBe(1);
  });
  it('le 80 : les AUTRES adresses officielles de l’immeuble (43 avenue Marceau, 74 rue de Normandie) restent des adresses', () => {
    const c = copro(157, '80 rue de Normandie');
    const p = planUnification(entree({ biens: [bien('80 rue de Normandie'), bien('43 avenue Marceau')], copros: [c],
      adresses: [principale(c), secondaire(3, c, '43 avenue Marceau'), secondaire(4, c, '74 rue de Normandie')],
      banDe: { '80 rue de Normandie': 'B80', '43 avenue Marceau': 'B43', '74 rue de Normandie': 'B74' } }));
    expect(p.immeubles[0].actions.filter((a) => a.sorte === 'ban_adresse').map((a) => (a as { devient: string }).devient)).toEqual(['adresse', 'adresse']);
    expect(p.immeubles[0].adresses).toHaveLength(3);
  });
  it('deux immeubles « fiche à créer » de la même adresse officielle : une copropriété à créer, l’autre écriture ajoutée ; le 56 reste à part', () => {
    const p = planUnification(entree({ biens: [bien('17 rue des Fusillés de la Résistance'), bien('17 rue des Fusillés de la Résistance'), bien('17 Rue Fusilles de la Resistan'), bien('56 rue X')],
      banDe: { '17 rue des Fusillés de la Résistance': 'B17', '17 Rue Fusilles de la Resistan': 'B17', '56 rue X': 'B56' } }));
    expect(p.coproprietes).toEqual({ avant: 3, apres: 2 });
    const i = p.immeubles.find((x) => x.banIds.includes('B17'))!;
    expect([i.cible, i.actions.map((a) => a.sorte)]).toEqual(['a_creer', ['creer_copro', 'ajouter_ecriture']]);
    expect(i.actions[0]).toMatchObject({ cle: cleImmeuble('17 rue des Fusillés de la Résistance') });
  });
  it('deux copropriétés ENREGISTRÉES de la même adresse : réunies (la cible : celle qui a le syndic) ; deux syndics différents : « à trancher », rien n’est réuni', () => {
    const a = copro(1, '5 rue A', { syndic: { id: 9, nom: 'Cabinet A' }, ag: 1 }); const b = copro(2, '5 r. A', { contacts: 2 });
    const banDe = { '5 rue A': 'B5', '5 r. A': 'B5' };
    const p = planUnification(entree({ biens: [bien('5 rue A'), bien('5 r. A')], banDe, copros: [b, a], adresses: [principale(a), principale(b)] }));
    expect(p.immeubles[0].actions.find((x) => x.sorte === 'reunir_copro')).toEqual({ sorte: 'reunir_copro', cibleId: 1, absorbeeId: 2, syndic: false, ag: 0, contacts: 2, batiments: 0, adresses: 1 });
    const c2 = copro(2, '5 r. A', { syndic: { id: 8, nom: 'Cabinet B' } });
    const q = planUnification(entree({ biens: [bien('5 rue A'), bien('5 r. A')], banDe, copros: [a, c2], adresses: [principale(a), principale(c2)] }));
    expect(q.immeubles[0].actions.some((x) => x.sorte === 'reunir_copro')).toBe(false);
    expect(q.immeubles[0].conflits).toEqual(['Réunir « 5 r. A » dans « 5 rue A » : deux syndics différents (Cabinet A / Cabinet B) — à trancher, rien n’est réuni.']);
    expect(q.conflits).toBe(1);
  });
  it('digicodes d’une même adresse officielle : identiques → fusionnés ; différents → tous gardés, « à trancher », avec l’écriture de chacun', () => {
    const c = copro(1, '5 rue A');
    const base = { biens: [bien('5 rue A'), bien('5 r. A')], copros: [c], adresses: [principale(c), secondaire(7, c, '5 r. A')], banDe: { '5 rue A': 'B5', '5 r. A': 'B5' } };
    const same = planUnification(entree({ ...base, digicodes: [{ adresseCle: '5 rue a', place: '', code: '1234' }, { adresseCle: '5 r a', place: '', code: '1234' }] }));
    expect(same.immeubles[0].digicodes).toEqual([{ place: 'commun', statut: 'fusionne', codes: [{ code: '1234', ecritures: ['5 rue a', '5 r a'] }] }]);
    const diff = planUnification(entree({ ...base, digicodes: [{ adresseCle: '5 rue a', place: 'a', code: '1234' }, { adresseCle: '5 r a', place: 'a', code: '9999' }] }));
    expect(diff.immeubles[0].digicodes).toEqual([{ place: 'bâtiment A', statut: 'a_trancher', codes: [{ code: '1234', ecritures: ['5 rue a'] }, { code: '9999', ecritures: ['5 r a'] }] }]);
    expect(diff.digicodes).toEqual({ fusionnes: 0, aTrancher: 1 });
  });
  it('rien de certain : aucune action, rien n’est réuni ; les biens comptés par leur statut (à vérifier, introuvables : pour la file du lot 6)', () => {
    const p = planUnification(entree({ biens: [bien('28-32 avenue Marceau'), bien('rue sans numéro')], banDe: {} }));
    expect([p.immeubles.flatMap((i) => i.actions), p.biens]).toEqual([[], { total: 2, certains: 0, aVerifier: 0, introuvables: 2 }]);
    expect(texteResumeUnification(p, ['essai'])).toContain('COPROPRIÉTÉS (lignes de la liste) : 2 aujourd’hui → 2 après unification ; 0 immeuble(s) changent');
  });
});
