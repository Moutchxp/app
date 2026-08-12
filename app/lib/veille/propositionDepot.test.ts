import { describe, it, expect } from 'vitest';
import { apparierPropositions, chiffresDossier, type CibleDepot, type MessageCandidat } from './propositionDepot';

/**
 * T4 (commit B) — appariement PUR message ↔ demande EN ATTENTE. Deux files séparées, garde d'ambiguïté, ignoré = ne réapparaît pas.
 */
const CIBLE = (over: Partial<CibleDepot> = {}): CibleDepot => ({ demandeId: 1, reference: 'SVAV-DEM-2026-000156', communeNom: 'Paris', numerosDossier: ['0930012500081'], referencesMairie: [], ...over });
const MSG = (over: Partial<MessageCandidat> = {}): MessageCandidat => ({ id: 10, objet: null, corpsTexte: null, nomsPieces: [], traiteLe: null, ...over });

describe('T4 — apparierPropositions', () => {
  it('cite le num_dau d’UNE seule demande en attente → proposition actionnable + id citant', () => {
    const m = MSG({ id: 10, objet: 'Dépôt PC 093 001 25 00081 enregistré' });
    const { propositions, idsCitants } = apparierPropositions([m], [CIBLE({ demandeId: 1 })]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]).toEqual({ messageId: 10, candidats: [{ demandeId: 1, reference: 'SVAV-DEM-2026-000156', communeNom: 'Paris' }] });
    expect(idsCitants.has(10)).toBe(true);
  });

  it('cite une RÉFÉRENCE MAIRIE d’une demande en attente → proposition (num_dau non requis)', () => {
    const m = MSG({ corpsTexte: 'Votre demande SLC260810440700 a été déposée.' });
    const { propositions } = apparierPropositions([m], [CIBLE({ numerosDossier: [], referencesMairie: ['SLC260810440700'] })]);
    expect(propositions).toHaveLength(1);
  });

  it('num_dau dans le NOM d’une pièce jointe → cité (mêmes normalisations que la relève)', () => {
    const m = MSG({ nomsPieces: ['reponse_0930012500081.pdf'] });
    const { propositions } = apparierPropositions([m], [CIBLE()]);
    expect(propositions).toHaveLength(1);
  });

  it('AMBIGUÏTÉ : cite le permis de ≥ 2 demandes en attente → candidats multiples, PAS de choix (l’écran ne confirmera pas)', () => {
    const m = MSG({ objet: 'PC 093 001 25 00081' });
    const { propositions } = apparierPropositions([m], [CIBLE({ demandeId: 1 }), CIBLE({ demandeId: 2, reference: 'SVAV-DEM-2026-000200' })]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0].candidats).toHaveLength(2); // ambiguë → l’écran signale, ne confirme pas
  });

  it('AUCUN permis en attente cité → PAS de proposition, PAS citant (reste « À rattacher »)', () => {
    const { propositions, idsCitants } = apparierPropositions([MSG({ objet: 'Publicité sans rapport' })], [CIBLE()]);
    expect(propositions).toHaveLength(0);
    expect(idsCitants.size).toBe(0);
  });

  it('message IGNORÉ (traité) citant un permis en attente → aucune proposition MAIS reste citant (exclu de « À rattacher », ne réapparaît pas)', () => {
    const m = MSG({ id: 10, objet: 'Dépôt 0930012500081', traiteLe: '2026-08-12T10:00:00Z' });
    const { propositions, idsCitants } = apparierPropositions([m], [CIBLE()]);
    expect(propositions).toHaveLength(0);      // ignoré → pas de proposition
    expect(idsCitants.has(10)).toBe(true);     // …mais ne retombe pas dans « À rattacher »
  });

  it('chiffresDossier : retire tout sauf les chiffres', () => {
    expect(chiffresDossier('PC 093 001 25 00081')).toBe('0930012500081');
    expect(chiffresDossier('07511524V0006')).toBe('075115240006');
  });
});
