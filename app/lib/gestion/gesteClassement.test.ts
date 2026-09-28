import { describe, it, expect } from 'vitest';
import { mailsVises, planClassement, resumeClassement } from './gesteClassement';

/**
 * LOT STATUT-PAR-MAIL — CE QUE « VALIDER LE CLASSEMENT » FAIT. Module PUR : on rejoue ici la conversation d'Arno
 * (fil 803) et les cas tordus sans écran, sans base et sans rien écrire.
 */
describe('🔴 LOT STATUT-PAR-MAIL — la portée du classement', () => {
  it('« Ce mail uniquement » ne vise QUE le mail ouvert, même si la conversation en compte trois', () => {
    expect(mailsVises(2896, 'mail', [2896, 2830, 1449])).toEqual([2896]);
  });

  it('« Toute la conversation » vise les mails SANS classement manuel, le mail ouvert compris', () => {
    // Le fil 803 d'Arno : trois mails, aucun classé à la main.
    expect(mailsVises(2896, 'conversation', [2896, 2830, 1449])).toEqual([1449, 2830, 2896]);
  });

  it('« Toute la conversation » n’ajoute PAS deux fois le mail ouvert', () => {
    expect(mailsVises(10, 'conversation', [10, 11])).toEqual([10, 11]);
  });

  it('un mail déjà classé à la main par quelqu’un d’autre reste HORS de la portée élargie', () => {
    // 2830 a un classement manuel : il n'est pas dans `mailsSansManuel`, donc on ne le touche pas.
    expect(mailsVises(2896, 'conversation', [2896, 1449])).toEqual([1449, 2896]);
  });
});

describe('🔴 LOT STATUT-PAR-MAIL — le plan de validation', () => {
  it('pose le bien recommandé sur le seul mail ouvert (portée par défaut)', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896, 2830, 1449],
      selection: ['445'], existants: [],
    });
    expect(p.messages).toEqual([2896]);
    expect(p.aPoser).toEqual([{ messageId: 2896, cle: '445' }]);
    expect(p.aRetirer).toEqual([]);
    expect(p.resume).toBe('1 mail classé sur 1 bien.');
  });

  it('portée conversation : pose le MÊME bien sur les trois mails, et le DIT (« 3 mails classés »)', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830, 1449],
      selection: ['445'], existants: [],
    });
    expect(p.aPoser).toEqual([
      { messageId: 1449, cle: '445' }, { messageId: 2830, cle: '445' }, { messageId: 2896, cle: '445' },
    ]);
    expect(p.resume).toContain('3 mails classés');
  });

  it('🔴 PLUSIEURS BIENS DU MÊME PROPRIÉTAIRE : un mail peut parler de deux appartements', () => {
    const p = planClassement({
      messageId: 700, portee: 'mail', mailsSansManuel: [700],
      selection: ['445', '446', '512'], existants: [],
    });
    expect(p.aPoser).toEqual([
      { messageId: 700, cle: '445' }, { messageId: 700, cle: '446' }, { messageId: 700, cle: '512' },
    ]);
    expect(p.resume).toBe('1 mail classé sur 3 biens.');
  });

  it('plusieurs biens ET toute la conversation : le produit complet, sans doublon', () => {
    const p = planClassement({
      messageId: 10, portee: 'conversation', mailsSansManuel: [10, 11],
      selection: ['A', 'B'], existants: [],
    });
    expect(p.aPoser).toHaveLength(4);
    expect(p.resume).toBe('2 mails classés sur 2 biens.');
  });

  it('ne repose PAS un rattachement déjà confirmé : le journal ne doit pas se remplir de bruit', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830, 1449],
      selection: ['445'],
      existants: [{ id: 9001, messageId: 2896, cle: '445' }, { id: 9002, messageId: 1449, cle: '445' }],
    });
    expect(p.aPoser).toEqual([{ messageId: 2830, cle: '445' }]);
    expect(p.aRetirer).toEqual([]);
  });

  it('un bien DÉCOCHÉ passe au statut « retiré » — et seulement sur le mail ouvert', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830, 1449],
      selection: [],
      existants: [
        { id: 9001, messageId: 2896, cle: '445' },
        // 🔴 Ceux-là ne doivent PAS bouger : la fenêtre ne les a pas montrés.
        { id: 9002, messageId: 1449, cle: '445' },
        { id: 9003, messageId: 2830, cle: '445' },
      ],
    });
    expect(p.aRetirer).toEqual([9001]);
    expect(p.aPoser).toEqual([]);
    expect(p.resume).toBe('1 rattachement retiré.');
  });

  it('remplacer un bien par un autre : on pose le nouveau et on retire l’ancien, jamais on n’efface', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896],
      selection: ['446'], existants: [{ id: 9001, messageId: 2896, cle: '445' }],
    });
    expect(p.aPoser).toEqual([{ messageId: 2896, cle: '446' }]);
    expect(p.aRetirer).toEqual([9001]);
    expect(p.resume).toBe('1 mail classé sur 1 bien, 1 rattachement retiré.');
  });

  it('une clé vide ou blanche est ignorée : on ne rattache pas à « rien »', () => {
    const p = planClassement({
      messageId: 5, portee: 'mail', mailsSansManuel: [5], selection: ['', '  ', 'X'], existants: [],
    });
    expect(p.aPoser).toEqual([{ messageId: 5, cle: 'X' }]);
  });

  it('la même clé cochée deux fois ne pose qu’un rattachement', () => {
    const p = planClassement({
      messageId: 5, portee: 'mail', mailsSansManuel: [5], selection: ['X', 'X'], existants: [],
    });
    expect(p.aPoser).toEqual([{ messageId: 5, cle: 'X' }]);
  });
});

describe('🔴 LOT STATUT-PAR-MAIL — la phrase du résumé', () => {
  it('accorde le pluriel des deux côtés', () => {
    expect(resumeClassement(1, 1, 0)).toBe('1 mail classé sur 1 bien.');
    expect(resumeClassement(3, 2, 0)).toBe('3 mails classés sur 2 biens.');
  });

  it('dit clairement qu’il n’y a rien à faire plutôt que de rendre une phrase vide', () => {
    expect(resumeClassement(3, 0, 0)).toBe('Aucun bien sélectionné : rien ne sera classé.');
  });

  it('cumule classement et retrait dans une seule phrase lisible', () => {
    expect(resumeClassement(2, 1, 2)).toBe('2 mails classés sur 1 bien, 2 rattachements retirés.');
  });
});
