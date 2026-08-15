import { describe, it, expect } from 'vitest';
import { decisionParcelles } from './decisionParcelles';
import type { ChampCerfa } from './decisionCerfa';

/**
 * N3-E — décision des parcelles (pure). Cerfa fait foi (bloc T2), Sitadel corrobore, IDU calculé via la commune cadastrale
 * (arrondissement dérivé du numéro). On éprouve : IDU paddé et arrondissement correct (75120, pas 75056), corroboration,
 * écarts Cerfa/Sitadel signalés, et l'abstention (commune indéterminée → idu null + motif, jamais une parcelle fausse).
 */
const champ = (nom: string, valeur: string): ChampCerfa => ({ nom, valeur, page: 4, pieceNom: 'cerfa_13409.pdf' });
const cerfaDeux = () => [
  champ('T2F_prefixe', '000'), champ('T2S_section', 'DZ'), champ('T2N_numero', '09'), champ('T2T_superficie', '2631.5'),
  champ('T2FP2_prefixe', '000'), champ('T2SP2_section', 'DZ'), champ('T2NP2_numero', '10'), champ('T2TP2_superficie', '255'),
];

describe('decisionParcelles', () => {
  it('cas réel : DZ 09 / DZ 10, IDU sur l’ARRONDISSEMENT 75120 (pas 75056), corroborées', () => {
    const d = decisionParcelles(cerfaDeux(), [{ section: 'DZ', numero: '9' }, { section: 'DZ', numero: '10' }], '07512025V0035', '75056');
    expect(d.parcelles.map((p) => ({ s: p.section, n: p.numero, idu: p.idu, c: p.confiance, sup: p.superficieDeclareeM2 }))).toEqual([
      { s: 'DZ', n: '09', idu: '75120000DZ0009', c: 'confirmee', sup: 2631.5 },
      { s: 'DZ', n: '10', idu: '75120000DZ0010', c: 'confirmee', sup: 255 },
    ]);
    expect(d.ecarts).toEqual([]); expect(d.motif).toBeNull();
  });

  it('Cerfa fait foi : préfixe + superficie PAR parcelle ; corroboration Sitadel (« 9 » ⟷ « 09 »)', () => {
    const d = decisionParcelles(cerfaDeux(), [{ section: 'DZ', numero: '9' }], '07512025V0035', '75056');
    expect(d.parcelles[0]).toMatchObject({ prefixe: '000', superficieDeclareeM2: 2631.5, confiance: 'confirmee' }); // DZ9 corroborée
    expect(d.parcelles[1].confiance).toBe('a_verifier');                                                            // DZ10 absente de Sitadel
    expect(d.parcelles[1].reserve).toContain('absente des références Sitadel');
  });

  it('ÉCART signalé : une parcelle Sitadel absente du Cerfa est écrite (a_verifier) ET signalée', () => {
    const d = decisionParcelles(cerfaDeux(), [{ section: 'DZ', numero: '9' }, { section: 'DZ', numero: '10' }, { section: 'ZK', numero: '5' }], '07512025V0035', '75056');
    const zk = d.parcelles.find((p) => p.section === 'ZK')!;
    expect(zk).toMatchObject({ numero: '5', confiance: 'a_verifier', provenance: 'Sitadel (sec/num_cadastre)' });
    expect(d.ecarts.join(' ')).toContain('ZK 5');
  });

  it('ABSTENTION : commune cadastrale indéterminée → idu null + motif, JAMAIS une parcelle fausse', () => {
    const d = decisionParcelles(cerfaDeux(), [{ section: 'DZ', numero: '9' }], 'NUM-ILLISIBLE', '75056');
    expect(d.parcelles[0].idu).toBeNull();
    expect(d.parcelles[0].confiance).toBe('a_verifier');
    expect(d.parcelles[0].reserve).toContain('illisible');
  });

  it('aucune parcelle (Cerfa muet + Sitadel vide) → motif explicite, pas de vide muet', () => {
    const d = decisionParcelles([], [], '07512025V0035', '75056');
    expect(d.parcelles).toEqual([]);
    expect(d.motif).toContain('aucune parcelle');
  });
});
