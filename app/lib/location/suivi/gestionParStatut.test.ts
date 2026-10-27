import { describe, expect, it } from 'vitest';
import { caLigne, FAMILLE_GESTION, gestionDuMois, natureBienLoue, resumeDuMois, type ActiviteCalcul, type TotauxPeriode } from './tableauBord';

/**
 * 🔴 Arno (27/10/2026) — « HONORAIRES AVEC / SANS GESTION » : la MÊME classification que les badges et que « CA par statut du bien ».
 * Le cas d'octobre 2026 constaté en production (données fictives, mêmes montants) : avant, le bloc lisait la case « Relocation » de la ligne
 * (`avecGestion`) — BLANCO (« À qualifier », case cochée) passait en « avec gestion », COHEN et REIFHI (« Nouvelle gestion » par le mandat
 * signé, case vide) en « sans gestion ».
 */
const ligne = (o: Partial<ActiviteCalcul>): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-10-05', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 0, honoLocataireHt: 0,
  primeSaisie: 0, mandatGestion: false, categoriePrime: 'logement', apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: null,
  negociateurLibelle: 'x', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur', primeMode: 'aucune', ...o,
});
const OCTOBRE = [
  ligne({ id: 1, libelleLocataire: 'LATHAM', honoProprietaireHt: 983.46, avecGestion: true, origineContact: 'relocation' }),
  ligne({ id: 2, libelleLocataire: 'BLANCO', honoProprietaireHt: 230.48, avecGestion: true, origineContact: null }),
  ligne({ id: 3, libelleLocataire: 'COHEN', honoProprietaireHt: 214.59, mandatGestion: true }),
  ligne({ id: 4, libelleLocataire: 'REIFHI', mandatGestion: true }),
];
const resume = (lignes: readonly ActiviteCalcul[]) => {
  const ca = lignes.reduce((s, a) => s + caLigne(a), 0);
  return resumeDuMois({ ca, apporteurs: 0, collegues: 0, primes: 0, retrocessions: 0 } as TotauxPeriode, lignes, gestionDuMois([], '2026-10'), []);
};

describe('🔴 avec / sans gestion / à qualifier = les statuts du bien regroupés', () => {
  it('octobre 2026 : avec gestion 3 / 1 198,05 € ; sans gestion 0 ; à qualifier 1 / 230,48 € ; total 4 / 1 428,53 €', () => {
    const r = resume(OCTOBRE);
    expect(OCTOBRE.map((a) => natureBienLoue(a).nature)).toEqual(['relocation', 'a_qualifier', 'nouveau_gestion', 'nouveau_gestion']);
    expect(r.gestion.avec).toMatchObject({ nb: 3 });
    expect(r.gestion.avec.ca).toBeCloseTo(1198.05, 9);
    expect(r.gestion.sans).toMatchObject({ nb: 0, ca: 0 });
    expect(r.gestion.aQualifier).toMatchObject({ nb: 1, ca: 230.48 });
    expect(r.gestion.avec.nb + r.gestion.sans.nb + r.gestion.aQualifier.nb).toBe(4);
    expect(r.gestion.avec.ca + r.gestion.sans.ca + r.gestion.aQualifier.ca).toBeCloseTo(1428.53, 9);
  });

  it('le MÊME classement que « CA par statut du bien » (et donc que le badge), statut validé à la main compris', () => {
    const lignes = [...OCTOBRE, ligne({ id: 5, honoLocataireHt: 100, avecGestion: false, origineContact: 'proprietaire_deja_client' }),
      ligne({ id: 6, honoLocataireHt: 50, origineContact: null, natureManuelle: { nature: 'nouveau_sans_gestion', par: 'Arno', le: '2026-10-26T10:00:00Z' } })];
    const r = resume(lignes);
    for (const f of ['avec', 'sans', 'a_qualifier'] as const) {
      const statuts = r.parStatut.filter((p) => FAMILLE_GESTION[p.nature] === f);
      const g = f === 'a_qualifier' ? r.gestion.aQualifier : r.gestion[f];
      expect(g.nb).toBe(statuts.reduce((s, p) => s + p.nb, 0));
      expect(g.ca).toBeCloseTo(statuts.reduce((s, p) => s + p.ca, 0), 9);
      // Ligne par ligne : la famille de son badge.
      expect(lignes.filter((a) => FAMILLE_GESTION[natureBienLoue(a).nature] === f).length).toBe(g.nb);
    }
    expect(r.gestion.sans).toMatchObject({ nb: 2, ca: 150 });
    expect(r.gestion.avec.ca + r.gestion.sans.ca + r.gestion.aQualifier.ca).toBeCloseTo(r.resultat.ca, 9);
  });
});
