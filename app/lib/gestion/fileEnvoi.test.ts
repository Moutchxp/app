import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attenteAvantReprise, bailExpire, BAIL_SECONDES, causeEnFrancais, corpsAlerte, doitAlerter, ESSAIS_MAX,
  grouperEnvois, motGroupeEnvoi, signatureEnvoi,
  fusionnerNonEnvoyes, heureFr, motEtatFile, objetAlerte, placePourLaPiece, tonEtatFile, verdictPieces,
  type MentionNonEnvoye,
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT LIGNE-NON-ENVOYE — LA CAPSULE ROUGE DANS « ENVOYÉS », À SA PLACE.
 *
 * Demande d'Arno. La raison est celle des avis de non-remise : c'est la seule chose qu'on ne peut pas apprendre en
 * ouvrant l'échange plus tard. Sans elle, il faudrait ouvrir les 6 580 échanges d'« Envoyés » pour espérer tomber
 * sur celui qui n'est pas parti.
 *
 * Ce qui est protégé ici :
 *   ① 🔴 UN ÉCHANGE DÉJÀ DANS LA LISTE reçoit la MENTION, jamais une seconde ligne — sinon il apparaîtrait deux
 *      fois, une fois normal et une fois en rouge ;
 *   ② 🔴 UN MESSAGE NEUF, qui n'a pas de fil, obtient une LIGNE à lui — sans quoi il n'apparaîtrait nulle part,
 *      et c'est exactement le mail qu'on croit envoyé ;
 *   ③ la ligne s'insère à sa PLACE CHRONOLOGIQUE, et l'ordre des autres ne bouge pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT LIGNE-NON-ENVOYE — fusionner les échecs dans « Envoyés »', () => {
  const ligne = (filId: number, dernierLe: string) => ({ filId, dernierLe, objet: `fil ${filId}` });
  const echec = (o: Partial<MentionNonEnvoye> = {}): MentionNonEnvoye => ({
    fileId: 1, filId: null, objet: 'Relance loyer', destinataires: ['x@y.fr'],
    cause: 'la pièce « bail.pdf » n’a pas pu être récupérée depuis le Drive.',
    demandeLe: '2026-09-28T18:00:00Z', brouillonId: 42, ...o,
  });
  /** Ce que l'écran fabriquerait pour un message neuf : une ligne sans échange. */
  const fabriquer = (e: MentionNonEnvoye) => ({ filId: -e.fileId, dernierLe: e.demandeLe, objet: e.objet });

  it('sans échec, la liste est rendue telle quelle', () => {
    const l = [ligne(1, '2026-09-28T17:00:00Z')];
    expect(fusionnerNonEnvoyes(l, [], fabriquer)).toEqual(l);
  });

  it('🔴 ① un échange DÉJÀ présent reçoit la mention, et la liste ne s’allonge PAS', () => {
    const l = [ligne(7, '2026-09-28T17:00:00Z'), ligne(8, '2026-09-28T16:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [echec({ filId: 7 })], fabriquer);
    expect(r).toHaveLength(2);
    expect(r[0].nonEnvoye?.cause).toContain('bail.pdf');
    expect(r[1].nonEnvoye).toBeUndefined();
  });

  it('🔴 ② un message NEUF (sans fil) obtient une ligne à lui', () => {
    const l = [ligne(7, '2026-09-28T17:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [echec({ filId: null, demandeLe: '2026-09-28T18:00:00Z' })], fabriquer);
    expect(r).toHaveLength(2);
    expect(r[0].objet).toBe('Relance loyer');
    expect(r[0].nonEnvoye).toBeDefined();
  });

  /** ⚠️ Un échec dont le fil est sur une AUTRE page doit quand même se voir : on ne le fait pas disparaître. */
  it('🔴 un échec dont le fil n’est PAS sur cette page obtient aussi sa ligne', () => {
    const l = [ligne(7, '2026-09-28T17:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [echec({ filId: 999, demandeLe: '2026-09-28T18:00:00Z' })], fabriquer);
    expect(r).toHaveLength(2);
    expect(r[0].nonEnvoye?.filId).toBe(999);
  });

  it('🔴 ③ la ligne s’insère à sa PLACE chronologique, pas en tête par défaut', () => {
    const l = [
      ligne(1, '2026-09-28T19:00:00Z'),
      ligne(2, '2026-09-28T17:00:00Z'),
      ligne(3, '2026-09-28T15:00:00Z'),
    ];
    const r = fusionnerNonEnvoyes(l, [echec({ demandeLe: '2026-09-28T18:00:00Z' })], fabriquer);
    expect(r.map((x) => x.objet)).toEqual(['fil 1', 'Relance loyer', 'fil 2', 'fil 3']);
  });

  it('un échec plus ancien que toute la page se range à la FIN', () => {
    const l = [ligne(1, '2026-09-28T19:00:00Z'), ligne(2, '2026-09-28T17:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [echec({ demandeLe: '2020-01-01T00:00:00Z' })], fabriquer);
    expect(r.map((x) => x.objet)).toEqual(['fil 1', 'fil 2', 'Relance loyer']);
  });

  it('plusieurs orphelins restent dans l’ordre, du plus récent au plus ancien', () => {
    const l = [ligne(1, '2026-09-28T12:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [
      echec({ fileId: 1, objet: 'ancien', demandeLe: '2026-09-28T13:00:00Z' }),
      echec({ fileId: 2, objet: 'récent', demandeLe: '2026-09-28T15:00:00Z' }),
    ], fabriquer);
    expect(r.map((x) => x.objet)).toEqual(['récent', 'ancien', 'fil 1']);
  });

  /** ⚠️ Une ligne ne porte qu'UNE capsule : c'est le dernier état qui intéresse. */
  it('deux échecs sur le MÊME fil : le plus récent l’emporte', () => {
    const l = [ligne(7, '2026-09-28T17:00:00Z')];
    const r = fusionnerNonEnvoyes(l, [
      echec({ fileId: 1, filId: 7, cause: 'ancienne cause', demandeLe: '2026-09-28T10:00:00Z' }),
      echec({ fileId: 2, filId: 7, cause: 'cause récente', demandeLe: '2026-09-28T16:00:00Z' }),
    ], fabriquer);
    expect(r).toHaveLength(1);
    expect(r[0].nonEnvoye?.cause).toBe('cause récente');
  });

  it('🔴 l’ORIGINAL n’est pas modifié : la fusion rend une NOUVELLE liste', () => {
    const l = [ligne(7, '2026-09-28T17:00:00Z')];
    const copie = JSON.parse(JSON.stringify(l));
    fusionnerNonEnvoyes(l, [echec({ filId: 7 })], fabriquer);
    expect(l).toEqual(copie);
  });
});

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — UN ÉCHEC = UN BANDEAU ET UNE ALERTE ═════════════════════════════════════════════
 *
 * Mesuré en base le 30/09/2026 sur le fil 3494 : deux clics sur « transférer » (14:55:31 et 14:56:53) ont produit
 * DEUX lignes de file (12 et 14) portant le MÊME brouillon (64) et la MÊME cause au mot près — donc deux alertes
 * identiques dans la boîte et quatre bandeaux à l'écran, pour une seule chose à réparer.
 */
describe('🔴🔴 regrouper les tentatives identiques', () => {
  const t = (id: number, o: Record<string, unknown> = {}) => ({
    id, etat: 'echec' as const, filId: 3494, objet: 'TR : Taxes Foncières',
    destinataires: ['compta@adhoc.fr'], cause: 'Gmail a refusé l’envoi.',
    demandeLe: `2026-09-30T14:5${id}:00Z`, ...o,
  });

  it('deux tentatives identiques ne font qu’un groupe, qui sait combien', () => {
    const g = grouperEnvois([t(4), t(2)]);
    expect(g).toHaveLength(1);
    expect(g[0].nb).toBe(2);
    expect(g[0].ids).toEqual([4, 2]);
  });

  it('🔴 la ligne retenue est la PLUS RÉCENTE — c’est son brouillon qu’on rouvre', () => {
    const g = grouperEnvois([t(2), t(4)]);
    expect(g[0].ligne.id).toBe(4);
  });

  /**
   * 🔴 REGROUPER SUR MOINS QUE CE QU'ON AFFICHE MASQUERAIT UNE PANNE. Deux échecs du même échange mais de causes
   * différentes sont deux choses à réparer ; les fondre ferait disparaître l'une des deux pour toujours.
   */
  it('🔴 une cause différente = un groupe différent, même échange', () => {
    expect(grouperEnvois([t(4), t(2, { cause: 'la pièce « bail.pdf » manque.' })])).toHaveLength(2);
  });

  it('un destinataire différent, un objet différent, un état différent : autant de groupes', () => {
    expect(grouperEnvois([t(4), t(2, { destinataires: ['autre@x.fr'] })])).toHaveLength(2);
    expect(grouperEnvois([t(4), t(2, { objet: 'Devis' })])).toHaveLength(2);
    expect(grouperEnvois([t(4), t(2, { etat: 'attente' as const })])).toHaveLength(2);
  });

  it('⚠️ l’ordre d’entrée est CONSERVÉ : un bandeau ne saute pas d’un endroit à l’autre entre deux relectures', () => {
    const g = grouperEnvois([t(1, { objet: 'A' }), t(2, { objet: 'B' }), t(3, { objet: 'A' })]);
    expect(g.map((x) => x.ligne.objet)).toEqual(['A', 'B']);
  });

  it('la signature ne retient QUE ce que le bandeau affiche', () => {
    // Le brouillon et l'heure ne sont PAS affichés comme une identité : deux tentatives du même message les ont
    //   différents (l'heure) ou identiques (le brouillon) sans que cela change ce qu'on lit.
    expect(signatureEnvoi(t(4))).toBe(signatureEnvoi(t(9)));
  });

  it('🔴 le NOMBRE est dans le MOT — une synthèse vocale ne lit pas une pastille', () => {
    expect(motGroupeEnvoi('echec', 1)).toBe('Non envoyé');
    expect(motGroupeEnvoi('echec', 2)).toBe('2 tentatives non envoyées');
    expect(motGroupeEnvoi('attente', 3)).toBe('3 envois en cours');
  });
});

describe('🔴 le TROISIÈME verrou de l’alerte : la même panne, déjà signalée il y a peu', () => {
  it('🔴 une panne déjà signalée ne re-alerte pas', () => {
    expect(doitAlerter({
      etat: 'echec', alerteLe: null, estUneAlerte: false, dejaSignaleRecemment: true,
    })).toBe(false);
  });

  it('⚠️ l’absence de réponse ne fait JAMAIS taire l’alerte — une alerte perdue est un mail qu’on croit parti', () => {
    expect(doitAlerter({ etat: 'echec', alerteLe: null, estUneAlerte: false })).toBe(true);
    expect(doitAlerter({
      etat: 'echec', alerteLe: null, estUneAlerte: false, dejaSignaleRecemment: false,
    })).toBe(true);
  });

  it('les deux verrous d’origine restent premiers : une alerte n’alerte jamais sur elle-même', () => {
    expect(doitAlerter({
      etat: 'echec', alerteLe: null, estUneAlerte: true, dejaSignaleRecemment: false,
    })).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — UN ÉCHEC RÉPARÉ DISPARAÎT DE L'ÉCRAN ════════════════════════════════════════════
 *
 * Demande d'Arno, troisième moitié du point « bandeaux » : « le bandeau disparaît quand l'envoi finit par
 * réussir ». La règle EXISTE depuis le lot LIGNE-NON-ENVOYE (`SQL_ECHEC_NON_RESOLU`), mais RIEN ne la gardait —
 * et une règle que personne n'éprouve est une règle qu'un prochain lot peut retirer sans s'en apercevoir.
 *
 * ⚠️ ON ÉPROUVE LES FRAGMENTS SÉMANTIQUES DU SQL, PAS SA FORME (convention du dépôt, AGENTS.md) : le prédicat
 * vit en base, il n'y a pas de fonction pure à appeler, et figer sa mise en forme casserait au premier
 * reformatage sans rien apprendre. Ce qu'on tient ici, ce sont les quatre conditions SANS lesquelles la règle ne
 * veut plus rien dire.
 *
 * 🔴 VÉRIFIÉ EN RÉEL le 30/09/2026, en LECTURE SEULE, sur le prédicat tel qu'il est écrit : la base porte
 * aujourd'hui 2 échecs affichés (brouillon 64, les deux tentatives d'Arno) ; la même requête, appliquée à la
 * table augmentée d'une ligne « envoyé » hypothétique sur ce brouillon, en rend 0.
 */
describe('🔴 un échec qu’un envoi ULTÉRIEUR a réparé ne s’affiche plus', () => {
  const sql = readFileSync('app/lib/gestion/fileEnvoiRepo.ts', 'utf8').replace(/\s+/g, ' ');

  it('la règle d’exclusion est écrite UNE fois, et les deux listes s’en servent', () => {
    // Deux écritures de la même règle divergeraient : un échec disparaîtrait d'une liste et pas de l'autre.
    expect(sql).toContain('const SQL_ECHEC_NON_RESOLU');
    expect((sql.match(/SQL_ECHEC_NON_RESOLU/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('🔴 les quatre conditions qui FONT la règle sont là', () => {
    const regle = sql.slice(sql.indexOf('const SQL_ECHEC_NON_RESOLU'), sql.indexOf('/** Ce qu’on met en file'));
    expect(regle).toContain("f.etat = 'echec'");        // ① on ne parle que des échecs
    expect(regle).toContain('NOT EXISTS');              // ② et seulement de ceux que rien n'a réparés
    expect(regle).toContain('f2.brouillon_id = f.brouillon_id'); // ③ le MÊME message, pas un autre
    expect(regle).toContain("f2.etat = 'envoye'");      // ④ réparé = parti
    // 🔴 « PLUS TARD », et pas « à un moment » : un envoi réussi AVANT l'échec ne répare rien — c'est l'échec
    //   qui est venu après lui. Sans cette comparaison, un échec neuf serait masqué par un succès ancien.
    expect(regle).toContain('f2.demande_le > f.demande_le');
  });

  it('⚠️ elle ne s’applique QU’AUX échecs : un envoi encore en route n’a rien à réparer', () => {
    // C'est lui qui comble l'intervalle entre le clic et la capture par la relève : le masquer ferait croire
    //   le clic perdu pendant une minute, et l'on réécrirait le message.
    expect(sql).toContain("f.etat IN ('attente', 'en_cours') OR");
  });
});
