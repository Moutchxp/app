import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gesteEtoileFil } from './gestesLigne';
import { ecouterEtoile } from '../../../../lib/gestion/signalEtoile';

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
 * 🔒 Aucun réseau, aucune base : `fetch` est simulé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const CONV = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const BTE = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
const PORTE = readFileSync('app/(admin)/admin/(protected)/gestion/gestesLigne.ts', 'utf8');

let vus: { filId: number; etoilee: boolean }[];
let stop: (() => void) | null = null;

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
    expect(vus).toEqual([{ filId: 42, etoilee: true }, { filId: 42, etoilee: true }]);
  });

  it('⚠️ et le serveur garde le dernier mot quand il rend autre chose', async () => {
    serveur({ ok: true, etoilee: false, touches: 0 });
    await gesteEtoileFil(42, true);
    expect(vus).toEqual([{ filId: 42, etoilee: true }, { filId: 42, etoilee: false }]);
  });
});

describe('② en cas d’échec, TOUTES reviennent — pas seulement celle qu’on a cliquée', () => {
  it('🔴🔴 un refus du serveur réémet l’état d’AVANT', async () => {
    serveur({ erreur: 'Droit retiré.' }, false);
    const r = await gesteEtoileFil(42, true);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Droit retiré.');
    expect(vus).toEqual([{ filId: 42, etoilee: true }, { filId: 42, etoilee: false }]);
  });

  it('🔴 une panne réseau aussi, et le message le dit', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as never;
    const r = await gesteEtoileFil(42, false);
    expect(r.message).toBe('Étoile impossible : le serveur n’a pas répondu.');
    /* On voulait éteindre : on revient donc à « allumée ». */
    expect(vus).toEqual([{ filId: 42, etoilee: false }, { filId: 42, etoilee: true }]);
  });

  it('⚠️ une réponse mal formée est un refus, pas une réussite silencieuse', async () => {
    serveur({ ok: true });
    const r = await gesteEtoileFil(42, true);
    expect(r.ok).toBe(false);
    expect(vus).toEqual([{ filId: 42, etoilee: true }, { filId: 42, etoilee: false }]);
  });
});

describe('③ plus aucun état privé : les écrans ÉCOUTENT, ils n’anticipent plus chacun pour soi', () => {
  /**
   * 🔴🔴 C'EST LA GARDE QUI EMPÊCHE LE DÉFAUT DE REVENIR. Chaque écran qui reposerait son propre état d'avance
   * recréerait un second état — et un second état, c'est la divergence mesurée à 721 ms. Ils doivent tous
   * apprendre la même chose au même endroit.
   */
  it('🔴🔴 la conversation ne pose plus son étoile d’avance', () => {
    expect(CONV).toContain('gesteEtoileFil(filId, !etoileFil.etoilee)');
    /* L'ancienne forme : un `setEtoileFil` avant l'appel, puis un autre pour se remettre droit. */
    expect(CONV).not.toContain('setEtoileFil((e) => ({ ...e, etoilee: vise }))');
    expect(CONV).not.toContain('setEtoileFil((e) => ({ ...e, etoilee: !vise }))');
  });

  it('🔴🔴 la liste non plus', () => {
    expect(BTE).toContain('const r = await gesteEtoileFil(filId, etoilee);');
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

describe('④ l’étoile PAR MESSAGE entre dans la boucle', () => {
  /**
   * 🔴🔴 C'ÉTAIT LA QUATRIÈME ÉTOILE, ET LA SEULE QUI N'ANNONÇAIT RIEN. Poser l'étoile d'un message rend
   * l'échange étoilé en base ; ni la ligne ni la grande étoile ne l'apprenaient, et la divergence SURVIVAIT à
   * l'aller-retour.
   */
  it('🔴🔴 poser une étoile de message annonce l’échange comme étoilé, tout de suite', () => {
    expect(CONV).toContain('if (vise) annoncerEtoile({ filId, etoilee: true });');
  });

  /**
   * 🔴 ET LA RETIRER NE DEVINE RIEN. Un autre message de l'échange peut encore porter la sienne : annoncer
   * « éteint » par symétrie éteindrait la ligne d'un échange qui reste étoilé. On relit, puis on annonce.
   */
  it('🔴 la retirer relit l’état de l’échange au lieu de le deviner', () => {
    expect(CONV).toContain('const e = await lireEtoileFil(filId);');
    expect(CONV).toContain('if (e.disponible) annoncerEtoile({ filId, etoilee: e.etoilee });');
  });

  it('⚠️ un refus remet l’étoile du message ET celle de l’échange', () => {
    expect(CONV).toContain('if (avant) setGmail((g) => new Map(g).set(m.messageId, avant));');
    expect(CONV).toContain('if (vise) annoncerEtoile({ filId, etoilee: etoileFil.etoilee });');
  });
});

describe('⑤ une seule porte d’écriture, et elle seule annonce', () => {
  it('🔴 la porte annonce trois fois au plus : voulu, confirmé, ou retour', () => {
    expect(PORTE).toContain('annoncerEtoile({ filId, etoilee });');
    expect(PORTE).toContain('annoncerEtoile({ filId, etoilee: !etoilee });');
    expect(PORTE).toContain('annoncerEtoile({ filId, etoilee: d.etoilee });');
  });

  /** ⚠️ AUCUN ÉCRAN NE RECOPIE LA ROUTE DE L'ÉTOILE D'ÉCHANGE : c'est ce qui tient « une seule porte » dans le temps. */
  it('⚠️ aucun écran ne recopie la route de l’étoile d’échange', () => {
    for (const [nom, src] of [['Conversation', CONV], ['BoiteMail', BTE]] as const) {
      expect(src, nom).not.toMatch(/fetch\(`\/api\/admin\/gestion\/fils\/\$\{[a-zA-Z.]+\}\/etoile`/);
    }
  });
});

describe('⑥ l’étoile du MESSAGE suit celle de l’échange, sans jamais mentir', () => {
  /**
   * ══ 🔴🔴 LA CINQUIÈME ÉTOILE, VUE SUR LA CAPTURE D'ARNO ═══════════════════════════════════════════════════════
   *
   * Sur son mail (fil 36748, un seul message), la grande étoile du bloc gris était rouge et l'étoile du MESSAGE,
   * juste au-dessus, restait en contour. Deux étoiles du même mail, deux états.
   *
   * 🔴 ET CE N'EST PAS UNE DEVINETTE : `basculerEtoileDuFil` écrit « un message à poser, TOUS les étoilés à
   * retirer ». L'écran peut donc en déduire l'état de chaque message, sans rien relire.
   */
  it('🔴🔴 éteindre l’échange éteint TOUS ses messages', () => {
    expect(CONV).toContain('for (const [id, etat] of n) if (etat) n.set(id, { ...etat, etoile: false });');
  });

  it('🔴🔴 allumer l’échange allume SON DERNIER message, et lui seul', () => {
    expect(CONV).toContain('const dernier = dernierMessage.current;');
    expect(CONV).toContain('if (etat) n.set(dernier, { ...etat, etoile: true });');
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

  /** ⚠️ ON NE TOUCHE QUE CE QU'ON CONNAÎT : un message dont l'état Gmail n'a pas été lu reste inconnu. */
  it('⚠️ un message dont l’état n’est pas lu n’est pas inventé', () => {
    expect(CONV).toContain('if (g.size === 0) return g;');
    expect(CONV).toContain('if (etat) n.set(id, { ...etat, etoile: false });');
  });
});
