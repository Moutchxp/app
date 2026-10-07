import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gesteEtoileFil, gesteEtoileMessage } from './gestesLigne';
import { ecouterEtoile, type SignalEtoile } from '../../../../lib/gestion/signalEtoile';

/**
 * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 1 — TOUTES LES ÉTOILES D'UN MAIL BOUGENT ENSEMBLE ════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (06/10/2026, fil 36748 / message 57568, Partoo) : « la grande étoile du mail ouvert est allumée
 * (rouge) alors que l'étoile de la ligne ne l'est pas. Les étoiles ne se synchronisent pas. »
 *
 * ═══ 🔴🔴 CE QUE LE DIAGNOSTIC A TROUVÉ : **QUATRE** ÉTATS, ET UN SEUL LIEN, TROP TARDIF ═══════════════════════
 *
 *   ① `BoiteMail.etoilees` — la ligne de la liste ET sa barre de survol (la barre n'a pas d'état à elle : elle
 *      reçoit celui de la liste). Par ÉCHANGE.
 *   ② `Conversation.etoileFil` — la grande étoile du bloc gris du mail ouvert. Par ÉCHANGE.
 *   ③ `Conversation.gmail` — l'étoile de CHAQUE message dans la conversation. Par MESSAGE, écrite par une AUTRE
 *      route (`messages/:id/gmail`), et qui **n'annonçait rien à personne**.
 *   ④ l'écran partagé n'affiche aucune étoile dans sa colonne de mails : il n'ajoute pas d'état.
 *
 * Le lien ① ↔ ② est `signalEtoile`, qui n'était émis qu'APRÈS la réponse du serveur. ③ était hors du compte.
 *
 * ═══ 🔴 MESURÉ À L'ÉCRAN AVANT CORRECTION (fil 36748, le cas d'Arno) ════════════════════════════════════════════
 *
 *   · clic sur la GRANDE étoile → elle bascule à 19 ms · écriture revenue à 656 ms · LIGNE à 740 ms  ⇒ 721 ms
 *   · clic sur la LIGNE         → elle bascule à 61 ms · GRANDE à 810 ms                              ⇒ 749 ms
 *
 * Et pour ③, la divergence ne se résorbait PAS d'elle-même : poser l'étoile d'un message rendait l'échange
 * étoilé en base sans que ni ① ni ② ne l'apprennent — c'est l'explication la plus probable de ce qu'Arno a vu.
 *
 * ═══ 🔴🔴 LOT ETOILE-PAR-MESSAGE (07/10/2026) — CE FICHIER A ÉTÉ REPRIS, ET VOICI POURQUOI ═════════════════════
 *
 * Le lot ci-dessus a bien supprimé le DÉLAI entre les étoiles d'un même mail. Il laissait intact un défaut d'une
 * autre nature, qu'Arno a constaté le lendemain sur le fil 36764 (« Facture Huissier », 3 mails) : les étoiles
 * basculaient ensemble, mais sur LE MAUVAIS MAIL. Le grain était le fil, pas le message — jusque dans le signal.
 *
 * Les cas ③ à ⑥ portaient cette déduction (« allumer l'échange allume son dernier message ») comme une garantie.
 * Elle n'en est plus une que pour un geste venu d'une LIGNE de la boîte, où elle est exacte ; pour un geste sur un
 * mail, il n'y a plus rien à déduire — le signal nomme le mail. Voir `Conversation.etoile.test.ts`.
 *
 * 🔒 Aucun réseau, aucune base : `fetch` est simulé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const CONV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const PORTE = readFileSync('app/(admin)/admin/(protected)/gestion/gestesLigne.ts', 'utf8');

let vus: SignalEtoile[];
let stop: (() => void) | null = null;

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — CE QU'UN GESTE D'ÉCHANGE ANNONCE ══════════════════════════════════════════════
 *
 * `messageId: null` dit « le geste porte sur l'ÉCHANGE » (la ligne de la boîte, sa barre de survol), et
 * `etoiles: null` dit « je ne connais pas les mails de cette conversation » : cette porte-là raisonne par échange,
 * elle n'a jamais lu les mails un par un. Les listes gardent donc ce qu'elles montrent, et la relecture suivante
 * les remet droites (lot ETOILE-LIGNE-DEUX-ETATS) — voir `gesteEtoileFil`.
 */
const duFil = (filId: number, etoilee: boolean): SignalEtoile =>
  ({ filId, messageId: null, etoilee, etoiles: null });

/** 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — un mail étoilé, tel que le signal le transporte désormais. */
const MAIL = { messageId: 57625, de: 'gestion@criterimmo.fr', deNom: null, recuLe: '2026-10-06T14:31:00Z' };

beforeEach(() => { vus = []; stop = ecouterEtoile((s) => vus.push(s)); });
afterEach(() => { stop?.(); stop = null; vi.restoreAllMocks(); });

const serveur = (reponse: unknown, ok = true) => {
  global.fetch = vi.fn(async () => ({ ok, json: async () => reponse } as unknown as Response)) as never;
};

describe('① l’état voulu part AVANT l’écriture — c’est lui qui fait l’instantané', () => {
  /**
   * 🔴🔴 LA MESURE QUI COMPTE, ET ELLE EST DÉTERMINISTE : l'annonce est émise AVANT que le `fetch` ne soit même
   * appelé. Aucune étoile n'attend donc l'aller-retour, et « la même image » n'est pas une approximation — c'est
   * le même tour de boucle.
   */
  it('🔴🔴 l’annonce précède l’appel réseau', async () => {
    const ordre: string[] = [];
    stop?.(); stop = ecouterEtoile(() => ordre.push('annonce'));
    global.fetch = vi.fn(async () => {
      ordre.push('fetch');
      return { ok: true, json: async () => ({ ok: true, etoilee: true, touches: 1 }) } as unknown as Response;
    }) as never;
    await gesteEtoileFil(42, true);
    expect(ordre[0]).toBe('annonce');
    expect(ordre[1]).toBe('fetch');
  });

  it('🔴 l’état voulu, puis l’état confirmé — les deux pour tout le monde', async () => {
    serveur({ ok: true, etoilee: true, touches: 1 });
    const r = await gesteEtoileFil(42, true);
    expect(r.ok).toBe(true);
    expect(vus).toEqual([duFil(42, true), duFil(42, true)]);
  });

  it('⚠️ et le serveur garde le dernier mot quand il rend autre chose', async () => {
    serveur({ ok: true, etoilee: false, touches: 0 });
    await gesteEtoileFil(42, true);
    expect(vus).toEqual([duFil(42, true), duFil(42, false)]);
  });
});

describe('② en cas d’échec, TOUTES reviennent — pas seulement celle qu’on a cliquée', () => {
  it('🔴🔴 un refus du serveur réémet l’état d’AVANT', async () => {
    serveur({ erreur: 'Droit retiré.' }, false);
    const r = await gesteEtoileFil(42, true);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Droit retiré.');
    expect(vus).toEqual([duFil(42, true), duFil(42, false)]);
  });

  it('🔴 une panne réseau aussi, et le message le dit', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as never;
    const r = await gesteEtoileFil(42, false);
    expect(r.message).toBe('Étoile impossible : le serveur n’a pas répondu.');
    /* On voulait éteindre : on revient donc à « allumée ». */
    expect(vus).toEqual([duFil(42, false), duFil(42, true)]);
  });

  it('⚠️ une réponse mal formée est un refus, pas une réussite silencieuse', async () => {
    serveur({ ok: true });
    const r = await gesteEtoileFil(42, true);
    expect(r.ok).toBe(false);
    expect(vus).toEqual([duFil(42, true), duFil(42, false)]);
  });
});

describe('③ plus aucun état privé : les écrans ÉCOUTENT, ils n’anticipent plus chacun pour soi', () => {
  /**
   * 🔴🔴 C'EST LA GARDE QUI EMPÊCHE LE DÉFAUT DE REVENIR. Chaque écran qui reposerait son propre état d'avance
   * recréerait un second état — et un second état, c'est la divergence mesurée à 721 ms. Ils doivent tous
   * apprendre la même chose au même endroit.
   */
  it('🔴🔴 la conversation ne pose plus son étoile d’avance', () => {
    /* 🔴🔴 LOT ETOILE-PAR-MESSAGE — ELLE APPELLE LA PORTE **DU MESSAGE**, et plus celle de l'échange. */
    expect(CONV).toContain('const r = await gesteEtoileMessage({');
    /* L'ancienne forme : un état posé avant l'appel, puis un autre pour se remettre droit. */
    expect(CONV).not.toContain('setEtoileFil((e) => ({ ...e, etoilee: vise }))');
    expect(CONV).not.toContain('setEtoiles((e) => ({ ...e, etoilee: vise }))');
  });

  it('🔴🔴 la liste non plus', () => {
    /* 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — elle appelle la porte du MAIL QU'ELLE AFFICHE (et garde l'ancienne
       porte sans la migration 277, où l'étoile est celle de l'échange). */
    expect(BTE).toContain('const basculerEtoile = async (l: LigneEcran, poser: boolean) => {');
    expect(BTE).toContain('filId: l.filId, messageId: l.messageAffiche, etoilee: poser,');
    expect(BTE).not.toContain('setEtoilees((m) => new Map(m).set(filId, !etoilee))');
  });

  /** 🔴 LES DEUX ÉCOUTENT, et c'est par là qu'elles apprennent — y compris pour leur propre clic. */
  it('🔴 les deux écrans écoutent le signal', () => {
    expect(CONV).toContain('ecouterEtoile(');
    expect(BTE).toContain('ecouterEtoile(');
  });

  /** ⚠️ ET L'ÉCHEC SE DIT : Arno demande « un message court », y compris depuis la barre de survol d'une ligne. */
  it('⚠️ l’échec d’un geste de ligne a maintenant un chemin pour se dire', () => {
    expect(BTE).toContain('if (!r.ok) onGesteLigne?.(r.message);');
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8'))
      .toContain('onGeste={(m) => onGeste(m)}');
  });
});

describe('④ l’étoile PAR MESSAGE a maintenant SA porte, et elle annonce comme l’autre', () => {
  /**
   * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — CE CAS A CHANGÉ DE SUJET ═══════════════════════════════════════════════════
   *
   * IL VÉRIFIAIT que l'étoile d'un message annonçait l'étoile de l'ÉCHANGE (`annoncerEtoile({ filId, etoilee })`),
   * et que la retirer RELISAIT l'échange pour ne pas le deviner. C'était juste, et insuffisant : le signal ne
   * disait pas DE QUEL MAIL on parlait, et c'est de là que vient le bug du fil 36764 (07/10/2026).
   *
   * 🔴 L'APPEL RÉSEAU A QUITTÉ L'ÉCRAN. Il vivait dans `Conversation` (un `fetch` écrit à la main) ; il est
   * maintenant dans `gesteEtoileMessage`, éprouvable sans monter un écran — et c'est la règle du fichier
   * `gestesLigne` depuis le lot 5-BOITE-3.
   */
  it('🔴🔴 la porte du message annonce AVANT d’écrire, et elle nomme le mail', async () => {
    const ordre: string[] = [];
    stop?.(); stop = ecouterEtoile((s) => { ordre.push(`annonce:${String(s.messageId)}`); });
    global.fetch = vi.fn(async () => {
      ordre.push('fetch');
      return { ok: true, json: async () => ({ ok: true, etat: { etoile: true, nonLu: false } }) } as unknown as Response;
    }) as never;
    await gesteEtoileMessage({ filId: 36764, messageId: 57625, etoilee: true, etoilesAvant: null, etoilesApres: null });
    expect(ordre[0]).toBe('annonce:57625');
    expect(ordre[1]).toBe('fetch');
  });

  /**
   * 🔴🔴 ET ELLE ÉCRIT SUR LA ROUTE DU MAIL. La porte de l'ÉCHANGE pose l'étoile sur « le dernier message », ce
   * qui est exactement le débordement qu'Arno a constaté.
   */
  it('🔴🔴 elle écrit sur `/messages/<id>/gmail`, jamais sur `/fils/<id>/etoile`', async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (u: unknown) => {
      urls.push(String(u));
      return { ok: true, json: async () => ({ ok: true, etat: { etoile: true, nonLu: false } }) } as unknown as Response;
    }) as never;
    await gesteEtoileMessage({ filId: 36764, messageId: 57625, etoilee: true, etoilesAvant: null, etoilesApres: null });
    expect(urls).toEqual(['/api/admin/gestion/messages/57625/gmail']);
  });

  /**
   * 🔴 LA LIGNE DE LA BOÎTE REÇOIT SA PROPRE RÉPONSE, ET CE N'EST PAS CELLE DU MAIL. Sa règle ne change pas (« au
   * moins un mail de l'échange est étoilé ») ; c'est l'appelant qui la calcule, parce que lui seul connaît les
   * autres mails. Retirer une étoile parmi deux laisse donc la ligne allumée.
   */
  /**
   * ══ 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — ELLE TRANSPORTE **LA LISTE** DES MAILS ÉTOILÉS ═══════════════════════
   *
   * La LIGNE de la boîte a trois états (pleine / creuse / aucune) et doit pouvoir NOMMER l'autre mail étoilé :
   * un booléen « l'échange est-il étoilé ? » ne suffisait plus. L'appelant qui connaît la conversation — c'est la
   * conversation ouverte — passe donc la liste d'AVANT et celle d'APRÈS.
   */
  it('🔴 la liste d’APRÈS est annoncée, puis réémise au retour', async () => {
    serveur({ ok: true, etat: { etoile: false, nonLu: false } });
    const reste = [{ messageId: 57652, de: 'a@b.fr', deNom: null, recuLe: '2026-10-07T07:32:00Z' }];
    await gesteEtoileMessage({
      filId: 36764, messageId: 57625, etoilee: false, etoilesAvant: [...reste, MAIL], etoilesApres: reste,
    });
    expect(vus).toEqual([
      { filId: 36764, messageId: 57625, etoilee: false, etoiles: reste },
      { filId: 36764, messageId: 57625, etoilee: false, etoiles: reste },
    ]);
  });

  it('⚠️ un refus remet l’étoile du mail ET la liste d’avant', async () => {
    serveur({ erreur: 'Gmail refuse.' }, false);
    const r = await gesteEtoileMessage({
      filId: 36764, messageId: 57625, etoilee: true, etoilesAvant: [], etoilesApres: [MAIL],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Gmail refuse.');
    expect(vus).toEqual([
      { filId: 36764, messageId: 57625, etoilee: true, etoiles: [MAIL] },
      { filId: 36764, messageId: 57625, etoilee: false, etoiles: [] },
    ]);
  });

  /** ⚠️ ET GMAIL GARDE LE DERNIER MOT : s'il rend l'inverse, c'est la liste d'AVANT qui est réémise. */
  it('⚠️ quand Gmail rend autre chose, c’est la liste d’avant qui reste', async () => {
    serveur({ ok: true, etat: { etoile: false, nonLu: false } });
    await gesteEtoileMessage({
      filId: 36764, messageId: 57625, etoilee: true, etoilesAvant: [], etoilesApres: [MAIL],
    });
    expect(vus[1]).toEqual({ filId: 36764, messageId: 57625, etoilee: false, etoiles: [] });
  });

  /**
   * ⚠️ `null` RESTE LÉGITIME : c'est le clic parti d'une LIGNE, qui ne connaît que le mail qu'elle montre. Elle
   * se met quand même à jour, parce que `messageId` + `etoilee` lui suffisent pour SON mail.
   */
  it('⚠️ un appelant qui ne connaît pas la conversation passe `null`, et c’est transmis tel quel', async () => {
    serveur({ ok: true, etat: { etoile: true, nonLu: false } });
    await gesteEtoileMessage({
      filId: 36764, messageId: 57625, etoilee: true, etoilesAvant: null, etoilesApres: null,
    });
    expect(vus[0]).toEqual({ filId: 36764, messageId: 57625, etoilee: true, etoiles: null });
  });
});

describe('⑤ une porte par grain, et chacune seule à annoncer', () => {
  it('🔴 la porte de l’ÉCHANGE annonce trois fois au plus : voulu, confirmé, ou retour', () => {
    expect(PORTE).toContain('const annonce = (e: boolean) => annoncerEtoile({ filId, messageId: null, '
      + 'etoilee: e, etoiles: null });');
    expect(PORTE).toContain('annonce(etoilee);');
    expect(PORTE).toContain('annonce(!etoilee);');
    expect(PORTE).toContain('annonce(d.etoilee);');
  });

  /**
   * 🔴🔴 LOT ETOILE-PAR-MESSAGE — ET LA PORTE DU **MAIL** ANNONCE DE MÊME, avec l'identifiant du message et la
   * réponse destinée à la ligne de la boîte.
   */
  it('🔴🔴 la porte du MAIL annonce de même, en nommant le mail', () => {
    expect(PORTE).toContain('annoncerEtoile({ filId: o.filId, messageId: o.messageId, etoilee, etoiles });');
    expect(PORTE).toContain('annonce(o.etoilee, o.etoilesApres);');
    expect(PORTE).toContain('annonce(!o.etoilee, o.etoilesAvant);');
  });

  /** ⚠️ AUCUN ÉCRAN NE RECOPIE UNE ROUTE D'ÉTOILE : c'est ce qui tient « une seule porte » dans le temps. */
  it('⚠️ aucun écran ne recopie une route d’étoile', () => {
    for (const [nom, src] of [['Conversation', CONV], ['BoiteMail', BTE]] as const) {
      expect(src, nom).not.toMatch(/fetch\(`\/api\/admin\/gestion\/fils\/\$\{[a-zA-Z.]+\}\/etoile`/);
    }
    /* 🔴 ET PLUS L'APPEL ÉCRIT À LA MAIN DANS LA CONVERSATION : il est parti dans `gesteEtoileMessage`. */
    expect(CONV).not.toContain("body: JSON.stringify({ action: 'etoile' })");
  });
});

describe('⑥ les étoiles d’un MAIL se suivent, et uniquement entre elles', () => {
  /**
   * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — CE CAS A CHANGÉ DE VERDICT ═════════════════════════════════════════════════
   *
   * IL EXIGEAIT QUE L'ÉCRAN DÉDUISE l'étoile de chaque mail de celle de l'ÉCHANGE : « éteindre l'échange éteint
   * tous ses messages, l'allumer allume son dernier ». C'était la seule déduction possible tant que le signal ne
   * portait pas d'identifiant de mail — et c'est cette déduction qui allumait le mauvais mail.
   *
   * 🔴 ELLE NE SUBSISTE QUE POUR UN GESTE VENU D'UNE **LIGNE** de la boîte (`messageId: null`), où elle est
   * exacte : la route de l'échange fait littéralement cela. Pour un geste sur un mail, il n'y a plus rien à
   * déduire — le signal le nomme.
   */
  it('🔴🔴 un geste sur un MAIL ne touche que son identifiant', () => {
    expect(CONV).toContain('if (!sig.etoilee) return { ...e, mails: e.mails.filter((m) => m.messageId !== id) };');
  });

  it('🔴 un geste sur l’ÉCHANGE garde la règle de sa porte : tous éteints, ou le dernier allumé', () => {
    expect(CONV).toContain('if (!sig.etoilee) return { ...e, mails: [] };');
    expect(CONV).toContain('const dernier = dernierMessage.current;');
  });

  /**
   * 🔴 « LE DERNIER » EST CELUI DE LA ROUTE — `recu_le DESC, id DESC` —, PAS LE PLUS GRAND IDENTIFIANT. Un mail
   * reçu plus tôt mais capturé plus tard porte un identifiant plus grand : viser l'identifiant allumerait le
   * mauvais message, rarement, donc d'autant plus difficilement repérable.
   */
  it('🔴 le repère est trié comme la route, et tenu dans un `ref`', () => {
    expect(CONV).toContain('ms.sort((a, b) => (a.recuLe === b.recuLe ? a.messageId - b.messageId '
      + ': (a.recuLe < b.recuLe ? -1 : 1)));');
    expect(CONV).toContain('const dernierMessage = useRef<number | null>(null);');
    /* ⚠️ Un `ref`, parce que l'écoute ne dépend que de `filId` : y lire `vue` en figerait la valeur. */
    expect(CONV).toContain('}, [vue]);');
  });

  /**
   * 🔴🔴 ET LES DEUX ÉTOILES D'UN MAIL LISENT UNE SEULE VALEUR — c'est la forme du code qui tient la règle
   * d'Arno « synchronisées entre elles, et uniquement entre elles », pas une vigilance à répéter.
   */
  it('🔴🔴 une seule valeur lue pour les deux étoiles d’un mail', () => {
    expect(CONV).toContain('const etoilePosee = etoileDuMessage?.etoilee ?? gmail?.etat?.etoile ?? false;');
  });

  /**
   * 🔴🔴 LOT ETOILE-LIGNE-DEUX-ETATS — LA RÈGLE DES TROIS ÉTATS N'EST ÉCRITE QU'À UN SEUL ENDROIT, et les deux
   * côtés la lisent : le serveur qui compose les lignes, l'écran qui les met à jour après un clic. Deux écritures
   * auraient fini par dessiner une étoile ici et une autre là — c'est le défaut même qu'on répare.
   */
  it('🔴🔴 serveur et écran lisent le MÊME module pur', () => {
    for (const f of ['app/lib/gestion/boiteRepo.ts', 'app/lib/gestion/rechercheBoite.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain("from './etoileLigne'");
    }
    expect(BTE).toContain("from '../../../../lib/gestion/etoileLigne'");
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/BarreLigne.tsx', 'utf8'))
      .toContain("from '../../../../lib/gestion/etoileLigne'");
  });

  /**
   * ⚠️ LA LIGNE DE LA BOÎTE, ELLE, NE LIT PLUS `etoilee` — qui porte l'état d'UN mail — mais `filEtoile`, la
   * réponse à SA question. Sa règle est inchangée : « au moins un mail de l'échange est étoilé ».
   */
  it('⚠️ la ligne de la boîte recalcule ses trois états par le module PUR', () => {
    expect(BTE).toContain('const apres = etoileLigneApresSignal(avant, ligne.messageAffiche, sig);');
    /* ⚠️ ELLE PART DE CE QUE LE SERVEUR A RENDU quand elle n'a encore rien posé sur place : sinon une CREUSE
       cliquée repartirait d'un état vide et perdrait l'autre mail étoilé. */
    expect(BTE).toContain('const avant = m.get(sig.filId) ?? ligne.etoile ?? ETOILE_LIGNE_VIDE;');
  });
});
