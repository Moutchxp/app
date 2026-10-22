import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireClasseur, type ClasseurLu } from './lectureExcel';
import { activitesDuMois, apporteurDeTexte, retrocessionDuMois } from './repriseExcel';
import {
  type ActiviteCalcul, commissionApporteurDe, type ContexteCalcul, filtrer, primeDe, sectionApporteurs, sectionCumul, sectionGestion,
  sectionIndicateurs, sectionMois, sectionNegociateurs, totauxPeriode,
} from './tableauBord';

/**
 * 🔴 Arno (22/10/2026) — « Outils de suivi » reproduit EXACTEMENT son suivi mensuel (CA_JBP_2026.xlsx). La preuve : la copie
 * anonymisée du fichier (montants, formules et structure intacts ; noms remplacés) relue, convertie en lignes d'activité, et
 * recalculée par le tableau de bord — chaque total du mois retombe AU CENTIME sur celui du fichier.
 */
const classeur = JSON.parse(readFileSync(new URL('./__fixtures__/suiviMensuel2026.anonyme.json', import.meta.url), 'utf8')) as ClasseurLu;
const mois = lireClasseur(classeur, 2026);
const REGLE_2026 = { depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 };
const activites = mois.flatMap((m) => activitesDuMois(m, { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux'] }));
const ctx: ContexteCalcul = { regles: [REGLE_2026], apporteurs: [], retrocessions: mois.map((m) => retrocessionDuMois(m, {})).filter((r) => r !== null) };
const auCentime = (x: number): number => Math.round(x * 100) / 100;

/** Les totaux lus dans le fichier, recopiés à la main depuis l'original (et non depuis la lecture) : la lecture est éprouvée aussi. */
const FICHIER: [string, number, number, number, number, number, number][] = [
  // mois, lignes, CA HT, primes, apporteurs, CA − apporteurs, COMS brut
  ['2026-01', 14, 9865.07, 900, 193.111, 9671.959, 2350.79385],
  ['2026-02', 13, 9083.94, 645, 649.087, 8434.853, 1910.22795],
  ['2026-03', 6, 6356.32, 465, 163.58, 6192.74, 1393.911],
  ['2026-04', 13, 9703.09, 600, 317.864, 9385.226, 2007.7839],
  ['2026-05', 9, 10459.26, 150, 131.486, 10327.774, 1699.1661],
  ['2026-06', 14, 10103.49, 465, 357.449, 9746.041, 1926.90615],
  ['2026-07', 12, 10098.64, 150, 128.056, 9970.584, 1645.5876],
  ['2026-08', 14, 13471.1, 165, 131.561, 13339.539, 1965.93085],
  ['2026-09', 17, 15471.7, 650, 2002.255, 13469.445, 2670.41675],
];

describe('🔴 le tableau de bord = le suivi mensuel d’Arno, au centime, mois par mois', () => {
  it('neuf onglets, 112 lignes, 94 612,61 € de CA HT', () => {
    expect(mois.map((m) => m.mois)).toEqual(FICHIER.map((f) => f[0]));
    expect(activites).toHaveLength(112);
    expect(auCentime(activites.reduce((s, a) => s + a.honoProprietaireHt + a.honoLocataireHt, 0))).toBe(94612.61);
  });

  for (const [m, n, ca, primes, app, net, coms] of FICHIER) {
    it(`${m} : ${n} lignes — CA, primes, apporteurs, CA net, commission du négociateur`, () => {
      const t = totauxPeriode(activites, ctx, { annee: 2026, mois: Number(m.slice(5)) });
      expect(t.nb).toBe(n);
      expect(auCentime(t.ca)).toBe(auCentime(ca));
      expect(auCentime(t.primes)).toBe(auCentime(primes));
      expect(auCentime(t.apporteurs)).toBe(auCentime(app));
      expect(auCentime(t.caNet)).toBe(auCentime(net));
      expect(auCentime(t.commission)).toBe(auCentime(coms));
      // Et la lecture du fichier lui-même dit la même chose.
      const lu = mois.find((x) => x.mois === m)!.totaux;
      expect([lu.caHt, lu.primes, lu.apporteurs, lu.caNet, lu.commissionBrute].map(auCentime)).toEqual([ca, primes, app, net, coms].map(auCentime));
    });
  }

  it('août : la rétrocession « F24 » (200 €) est retranchée — et seulement en août', () => {
    expect(ctx.retrocessions).toEqual([{ negociateurId: null, negociateurLibelle: 'Négociateur', mois: '2026-08-01', montant: 200, libelle: 'Rétrocession' }]);
    const aout = totauxPeriode(activites, ctx, { annee: 2026, mois: 8 });
    expect(auCentime(aout.commissionAvantRetro)).toBe(2165.93);
    expect(aout.retrocessions).toBe(200);
  });

  it('la ventilation avec / sans gestion = celle du fichier, là où le fichier classe toutes ses lignes', () => {
    for (const m of mois) {
      const t = totauxPeriode(activites, ctx, { annee: 2026, mois: Number(m.mois.slice(5)) });
      if (m.lignes.some((l) => l.avecGestion === null && l.caFichier !== 0)) continue;
      expect([auCentime(t.avecGestion), auCentime(t.sansGestion)]).toEqual([auCentime(m.totaux.ventilationAvec ?? 0), auCentime(m.totaux.ventilationSans ?? 0)]);
    }
  });

  it('ce que le fichier a d’étrange est DIT : avril (ventilation incomplète), septembre (formule croisée, commission saisie, prime de 50 €)', () => {
    const avril = mois.find((m) => m.mois === '2026-04')!.anomalies.join('\n');
    expect(avril).toMatch(/Ventilation incomplète : 7 ligne\(s\)/);
    expect(avril).toMatch(/avec 2886,24 € \+ sans 1584,34 € = 4470,58 €, pour un CA de 9703,09 €/);
    const sept = mois.find((m) => m.mois === '2026-09')!.anomalies.join('\n');
    expect(sept).toMatch(/Ligne 9 .*=D9\+B10.* même montant, sans effet/);
    expect(sept).toMatch(/Ligne 4 .*commission d’apporteur saisie à la main \(933,00 €/);
    expect(sept).toMatch(/Ligne 4 .*prime de nouvelle gestion de 50,00 €/);
    expect(mois.find((m) => m.mois === '2026-02')!.anomalies).toEqual([]);
  });

  it('avenants, gestion seule, parkings : reconnus', () => {
    expect(activites.filter((a) => a.type === 'avenant')).toHaveLength(3);
    expect(activites.filter((a) => a.type === 'gestion_seule').map((a) => a.id)).toEqual(['2026-01#3', '2026-01#4', '2026-01#5', '2026-01#6']);
    expect(activites.filter((a) => a.parking).length).toBeGreaterThanOrEqual(7);
  });
});

describe('les apporteurs du fichier', () => {
  it('Internet, agence, collaborateur, l’apporteur entre parenthèses, partenaire', () => {
    const c = ['Jean-Baptiste Pons', 'Arnaud Jorel'];
    expect(apporteurDeTexte('Internet ', c)).toEqual({ nom: 'Internet', type: 'internet' });
    expect(apporteurDeTexte('Agence Puteaux ', c)).toEqual({ nom: 'Agence Puteaux', type: 'agence' });
    expect(apporteurDeTexte('Arnaud Jorel', c)).toEqual({ nom: 'Arnaud Jorel', type: 'collaborateur' });
    expect(apporteurDeTexte('Jean-Baptiste ( Julien Deblois)', c)).toEqual({ nom: 'Julien Deblois', type: 'partenaire' });
    expect(apporteurDeTexte('Pierre Thevenin ', c)).toEqual({ nom: 'Pierre Thevenin', type: 'partenaire' });
    expect(apporteurDeTexte(null, c)).toBeNull();
  });
});

// ── Les règles, sur des lignes fabriquées ─────────────────────────────────────────────────────────────────────────

const L = (o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id: o.id ?? 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 400, honoLocataireHt: 200,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null,
  negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: true, origineProprietaire: 'nouveau', origineLocataire: 'nouveau',
  loyerHc: 1000, charges: 100, assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', ...o,
});
const APP = { id: 3, nom: 'Kin Immo', type: 'agence' as const, archive: false,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }, { depuis: '2026-06-01', taux: 0.2, coutFixeMensuel: 100 }] };
const CTX: ContexteCalcul = { regles: [REGLE_2026, { depuis: '2026-07-01', tauxNegociateur: 0.2, primeLogement: 200, primeParking: 20 }], apporteurs: [APP], retrocessions: [] };

describe('🔴 barèmes datés : jamais rétroactifs', () => {
  it('le taux de l’apporteur à la date de signature ; un taux propre au bail l’emporte ; la commission saisie aussi', () => {
    expect(commissionApporteurDe(L({ apporteurId: 3, dateSignature: '2026-05-31' }), [APP])).toBe(60);
    expect(commissionApporteurDe(L({ apporteurId: 3, dateSignature: '2026-06-01' }), [APP])).toBe(120);
    expect(commissionApporteurDe(L({ apporteurId: 3, apporteurTaux: 0.05 }), [APP])).toBe(30);
    expect(commissionApporteurDe(L({ apporteurId: 3, commissionSaisie: 64.387 }), [APP])).toBe(64.387);
  });
  it('la prime : saisie, sinon (mandat signé) celle de la règle à la date — logement ou parking', () => {
    expect(primeDe(L({}), CTX.regles)).toBe(0);
    expect(primeDe(L({ mandatGestion: true }), CTX.regles)).toBe(150);
    expect(primeDe(L({ mandatGestion: true, parking: true }), CTX.regles)).toBe(15);
    expect(primeDe(L({ mandatGestion: true, dateSignature: '2026-07-01' }), CTX.regles)).toBe(200);
    expect(primeDe(L({ mandatGestion: true, primeSaisie: 50 }), CTX.regles)).toBe(50);
  });
  it('la commission du négociateur suit la règle de CHAQUE ligne', () => {
    const t = totauxPeriode([L({ id: 1, dateSignature: '2026-06-30' }), L({ id: 2, dateSignature: '2026-07-01' })], CTX, { annee: 2026, mois: null });
    expect(t.commission).toBeCloseTo(600 * 0.15 + 600 * 0.2, 10);
  });
});

describe('les sections', () => {
  const lignes = [
    L({ id: 1, dateSignature: '2026-03-02', apporteurId: 3, apporteurNom: 'Kin Immo', assurance: 'visale', vacanceJours: 10 }),
    L({ id: 2, dateSignature: '2026-03-20', avecGestion: false, origineProprietaire: 'deja', assurance: 'aucune', parking: true, honoProprietaireHt: 50, honoLocataireHt: 50 }),
    L({ id: 3, dateSignature: '2025-03-15', negociateurId: 2, negociateurLibelle: 'Arnaud Jorel', assurance: 'gli', vacanceJours: 30 }),
    L({ id: 4, dateSignature: '2026-01-05', type: 'avenant', honoProprietaireHt: 0, honoLocataireHt: 125 }),
  ];
  it('filtres : négociateur, apporteur, avec / sans gestion, nouveau / déjà client', () => {
    expect(filtrer(lignes, { negociateur: 'id:2' }).map((a) => a.id)).toEqual([3]);
    expect(filtrer(lignes, { apporteur: 3 }).map((a) => a.id)).toEqual([1]);
    expect(filtrer(lignes, { apporteur: 'aucun' }).map((a) => a.id)).toEqual([2, 3, 4]);
    expect(filtrer(lignes, { gestion: 'sans' }).map((a) => a.id)).toEqual([2]);
    expect(filtrer(lignes, { origine: 'deja' }).map((a) => a.id)).toEqual([2]);
  });
  it('A : le mois et le même mois de l’année précédente', () => {
    const a = sectionMois(lignes, CTX, { annee: 2026, mois: 3 });
    expect(a.courant.nb).toBe(2);
    expect(a.courant.ca).toBe(700);
    expect(a.courant.ids).toEqual([1, 2]);
    expect(a.precedent.ca).toBe(600);
    expect(a.variationCa).toBeCloseTo(1 / 6, 10);
  });
  it('B : le cumul de l’année et celui de N−1', () => {
    const b = sectionCumul(lignes, CTX, 2026);
    expect(b).toHaveLength(12);
    expect(b[0]).toMatchObject({ mois: '2026-01', ca: 125, caCumule: 125, caN1: 0 });
    expect(b[2]).toMatchObject({ mois: '2026-03', ca: 700, caCumule: 825, caCumuleN1: 600 });
    expect(b[11].caCumule).toBe(825);
  });
  it('C : par apporteur — CA apporté, commissions, coûts fixes des mois écoulés, net', () => {
    const c = sectionApporteurs(lignes, CTX, { annee: 2026, mois: null }, ['2026-05', '2026-06', '2026-07']);
    expect(c).toEqual([expect.objectContaining({ apporteurId: 3, nb: 1, ca: 600, commissions: 60, coutsFixes: 200, net: 340, ids: [1] })]);
  });
  it('D : entrées, sorties, solde, et le portefeuille remonté depuis aujourd’hui', () => {
    const d = sectionGestion([
      { lotId: 1, avant: null, apres: 'en_gestion', effetLe: '2026-02-10' },
      { lotId: 2, avant: 'en_gestion', apres: 'ancienne_gestion', effetLe: '2026-03-01' },
      { lotId: 3, avant: 'location_seule', apres: 'en_gestion', effetLe: '2026-03-15' },
      { lotId: 4, avant: 'location_seule', apres: 'ancienne_gestion', effetLe: '2026-03-15' },
    ], 40, '2026-03');
    expect(d).toHaveLength(12);
    expect(d[0].mois).toBe('2025-04');
    expect(d.at(-1)).toMatchObject({ mois: '2026-03', entrees: 1, sorties: 1, solde: 0, stock: 40, lotsEntres: [3], lotsSortis: [2] });
    expect(d.at(-2)).toMatchObject({ mois: '2026-02', entrees: 1, stock: 40 });
    expect(d.at(-3)).toMatchObject({ mois: '2026-01', stock: 39 });
  });
  it('E : vacance moyenne, préavis, part GLI / Visale (parmi les baux renseignés), part des parkings', () => {
    const e = sectionIndicateurs(lignes, 3);
    expect(e.vacanceMoyenneJours).toBe(20);
    expect(e.preavis).toBe(3);
    expect(e.partGaranties).toBeCloseTo(2 / 3, 10);
    expect(e.partParkingNb).toBe(0.25);
    expect(e.partParkingCa).toBeCloseTo(100 / 1425, 10);
  });
  it('F : par négociateur et par mois, rétrocessions comprises', () => {
    const f = sectionNegociateurs(lignes, { ...CTX, retrocessions: [{ negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-03-01', montant: 20, libelle: 'x' }] }, { annee: 2026, mois: null });
    expect(f.map((x) => [x.libelle, x.mois, x.totaux.nb])).toEqual([['Jean-Baptiste PONS', '2026-01', 1], ['Jean-Baptiste PONS', '2026-03', 2]]);
    expect(f[1].totaux.commission).toBeCloseTo((600 - 60) * 0.15 + 100 * 0.15 - 20, 10);
  });
});
