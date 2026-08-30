import { describe, it, expect } from 'vitest';
import { statutFamille, familleAffichee, famillesAffichees, ORDRE_FAMILLES, LIBELLE_FAMILLE, type FamilleEncart } from './encartFamilles';

const TOUTES: FamilleEncart[] = ['suivi_actions', 'completude', 'historique', 'caracteristiques', 'batiments', 'pieces'];

describe('UNIF-0 — statutFamille : table (onglet × famille)', () => {
  it('Analyse : contenu remplissable, pas de suivi/actions (absente)', () => {
    expect(statutFamille('analyse', 'suivi_actions')).toBe('absente');
    for (const f of ['completude', 'historique', 'caracteristiques', 'batiments', 'pieces'] as FamilleEncart[]) {
      expect(statutFamille('analyse', f)).toBe('remplissable');
    }
  });
  it('En cours / Réponses : seul le suivi est remplissable, le reste « si non vide »', () => {
    for (const onglet of ['en_cours', 'reponses'] as const) {
      expect(statutFamille(onglet, 'suivi_actions')).toBe('remplissable');
      for (const f of ['completude', 'historique', 'caracteristiques', 'batiments', 'pieces'] as FamilleEncart[]) {
        expect(statutFamille(onglet, f)).toBe('si_non_vide');
      }
    }
  });
  it('Archives : Pièces + Caractéristiques remplissables ; le reste « si non vide »', () => {
    expect(statutFamille('archives', 'pieces')).toBe('remplissable');
    expect(statutFamille('archives', 'caracteristiques')).toBe('remplissable');
    for (const f of ['suivi_actions', 'completude', 'historique', 'batiments'] as FamilleEncart[]) {
      expect(statutFamille('archives', f)).toBe('si_non_vide');
    }
  });
});

describe('UNIF-0 — familleAffichee : règle d’Arno (remplissable OU non vide ; absente sinon)', () => {
  it('remplissable → toujours affichée, même vide', () => {
    expect(familleAffichee('analyse', 'completude', false)).toBe(true);
    expect(familleAffichee('en_cours', 'suivi_actions', false)).toBe(true);
    expect(familleAffichee('archives', 'pieces', false)).toBe(true);
  });
  it('si_non_vide : affichée SEULEMENT si non vide', () => {
    expect(familleAffichee('en_cours', 'completude', false)).toBe(false); // vide → absente de l’encart
    expect(familleAffichee('en_cours', 'completude', true)).toBe(true);   // contient des infos → affichée
    expect(familleAffichee('reponses', 'batiments', true)).toBe(true);
  });
  it('absente : jamais affichée, quel que soit le contenu', () => {
    expect(familleAffichee('analyse', 'suivi_actions', true)).toBe(false);
    expect(familleAffichee('analyse', 'suivi_actions', false)).toBe(false);
  });
});

describe('UNIF-0 — famillesAffichees : liste ordonnée par onglet', () => {
  it('demande fraîchement envoyée en « En cours » (tout vide) → uniquement le suivi', () => {
    expect(famillesAffichees('en_cours', {})).toEqual(['suivi_actions']);
  });
  it('dossier incomplet revenu en « En cours » → suivi + toutes les familles non vides, dans l’ordre canonique', () => {
    const vues = famillesAffichees('en_cours', { completude: true, historique: true, caracteristiques: true, batiments: true, pieces: true });
    expect(vues).toEqual(['suivi_actions', 'completude', 'historique', 'caracteristiques', 'batiments', 'pieces']);
  });
  it('Analyse : les 5 familles de contenu toujours là, jamais le suivi', () => {
    expect(famillesAffichees('analyse', {})).toEqual(['completude', 'historique', 'caracteristiques', 'batiments', 'pieces']);
  });
  it('Archives vide → Pièces + Caractéristiques (remplissables), dans l’ordre canonique', () => {
    expect(famillesAffichees('archives', {})).toEqual(['caracteristiques', 'pieces']);
  });
  it('l’ordre suit ORDRE_FAMILLES et chaque famille a un libellé court', () => {
    expect(ORDRE_FAMILLES).toEqual(TOUTES);
    for (const f of TOUTES) expect(LIBELLE_FAMILLE[f].length).toBeGreaterThan(0);
  });
});
