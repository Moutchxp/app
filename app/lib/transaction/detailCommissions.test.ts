import { describe, expect, it } from 'vitest';
import { detailCommissions, enCentimes, estVersee, ORDRE_CATEGORIES, rangCategorie, type CategorieCout, type CleCout, type DetailCommissions } from './detailCommissions';
import { tuilesCompromis } from './commissions';
import { venteDansSociete } from './interCabinet';
import type { LigneVente, Partie, Societe, Vente } from './modele';

/**
 * 🔴 LOT AL (Arno, 29/10/2026) — LE DÉTAIL DE LA TUILE « COMMISSIONS VERSÉES » : les mêmes montants que la tuile, ligne par ligne, au même
 * centime que les cartes (règle du lot AH) ; total = somme des catégories = somme des affaires ; la tuile affiche ce total.
 */
const partie = (sorte: Partie['sorte'], id: number | null, negociateur: string | null, societe: Societe | null, pct: number, o: Partial<Partie> = {}): Partie =>
  ({ sorte, compteId: id, negociateur, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant', ...o });
const ligne = (id: number, negociateur: string, cote: 'entree' | 'sortie', ttc: number): LigneVente => ({ id, negociateur, role: 'negociateur', montantTtc: ttc, montantHt: null, cote,
  nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
const vente = (o: Partial<Vente> & { parties: Partie[]; retro?: number }): Vente => ({ id: 37, societe: 'criterimmo', libelle: 'Location ?', honorairesTtc: 7500, statut: 'compromis', annee: 2026, mois: null,
  dateCompromis: '2026-10-20', apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [], dossier: null,
  ...o, repartition: { retroApporteurTtc: o.retro ?? 0, parties: o.parties } });

/** Une catégorie par sa clé (l'ordre, lui, est vérifié à part — lot AX). */
const cat = (d: DetailCommissions, cle: CleCout): CategorieCout => d.versees.find((c) => c.cle === cle)!;
const sommes = (d: DetailCommissions) => ({
  categories: d.versees.reduce((t, c) => t + c.htC, 0), categoriesTtc: d.versees.reduce((t, c) => t + c.ttcC, 0),
  affaires: d.affaires.reduce((t, a) => t + a.verseHtC, 0), affairesTtc: d.affaires.reduce((t, a) => t + a.verseTtcC, 0),
});
const coherent = (d: DetailCommissions): void => {
  const s = sommes(d);
  expect([s.categories, s.affaires]).toEqual([d.totalHtC, d.totalHtC]);
  expect([s.categoriesTtc, s.affairesTtc]).toEqual([d.totalTtcC, d.totalTtcC]);
  for (const a of d.affaires) expect(a.lignes.filter((l) => estVersee(l.cle)).reduce((t, l) => t + l.htC, 0)).toBe(a.verseHtC);
};

describe('🔴 LOT AL — le détail des « Commissions versées »', () => {
  // « Location ? » : 7 500 TTC, apporteur Gardien Dacquet 1 000 TTC ; Arnaud (CRITERIMMO, associé) 50 % ; Pierre (MACJ, indépendant) 50 %.
  const location = (porteuse: Societe = 'criterimmo'): Vente => {
    const autre: Societe = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
    return vente({ societe: porteuse, apporteur: 'Gardien Dacquet', retro: 1000, retroApporteur: { montant: 1000, unite: 'ttc' },
      parties: [partie('entree', 2, 'Arnaud Jorel', porteuse, 50, { statut: 'associe' }), partie('sortie', 8, 'Pierre Thevenin', autre, 50)],
      lignes: [ligne(1, 'Arnaud Jorel', 'entree', 600), ligne(2, 'Pierre Thevenin', 'sortie', 1625)] });
  };

  it('CRITERIMMO porteuse : apporteur 833,33 + inter-cabinet vers MACJ 2 708,33 (les centimes des cartes) = 3 541,66 ; Arnaud interne à part', () => {
    const d = detailCommissions([location()], 'criterimmo');
    expect(d.versees.map((c) => [c.cle, c.libelle, c.htC, c.ttcC])).toEqual([
      ['independants', 'Indépendants', 0, 0], ['inter-cabinet-macj', 'Inter-cabinet vers MACJ', 270833, 325000],
      ['apporteurs', 'Apporteurs d’affaires', 83333, 100000], ['exterieur', 'Agences extérieures', 0, 0]]);
    expect(cat(d, 'apporteurs').lignes.map((l) => l.qui)).toEqual(['Gardien Dacquet']);
    expect(cat(d, 'inter-cabinet-macj').lignes.map((l) => l.qui)).toEqual(['Pierre Thevenin']);
    expect([d.totalHtC, d.totalTtcC]).toEqual([354166, 425000]);
    // la règle du lot AH : reste (2 708,34) + reversements + apporteur = commission (6 250,00) ; la tuile exacte : 3 541,666…
    expect(625000 - d.totalHtC).toBe(270834);
    expect(tuilesCompromis([location()], 'criterimmo').commissionsHt).toBeCloseTo(3541.6667, 3);
    expect(d.infos.map((c) => [c.cle, c.htC])).toEqual([['internes', 50000]]);
    coherent(d);
  });

  it('MACJ porteuse (sens inverse) : « Inter-cabinet vers CRITERIMMO » ; Pierre (indépendant, MACJ) compté chez MACJ', () => {
    const v = vente({ societe: 'macj', parties: [partie('entree', 8, 'Pierre Thevenin', 'macj', 50), partie('sortie', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe' })],
      lignes: [ligne(2, 'Pierre Thevenin', 'entree', 1625)] });
    const d = detailCommissions([v], 'macj');
    expect(d.versees.map((c) => c.cle)).toEqual(['independants', 'inter-cabinet-criterimmo', 'apporteurs', 'exterieur']);
    expect(cat(d, 'inter-cabinet-criterimmo').lignes.map((l) => [l.qui, l.htC, l.ttcC])).toEqual([['Arnaud Jorel', 312500, 375000]]);
    expect(cat(d, 'independants').lignes.map((l) => [l.qui, l.htC, l.ttcC])).toEqual([['Pierre Thevenin', 135417, 162500]]);
    expect(d.totalHtC).toBe(enCentimes(tuilesCompromis([v], 'macj').commissionsHt));
    coherent(d);
  });

  it('la ligne miroir chez MACJ : rien de versé par MACJ que son indépendant ; aucune catégorie d’inter-cabinet vers elle-même', () => {
    const m = venteDansSociete(location(), 'macj')!;
    const d = detailCommissions([m], 'macj');
    expect(d.versees.map((c) => c.cle)).toEqual(['independants', 'inter-cabinet-criterimmo', 'apporteurs', 'exterieur']);
    expect(d.versees.map((c) => c.htC)).toEqual([135417, 0, 0, 0]);
    expect(d.affaires.map((a) => [a.recueDe, a.commissionHt])).toEqual([['criterimmo', m.miroir!.partHt]]);
    expect(d.totalHtC).toBe(enCentimes(tuilesCompromis([m], 'macj').commissionsHt));
    coherent(d);
  });

  it('agences extérieures : une ligne par agence, au centime de la carte ; vue des deux sociétés : l’inter-cabinet entre nos sociétés neutralisé, à part', () => {
    const v = vente({ honorairesTtc: 4000, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 40, { statut: 'associe' }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 40),
      partie('exterieure', null, null, null, 10, { nom: 'Agence du Parc' }), partie('exterieure', null, null, null, 10, { nom: 'Agence du Lac' })] });
    const d = detailCommissions([v], 'criterimmo');
    expect(cat(d, 'exterieur').lignes.map((l) => [l.qui, l.htC, l.ttcC])).toEqual([['Agence du Parc', 33333, 40000], ['Agence du Lac', 33333, 40000]]);
    expect(cat(d, 'inter-cabinet-macj').htC).toBe(133333);
    coherent(d);
    const g = detailCommissions([v], null);
    expect(g.versees.map((c) => c.cle)).toEqual(['independants', 'apporteurs', 'exterieur']);
    expect(g.infos.map((c) => [c.cle, c.htC])).toEqual([['internes', 0], ['neutralise', 133333]]);
    coherent(g);
  });

  it('statut à renseigner : à part, non déduit', () => {
    const v = vente({ parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: null }), partie('sortie', 3, 'Mylène', 'criterimmo', 50)],
      lignes: [ligne(1, 'Arnaud Jorel', 'entree', 1200), ligne(2, 'Mylène', 'sortie', 600)] });
    const d = detailCommissions([v], 'criterimmo');
    expect(d.infos.map((c) => [c.cle, c.htC])).toEqual([['internes', 0], ['a-renseigner', 100000]]);
    expect(cat(d, 'independants').lignes.map((l) => [l.qui, l.htC])).toEqual([['Mylène', 50000]]);
    coherent(d);
  });

  it('aucune affaire : tout à 0,00, chaque catégorie vide ; une affaire sans coût apparaît avec 0 versé', () => {
    const vide = detailCommissions([], 'criterimmo');
    expect([vide.totalHtC, vide.totalTtcC, vide.affaires.length]).toEqual([0, 0, 0]);
    expect(vide.versees.every((c) => c.lignes.length === 0 && c.htC === 0)).toBe(true);
    const sans = detailCommissions([vente({ parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 100, { statut: 'associe' })] })], 'criterimmo');
    expect(sans.affaires.map((a) => [a.id, a.lignes.length, a.verseHtC])).toEqual([[37, 0, 0]]);
  });

  it('les affaires : de la plus récente à la plus ancienne, sans date à la fin ; les annulées et vendues n’y sont pas', () => {
    const p = [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 100)];
    const d = detailCommissions([vente({ id: 1, dateCompromis: '2026-09-01', parties: p }), vente({ id: 2, dateCompromis: null, parties: p }), vente({ id: 5, dateCompromis: '' as unknown as null, parties: p }), vente({ id: 3, dateCompromis: '2026-10-15', parties: p }),
      vente({ id: 4, statut: 'annulee', parties: p })], 'criterimmo');
    expect(d.affaires.map((a) => a.id)).toEqual([3, 1, 5, 2]);
  });

  it('plusieurs affaires : la somme des sous-totaux (catégories, affaires) = le total, au centime, HT et TTC', () => {
    const a = location();
    const b = { ...location('macj'), id: 38, libelle: 'HEIDIDON', honorairesTtc: 4000, retroApporteur: null, apporteur: null, repartition: { ...location('macj').repartition!, retroApporteurTtc: 0 } };
    const c = vente({ id: 39, honorairesTtc: 1000, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 33.3333), partie('sortie', 8, 'Pierre Thevenin', 'macj', 33.3333),
      partie('exterieure', null, null, null, 33.3334, { nom: 'Agence du Parc' })], lignes: [ligne(3, 'Arnaud Jorel', 'entree', 100)] });
    for (const s of ['criterimmo', 'macj', null] as const) {
      const liste = s === null ? [a, b, c] : [a, b, c].map((v) => venteDansSociete(v, s)).filter((v): v is Vente => v !== null);
      coherent(detailCommissions(liste, s));
    }
  });
});

describe('🔴 LOT AN — « N dossiers concernés » et le détail du « Chiffre d’affaires »', () => {
  const location = (porteuse: Societe = 'criterimmo', o: Partial<Vente> = {}): Vente => {
    const autre: Societe = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
    return vente({ societe: porteuse, apporteur: 'Gardien Dacquet', retro: 1000, retroApporteur: { montant: 1000, unite: 'ttc' },
      parties: [partie('entree', 2, 'Arnaud Jorel', porteuse, 50, { statut: 'associe' }), partie('sortie', 8, 'Pierre Thevenin', autre, 50)], ...o });
  };
  it('dossiers concernés : au moins une commission VERSÉE ; une affaire aux seuls internes non déduits n’y compte pas', async () => {
    const { dossiersConcernes } = await import('./detailCommissions');
    const interneSeul = vente({ id: 40, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 100, { statut: 'associe' })], lignes: [ligne(9, 'Arnaud Jorel', 'entree', 600)] });
    const sansRien = vente({ id: 41, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 100, { statut: 'associe' })] });
    const d = detailCommissions([location(), interneSeul, sansRien], 'criterimmo');
    expect(dossiersConcernes(d).map((a) => a.id)).toEqual([37]);
    expect(d.infos[0].lignes.map((l) => l.venteId)).toEqual([40]); // l'interne reste montré (section grise)
  });
  it('CRITERIMMO porteuse : CA = la vente portée (6 250) — le reversé à MACJ (2 708,33) est montré, NON déduit ; total = tuile au centime', async () => {
    const { detailCa, dossiersCa } = await import('./detailCommissions');
    const v = location();
    const d = detailCa([v], 'criterimmo');
    expect(d.sections.map((c) => [c.cle, c.htC, c.ttcC, c.compte])).toEqual([['portee-criterimmo', 625000, 750000, true], ['reverse-macj', 270833, 325000, false], ['exterieur', 0, 0, false], ['recu-macj', 0, 0, true]]);
    expect([d.totalHtC, d.totalTtcC]).toEqual([625000, 750000]);
    expect(d.totalHtC).toBe(enCentimes(tuilesCompromis([v], 'criterimmo').caHt));
    expect(dossiersCa(d).map((a) => [a.id, a.commissionHtC, a.caHtC])).toEqual([[37, 625000, 625000]]);
  });
  it('MACJ (ligne miroir) : CA = la part reçue de CRITERIMMO ; et dans l’autre sens (porteuse MACJ, reçu chez CRITERIMMO)', async () => {
    const { detailCa } = await import('./detailCommissions');
    const m = venteDansSociete(location(), 'macj')!;
    const d = detailCa([m], 'macj');
    expect(d.sections.map((c) => [c.cle, c.htC])).toEqual([['portee-macj', 0], ['reverse-criterimmo', 0], ['exterieur', 0], ['recu-criterimmo', 270833]]);
    expect(d.totalHtC).toBe(enCentimes(tuilesCompromis([m], 'macj').caHt));
    expect(d.affaires.map((a) => [a.recueDe, a.commissionHtC, a.caHtC])).toEqual([['criterimmo', null, 270833]]);
    const inverse = venteDansSociete(location('macj'), 'criterimmo')!;
    const c = detailCa([inverse], 'criterimmo');
    expect(c.sections.find((x) => x.cle === 'recu-macj')!.htC).toBe(270833);
    expect(detailCa([location('macj')], 'macj').sections.map((x) => [x.cle, x.htC])).toEqual([['portee-macj', 625000], ['reverse-criterimmo', 270833], ['exterieur', 0], ['recu-criterimmo', 0]]);
  });
  it('nos deux sociétés : chaque vente une fois ; l’inter-cabinet neutralisé à part ; le CA de chacune', async () => {
    const { detailCa } = await import('./detailCommissions');
    const a = location(); const b = { ...location('macj'), id: 38, libelle: 'HEIDIDON' };
    const d = detailCa([a, b], null);
    expect(d.sections.map((c) => [c.cle, c.htC, c.compte])).toEqual([['portee-criterimmo', 625000, true], ['portee-macj', 625000, true], ['exterieur', 0, false], ['neutralise', 541666, false]]);
    expect(d.totalHtC).toBe(enCentimes(tuilesCompromis([a, b], null).caHt));
    expect(d.parSociete).toEqual({ criterimmo: { htC: 625000 + 270833, ttcC: 750000 + 325000 }, macj: { htC: 625000 + 270833, ttcC: 750000 + 325000 } });
  });
});

describe('🔴 LOT AO — le détail du « Solde net » : CA − commissions versées, les mêmes objets', () => {
  const location = (porteuse: Societe = 'criterimmo', o: Partial<Vente> = {}): Vente => {
    const autre: Societe = porteuse === 'criterimmo' ? 'macj' : 'criterimmo';
    return vente({ societe: porteuse, apporteur: 'Gardien Dacquet', retro: 1000, retroApporteur: { montant: 1000, unite: 'ttc' },
      parties: [partie('entree', 2, 'Arnaud Jorel', porteuse, 50, { statut: 'associe' }), partie('sortie', 8, 'Pierre Thevenin', autre, 50)], ...o });
  };
  const sans = vente({ id: 50, dateCompromis: '2026-10-25', honorairesTtc: 6000, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 100, { statut: 'associe' })] });
  it('CRITERIMMO : solde = CA − commissions, au centime ; par affaire aussi ; une affaire sans commission : solde = CA ; les catégories sont celles de « Commissions versées »', async () => {
    const { detailCa, detailSolde } = await import('./detailCommissions');
    const ventes = [location(), sans];
    const ca = detailCa(ventes, 'criterimmo'); const couts = detailCommissions(ventes, 'criterimmo');
    const d = detailSolde(ca, couts);
    expect(d.couts).toBe(couts); // aucune copie
    expect([d.totalHtC, d.totalTtcC]).toEqual([ca.totalHtC - couts.totalHtC, ca.totalTtcC - couts.totalTtcC]);
    expect([ca.totalHtC, couts.totalHtC, d.totalHtC]).toEqual([1125000, 354166, 770834]);
    expect(d.affaires.map((a) => [a.id, a.caHtC, a.couts.map((l) => l.cle), a.soldeHtC])).toEqual([[50, 500000, [], 500000], [37, 625000, ['inter-cabinet-macj', 'apporteurs'], 270834]]);
    expect(d.affaires.reduce((t, a) => t + a.soldeHtC, 0)).toBe(d.totalHtC);
    expect(ca.totalHtC - couts.versees.reduce((t, c) => t + c.htC, 0)).toBe(d.totalHtC);
  });
  it('MACJ (ligne miroir), porteuse MACJ, et nos deux sociétés : la même égalité', async () => {
    const { detailCa, detailSolde } = await import('./detailCommissions');
    const cas: [Vente[], Societe | null][] = [[[venteDansSociete(location(), 'macj')!], 'macj'], [[location('macj')], 'macj'], [[venteDansSociete(location('macj'), 'criterimmo')!], 'criterimmo'], [[location(), { ...location('macj'), id: 38 }], null]];
    for (const [ventes, s] of cas) {
      const ca = detailCa(ventes, s); const couts = detailCommissions(ventes, s);
      const d = detailSolde(ca, couts);
      expect(ca.totalHtC - couts.versees.reduce((t, c) => t + c.htC, 0)).toBe(d.totalHtC);
      expect(ca.totalTtcC - couts.versees.reduce((t, c) => t + c.ttcC, 0)).toBe(d.totalTtcC);
      expect(d.affaires.reduce((t, a) => t + a.soldeHtC, 0)).toBe(d.totalHtC);
    }
  });
});

describe('🔴 LOT AQ — « Ce que l’on doit » : par personne, les mêmes lignes ; Total à verser = tuile au centime', () => {
  const v = (id: number, o: Partial<Vente> & { parties: Partie[]; retro?: number }): Vente => vente({ id, libelle: `V${id}`, honorairesTtc: 6000, ...o });
  const indep = (porteuse: Societe, autre: Societe, nego = 'Jean-Baptiste PONS') => [partie('entree', 5, nego, porteuse, 50), partie('sortie', 8, 'Pierre Thevenin', autre, 50)];
  it('un négociateur sur plusieurs compromis (cumul exact) ; le mois en cours, les mois précédents, les dates à renseigner ; acte signé et annulé exclus', async () => {
    const { detailCa, detailDu } = await import('./detailCommissions');
    const ventes = [
      v(1, { dateCompromis: '2026-10-20', parties: indep('criterimmo', 'criterimmo'), lignes: [ligne(1, 'Jean-Baptiste PONS', 'entree', 1200)] }),
      v(2, { dateCompromis: '2026-08-02', parties: indep('criterimmo', 'criterimmo'), lignes: [ligne(2, 'Jean-Baptiste PONS', 'entree', 900)] }),
      v(3, { dateCompromis: null, parties: indep('criterimmo', 'criterimmo'), lignes: [ligne(3, 'Jean-Baptiste PONS', 'entree', 300)] }),
      v(4, { statut: 'vendue', parties: indep('criterimmo', 'criterimmo'), lignes: [ligne(4, 'Jean-Baptiste PONS', 'entree', 5000)] }),
      v(5, { statut: 'annulee', parties: indep('criterimmo', 'criterimmo'), lignes: [ligne(5, 'Jean-Baptiste PONS', 'entree', 7000)] }),
    ];
    const couts = detailCommissions(ventes, 'criterimmo');
    const d = detailDu(couts, detailCa(ventes, 'criterimmo'), ventes, 'criterimmo', '2026-10-29');
    expect(d.nbDossiers).toBe(3);
    const jb = d.negociateurs.find((p) => p.nom === 'Jean-Baptiste PONS')!;
    expect([jb.classe, jb.nbDossiers, jb.ttcC, jb.moisTtcC, jb.sansDateTtcC, jb.lignes.map((l) => l.venteId)]).toEqual(['independant', 3, 240000, 120000, 30000, [1, 2, 3]]);
    expect(jb.htC).toBe(100000 + 75000 + 25000);
    expect([d.total.htC, d.total.ttcC]).toEqual([couts.totalHtC, couts.totalTtcC]);
    expect(d.total.ttcC).toBe(couts.versees.reduce((t, c) => t + c.ttcC, 0));
  });
  it('un apporteur sur plusieurs affaires ; une agence ; les internes à part (hors total)', async () => {
    const { detailCa, detailDu } = await import('./detailCommissions');
    const ventes = [
      v(1, { apporteur: 'Gardien Dacquet', retro: 600, retroApporteur: { montant: 600, unite: 'ttc' }, dateCompromis: '2026-10-01',
        parties: [partie('entree', 5, 'Arnaud', 'criterimmo', 80, { statut: 'associe' }), partie('exterieure', null, null, null, 20, { nom: 'Agence du Parc' })], lignes: [ligne(1, 'Arnaud', 'entree', 500)] }),
      v(2, { apporteur: 'Gardien Dacquet', retro: 1200, retroApporteur: { montant: 1200, unite: 'ttc' }, dateCompromis: '2026-09-01', parties: [partie('entree', 5, 'Arnaud', 'criterimmo', 100, { statut: 'associe' })] }),
    ];
    const couts = detailCommissions(ventes, 'criterimmo');
    const d = detailDu(couts, detailCa(ventes, 'criterimmo'), ventes, 'criterimmo', '2026-10-29');
    expect(d.apporteurs.map((p) => [p.nom, p.nbDossiers, p.ttcC, p.moisTtcC])).toEqual([['Gardien Dacquet', 2, 180000, 60000]]);
    expect(d.agences.map((p) => [p.nom, p.nbDossiers, p.ttcC])).toEqual([['Agence du Parc', 1, 108000]]);
    expect(d.negociateurs.map((p) => [p.nom, p.classe, p.statuts, p.ttcC])).toEqual([['Arnaud', 'interne', ['associe'], 50000]]);
    expect(d.internes.ttcC).toBe(50000);
    expect(d.total.ttcC).toBe(180000 + 108000);
  });
  it('l’inter-cabinet dans les deux sens : reversé, reçu, solde — le même montant vu de l’autre page, en HT et en TTC', async () => {
    const { detailCa, detailDu } = await import('./detailCommissions');
    const a = v(1, { honorairesTtc: 7500, dateCompromis: '2026-10-02', parties: indep('criterimmo', 'macj') });          // CRITERIMMO reverse 3 750 TTC à MACJ
    const b = v(2, { societe: 'macj', honorairesTtc: 4000, dateCompromis: '2026-09-02', parties: [partie('entree', 8, 'Pierre Thevenin', 'macj', 50), partie('sortie', 5, 'Jean-Baptiste PONS', 'criterimmo', 50)] }); // MACJ reverse 2 000 TTC
    const page = (s: Societe) => {
      const ventes = [a, b].map((x) => venteDansSociete(x, s)).filter((x): x is Vente => x !== null);
      return detailDu(detailCommissions(ventes, s), detailCa(ventes, s), ventes, s, '2026-10-29');
    };
    const c = page('criterimmo'); const m = page('macj');
    expect([c.reverse!.ttcC, c.recu!.ttcC, c.soldeInterTtcC]).toEqual([375000, 200000, -175000]);
    expect([m.reverse!.ttcC, m.recu!.ttcC, m.soldeInterTtcC]).toEqual([200000, 375000, 175000]);
    expect([c.reverse!.htC, m.recu!.htC, c.recu!.htC, m.reverse!.htC]).toEqual([312500, 312500, 166667, 166667]);
    expect(c.soldeInterHtC).toBe(-m.soldeInterHtC);
    expect([c.reverse!.moisTtcC, c.recu!.moisTtcC]).toEqual([375000, 0]);
  });
});

describe('🔴 LOT AX — l’ordre des catégories : Indépendants, Inter-cabinet, Apporteurs d’affaires, Agences extérieures (une seule constante)', () => {
  // Une affaire qui touche les quatre catégories : CRITERIMMO porteuse, 12 000 TTC, apporteur 1 200 TTC ; Pierre (CRITERIMMO, indépendant) 40 %,
  // Paul (MACJ, indépendant) 30 %, Agence du Parc 20 %, Arnaud (CRITERIMMO, associé) 10 %.
  const quatre = (): Vente => vente({ honorairesTtc: 12000, apporteur: 'Gardien Dacquet', retro: 1200, retroApporteur: { montant: 1200, unite: 'ttc' },
    parties: [partie('entree', 8, 'Pierre Thevenin', 'criterimmo', 40), partie('sortie', 9, 'Paul Martin', 'macj', 30),
      partie('exterieure', null, null, null, 20, { nom: 'Agence du Parc' }), partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 10, { statut: 'associe' })],
    lignes: [ligne(1, 'Pierre Thevenin', 'entree', 1800), ligne(2, 'Arnaud Jorel', 'entree', 600)] });
  const famille = (cle: CleCout): string => (cle.startsWith('inter-cabinet-') ? 'inter-cabinet' : cle);

  it('la constante : les quatre familles, dans l’ordre d’Arno ; les informations non déduites après', () => {
    expect([...ORDRE_CATEGORIES]).toEqual(['independants', 'inter-cabinet', 'apporteurs', 'exterieur']);
    expect(['independants', 'inter-cabinet-macj', 'inter-cabinet-criterimmo', 'apporteurs', 'exterieur', 'internes', 'a-renseigner', 'neutralise'].map((c) => rangCategorie(c as CleCout)))
      .toEqual([0, 1, 1, 2, 3, 4, 4, 4]);
  });

  for (const s of ['criterimmo', 'macj', null] as const) {
    it(`${s ?? 'CA global'} : par catégorie et par transaction, le même ordre ; les sous-totaux et le total (= tuile) au centime, HT et TTC`, () => {
      const v = s === null ? quatre() : venteDansSociete(quatre(), s)!;
      const d = detailCommissions([v], s);
      const attendu = ORDRE_CATEGORIES.flatMap((f) => (f === 'inter-cabinet' ? (s === null ? [] : [s === 'criterimmo' ? 'inter-cabinet-macj' : 'inter-cabinet-criterimmo']) : [f]));
      expect(d.versees.map((c) => c.cle)).toEqual(attendu);
      // par transaction : les lignes versées de l'affaire suivent l'ordre ; les informations non déduites, après
      const cles = d.affaires.flatMap((a) => a.lignes.map((l) => l.cle));
      expect(cles.map(rangCategorie)).toEqual([...cles.map(rangCategorie)].sort((a, b) => a - b));
      const familles = [...new Set(cles.filter(estVersee).map(famille))];
      expect(familles).toEqual(ORDRE_CATEGORIES.filter((f) => familles.includes(f)));
      // chaque ligne de catégorie se retrouve, au même centime, dans son affaire (aucun montant ne bouge, seul l'ordre change)
      const parCategorie = d.versees.flatMap((c) => c.lignes.map((l) => `${l.cle}|${l.qui}|${l.htC}|${l.ttcC}`)).sort();
      const parAffaire = d.affaires.flatMap((a) => a.lignes.filter((l) => estVersee(l.cle)).map((l) => `${l.cle}|${l.qui}|${l.htC}|${l.ttcC}`)).sort();
      expect(parAffaire).toEqual(parCategorie);
      const t = tuilesCompromis([v], s);
      expect(d.totalHtC).toBe(enCentimes(t.commissionsHt));
      coherent(d);
    });
  }

  it('CRITERIMMO : les montants de chaque catégorie, au centime (HT puis TTC)', () => {
    const d = detailCommissions([quatre()], 'criterimmo');
    expect(d.versees.map((c) => [c.cle, c.lignes.map((l) => l.qui), c.htC, c.ttcC])).toEqual([
      ['independants', ['Pierre Thevenin'], 150000, 180000], ['inter-cabinet-macj', ['Paul Martin'], 270000, 324000],
      ['apporteurs', ['Gardien Dacquet'], 100000, 120000], ['exterieur', ['Agence du Parc'], 180000, 216000]]);
    expect([d.totalHtC, d.totalTtcC]).toEqual([700000, 840000]);
    // par transaction (les deux fenêtres) : les mêmes lignes dans le même ordre, l'interne non déduit après
    expect(d.affaires[0].lignes.map((l) => [l.cle, l.qui])).toEqual([['independants', 'Pierre Thevenin'], ['inter-cabinet-macj', 'Paul Martin'],
      ['apporteurs', 'Gardien Dacquet'], ['exterieur', 'Agence du Parc'], ['internes', 'Arnaud Jorel']]);
  });
});
