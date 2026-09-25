import { describe, it, expect } from 'vitest';
import { analyserBlocEntetes, CHAMPS_DESTINATAIRES } from './entetes';

/**
 * LOT 5-DEST — LIRE UN BLOC D'EN-TÊTES BRUT.
 *
 * Le cas qui compte vraiment est le REPLIEMENT : une liste de vingt destinataires arrive presque toujours coupée sur
 * plusieurs lignes. Lire ligne à ligne sans recoller ferait perdre dix-neuf adresses sur vingt — sans la moindre
 * erreur, en croyant avoir lu. C'est exactement le genre de trou que ce lot est censé COMBLER, pas creuser.
 */
describe('analyserBlocEntetes', () => {
  it('lit les quatre en-têtes et minuscule leur nom', () => {
    const e = analyserBlocEntetes([
      'To: Jean <jean@exemple.fr>',
      'CC: Marie <marie@exemple.fr>',
      'Bcc: cache@exemple.fr',
      'Reply-To: repondre@exemple.fr',
    ].join('\r\n'));
    expect(e.to).toBe('Jean <jean@exemple.fr>');
    expect(e.cc).toBe('Marie <marie@exemple.fr>');
    expect(e.bcc).toBe('cache@exemple.fr');
    expect(e['reply-to']).toBe('repondre@exemple.fr');
  });

  it('RECOLLE une ligne repliée — le cas d’une longue liste de destinataires', () => {
    const e = analyserBlocEntetes('To: un@exemple.fr,\r\n deux@exemple.fr,\r\n\ttrois@exemple.fr\r\n');
    expect(e.to).toBe('un@exemple.fr, deux@exemple.fr, trois@exemple.fr');
  });

  it('un en-tête ABSENT n’apparaît pas — et ne vaut surtout pas une chaîne vide inventée', () => {
    const e = analyserBlocEntetes('To: seul@exemple.fr\r\n');
    expect(e.to).toBe('seul@exemple.fr');
    expect(Object.keys(e)).toEqual(['to']);
  });

  it('un en-tête présent mais VIDE est rendu vide (« on a regardé, il n’y avait personne »)', () => {
    const e = analyserBlocEntetes('To: a@exemple.fr\r\nCc:\r\n');
    expect(e.cc).toBe('');
  });

  it('deux lignes de même nom : la DERNIÈRE gagne, comme dans la capture ordinaire', () => {
    const e = analyserBlocEntetes('To: premier@exemple.fr\r\nTo: second@exemple.fr\r\n');
    expect(e.to).toBe('second@exemple.fr');
  });

  it('une ligne sans deux-points est ignorée, elle ne fabrique pas d’en-tête', () => {
    const e = analyserBlocEntetes('n’importe quoi\r\nTo: a@exemple.fr\r\n');
    expect(e.to).toBe('a@exemple.fr');
    expect(Object.keys(e)).toEqual(['to']);
  });

  it('les sauts de ligne en LF seul (sans CR) sont lus comme les autres', () => {
    const e = analyserBlocEntetes('To: a@exemple.fr\nCc: b@exemple.fr\n');
    expect(e.cc).toBe('b@exemple.fr');
  });

  it('un bloc vide ne rend rien, et ne jette pas', () => {
    expect(analyserBlocEntetes('')).toEqual({});
  });

  it('on ne demande QUE quatre en-têtes — jamais le corps, jamais une pièce', () => {
    expect([...CHAMPS_DESTINATAIRES]).toEqual(['to', 'cc', 'bcc', 'reply-to']);
  });
});
