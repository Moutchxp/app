import { describe, it, expect } from 'vitest';
import { mailsVises, planClassement, resumeClassement, resumeHorsGestion } from './gesteClassement';

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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT STATUT-HORS-GESTION — MARQUER, ANNULER, ET LA PORTÉE DES DEUX
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 LOT STATUT-HORS-GESTION — marquer « ce mail ne concerne aucun bien »', () => {
  it('marque le seul mail ouvert (portée par défaut), et le dit', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896, 2830, 1449],
      selection: [], existants: [], horsGestion: { geste: 'marquer', motif: 'prospection' },
    });
    expect(p.aMarquerHorsGestion).toEqual([2896]);
    expect(p.aPoser).toEqual([]);
    expect(p.motifHorsGestion).toBe('prospection');
    expect(p.resume).toBe('1 mail marqué « hors gestion » (prospection).');
  });

  it('portée conversation : marque les trois mails sans classement posé à la main', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830, 1449],
      selection: [], existants: [], horsGestion: { geste: 'marquer' },
    });
    expect(p.aMarquerHorsGestion).toEqual([1449, 2830, 2896]);
    expect(p.resume).toBe('3 mails marqués « hors gestion ».');
  });

  it('le motif est FACULTATIF : sans lui, la phrase ne l’invente pas', () => {
    const p = planClassement({
      messageId: 5, portee: 'mail', mailsSansManuel: [5], selection: [], existants: [],
      horsGestion: { geste: 'marquer', motif: null },
    });
    expect(p.motifHorsGestion).toBeNull();
    expect(p.resume).not.toContain('(');
  });

  it('🔴 les biens cochés sont IGNORÉS : « aucun bien » et « ce bien » ne peuvent pas être vrais ensemble', () => {
    const p = planClassement({
      messageId: 5, portee: 'mail', mailsSansManuel: [5], selection: ['445', '446'], existants: [],
      horsGestion: { geste: 'marquer' },
    });
    expect(p.aPoser).toEqual([]);
  });

  it('🔴 les rattachements du mail ouvert passent au statut « retiré » — jamais supprimés', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 1449],
      selection: [], existants: [
        { id: 9001, messageId: 2896, cle: '445' },
        // Celui d'un AUTRE mail ne bouge pas : la fenêtre ne l'a pas montré.
        { id: 9002, messageId: 1449, cle: '445' },
      ],
      horsGestion: { geste: 'marquer' },
    });
    expect(p.aRetirer).toEqual([9001]);
    expect(p.resume).toContain('1 rattachement retiré');
  });

  it('ne remarque PAS un mail déjà marqué : le compte ne doit pas annoncer un geste qui n’aura pas lieu', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830],
      selection: [], existants: [], horsGestion: { geste: 'marquer' }, dejaHorsGestion: [2896],
    });
    expect(p.aMarquerHorsGestion).toEqual([2830]);
    expect(p.resume).toBe('1 mail marqué « hors gestion ».');
  });

  it('tout est déjà marqué ⇒ on le DIT, plutôt que de laisser croire qu’on vient d’agir', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896],
      selection: [], existants: [], horsGestion: { geste: 'marquer' }, dejaHorsGestion: [2896],
    });
    expect(p.aMarquerHorsGestion).toEqual([]);
    expect(p.resume).toContain('déjà marqués');
  });
});

describe('🔴 LOT STATUT-HORS-GESTION — la marque est RÉVERSIBLE, de deux façons', () => {
  it('① « Annuler hors gestion » la retire, et rien d’autre ne bouge', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896],
      selection: [], existants: [{ id: 9001, messageId: 2896, cle: '445' }],
      horsGestion: { geste: 'annuler' }, dejaHorsGestion: [2896],
    });
    expect(p.aAnnulerHorsGestion).toEqual([2896]);
    expect(p.aPoser).toEqual([]);
    // 🔴 ON NE RETIRE RIEN EN ANNULANT : revenir dans la file ne doit pas défaire un rattachement.
    expect(p.aRetirer).toEqual([]);
    expect(p.resume).toContain('plus « hors gestion »');
  });

  it('l’annulation suit la portée : toute la conversation, mais seulement les mails RÉELLEMENT marqués', () => {
    const p = planClassement({
      messageId: 2896, portee: 'conversation', mailsSansManuel: [2896, 2830, 1449],
      selection: [], existants: [], horsGestion: { geste: 'annuler' }, dejaHorsGestion: [2896, 1449],
    });
    expect(p.aAnnulerHorsGestion).toEqual([1449, 2896]);
    expect(p.resume).toContain('2 mails');
  });

  it('annuler ce qui n’est pas marqué ne fait rien, et le dit', () => {
    const p = planClassement({
      messageId: 5, portee: 'mail', mailsSansManuel: [5], selection: [], existants: [],
      horsGestion: { geste: 'annuler' }, dejaHorsGestion: [],
    });
    expect(p.aAnnulerHorsGestion).toEqual([]);
    expect(p.resume).toContain('rien à annuler');
  });

  it('② RATTACHER UN BIEN lève la marque — la réversibilité par le geste naturel, annoncée avant', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896],
      selection: ['445'], existants: [], dejaHorsGestion: [2896],
    });
    expect(p.aPoser).toEqual([{ messageId: 2896, cle: '445' }]);
    expect(p.aAnnulerHorsGestion).toEqual([2896]);
    expect(p.resume).toContain('marque « hors gestion » levée');
  });

  it('…mais ne lève rien quand on ne coche AUCUN bien : décocher n’est pas rattacher', () => {
    const p = planClassement({
      messageId: 2896, portee: 'mail', mailsSansManuel: [2896],
      selection: [], existants: [{ id: 9001, messageId: 2896, cle: '445' }], dejaHorsGestion: [2896],
    });
    expect(p.aAnnulerHorsGestion).toEqual([]);
  });

  it('la levée suit la portée, et ne compte que les mails réellement marqués', () => {
    const p = planClassement({
      messageId: 10, portee: 'conversation', mailsSansManuel: [10, 11, 12],
      selection: ['A'], existants: [], dejaHorsGestion: [11],
    });
    expect(p.aAnnulerHorsGestion).toEqual([11]);
    expect(p.resume).toContain('marque « hors gestion » levée');
  });
});

describe('🔴 LOT STATUT-HORS-GESTION — la phrase du résumé', () => {
  it('accorde le pluriel, et nomme le motif quand il y en a un', () => {
    expect(resumeHorsGestion('marquer', 1, null)).toBe('1 mail marqué « hors gestion ».');
    expect(resumeHorsGestion('marquer', 4, 'interne')).toBe('4 mails marqués « hors gestion » (interne).');
  });

  it('dit le retour dans la file avec le bon verbe', () => {
    expect(resumeHorsGestion('annuler', 1, null)).toContain('il revient dans la file');
    expect(resumeHorsGestion('annuler', 3, null)).toContain('ils reviennent dans la file');
  });
});
