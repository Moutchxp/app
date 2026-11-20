import { describe, expect, it } from 'vitest';
import { modeleOfficiel, type EntreeOfficielle } from './officielleCopro';

/** 🔴🔴 Arno (20/11/2026, lot 4) — la règle d'affichage de l'adresse officielle d'une copropriété (pure). */
const certain = (id: string, libelle: string): EntreeOfficielle['r'] => ({ statut: 'certain', codePostal: '92400', ban: { id, libelle, commune: 'Courbevoie' } });
const e = (cle: string, texte: string, biens: number, r: EntreeOfficielle['r'], o: Partial<EntreeOfficielle> = {}): EntreeOfficielle =>
  ({ cle, texte, biens, principale: false, adresseCopro: false, r, ...o });
const P54 = certain('92026_7184_00054', '54 Avenue Puvis De Chavannes');

describe('le modèle d’affichage', () => {
  it('le 54 : une seule adresse officielle (libellé BAN, code postal, commune) ; chaque écriture WIPPIMMO avec ses biens ; rien à vérifier', () => {
    const m = modeleOfficiel([
      e('54 avenue puvis de chavannes 92400 courbevoie', '54 avenue puvis de Chavannes, 92400, Courbevoie', 0, P54, { principale: true, adresseCopro: true }),
      e('54 avneue puvis de chavannes', '54 Avneue Puvis de Chavannes', 0, P54, { adresseCopro: true }),
      e('54 avenue du puvis de chavannes augier', '54 avenue du Puvis de Chavannes / AUGIER', 29, P54),
      e('54 avneue puvis de chavannes', '54 Avneue Puvis de Chavannes', 1, P54),
    ])!;
    // le libellé à l'écran : type de voie et petits mots en minuscule (la BAN stockée reste « 54 Avenue Puvis De Chavannes »)
    expect(m.principale.libelle).toBe('54 avenue Puvis de Chavannes, 92400 Courbevoie');
    expect(m.adresses).toHaveLength(1);
    expect(m.adresses[0].cles).toEqual(['54 avenue puvis de chavannes 92400 courbevoie', '54 avneue puvis de chavannes', '54 avenue du puvis de chavannes augier']);
    expect(m.ecritures.map((x) => [x.ecriture, x.biens])).toEqual([['54 avenue du Puvis de Chavannes / AUGIER', 29], ['54 Avneue Puvis de Chavannes', 1]]);
    expect(m.aVerifier).toBe(false);
  });
  it('le 80 : les adresses officielles RÉELLEMENT différentes d’un même immeuble, la principale d’abord', () => {
    const m = modeleOfficiel([
      e('80 rue de normandie', '80 rue de Normandie', 0, certain('92026_6670_00080', '80 Rue De Normandie'), { principale: true, adresseCopro: true }),
      e('43 avenue marceau', '43 Avenue Marceau', 0, certain('92026_6120_00043', '43 Avenue Marceau'), { adresseCopro: true }),
      e('74 rue de normandie', '74 Rue De Normandie', 0, certain('92026_6670_00074', '74 Rue De Normandie'), { adresseCopro: true }),
      e('43 avenue marceau', '43 avenue Marceau', 2, certain('92026_6120_00043', '43 Avenue Marceau')),
      e('80 rue de normandie', '80 rue de Normandie', 2, certain('92026_6670_00080', '80 Rue De Normandie')),
    ])!;
    expect(m.adresses.map((a) => a.court)).toEqual(['80 rue de Normandie', '43 avenue Marceau', '74 rue de Normandie']);
  });
  it('une écriture non certaine : « à vérifier », sans devenir une adresse ; rien de certain : aucun modèle (l’affichage d’avant)', () => {
    const doute: EntreeOfficielle['r'] = { statut: 'a_verifier', codePostal: '92400', ban: { id: '92026_6120_00028', libelle: '28 Avenue Marceau', commune: 'Courbevoie' } };
    const m = modeleOfficiel([e('80 rue de normandie', '80 rue de Normandie', 2, certain('92026_6670_00080', '80 Rue De Normandie'), { principale: true }), e('28 32 avenue marceau', '28-32 avenue Marceau', 1, doute)])!;
    expect([m.adresses.length, m.aVerifier, m.ecritures.map((x) => x.statut)]).toEqual([1, true, ['certain', 'a_verifier']]);
    expect(modeleOfficiel([e('28 32 avenue marceau', '28-32 avenue Marceau', 1, doute)])).toBeNull();
  });
});
