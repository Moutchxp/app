import { describe, expect, it } from 'vitest';
import { motAnnexes, regrouperParBien, sommeDuGroupe, type LienAnnexeAffiche } from './biensRegroupes';

/** 🔴 Arno (26/10/2026) — Outils de suivi, une ligne par bien : le regroupement pur (lien annexe → lot principal, jamais l'adresse). */
const lien = (id: number, parentId: number, adresse: string): LienAnnexeAffiche => ({
  id, parentId, parentLibelle: `Principal ${parentId}`, parentAdresse: '1 rue A', parentCommune: 'Puteaux',
  categorie: 'cave', etage: null, nature: null, typeBien: null, porte: null, numLotCopro: null, adresse, commune: 'Puteaux' });
const l = (lotId: number | null, m: number | null = null) => ({ lotId, libelle: `Lot ${lotId}`, m });

describe('regrouperParBien', () => {
  it('le lot principal et ses annexes (même à une autre adresse) : un groupe, dans l’ordre des lignes', () => {
    const g = regrouperParBien([l(1, 10), l(2), l(3, 5), l(4, 2)], [lien(2, 1, '1 rue A'), lien(4, 1, '9 rue Z')]);
    expect(g.map((x) => [x.lotId, x.annexes.map((a) => a.lotId)])).toEqual([[1, [2, 4]], [3, []]]);
    expect(g[0].annexes[1].details).toEqual(['9 rue Z, Puteaux']);
    expect(sommeDuGroupe(g[0], (x) => x.m)).toBe(12);
  });

  it('une annexe listée AVANT son lot principal le rejoint quand même', () => {
    expect(regrouperParBien([l(2), l(1)], [lien(2, 1, '1 rue A')]).map((x) => [x.lotId, x.lignes.length])).toEqual([[1, 2]]);
  });

  it('sans le lot principal sur la période : la ligne du bien est ouverte, à son adresse, et le dit', () => {
    const [g] = regrouperParBien([l(2, 7)], [lien(2, 1, '1 rue A')]);
    expect(g).toMatchObject({ lotId: 1, libelle: 'Principal 1', principal: null, principalAbsent: true });
    expect(g.annexes.map((a) => a.lotId)).toEqual([2]);
  });

  it('sans lien (annexe détachée, ou aucune 372) : une ligne par lot ; deux lignes d’un même lot restent deux lignes ; sans bien : la sienne', () => {
    expect(regrouperParBien([l(5), l(5), l(null), l(null)], [])).toHaveLength(4);
    expect(regrouperParBien([l(5)], undefined)[0].annexes).toEqual([]);
  });

  it('aucun montant : « — » (null), comme avant ; « + 1 annexe », « + 2 annexes »', () => {
    expect(sommeDuGroupe({ lignes: [l(1), l(2)] }, (x) => x.m)).toBeNull();
    expect([motAnnexes(1), motAnnexes(2)]).toEqual(['+ 1 annexe', '+ 2 annexes']);
  });
});
