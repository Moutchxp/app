import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attenteAvantReprise, bailExpire, BAIL_SECONDES, causeEnFrancais, corpsAlerte, doitAlerter, ESSAIS_MAX, heureFr,
  motEtatFile, objetAlerte, placePourLaPiece, tonEtatFile, verdictPieces,
} from './fileEnvoi';

/**
 * 🔴 LOT ENVOI-ARRIERE-PLAN — CE QUI DÉCIDE D'UN ENVOI DIFFÉRÉ. Module PUR, donc éprouvé ENTIÈREMENT — et c'est
 * exactement ce qu'on veut pour le geste le plus dangereux d'une messagerie.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE QUI COMMANDE TOUT : JAMAIS D'ENVOI PARTIEL. Un bail envoyé sans son annexe arrive chez le locataire,
 * il le lit, il ne sait pas qu'il manque quelque chose — et nous non plus. C'est l'erreur qu'on ne découvre jamais.
 *
 * Ce qui est protégé ici :
 *   ① une pièce en échec ⇒ ON RENONCE, et l'échec l'emporte sur l'attente ;
 *   ② une seule alerte par échec, et JAMAIS d'alerte sur une alerte ;
 *   ③ la cause est en français, et elle NOMME la pièce ;
 *   ④ le bail : un travailleur mort ne bloque pas la file, mais il ne fait pas partir le mail deux fois ;
 *   ⑤ le plafond de 25 Mo est tranché AU CLIC, sur les tailles annoncées par le Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('🔴🔴 ① jamais d’envoi partiel', () => {
  it('toutes les pièces prêtes ⇒ on envoie', () => {
    expect(verdictPieces(['prete', 'prete', 'prete'])).toEqual({ v: 'pret' });
  });

  it('aucune pièce ⇒ on envoie (un mail sans pièce jointe reste un mail)', () => {
    expect(verdictPieces([])).toEqual({ v: 'pret' });
  });

  it('une pièce encore en route ⇒ on repasse plus tard', () => {
    expect(verdictPieces(['prete', 'attente'])).toEqual({ v: 'attendre' });
  });

  it('🔴 UNE SEULE pièce en échec ⇒ on renonce, même si toutes les autres sont prêtes', () => {
    expect(verdictPieces(['prete', 'prete', 'echec'])).toEqual({ v: 'echec' });
  });

  /**
   * 🔴 L'ORDRE COMPTE, ET IL N'EST PAS ARBITRAIRE. Un mail dont une pièce est perdue et deux encore en route doit
   * alerter MAINTENANT : attendre les deux autres ne changerait rien au verdict, et retarderait d'autant le moment
   * où quelqu'un peut agir. Si « attendre » l'emportait, on alerterait avec une minute de retard à chaque fois.
   */
  it('🔴 l’ÉCHEC l’emporte sur l’ATTENTE — on n’attend pas pour dire qu’on a renoncé', () => {
    expect(verdictPieces(['attente', 'echec', 'attente'])).toEqual({ v: 'echec' });
  });
});

describe('🔴 ② une seule alerte, et jamais d’alerte sur une alerte', () => {
  it('un échec jamais alerté ⇒ on alerte', () => {
    expect(doitAlerter({ etat: 'echec', alerteLe: null, estUneAlerte: false })).toBe(true);
  });

  it('🔴 un échec DÉJÀ alerté ⇒ on n’alerte plus — sinon une passe par minute ferait une alerte par minute', () => {
    expect(doitAlerter({ etat: 'echec', alerteLe: new Date(), estUneAlerte: false })).toBe(false);
  });

  /**
   * 🔴🔴 LE VERROU LE PLUS IMPORTANT DE CE FICHIER. L'alerte part à `gestion@`, qui est NOTRE propre boîte. Si son
   * envoi échouait et qu'on alertait là-dessus, on alerterait sur l'alerte, sans fin — et la boîte se remplirait
   * toute seule jusqu'à ce que personne ne lise plus rien.
   */
  it('🔴🔴 une ALERTE qui échoue ne déclenche JAMAIS une autre alerte', () => {
    expect(doitAlerter({ etat: 'echec', alerteLe: null, estUneAlerte: true })).toBe(false);
  });

  it('un envoi réussi, ou encore en route, n’alerte pas', () => {
    for (const etat of ['attente', 'en_cours', 'envoye'] as const) {
      expect(doitAlerter({ etat, alerteLe: null, estUneAlerte: false }), etat).toBe(false);
    }
  });
});

describe('🔴 ③ la cause est en français, et elle NOMME la pièce', () => {
  it('une pièce perdue est NOMMÉE : c’est ce qui permet d’agir sans ouvrir les journaux', () => {
    const c = causeEnFrancais({ sorte: 'piece', nom: 'bail 2024 signé.pdf' });
    expect(c).toContain('bail 2024 signé.pdf');
    expect(c).toContain('Drive');
    expect(c).toContain('plusieurs tentatives');
  });

  it('un refus de Gmail le dit, avec son motif', () => {
    expect(causeEnFrancais({ sorte: 'gmail', detail: 'destinataire inconnu' }))
      .toBe('Gmail a refusé l’envoi : destinataire inconnu.');
  });

  /** ⚠️ Le motif technique n'est pas jeté : il est mis à la FIN, pour quand la phrase simple ne suffit pas. */
  it('le détail technique est conservé, mais rejeté à la fin', () => {
    const c = causeEnFrancais({ sorte: 'piece', nom: 'x.pdf', detail: 'HTTP 403' });
    expect(c.indexOf('x.pdf')).toBeLessThan(c.indexOf('HTTP 403'));
    expect(c).toContain('(HTTP 403)');
  });

  it('sans détail, la phrase reste propre — pas de parenthèses vides', () => {
    expect(causeEnFrancais({ sorte: 'gmail' })).toBe('Gmail a refusé l’envoi.');
    expect(causeEnFrancais({ sorte: 'inconnue' })).toBe('l’envoi n’a pas abouti.');
  });

  it('l’objet de l’alerte est celui d’Arno, mot pour mot', () => {
    expect(objetAlerte('Relance loyer juillet')).toBe('⚠️ Mail non envoyé : Relance loyer juillet');
    expect(objetAlerte('   ')).toBe('⚠️ Mail non envoyé : (sans objet)');
  });

  it('🔴 le corps répond aux quatre questions, et finit par le GESTE', () => {
    const c = corpsAlerte({
      objet: 'Relance loyer',
      destinataires: ['martin@orange.fr', 'syndic@immo.fr'],
      cliqueLe: new Date(2026, 8, 28, 18, 12),
      cause: 'la pièce « bail.pdf » n’a pas pu être récupérée depuis le Drive.',
      lienBrouillon: 'https://exemple.fr/admin/gestion?brouillon=42',
    });
    expect(c).toContain('n’est PAS parti');
    expect(c).toContain('Relance loyer');
    expect(c).toContain('martin@orange.fr, syndic@immo.fr');
    expect(c).toContain('28/09/2026 à 18 h 12');
    expect(c).toContain('bail.pdf');
    // 🔴 LA PHRASE QUI RASSURE : sans elle, on rouvre tout pour vérifier que le travail n'est pas perdu.
    expect(c).toContain('Rien n’est perdu');
    expect(c).toContain('pièces déjà récupérées');
    expect(c.trimEnd().endsWith('https://exemple.fr/admin/gestion?brouillon=42')).toBe(true);
  });

  it('une liste de destinataires vide se DIT, plutôt que de laisser un blanc', () => {
    const c = corpsAlerte({
      objet: 'x', destinataires: [], cliqueLe: new Date(2026, 0, 2, 9, 5),
      cause: 'c', lienBrouillon: 'l',
    });
    expect(c).toContain('Destinataires : (aucun)');
    expect(c).toContain('02/01/2026 à 09 h 05');
  });

  it('l’heure est écrite sur deux chiffres — « 9 h 5 » se lit mal', () => {
    expect(heureFr(new Date(2026, 8, 3, 7, 4))).toBe('03/09/2026 à 07 h 04');
  });
});

describe('🔴 ④ le bail : ni file bloquée, ni mail envoyé deux fois', () => {
  const t = (s: number) => new Date(Date.UTC(2026, 8, 28, 12, 0, s));

  it('une ligne jamais prise est libre', () => {
    expect(bailExpire(null, t(0))).toBe(true);
  });

  it('une ligne prise à l’instant n’est PAS reprise — sinon le mail partirait deux fois', () => {
    expect(bailExpire(t(0), t(10))).toBe(false);
    expect(bailExpire(t(0), t(BAIL_SECONDES - 1))).toBe(false);
  });

  it('🔴 une ligne prise par un processus MORT est reprise au-delà du bail', () => {
    expect(bailExpire(t(0), t(BAIL_SECONDES))).toBe(true);
    expect(bailExpire(t(0), t(BAIL_SECONDES + 60))).toBe(true);
  });

  /** ⚠️ Le bail doit rester plus LONG qu'un envoi réel : six pièces à télécharger, puis Gmail qui répond. */
  it('le bail est généreux — un bail trop court ferait partir le même mail deux fois', () => {
    expect(BAIL_SECONDES).toBeGreaterThanOrEqual(120);
  });

  it('les reprises sont bornées, et leur attente croît', () => {
    expect(ESSAIS_MAX).toBe(3);
    expect(attenteAvantReprise(0)).toBe(5);
    expect(attenteAvantReprise(1)).toBe(20);
    expect(attenteAvantReprise(2)).toBe(60);
    // Au-delà, on ne retombe pas à zéro : le dernier palier tient.
    expect(attenteAvantReprise(9)).toBe(60);
    expect(attenteAvantReprise(-3)).toBe(5);
  });
});

describe('🔴 ⑤ le plafond de 25 Mo, tranché au clic', () => {
  const PLAFOND = 25 * 1024 * 1024;

  it('une pièce qui tient passe', () => {
    expect(placePourLaPiece({ dejaJoint: 0, taillePiece: 1024, plafond: PLAFOND })).toEqual({ ok: true });
  });

  it('🔴 une pièce qui ferait dépasser est refusée TOUT DE SUITE, avec les trois chiffres en cause', () => {
    const r = placePourLaPiece({ dejaJoint: 24 * 1024 * 1024, taillePiece: 2 * 1024 * 1024, plafond: PLAFOND });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motif).toContain('24,0 Mo');   // déjà joints
      expect(r.motif).toContain('2,0 Mo');    // celle-ci
      expect(r.motif).toContain('25,0 Mo');   // le maximum
    }
  });

  it('la limite EXACTE passe — refuser à 25,0 Mo pile serait refuser ce qu’on annonce permettre', () => {
    expect(placePourLaPiece({ dejaJoint: 0, taillePiece: PLAFOND, plafond: PLAFOND })).toEqual({ ok: true });
  });

  it('une taille inconnue est refusée plutôt que comptée pour zéro', () => {
    const r = placePourLaPiece({ dejaJoint: 0, taillePiece: -1, plafond: PLAFOND });
    expect(r.ok).toBe(false);
  });
});

describe('les mots de l’état', () => {
  it('« Non envoyé » est le mot d’Arno, et le SEUL état rouge', () => {
    expect(motEtatFile('echec')).toBe('Non envoyé');
    expect(tonEtatFile('echec')).toBe('rouge');
  });

  /** ⚠️ « Envoi en cours » ne dure que quelques secondes : en faire une alerte ferait paraître anormal l'ordinaire. */
  it('un envoi en route est NEUTRE, pas alarmant', () => {
    expect(motEtatFile('attente')).toBe('Envoi en cours');
    expect(motEtatFile('en_cours')).toBe('Envoi en cours');
    expect(tonEtatFile('attente')).toBe('neutre');
    expect(tonEtatFile('en_cours')).toBe('neutre');
    expect(tonEtatFile('envoye')).toBe('neutre');
  });
});

describe('garanties STATIQUES', () => {
  /** 🔴 Module PUR : aucun import, donc rien qui puisse tirer `pg` jusque dans le navigateur (incident 24/09/2026). */
  it('🔴 aucun import — ce module tourne à l’identique sur le serveur et dans le navigateur', () => {
    const src = readFileSync('app/lib/gestion/fileEnvoi.ts', 'utf8');
    expect(/^\s*import\s/m.test(src)).toBe(false);
    expect(/require\(/.test(src)).toBe(false);
  });

  /** ⚠️ Aucune horloge lue ici : toutes les dates sont des ARGUMENTS. C'est ce qui rend le bail éprouvable. */
  it('aucune horloge ni aléa lus en cachette', () => {
    const code = readFileSync('app/lib/gestion/fileEnvoi.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/Date\.now\(\)|new Date\(\)|Math\.random/.test(code)).toBe(false);
  });
});
