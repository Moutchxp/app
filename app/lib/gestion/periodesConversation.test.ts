import { describe, it, expect } from 'vitest';
import {
  alerteTouteLaConversation, blocSuiviVisible, memesBiens, classementVide, effetDuChoix, faceALaFenetre, mailsDuBien,
  motClassement,
  periodeEnCours, projeter, reperesDuFil, reprendre, repriseFidele, SUIVI_DEFAUT,
  type Classement, type ExceptionMail, type Periode,
} from './periodesConversation';

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LES PÉRIODES, ÉPROUVÉES SUR LE SCÉNARIO D'ARNO ══════════════════════════════
 *
 * ARNO (01/10/2026) : « Une conversation peut changer de sujet. Son classement se découpe en PÉRIODES
 * successives. Chaque mail retient la règle sous laquelle il a été classé […]. Un changement en cours de route
 * n'efface jamais le passé (sauf “Toute la conversation”). »
 */
const bien = (cle: string): Classement => ({ sorte: 'biens', biens: [{ cle, libelle: `lot ${cle}` }] });
const INTERNE: Classement = { sorte: 'interne', biens: [] };
const HORS: Classement = { sorte: 'hors_gestion', biens: [] };
const periode = (id: number, depuis: number, c: Classement): Periode =>
  ({ id, depuisMessageId: depuis, classement: c });
const exception = (m: number, c: Classement): ExceptionMail => ({ messageId: m, classement: c });

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① la projection : quel classement pour quel mail', () => {
  it('🔴 une seule période depuis le premier mail : tous les mails la portent', () => {
    const p = projeter([1, 2, 3], [periode(1, 1, bien('A'))], []);
    expect([...p.keys()]).toEqual([1, 2, 3]);
    expect([...p.values()].every((c) => c.biens[0].cle === 'A')).toBe(true);
  });

  /** 🔴 UNE EXCEPTION PORTE SUR UN MAIL, ET SUR LUI SEUL : le suivant reprend la règle d'avant. */
  it('🔴🔴 une exception ne déplace PAS la période', () => {
    const p = projeter([1, 2, 3], [periode(1, 1, bien('A'))], [exception(2, bien('C'))]);
    expect(p.get(1)?.biens[0].cle).toBe('A');
    expect(p.get(2)?.biens[0].cle).toBe('C');
    expect(p.get(3)?.biens[0].cle).toBe('A');
  });

  it('🔴 une nouvelle période court jusqu’à la fin, et ne touche pas au passé', () => {
    const p = projeter([1, 2, 3, 4], [periode(1, 1, bien('A')), periode(2, 3, bien('B'))], []);
    expect([1, 2].every((m) => p.get(m)?.biens[0].cle === 'A')).toBe(true);
    expect([3, 4].every((m) => p.get(m)?.biens[0].cle === 'B')).toBe(true);
  });

  /**
   * ⚠️ UN MAIL ANTÉRIEUR À TOUTE PÉRIODE N'EST PAS CLASSÉ. Lui inventer un classement rétroactif serait
   * exactement ce que « un changement n'efface jamais le passé » interdit.
   */
  it('⚠️ les mails d’avant la première période restent à classer', () => {
    const p = projeter([1, 2, 3], [periode(1, 2, bien('A'))], []);
    expect(p.has(1)).toBe(false);
    expect(p.get(2)?.biens[0].cle).toBe('A');
    expect(p.get(3)?.biens[0].cle).toBe('A');
  });

  /** ⚠️ L'ORDRE EST CELUI DE LA CONVERSATION, pas celui des identifiants (un mail capturé en retard). */
  it('⚠️ l’ordre suit la liste des mails, pas les identifiants', () => {
    const p = projeter([10, 3, 7], [periode(1, 10, bien('A')), periode(2, 7, bien('B'))], []);
    expect(p.get(10)?.biens[0].cle).toBe('A');
    expect(p.get(3)?.biens[0].cle).toBe('A');
    expect(p.get(7)?.biens[0].cle).toBe('B');
  });

  it('⚠️ une période posée sur un mail absent de la conversation est ignorée', () => {
    const p = projeter([1, 2], [periode(1, 1, bien('A')), periode(2, 99, bien('B'))], []);
    expect([...p.values()].every((c) => c.biens[0].cle === 'A')).toBe(true);
  });
});

/**
 * ══ 🔴🔴 ② LE SCÉNARIO D'ARNO, MOT POUR MOT ═══════════════════════════════════════════════════════════════════
 *
 * « mails 1-3 lot A (initial), mail 4 exception lot C, mail 5 suit (A), mail 6 nouvelle période lot B, mails 7-8
 * suivent (B). Attendu : A = 1,2,3,5 ; C = 4 ; B = 6,7,8. Puis “Toute la conversation” sur lot D au mail 8 :
 * D = 1,2,3,5,6,7,8 et C = 4 (exception conservée). »
 */
describe('🔴🔴 ② le scénario d’Arno, de bout en bout', () => {
  const MAILS = [1, 2, 3, 4, 5, 6, 7, 8];
  const periodes: Periode[] = [periode(1, 1, bien('A')), periode(2, 6, bien('B'))];
  const exceptions: ExceptionMail[] = [exception(4, bien('C'))];

  it('🔴🔴 A = 1,2,3,5 · C = 4 · B = 6,7,8', () => {
    expect(mailsDuBien(MAILS, periodes, exceptions, 'A')).toEqual([1, 2, 3, 5]);
    expect(mailsDuBien(MAILS, periodes, exceptions, 'C')).toEqual([4]);
    expect(mailsDuBien(MAILS, periodes, exceptions, 'B')).toEqual([6, 7, 8]);
  });

  /** 🔴🔴 PUIS « TOUTE LA CONVERSATION » SUR LE LOT D, DEPUIS LE MAIL 8. */
  it('🔴🔴 « Toute la conversation » sur D : D = 1,2,3,5,6,7,8 — et C = 4 reste', () => {
    const effet = effetDuChoix({
      choix: 'conversation', messageId: 8, classement: bien('D'), periodes, exceptions,
    });
    // Toutes les périodes sont remplacées…
    expect(effet.periodesRemplacees.sort()).toEqual([1, 2]);
    // …par UNE seule, depuis le premier mail. L'appelant en connaît l'identifiant réel ; ici, le premier.
    expect(effet.nouvellePeriode?.classement.biens[0].cle).toBe('D');
    expect(effet.nouvelleException).toBeNull();

    const apres = projeter(MAILS, [periode(3, 1, bien('D'))], exceptions);
    expect(mailsDuBien(MAILS, [periode(3, 1, bien('D'))], exceptions, 'D')).toEqual([1, 2, 3, 5, 6, 7, 8]);
    expect(mailsDuBien(MAILS, [periode(3, 1, bien('D'))], exceptions, 'C')).toEqual([4]);
    expect(apres.get(4)?.biens[0].cle).toBe('C');
  });

  /** 🔴 ET LES ANCIENS BIENS NE SONT PLUS NULLE PART : « remplace toutes les périodes ». */
  it('🔴 après « Toute la conversation », A et B ont disparu des historiques', () => {
    const apres = [periode(3, 1, bien('D'))];
    expect(mailsDuBien(MAILS, apres, exceptions, 'A')).toEqual([]);
    expect(mailsDuBien(MAILS, apres, exceptions, 'B')).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ le bloc « Suivi dans la conversation » : ses TROIS conditions', () => {
  /**
   * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT — LE DÉFAUT D'ARNO, ET LA TROISIÈME CONDITION ════════════════════════
   *
   * CONSTAT (02/10/2026), fil 3490 / message 57368 : « Le bloc s'affiche dès l'ouverture de la modale, sans
   * qu'aucune case ait été touchée. » Les deux premières conditions étaient vraies — 4ᵉ mail, conversation
   * classée (3 périodes) — et elles suffisaient. Il manquait la seule qui dit qu'il se passe quelque chose : la
   * sélection a-t-elle CHANGÉ par rapport au rattachement validé ?
   */
  /** Le décor : un 2ᵉ mail d'une conversation déjà classée, dont le bien validé est LOT-A. */
  const decor = (selection: readonly string[] | null) => ({
    estPremierMail: false, dejaClassee: true, reference: ['LOT-A'], selection,
  });

  it('🔴🔴 absent sur le PREMIER mail, même si la conversation est classée et la sélection changée', () => {
    expect(blocSuiviVisible({ ...decor(['LOT-B']), estPremierMail: true })).toBe(false);
  });

  it('🔴🔴 absent sur une conversation JAMAIS classée, même au troisième mail', () => {
    expect(blocSuiviVisible({ ...decor(['LOT-B']), dejaClassee: false })).toBe(false);
  });

  /** 🔴🔴 LE CAS DU FIL 3490 : à l'ouverture, la sélection vaut le rattachement validé — donc pas de bloc. */
  it('🔴🔴 à l’ouverture, sélection = rattachement validé : AUCUN bloc', () => {
    expect(blocSuiviVisible(decor(['LOT-A']))).toBe(false);
  });

  it('🔴🔴 une case changée : le bloc apparaît', () => {
    expect(blocSuiviVisible(decor(['LOT-A', 'LOT-B']))).toBe(true);   // une case cochée en plus
    expect(blocSuiviVisible(decor([]))).toBe(true);                   // la seule case décochée
    expect(blocSuiviVisible(decor(['LOT-B']))).toBe(true);            // une autre à la place
  });

  it('🔴🔴 retour exact à l’état de départ : le bloc disparaît', () => {
    expect(blocSuiviVisible(decor(['LOT-A', 'LOT-B']))).toBe(true);
    expect(blocSuiviVisible(decor(['LOT-A']))).toBe(false);
  });

  /**
   * 🔴🔴 LA MOITIÉ DE LA RÈGLE QU'ON PERDRAIT LE PLUS FACILEMENT. « Une case pré-cochée par une proposition,
   * laissée telle quelle, ne compte pas comme un changement » (Arno). La référence est le rattachement VALIDÉ ;
   * si le moteur propose LOT-B et que la modale le coche d'avance, la sélection vaut { A, B } — et le bloc
   * s'affiche, parce qu'A VALIDER cela changerait bien le rattachement. En revanche, quand RIEN n'est validé, il
   * n'y a pas de bloc du tout (2ᵉ condition) : c'est là que la pré-coche ne peut rien déclencher.
   */
  it('🔴🔴 sans aucun rattachement validé dans la conversation, la pré-coche ne déclenche rien', () => {
    expect(blocSuiviVisible({
      estPremierMail: false, dejaClassee: false, reference: [], selection: ['LOT-B'],
    })).toBe(false);
  });

  it('⚠️ tant que la modale n’a rien dit (sélection inconnue), pas de bloc', () => {
    expect(blocSuiviVisible(decor(null))).toBe(false);
  });

  it('⚠️ l’ordre et les doublons ne font pas un changement', () => {
    expect(memesBiens(['A', 'B'], ['B', 'A'])).toBe(true);
    expect(memesBiens(['A', 'A', 'B'], ['B', 'A'])).toBe(true);
    expect(memesBiens(['A'], ['A', 'B'])).toBe(false);
    expect(memesBiens([], [])).toBe(true);
    expect(blocSuiviVisible({ ...decor(['LOT-A', 'LOT-A']) })).toBe(false);
  });

  /** 🔴 « avec “Ce mail et la conversation à venir” coché par défaut » (Arno). */
  it('🔴 le choix par défaut est « la conversation à venir »', () => {
    expect(SUIVI_DEFAUT).toBe('suite');
  });
});

describe('🔴🔴 ④ ce que chaque choix écrit', () => {
  const periodes = [periode(1, 1, bien('A'))];

  it('🔴 « Ce mail uniquement » pose une EXCEPTION, et rien d’autre', () => {
    const e = effetDuChoix({ choix: 'mail', messageId: 5, classement: bien('C'), periodes, exceptions: [] });
    expect(e.nouvelleException).toEqual({ messageId: 5, classement: bien('C') });
    expect(e.nouvellePeriode).toBeNull();
    expect(e.periodesRemplacees).toEqual([]);
  });

  it('🔴 « Ce mail et la suite » ouvre une PÉRIODE, et ne remplace rien', () => {
    const e = effetDuChoix({ choix: 'suite', messageId: 5, classement: bien('B'), periodes, exceptions: [] });
    expect(e.nouvellePeriode).toEqual({ depuisMessageId: 5, classement: bien('B') });
    expect(e.nouvelleException).toBeNull();
    expect(e.periodesRemplacees).toEqual([]);
  });

  it('🔴🔴 « Toute la conversation » remplace TOUTES les périodes', () => {
    const e = effetDuChoix({
      choix: 'conversation', messageId: 5, classement: bien('D'),
      periodes: [periode(1, 1, bien('A')), periode(2, 3, bien('B'))], exceptions: [],
    });
    expect(e.periodesRemplacees.sort()).toEqual([1, 2]);
    expect(e.nouvelleException).toBeNull();
  });

  /**
   * ⚠️ UN MAIL QUI PORTAIT UNE EXCEPTION ET QU'ON RECLASSE EN PÉRIODE LA PERD — sinon elle masquerait aussitôt
   * la règle qu'on vient de poser sur ce mail même, et le geste n'aurait aucun effet visible.
   */
  it('⚠️ reclasser en période un mail qui portait une exception la retire', () => {
    const exceptions = [exception(5, bien('C'))];
    expect(effetDuChoix({ choix: 'suite', messageId: 5, classement: bien('B'), periodes, exceptions })
      .exceptionRetiree).toBe(5);
    expect(effetDuChoix({ choix: 'conversation', messageId: 5, classement: bien('B'), periodes, exceptions })
      .exceptionRetiree).toBe(5);
    // …mais reposer une EXCEPTION sur ce mail ne « retire » rien : elle est simplement remplacée.
    expect(effetDuChoix({ choix: 'mail', messageId: 5, classement: bien('B'), periodes, exceptions })
      .exceptionRetiree).toBeNull();
  });
});

/**
 * ══ 🔴🔴 ⑤ L'ALERTE DE « TOUTE LA CONVERSATION » ══════════════════════════════════════════════════════════════
 *
 * ARNO : « une alerte explique la conséquence (“Les N mails de cette conversation seront reclassés sur … ; les M
 * exceptions sont conservées”) et doit être confirmée. Sans confirmation, “Valider” reste bloqué. »
 */
describe('🔴🔴 ⑤ ce que l’alerte annonce', () => {
  it('🔴 sans exception : le nombre de mails, et rien de plus', () => {
    expect(alerteTouteLaConversation({
      mails: [1, 2, 3], exceptions: [], versQuoi: '10 rue Chateaubriand — Parking', messageId: 3,
    })).toBe('Les 3 mails de cette conversation seront reclassés sur 10 rue Chateaubriand — Parking.');
  });

  /** ⚠️ ON NE COMPTE PAS LES MAILS QU'ON NE RECLASSE PAS : une alerte qui exagère ne se lit plus. */
  it('🔴🔴 avec des exceptions : elles sortent du compte, et sont annoncées conservées', () => {
    expect(alerteTouteLaConversation({
      mails: [1, 2, 3, 4, 5], exceptions: [exception(2, bien('C')), exception(4, bien('E'))],
      versQuoi: 'Interne', messageId: 5,
    })).toBe('Les 3 mails de cette conversation seront reclassés sur Interne ; 2 exceptions sont conservées.');
  });

  it('⚠️ une seule exception se dit au singulier', () => {
    expect(alerteTouteLaConversation({
      mails: [1, 2], exceptions: [exception(1, bien('C'))], versQuoi: 'Interne', messageId: 2,
    })).toContain('1 exception est conservée.');
  });

  /** 🔴 LE MAIL QU'ON CLASSE CHANGE, MÊME S'IL PORTAIT UNE EXCEPTION : il est dans le compte. */
  it('🔴 le mail en cours est compté, même s’il portait une exception', () => {
    expect(alerteTouteLaConversation({
      mails: [1, 2, 3], exceptions: [exception(3, bien('C'))], versQuoi: 'Interne', messageId: 3,
    })).toBe('Les 3 mails de cette conversation seront reclassés sur Interne.');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑥ Interne et Hors gestion suivent la même logique', () => {
  const MAILS = [1, 2, 3, 4];

  it('🔴 « à partir de ce mail, la conversation devient interne »', () => {
    const p = projeter(MAILS, [periode(1, 1, bien('A')), periode(2, 3, INTERNE)], []);
    expect(p.get(2)?.sorte).toBe('biens');
    expect(p.get(3)?.sorte).toBe('interne');
    expect(p.get(4)?.sorte).toBe('interne');
  });

  it('🔴 une exception « hors gestion » ne déplace pas la période interne', () => {
    const p = projeter(MAILS, [periode(1, 1, INTERNE)], [exception(2, HORS)]);
    expect([p.get(1)?.sorte, p.get(2)?.sorte, p.get(3)?.sorte]).toEqual(['interne', 'hors_gestion', 'interne']);
  });

  it('🔴 un bien rattaché après une période interne rouvre une période « biens »', () => {
    const p = projeter(MAILS, [periode(1, 1, INTERNE), periode(2, 3, bien('A'))], []);
    expect(p.get(4)?.biens[0].cle).toBe('A');
  });

  it('les mots employés dans les repères', () => {
    expect(motClassement(INTERNE)).toBe('Interne');
    expect(motClassement(HORS)).toBe('Hors gestion');
    expect(motClassement(bien('A'))).toBe('lot A');
    expect(motClassement({ sorte: 'biens', biens: [] })).toBe('aucun bien');
    expect(classementVide({ sorte: 'biens', biens: [] })).toBe(true);
    expect(classementVide(INTERNE)).toBe(false);
  });
});

/**
 * ══ 🔴🔴 ⑦ L'HÉRITAGE À L'ARRIVÉE D'UN MAIL ═══════════════════════════════════════════════════════════════════
 *
 * ARNO : « Un nouveau mail d'une conversation hérite automatiquement de la période EN COURS (la dernière
 * ouverte), jamais d'une exception. »
 */
describe('🔴🔴 ⑦ un mail qui arrive hérite de la période en cours', () => {
  it('🔴 la dernière période ouverte, et non la première', () => {
    const p = periodeEnCours([1, 2, 3], [periode(1, 1, bien('A')), periode(2, 3, bien('B'))]);
    expect(p?.classement.biens[0].cle).toBe('B');
  });

  /** 🔴🔴 « JAMAIS D'UNE EXCEPTION » : la propager la transformerait en période, c'est-à-dire en son contraire. */
  it('🔴🔴 une exception sur le dernier mail ne s’hérite PAS', () => {
    const MAILS = [1, 2, 3];
    const periodes = [periode(1, 1, bien('A'))];
    const exceptions = [exception(3, bien('C'))];
    expect(periodeEnCours(MAILS, periodes)?.classement.biens[0].cle).toBe('A');
    // …et le mail 4, qui arrive, porte bien A — pas C.
    const p = projeter([...MAILS, 4], periodes, exceptions);
    expect(p.get(4)?.biens[0].cle).toBe('A');
    expect(p.get(3)?.biens[0].cle).toBe('C');
  });

  it('⚠️ aucune période ⇒ rien à hériter, et le mail reste à classer', () => {
    expect(periodeEnCours([1, 2], [])).toBeNull();
    expect(projeter([1, 2], [], []).size).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑧ les repères dans le fil', () => {
  it('🔴 une ligne par changement de période, avec qui et quand', () => {
    const r = reperesDuFil([1, 2, 3, 4], [
      periode(1, 1, bien('A')),
      { ...periode(2, 3, INTERNE), parLibelle: 'a.jorel', le: '2026-10-01' },
    ]);
    expect(r).toEqual([
      { id: 2, avantMessageId: 3, versQuoi: 'Interne', parLibelle: 'a.jorel', le: '2026-10-01' },
    ]);
  });

  /**
   * ══ 🔴🔴 PLUSIEURS PÉRIODES PEUVENT COMMENCER AU MÊME MAIL — ET CHACUNE GARDE SON IDENTITÉ ══════════════════
   *
   * CONSTAT (02/10/2026, console du navigateur, fil 3490) : « Encountered two children with the same key,
   * rep-57368. » Ce fil porte TROIS périodes vivantes sur le message 57368 — une posée par la reprise de la
   * migration 290, deux posées à la main le même jour. L'écran les identifiait par le MAIL : trois lignes, une
   * seule clé. React prévient alors que des enfants peuvent être dupliqués ou OMIS — autrement dit qu'une ligne
   * « À partir d'ici » pouvait disparaître de l'écran sans que personne le sache.
   *
   * 🔴 `avantMessageId` DIT OÙ LA LIGNE SE POSE, PAS QUI ELLE EST. Seul l'identifiant de la période est unique.
   */
  it('🔴🔴 trois périodes sur le même mail rendent trois repères, à trois identités distinctes', () => {
    const r = reperesDuFil([1, 2, 3], [
      periode(17667, 2, bien('A')),
      periode(23811, 2, bien('B')),
      periode(23812, 2, bien('C')),
    ]);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.avantMessageId)).toEqual([2, 2, 2]);
    // 🔴 TROIS CLÉS DIFFÉRENTES : c'est tout ce que l'écran demande pour ne rien perdre.
    expect(new Set(r.map((x) => x.id)).size).toBe(3);
    expect(r.map((x) => x.id)).toEqual([17667, 23811, 23812]);
  });

  /** ⚠️ « À partir d'ici » EN TÊTE DE CONVERSATION NE SÉPARE RIEN : la première période n'a pas de repère. */
  it('⚠️ la période qui commence au premier mail ne produit aucun repère', () => {
    expect(reperesDuFil([1, 2], [periode(1, 1, bien('A'))])).toEqual([]);
  });

  it('⚠️ une période hors de la conversation n’en produit pas non plus', () => {
    expect(reperesDuFil([1, 2], [periode(1, 99, bien('A'))])).toEqual([]);
  });
});

/**
 * ══ 🔴🔴 ⑨ LA REPRISE DES DONNÉES EXISTANTES ══════════════════════════════════════════════════════════════════
 *
 * ARNO (point 6) : « Reprends les rattachements actuels sans rien perdre : chaque conversation existante devient
 * une période initiale, et un rattachement posé sur un seul mail est repris comme exception. »
 *
 * 🔴 LE CRITÈRE DE SUCCÈS EST `repriseFidele` : on reprojette, et l'on compare couple par couple.
 */
describe('🔴🔴 ⑨ reprendre l’existant sans rien perdre', () => {
  const B = (cle: string) => [{ cle, libelle: `lot ${cle}` }];

  it('🔴 une conversation entièrement sur un bien : UNE période, aucune exception', () => {
    const c = { mails: [1, 2, 3].map((messageId) => ({ messageId, biens: B('A') })) };
    const r = reprendre(c);
    expect(r.periodes).toEqual([{ depuisMessageId: 1, classement: { sorte: 'biens', biens: B('A') } }]);
    expect(r.exceptions).toEqual([]);
    expect(repriseFidele(c, r)).toBe(true);
  });

  /** 🔴🔴 « UN RATTACHEMENT POSÉ SUR UN SEUL MAIL EST REPRIS COMME EXCEPTION ». */
  it('🔴🔴 un bien qui n’apparaît qu’une fois devient une exception', () => {
    const c = { mails: [
      { messageId: 1, biens: B('A') }, { messageId: 2, biens: B('C') }, { messageId: 3, biens: B('A') },
    ] };
    const r = reprendre(c);
    expect(r.periodes).toHaveLength(1);
    expect(r.exceptions).toEqual([{ messageId: 2, classement: { sorte: 'biens', biens: B('C') } }]);
    expect(repriseFidele(c, r)).toBe(true);
  });

  /** 🔴 UN CHANGEMENT DURABLE EST UNE PÉRIODE, pas une exception : l'ensemble revient. */
  it('🔴 un ensemble qui se répète ensuite est une PÉRIODE', () => {
    const c = { mails: [
      { messageId: 1, biens: B('A') }, { messageId: 2, biens: B('B') }, { messageId: 3, biens: B('B') },
    ] };
    const r = reprendre(c);
    expect(r.periodes.map((p) => p.depuisMessageId)).toEqual([1, 2]);
    expect(r.exceptions).toEqual([]);
    expect(repriseFidele(c, r)).toBe(true);
  });

  /** ⚠️ UN MAIL SANS BIEN, SOUS UNE PÉRIODE QUI EN PORTE, EST UNE EXCEPTION VIDE : il n'était rattaché à rien. */
  it('⚠️ un mail non rattaché au milieu d’une période ne s’en voit pas attribuer un', () => {
    const c = { mails: [
      { messageId: 1, biens: B('A') }, { messageId: 2, biens: [] }, { messageId: 3, biens: B('A') },
    ] };
    const r = reprendre(c);
    expect(r.exceptions).toEqual([{ messageId: 2, classement: { sorte: 'biens', biens: [] } }]);
    expect(repriseFidele(c, r)).toBe(true);
  });

  it('⚠️ une conversation sans aucun rattachement ne crée rien', () => {
    const c = { mails: [{ messageId: 1, biens: [] }, { messageId: 2, biens: [] }] };
    expect(reprendre(c)).toEqual({ periodes: [], exceptions: [] });
    expect(repriseFidele(c, reprendre(c))).toBe(true);
  });

  it('⚠️ les mails d’avant le premier rattachement restent à classer', () => {
    const c = { mails: [
      { messageId: 1, biens: [] }, { messageId: 2, biens: B('A') }, { messageId: 3, biens: B('A') },
    ] };
    const r = reprendre(c);
    expect(r.periodes[0].depuisMessageId).toBe(2);
    expect(r.exceptions).toEqual([]);
    expect(repriseFidele(c, r)).toBe(true);
  });

  it('🔴 plusieurs biens sur un même mail sont repris ensemble', () => {
    const deux = [{ cle: 'A', libelle: 'lot A' }, { cle: 'B', libelle: 'lot B' }];
    const c = { mails: [{ messageId: 1, biens: deux }, { messageId: 2, biens: deux }] };
    const r = reprendre(c);
    expect(r.periodes[0].classement.biens).toHaveLength(2);
    expect(repriseFidele(c, r)).toBe(true);
  });

  /** 🔴🔴 LE SCÉNARIO D'ARNO, REPRIS DEPUIS L'EXISTANT : il doit se retrouver tel quel. */
  it('🔴🔴 le scénario d’Arno se reprend à l’identique', () => {
    const c = { mails: [
      { messageId: 1, biens: B('A') }, { messageId: 2, biens: B('A') }, { messageId: 3, biens: B('A') },
      { messageId: 4, biens: B('C') }, { messageId: 5, biens: B('A') },
      { messageId: 6, biens: B('B') }, { messageId: 7, biens: B('B') }, { messageId: 8, biens: B('B') },
    ] };
    const r = reprendre(c);
    expect(repriseFidele(c, r)).toBe(true);
    expect(r.periodes.map((p) => p.depuisMessageId)).toEqual([1, 6]);
    expect(r.exceptions.map((e) => e.messageId)).toEqual([4]);
  });
});

/** 🔒 LE MODULE EST PUR : il ne connaît ni la base, ni l'horloge, ni l'écran. */
/**
 * ══ 🔴🔴 ⑩ LOT BULLE-INFO-ET-S12 — QUAND LA FENÊTRE ET L'EXPÉDITEUR SE CONTREDISENT ═══════════════════════════
 *
 * DÉCISION D'ARNO (01/10/2026), en réponse au scénario S12 : « La fenêtre gagne. Le mail est rattaché aux biens
 * de la fenêtre. Si l'adresse de l'expéditeur désigne un AUTRE bien, ce bien devient une proposition DÉCOCHÉE. »
 */
describe('🔴🔴 ⑩ la fenêtre gagne', () => {
  const fenetre = (...cles: string[]) => ({ sorte: 'biens' as const, biens: cles.map((c) => ({ cle: c, libelle: c })) });

  it('🔴🔴 un bien que la fenêtre NE porte PAS se PROPOSE, il ne se confirme pas', () => {
    expect(faceALaFenetre(fenetre('A'), 'C')).toBe('propose');
  });

  it('🔴 un bien que la fenêtre porte se confirme, comme avant', () => {
    expect(faceALaFenetre(fenetre('A'), 'A')).toBe('confirme');
    expect(faceALaFenetre(fenetre('A', 'B'), 'B')).toBe('confirme');
  });

  /** ⚠️ AUCUNE FENÊTRE ⇒ RIEN NE CHANGE : c'est le cas de l'immense majorité du courrier. */
  it('🔴🔴 sans fenêtre, le comportement est EXACTEMENT celui d’avant', () => {
    expect(faceALaFenetre(undefined, 'A')).toBe('confirme');
  });

  /** 🔴 UNE FENÊTRE « INTERNE » OU « HORS GESTION » NE PORTE AUCUN BIEN : tout bien y est « un autre bien ». */
  it('🔴 sous une fenêtre « interne » ou « hors gestion », le moteur ne confirme rien', () => {
    expect(faceALaFenetre({ sorte: 'interne', biens: [] }, 'A')).toBe('propose');
    expect(faceALaFenetre({ sorte: 'hors_gestion', biens: [] }, 'A')).toBe('propose');
  });

  it('⚠️ une fenêtre vide ne confirme rien non plus', () => {
    expect(faceALaFenetre({ sorte: 'biens', biens: [] }, 'A')).toBe('propose');
  });
});

describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/periodesConversation.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
    expect(/fetch\(|query\(|new Date\(/.test(src)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — LA SECONDE PORTE (décision d'Arno du 02/10/2026)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   « Conversation JAMAIS rattachée (aucune période, aucune exception, aucun rattachement confirmé), expéditeur
   CONNU des fiches propriétaires/locataires : le bloc à 3 choix est TOUJOURS affiché dès l'ouverture de la
   modale, quelle que soit la position du mail dans la conversation (1er mail compris), sans condition de
   changement. »

   ⚠️ LA RÈGLE DU 01/10 NE CHANGE PAS D'UN MOT — les épreuves ci-dessus le gardent, et elles n'ont pas bougé.
   Celles-ci n'éprouvent QUE la porte nouvelle. */

describe('🔴🔴 ⑫ conversation JAMAIS rattachée : le bloc est toujours là pour un expéditeur connu', () => {
  /** Jamais rattachée : ni période, ni exception, ni rattachement validé. La référence est donc vide. */
  const jamais = (o: Partial<Parameters<typeof blocSuiviVisible>[0]> = {}) => blocSuiviVisible({
    estPremierMail: false, dejaClassee: false, reference: [], selection: [], expediteurConnu: true, ...o,
  });

  it('🔴🔴 au PREMIER mail : visible — c’est là que le premier classement se décide', () => {
    expect(jamais({ estPremierMail: true })).toBe(true);
  });

  it('🔴🔴 au troisième mail, SANS qu’on ait rien changé : visible', () => {
    expect(jamais({ estPremierMail: false, selection: [] })).toBe(true);
  });

  it('🔴 visible quelle que soit la sélection — il n’y a aucune condition de changement', () => {
    expect(jamais({ selection: ['LOT-A'] })).toBe(true);
    expect(jamais({ selection: ['LOT-A', 'LOT-B'] })).toBe(true);
    /**
     * ⚠️ MÊME QUAND LA MODALE N'A ENCORE RIEN DIT (`selection: null`). Dans la règle ①, `null` veut dire « on ne
     * sait pas s'il y a eu un changement », donc pas de bloc. Ici il n'y a rien à comparer : le bloc ne dépend
     * d'aucun changement, et attendre la première case cochée le ferait apparaître en sautant sous les yeux.
     */
    expect(jamais({ selection: null })).toBe(true);
  });

  it('🔴 une pré-coche du moteur ne change rien : elle n’est ni une condition, ni un rattachement', () => {
    // Le moteur a coché LOT-A d'avance ; rien n'est validé pour autant, et le bloc était déjà là sans elle.
    expect(jamais({ selection: ['LOT-A'], reference: [] })).toBe(true);
  });

  it('🔴🔴 EXPÉDITEUR INCONNU : pas de bloc — c’est l’étape 2 qui porte le suivi, et elle seule', () => {
    /**
     * 🔴 L'INVARIANT : le bloc à 3 choix et l'étape 2 ne s'affichent JAMAIS ensemble. Deux blocs de suivi pour un
     * seul geste donneraient deux réponses possibles à la même question.
     */
    expect(jamais({ expediteurConnu: false })).toBe(false);
    expect(jamais({ expediteurConnu: false, estPremierMail: true })).toBe(false);
  });

  it('⚠️ `expediteurConnu` ABSENT vaut « non » : c’est le comportement d’AVANT ce lot', () => {
    // Tout ce qui appelait cette fonction avant le 02/10/2026 ne passe pas ce champ.
    expect(blocSuiviVisible({
      estPremierMail: false, dejaClassee: false, reference: [], selection: ['LOT-B'],
    })).toBe(false);
  });

  it('🔴🔴 DÈS QUE LA CONVERSATION EST RATTACHÉE, la règle ① reprend la main', () => {
    const rattachee = (selection: readonly string[]) => blocSuiviVisible({
      estPremierMail: false, dejaClassee: true, reference: ['LOT-A'], selection, expediteurConnu: true,
    });
    // Sans changement : caché, alors même que l'expéditeur est connu — la règle ② ne déborde pas sur la ①.
    expect(rattachee(['LOT-A'])).toBe(false);
    // Avec changement : visible, comme depuis le 01/10.
    expect(rattachee(['LOT-B'])).toBe(true);
    // Et le premier mail d'une conversation rattachée reste muet.
    expect(blocSuiviVisible({
      estPremierMail: true, dejaClassee: true, reference: ['LOT-A'], selection: ['LOT-B'],
      expediteurConnu: true,
    })).toBe(false);
  });
});
