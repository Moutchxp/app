import { describe, expect, it } from 'vitest';
import { libellesDuFiltre, personnesNegociateurs } from './nomNegociateur';
import { detailCa, detailCommissions, detailDu } from './detailCommissions';
import { resolveurDe } from './statutLigne';
import type { LigneVente, Vente } from './modele';

/** 🔴 LOT CQ (règle d'Arno) — un même négociateur n'apparaît JAMAIS deux fois : les libellés regroupés par personne (correspondance du lot CG). */
const noms: Record<string, string> = { ARNAUD: 'Arnaud JOREL', 'Arnaud Jorel': 'Arnaud JOREL', CEDRIC: 'Cédric JULLIEN', 'Cédric JULLIEN': 'Cédric JULLIEN', PIERRE: 'Pierre THEVENIN' };
const nommer = (x: string): string => noms[x] ?? x;
const sansDoublon = (xs: readonly string[]): boolean => new Set(xs).size === xs.length;

describe('🔴 LOT CQ — une entrée par personne', () => {
  it('les libellés d’une même personne : une entrée, triée par nom ; aucun nom deux fois', () => {
    const p = personnesNegociateurs(['CEDRIC', 'ARNAUD', 'MYLENE', 'Arnaud Jorel', 'Cédric JULLIEN', 'PIERRE'], nommer);
    expect(p).toEqual([
      { nom: 'Arnaud JOREL', libelles: ['ARNAUD', 'Arnaud Jorel'] },
      { nom: 'Cédric JULLIEN', libelles: ['CEDRIC', 'Cédric JULLIEN'] },
      { nom: 'MYLENE', libelles: ['MYLENE'] },
      { nom: 'Pierre THEVENIN', libelles: ['PIERRE'] },
    ]);
    expect(sansDoublon(p.map((x) => x.nom))).toBe(true);
  });
  it('le filtre : le nom affiché, ou un ancien lien qui porte un libellé → tous les libellés de la personne ; inconnu → lui seul', () => {
    const p = personnesNegociateurs(['ARNAUD', 'Arnaud Jorel'], nommer);
    expect(libellesDuFiltre(p, 'Arnaud JOREL')).toEqual({ nom: 'Arnaud JOREL', libelles: ['ARNAUD', 'Arnaud Jorel'] });
    expect(libellesDuFiltre(p, 'ARNAUD')).toEqual({ nom: 'Arnaud JOREL', libelles: ['ARNAUD', 'Arnaud Jorel'] });
    expect(libellesDuFiltre(p, 'INCONNU')).toEqual({ nom: 'INCONNU', libelles: ['INCONNU'] });
  });
  it('« Ce que l’on doit » : deux libellés d’une même personne (même classe) → une seule entrée, la somme de leurs lignes', () => {
    const lg = (negociateur: string, montantTtc: number): LigneVente => ({ id: Math.random(), negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true, origine: 'import',
      sourceFichier: null, sourceOnglet: negociateur, sourceLigne: 1, note: null });
    const v = (id: number, l: LigneVente): Vente => ({ id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc: 10000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-10-02',
      apporteur: null, note: null, origine: 'import', sourceFichier: null, sourceOnglet: null, sourceLigne: id, lignes: [l], double: null });
    const ventes = [v(1, lg('ARNAUD', 1200)), v(2, lg('Arnaud Jorel', 600))];
    const sdl = resolveurDe({ ARNAUD: 'independant', 'Arnaud Jorel': 'independant' });
    const dc = detailCommissions(ventes, 'criterimmo', sdl); const dca = detailCa(ventes, 'criterimmo', sdl);
    const avant = detailDu(dc, dca, ventes, 'criterimmo', '2026-10-31');
    expect(avant.negociateurs.map((p) => nommer(p.nom))).toEqual(['Arnaud JOREL', 'Arnaud JOREL']); // le doublon d'avant, sans correspondance
    const apres = detailDu(dc, dca, ventes, 'criterimmo', '2026-10-31', nommer);
    expect(apres.negociateurs.map((p) => nommer(p.nom))).toEqual(['Arnaud JOREL']);
    expect([apres.negociateurs[0].nbDossiers, apres.negociateurs[0].ttcC]).toEqual([2, avant.negociateurs.reduce((t, p) => t + p.ttcC, 0)]);
    expect(apres.total).toEqual(avant.total); // aucun total ne change
  });
});
