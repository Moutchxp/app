import { describe, expect, it } from 'vitest';
import { controleVentilation, mentionPartAgence, partAgenceRattacheeHt, ventilationVente, type MontantC, type VentilationCote } from './partAgence';
import { tuilesCompromis } from './commissions';
import { detailCa, detailCommissions, detailDu } from './detailCommissions';
import { venteDansSociete } from './interCabinet';
import type { LigneVente, Partie, Societe, Vente } from './modele';
import type { Statut } from '../admin/statut';

/**
 * 🔴 LOT AY (Arno, 30/10/2026) — LA PART DE L'AGENCE : dans chaque carte de partie, 100 % des honoraires de la partie ventilés —
 * commissions + quote-part apporteur / agences extérieures + inter-cabinet versé + part de l'agence = honoraires de la partie, au centime ;
 * rattachée au CA de l'associé de la société ; aucune tuile ni synthèse ne change.
 */
const partie = (sorte: Partie['sorte'], id: number | null, negociateur: string | null, societe: Societe | null, pct: number, o: Partial<Partie> = {}): Partie =>
  ({ sorte, compteId: id, negociateur, societe, nom: null, coordonnees: null, pourcentage: pct, montantHt: null, statut: 'independant', ...o });
const ligne = (id: number, negociateur: string, cote: 'entree' | 'sortie', ttc: number): LigneVente => ({ id, negociateur, role: 'negociateur', montantTtc: ttc, montantHt: null, cote,
  nature: 'compromis', compte: false, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });
const nego = (p: Partie | undefined) => (p === undefined || p.compteId === null ? null : { id: p.compteId, nom: p.negociateur! });
const vente = (o: Partial<Vente> & { parties: Partie[]; retro?: number }): Vente => {
  const e = o.parties.find((p) => p.sorte === 'entree' || p.sorte === 'entree_sortie');
  const s = o.parties.find((p) => p.sorte === 'sortie' || p.sorte === 'entree_sortie');
  return { id: 260, societe: 'macj', libelle: 'FABARRO', honorairesTtc: 25000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-10-20', apporteur: null, note: null,
    origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, double: null, lignes: [],
    dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: nego(e), sortie: nego(s), apporteurId: null, personnes: [] },
    ...o, repartition: { retroApporteurTtc: o.retro ?? 0, parties: o.parties } } as Vente;
};
const ttc = (m: MontantC): number => m.ttcC / 100;
const ht = (m: MontantC): number => m.htC / 100;
/** La règle d'Arno : chaque carte, au centime, dans chaque unité. */
const somme = (c: VentilationCote): MontantC => [...c.commissions.map((x) => x.m), ...c.quoteParts.map((x) => x.m), ...(c.versee === null ? [] : [c.versee.m]), c.agence]
  .reduce((t, m) => ({ htC: t.htC + m.htC, ttcC: t.ttcC + m.ttcC }), { htC: 0, ttcC: 0 });
const complet = (vt: ReturnType<typeof ventilationVente>): void => { for (const c of Object.values(vt)) expect(somme(c!)).toEqual(c!.honoraires); };

// FABARRO (MACJ, 25 000 TTC) : Cédric JULLIEN associé non commissionné côté vendeurs, Pierre Thevenin indépendant 50 % côté acquéreurs.
const fabarro = (o: { statutSortie?: Statut; ligneSortie?: number } = {}): Vente => vente({
  parties: [partie('entree', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50, { statut: o.statutSortie ?? 'independant' })],
  lignes: o.ligneSortie === undefined ? [] : [ligne(1, 'Pierre Thevenin', 'sortie', o.ligneSortie)] });

describe('🔴 LOT AY — la part de l’agence, carte par carte', () => {
  it('FABARRO — 🔴 LOT BI : Vendeurs (Cédric JULLIEN, associé) 12 500 TTC conservés et comptés dans son CA ; Acquéreurs (Pierre, indépendant) 6 250 + part de l’agence 6 250, NON rattachée', () => {
    const vt = ventilationVente(fabarro(), 'macj');
    expect([ttc(vt.entree!.honoraires), vt.entree!.commissions.length, ttc(vt.entree!.agence)]).toEqual([12500, 0, 12500]);
    expect(mentionPartAgence(vt.entree!)).toBe('Comptés dans le CA de Cédric JULLIEN (associé)');
    expect(vt.entree!.associes.map((a) => [a.nom, ttc(a.m)])).toEqual([['Cédric JULLIEN', 12500]]);
    expect([ttc(vt.sortie!.honoraires), vt.sortie!.commissions.map((c) => [c.negociateur, ttc(c.m)]), ttc(vt.sortie!.agence)]).toEqual([12500, [['Pierre Thevenin', 6250]], 6250]);
    expect([mentionPartAgence(vt.sortie!), vt.sortie!.associes, vt.sortie!.conserve]).toEqual(['Reste dans le CA de MACJ — non reversé', [], null]);
    // HT, centimes du lot AH (ceux de la Répartition) : 10 416,67 (entrée) + 10 416,66 (sortie, la porteuse prend l'écart) = 20 833,33 ;
    // sortie : 5 208,33 + 5 208,33 (la part de l'agence, reste exact)
    expect([ht(vt.entree!.honoraires), ht(vt.sortie!.honoraires), ht(vt.sortie!.commissions[0].m), ht(vt.sortie!.agence)]).toEqual([10416.67, 10416.66, 5208.33, 5208.33]);
    complet(vt);
  });

  it('partie sans commission (non commissionné) → part de l’agence = 100 % ; partie sans négociateur → 100 %, reste dans le CA', () => {
    const vt = ventilationVente(fabarro(), 'macj');
    expect(vt.entree!.agence).toEqual(vt.entree!.honoraires);
    const sansNego = vente({ parties: [partie('entree', null, null, 'macj', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] });
    const v2 = ventilationVente(sansNego, 'macj');
    expect([ttc(v2.entree!.agence), v2.entree!.associes, mentionPartAgence(v2.entree!)]).toEqual([12500, [], 'Reste dans le CA de MACJ — non reversé']);
    complet(v2);
  });

  it('indépendant 50 % → 50 / 50 ; une commission enregistrée (saisie) prime sur le calcul', () => {
    const sans = vente({ parties: [partie('entree', 7, 'Mylène EBERLIN', 'macj', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] });
    const vt = ventilationVente(sans, 'macj');
    expect([ttc(vt.sortie!.commissions[0].m), ttc(vt.sortie!.agence), mentionPartAgence(vt.sortie!)]).toEqual([6250, 6250, 'Reste dans le CA de MACJ — non reversé']);
    const saisie = ventilationVente(fabarro({ ligneSortie: 5000 }), 'macj');
    expect([ttc(saisie.sortie!.commissions[0].m), ttc(saisie.sortie!.agence)]).toEqual([5000, 7500]);
    complet(vt); complet(saisie);
  });

  it('salarié commissionné : sa commission sort de la part de l’agence (même interne)', () => {
    const vt = ventilationVente(fabarro({ statutSortie: 'salarie' }), 'macj');
    expect([ttc(vt.sortie!.commissions[0].m), ttc(vt.sortie!.agence)]).toEqual([6250, 6250]);
    complet(vt);
  });

  it('apporteur (🔴 LOT BB : déduit dans l’en-tête de chaque carte, plus réparti) : honoraires NETS 3 250 / 3 250 ; nets + apporteur = la commission de la vente', () => {
    // « Location ? » : 7 500 TTC, apporteur 1 000 TTC ; Arnaud (CRITERIMMO, associé non commissionné) 50 %, Pierre (CRITERIMMO, indépendant) 50 %.
    const v = vente({ id: 37, societe: 'criterimmo', honorairesTtc: 7500, retro: 1000, apporteur: 'Gardien Dacquet',
      parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'criterimmo', 50)] });
    const vt = ventilationVente(v, 'criterimmo');
    expect([vt.entree!.quoteParts, vt.sortie!.quoteParts]).toEqual([[], []]);
    for (const c of [vt.entree!, vt.sortie!]) expect(c.apporteurs.map((a) => [a.nom, ttc(a.m), ht(a.m)])).toEqual([['Gardien Dacquet', 1000, 833.33]]);
    expect([ttc(vt.entree!.honoraires), ttc(vt.entree!.agence), ttc(vt.sortie!.honoraires), ttc(vt.sortie!.commissions[0].m), ttc(vt.sortie!.agence)]).toEqual([3250, 3250, 3250, 1625, 1625]);
    // HT : 5 416,67 de nette ne se partage pas juste en deux (2 708,333…) : un centime reporté sur la dernière partie de la porteuse (lot AH)
    expect([ht(vt.entree!.honoraires), ht(vt.sortie!.honoraires)]).toEqual([2708.33, 2708.34]);
    // les deux cartes (nettes) + l'apporteur = la commission de la vente, au centime
    expect(vt.entree!.honoraires.ttcC + vt.sortie!.honoraires.ttcC + 100000).toBe(750000);
    expect(vt.entree!.honoraires.htC + vt.sortie!.honoraires.htC + 83333).toBe(625000);
    expect(vt.entree!.pctQuote).toBe(50);
    complet(vt);
  });

  it('agence extérieure : sa quote-part dans chaque carte, avec l’apporteur', () => {
    // 12 000 TTC, apporteur 2 400 ; JB (CRITERIMMO, indépendant) 40 %, Paul (CRITERIMMO, indépendant) 40 %, Agence du Parc 20 %.
    const v = vente({ id: 41, societe: 'criterimmo', honorairesTtc: 12000, retro: 2400, apporteur: 'Julien Deblois',
      parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 40), partie('sortie', 6, 'Paul Martin', 'criterimmo', 40),
        partie('exterieure', null, null, null, 20, { nom: 'Agence du Parc' })] });
    const vt = ventilationVente(v, 'criterimmo');
    // 🔴 LOT BB — l'apporteur dans l'en-tête ; l'agence extérieure reste un cadre (sa quote-part au prorata de nos parties)
    expect(vt.entree!.quoteParts.map((q) => [q.cle, q.nom, ttc(q.m)])).toEqual([['exterieure', 'Agence du Parc', 960]]);
    expect(vt.entree!.apporteurs.map((a) => [a.nom, ttc(a.m)])).toEqual([['Julien Deblois', 2400]]);
    // honoraires nets de la partie : 3 840 (base) + 960 = 4 800 = (12 000 − 2 400) × 50 %
    expect([ttc(vt.entree!.base), ttc(vt.entree!.honoraires), ttc(vt.entree!.commissions[0].m), ttc(vt.entree!.agence)]).toEqual([3840, 4800, 1920, 1920]);
    complet(vt);
  });

  it('inter-cabinet, vue de la porteuse : le côté de l’autre société est versé (part de l’agence 0) ; la ligne miroir : la part de la société qui reçoit, à partir de sa part reçue', () => {
    const v = vente({ id: 38, societe: 'criterimmo', honorairesTtc: 4000,
      parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)],
      lignes: [ligne(1, 'Pierre Thevenin', 'sortie', 1000)] });
    const vt = ventilationVente(v, 'criterimmo');
    expect([ttc(vt.entree!.agence), mentionPartAgence(vt.entree!)]).toEqual([2000, 'Comptés dans le CA de Arnaud Jorel (associé)']);
    expect([vt.sortie!.versee?.vers, ttc(vt.sortie!.versee!.m), vt.sortie!.commissions.length, ttc(vt.sortie!.agence), vt.sortie!.associes]).toEqual(['macj', 2000, 0, 0, []]);
    complet(vt);
    // vue de MACJ : la vente d'origine ne se lit pas ici ; sa ligne miroir, oui
    expect(ventilationVente(v, 'macj')).toEqual({});
    const m = venteDansSociete(v, 'macj')!;
    const vm = ventilationVente(m, 'macj');
    expect(Object.keys(vm)).toEqual(['sortie']);
    expect([vm.sortie!.societe, ttc(vm.sortie!.honoraires), ttc(vm.sortie!.commissions[0].m), ttc(vm.sortie!.agence), mentionPartAgence(vm.sortie!)])
      .toEqual(['macj', 2000, 1000, 1000, 'Reste dans le CA de MACJ — non reversé']);
    complet(vm);
    // CA global : rien n'est versé entre nos sociétés (neutralisé) — chaque côté garde sa part, chez sa société
    const g = ventilationVente(v, null);
    expect([g.sortie!.versee, g.sortie!.societe, ttc(g.sortie!.agence)]).toEqual([null, 'macj', 1000]);
    complet(g);
  });

  it('ligne miroir d’un associé de la société qui reçoit : rattachée à son CA', () => {
    const v = vente({ id: 39, societe: 'criterimmo', honorairesTtc: 6000,
      parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe' }), partie('sortie', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe', commissionne: false })] });
    const vm = ventilationVente(venteDansSociete(v, 'macj')!, 'macj');
    expect([ttc(vm.sortie!.agence), mentionPartAgence(vm.sortie!)]).toEqual([3000, 'Comptés dans le CA de Cédric JULLIEN (associé)']);
  });

  it('🔴 LOT BI — deux associés, un par côté : chacun SON côté (aucun partage) ; le même associé des deux côtés : 100 % de la vente', () => {
    const v = vente({ honorairesTtc: 1000.01, parties: [partie('entree', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe', commissionne: false }),
      partie('sortie', 3, 'Augustin Jorel', 'macj', 50, { statut: 'associe', commissionne: false })] });
    const vt = ventilationVente(v, 'macj');
    expect([vt.entree!, vt.sortie!].map((c) => [mentionPartAgence(c), c.associes.map((a) => a.nom), c.associes[0].m])).toEqual([
      ['Comptés dans le CA de Cédric JULLIEN (associé)', ['Cédric JULLIEN'], vt.entree!.agence],
      ['Comptés dans le CA de Augustin Jorel (associé)', ['Augustin Jorel'], vt.sortie!.agence]]);
    complet(vt);
    const meme = vente({ parties: [partie('entree', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe' }), partie('sortie', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe' })] });
    const r = partAgenceRattacheeHt([meme], 'macj');
    expect([...r]).toEqual([['Cédric JULLIEN', 20833.33]]); // toute la vente (10 416,67 + 10 416,66)
  });

  it('un associé de l’AUTRE société ne prend pas la part de la société de l’écran', () => {
    const v = vente({ id: 40, societe: 'criterimmo', honorairesTtc: 6000,
      parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe', commissionne: false })] });
    const vt = ventilationVente(v, 'criterimmo');
    expect([vt.entree!.associes, mentionPartAgence(vt.entree!)]).toEqual([[], 'Reste dans le CA de CRITERIMMO — non reversé']);
  });

  it('sans répartition (historique importé) : rien n’est ventilé, rien n’est inventé', () => {
    expect(ventilationVente({ ...fabarro(), repartition: null }, 'macj')).toEqual({});
  });

  it('CA généré (🔴 LOT BI) : le côté de l’associé seulement, en HT (les annulées n’y comptent pas) ; rien pour le côté de l’indépendant', () => {
    const r = partAgenceRattacheeHt([fabarro(), { ...fabarro(), id: 261, statut: 'annulee' }], 'macj');
    expect([...r]).toEqual([['Cédric JULLIEN', 10416.67]]);
  });

  it('aucune tuile, aucune fenêtre ni synthèse ne change : elles ne lisent pas la part de l’agence (mêmes chiffres qu’avant le lot)', () => {
    const vs = [fabarro()];
    expect(tuilesCompromis(vs, 'macj').commissionsHt).toBe(0); // aucune commission enregistrée : rien de versé (la règle des tuiles)
    expect(tuilesCompromis(vs, 'macj').caHt).toBeCloseTo(25000 / 1.2, 9);
    const couts = detailCommissions(vs, 'macj');
    expect([couts.totalHtC, couts.totalTtcC]).toEqual([0, 0]);
    expect(detailDu(couts, detailCa(vs, 'macj'), vs, 'macj', '2026-10-30').total.htC).toBe(0);
  });
});

describe('🔴 LOT BA — l’en-tête de chaque carte, l’inter-cabinet vu de la porteuse et de la ligne miroir, le contrôle permanent', () => {
  const lt = (id: number, negociateur: string, cote: 'entree' | 'sortie', ttc: number, taux: number): LigneVente => ({ ...ligne(id, negociateur, cote, ttc), taux });
  // FABARRO tel qu'Arno l'a laissé : CRITERIMMO porteuse, 25 000 TTC ; JB PONS (CRITERIMMO, salarié, 25 %) vendeurs ; Pierre Thevenin (MACJ, indépendant, 60 %) acquéreurs.
  const fab = (): Vente => vente({ id: 260, societe: 'criterimmo', honorairesTtc: 25000,
    parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50, { statut: 'salarie' }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)],
    lignes: [lt(1, 'Jean-Baptiste PONS', 'entree', 3125, 25), lt(2, 'Pierre Thevenin', 'sortie', 7500, 60)] });
  const juste = (v: Vente, vue: Societe | null): void => {
    const c = controleVentilation(v, vue)!;
    expect(c.ecart).toEqual({ htC: 0, ttcC: 0 });
    expect(c.ventile).toEqual(c.attendu);
  };

  it('FABARRO, page CRITERIMMO : vendeurs 9 375 + 3 125 = 12 500 ; acquéreurs : part de l’agence 0 + reversé 12 500 (dont Pierre 7 500, payée par MACJ, et part de l’agence MACJ 5 000, hors total)', () => {
    const vt = ventilationVente(fab(), 'criterimmo');
    expect([ttc(vt.entree!.honoraires), ttc(vt.entree!.agence), ttc(vt.entree!.commissions[0].m)]).toEqual([12500, 9375, 3125]);
    const w = vt.sortie!.versee!;
    expect([ttc(vt.sortie!.honoraires), ttc(vt.sortie!.agence), w.vers, ttc(w.m), w.negociateur, w.taux, ttc(w.commission!), ttc(w.agenceAutre)])
      .toEqual([12500, 0, 'macj', 12500, 'Pierre Thevenin', 60, 7500, 5000]);
    expect(vt.sortie!.commissions).toEqual([]); // la commission de Pierre n'est pas un cadre de la carte de CRITERIMMO (elle est « dont »)
    // l'en-tête : la commission de la vente × la part ; HT au centime du lot AH (la porteuse, l'entrée, prend l'écart)
    expect([vt.entree!.commissionVente, vt.entree!.pctQuote, ht(vt.entree!.honoraires), ht(vt.sortie!.honoraires)]).toEqual([{ htC: 2083333, ttcC: 2500000 }, 50, 10416.66, 10416.67]);
    // le reversé = le montant de la fenêtre « Commissions versées » (Inter-cabinet vers MACJ)
    const couts = detailCommissions([fab()], 'criterimmo');
    expect(couts.versees.find((c) => c.cle === 'inter-cabinet-macj')!.htC).toBe(w.m.htC);
    complet(vt); juste(fab(), 'criterimmo');
  });

  it('FABARRO, ligne miroir MACJ : « Honoraires reçus de CRITERIMMO » 12 500 = part de l’agence MACJ 5 000 + commission de Pierre 7 500', () => {
    const m = venteDansSociete(fab(), 'macj')!;
    const vm = ventilationVente(m, 'macj');
    expect([vm.sortie!.recuDe, ttc(vm.sortie!.honoraires), ttc(vm.sortie!.agence), ttc(vm.sortie!.commissions[0].m)]).toEqual(['criterimmo', 12500, 5000, 7500]);
    juste(m, 'macj');
  });

  it('le contrôle tombe juste, au centime (HT et TTC), sur les cas types — et ne contrôle pas ce qui n’a pas de répartition', () => {
    const cas: [Vente, Societe | null][] = [
      [fab(), 'criterimmo'], [fab(), null],
      // inter-cabinet dans l'autre sens : MACJ porteuse, JB (CRITERIMMO) acquéreurs
      [vente({ honorairesTtc: 9000.01, parties: [partie('entree', 7, 'Mylène EBERLIN', 'macj', 37.5), partie('sortie', 5, 'Jean-Baptiste PONS', 'criterimmo', 62.5)] }), 'macj'],
      // apporteur + agence extérieure + indépendant
      [vente({ id: 41, societe: 'criterimmo', honorairesTtc: 12000, retro: 2400, apporteur: 'Julien Deblois', parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 40),
        partie('sortie', 7, 'Mylène EBERLIN', 'macj', 40), partie('exterieure', null, null, null, 20, { nom: 'Agence du Parc' })] }), 'criterimmo'],
      // associé non commissionné, salarié, apporteur, centimes impairs
      [vente({ id: 37, societe: 'criterimmo', honorairesTtc: 7500, retro: 1000, parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe', commissionne: false }),
        partie('sortie', 3, 'Mylène', 'criterimmo', 50, { statut: 'salarie' })] }), 'criterimmo'],
      // partie à 0 % : le même négociateur porte tout (100 / 0), puis 50 / 50
      [vente({ parties: [partie('entree', 8, 'Pierre Thevenin', 'macj', 100)], dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 8, nom: 'Pierre Thevenin' },
        sortie: { id: 8, nom: 'Pierre Thevenin' }, apporteurId: null, personnes: [] } }), 'macj'],
      [vente({ parties: [partie('entree', 8, 'Pierre Thevenin', 'macj', 50), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] }), 'macj'],
    ];
    for (const [v, vue] of cas) juste(v, vue);
    const zero = ventilationVente(cas[5][0], 'macj');
    expect([ttc(zero.entree!.honoraires), ttc(zero.sortie!.honoraires), zero.sortie!.pctQuote]).toEqual([25000, 0, 0]);
    expect(controleVentilation({ ...fab(), repartition: null }, 'criterimmo')).toBeNull();
    expect(controleVentilation(fab(), 'macj')).toBeNull(); // la vente d'origine ne se lit pas chez MACJ (sa ligne miroir, oui)
  });

  it('données incomplètes : une partie de nos sociétés qui n’est ni l’entrée ni la sortie → l’écart, exactement sa part', () => {
    const v = vente({ honorairesTtc: 12000, parties: [partie('entree', 7, 'Mylène EBERLIN', 'macj', 40), partie('sortie', 8, 'Pierre Thevenin', 'macj', 40), partie('sortie', 4, 'Augustin Jorel', 'macj', 20)] });
    const c = controleVentilation(v, 'macj')!;
    expect([c.ecart.ttcC, c.ecart.htC]).toEqual([240000, 200000]);
  });
});

describe('🔴 LOT BI — le rattachement aux associés, côté par côté (remplace la règle du lot AY)', () => {
  const lt = (id: number, negociateur: string, cote: 'entree' | 'sortie', ttc: number, taux: number): LigneVente => ({ ...ligne(id, negociateur, cote, ttc), taux });
  it('associé commissionné : un seul cadre (sa commission n’est pas distinguée), « (associé, commissionné) » ; « CA généré » = paye + le reste du côté (rien compté deux fois)', () => {
    const v = vente({ parties: [partie('entree', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe' }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)],
      lignes: [lt(1, 'Cédric JULLIEN', 'entree', 6250, 50)] });
    const vt = ventilationVente(v, 'macj');
    expect([vt.entree!.commissions, ttc(vt.entree!.agence), mentionPartAgence(vt.entree!)]).toEqual([[], 12500, 'Comptés dans le CA de Cédric JULLIEN (associé, commissionné)']);
    expect(vt.entree!.conserve!.commissionEnregistreeHtC).toBe(520833);
    // sa paye (5 208,33 HT) + ce qui est ajouté (10 416,67 − 5 208,33) = tout son côté, 10 416,67 HT
    expect([...partAgenceRattacheeHt([v], 'macj')]).toEqual([['Cédric JULLIEN', 5208.34]]);
    complet(vt);
  });

  it('associé d’un côté, indépendant de l’autre : seul le côté de l’associé lui est rattaché ; l’autre côté, commission + part de l’agence non rattachée', () => {
    const v = vente({ parties: [partie('entree', 2, 'Arnaud Jorel', 'macj', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)] });
    const vt = ventilationVente(v, 'macj');
    expect(vt.entree!.associes.map((a) => [a.nom, ttc(a.m)])).toEqual([['Arnaud Jorel', 12500]]);
    expect([vt.sortie!.associes, ttc(vt.sortie!.commissions[0].m), ttc(vt.sortie!.agence), mentionPartAgence(vt.sortie!)]).toEqual([[], 6250, 6250, 'Reste dans le CA de MACJ — non reversé']);
    complet(vt);
  });

  it('salarié des deux côtés : aucun rattachement ; les montants de la société ne changent pas (tuiles)', () => {
    const v = vente({ parties: [partie('entree', 2, 'Arnaud Jorel', 'macj', 50, { statut: 'salarie' }), partie('sortie', 3, 'Mylène', 'macj', 50, { statut: 'salarie' })] });
    const vt = ventilationVente(v, 'macj');
    expect([vt.entree!.associes, vt.sortie!.associes, vt.entree!.conserve, vt.sortie!.conserve]).toEqual([[], [], null, null]);
    expect(partAgenceRattacheeHt([v], 'macj').size).toBe(0);
    expect(tuilesCompromis([v], 'macj').caHt).toBeCloseTo(25000 / 1.2, 9);
    complet(vt);
  });

  it('ligne miroir : le négociateur de ce côté est un associé de la société qui reçoit — la part reçue est comptée dans son CA, sans distinguer sa commission', () => {
    const v = vente({ id: 39, societe: 'criterimmo', honorairesTtc: 6000,
      parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 50), partie('sortie', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe' })],
      lignes: [lt(1, 'Cédric JULLIEN', 'sortie', 1500, 50)] });
    const vm = ventilationVente(venteDansSociete(v, 'macj')!, 'macj');
    expect([vm.sortie!.commissions, ttc(vm.sortie!.agence), mentionPartAgence(vm.sortie!)]).toEqual([[], 3000, 'Comptés dans le CA de Cédric JULLIEN (associé, commissionné)']);
    // côté porteuse : inchangé (le reversé en rouge, rien n'est rattaché à Cédric chez CRITERIMMO)
    const vp = ventilationVente(v, 'criterimmo');
    expect([vp.sortie!.versee?.vers, vp.sortie!.associes, vp.sortie!.conserve]).toEqual(['macj', [], null]);
  });
});
