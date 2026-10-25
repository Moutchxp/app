import { describe, expect, it } from 'vitest';
import type { Apporteur } from './suivi';
import { apporteursEtCollegues, caLigne, type ActiviteCalcul } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026) — « Apporteurs du mois » : TOUS les apporteurs du mois (internes, externes, collègues « directement »), triés par
 * CA apporté, le meilleur mis en avant (ex aequo compris) ; une commission non nommée ; « Sans apporteur » ; Total = CA du mois ; les
 * collègues des seuls apporteurs EXTERNES. Données fictives.
 */
const ligne = (id: number, ca: number, o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: '2026-06-10', libelleProprietaire: `P${id}`, libelleLocataire: `L${id}`, honoProprietaireHt: ca, honoLocataireHt: 0, primeSaisie: null,
  mandatGestion: false, categoriePrime: 'logement', apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'JB', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', origineContact: 'internet', ...o,
});
const ap = (id: number, nom: string, compteId: number | null): Apporteur => ({
  id, nom, type: 'partenaire', archive: false, compteId, baremes: [{ depuis: '2019-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 }],
  collegues: compteId === null ? [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }] : [],
} as Apporteur);
const apporteurs = [ap(1, 'Frédéric Rousseau', null), ap(2, 'Mylène Interne', 9)];
const lignes = [
  ligne(1, 528.9, { apporteurId: 1, apporteurNom: 'Frédéric Rousseau', origineContact: 'apporteur' }),
  ligne(2, 937.35, { apporteurId: 1, apporteurNom: 'Frédéric Rousseau', origineContact: 'apporteur' }),
  ligne(3, 1693.54, { origineContact: 'collegue', collegueId: 2, collegueLibelle: 'Arnaud Jorel', commissionSaisie: 0 }),
  ligne(4, 460.96, { origineContact: 'collegue', collegueId: null, collegueLibelle: 'Cédric Jullien', commissionSaisie: 0 }),
  ligne(5, 700, { apporteurId: 2, apporteurNom: 'Mylène Interne', origineContact: 'apporteur' }),
  ligne(6, 311.42, { origineContact: null, commissionSaisie: 31.14 }),
  ligne(7, 1701.62, { origineContact: 'internet' }),
  ligne(8, 529.54, { origineContact: null }),
];

describe('🔴 apporteurs du mois', () => {
  const r = apporteursEtCollegues(lignes, apporteurs);

  it('TOUS présents (externe, interne de l’annuaire, collègues « directement » internes, commission non nommée) ; triés par CA apporté', () => {
    expect(r.apporteurs.map((x) => [x.nom, x.sorte, x.nb])).toEqual([
      ['Arnaud Jorel', 'interne', 1], ['Frédéric Rousseau', 'externe', 2], ['Mylène Interne', 'interne', 1], ['Cédric Jullien', 'interne', 1], ['Apporteur non nommé', 'non_nomme', 1]]);
    expect(r.apporteurs.map((x) => x.ca)).toEqual([...r.apporteurs.map((x) => x.ca)].sort((a, b) => b - a));
  });

  it('le MEILLEUR mis en avant ; ex aequo au centime : tous les deux ; jamais la commission non nommée', () => {
    expect(r.apporteurs.filter((x) => x.meilleur).map((x) => x.nom)).toEqual(['Arnaud Jorel']);
    const egal = apporteursEtCollegues([...lignes, ligne(9, 227.29, { apporteurId: 1, apporteurNom: 'Frédéric Rousseau', origineContact: 'apporteur' })], apporteurs);
    expect(egal.apporteurs.filter((x) => x.meilleur).map((x) => x.nom).sort()).toEqual(['Arnaud Jorel', 'Frédéric Rousseau']);
  });

  it('« Sans apporteur » (Internet, à renseigner…) et Total = CA HT du mois, au centime', () => {
    expect([r.sans.nb, Math.round(r.sans.ca * 100)]).toEqual([2, Math.round((1701.62 + 529.54) * 100)]);
    const ca = lignes.reduce((s, a) => s + caLigne(a), 0);
    expect(Math.round(r.total.ca * 100)).toBe(Math.round(ca * 100));
    expect(Math.round((r.apporteurs.reduce((s, x) => s + x.ca, 0) + r.sans.ca) * 100)).toBe(Math.round(ca * 100));
    expect(r.total.nb).toBe(8);
  });

  it('COLLÈGUES : seulement ceux des apporteurs EXTERNES (ni l’interne, ni les collègues « directement »)', () => {
    expect(r.collegues.map((x) => [x.libelle, x.nb, Math.round(x.ca * 100)])).toEqual([['Jean-Baptiste Pons', 2, Math.round((528.9 + 937.35) * 100)]]);
  });
});
