import { describe, expect, it } from 'vitest';
import { lignesParNegociateur } from './lignesNegociateur';
import { payeTtcDe, resteTtcDe, retroTtcDe, type Partie, type Vente } from './modele';
import { venteDansSociete } from './interCabinet';

/**
 * 🔴 LOT BW (Arno, 30/10/2026) — « Le mois » : une vente tenue par deux négociateurs (entrée ≠ sortie) se lit en deux lignes ; la somme des deux
 * lignes = la vente, au centime ; une vente à un seul négociateur, un import sans répartition, une ligne miroir : une ligne.
 */
const partie = (sorte: Partie['sorte'], compteId: number | null, negociateur: string | null, societe: Partie['societe'], pourcentage: number, statut: Partie['statut'] = 'independant', o: Partial<Partie> = {}): Partie =>
  ({ sorte, compteId, negociateur, societe, nom: null, coordonnees: null, pourcentage, montantHt: null, statut, ...o });
const vente = (o: Partial<Vente> = {}): Vente => ({ id: 41, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 9, dateCompromis: null,
  apporteur: 'Julien Deblois', note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null,
  lignes: [{ id: 1, negociateur: 'Jean-Baptiste PONS', role: 'negociateur', montantTtc: 2000, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, cote: 'entree' },
    { id: 2, negociateur: 'Cédric JULLIEN', role: 'negociateur', montantTtc: 1500, nature: 'vente', compte: true, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, cote: 'sortie' }],
  repartition: { retroApporteurTtc: 2400, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 9, 'Cédric JULLIEN', 'criterimmo', 50)] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Jean-Baptiste PONS' }, sortie: { id: 9, nom: 'Cédric JULLIEN' }, apporteurId: null, personnes: [] }, ...o } as Vente);
const C = (x: number): number => Math.round(x * 100);
const sommeLignes = (l: NonNullable<ReturnType<typeof lignesParNegociateur>>, k: 'honoraires' | 'retro' | 'reste', u: 'htC' | 'ttcC') => l[0][k][u] + l[1][k][u];

describe('🔴 LOT BW — une ligne par négociateur', () => {
  it('entrée ≠ sortie : deux lignes (entrée en haut), chacune sa partie ; la somme = la vente au centime (honoraires, rétrocessions, commission, reste)', () => {
    const v = vente();
    const l = lignesParNegociateur(v, [], () => 'independant', 'criterimmo')!;
    expect(l.map((x) => [x.cote, x.negociateur])).toEqual([['entree', 'Jean-Baptiste PONS'], ['sortie', 'Cédric JULLIEN']]);
    // apporteur 2 400 réparti à parts égales (règle BB) ; honoraires de chaque partie = 6 000 TTC
    expect(l.map((x) => [x.honoraires.ttcC, x.retro.ttcC, x.payeTtc])).toEqual([[600000, 120000, 2000], [600000, 120000, 1500]]);
    expect(sommeLignes(l, 'honoraires', 'ttcC')).toBe(C(12000));
    expect(sommeLignes(l, 'retro', 'ttcC')).toBe(C(2400));
    expect(l[0].payeTtc + l[1].payeTtc).toBe(payeTtcDe(v, 'criterimmo'));
    const reste = resteTtcDe(v, [], () => 'independant', 'criterimmo');
    expect([sommeLignes(l, 'reste', 'ttcC'), sommeLignes(l, 'reste', 'htC')]).toEqual([C(reste), C(reste / 1.2)]);
  });

  it('au centime avec un partage qui ne tombe pas juste (honoraires 10 000,01 TTC, 33 / 67 %) ; rétrocession saisie au mois sur la ligne d’entrée', () => {
    const v = vente({ honorairesTtc: 10000.01, repartition: { retroApporteurTtc: 333.33, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 33), partie('sortie', 9, 'Cédric JULLIEN', 'criterimmo', 67)] } });
    const retros = [{ id: 7, societe: 'criterimmo' as const, annee: 2026, mois: 9, negociateur: 'Jean-Baptiste PONS', montantTtc: 120, apporteur: null, venteId: 41, libelle: null, origine: 'saisie' as const, sourceOnglet: null, sourceCellule: null }];
    const l = lignesParNegociateur(v, retros, () => 'independant', 'criterimmo')!;
    expect([sommeLignes(l, 'honoraires', 'ttcC'), sommeLignes(l, 'honoraires', 'htC')]).toEqual([C(10000.01), C(10000.01 / 1.2)]);
    expect(sommeLignes(l, 'retro', 'ttcC')).toBe(C(333.33) + C(retroTtcDe(v, retros)));
    expect(l[1].retro.ttcC).toBe(Math.round(33333 * 67 / 100)); // la sortie : sa seule part de l'apporteur (67 %)
    const reste = resteTtcDe(v, retros, () => 'independant', 'criterimmo');
    expect([sommeLignes(l, 'reste', 'ttcC'), sommeLignes(l, 'reste', 'htC')]).toEqual([C(reste), C(reste / 1.2)]);
  });

  it('un seul négociateur (même compte, même nom, ou « entrée et sortie »), sortie inconnue, import sans répartition, ligne miroir : une ligne (null)', () => {
    const meme = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 5, 'Jean-Baptiste PONS', 'criterimmo', 50)] } });
    const es = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree_sortie', 5, 'Jean-Baptiste PONS', 'criterimmo', 100)] } });
    const sansSortie = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 100)] } });
    const imp = vente({ repartition: null, origine: 'import', lignes: [] });
    expect([meme, es, sansSortie, imp].map((v) => lignesParNegociateur(v, [], undefined, 'criterimmo'))).toEqual([null, null, null, null]);
    const ic = vente({ repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 8, 'Pierre THEVENIN', 'macj', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Jean-Baptiste PONS' }, sortie: { id: 8, nom: 'Pierre THEVENIN' }, apporteurId: null, personnes: [] } });
    expect(lignesParNegociateur(venteDansSociete(ic, 'macj')!, [], undefined, 'macj')).toBeNull();
  });

  it('inter-cabinet, page de la porteuse : la ligne de sortie porte le négociateur de l’autre société et « reversé à MACJ » (sa part) ; somme = la vente', () => {
    const v = vente({ lignes: [vente().lignes[0]], repartition: { retroApporteurTtc: 0, parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 8, 'Pierre THEVENIN', 'macj', 50)] },
      dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Jean-Baptiste PONS' }, sortie: { id: 8, nom: 'Pierre THEVENIN' }, apporteurId: null, personnes: [] } });
    const l = lignesParNegociateur(v, [], () => 'independant', 'criterimmo')!;
    expect(l[1].negociateur).toBe('Pierre THEVENIN');
    expect(l[1].reverses.map((x) => [x.vers, x.m.ttcC])).toEqual([['MACJ', 600000]]);
    expect(l[1].reste.ttcC).toBe(0);
    const reste = resteTtcDe(v, [], () => 'independant', 'criterimmo');
    expect(sommeLignes(l, 'reste', 'ttcC')).toBe(C(reste));
    expect(sommeLignes(l, 'honoraires', 'ttcC')).toBe(C(12000));
  });
});
