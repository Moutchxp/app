import { describe, expect, it } from 'vitest';
import { caHt, celluleGlobal, concerne, exterieurHt, ht, totaux, type Partie, type Vente } from './modele';
import { partieExterieure, partiesParDefaut, partsParSociete, pourcentageDe, pourcentagesParSociete, verifierRepartition } from './repartition';
import { comptesDeLOnglet, deduireSocietes, ongletsDesDeuxSocietes, societeALaDate } from './societeNegociateur';
import { cleTelephone, libelleDesPersonnes, memePersonne, personneExistante } from './personnes';

/**
 * 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — la RÉPARTITION de la commission (règles pures), la société des collaborateurs,
 * les personnes sans doublon. Les chiffres sont recalculés à la main dans chaque cas.
 */
const JB = { id: 5, nom: 'Jean-Baptiste PONS', societe: 'criterimmo' as const };
const AR = { id: 2, nom: 'Arnaud Jorel', societe: 'criterimmo' as const };
const MY = { id: 7, nom: 'Mylène EBERLIN', societe: 'macj' as const };
const vente = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'DUPONT / MARTIN', honorairesTtc: 12000, statut: 'vendue', annee: 2026, mois: 11,
  dateCompromis: null, apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const pct = (p: Partie, x: number): Partie => ({ ...p, pourcentage: x, montantHt: null });

describe('les parties par défaut', () => {
  it('deux négociateurs différents ⇒ 50 % / 50 %', () => {
    const p = partiesParDefaut(JB, MY);
    expect(p.map((x) => [x.sorte, x.compteId, x.societe, x.pourcentage])).toEqual([['entree', 5, 'criterimmo', 50], ['sortie', 7, 'macj', 50]]);
  });
  it('le même négociateur des deux côtés ⇒ une partie à 100 %', () => {
    expect(partiesParDefaut(JB, JB).map((x) => [x.sorte, x.pourcentage])).toEqual([['entree_sortie', 100]]);
    expect(partiesParDefaut(JB, null).map((x) => [x.sorte, x.pourcentage])).toEqual([['entree', 100]]);
    expect(partiesParDefaut(null, null)).toEqual([]);
  });
});

describe('vérifier la répartition (avant tout enregistrement)', () => {
  it('50/50 et 100 % sont justes', () => {
    expect(verifierRepartition(partiesParDefaut(JB, MY), 12000, 0)).toBeNull();
    expect(verifierRepartition(partiesParDefaut(JB, JB), 12000, 0)).toBeNull();
  });
  it('des pourcentages personnalisés (60/40) sont justes', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    expect(verifierRepartition([pct(e, 60), pct(s, 40)], 12000, 0)).toBeNull();
  });
  it('une somme ≠ 100 % est REFUSÉE, avec un message clair', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    const m = verifierRepartition([pct(e, 60), pct(s, 50)], 12000, 0);
    // LOT AM — le nombre et son « % » collés par une espace insécable visible (U+00A0, format unique de la tuile).
    expect(m).toMatch(/fait 110\u00a0%/);
    expect(m).toMatch(/exactement 100 %/);
    expect(m).toMatch(/Rien n’a été enregistré/);
    expect(verifierRepartition([pct(e, 49.9), pct(s, 50)], 12000, 0)).toMatch(/99,9\u00a0%/);
  });
  it('la saisie en € HT : juste au centime de la commission nette, sinon refusée', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    // 12 000 TTC → 10 000 HT de commission nette : 6 000 € + 40 %
    expect(verifierRepartition([{ ...e, pourcentage: null, montantHt: 6000 }, pct(s, 40)], 12000, 0)).toBeNull();
    expect(verifierRepartition([{ ...e, pourcentage: null, montantHt: 6000 }, { ...s, pourcentage: null, montantHt: 4000 }], 12000, 0)).toBeNull();
    expect(verifierRepartition([{ ...e, pourcentage: null, montantHt: 6000 }, { ...s, pourcentage: null, montantHt: 3999.99 }], 12000, 0)).toMatch(/99,9999\u00a0%/);
    expect(pourcentageDe(6000, 10000)).toBe(60);
  });
  it('une partie extérieure (40/40/20) est juste ; sans nom, refusée', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    expect(verifierRepartition([pct(e, 40), pct(s, 40), { ...partieExterieure(), nom: 'Agence du Parc', pourcentage: 20 }], 12000, 0)).toBeNull();
    expect(verifierRepartition([pct(e, 40), pct(s, 40), { ...partieExterieure(), pourcentage: 20 }], 12000, 0)).toMatch(/doit avoir un nom/);
  });
  it('un négociateur sans société est refusé (à renseigner dans Comptes)', () => {
    expect(verifierRepartition(partiesParDefaut({ ...JB, societe: null }, null), 12000, 0)).toMatch(/n’a pas de société/);
  });
  it('une rétrocession supérieure à la commission est refusée', () => {
    expect(verifierRepartition(partiesParDefaut(JB, MY), 12000, 12001)).toMatch(/dépasse la commission/);
  });
});

describe('le CA de chaque société', () => {
  it('l’apporteur est déduit AVANT la répartition', () => {
    // 12 000 TTC − 2 400 TTC de rétrocession = 9 600 TTC → 8 000 HT nets ; 50/50
    const r = partsParSociete(partiesParDefaut(JB, MY), 12000, 2400);
    expect(r.netHt).toBe(ht(9600));
    expect(r.societe).toEqual({ criterimmo: ht(9600) / 2, macj: ht(9600) / 2 });
  });
  it('🔴 LOT R — deux sociétés : la porteuse (entrée) a toute la commission, l’autre sa part ; le CA global la compte UNE fois', () => {
    const v = vente({ repartition: { parties: partiesParDefaut(JB, MY), retroApporteurTtc: 0 } });
    expect(caHt(v, 'criterimmo')).toBe(10000);
    expect(caHt(v, 'macj')).toBe(5000);
    const c = celluleGlobal({ ventes: [v], location: {}, gestion: [] }, 2026, 11);
    expect([c.venteCriterimmoHt, c.venteMacjHt, c.interCabinetHt, c.totalHt]).toEqual([10000, 5000, 5000, 10000]);
    expect(concerne(v, 'macj')).toBe(true);
  });
  it('même société des deux côtés : la somme va à cette société', () => {
    const v = vente({ repartition: { parties: partiesParDefaut(JB, AR), retroApporteurTtc: 0 } });
    expect([caHt(v, 'criterimmo'), caHt(v, 'macj')]).toEqual([10000, 0]);
    expect(concerne(v, 'macj')).toBe(false);
  });
  it('60/40 : 6 000 / 4 000', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    const v = vente({ repartition: { parties: [pct(e, 60), pct(s, 40)], retroApporteurTtc: 0 } });
    // 🔴 LOT R — CRITERIMMO porte : 10 000 ; MACJ reçoit 4 000 en inter-cabinet.
    expect([caHt(v, 'criterimmo'), caHt(v, 'macj')]).toEqual([10000, 4000]);
  });
  it('🔴 LOT R — 40/40/20 : la porteuse encaisse tout et reverse la part extérieure (inter-cabinet extérieur)', () => {
    const [e, s] = partiesParDefaut(JB, MY);
    const v = vente({ repartition: { parties: [pct(e, 40), pct(s, 40), { ...partieExterieure(), nom: 'Agence du Parc', pourcentage: 20 }], retroApporteurTtc: 0 } });
    expect([caHt(v, 'criterimmo'), caHt(v, 'macj'), caHt(v), exterieurHt(v)]).toEqual([10000, 4000, 10000, 2000]);
    const c = celluleGlobal({ ventes: [v], location: {}, gestion: [] }, 2026, null);
    expect([c.totalHt, c.interCabinetHt, c.exterieurHt]).toEqual([10000, 4000, 2000]);
    // Le reste de la porteuse : 10 000 − MACJ 4 000 − extérieur 2 000 = sa part, 4 000.
    expect(totaux([v], [], 'criterimmo').resteHt).toBe(4000);
  });
  it('les totaux d’une société : sa part, rétrocession déjà déduite', () => {
    const v = vente({ repartition: { parties: partiesParDefaut(JB, MY), retroApporteurTtc: 2400 } });
    const t = totaux([v], [], 'macj');
    expect(t.caHt).toBe(ht(9600) / 2);
    expect(t.resteHt).toBe(ht(9600) / 2);
  });
  it('l’HISTORIQUE est inchangé : sans répartition, toute la commission à sa société, aux mêmes nombres', () => {
    const v = vente({ honorairesTtc: 11025 });
    expect(caHt(v, 'criterimmo')).toBe(11025 / 1.2);
    expect(caHt(v, 'macj')).toBe(0);
    expect(totaux([v], [], 'criterimmo').resteHt).toBe(11025 / 1.2);
    expect(totaux([v], []).caHt).toBe(11025 / 1.2);
  });
});

describe('la société d’un collaborateur', () => {
  it('à une date : la période commencée ; un changement ne réécrit pas le passé', () => {
    const p = [{ societe: 'criterimmo' as const, depuis: '2000-01-01' }, { societe: 'macj' as const, depuis: '2026-11-01' }];
    expect(societeALaDate(p, '2026-10-31')).toBe('criterimmo');
    expect(societeALaDate(p, '2026-11-01')).toBe('macj');
    expect(societeALaDate([], '2026-11-01')).toBeNull();
  });
  it('déduite des fichiers : un onglet CRITERIMMO ⇒ CRITERIMMO ; présent dans les deux ⇒ à trancher', () => {
    const comptes = [{ id: 2, prenom: 'Arnaud', nom: 'Jorel' }, { id: 5, prenom: 'Jean-Baptiste', nom: 'PONS' }, { id: 9, prenom: 'Cédric', nom: 'X' }, { id: 4, prenom: 'Augustin', nom: 'Jorel' }];
    const onglets = [{ onglet: 'ARNAUD', societe: 'criterimmo' as const, lignes: 79 }, { onglet: 'Jean Baptiste', societe: 'criterimmo' as const, lignes: 1 },
      { onglet: 'CEDRIC', societe: 'criterimmo' as const, lignes: 91 }, { onglet: 'CEDRIC', societe: 'macj' as const, lignes: 111 }, { onglet: 'PIERRE', societe: 'macj' as const, lignes: 60 }];
    const r = deduireSocietes(comptes, onglets);
    expect(r.deductions.map((d) => [d.compte.id, d.sorte, d.sorte === 'deduite' ? d.societe : null]))
      .toEqual([[2, 'deduite', 'criterimmo'], [5, 'deduite', 'criterimmo'], [9, 'a_trancher', null], [4, 'aucune', null]]);
    expect(r.sansCompte.map((o) => o.onglet)).toEqual(['PIERRE']);
    expect(ongletsDesDeuxSocietes(onglets)).toEqual(['CEDRIC']);
  });
  it('un onglet qui désigne plusieurs comptes n’est rattaché à aucun', () => {
    expect(comptesDeLOnglet('JOREL', [{ id: 2, prenom: 'Arnaud', nom: 'Jorel' }])).toEqual([]);
    const r = deduireSocietes([{ id: 1, prenom: 'Julien', nom: 'A' }, { id: 2, prenom: 'Julien', nom: 'B' }], [{ onglet: 'JULIEN', societe: 'criterimmo', lignes: 5 }]);
    expect(r.ambigus).toHaveLength(1);
    expect(r.deductions.every((d) => d.sorte === 'aucune')).toBe(true);
  });
});

describe('les vendeurs et acquéreurs : jamais de doublon', () => {
  const connues = [{ id: 3, nom: 'Paul DUPONT', telephone: '06 12 34 56 78', email: 'p.dupont@exemple.fr', adresse: '1 rue A, Puteaux' }];
  it('même e-mail, même téléphone, ou même nom et même adresse ⇒ la fiche existante', () => {
    expect(personneExistante({ nom: 'P. Dupont', telephone: null, email: ' P.Dupont@Exemple.fr ', adresse: null }, connues)?.id).toBe(3);
    expect(personneExistante({ nom: 'Dupont', telephone: '+33 6 12 34 56 78', email: null, adresse: null }, connues)?.id).toBe(3);
    expect(personneExistante({ nom: 'paul dupont', telephone: null, email: null, adresse: '1, rue A Puteaux' }, connues)?.id).toBe(3);
    expect(personneExistante({ nom: 'Paul DUPONT', telephone: null, email: null, adresse: null }, connues)).toBeNull();
    expect(cleTelephone('0612')).toBe('');
    expect(memePersonne({ nom: 'A', telephone: null, email: null, adresse: null }, { nom: 'A', telephone: null, email: null, adresse: null })).toBe(false);
  });
  it('le libellé d’une vente : « vendeurs / acquéreurs », tirets entre les personnes d’un même côté (lot F)', () => {
    expect(libelleDesPersonnes([{ role: 'acquereur', nom: 'MARTIN' }, { role: 'vendeur', nom: 'DUPONT' }, { role: 'vendeur', nom: 'DURAND' }])).toBe('DUPONT-DURAND / MARTIN');
  });
});

describe('🔴 LOT N — pourcentagesParSociete : le % de chaque société et de la part extérieure (somme = 100 %)', () => {
  const p = (societe: 'criterimmo' | 'macj' | null, pourcentage: number | null, montantHt: number | null = null): Partie => ({ sorte: societe === null ? 'exterieure' : 'entree',
    compteId: societe === null ? null : 1, negociateur: societe === null ? null : 'X', societe, nom: societe === null ? 'Agence' : null, coordonnees: null, pourcentage, montantHt });
  it('100/0, 50/50, 60/40, 40/40/20 ; une part en € HT ramenée en % ; la somme fait 100', () => {
    expect(pourcentagesParSociete([p('criterimmo', 50), p('criterimmo', 50)], 10000)).toEqual({ societe: { criterimmo: 100, macj: 0 }, exterieur: 0 });
    expect(pourcentagesParSociete([p('criterimmo', 50), p('macj', 50)], 10000)).toEqual({ societe: { criterimmo: 50, macj: 50 }, exterieur: 0 });
    expect(pourcentagesParSociete([p('criterimmo', 60), p('macj', 40)], 10000)).toEqual({ societe: { criterimmo: 60, macj: 40 }, exterieur: 0 });
    const r = pourcentagesParSociete([p('criterimmo', 40), p('macj', 40), p(null, 20)], 8000);
    expect(r).toEqual({ societe: { criterimmo: 40, macj: 40 }, exterieur: 20 });
    expect(r.societe.criterimmo + r.societe.macj + r.exterieur).toBe(100);
    expect(pourcentagesParSociete([p('criterimmo', null, 2500), p('macj', null, 7500)], 10000)).toEqual({ societe: { criterimmo: 25, macj: 75 }, exterieur: 0 });
  });
});
