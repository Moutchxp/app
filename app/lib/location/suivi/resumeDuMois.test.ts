import { describe, expect, it } from 'vitest';
import { gestionDepuisJanvier, gestionDuMois, NATURES_BIEN, resumeDuMois, totauxPeriode, type ActiviteCalcul, type ContexteCalcul, type LigneGestion } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026) — « Résumé du mois » : les 5 familles du bas de feuille, sur des lignes fictives. Les égalités sont EXACTES :
 * Σ statuts = CA ; avec + sans = CA ; CA net = CA − apporteurs − collègues (au centime affiché) ; solde = gagnées − perdues.
 */
const base = (id: number, p: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: '2026-09-01', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 0, honoLocataireHt: 0, primeSaisie: null,
  mandatGestion: false, categoriePrime: 'logement', apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null,
  parking: false, vacanceJours: null, rattachement: 'rattache', origineContact: null, ...p });
const lignes = [
  base(1, { honoProprietaireHt: 612.355, honoLocataireHt: 540.1, origineContact: 'internet', mandatGestion: true, avecGestion: true }),
  base(2, { honoProprietaireHt: 480, honoLocataireHt: 420, origineContact: 'relocation', avecGestion: true }),
  base(3, { honoProprietaireHt: 333.333, honoLocataireHt: 0, origineContact: 'proprietaire_deja_client' }),
  base(4, { honoProprietaireHt: 100, honoLocataireHt: 0, origineContact: null, natureManuelle: { nature: 'nouveau_sans_gestion', par: 'Arnaud Jorel', le: '2026-10-25' } }),
  base(5, { honoProprietaireHt: 250, honoLocataireHt: 250, origineContact: 'internet', apporteurId: 1, apporteurNom: 'Ap', apporteurTaux: 0.1 }),
];
const ctx: ContexteCalcul = { regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [], retrocessions: [], aujourdhui: '2026-10-25' };
const gl: LigneGestion[] = [
  { lotId: 7, libelle: 'a', proprietaire: 'x', effetLe: '2026-09-12', avant: 'location_seule', apres: 'en_gestion', loyerHc: 1000, provisions: 100, base: 'cc', tauxHt: 6 },
  { lotId: 8, libelle: 'b', proprietaire: 'y', effetLe: '2026-09-30', avant: 'en_gestion', apres: 'ancienne_gestion', loyerHc: 800, provisions: 0, base: 'hc', tauxHt: 5 },
];

describe('🔴 resumeDuMois', () => {
  const t = totauxPeriode(lignes, ctx, { annee: 2026, mois: 9 });
  const r = resumeDuMois(t, lignes, gestionDuMois(gl, '2026-09'), []);

  it('CA par statut : les 5 dans l’ordre ; Σ = CA HT global ; le statut validé à la main l’emporte', () => {
    expect(r.parStatut.map((x) => x.nature)).toEqual([...NATURES_BIEN]);
    expect(r.parStatut.reduce((s, x) => s + x.ca, 0)).toBeCloseTo(t.ca, 9);
    expect(r.parStatut.reduce((s, x) => s + x.nb, 0)).toBe(5);
    expect(r.parStatut.find((x) => x.nature === 'nouveau_sans_gestion')?.ids).toEqual([4, 5]);
    expect(r.parStatut.find((x) => x.nature === 'a_qualifier')?.nb).toBe(0);
    expect(r.parStatut.reduce((s, x) => s + (x.part ?? 0), 0)).toBeCloseTo(1, 9);
  });

  it('avec + sans gestion = CA HT global (montants et dossiers)', () => {
    expect(r.gestion.avec.ca + r.gestion.sans.ca).toBeCloseTo(t.ca, 9);
    expect([r.gestion.avec.nb, r.gestion.sans.nb]).toEqual([2, 3]);
  });

  it('CA HT net = CA − apporteurs − collègues, au centime des montants affichés', () => {
    const c = (x: number) => Math.round(x * 100);
    expect(c(r.resultat.caNet)).toBe(c(r.resultat.ca) - c(r.resultat.apporteurs) - c(r.resultat.collegues));
    expect(r.resultat.apporteurs).toBe(t.apporteurs);
  });

  it('portefeuille : solde = gagnées − perdues (mensuel, annuel)', () => {
    expect(r.portefeuille.gagnes).toEqual({ nb: 1, mensuel: 66, annuel: 792 });
    expect(r.portefeuille.perdus).toEqual({ nb: 1, mensuel: 40, annuel: 480 });
    expect(r.portefeuille.solde).toEqual({ mensuel: 26, annuel: 312 });
  });
});

describe('🔴 Arno (25/10/2026) — le portefeuille de gestion « depuis le 1er janvier » (pas d’effet boule de neige)', () => {
  const g = (lotId: number, effetLe: string, entree: boolean, loyerHc: number | null, tauxHt: number | null = 10): LigneGestion => ({
    lotId, libelle: `Bien ${lotId}`, proprietaire: 'P', effetLe, avant: entree ? 'location_seule' : 'en_gestion', apres: entree ? 'en_gestion' : 'ancienne_gestion',
    loyerHc, provisions: 0, base: 'hc', tauxHt });
  it('janvier +150 / mois, février +100 / mois → 250 / mois en février (et non 400) ; / an = × 12', () => {
    const l = [g(1, '2026-01-10', true, 1500), g(2, '2026-02-05', true, 1000)];
    expect(gestionDepuisJanvier(l, '2026-01').entrees).toMatchObject({ nb: 1, mensuel: 150, annuel: 1800 });
    expect(gestionDepuisJanvier(l, '2026-02').entrees).toMatchObject({ nb: 2, mensuel: 250, annuel: 3000 });
  });
  it('les sorties sont déduites ; le solde cumulé = la somme des soldes mensuels de l’année, au centime ; rien après le mois affiché', () => {
    const l = [g(1, '2026-01-10', true, 1500), g(2, '2026-02-05', true, 1000), g(3, '2026-03-20', false, 803.33), g(4, '2026-04-02', true, 999), g(5, '2026-12-01', true, 5000)];
    const c = gestionDepuisJanvier(l, '2026-04');
    expect([c.entrees.nb, c.sorties.nb]).toEqual([3, 1]);
    const somme = ['2026-01', '2026-02', '2026-03', '2026-04'].reduce((s, m) => s + gestionDuMois(l, m).balanceMensuelle, 0);
    expect(Math.round(c.solde.mensuel * 100)).toBe(Math.round(somme * 100));
    expect(Math.round(c.solde.mensuel * 100)).toBe(Math.round((150 + 100 + 99.9 - 80.333) * 100));
    expect(c.solde.annuel).toBeCloseTo(c.solde.mensuel * 12, 9);
  });
  it('les biens sans loyer de départ : non comptés, comptés à part', () => {
    const c = gestionDepuisJanvier([g(1, '2026-01-10', true, 1500), g(2, '2026-02-05', true, null), g(3, '2026-02-07', false, 900, null)], '2026-03');
    expect(c.sansLoyer).toBe(2);
    expect([c.entrees.nb, c.entrees.mensuel, c.sorties.nb, c.sorties.mensuel]).toEqual([2, 150, 1, 0]);
    expect(c.entrees.biens.map((b) => [b.lotId, b.mois, b.mensuel])).toEqual([[1, '2026-01', 150], [2, '2026-02', null]]);
  });
});
