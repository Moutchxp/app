import { describe, expect, it } from 'vitest';
import { mentionPartAgence, partAgenceRattacheeHt, partsEgales, ventilationVente, type MontantC, type VentilationCote } from './partAgence';
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
  it('FABARRO (l’exemple d’Arno) : Vendeurs 12 500 TTC rattachés à Cédric JULLIEN ; Acquéreurs Pierre 6 250 + part de l’agence 6 250 rattachée à Cédric', () => {
    const vt = ventilationVente(fabarro(), 'macj');
    expect([ttc(vt.entree!.honoraires), vt.entree!.commissions.length, ttc(vt.entree!.agence)]).toEqual([12500, 0, 12500]);
    expect(mentionPartAgence(vt.entree!)).toBe('Rattachée au CA de Cédric JULLIEN (associé)');
    expect([ttc(vt.sortie!.honoraires), vt.sortie!.commissions.map((c) => [c.negociateur, ttc(c.m)]), ttc(vt.sortie!.agence)]).toEqual([12500, [['Pierre Thevenin', 6250]], 6250]);
    expect(mentionPartAgence(vt.sortie!)).toBe('Rattachée au CA de Cédric JULLIEN (associé)');
    // HT : 10 416,67 = 5 208,33 + 5 208,34 (la part de l'agence, reste exact)
    expect([ht(vt.sortie!.honoraires), ht(vt.sortie!.commissions[0].m), ht(vt.sortie!.agence)]).toEqual([10416.67, 5208.33, 5208.34]);
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

  it('apporteur : sa quote-part dans chaque carte (au prorata des parts, centimes du lot AH, l’écart sur le dernier) ; commissions + apporteur + part = honoraires', () => {
    // « Location ? » : 7 500 TTC, apporteur 1 000 TTC ; Arnaud (CRITERIMMO, associé non commissionné) 50 %, Pierre (CRITERIMMO, indépendant) 50 %.
    const v = vente({ id: 37, societe: 'criterimmo', honorairesTtc: 7500, retro: 1000, apporteur: 'Gardien Dacquet',
      parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'criterimmo', 50)] });
    const vt = ventilationVente(v, 'criterimmo');
    expect(vt.entree!.quoteParts.map((q) => [q.cle, q.nom, ttc(q.m), ht(q.m)])).toEqual([['apporteur', 'Gardien Dacquet', 500, 416.67]]);
    expect(vt.sortie!.quoteParts.map((q) => [ttc(q.m), ht(q.m)])).toEqual([[500, 416.66]]);
    expect([ttc(vt.entree!.honoraires), ttc(vt.entree!.agence), ttc(vt.sortie!.commissions[0].m), ttc(vt.sortie!.agence)]).toEqual([3750, 3250, 1625, 1625]);
    // les deux quote-parts = l'apporteur ; les deux cartes = la commission de la vente, au centime
    expect(vt.entree!.quoteParts[0].m.htC + vt.sortie!.quoteParts[0].m.htC).toBe(83333);
    expect(vt.entree!.honoraires.ttcC + vt.sortie!.honoraires.ttcC).toBe(750000);
    expect(vt.entree!.pctQuote).toBe(50);
    complet(vt);
  });

  it('agence extérieure : sa quote-part dans chaque carte, avec l’apporteur', () => {
    // 12 000 TTC, apporteur 2 400 ; JB (CRITERIMMO, indépendant) 40 %, Paul (CRITERIMMO, indépendant) 40 %, Agence du Parc 20 %.
    const v = vente({ id: 41, societe: 'criterimmo', honorairesTtc: 12000, retro: 2400, apporteur: 'Julien Deblois',
      parties: [partie('entree', 5, 'Jean-Baptiste PONS', 'criterimmo', 40), partie('sortie', 6, 'Paul Martin', 'criterimmo', 40),
        partie('exterieure', null, null, null, 20, { nom: 'Agence du Parc' })] });
    const vt = ventilationVente(v, 'criterimmo');
    expect(vt.entree!.quoteParts.map((q) => [q.cle, q.nom, ttc(q.m)])).toEqual([['apporteur', 'Julien Deblois', 1200], ['exterieure', 'Agence du Parc', 960]]);
    // honoraires de la partie : 3 840 (base) + 1 200 + 960 = 6 000 = la moitié de la commission
    expect([ttc(vt.entree!.base), ttc(vt.entree!.honoraires), ttc(vt.entree!.commissions[0].m), ttc(vt.entree!.agence)]).toEqual([3840, 6000, 1920, 1920]);
    complet(vt);
  });

  it('inter-cabinet, vue de la porteuse : le côté de l’autre société est versé (part de l’agence 0) ; la ligne miroir : la part de la société qui reçoit, à partir de sa part reçue', () => {
    const v = vente({ id: 38, societe: 'criterimmo', honorairesTtc: 4000,
      parties: [partie('entree', 2, 'Arnaud Jorel', 'criterimmo', 50, { statut: 'associe', commissionne: false }), partie('sortie', 8, 'Pierre Thevenin', 'macj', 50)],
      lignes: [ligne(1, 'Pierre Thevenin', 'sortie', 1000)] });
    const vt = ventilationVente(v, 'criterimmo');
    expect([ttc(vt.entree!.agence), mentionPartAgence(vt.entree!)]).toEqual([2000, 'Rattachée au CA de Arnaud Jorel (associé)']);
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
    expect([ttc(vm.sortie!.agence), mentionPartAgence(vm.sortie!)]).toEqual([3000, 'Rattachée au CA de Cédric JULLIEN (associé)']);
  });

  it('deux associés de la société : la part de chaque carte, pour moitié chacun (le centime d’écart sur le dernier)', () => {
    const v = vente({ honorairesTtc: 1000.01, parties: [partie('entree', 9, 'Cédric JULLIEN', 'macj', 50, { statut: 'associe', commissionne: false }),
      partie('sortie', 3, 'Augustin Jorel', 'macj', 50, { statut: 'associe', commissionne: false })] });
    const vt = ventilationVente(v, 'macj');
    for (const c of [vt.entree!, vt.sortie!]) {
      expect(mentionPartAgence(c)).toBe('Rattachée pour moitié au CA de Cédric JULLIEN et de Augustin Jorel (associés)');
      expect(c.associes.map((a) => a.nom)).toEqual(['Cédric JULLIEN', 'Augustin Jorel']);
      expect(c.associes[0].m.ttcC + c.associes[1].m.ttcC).toBe(c.agence.ttcC);
      expect(c.associes[0].m.htC + c.associes[1].m.htC).toBe(c.agence.htC);
      expect(Math.abs(c.associes[1].m.ttcC - c.associes[0].m.ttcC)).toBeLessThanOrEqual(1);
    }
    expect(partsEgales({ htC: 101, ttcC: 5 }, 2)).toEqual([{ htC: 50, ttcC: 2 }, { htC: 51, ttcC: 3 }]);
    complet(vt);
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

  it('CA généré : la part de l’agence rattachée à chaque associé, en HT (les annulées n’y comptent pas)', () => {
    const r = partAgenceRattacheeHt([fabarro(), { ...fabarro(), id: 261, statut: 'annulee' }], 'macj');
    expect([...r]).toEqual([['Cédric JULLIEN', 10416.67 + 5208.34]]);
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
