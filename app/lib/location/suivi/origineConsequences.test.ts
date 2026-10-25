import { describe, expect, it, vi } from 'vitest';
import type { Apporteur } from './suivi';
import { appliquerOrigine, consequencesOrigine, resumeConsequences } from './origineConsequences';
import { commissionApporteurDe, totauxPeriode, type ActiviteCalcul, type ContexteCalcul } from './tableauBord';

/**
 * 🔴 Arno (25/10/2026) — LES CONSÉQUENCES D'UNE MODIFICATION DE L'ORIGINE : calculées sans rien écrire, ÉGALES aux chiffres recalculés
 * après l'enregistrement (la ligne modifiée = ce que le serveur écrit), les lignes sensibles (variable, net) aux seuls administrateurs.
 * Données fictives.
 */
vi.mock('server-only', () => ({}));
const ligne = (o: Partial<ActiviteCalcul> = {}): ActiviteCalcul => ({
  id: 1, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400, primeSaisie: null,
  mandatGestion: false, categoriePrime: 'logement', apporteurId: 7, apporteurNom: 'Léa Dupont', apporteurTaux: 0.2, commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB',
  avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100, assurance: null, parking: false, vacanceJours: null,
  rattachement: 'rattache', origineContact: 'apporteur', tauxGestionBien: 5, finGestion: null, ...o,
});
const apporteur = (id: number, nom: string): Apporteur => ({ id, nom, type: 'partenaire', archive: false, compteId: null,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste Pons' }], remunerations: [] } as unknown as Apporteur);
const apporteurs = [apporteur(7, 'Léa Dupont'), apporteur(8, 'Marc Martin')];
const ctx: ContexteCalcul = { regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs, retrocessions: [], aujourdhui: '2026-03-31' };
const lignes = [ligne(), ligne({ id: 2, apporteurId: null, apporteurNom: null, apporteurTaux: null, origineContact: 'internet' })];

describe('🔴 la ligne APRÈS l’enregistrement (miroir de l’écriture)', () => {
  it('un AUTRE apporteur : taux, montant saisi, mode et taux de gestion repartent de l’annuaire ; le MÊME apporteur les garde', () => {
    const autre = appliquerOrigine(ligne({ commissionSaisie: 55, apporteurMode: 'recurrent', apporteurTauxGestion: 0.3 }),
      { origineContact: 'apporteur', origineContactPrecision: null, apporteurId: 8, collegueId: null, apporteurNom: 'Marc Martin', collegueLibelle: null });
    expect([autre.apporteurId, autre.apporteurNom, autre.apporteurTaux, autre.commissionSaisie, autre.apporteurMode, autre.apporteurTauxGestion]).toEqual([8, 'Marc Martin', null, null, null, null]);
    const meme = appliquerOrigine(ligne({ commissionSaisie: 55 }), { origineContact: 'apporteur', origineContactPrecision: null, apporteurId: 7, collegueId: null, apporteurNom: 'Léa Dupont', collegueLibelle: null });
    expect([meme.apporteurTaux, meme.commissionSaisie]).toEqual([0.2, 55]);
  });
});

describe('🔴 les conséquences : avant / après, sans rien écrire, ÉGALES aux chiffres après l’enregistrement', () => {
  const nouvelle = { origineContact: 'internet' as const, origineContactPrecision: null, apporteurId: null, collegueId: null, apporteurNom: null, collegueLibelle: null };
  const apres = appliquerOrigine(lignes[0], nouvelle);
  const c = consequencesOrigine(lignes, 1, apres, ctx, { voirSensible: true, apporteurs });
  const valeur = (libelle: string) => c.find((l) => l.libelle === libelle);
  it('l’origine, l’apporteur, les honoraires d’apporteur du dossier, le Résultat du mois, les Apporteurs du mois', () => {
    expect(valeur('Origine du contact')).toMatchObject({ avant: 'Apporteur d’affaires', apres: 'Internet' });
    expect(valeur('Apporteur')).toMatchObject({ avant: 'Léa Dupont', apres: '—' });
    expect(valeur('Honoraires d’apporteur (à la signature)')).toMatchObject({ avant: '200,00 €', apres: '0,00 €' });
    expect(valeur('Honoraires d’apporteurs')).toMatchObject({ groupe: 'Résultat du mois', avant: '200,00 €', apres: '0,00 €' });
    expect(valeur('Léa Dupont')).toMatchObject({ groupe: 'Apporteurs du mois', apres: '—' });
  });
  it('« après » = les chiffres RECALCULÉS sur la ligne telle qu’elle sera écrite (rien d’inventé)', () => {
    const t = totauxPeriode(lignes.map((x) => (x.id === 1 ? apres : x)), ctx, { annee: 2026, mois: 3 });
    expect(valeur('Honoraires d’apporteurs')?.apres).toBe(`${t.apporteurs.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
    expect(valeur('Honoraires d’apporteur (à la signature)')?.apres).toBe(`${commissionApporteurDe(apres, apporteurs).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  });
  it('les lignes SENSIBLES (variable du négociateur, net de toutes variables) : seulement pour un administrateur', () => {
    expect(c.filter((l) => l.sensible).map((l) => l.groupe)).toEqual(['Variable du négociateur', 'Résultat net de l’agence']);
    expect(valeur('JB')).toMatchObject({ avant: '270,00 €', apres: '300,00 €' });
    const sansDroit = consequencesOrigine(lignes, 1, apres, ctx, { voirSensible: false, apporteurs });
    expect(sansDroit.some((l) => l.sensible)).toBe(false);
    expect(sansDroit.map((l) => l.groupe)).not.toContain('Variable du négociateur');
  });
  it('le résumé du journal : une ligne par conséquence', () => {
    expect(resumeConsequences(c)).toContain('Origine — Origine du contact : Apporteur d’affaires → Internet');
  });
});
