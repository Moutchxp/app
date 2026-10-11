import { describe, it, expect } from 'vitest';
import { classementsDuRepere, colonnesAvantApres, ligneDuBien, titreApres, TITRE_AVANT, MENTION_RECALCULE } from './avantApres';
import type { Classement } from './periodesConversation';

/** 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — les deux colonnes, sans écran. */
const A = { cle: '219', libelle: '25 rue Edith Cavell — lot 219' };
const B = { cle: '24', libelle: '15 rue Carle Hebert — lot 24' };

describe('les colonnes', () => {
  it('🔴 à droite : gardés, puis ajoutés (« + »), puis retirés (barrés)', () => {
    const c = colonnesAvantApres({ avant: { sorte: 'biens', biens: [A] }, apres: { sorte: 'biens', biens: [B] } });
    expect(c.avant.biens).toEqual([{ ...A, etat: null }]);
    expect(c.apres.biens).toEqual([{ ...B, etat: 'ajoute' }, { ...A, etat: 'retire' }]);
    expect(c.avant.statut).toBe('Classé');
  });
  it('les parties, avec leur rôle', () => {
    const avant: Classement = { sorte: 'biens', biens: [A], personnes: [{ sorte: 'locataire', cle: 'L', libelle: 'Nevine Abdellatif' }] };
    expect(colonnesAvantApres({ avant, apres: { sorte: 'biens', biens: [A] } }).avant.parties).toEqual(['Nevine Abdellatif (locataire)']);
  });
  it('Interne, aucun suivi, marque d’échange', () => {
    expect(colonnesAvantApres({ avant: null, apres: { sorte: 'interne', biens: [] } }).apres.statut).toBe('Interne');
    expect(colonnesAvantApres({ avant: null, apres: { sorte: 'interne', biens: [] } }).avant.statut).toBe('À classer — aucun suivi de conversation');
    expect(colonnesAvantApres({ avant: null, interneEchangeAvant: true, apres: { sorte: 'biens', biens: [A] } }).avant.statut).toBe('Interne');
  });
  it('les mots', () => {
    expect(TITRE_AVANT).toBe('AVANT — suivi de fond');
    expect(titreApres('ce mail uniquement')).toBe('APRÈS — ce mail uniquement');
    expect(titreApres('à partir de ce mail')).toBe('APRÈS — à partir de ce mail');
    expect(MENTION_RECALCULE).toBe('(recalculé aujourd’hui)');
  });
  it('une ligne par bien : adresse, CP ville, lot', () => {
    expect(ligneDuBien({ cle: '219', adresse: '25 rue Edith Cavell', codePostal: '92400', commune: 'COURBEVOIE' }))
      .toBe('25 rue Edith Cavell, 92400 COURBEVOIE — lot 219');
    expect(ligneDuBien({ cle: '9', adresse: null, codePostal: null, commune: null })).toBe('lot 9');
  });
});

describe('l’avant et l’après d’une période « la suite »', () => {
  it('l’avant est la fenêtre qui couvrait le mail précédent', () => {
    const periodes = [
      { id: 1, depuisMessageId: 1, classement: { sorte: 'biens' as const, biens: [A] } },
      { id: 2, depuisMessageId: 3, classement: { sorte: 'biens' as const, biens: [B] } },
    ];
    expect(classementsDuRepere({ mails: [1, 2, 3], periodes, periodeId: 2 })).toEqual({ avant: periodes[0].classement, apres: periodes[1].classement });
    expect(classementsDuRepere({ mails: [1, 2, 3], periodes, periodeId: 1 })?.avant).toBeNull();
    expect(classementsDuRepere({ mails: [1, 2, 3], periodes, periodeId: 9 })).toBeNull();
  });
});
