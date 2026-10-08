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
  messageId: 1, messageIdRfc: '<m1@orange.fr>', sens: 'recu', de: 'martin@orange.fr', deNom: 'Mme Martin',
  recuLe: '2026-09-20T08:00:00Z', objet: 'Chauffage', corps: null, extrait: null,
  automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null,
  // 🔴 LOT MARQUES-EVENEMENT-EN-COURS — aucun événement en cours par défaut : ces épreuves parlent d'autre chose.
  evenementsEnCours: 0,
  // 🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU — un mail vivant par defaut : c'est le cas que ces epreuves examinent.
  aLaCorbeille: false,
  // LOT ENVOI-DIAG — vide par défaut : un message dont personne ne s'est plaint est arrivé.
  nonRemises: [],
  destA: null, destCc: null, destinatairesFondus: null, aHtml: false, html: null,
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT MESSAGE-CLIQUÉ — LE MESSAGE VISÉ L'EMPORTE (demande d'Arno).
   *
   * LE DÉFAUT RÉEL, relevé sur le fil 354 : en Réception, la ligne représente le dernier message REÇU (25 sept.
   * 12 h 37) ; l'écran s'ouvrait sur le dernier message du fil, qui était NOTRE réponse de 15 h 58. On cliquait sur
   * une question et on lisait sa propre prose.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 RÉCEPTION : le message REÇU de la ligne, et non notre réponse plus récente', () => {
    // La forme du fil 354 : une question reçue, puis notre réponse le même jour.
    const fil = [msg({ messageId: 1, sens: 'recu' }), msg({ messageId: 2, sens: 'envoye' })];
    expect([...messagesDeplies(fil, 1)]).toEqual([1]);
    // …et sans visée, le comportement d'avant ce lot est intact : le dernier.
    expect([...messagesDeplies(fil)]).toEqual([2]);
  });

  it('ENVOYÉS : le message ENVOYÉ de la ligne, même si un mail est arrivé depuis', () => {
    const fil = [msg({ messageId: 1, sens: 'envoye' }), msg({ messageId: 2, sens: 'recu' })];
    expect([...messagesDeplies(fil, 1)]).toEqual([1]);
  });

  it('RECHERCHE : le message TROUVÉ, fût-il au milieu du fil', () => {
    const fil = [msg({ messageId: 7 }), msg({ messageId: 8 }), msg({ messageId: 9 })];
    expect([...messagesDeplies(fil, 8)]).toEqual([8]);
  });

  /**
   * 🔴 LE VISÉ PASSE DEVANT LA RÈGLE « HORS FILE ». Cette règle protège un CHOIX PAR DÉFAUT ; elle n'a pas à
   * contredire une désignation explicite. Qui clique sur la ligne d'un accusé automatique demande à le voir.
   */
  it('un message HORS FILE explicitement visé est tout de même déplié', () => {
    const fil = [msg({ messageId: 1 }), msg({ messageId: 2, horsFile: true })];
    expect([...messagesDeplies(fil, 2)]).toEqual([2]);
    expect([...messagesDeplies(fil)]).toEqual([1]); // sans visée, la règle d'avant tient toujours
  });

  /** Adresse copiée d'un fil dont le message a depuis été déplacé : on retombe sur le défaut, sans rien casser. */
  it('un visé INTROUVABLE ne vide pas l’écran — on retombe sur le dernier', () => {
    const fil = [msg({ messageId: 1 }), msg({ messageId: 2 })];
    expect([...messagesDeplies(fil, 999)]).toEqual([2]);
    expect([...messagesDeplies([], 999)]).toEqual([]);
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

  /**
   * ══ 🔴 LOT BIEN-RATTACHE — UN MAIL SANS TEXTE N'EST PLUS UN MAIL ILLISIBLE ═══════════════════════════════════
   * Demande d'Arno, sur le fil 36494 (avis d'appel de provisions d'un syndic) : l'écran affichait « Contenu
   * disponible en mise en forme uniquement — affichage à venir » au lieu du contenu. Mesuré le 28/09/2026 :
   * 1 180 mails en base n'ont QUE du HTML. Ils s'affichent désormais, en HTML assaini par le SERVEUR.
   */
  it('🔴 DU HTML, pas encore demandé : un état TRANSITOIRE, et on va le chercher', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, aHtml: true }))).toEqual({ v: 'html_a_charger' });
    // 🔴 La mention n'annonce plus une fonctionnalité future : elle annonce une lecture en cours, qui aboutit.
    expect(MENTION_HTML_SEUL).not.toContain('affichage à venir');
    expect(MENTION_HTML_SEUL).toContain('lecture');
  });

  it('🔴 une fois chargé : on AFFICHE la mise en forme', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, aHtml: true }), null, '<p>Bonjour</p>'))
      .toEqual({ v: 'html', html: '<p>Bonjour</p>' });
  });

  /**
   * ══ 🔴🔴 RÉÉCRIT PAR LE LOT LECTURE-HTML-FIL-TROMBONE — LA RÈGLE EST EXACTEMENT INVERSÉE ═══════════════════
   *
   * CE QU'IL EXIGEAIT : « le TEXTE prime toujours sur le HTML : c'est lui qu'on lit le mieux. » C'était vrai du
   * temps où le HTML n'était qu'un pis-aller pour les mails sans texte.
   *
   * POURQUOI C'ÉTAIT FAUX. Un mail porte les DEUX versions du MÊME message : le HTML est celle que l'expéditeur
   * a composée, le texte celle que son logiciel a fabriquée pour les lecteurs qui ne savent pas mieux faire.
   * Préférer le texte, c'est préférer la copie dégradée. Vu sur le mail 57185 : 1 216 caractères de texte,
   * 7 998 de HTML — et la signature d'Arno réduite à « <https://www.sansvisavis.com/> » et une adresse Google
   * Maps en clair sur trois lignes, alors que la bonne version était là, à côté, inutilisée.
   *
   * ET CE N'ÉTAIT PAS UN CAS RARE : 56 367 mails sur 57 223 ont une version HTML. L'ancienne règle ne servait la
   * bonne version que pour les 557 qui n'avaient que ça — l'exception commandait la règle.
   */
  it('🔴 le HTML prime sur le texte : c’est la version que l’expéditeur a composée', () => {
    expect(etatCorps(msg({ corps: 'Bonjour', extrait: 'Bonjour', aHtml: true }), 'Bonjour', '<p>x</p>'))
      .toEqual({ v: 'html', html: '<p>x</p>' });
  });

  /**
   * 🔴 ON ATTEND LE HTML PLUTÔT QUE DE MONTRER LE TEXTE EN ATTENDANT. Se rabattre afficherait la version de
   * secours une fraction de seconde puis la bonne : un clignotement qui donne l'impression que l'écran hésite,
   * et qui ferait lire deux fois la même signature.
   */
  it('🔴 on SAIT qu’il y a du HTML et on ne l’a pas : on l’attend, on ne montre pas le texte', () => {
    expect(etatCorps(msg({ corps: 'Bonjour', extrait: 'Bonjour', aHtml: true })).v).toBe('html_a_charger');
  });

  /** ⚠️ ET LE TEXTE RESTE LA VERSION AFFICHÉE quand il n'y a pas de HTML — c'est le cas de 454 mails. */
  it('sans HTML, le texte s’affiche, exactement comme avant', () => {
    expect(etatCorps(msg({ corps: 'Bonjour', extrait: 'Bonjour', aHtml: false }), 'Bonjour', null))
      .toEqual({ v: 'texte', texte: 'Bonjour' });
  });

  /**
   * 🔴 LE HTML DU MESSAGE DÉPLIÉ D'EMBLÉE VOYAGE AVEC LA LISTE, et il est pris sans aller-retour : sans cela,
   * CHAQUE ouverture de conversation afficherait « Mise en forme en cours de lecture… » le temps d'une requête.
   */
  it('🔴 le HTML porté par la liste s’affiche sans rien redemander', () => {
    expect(etatCorps(msg({ corps: 'Bonjour', extrait: 'Bonjour', aHtml: true, html: '<p>déjà là</p>' })))
      .toEqual({ v: 'html', html: '<p>déjà là</p>' });
  });

  it('un HTML chargé mais VIDE (que des balises) ne prétend pas être un contenu', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, aHtml: true }), null, '')).toEqual({ v: 'vide' });
    expect(etatCorps(msg({ corps: null, extrait: null, aHtml: true }), null, null)).toEqual({ v: 'vide' });
  });

  /**
   * ⚠️ RÉÉCRIT : l'extrait ne commande plus. Un mail qui a du HTML va chercher SA MISE EN FORME, extrait ou pas —
   * l'extrait n'est qu'un aperçu fabriqué à partir du texte, il ne dit rien de la meilleure version disponible.
   * Les deux lectures partent d'ailleurs dans la MÊME requête (`lireCorpsDuMessage` rend les deux).
   */
  it('un mail qui a du HTML va chercher sa mise en forme, même s’il a un extrait', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'Bonjour', aHtml: true })).v).toBe('html_a_charger');
  });

  it('un mail SANS HTML mais avec un extrait va chercher son texte', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'Bonjour', aHtml: false })).v).toBe('a_charger');
  });

  it('un message RÉELLEMENT vide est dit vide', () => {
    expect(etatCorps(msg({ corps: null, extrait: null, aHtml: false }))).toEqual({ v: 'vide' });
  });

  it('un chargement qui ne rend rien conclut « vide », et ne boucle pas sur « à charger »', () => {
    expect(etatCorps(msg({ corps: null, extrait: 'bon' }), null)).toEqual({ v: 'vide' });
  });

  it('un corps fait uniquement d’espaces n’est pas du texte', () => {
    expect(etatCorps(msg({ corps: '   \n ', extrait: null }))).toEqual({ v: 'vide' });
  });
});
