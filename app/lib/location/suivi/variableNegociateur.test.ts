import { describe, expect, it } from 'vitest';
import type { Apporteur } from './suivi';
import { cascadeNegociateur, sectionNegociateurs, totauxPeriode, variablesDuNegociateur, type ActiviteCalcul, type ContexteCalcul } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026, accord écrit) — LE VARIABLE DU NÉGOCIATEUR : avant le taux, on retire du CA HT toutes les commissions versées SAUF
 * les récurrentes de gestion (part location et gestion « One shot » de l'apporteur ; ce qui est dû au collègue à la signature). Le
 * reste inchangé : dossier par dossier, taux à la date de signature, + prime, − rétrocessions. Données fictives.
 */
const ligne = (o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400, primeSaisie: null,
  mandatGestion: true, categoriePrime: 'logement', apporteurId: 7, apporteurNom: 'Léa Dupont', apporteurTaux: null, commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB',
  avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100, assurance: null, parking: false, vacanceJours: null,
  rattachement: 'rattache', origineContact: 'apporteur', tauxGestionBien: 5, finGestion: null, ...o,
});
// Honoraires de gestion mensuels : (900 + 100) × 5 % = 50 € ; CA HT = 1 000 €.
const apporteur = (id: number, mode: 'one_shot' | 'recurrent'): Apporteur => ({
  id, nom: `Apporteur ${id}`, type: 'partenaire', archive: false, compteId: null,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode, tauxGestion: 0.2 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }],
  remunerations: [{ depuis: '2026-01-01', remunere: true, mode, taux: 0.05, tauxGestion: 0.1, dureeAnnees: null }],
} as Apporteur);
const ctx: ContexteCalcul = { regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [apporteur(7, 'one_shot'), apporteur(8, 'recurrent')],
  retrocessions: [], aujourdhui: '2026-03-31' };

describe('🔴 la nouvelle règle, sur un dossier fictif', () => {
  it('ONE SHOT : part location (100) + gestion one shot (0,2 × 50 × 12 = 120) + collègue à la signature (50 + 0,1 × 50 × 12 = 110) sont retirées', () => {
    const t = totauxPeriode([ligne()], ctx, { annee: 2026, mois: 3 });
    expect(t.deductions).toBeCloseTo(330, 10);
    expect(t.baseNegociateur).toBeCloseTo(670, 10);
    expect(t.commission).toBeCloseTo(670 * 0.15 + 150, 10);
    // Le reste ne change pas : le CA net d'apporteurs (part location seule) des autres écrans.
    expect(t.caNet).toBeCloseTo(900, 10);
  });

  it('RÉCURRENT : seules les parts location sont retirées (apporteur 100, collègue 50) ; le récurrent de gestion (10 + 5 / mois) ne l’est PAS', () => {
    const t = totauxPeriode([ligne({ apporteurId: 8, apporteurNom: 'Apporteur 8' })], { ...ctx, recurrents: [ligne({ apporteurId: 8, apporteurNom: 'Apporteur 8' })] }, { annee: 2026, mois: 3 });
    expect(t.deductions).toBeCloseTo(150, 10);
    expect(t.commission).toBeCloseTo(850 * 0.15 + 150, 10);
    expect(t.apporteursRecurrents).toBeCloseTo(10, 10);
    expect(t.colleguesRecurrents).toBeCloseTo(5, 10);
  });

  it('sans apporteur ni collègue : rien n’est retiré (les variables d’avant ne changent pas)', () => {
    const t = totauxPeriode([ligne({ apporteurId: null, apporteurNom: null, origineContact: 'internet' })], ctx, { annee: 2026, mois: 3 });
    expect(t.deductions).toBe(0);
    expect(t.commission).toBeCloseTo(1000 * 0.15 + 150, 10);
  });
});

describe('🔴 la cascade : chaque ligne affichée se tient au centime', () => {
  const lignes = [ligne(), ligne({ id: 2, apporteurId: 8, apporteurNom: 'Apporteur 8', honoProprietaireHt: 333.333 }), ligne({ id: 3, apporteurId: null, apporteurNom: null, origineContact: 'internet', mandatGestion: false })];
  const c2 = { ...ctx, recurrents: [lignes[1]], retrocessions: [{ negociateurId: 3, negociateurLibelle: 'JB', mois: '2026-03-01', montant: 40.5, libelle: 'Avance' }] };
  const [n] = sectionNegociateurs(lignes, c2, { annee: 2026, mois: 3 });
  const x = cascadeNegociateur(n, lignes, c2);
  const cent = (v: number) => Math.round(v * 100);

  it('CA − commissions = CA net ; résultat + primes − rétrocessions = variable (le variable du calcul, le même partout)', () => {
    expect(cent(x.net)).toBe(cent(x.ca) - cent(x.deductions));
    expect(cent(x.resultat) + cent(x.primes) - cent(x.retrocessions)).toBe(cent(x.variable));
    expect(cent(x.variable)).toBe(Math.round(n.totaux.commission * 100));
    expect(Math.abs(x.resultat - x.resultatCalcule)).toBeLessThanOrEqual(0.01);
  });

  it('les composants des « i » : dossier par dossier (apporteur, part location, gestion one shot, collègue, taux, prime) ; le récurrent dit à part', () => {
    expect(x.dossiers.map((d) => [d.id, Math.round(d.partLocation * 100) / 100, Math.round(d.gestionOneShot * 100) / 100, Math.round(d.collegueSignature * 100) / 100, d.taux, d.prime]))
      .toEqual([[1, 100, 120, 110, 0.15, 150], [2, 73.33, 0, 36.67, 0.15, 150], [3, 0, 0, 0, 0.15, 0]]);
    expect(x.dossiers[0]).toMatchObject({ apporteur: 'Léa Dupont', collegue: 'Jean-Baptiste Pons' });
    expect(x.taux).toBe(0.15);
    expect(x.retroDetail).toEqual([{ libelle: 'Avance', montant: 40.5 }]);
    expect(x.recurrents).toBeCloseTo(15, 10);
  });
});

describe('🔴 Arno (25/10/2026) — la cascade envoyée à un négociateur NON administrateur : la sienne seulement', () => {
  const lignes = [ligne(), ligne({ id: 2, negociateurId: 9, negociateurLibelle: 'Cédric' }), ligne({ id: 3, dateSignature: '2026-05-04' })];
  const c2: ContexteCalcul = { ...ctx, retrocessions: [
    { negociateurId: 3, negociateurLibelle: 'JB', mois: '2026-03-01', montant: 40.5, libelle: 'Avance JB' },
    { negociateurId: 9, negociateurLibelle: 'Cédric', mois: '2026-03-01', montant: 999, libelle: 'Avance Cédric' },
    { negociateurId: 9, negociateurLibelle: 'Cédric', mois: '2026-07-01', montant: 77, libelle: 'Seule Cédric' }] };
  const v = variablesDuNegociateur(lignes, c2, 2026, 3);

  it('ses seuls mois ; rien d’un autre négociateur (ni dossier, ni rétrocession, ni nom)', () => {
    expect(Object.keys(v)).toEqual(['2026-03', '2026-05']);
    expect(Object.values(v).every((x) => x.cle === 'id:3')).toBe(true);
    expect(v['2026-03'].dossiers.map((d) => d.id)).toEqual([1]);
    expect(v['2026-03'].retroDetail).toEqual([{ libelle: 'Avance JB', montant: 40.5 }]);
    expect(JSON.stringify(v)).not.toContain('Cédric');
  });

  it('identique, au centime, à la cascade que calcule un administrateur avec toutes les données', () => {
    const [n] = sectionNegociateurs(lignes, c2, { annee: 2026, mois: 3 }).filter((x) => x.cle === 'id:3');
    const admin = cascadeNegociateur(n, lignes.filter((a) => a.dateSignature.startsWith('2026-03')), c2);
    expect(Math.round(v['2026-03'].variable * 100)).toBe(Math.round(admin.variable * 100));
    expect(Math.round(v['2026-03'].variable * 100)).toBe(Math.round((670 * 0.15 + 150 - 40.5) * 100));
  });
});
