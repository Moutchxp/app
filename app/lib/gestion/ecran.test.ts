import { describe, it, expect } from 'vitest';
import {
  depuis, formaterDateFr, libelleEtat, mentionTroncature, messageErreurHttp, messageEvenementsVide, messageFileVide,
  messageReleve,
} from './ecran';

/**
 * LOT 2 — ce que l'écran DIT. Les phrases du vide sont testées AU MÊME TITRE que le reste : c'est là que se joue la
 * différence entre « rien n'est arrivé » et « on n'a jamais regardé », et confondre les deux rendrait l'outil menteur.
 */

const MAINTENANT = new Date('2026-09-23T12:00:00Z');

describe('ancienneté lisible', () => {
  it('rend les paliers attendus, avec le pluriel juste', () => {
    expect(depuis('2026-09-23T11:59:40Z', MAINTENANT)).toBe('à l’instant');
    expect(depuis('2026-09-23T11:30:00Z', MAINTENANT)).toBe('il y a 30 min');
    expect(depuis('2026-09-23T07:00:00Z', MAINTENANT)).toBe('il y a 5 h');
    expect(depuis('2026-09-22T12:00:00Z', MAINTENANT)).toBe('il y a 1 jour');
    expect(depuis('2026-09-20T12:00:00Z', MAINTENANT)).toBe('il y a 3 jours');
    expect(depuis('2026-06-25T12:00:00Z', MAINTENANT)).toBe('il y a 3 mois'); // 90 jours pleins
  });

  it('ne produit JAMAIS une ancienneté négative (horloges désaccordées)', () => {
    expect(depuis('2026-09-23T14:00:00Z', MAINTENANT)).toBe('à l’instant');
  });

  it('tolère l’absence et l’illisible plutôt que de jeter', () => {
    expect(depuis(null, MAINTENANT)).toBe('—');
    expect(depuis('pas une date', MAINTENANT)).toBe('—');
    expect(formaterDateFr(null)).toBe('—');
    expect(formaterDateFr('pas une date')).toBe('—');
  });
});

describe('bandeau d’état — un outil qui dit depuis quand il n’a pas regardé', () => {
  it('relève JAMAIS lancée : le dit franchement, sans laisser croire au calme', () => {
    const m = messageReleve({ derniereReleveLe: null, messagesCaptures: 0, messagesExclus: 0 }, MAINTENANT);
    expect(m).toContain('n’a encore jamais tourné');
    expect(m).not.toContain('Dernière relève');
  });

  it('relève passée sans rien trouver : distinguée de la précédente', () => {
    const m = messageReleve({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 0, messagesExclus: 0 }, MAINTENANT);
    expect(m).toContain('Dernière relève');
    expect(m).toContain('il y a 1 h');
    expect(m).toContain('aucun message');
  });

  it('annonce les messages tenus hors de la file, et rappelle qu’ils ne sont pas supprimés', () => {
    const m = messageReleve({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 120, messagesExclus: 87 }, MAINTENANT);
    expect(m).toContain('120 messages capturés');
    expect(m).toContain('87 tenus hors de la file');
    expect(m).toContain('jamais supprimés');
  });

  it('accorde le singulier (un seul message, un seul écarté)', () => {
    const m = messageReleve({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 1, messagesExclus: 1 }, MAINTENANT);
    expect(m).toContain('1 message capturé');
    expect(m).toContain('1 tenu hors de la file');
    expect(m).toContain('(jamais supprimé).');
  });

  it('ne parle pas des exclus quand il n’y en a aucun (une précision inutile est du bruit)', () => {
    const m = messageReleve({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 12, messagesExclus: 0 }, MAINTENANT);
    expect(m).not.toContain('hors de la file');
  });
});

describe('file vide — quatre situations, quatre phrases', () => {
  it('① la relève n’a pas tourné → l’écran dit qu’il est aveugle', () => {
    expect(messageFileVide({ derniereReleveLe: null, messagesCaptures: 0, messagesExclus: 0 }))
      .toContain('n’a pas encore été lancée');
  });

  it('② elle a tourné sans rien capturer', () => {
    expect(messageFileVide({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 0, messagesExclus: 0 }))
      .toContain('n’a capturé aucun message');
  });

  it('③ tout est tenu hors de la file → on le dit, et on dit que c’est réversible', () => {
    const m = messageFileVide({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 40, messagesExclus: 40 });
    expect(m).toContain('tous tenus hors de la file');
    expect(m).toContain('éteindre une règle les fait revenir');
  });

  it('④ tout a été classé → c’est le seul cas où la file vide est une bonne nouvelle', () => {
    expect(messageFileVide({ derniereReleveLe: '2026-09-23T11:00:00Z', messagesCaptures: 40, messagesExclus: 3 }))
      .toContain('déjà été affectés');
  });

  it('les quatre phrases sont DISTINCTES (sinon la distinction ne servirait à rien)', () => {
    const cas = [
      { derniereReleveLe: null, messagesCaptures: 0, messagesExclus: 0 },
      { derniereReleveLe: 'x', messagesCaptures: 0, messagesExclus: 0 },
      { derniereReleveLe: 'x', messagesCaptures: 40, messagesExclus: 40 },
      { derniereReleveLe: 'x', messagesCaptures: 40, messagesExclus: 3 },
    ];
    expect(new Set(cas.map(messageFileVide)).size).toBe(4);
  });
});

describe('le reste de la prose', () => {
  it('la colonne des cartes vide décrit le GESTE, jamais un numéro de lot', () => {
    const m = messageEvenementsVide();
    expect(m).toContain('Aucun événement');
    expect(m).not.toMatch(/lot\s*\d/i);
  });

  it('la troncature n’est annoncée que si elle a lieu', () => {
    expect(mentionTroncature(50, 213)).toBe('50 affichés sur 213');
    expect(mentionTroncature(12, 12)).toBeNull();
    expect(mentionTroncature(0, 0)).toBeNull();
  });

  it('les trois états d’un événement ont un libellé français', () => {
    expect(libelleEtat('a_traiter')).toBe('À traiter');
    expect(libelleEtat('en_cours')).toBe('En cours');
    expect(libelleEtat('traite')).toBe('Traité');
  });
});

describe('échec de lecture — un refus n’est pas une panne', () => {
  it('distingue le droit manquant, la session expirée, la base et le réseau', () => {
    expect(messageErreurHttp(403)).toContain('n’a pas le droit');
    expect(messageErreurHttp(401)).toContain('Session expirée');
    expect(messageErreurHttp(503)).toContain('base n’a pas répondu');
    expect(messageErreurHttp(0)).toContain('réseau indisponible');
    expect(messageErreurHttp(500)).toContain('La lecture a échoué');
  });

  it('les cinq messages sont DISTINCTS (sinon la distinction ne servirait à rien)', () => {
    expect(new Set([403, 401, 503, 0, 500].map(messageErreurHttp)).size).toBe(5);
  });
});
