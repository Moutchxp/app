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

/**
 * N10-G — ANNEXE 4 comme 2e source du bloc parcellaire (07512024V0037 : Cerfa 13409 scanné = bloc T2 muet, mais l'annexe 4 porte
 * les 4 parcelles en AcroForm). Réf. « DH18 » en UN champ « T5Z?3 » + superficie « T5Z?4 », slots lettrés non plafonnés.
 */
const champA = (nom: string, valeur: string): ChampCerfa => ({ nom, valeur, page: 0, pieceNom: 'CERFA_annexe_4.pdf' });
const annexe0037 = () => [
  champA('T5ZA3', 'DH18'), champA('T5ZA4', '15783'),
  champA('T5ZB3', 'DH26'), champA('T5ZB4', '226'),
  champA('T5ZC3', 'DI6'),  champA('T5ZC4', '115'),
  champA('T5ZD3', 'DI7'),  champA('T5ZD4', '36545'),
];
const sitadel0037 = () => [{ section: 'DH', numero: '18' }, { section: 'DH', numero: '26' }, { section: 'DI', numero: '6' }];

describe('decisionParcelles — N10-G annexe 4', () => {
  it('bloc T2 muet : les 4 parcelles de l’annexe 4 sont lues, IDU sur 75120, superficie par parcelle', () => {
    const d = decisionParcelles(annexe0037(), sitadel0037(), '07512024V0037', '75056');
    expect(d.parcelles.map((p) => ({ s: p.section, n: p.numero, idu: p.idu, c: p.confiance, sup: p.superficieDeclareeM2 }))).toEqual([
      { s: 'DH', n: '18', idu: '75120000DH0018', c: 'confirmee',  sup: 15783 },
      { s: 'DH', n: '26', idu: '75120000DH0026', c: 'confirmee',  sup: 226 },
      { s: 'DI', n: '6',  idu: '75120000DI0006', c: 'confirmee',  sup: 115 },
      { s: 'DI', n: '7',  idu: '75120000DI0007', c: 'a_verifier', sup: 36545 }, // 4e, hors Sitadel plafonné
    ]);
    expect(d.parcelles[3].provenance).toContain('annexe 4');
  });

  it('DI 7 : réserve d’ABSENCE ATTENDUE (Sitadel plafonné à 3), JAMAIS lue comme un doute d’existence', () => {
    const di7 = decisionParcelles(annexe0037(), sitadel0037(), '07512024V0037', '75056').parcelles.find((p) => p.section === 'DI' && p.numero === '7')!;
    expect(di7.reserve).toContain('attendue');
    expect(di7.reserve).toContain('plafonné à 3');
    expect(di7.reserve).not.toContain('absente des références Sitadel'); // pas la formule « doute sur l’existence »
  });

  it('l’écart de plafond Sitadel est SIGNALÉ globalement (4 déclarées vs 3 Sitadel)', () => {
    const d = decisionParcelles(annexe0037(), sitadel0037(), '07512024V0037', '75056');
    expect(d.ecarts.join(' ')).toContain('plafonné à 3');
    expect(d.ecarts.join(' ')).toContain('4 parcelles');
  });

  it('DÉDUPLICATION section/numéro : une parcelle donnée par T2 ET par l’annexe 4 n’apparaît qu’une fois (T2 prioritaire)', () => {
    const champs = [
      champ('T2S_section', 'DH'), champ('T2N_numero', '18'), champ('T2T_superficie', '15645'),
      ...annexe0037(),
    ];
    const d = decisionParcelles(champs, sitadel0037(), '07512024V0037', '75056');
    const dh18 = d.parcelles.filter((p) => p.section === 'DH' && p.numero === '18');
    expect(dh18).toHaveLength(1);
    expect(dh18[0].provenance).toContain('parcelle 1'); // provenance du bloc T2 conservée
    expect(dh18[0].superficieDeclareeM2).toBe(15645);   // valeur T2, l’annexe ne l’écrase pas
  });

  it('annexe 4 NON plafonnée : cinq slots A–E → cinq parcelles', () => {
    const cinq = [...annexe0037(), champA('T5ZE3', 'DK4'), champA('T5ZE4', '900')];
    const d = decisionParcelles(cinq, sitadel0037(), '07512024V0037', '75056');
    expect(d.parcelles).toHaveLength(5);
    expect(d.parcelles.find((p) => p.section === 'DK' && p.numero === '4')).toBeTruthy();
  });
});

describe('decisionParcelles — LOT 66 : parcelles du récapitulatif (télé-service, sans AcroForm)', () => {
  // Dossier-témoin 7424 : Sitadel plafonné à 3 (AB157/AB160/Z1), le récap en déclare 10.
  const sitadel3 = [{ section: 'AB', numero: '157' }, { section: 'AB', numero: '160' }, { section: 'Z', numero: '1' }];
  const recap10 = [
    { prefixe: '000', section: 'Z', numero: '1', superficieM2: 600 }, { prefixe: '000', section: 'Z', numero: '2', superficieM2: 420 },
    { prefixe: '000', section: 'Z', numero: '3', superficieM2: 273 }, { prefixe: '000', section: 'Z', numero: '4', superficieM2: 265 },
    { prefixe: '000', section: 'Z', numero: '194', superficieM2: 224 }, { prefixe: '000', section: 'Z', numero: '124', superficieM2: 825 },
    { prefixe: '000', section: 'Z', numero: '6', superficieM2: 272 }, { prefixe: '000', section: 'Z', numero: '195', superficieM2: 557 },
    { prefixe: '000', section: 'AB', numero: '157', superficieM2: 1320 }, { prefixe: '000', section: 'AB', numero: '160', superficieM2: 259 },
  ];

  it('AcroForm vide + récap → les 10 parcelles sont lues, SANS plafond, préfixe 000', () => {
    const d = decisionParcelles([], sitadel3, '09300125V0081', '93001', recap10);
    expect(d.parcelles).toHaveLength(10);
    expect(d.parcelles.every((p) => p.prefixe === '000')).toBe(true);
    // les 3 corroborées par Sitadel = confirmee ; les 7 hors plafond = a_verifier (absence attendue, pas un doute)
    expect(d.parcelles.filter((p) => p.confiance === 'confirmee').map((p) => `${p.section}${p.numero}`).sort()).toEqual(['AB157', 'AB160', 'Z1']);
    const z2 = d.parcelles.find((p) => p.section === 'Z' && p.numero === '2')!;
    expect(z2.confiance).toBe('a_verifier');
    expect(z2.reserve).toMatch(/absence attendue/i);
    expect(z2.provenance).toMatch(/récapitulatif/i);
  });

  it('DÉDUP : une parcelle donnée par T2 ET par le récap n’apparaît qu’une fois (T2 prioritaire)', () => {
    const t2 = [champ('T2S_section', 'Z'), champ('T2N_numero', '1'), champ('T2T_superficie', '600')];
    const d = decisionParcelles(t2, [], '09300125V0081', '93001', [{ prefixe: '000', section: 'Z', numero: '1', superficieM2: 600 }, { prefixe: '000', section: 'Z', numero: '2', superficieM2: 420 }]);
    expect(d.parcelles.filter((p) => p.section === 'Z' && p.numero === '1')).toHaveLength(1);
    expect(d.parcelles.find((p) => p.section === 'Z' && p.numero === '1')!.provenance).toMatch(/T2S/); // T2 conserve la main
    expect(d.parcelles).toHaveLength(2); // Z1 (T2, non doublé par le récap) + Z2 (récap)
  });
});
