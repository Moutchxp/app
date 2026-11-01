import { describe, expect, it } from 'vitest';
import type { ActiviteLue } from '../location/suivi/tableauBord';
import { caLigne, totaux } from '../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../location/suivi/suivi';
import {
  anneesLocation, apporteursLocation, categorieDe, coutsLocation, depuisHt, detailCoutsLocation, titreBail, espaceLocation, espaceLocationRegle, ficheRechercheLocation, filtrerLocation, historiqueLocation, ligneLocationCa, lignesDesAnnees,
  lignesDesMois, negociateursLocation, SANS_APPORTEUR, totauxLocation, trierLocation,
} from './locationCa';
import { correspond } from './listeCartes';

/**
 * 🔴 LOT LO1 — « Suivi Chiffre d'affaires › Location » : les lignes du Suivi, leurs montants au centime par les fonctions de la Location (sans
 * copie), la partition « Compter », les sommes (tuile 4 = tuile 1 − tuile 3 ; Espace = Résultat), la recherche et le tri des cartes.
 */
const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [{ id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
let n = 0;
const ligne = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [{ id: 3, libelle: 'Appartement — 12 rue des Lilas Puteaux' }],
  locataires: [{ id: 1, libelle: 'Léa MARTIN' }], ...o,
});
const ctx = { regles, apporteurs };

describe('🔴 LOT LO1 — une ligne du Suivi (les fonctions de la Location)', () => {
  it('le CA, la prime de nouvelle gestion (règle à la date), la commission d’apporteur, le reste ; HT au centime ; CA TTC = HT × 1,20, prime et apporteur SANS TVA (🔴 LOT LO14 : TTC = HT) ; propriétaire + locataire = CA', () => {
    const a = ligne({ mandatGestion: true, avecGestion: true, apporteurId: 7, apporteurNom: 'Agence Martin', honoProprietaireHt: 333.33, honoLocataireHt: 333.34 });
    const l = ligneLocationCa(a, ctx);
    expect([l.caC, l.primeC, l.apporteurC]).toEqual([{ htC: 66667, ttcC: 80000 }, { htC: 15000, ttcC: 15000 }, { htC: 6667, ttcC: 6667 }]);
    expect(l.caC).toEqual(depuisHt(caLigne(a)));
    expect([l.proprietaireC.htC + l.locataireC.htC, l.proprietaireC.ttcC + l.locataireC.ttcC]).toEqual([l.caC.htC, l.caC.ttcC]);
    expect(l.netC).toEqual({ htC: 66667 - 15000 - 6667, ttcC: 80000 - 15000 - 6667 });
    expect([l.apporteur, l.bien, l.locataire, l.categorie, l.negociateur]).toEqual(['Agence Martin', 'Appartement — 12 rue des Lilas Puteaux', 'Léa MARTIN', 'avec', { cle: 'id:5', nom: 'Jean-Baptiste PONS' }]);
  });
  it('« Compter » : mandat de gestion seul d’abord (son type), puis la case « avec gestion » — chaque ligne dans une seule catégorie', () => {
    expect([categorieDe({ type: 'gestion_seule', avecGestion: true }), categorieDe({ type: 'bail', avecGestion: true }), categorieDe({ type: 'avenant', avecGestion: false })])
      .toEqual(['gestion_seule', 'avec', 'sans']);
  });
  it('les mêmes sommes que le Suivi du mois (`totaux` de la Location) : CA, primes, apporteurs', () => {
    const as = [ligne({ mandatGestion: true }), ligne({ apporteurId: 7 }), ligne({ type: 'gestion_seule', honoProprietaireHt: 0, honoLocataireHt: 0, mandatGestion: true }), ligne({ primeSaisie: 64.387 })];
    const t = totauxLocation(as.map((a) => ligneLocationCa(a, ctx)));
    const s = totaux(as, { regles, apporteurs, retrocessions: [] });
    expect([t.ca.htC, t.primes.htC, t.apporteurs.htC, t.nb, t.nbBaux, t.nbGestionSeule]).toEqual([Math.round(s.ca * 100), Math.round(s.primes * 100), Math.round(s.apporteurs * 100), s.nb, s.nbBaux, s.nbGestionSeule]);
  });
});

describe('🔴 LOT LO1 — les sommes, la partition, l’espace, les apporteurs, l’histoire', () => {
  const as = [
    ligne({ dateSignature: '2025-09-03', honoProprietaireHt: 300, honoLocataireHt: 200 }),
    ligne({ dateSignature: '2026-09-02', mandatGestion: true, avecGestion: true, apporteurId: 7 }),
    ligne({ dateSignature: '2026-09-20', type: 'gestion_seule', honoProprietaireHt: 0, honoLocataireHt: 0, mandatGestion: true, negociateurId: 8, negociateurLibelle: 'Mélanie' }),
    ligne({ dateSignature: '2026-10-01', type: 'avenant', honoProprietaireHt: 0, honoLocataireHt: 120 }),
  ];
  const ls = as.map((a) => ligneLocationCa(a, ctx));
  it('tuile 4 = tuile 1 − tuile 3, au centime, HT et TTC ; l’année = la somme de ses 12 mois ; Période / Tout = sommes', () => {
    const t = totauxLocation(lignesDesAnnees(ls, [2026]));
    expect([t.net.htC, t.net.ttcC]).toEqual([t.ca.htC - t.couts.htC, t.ca.ttcC - t.couts.ttcC]);
    const mois = Array.from({ length: 12 }, (_, i) => totauxLocation(lignesDesMois(ls, [{ annee: 2026, mois: i + 1 }])));
    expect([mois.reduce((x, m) => x + m.ca.htC, 0), mois.reduce((x, m) => x + m.ca.ttcC, 0), mois.reduce((x, m) => x + m.nb, 0)]).toEqual([t.ca.htC, t.ca.ttcC, t.nb]);
    const tout = totauxLocation(lignesDesAnnees(ls, [2025, 2026]));
    expect(tout.ca.htC).toBe(totauxLocation(lignesDesAnnees(ls, [2025])).ca.htC + t.ca.htC);
  });
  it('« Compter » : Avec + Sans + Mandat seul = Tous, exactement (nombre et montants)', () => {
    const tous = totauxLocation(filtrerLocation(ls, 'tous', null));
    const parts = (['avec', 'sans', 'gestion_seule'] as const).map((c) => totauxLocation(filtrerLocation(ls, c, null)));
    expect([parts.reduce((x, p) => x + p.nb, 0), parts.reduce((x, p) => x + p.ca.htC, 0), parts.reduce((x, p) => x + p.net.ttcC, 0)]).toEqual([tous.nb, tous.ca.htC, tous.net.ttcC]);
    expect(parts.map((p) => p.nb)).toEqual([1, 2, 1]);
  });
  it('le filtre Négociateur (des clés) ; l’Espace par négociateur : sa somme = le Résultat', () => {
    expect(negociateursLocation(ls)).toEqual([{ cle: 'id:5', nom: 'Jean-Baptiste PONS' }, { cle: 'id:8', nom: 'Mélanie' }]);
    expect(filtrerLocation(ls, 'tous', ['id:8']).map((l) => l.negociateur.nom)).toEqual(['Mélanie']);
    const e = espaceLocation(ls); const t = totauxLocation(ls);
    expect([e.reduce((x, g) => x + g.net.htC, 0), e.reduce((x, g) => x + g.ca.ttcC, 0), e.reduce((x, g) => x + g.nb, 0)]).toEqual([t.net.htC, t.ca.ttcC, t.nb]);
  });
  it('les apporteurs : l’apporteur en premier, « Sans apporteur » à la fin ; Toute l’histoire : une ligne par année', () => {
    expect(apporteursLocation(ls).map((a) => [a.nom, a.nb])).toEqual([['Agence Martin', 1], [SANS_APPORTEUR, 3]]);
    expect(historiqueLocation(ls, anneesLocation(ls, '2026-11-01')).map((h) => [h.annee, h.t.nb, h.t.ca.htC])).toEqual([[2025, 1, 50000], [2026, 3, 102000]]);
  });
  it('la recherche (bien, personnes, négociateur, apporteur, montant HT ou TTC) et le tri (CA, date)', () => {
    const l = ls[1];
    expect(['lilas', 'léa', 'agence martin', '900', '1 080', 'pons'].map((q) => correspond(ficheRechercheLocation(l), q))).toEqual([true, true, true, true, true, true]);
    expect(correspond(ficheRechercheLocation(l), 'introuvable')).toBe(false);
    expect(trierLocation(ls, 'ca-desc', 'ht').map((x) => x.caC.htC)).toEqual([90000, 50000, 12000, 0]);
    expect(trierLocation(ls, 'date-recent', 'ht').map((x) => x.date)).toEqual(['2026-10-01', '2026-09-20', '2026-09-02', '2025-09-03']);
  });
});

describe('🔴 LOT LO6 — le détail des fenêtres (aucun calcul nouveau : les montants des lignes, les totaux des tuiles)', () => {
  const as = [
    ligne({ dateSignature: '2026-03-02', mandatGestion: true, avecGestion: true, apporteurId: 7, apporteurNom: 'Agence Martin', honoProprietaireHt: 333.33, honoLocataireHt: 333.34 }),
    ligne({ dateSignature: '2026-05-10', apporteurId: 7, apporteurNom: 'Agence Martin' }),
    ligne({ dateSignature: '2026-05-10', type: 'gestion_seule', honoProprietaireHt: 0, honoLocataireHt: 0, mandatGestion: true, lots: [] }),
    ligne({ dateSignature: '2026-06-01' }),
  ];
  const ls = as.map((a) => ligneLocationCa(a, ctx));
  it('total = tuile 3 (primes + apporteurs) au centime HT et TTC ; sous-totaux = sommes des lignes ; baux concernés du plus récent au plus ancien', () => {
    const d = detailCoutsLocation(ls); const t = totauxLocation(ls);
    expect([d.total, d.primes, d.apporteurs]).toEqual([t.couts, t.primes, t.apporteurs]);
    expect(d.lignesPrimes.reduce((x, l) => x + l.primeC.ttcC, 0)).toBe(d.primes.ttcC);
    expect(d.groupesApporteurs.map((g) => [g.nom, g.lignes.length, g.total.htC])).toEqual([['Agence Martin', 2, 6667 + 9000]]);
    expect(d.groupesApporteurs.reduce((x, g) => x + g.total.ttcC, 0)).toBe(d.apporteurs.ttcC);
    expect(d.baux.map((l) => l.id)).toEqual([ls[2].id, ls[1].id, ls[0].id]); // même date : le plus grand numéro d'abord ; la ligne sans coût absente
    expect(titreBail(ls[2])).toBe('DUPONT / Léa MARTIN');
    expect(titreBail(ls[0])).toBe('Appartement — 12 rue des Lilas Puteaux');
  });
  it('par bail : CA brut − apporteur − prime = CA net du bail ; la somme = la tuile 4 ; rien de coûteux → listes vides', () => {
    for (const l of ls) expect(l.netC).toEqual({ htC: l.caC.htC - l.apporteurC.htC - l.primeC.htC, ttcC: l.caC.ttcC - l.apporteurC.ttcC - l.primeC.ttcC });
    const t = totauxLocation(ls);
    expect([ls.reduce((x, l) => x + l.netC.htC, 0), ls.reduce((x, l) => x + l.netC.ttcC, 0)]).toEqual([t.net.htC, t.net.ttcC]);
    const vide = detailCoutsLocation([ls[3]]);
    expect([vide.baux.length, vide.lignesPrimes.length, vide.groupesApporteurs.length, vide.total]).toEqual([0, 0, 0, { htC: 0, ttcC: 0 }]);
  });
});

/** 🔴 LOT LO12 — l'Espace par négociateur à la règle des mois : la somme des lignes = le CA net de la page + les salaires comptés. */
describe('🔴 LOT LO12 — espaceLocationRegle', () => {
  const ls = [
    ligne({ dateSignature: '2025-09-02', mandatGestion: true, avecGestion: true, apporteurId: 7, apporteurNom: 'Agence Martin' }),
    ligne({ dateSignature: '2025-09-20', negociateurId: 8, negociateurLibelle: 'Mélanie' }),
    ligne({ dateSignature: '2025-08-05', honoProprietaireHt: 200, honoLocataireHt: 100 }),
  ].map((a) => ligneLocationCa(a, ctx));
  const ms = [{ annee: 2025, mois: 8 }, { annee: 2025, mois: 9 }];
  const sal = [{ annee: 2025, mois: 9, salairesHt: 400, note: null }];
  const retros = [{ annee: 2025, mois: 8, negociateurCle: 'id:99', montantC: { htC: 500, ttcC: 500 } }];
  for (const avec of [true, false]) {
    it(`${avec ? 'Avec' : 'Sans'} salaires : Σ net = CA net + salaires comptés ; Σ variable déduit = celui de la page ; un négociateur à rétrocession seule apparaît`, () => {
      const e = espaceLocationRegle(ls, ms, retros, sal, avec);
      const c = coutsLocation(ls, ms, retros, sal, avec);
      const s = (f: (x: (typeof e)[number]) => { htC: number; ttcC: number }) => e.reduce((t, x) => ({ htC: t.htC + f(x).htC, ttcC: t.ttcC + f(x).ttcC }), { htC: 0, ttcC: 0 });
      expect(s((x) => x.net)).toEqual({ htC: c.net.htC + c.salaires.htC, ttcC: c.net.ttcC + c.salaires.ttcC });
      expect([s((x) => x.variableDeduit), s((x) => x.primesDeduites), s((x) => x.variable)]).toEqual([c.variableDeduit, c.primesDeduites, c.variable]);
      expect(e.find((x) => x.cle === 'id:99')?.nb).toBe(0);
    });
  }
});
