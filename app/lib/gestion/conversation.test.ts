import { describe, it, expect } from 'vitest';
import {
  etatCorps, libelleAdresse, lignesDestinataires, mentionHorsFile, messagesDeplies, MENTION_HTML_SEUL,
} from './conversation';
import type { MessageDeFil } from './carteRepo';

/**
 * LOT 5b — LES DÉCISIONS D'AFFICHAGE D'UNE CONVERSATION. Trois d'entre elles peuvent faire mentir l'écran, et ce sont
 * celles qui sont éprouvées ici :
 *   ① croire qu'un message est VIDE alors que son corps n'a simplement pas encore été demandé ;
 *   ② laisser croire qu'on connaît les destinataires quand on ne les a jamais analysés ;
 *   ③ montrer un message tenu hors de la file sans dire qu'il l'est — ou pire, le cacher.
 */

const msg = (o: Partial<MessageDeFil> = {}): MessageDeFil => ({
  messageId: 1, sens: 'recu', de: 'martin@orange.fr', deNom: 'Mme Martin',
  recuLe: '2026-09-20T08:00:00Z', objet: 'Chauffage', corps: null, extrait: null,
  automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null,
  destA: null, destCc: null, destinatairesFondus: null, htmlSeul: false,
  ...o,
});

describe('① qui est déplié à l’ouverture', () => {
  it('le DERNIER message, et lui seul — c’est ce qu’on vient lire', () => {
    const d = messagesDeplies([msg({ messageId: 1 }), msg({ messageId: 2 }), msg({ messageId: 3 })]);
    expect([...d]).toEqual([3]);
  });

  it('🔴 jamais un message tenu HORS DE LA FILE, même s’il est le dernier', () => {
    // Le cas réel : un accusé automatique clôt la conversation. Déplier « votre demande a bien été reçue » à la place
    //   de la vraie dernière réponse serait un contresens — il reste visible, simplement pas mis en avant.
    const d = messagesDeplies([msg({ messageId: 1 }), msg({ messageId: 2 }), msg({ messageId: 3, horsFile: true })]);
    expect([...d]).toEqual([2]);
  });

  it('un fil qui ne contient QUE du courrier automatique n’ouvre rien d’office, sans planter', () => {
    expect([...messagesDeplies([msg({ messageId: 1, horsFile: true })])]).toEqual([]);
    expect([...messagesDeplies([])]).toEqual([]);
  });
});

describe('② les destinataires — savoir, et savoir qu’on ne sait pas', () => {
  it('CONNUS (migration 235) : À et Cc sont séparés, et dits comme tels', () => {
    const l = lignesDestinataires(msg({
      destA: [{ nom: 'Jean', adresse: 'j@d.fr' }],
      destCc: [{ nom: null, adresse: 'compta@adhoc.fr' }],
    }));
    expect(l).toEqual([
      { champ: 'À', valeur: 'Jean <j@d.fr>', approximatif: false },
      { champ: 'Cc', valeur: 'compta@adhoc.fr', approximatif: false },
    ]);
  });

  it('🔴 JAMAIS ANALYSÉS (les 27 833 messages d’avant) : la liste fondue, et on PRÉVIENT', () => {
    const l = lignesDestinataires(msg({ destA: null, destCc: null, destinatairesFondus: 'gestion@criterimmo.fr, x@y.fr' }));
    expect(l).toEqual([{ champ: null, valeur: 'gestion@criterimmo.fr, x@y.fr', approximatif: true }]);
  });

  it('ni détail, ni liste fondue → on le dit encore, plutôt qu’une ligne vide qui ressemblerait à un oubli', () => {
    expect(lignesDestinataires(msg())).toEqual([{ champ: null, valeur: 'destinataires inconnus', approximatif: true }]);
  });

  it('analysé ET vide (remise en copie cachée seule) n’est PAS « inconnu » : la nuance est gardée', () => {
    const l = lignesDestinataires(msg({ destA: [], destCc: [] }));
    expect(l).toEqual([{ champ: 'À', valeur: 'aucun destinataire visible', approximatif: false }]);
  });

  it('sans Cc, aucune ligne Cc n’est inventée', () => {
    const l = lignesDestinataires(msg({ destA: [{ nom: null, adresse: 'j@d.fr' }], destCc: [] }));
    expect(l.map((x) => x.champ)).toEqual(['À']);
  });

  it('un destinataire s’écrit « Nom <adresse> », ou l’adresse seule quand il n’a pas de nom', () => {
    expect(libelleAdresse({ nom: 'Gaëlle François', adresse: 'g@d.fr' })).toBe('Gaëlle François <g@d.fr>');
    expect(libelleAdresse({ nom: '  ', adresse: 'g@d.fr' })).toBe('g@d.fr');
  });
});

describe('③ les messages tenus hors de la file', () => {
  it('la mention est un MOT, et reprend le motif de la règle', () => {
    expect(mentionHorsFile(msg({ horsFile: true, motifHorsFile: 'envoi de logiciel' })))
      .toBe('Hors file de tri — envoi de logiciel');
  });

  it('sans motif, la mention reste lisible', () => {
    expect(mentionHorsFile(msg({ horsFile: true, motifHorsFile: null }))).toBe('Hors file de tri');
  });

  it('un message ordinaire ne porte aucune mention', () => {
    expect(mentionHorsFile(msg())).toBeNull();
  });
});

describe('le corps d’un message — ne jamais dire « vide » à tort', () => {
  it('le DERNIER message arrive avec son corps : on l’affiche', () => {
    expect(etatCorps(msg({ corps: 'bonjour', extrait: 'bonjour' }))).toEqual({ v: 'texte', texte: 'bonjour' });
  });

  it('🔴 les AUTRES arrivent sans corps mais avec un extrait : « à charger », surtout pas « vide »', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'bonjour, le chauff' }))).toEqual({ v: 'a_charger' });
  });

  it('une fois chargé, le corps s’affiche — et on ne le redemande plus', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'bon' }), 'bonjour tout le monde'))
      .toEqual({ v: 'texte', texte: 'bonjour tout le monde' });
  });

  it('HTML SEUL (557 messages en base) : une mention honnête, jamais un vide muet', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, htmlSeul: true }))).toEqual({ v: 'html_seul' });
    expect(MENTION_HTML_SEUL).toContain('affichage à venir');
  });

  it('un message RÉELLEMENT vide est dit vide', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, htmlSeul: false }))).toEqual({ v: 'vide' });
  });

  it('un chargement qui ne rend rien conclut « vide », et ne boucle pas sur « à charger »', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'bon' }), null)).toEqual({ v: 'vide' });
  });

  it('un corps fait uniquement d’espaces n’est pas du texte', () => {
    expect(etatCorps(msg({ corps: '   \n ', extrait: null }))).toEqual({ v: 'vide' });
  });
});
