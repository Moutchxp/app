import { describe, expect, it } from 'vitest';
import { apporteurAffiche, type ActiviteCalcul } from './tableauBord';
import { activitesDuMois, origineDeTexte } from './repriseExcel';
import type { Apporteur } from './suivi';
import type { LigneExcel, MoisExcel } from './lectureExcel';

/**
 * 🔴 Arno (24/10/2026) — la colonne « APPORTEURS D'AFFAIRES » de la ligne synthétique (Suivi du mois) : apporteur > collègue >
 * libellé de l'origine du contact > vide, pour restituer la colonne G du fichier CA_JBP sur les lignes importées.
 */
const base: ActiviteCalcul = {
  id: 1, type: 'bail', dateSignature: '2026-09-01', libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500,
  honoLocataireHt: 500, primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null,
  commissionSaisie: null, negociateurId: null, negociateurLibelle: 'Jean-Baptiste', avecGestion: false, origineProprietaire: null, origineLocataire: null,
  loyerHc: null, charges: null, assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache',
  origineContact: null, collegueId: null, collegueLibelle: null,
};
const annuaire: Apporteur[] = [{ id: 7, nom: 'Pierre Thevenin', type: 'partenaire', archive: false, baremes: [] }];

describe('🔴 la colonne « Apporteurs d’affaires » : apporteur > collègue > origine > vide', () => {
  it('l’apporteur d’abord — même si un collègue ou une origine sont là', () => {
    expect(apporteurAffiche({ ...base, origineContact: 'apporteur', apporteurId: 7, apporteurNom: 'Pierre Thevenin' }, annuaire))
      .toEqual({ texte: 'Pierre Thevenin', source: 'apporteur' });
    expect(apporteurAffiche({ ...base, origineContact: 'collegue', collegueLibelle: 'Arnaud Jorel', apporteurNom: 'Pierre Thevenin', apporteurId: 7 }, annuaire).texte)
      .toBe('Pierre Thevenin');
  });
  it('le nom manquant se lit dans l’annuaire par l’identifiant', () => {
    expect(apporteurAffiche({ ...base, origineContact: 'apporteur', apporteurId: 7 }, annuaire)).toEqual({ texte: 'Pierre Thevenin', source: 'apporteur' });
  });
  it('sans apporteur : le collègue (« Collègue directement »)', () => {
    expect(apporteurAffiche({ ...base, origineContact: 'collegue', collegueId: 2, collegueLibelle: 'Jean-Baptiste Pons' }, annuaire))
      .toEqual({ texte: 'Jean-Baptiste Pons', source: 'collegue' });
  });
  it('ni apporteur ni collègue : le libellé de l’origine (Internet, Passage agence, Personnalisé : …)', () => {
    expect(apporteurAffiche({ ...base, origineContact: 'internet' }, annuaire)).toEqual({ texte: 'Internet', source: 'origine' });
    expect(apporteurAffiche({ ...base, origineContact: 'passage_agence' }, annuaire).texte).toBe('Passage agence');
    expect(apporteurAffiche({ ...base, origineContact: 'personnalise', origineContactPrecision: 'Salon' }, annuaire).texte).toBe('Personnalisé : Salon');
  });
  it('rien : vide', () => {
    expect(apporteurAffiche(base, annuaire)).toEqual({ texte: '', source: null });
    expect(apporteurAffiche({ ...base, apporteurNom: '  ' }, annuaire)).toEqual({ texte: '', source: null });
  });
  it('un collègue sans libellé ne s’affiche pas comme collègue : on passe à l’origine', () => {
    expect(apporteurAffiche({ ...base, origineContact: 'collegue', collegueId: 2 }, annuaire)).toEqual({ texte: 'Collègue directement', source: 'origine' });
  });

  describe('les lignes importées restituent la colonne G du fichier', () => {
    const collegues = ['Arnaud Jorel', 'Jean-Baptiste Pons', 'Cédric Jullien'];
    const ligne = (apporteurTexte: string | null, cle: string): LigneExcel => ({
      cle, mois: '2026-09', rang: 1, proprietaire: 'DUPONT', honoProprietaireHt: 500, locataire: 'MARTIN', honoLocataireHt: 500, caHt: 1000, prime: 0,
      apporteurTexte, commission: 0, tauxCommission: null, avenant: false, avecGestion: false, parking: false, commentaire: '',
    } as unknown as LigneExcel);
    const mois = { mois: '2026-09', negociateur: 'Jean-Baptiste', lignes: [
      ligne('Frédéric Rousseau', 'a'), ligne('Jean-Baptiste Pons', 'b'), ligne('Internet', 'c'), ligne(null, 'd'),
    ] } as unknown as MoisExcel;
    const lu = activitesDuMois(mois, { collaborateurs: collegues });
    it.each([
      ['Frédéric Rousseau', 'apporteur'], ['Jean-Baptiste Pons', 'collegue'], ['Internet', 'origine'], ['', null],
    ])('« %s » → %s', (texte, source) => {
      const a = lu[['Frédéric Rousseau', 'Jean-Baptiste Pons', 'Internet', ''].indexOf(texte)];
      expect(apporteurAffiche(a, [])).toEqual({ texte, source });
    });
    it('les cas que la répartition ne peut pas restituer à l’identique (dits à Arno) : « Agence … », « X ( Y) »', () => {
      expect(origineDeTexte('Agence Puteaux', collegues).origine).toBe('passage_agence');
      expect(apporteurAffiche({ ...base, origineContact: 'passage_agence' }, []).texte).toBe('Passage agence');
      const arbitre = origineDeTexte('Jean-Baptiste ( Julien Deblois)', collegues);
      expect(apporteurAffiche({ ...base, origineContact: arbitre.origine, apporteurNom: arbitre.apporteur?.nom ?? null }, []).texte).toBe('Julien Deblois');
    });
  });
});
