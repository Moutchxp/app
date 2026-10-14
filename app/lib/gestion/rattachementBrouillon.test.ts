import { describe, expect, it } from 'vitest';
import {
  clesDuFond, decisionRattachement, fondDuMail, fondDuProchainMail, rattachementRecu, rattachementVide,
} from './rattachementBrouillon';
import type { Classement, Periode } from './periodesConversation';

/**
 * 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — la décision de la fenêtre pour un mail écrit dans le composeur : la même que
 * « Modifier le rattachement » (premier rattachement, modification, position par défaut, « Origine » n'écrit rien).
 */
const biens = (...cles: string[]): Classement => ({ sorte: 'biens', biens: cles.map((cle) => ({ cle, libelle: `bien ${cle}` })) });
const periode = (id: number, depuis: number, c: Classement): Periode => ({ id, depuisMessageId: depuis, classement: c });

describe('le suivi de fond du prochain mail', () => {
  it('la dernière période vivante, jamais une exception', () => {
    const p = [periode(1, 10, biens('A')), periode(2, 30, biens('B'))];
    expect(clesDuFond(fondDuProchainMail([10, 20, 30], p))).toEqual(['B']);
    expect(fondDuProchainMail([10, 20], [])).toBeNull();
  });
  it('côté serveur, le mail capturé lit la même projection', () => {
    const p = [periode(1, 10, biens('A'))];
    expect(clesDuFond(fondDuMail([10, 20, 99], p, [], 99))).toEqual(['A']);
  });
});

describe('🔴 la décision, position par position', () => {
  it('nouveau message (aucun suivi) : premier rattachement, défaut « Ce mail + futurs échanges »', () => {
    const d = decisionRattachement({ fond: null, biens: [{ cle: '27', libelle: 'Union' }], rattachement: null });
    expect(d.premier).toBe(true);
    expect(d.position).toBe('suite');
    expect(d.ecriture?.choix).toBe('suite');
    expect(d.ecriture?.classement.biens).toEqual([{ cle: '27', libelle: 'Union' }]);
  });
  it('premier rattachement sans bien : rien à écrire (« Sélectionner minimum un bien »)', () => {
    expect(decisionRattachement({ fond: null, biens: [], rattachement: null }).ecriture).toBeNull();
  });
  it('« Origine » interdite au premier rattachement : elle se lit « suite »', () => {
    const d = decisionRattachement({ fond: null, biens: [{ cle: '1', libelle: 'x' }], rattachement: { position: 'origine', retires: [] } });
    expect(d.position).toBe('suite');
  });
  it('réponse sans changement : Origine, rien d’écrit (le mail héritera du suivi de fond)', () => {
    const d = decisionRattachement({ fond: biens('A'), biens: [{ cle: 'A', libelle: 'bien A' }], rattachement: null });
    expect(d.modification).toBe(false);
    expect(d.position).toBe('origine');
    expect(d.ecriture).toBeNull();
  });
  it('réponse avec un bien ajouté : One shot par défaut, le suivi de fond gardé', () => {
    const d = decisionRattachement({ fond: biens('A'), biens: [{ cle: 'B', libelle: 'bien B' }], rattachement: null });
    expect(d.position).toBe('one_shot');
    expect(d.ecriture?.choix).toBe('mail');
    expect(d.voulus.map((b) => b.cle)).toEqual(['A', 'B']);
  });
  it('bien du suivi de fond décoché : retiré de ce mail', () => {
    const d = decisionRattachement({ fond: biens('A', 'B'), biens: [], rattachement: { position: null, retires: ['B'] } });
    expect(d.voulus.map((b) => b.cle)).toEqual(['A']);
    expect(d.ecriture?.choix).toBe('mail');
  });
  it('décoché gagne, même s’il est aussi parmi les biens choisis', () => {
    const d = decisionRattachement({ fond: biens('A'), biens: [{ cle: 'A', libelle: 'bien A' }], rattachement: { position: null, retires: ['A'] } });
    expect(d.voulus).toEqual([]);
  });
  it('position choisie à la main : « suite » et « conversation » passent telles quelles', () => {
    for (const p of ['suite', 'conversation'] as const) {
      const d = decisionRattachement({ fond: biens('A'), biens: [{ cle: 'B', libelle: 'b' }], rattachement: { position: p, retires: [] } });
      expect(d.ecriture?.choix).toBe(p);
    }
  });
  it('« Origine » choisie avec des modifications : rien n’est écrit', () => {
    const d = decisionRattachement({ fond: biens('A'), biens: [{ cle: 'B', libelle: 'b' }], rattachement: { position: 'origine', retires: [] } });
    expect(d.position).toBe('one_shot');
  });
  it('les personnes du suivi de fond sont reposées telles quelles', () => {
    const fond: Classement = { ...biens('A'), personnes: [{ sorte: 'proprietaire', id: 45, libelle: 'JOREL' } as never] };
    const d = decisionRattachement({ fond, biens: [{ cle: 'B', libelle: 'b' }], rattachement: null });
    expect(d.ecriture?.classement.personnes).toHaveLength(1);
  });
});

describe('ce qui arrive du navigateur', () => {
  it('rendu sûr', () => {
    expect(rattachementRecu({ position: 'suite', retires: ['A', 'A', 3, ''] })).toEqual({ position: 'suite', retires: ['A'] });
    expect(rattachementRecu({ position: 'n’importe' })).toEqual({ position: null, retires: [] });
    expect(rattachementRecu('x')).toBeNull();
    expect(rattachementVide({ position: null, retires: [] })).toBe(true);
    expect(rattachementVide({ position: 'one_shot', retires: [] })).toBe(false);
  });
});

import { titreBlocPropositions } from './porteeSuivi';
describe('🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE — le titre du bloc, PUR', () => {
  it('« Propositions » sans ajout, puis la portée', () => {
    expect(titreBlocPropositions(false, 'suite')).toBe('Propositions');
    expect(titreBlocPropositions(true, 'one_shot')).toBe('Bien(s) ajouté(s) en one shot');
    expect(titreBlocPropositions(true, 'suite')).toBe('Bien(s) ajouté(s) en suivi de fond');
    expect(titreBlocPropositions(true, 'conversation')).toBe('Bien(s) ajouté(s) pour toute la conversation');
    expect(titreBlocPropositions(true, 'origine')).toBe('Bien(s) ajouté(s)');
  });
});
