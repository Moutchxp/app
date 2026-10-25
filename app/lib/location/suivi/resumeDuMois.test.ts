import { describe, expect, it } from 'vitest';
import { gestionDuMois, NATURES_BIEN, resumeDuMois, totauxPeriode, type ActiviteCalcul, type ContexteCalcul, type LigneGestion } from './tableauBord';

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
