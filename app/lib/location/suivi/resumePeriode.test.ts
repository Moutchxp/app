import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireClasseur, type ClasseurLu } from './lectureExcel';
import { SANS_REGLE_ANNEXES } from './annexesGestion';
import { activitesDuMois, retrocessionDuMois } from './repriseExcel';
import { gestionDepuisLeDebut, moisDeLAnnee, resumeDeLAnnee, resumeDuMoisComplet, type ResumeCalcule } from './resumePeriode';
import { gestionDepuisJanvier, variablesDuNegociateur, type ActiviteLue, type ContexteCalcul, type DonneesTableau, type LigneGestion } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026) — LE « RÉSUMÉ DE L'ANNÉE » = LA SOMME DE SES MOIS, AU CENTIME, BLOC PAR BLOC (sur les copies anonymisées des suivis
 * 2025 et 2026) : Résultat, CA par statut, Honoraires avec / sans gestion, Portefeuille (sans effet boule de neige), Nouvelles GLI, Résultat
 * net, cascade de chaque négociateur ; « Depuis le début » ; le variable d'un négociateur non administrateur = la somme de SES mois.
 */
const lire = (annee: number): ActiviteLue[] => {
  const c = JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
  return lireClasseur(c, annee).flatMap((m) => activitesDuMois(m, { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux'], negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS' }))
    .map((a) => ({ ...a, lotId: null, bailId: null, source: 'import' } as ActiviteLue));
};
const retro = (annee: number) => {
  const c = JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
  return lireClasseur(c, annee).map((m) => retrocessionDuMois(m, { negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS' })).filter((r) => r !== null);
};
const activites = [...lire(2025), ...lire(2026)];
const regles = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const retrocessions = [...retro(2025), ...retro(2026)].map((r, i) => ({ ...r, id: i + 1 }));
const ctx: ContexteCalcul = { regles, apporteurs: [], retrocessions, aujourdhui: '2026-10-22' };
const gestionLignes: LigneGestion[] = [
  { lotId: 1, libelle: 'A', proprietaire: 'P', effetLe: '2025-02-03', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 0, base: 'hc', tauxHt: 7 },
  { lotId: 2, libelle: 'B', proprietaire: 'P', effetLe: '2025-11-20', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 50, base: 'cc', tauxHt: 6.5 },
  { lotId: 3, libelle: 'C', proprietaire: 'P', effetLe: '2026-03-14', avant: null, apres: 'en_gestion', loyerHc: 1234.56, provisions: 0, base: 'hc', tauxHt: 8 },
  { lotId: 4, libelle: 'D', proprietaire: 'P', effetLe: '2026-09-01', avant: null, apres: 'en_gestion', loyerHc: null, provisions: null, base: null, tauxHt: null },
];
const gli = [{ bailId: 1, activiteId: null, lotId: 1, bien: 'A', locataire: 'L', date: '2025-06-10', loyerHc: 900, provisions: 100 },
  { bailId: 2, activiteId: null, lotId: 2, bien: 'B', locataire: 'L', date: '2026-04-02', loyerHc: 1234.56, provisions: 85.44 }];
const donnees = (annee: number, voirCommissions: boolean, variablesPropres?: DonneesTableau['variablesPropres']): DonneesTableau => ({
  disponible: true, annee, annees: [2025, 2026], aujourdhui: '2026-10-22', activites, regles, apporteurs: [], retrocessions, negociateurs: [],
  gestion: { disponible: true, stock: 10, transitions: [] }, preavis: {}, voirCommissions, gestionLignes, gli, margesGli: [{ depuis: '2019-01-01', marge: 2.5 }],
  ...(variablesPropres === undefined ? {} : { variablesPropres }),
});
const c = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const somme = (ms: ResumeCalcule[], f: (m: ResumeCalcule) => number): number => ms.reduce((s, m) => s + c(f(m)), 0);

describe.each([[2025, 12], [2026, 10]])('🔴 %i (janv. → mois %i) : chaque montant annuel = la somme des montants mensuels, au centime', (annee, moisFin) => {
  const d = donnees(annee, true);
  const mois = moisDeLAnnee(annee, moisFin).map((m) => resumeDuMoisComplet(d, activites, ctx, m, null));
  const a = resumeDeLAnnee(d, activites, ctx, annee, moisFin, null);

  it('Résultat : CA HT global, commissions externes, internes, collègues, CA HT net', () => {
    expect(mois.reduce((s, m) => s + m.dossiers.length, 0)).toBeGreaterThan(50);
    expect(c(a.r.resultat.ca)).toBe(somme(mois, (m) => m.r.resultat.ca));
    expect(c(a.r.resultat.caNet)).toBe(somme(mois, (m) => m.r.resultat.caNet));
    for (const k of ['externes', 'internes', 'collegues'] as const) expect(a.ventilation[k].centimes).toBe(mois.reduce((s, m) => s + m.ventilation[k].centimes, 0));
    // La cascade se lit au centime : CA − externes − internes − collègues = CA net.
    expect(c(a.r.resultat.ca) - a.ventilation.externes.centimes - a.ventilation.internes.centimes - a.ventilation.collegues.centimes).toBe(c(a.r.resultat.caNet));
  });
  it('CA par statut : dossiers et CA HT de chaque statut ; Honoraires avec / sans gestion', () => {
    for (const x of a.r.parStatut) {
      expect(x.nb).toBe(mois.reduce((s, m) => s + m.r.parStatut.find((p) => p.nature === x.nature)!.nb, 0));
      expect(c(x.ca)).toBe(somme(mois, (m) => m.r.parStatut.find((p) => p.nature === x.nature)!.ca));
    }
    expect(c(a.r.gestion.avec.ca)).toBe(somme(mois, (m) => m.r.gestion.avec.ca));
    expect(c(a.r.gestion.sans.ca)).toBe(somme(mois, (m) => m.r.gestion.sans.ca));
    expect(c(a.r.gestion.aQualifier.ca)).toBe(somme(mois, (m) => m.r.gestion.aQualifier.ca));
    // 🔴 27/10/2026 — avec + sans + à qualifier : tous les dossiers, une fois (les statuts du bien regroupés).
    expect(a.r.gestion.avec.nb + a.r.gestion.sans.nb + a.r.gestion.aQualifier.nb).toBe(a.dossiers.length);
  });
  it('Portefeuille : gagnées, perdues, solde (gains mensuels additionnés une fois) ; / an = × 12 ; Nouvelles GLI', () => {
    expect(a.r.portefeuille.gagnes.mensuel).toBeCloseTo(mois.reduce((s, m) => s + m.r.portefeuille.gagnes.mensuel, 0), 9);
    expect(a.r.portefeuille.perdus.mensuel).toBeCloseTo(mois.reduce((s, m) => s + m.r.portefeuille.perdus.mensuel, 0), 9);
    expect(a.r.portefeuille.solde.annuel).toBeCloseTo(a.r.portefeuille.solde.mensuel * 12, 9);
    // Le même total que « Depuis le 1er janvier » du dernier mois (la ligne du Suivi du mois).
    const dj = gestionDepuisJanvier(gestionLignes, `${annee}-${String(moisFin).padStart(2, '0')}`);
    expect([a.r.portefeuille.gagnes.nb, c(a.r.portefeuille.gagnes.mensuel), a.r.portefeuille.sansLoyer]).toEqual([dj.entrees.nb, c(dj.entrees.mensuel), dj.sansLoyer]);
    expect([a.gli.nb, c(a.gli.mensuel)]).toEqual([mois.reduce((s, m) => s + m.gli.nb, 0), somme(mois, (m) => m.gli.mensuel)]);
  });
  it('Résultat net de l’agence et cascade de chaque négociateur (administrateur) : la somme de leurs mois', () => {
    expect(a.net.ca).toBe(mois.reduce((s, m) => s + m.net.ca, 0));
    expect(a.net.net).toBe(mois.reduce((s, m) => s + (m.net.net ?? 0), 0));
    expect(a.negociateurs.length).toBeGreaterThan(0);
    for (const x of a.negociateurs) {
      const siens = mois.flatMap((m) => m.negociateurs.filter((y) => y.cle === x.cle));
      for (const k of ['ca', 'deductions', 'net', 'resultat', 'primes', 'retrocessions', 'variable'] as const) expect(c(x[k])).toBe(siens.reduce((s, y) => s + c(y[k]), 0));
      // La cascade annuelle se tient au centime, comme celle du mois.
      expect(c(x.resultat) + c(x.primes) - c(x.retrocessions)).toBe(c(x.variable));
      expect(a.net.variables.find((v) => v.cle === x.cle)?.variable).toBe(c(x.variable));
    }
    expect(c(a.r.primes)).toBe(somme(mois, (m) => m.r.primes));
    expect(c(a.r.retrocessions)).toBe(somme(mois, (m) => m.r.retrocessions));
  });
});

describe('🔴 confidentialité : un compte non administrateur', () => {
  it('négociateur : SA cascade annuelle = la somme de ses variables mensuels reçus du serveur ; ni variable des autres, ni net', () => {
    const propres = variablesDuNegociateur(activites, ctx, 2026, 5);
    const d = donnees(2026, false, propres);
    const a = resumeDeLAnnee(d, activites, ctx, 2026, 10, null);
    expect(a.negociateurs.map((x) => x.cle)).toEqual(['id:5']);
    const attendu = Object.entries(propres).filter(([m]) => m <= '2026-10').reduce((s, [, x]) => s + c(x.variable), 0);
    expect(c(a.negociateurs[0].variable)).toBe(attendu);
    expect([a.net.net, a.net.variables]).toEqual([null, []]);
  });
  it('collaborateur non négociateur : aucune cascade', () => {
    const a = resumeDeLAnnee(donnees(2026, false), activites, ctx, 2026, 10, null);
    expect(a.negociateurs).toEqual([]);
    expect(a.net.net).toBeNull();
  });
});

describe('🔴 « Depuis le début (<première année>) »', () => {
  it('de janvier de la première année à la fin de la période : la même grille, les gains additionnés une fois', () => {
    const x = gestionDepuisLeDebut(gestionLignes, 2025, 2026, 10, SANS_REGLE_ANNEXES);
    expect([x.entrees.nb, x.sorties.nb, x.sansLoyer]).toEqual([3, 1, 1]);
    // 1000 × 7 % + 1 234,56 × 8 % = 70 + 98,7648 ; sortie : (800 + 50) × 6,5 % = 55,25.
    expect(c(x.entrees.mensuel)).toBe(c(70 + 98.7648));
    expect(c(x.sorties.mensuel)).toBe(c(55.25));
    expect(x.solde.annuel).toBeCloseTo((x.entrees.mensuel - x.sorties.mensuel) * 12, 9);
    // Une période plus courte (jusqu'à février 2026) n'a ni l'entrée de mars ni celle de septembre.
    expect(gestionDepuisLeDebut(gestionLignes, 2025, 2026, 2, SANS_REGLE_ANNEXES).entrees.nb).toBe(1);
  });
});
