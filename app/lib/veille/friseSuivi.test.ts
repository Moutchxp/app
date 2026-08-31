import { describe, it, expect } from 'vitest';
import { construireFriseSuivi, partitionnerFrise, type EvenementFrise } from './friseSuivi';
import type { EnvoiHistorique } from './historiqueEnvois';
import type { EtatPartiel } from '../permis/dossierPartiel';
import type { EtatCascadePartielle } from './cascadePartielleRepo';

/**
 * LOT 15 — cœur PUR de la frise unifiée. On prouve : l'ordre chronologique STRICT sur un jeu mêlant envois, arrêt de relance
 * (déclaration) et prolongation de butoir ; les échéances À VENIR distinctes des faits passés ; le cas « aucun événement » ; le repli
 * des seuls faits anciens (les échéances jamais repliées).
 */
const envoi = (le: string, libelle: string, destinataire: string | null = null): EnvoiHistorique => ({ le, nature: 'relance_ordinaire', grade: 'Rappel', libelle, destinataire });
const suspension = (le: string, origine: 'outil' | 'declaree' = 'declaree'): EtatPartiel => ({ le, familles: ['cerfa'], origine });
const cascade = (over: Partial<EtatCascadePartielle> = {}): EtatCascadePartielle => ({ etape: 'relance', rang: 2, dateDue: '2026-09-07T00:00:00Z', prochaineDate: null, famillesManquantes: ['cerfa'], brouillon: null, ...over });

describe('construireFriseSuivi — fusion, ordre, faits vs échéances', () => {
  it('ordre chronologique STRICT sur un jeu mêlé (envoi initial, arrêt de relance déclaré, relance, butoir, prochaine étape)', () => {
    const frise = construireFriseSuivi({
      envois: [envoi('2026-08-04T21:00:00Z', 'Demande initiale de communication'), envoi('2026-08-26T09:00:00Z', 'Relance — Rappel')],
      suspension: suspension('2026-08-28T12:00:00Z'),        // CASC-1 (fait passé)
      butoirIso: '2026-10-02T00:00:00Z',                     // CASC-2 (échéance)
      cascade: cascade({ dateDue: '2026-09-07T00:00:00Z' }), // CASC-3 (échéance)
    });
    expect(frise.map((e) => e.libelle)).toEqual([
      'Demande initiale de communication',   // 04/08
      'Relance — Rappel',                     // 26/08
      'Relance pièces complémentaires',       // 28/08 (fait, LOT 16 : bascule de process)
      'Cascade partielle — relance 2 à envoyer', // 07/09 (échéance)
      'Délai avant saisine CADA prolongé',    // 02/10 (échéance)
    ]);
  });

  it('LOT 16 — la bascule de process (« Relance pièces complémentaires ») porte le drapeau `bascule`, elle SEULE', () => {
    const frise = construireFriseSuivi({
      envois: [envoi('2026-08-04T21:00:00Z', 'Demande initiale de communication')],
      suspension: suspension('2026-08-28T12:00:00Z'), butoirIso: '2026-10-02T00:00:00Z', cascade: cascade(),
    });
    expect(frise.filter((e) => e.bascule).map((e) => e.libelle)).toEqual(['Relance pièces complémentaires']);
  });

  it('les faits sont « passe », les échéances (butoir, prochaine étape) sont « avenir »', () => {
    const frise = construireFriseSuivi({ envois: [envoi('2026-08-04T21:00:00Z', 'Demande initiale de communication')], suspension: suspension('2026-08-28T12:00:00Z'), butoirIso: '2026-10-02T00:00:00Z', cascade: cascade() });
    const parLibelle = Object.fromEntries(frise.map((e) => [e.libelle, e.quand]));
    expect(parLibelle['Demande initiale de communication']).toBe('passe');
    expect(parLibelle['Relance pièces complémentaires']).toBe('passe');
    expect(parLibelle['Délai avant saisine CADA prolongé']).toBe('avenir');
    expect(parLibelle['Cascade partielle — relance 2 à envoyer']).toBe('avenir');
  });

  it('origine « déclarée » vs « outil » dans le détail de l’arrêt', () => {
    const decl = construireFriseSuivi({ envois: [], suspension: suspension('2026-08-28T12:00:00Z', 'declaree'), butoirIso: null, cascade: null });
    expect(decl[0].detail).toContain('déclarée hors outil');
    const outil = construireFriseSuivi({ envois: [], suspension: suspension('2026-08-28T12:00:00Z', 'outil'), butoirIso: null, cascade: null });
    expect(outil[0].detail).toContain('réclamé par l’outil');
  });

  it('CASC-3 selon l’étape : annonce, saisine proposable, ou prochaine échéance (rien dû)', () => {
    expect(construireFriseSuivi({ envois: [], suspension: null, butoirIso: null, cascade: cascade({ etape: 'annonce', dateDue: '2026-09-20T00:00:00Z' }) })[0].libelle).toBe('Cascade partielle — annonce CADA à envoyer');
    expect(construireFriseSuivi({ envois: [], suspension: null, butoirIso: null, cascade: cascade({ etape: 'saisine_proposable', dateDue: '2026-09-20T00:00:00Z' }) })[0].libelle).toBe('Cascade partielle — saisine CADA proposable');
    expect(construireFriseSuivi({ envois: [], suspension: null, butoirIso: null, cascade: cascade({ etape: 'aucune', dateDue: null, prochaineDate: '2026-09-25T00:00:00Z' }) })[0].libelle).toBe('Relance programmée'); // LOT 16 (point 3)
    // rien de daté → aucun événement de cascade
    expect(construireFriseSuivi({ envois: [], suspension: null, butoirIso: null, cascade: cascade({ etape: 'aucune', dateDue: null, prochaineDate: null }) })).toEqual([]);
  });

  it('aucune donnée → frise vide', () => {
    expect(construireFriseSuivi({ envois: [], suspension: null, butoirIso: null, cascade: null })).toEqual([]);
  });

  it('sans suspension, un butoirIso fourni n’ajoute RIEN (le butoir n’existe que dans le régime partiel)', () => {
    const frise = construireFriseSuivi({ envois: [envoi('2026-08-04T21:00:00Z', 'Demande initiale de communication')], suspension: null, butoirIso: '2026-10-02T00:00:00Z', cascade: null });
    expect(frise.map((e) => e.libelle)).toEqual(['Demande initiale de communication']);
  });
});

describe('partitionnerFrise — repli des faits anciens, échéances toujours visibles', () => {
  const f = (i: number): EvenementFrise => ({ le: `2026-08-0${i + 1}T08:00:00Z`, quand: 'passe', libelle: `Fait ${i}`, detail: null });
  const a: EvenementFrise = { le: '2026-09-07T00:00:00Z', quand: 'avenir', libelle: 'Échéance', detail: null };
  it('≤ 4 faits → tout visible, rien de replié ; échéances à part', () => {
    const { passeVisible, passeReplie, avenir } = partitionnerFrise([f(0), f(1), f(2), f(3), a]);
    expect(passeVisible).toEqual([f(0), f(1), f(2), f(3)]);
    expect(passeReplie).toEqual([]);
    expect(avenir).toEqual([a]);
  });
  it('> 4 faits → ancre + 3 récents visibles, milieu replié ; l’échéance reste dans « avenir » (jamais repliée)', () => {
    const faits = [0, 1, 2, 3, 4, 5].map(f); // 6 faits
    const { passeVisible, passeReplie, avenir } = partitionnerFrise([...faits, a]);
    expect(passeVisible).toEqual([faits[0], faits[3], faits[4], faits[5]]);
    expect(passeReplie).toEqual([faits[1], faits[2]]);
    expect(avenir).toEqual([a]);
  });
});
