import { describe, expect, it } from 'vitest';
import { boutonsOuvreurs, ouvreurDe, texteOuvertPar, texteOuvertureFrise } from './ouvreurEvenement';

/** 🔴🔴 Arno (27/11/2026, 09h48) — « taguer l'ouverture de nouveaux événements avec le nom de l'utilisateur qui l'a ouvert ou initié ». */
describe('qui a ouvert l’événement : la règle commune', () => {
  it('un compte retrouvé : « Prénom NOM » (règle de d1d501cd), clé par son n°', () => {
    expect(ouvreurDe({ id: 2, libelle: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' })).toEqual({ sorte: 'utilisateur', cle: 'u2', nom: 'Arnaud JOREL' });
    expect(ouvreurDe({ id: '7', libelle: null, prenom: 'claire', nom: 'test' })).toEqual({ sorte: 'utilisateur', cle: 'u7', nom: 'claire TEST' });
  });
  it('aucun compte retrouvé : l’adresse mail (ou le libellé écrit) en dernier recours', () => {
    expect(ouvreurDe({ id: null, libelle: 'jean@exemple.test', prenom: null, nom: null })).toEqual({ sorte: 'utilisateur', cle: 'l:jean@exemple.test', nom: 'jean@exemple.test' });
    expect(ouvreurDe({ id: 9, libelle: 'ancien@exemple.test', prenom: null, nom: null })).toEqual({ sorte: 'utilisateur', cle: 'u9', nom: 'ancien@exemple.test' });
  });
  it('sans compte et par un automate (relève, script, reprise) : « automatique » — un compte, lui, n’est jamais un automate', () => {
    for (const l of ['relève automatique', 'Releve', 'script reaffecter', 'reprise reparer-ouvertures', 'automatique']) {
      expect(ouvreurDe({ id: null, libelle: l, prenom: null, nom: null })).toEqual({ sorte: 'automatique', cle: 'auto' });
    }
    expect(ouvreurDe({ id: 3, libelle: 'script', prenom: 'Paul', nom: 'Martin' }).sorte).toBe('utilisateur');
  });
  it('ni compte ni libellé utilisable : « non renseigné » — rien n’est inventé', () => {
    for (const l of [null, '', '   ', 'inconnu', 'Inconnu']) expect(ouvreurDe({ id: null, libelle: l, prenom: null, nom: null })).toEqual({ sorte: 'non_renseigne', cle: 'nr' });
  });
  it('les mots : en-tête / liste, sous la carte Ouverture', () => {
    const u = { sorte: 'utilisateur' as const, cle: 'u2', nom: 'Arnaud JOREL' };
    expect([texteOuvertPar(u), texteOuvertPar({ sorte: 'automatique', cle: 'auto' }), texteOuvertPar({ sorte: 'non_renseigne', cle: 'nr' }), texteOuvertPar(undefined)])
      .toEqual(['ouvert par Arnaud JOREL', 'ouvert automatiquement', 'ouvert par : non renseigné', 'ouvert par : non renseigné']);
    expect([texteOuvertureFrise(u, '23/09/2026'), texteOuvertureFrise({ sorte: 'automatique', cle: 'auto' }, '23/09/2026'), texteOuvertureFrise(null, '23/09/2026')])
      .toEqual(['Ouvert par Arnaud JOREL le 23/09/2026', 'Ouvert automatiquement le 23/09/2026', 'Ouvert le 23/09/2026 — par : non renseigné']);
  });
  it('les boutons du filtre : un par utilisateur (par nom, avec son nombre) — 🔴 (27/11, 11h01) plus d’Automatique ni de Non renseigné', () => {
    const a = { sorte: 'utilisateur' as const, cle: 'u2', nom: 'Arnaud JOREL' };
    const c = { sorte: 'utilisateur' as const, cle: 'u7', nom: 'Claire TEST' };
    expect(boutonsOuvreurs([c, a, a, { sorte: 'automatique', cle: 'auto' }, null])).toEqual([
      { cle: 'ouvert:u2', mot: 'Arnaud JOREL', n: 2 }, { cle: 'ouvert:u7', mot: 'Claire TEST', n: 1 }]);
  });
});
