// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import { gesteEtoileMessage, lireEtoilesDuFil } from './gestesLigne';
import { annoncerEtoile, ecouterEtoile } from '../../../../lib/gestion/signalEtoile';

/**
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — L'ÉTOILE D'UN MAIL NE DÉBORDE JAMAIS SUR UN AUTRE ═════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * BUG CONSTATÉ PAR ARNO (07/10/2026, fil 36764 « Facture Huissier », 3 mails) : il clique la GRANDE étoile du mail
 * déplié du 06/10 16:31 (De Gestion CRITERIMMO À Jean David Bile) ; c'est l'étoile du mail du HAUT (07/10 09:32)
 * qui s'allume en rouge.
 *
 * ═══ 🔴🔴 CE QUE LE DIAGNOSTIC A TROUVÉ — TROIS GRAINS, ET AUCUN N'ÉTAIT LE BON ═══════════════════════════════
 *
 *   ① L'ÉTAT était celui de l'ÉCHANGE (`etoileFil`, un booléen « au moins un mail est étoilé ») : les trois
 *      grandes étoiles du fil affichaient donc la MÊME chose, et aucune ne parlait de son mail.
 *   ② LA PORTE D'ÉCRITURE était celle de l'ÉCHANGE (`POST /fils/:id/etoile`) : elle ne reçoit AUCUN identifiant
 *      de message et pose l'étoile sur « le dernier message de l'échange » (`recu_le DESC, id DESC`).
 *   ③ LE SIGNAL ne portait que `{ filId, etoilee }` : l'écran devait DEVINER quel mail allumer, et devinait
 *      « le dernier » — la même règle que la porte, donc la même erreur.
 *
 * MESURÉ EN BASE sur le fil 36764 : `gestion_message.etoile_le` posé sur le message 57652 (07/10 09:32, le plus
 * récent), jamais sur le 57625 (06/10 16:31, celui qu'il avait sous le curseur).
 *
 * ═══ 🔴 RÈGLE D'ARNO, ÉPROUVÉE ICI ═════════════════════════════════════════════════════════════════════════════
 *
 * « Une étoile ne concerne QUE le mail sur lequel on clique. Elle ne déborde jamais sur un autre mail, ni de la
 * conversation, ni d'ailleurs. L'état, la porte d'écriture et l'affichage sont tous par IDENTIFIANT DE MESSAGE. »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① L'ÉTOILE EST LÀ, DANS LE BLOC D'EN-TÊTE DE CHAQUE MAIL, et elle dit l'état DE CE MAIL.
 *   ② CLIQUER ÉCRIT SUR LA ROUTE **DU MESSAGE**, jamais sur celle de l'échange.
 *   ③ LE CAS D'ARNO : 3 mails, étoile sur le 2ᵉ ⇒ SEUL le 2ᵉ est étoilé.
 *   ④ LES DEUX SENS DU SIGNAL, et il NOMME le mail.
 *   ⑤ CE QUI N'A PAS CHANGÉ : indisponible ⇒ aucune étoile, et un mail à la corbeille garde la sienne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

/** Les trois mails du fil d'Arno, aux heures qu'il a relevées. */
const M1 = 57625; // 06/10 16:31 — celui qu'il a cliqué
const M2 = 57646; // 06/10 20:53
const M3 = 57652; // 07/10 09:32 — LE PLUS RÉCENT, celui qui s'allumait à tort

const message = (id: number, recuLe: string, o: Record<string, unknown> = {}) => ({
  messageId: id, messageIdRfc: `<m${id}@criterimmo.fr>`, sens: 'envoye', de: 'gestion@criterimmo.fr',
  deNom: 'Gestion CRITERIMMO', recuLe, objet: 'Facture Huissier',
  corps: null, extrait: 'message', automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null, nonRemises: [],
  destA: null, destCc: null, destinatairesFondus: null, aHtml: false, html: null,
  aLaCorbeille: false, ...o,
});
const FIL = () => ({
  fil: { filId: 36764, objet: 'Facture Huissier', etat: 'a_classer', reference: null, evenementId: null },
  messages: messagesServis,
  partis: [],
});
const REDACTION = {
  adresseGestion: 'gestion@criterimmo.fr', signature: '', peutEnvoyer: true, schemaPret: true, delaiAnnulationS: 10,
};

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];
let etoileServie: { disponible: boolean; etoiles: number[] };
let messagesServis: Record<string, unknown>[];
/** L'état Gmail de chaque mail, tel que la vraie boîte le rendrait. La route le BASCULE, comme Gmail. */
let etoilesGmail: Map<number, boolean>;
let avecBarre: boolean;

const servir = (): void => {
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({ url: u, methode, corps: JSON.parse(String(init?.body ?? 'null')) });
    /* ⚠️ `/gmail` SE TESTE AVANT `/messages` : la route par message contient les deux mots. */
    const gmail = /\/messages\/(\d+)\/gmail/.exec(u);
    if (gmail !== null) {
      const id = Number(gmail[1]);
      if (methode === 'POST') {
        const vise = !(etoilesGmail.get(id) ?? false);
        etoilesGmail.set(id, vise);
        /* 🔴 LE MIROIR SUIT GMAIL, comme le fait le serveur : l'échange rendra désormais ce mail-là. */
        etoileServie = {
          disponible: etoileServie.disponible,
          etoiles: [...etoilesGmail].filter(([, e]) => e).map(([i]) => i),
        };
        return { ok: true, json: async () => ({ ok: true, etat: { etoile: vise, nonLu: false } }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ etat: { etoile: etoilesGmail.get(id) ?? false, nonLu: false } }),
      } as unknown as Response;
    }
    if (u.includes('/etoile')) return { ok: true, json: async () => etoileServie } as unknown as Response;
    if (u.includes('/messages')) return { ok: true, json: async () => FIL() } as unknown as Response;
    if (u.includes('/corps')) {
      return { ok: true, json: async () => ({ corps: 'texte', html: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.localStorage?.clear(); } catch { /* stockage refusé : le test vaut quand même */ }
  appels = [];
  etoileServie = { disponible: true, etoiles: [] };
  etoilesGmail = new Map();
  avecBarre = false;
  messagesServis = [
    message(M1, '2026-10-06T14:31:00Z'),
    message(M2, '2026-10-06T18:53:00Z'),
    message(M3, '2026-10-07T07:32:00Z'),
  ];
  servir();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 36764, maintenant: new Date('2026-10-07T12:00:00Z'), onGeste: () => {}, onFerme: () => {},
      ...(avecBarre ? { barreActions: true, redaction: REDACTION } : {}),
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement)?.click(); }); await calmer();
};
/**
 * ⚠️ LE BLOC D'EN-TÊTE — OÙ VIT LA GRANDE ÉTOILE — N'EXISTE QUE DÉPLIÉ, et un mail déjà déplié se REFERMERAIT
 * au clic. On regarde donc `aria-expanded` avant de cliquer, pour chacun.
 */
const deplierTout = async () => {
  for (const l of [...container.querySelectorAll('.cnv-ligne')]) {
    if (l.getAttribute('aria-expanded') !== 'true') await cliquer(l);
  }
};
/**
 * ⚠️ ON DÉSIGNE UN MAIL PAR `data-message`, JAMAIS PAR SA PLACE : l'ordre d'affichage est un réglage (plus récent
 * ou plus ancien d'abord), et viser « le deuxième du DOM » désignerait un autre mail selon le réglage. C'est
 * exactement l'ambiguïté dont le bug d'Arno est fait.
 */
const grandeEtoile = (id: number): HTMLButtonElement | null =>
  container.querySelector(`[data-message="${id}"] .cnv-entete-etoile`);
const pleine = (id: number): boolean =>
  grandeEtoile(id)?.className.includes('cnv-entete-etoile--pleine') === true;
/** L'étoile de la RANGÉE du mail (statut · heure · étoile · ⋮), celle qui n'existe qu'en plein écran. */
const etoileRangee = (id: number): HTMLButtonElement | null =>
  container.querySelector(`[data-message="${id}"] .cnv-etoile`);
const ecrituresEtoile = () => appels.filter((a) => a.methode === 'POST' && /\/gmail$/.test(a.url));

describe('🔴🔴 ① l’étoile du bloc d’en-tête dit l’état DE SON MAIL', () => {
  it('🔴 chaque mail déplié porte la sienne, dans la même case que la corbeille', async () => {
    await monter();
    await deplierTout();
    for (const id of [M1, M2, M3]) {
      expect(grandeEtoile(id), String(id)).not.toBeNull();
      /* 🔴 LA MÊME CASE QUE LA CORBEILLE : `cnv-corbeille` porte la taille et le fond. */
      expect(grandeEtoile(id)?.className).toContain('cnv-corbeille');
    }
  });

  /**
   * 🔴🔴 LE CŒUR DU LOT : UN SEUL MAIL ÉTOILÉ ⇒ UNE SEULE ÉTOILE ALLUMÉE. Avant ce lot, les trois affichaient
   * l'état de l'ÉCHANGE : étoiler n'importe lequel les allumait toutes les trois.
   */
  it('🔴🔴 un seul mail étoilé n’allume que SON étoile', async () => {
    etoileServie = { disponible: true, etoiles: [M2] };
    await monter();
    await deplierTout();
    expect(pleine(M2)).toBe(true);
    expect(pleine(M1)).toBe(false);
    expect(pleine(M3)).toBe(false);
  });

  /** 🔴 ÉTEINTE : CONTOUR, et le mot qui PROMET le geste — « Ajouter une étoile ». */
  it('🔴 éteinte : contour, et « Ajouter une étoile »', async () => {
    await monter();
    await deplierTout();
    expect(grandeEtoile(M1)?.getAttribute('title')).toBe('Ajouter une étoile');
    expect(grandeEtoile(M1)?.getAttribute('aria-pressed')).toBe('false');
  });

  /** 🔴 ALLUMÉE : ROUGE PLEINE, et « Retirer l'étoile ». Le MOT change, jamais la seule couleur. */
  it('🔴 allumée : pleine, et « Retirer l’étoile »', async () => {
    etoileServie = { disponible: true, etoiles: [M1] };
    await monter();
    await deplierTout();
    expect(pleine(M1)).toBe(true);
    expect(grandeEtoile(M1)?.getAttribute('title')).toBe('Retirer l’étoile');
    expect(grandeEtoile(M1)?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('🔴🔴 ② la porte d’écriture est celle du MESSAGE', () => {
  /**
   * 🔴🔴 LA CAUSE DU BUG, PRISE À LA RACINE. La grande étoile écrivait sur `POST /fils/:id/etoile`, qui ne reçoit
   * aucun identifiant de message et pose l'étoile sur « le dernier message de l'échange ». Elle écrit maintenant
   * sur la route DU MAIL cliqué — la même que l'étoile de sa rangée utilisait déjà.
   */
  it('🔴🔴 cliquer écrit sur `/messages/<ce mail>/gmail`, jamais sur `/fils/.../etoile`', async () => {
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M1));
    expect(ecrituresEtoile()).toHaveLength(1);
    expect(ecrituresEtoile()[0].url).toContain(`/messages/${M1}/gmail`);
    expect(ecrituresEtoile()[0].corps).toEqual({ action: 'etoile' });
    /* 🔴 ET PLUS RIEN SUR LA PORTE DE L'ÉCHANGE : c'est elle qui débordait sur un autre mail. */
    expect(appels.filter((a) => a.methode === 'POST' && a.url.includes('/etoile'))).toEqual([]);
  });

  it('⚠️ elle s’allume aussitôt, sans attendre la réponse du serveur', async () => {
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M1));
    expect(pleine(M1)).toBe(true);
  });

  /**
   * 🔴 UN REFUS DÉFAIT L'ÉTOILE : on ne laisse pas un mensonge allumé. C'est déjà la règle de la barre de survol,
   * et elle vaut d'autant plus ici que le mail ouvert reste à l'écran après le clic.
   */
  it('🔴 un refus du serveur remet l’étoile dans son état d’avant', async () => {
    await monter();
    await deplierTout();
    global.fetch = vi.fn(async () => (
      { ok: false, json: async () => ({ erreur: 'Gmail refuse.' }) } as unknown as Response)
    ) as unknown as typeof fetch;
    await cliquer(grandeEtoile(M1));
    expect(pleine(M1)).toBe(false);
  });
});

describe('🔴🔴 ③ LE CAS D’ARNO : 3 mails, étoile sur le 2ᵉ', () => {
  /**
   * ══ 🔴🔴 LE TEST QUE DEMANDE ARNO, MOT POUR MOT ══════════════════════════════════════════════════════════════
   * « 3 mails dans un fil, étoile sur le 2ᵉ → seul le 2ᵉ est étoilé, dans les deux écrans. »
   *
   * 🔴 ET IL ÉPROUVE LES TROIS GRAINS À LA FOIS : la route visée (le 2ᵉ mail), l'affichage (son étoile seule), et
   * ce que les autres mails ne font PAS (le 3ᵉ — le plus récent — est celui qui s'allumait à tort).
   */
  it('🔴🔴 seul le 2ᵉ mail est écrit, et seule son étoile s’allume', async () => {
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M2));

    /* ① LA ROUTE : le 2ᵉ mail, et lui seul. */
    expect(ecrituresEtoile().map((a) => a.url.replace(/^.*\/messages\//, '/messages/')))
      .toEqual([`/messages/${M2}/gmail`]);
    /* ② L'AFFICHAGE : son étoile, et elle seule. */
    expect(pleine(M2)).toBe(true);
    expect(pleine(M1)).toBe(false);
    /* 🔴 LE MAIL DU HAUT — LE PLUS RÉCENT — EST CELUI QUI S'ALLUMAIT À TORT. Il reste éteint. */
    expect(pleine(M3)).toBe(false);
    /* ③ L'ÉTAT GMAIL SIMULÉ : une seule étoile posée, sur le bon mail. */
    expect([...etoilesGmail].filter(([, e]) => e).map(([i]) => i)).toEqual([M2]);
  });

  /**
   * 🔴 ET LE RETRAIT NE DÉBORDE PAS DAVANTAGE. La porte de l'ÉCHANGE retirait l'étoile de TOUS les mails étoilés
   * du fil (c'est sa règle, et elle a du sens pour une LIGNE de la boîte) : depuis le mail ouvert, ce serait
   * décrocher l'étoile d'un mail qu'on ne regardait pas.
   */
  it('🔴 retirer l’étoile du 2ᵉ laisse celle du 1ᵉʳ en place', async () => {
    etoilesGmail = new Map([[M1, true], [M2, true]]);
    etoileServie = { disponible: true, etoiles: [M1, M2] };
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M2));
    expect(pleine(M2)).toBe(false);
    expect(pleine(M1)).toBe(true);
    expect(ecrituresEtoile()).toHaveLength(1);
  });

  /**
   * 🔴🔴 « LES TROIS ÉTOILES D'UN MÊME MAIL RESTENT SYNCHRONISÉES ENTRE ELLES » (Arno). En plein écran, un mail
   * en montre deux : celle de sa rangée et la grande du bloc gris. Cliquer l'une bascule les deux, dans la même
   * image — elles lisent un seul état et appellent une seule fonction.
   */
  it('🔴🔴 les deux étoiles d’un mail basculent ensemble, et celles des autres ne bougent pas', async () => {
    avecBarre = true;
    await monter();
    await deplierTout();
    expect(etoileRangee(M2), 'l’étoile de rangée existe en plein écran').not.toBeNull();
    await cliquer(etoileRangee(M2));
    expect(etoileRangee(M2)?.className).toContain('cnv-etoile--posee');
    expect(pleine(M2)).toBe(true);
    /* 🔴 ET RIEN CHEZ LES AUTRES, ni la rangée ni la grande. */
    expect(etoileRangee(M3)?.className).not.toContain('cnv-etoile--posee');
    expect(pleine(M3)).toBe(false);
    expect(pleine(M1)).toBe(false);
  });
});

describe('🔴🔴 ④ le signal NOMME le mail, dans les deux sens', () => {
  /**
   * 🔴🔴 LE SENS « MAIL OUVERT → LES AUTRES ÉCRANS ». La ligne de la boîte et sa barre de survol vivent dans
   * `BoiteMail`, montée à CÔTÉ de la conversation : c'est le signal qui les relie (voir `signalEtoile`).
   *
   * 🔴 DEUX ANNONCES PAR GESTE (lot INSTANTANE-ETOILE-CORBEILLE) : l'état VOULU avant l'écriture — toutes les
   * étoiles de ce mail basculent dans la même image —, puis l'état CONFIRMÉ par Gmail au retour.
   *
   * 🔴 ET `filEtoile` RÉPOND À LA LIGNE DE LA BOÎTE, dont la règle NE CHANGE PAS : elle s'allume dès qu'au moins
   * un mail de l'échange est étoilé. Poser ⇒ `true` à coup sûr.
   */
  it('🔴🔴 cliquer annonce le mail visé, l’état voulu puis le confirmé', async () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M1));
    stop();
    expect(vus).toEqual([
      { filId: 36764, messageId: M1, etoilee: true, filEtoile: true },
      { filId: 36764, messageId: M1, etoilee: true, filEtoile: true },
    ]);
  });

  /**
   * 🔴🔴 RETIRER L'ÉTOILE D'UN MAIL PARMI PLUSIEURS N'ÉTEINT PAS LA LIGNE. C'est la conversation qui le tranche —
   * elle seule connaît l'étoile de chacun de ses mails — et elle le dit dans `filEtoile`.
   */
  it('🔴🔴 retirer une étoile parmi deux annonce « l’échange reste étoilé »', async () => {
    etoilesGmail = new Map([[M1, true], [M2, true]]);
    etoileServie = { disponible: true, etoiles: [M1, M2] };
    const vus: { filEtoile: boolean | null }[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M2));
    stop();
    expect(vus[0]).toEqual({ filId: 36764, messageId: M2, etoilee: false, filEtoile: true });
  });

  /** 🔴 ET LA DERNIÈRE ÉTOILE RETIRÉE, ELLE, ÉTEINT BIEN LA LIGNE. */
  it('🔴 retirer la seule étoile de l’échange annonce « plus étoilé »', async () => {
    etoilesGmail = new Map([[M2, true]]);
    etoileServie = { disponible: true, etoiles: [M2] };
    const vus: { filEtoile: boolean | null }[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    await monter();
    await deplierTout();
    await cliquer(grandeEtoile(M2));
    stop();
    expect(vus[0]).toEqual({ filId: 36764, messageId: M2, etoilee: false, filEtoile: false });
  });

  /** 🔴🔴 LE SENS INVERSE : un signal venu d'ailleurs allume l'étoile DU MAIL QU'IL NOMME, et d'aucun autre. */
  it('🔴🔴 un signal venu d’ailleurs n’allume que le mail qu’il nomme', async () => {
    await monter();
    await deplierTout();
    await act(async () => {
      annoncerEtoile({ filId: 36764, messageId: M1, etoilee: true, filEtoile: true });
    });
    await calmer();
    expect(pleine(M1)).toBe(true);
    expect(pleine(M2)).toBe(false);
    expect(pleine(M3)).toBe(false);
    /* ⚠️ ET DANS L'AUTRE SENS AUSSI. */
    await act(async () => {
      annoncerEtoile({ filId: 36764, messageId: M1, etoilee: false, filEtoile: false });
    });
    await calmer();
    expect(pleine(M1)).toBe(false);
  });

  /**
   * ⚠️ `messageId: null` = LE GESTE EST VENU D'UNE **LIGNE** DE LA BOÎTE, où une ligne représente une
   * CONVERSATION. On applique alors la règle de cette porte, qui n'est pas symétrique : poser va sur le DERNIER
   * mail, retirer passe sur TOUS. Cette règle-là n'a pas changé, et Arno a demandé qu'elle ne change pas.
   */
  it('⚠️ un geste venu d’une LIGNE pose sur le dernier mail, et retire sur tous', async () => {
    await monter();
    await deplierTout();
    await act(async () => {
      annoncerEtoile({ filId: 36764, messageId: null, etoilee: true, filEtoile: true });
    });
    await calmer();
    expect(pleine(M3), 'le plus récent, celui que la route de l’échange vise').toBe(true);
    expect(pleine(M1)).toBe(false);
    expect(pleine(M2)).toBe(false);
    await act(async () => {
      annoncerEtoile({ filId: 36764, messageId: null, etoilee: false, filEtoile: false });
    });
    await calmer();
    expect(pleine(M3)).toBe(false);
  });

  /**
   * ⚠️ ON NE RETIENT QUE SON PROPRE ÉCHANGE : deux conversations peuvent être montées en même temps (l'écran
   * partagé en ouvre une, une carte vive une autre), et chacune ne doit s'allumer que pour elle.
   */
  it('⚠️ l’étoile d’un AUTRE échange n’allume rien ici', async () => {
    await monter();
    await deplierTout();
    await act(async () => {
      annoncerEtoile({ filId: 99999, messageId: M1, etoilee: true, filEtoile: true });
    });
    await calmer();
    expect(pleine(M1)).toBe(false);
  });
});

describe('🔴 ⑤ ce qui n’a pas changé', () => {
  /**
   * ⚠️ MIGRATION 277 ABSENTE ⇒ AUCUNE ÉTOILE. Une étoile éteinte dirait faussement « ce mail n'est pas suivi »,
   * là où la vérité est « on ne peut pas le savoir ». C'est déjà la règle de la barre de survol.
   */
  it('⚠️ geste impossible ⇒ aucune étoile, plutôt qu’une étoile éteinte', async () => {
    etoileServie = { disponible: false, etoiles: [] };
    await monter();
    await deplierTout();
    expect(grandeEtoile(M1)).toBeNull();
  });

  /** 🔴 « Dans la Corbeille, l'étoile reste disponible » (Arno) — là où la corbeille devient « Réintégrer ». */
  it('🔴 un mail à la corbeille garde son étoile', async () => {
    messagesServis = [message(M1, '2026-10-06T14:31:00Z', { aLaCorbeille: true })];
    await monter();
    await deplierTout();
    expect(grandeEtoile(M1)).not.toBeNull();
  });
});

describe('🔴 ⑥ la porte, et ce qu’elle lit', () => {
  /** 🔴 L'ÉTAT ANNONCÉ EST CELUI QUE GMAIL CONFIRME, jamais seulement celui qu'on a demandé. */
  it('🔴 c’est l’état RENDU par le serveur qui reste annoncé', async () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    global.fetch = vi.fn(async () => (
      /* ⚠️ Gmail rend `false` alors qu'on demandait `true` : quelqu'un a décroché l'étoile entre-temps. */
      { ok: true, json: async () => ({ ok: true, etat: { etoile: false, nonLu: false } }) } as unknown as Response)
    ) as unknown as typeof fetch;
    const r = await gesteEtoileMessage({ filId: 7, messageId: 51, etoilee: true, filAvant: false, filApres: true });
    stop();
    expect(r.etoilee).toBe(false);
    /* 🔴 ET L'ÉCHANGE REVIENT À SON ÉTAT D'AVANT : l'étoile n'a finalement pas été posée. */
    expect(vus).toEqual([
      { filId: 7, messageId: 51, etoilee: true, filEtoile: true },
      { filId: 7, messageId: 51, etoilee: false, filEtoile: false },
    ]);
  });

  /** 🔴🔴 UN GESTE REFUSÉ RAMÈNE **TOUTES** LES ÉTOILES À L'ÉTAT D'AVANT — mail ET ligne. */
  it('🔴🔴 un refus réémet l’état d’avant, pour le mail et pour la ligne', async () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    global.fetch = vi.fn(async () => (
      { ok: false, json: async () => ({ erreur: 'refus' }) } as unknown as Response)
    ) as unknown as typeof fetch;
    const r = await gesteEtoileMessage({ filId: 7, messageId: 51, etoilee: false, filAvant: true, filApres: false });
    stop();
    expect(r.ok).toBe(false);
    expect(r.etoilee).toBeNull();
    expect(r.message).toBe('refus');
    expect(vus).toEqual([
      { filId: 7, messageId: 51, etoilee: false, filEtoile: false },
      { filId: 7, messageId: 51, etoilee: true, filEtoile: true },
    ]);
  });

  /** ⚠️ `disponible: false` DÈS QUE LA LECTURE N'ABOUTIT PAS : on n'invente pas « pas suivi ». */
  it('⚠️ une lecture en échec rend « indisponible », jamais « éteinte »', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as unknown as typeof fetch;
    expect(await lireEtoilesDuFil(7)).toEqual({ disponible: false, etoiles: [] });
  });

  /** ⚠️ ET UNE LISTE ABÎMÉE NE PEUPLE PAS L'ÉTAT DE VALEURS QUI N'EN SONT PAS. */
  it('⚠️ une liste de mails abîmée est filtrée, pas recopiée', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true, json: async () => ({ disponible: true, etoiles: [51, 'x', null, 52.5, 52] }),
    } as unknown as Response)) as unknown as typeof fetch;
    expect(await lireEtoilesDuFil(7)).toEqual({ disponible: true, etoiles: [51, 52] });
  });

  /**
   * 🔴🔴 LA GARANTIE STRUCTURELLE : la conversation n'écrit l'étoile que par la porte, et la porte qu'elle
   * appelle est celle DU MESSAGE. Un `fetch` recopié ici, ou un retour à la porte de l'échange, rougirait ce cas.
   */
  it('🔴🔴 la conversation n’écrit que par `gesteEtoileMessage`', () => {
    expect(SRC).toContain('const r = await gesteEtoileMessage({');
    expect(SRC).not.toContain('gesteEtoileFil');
    expect(SRC).not.toMatch(/fetch\(`\/api\/admin\/gestion\/fils\/\$\{filId\}\/etoile`/);
    expect(SRC).not.toMatch(/fetch\(`\/api\/admin\/gestion\/messages\/\$\{m\.messageId\}\/gmail`,\s*\{\s*\n?\s*method: 'POST'[^}]*action: 'etoile'/);
  });

  /**
   * 🔴🔴 ET LES DEUX ÉTOILES D'UN MAIL LISENT **UNE SEULE** VALEUR. C'est la forme du code qui tient la règle
   * d'Arno, et non une vigilance à répéter : `etoilePosee`, lue une fois, utilisée par les deux boutons.
   */
  it('🔴🔴 une seule valeur lue pour les deux étoiles d’un mail', () => {
    expect(SRC).toContain('const etoilePosee = etoileDuMessage?.etoilee ?? gmail?.etat?.etoile ?? false;');
    /* ⚠️ Et plus aucune lecture directe de `gmail.etat.etoile` dans le rendu de la rangée. */
    expect(SRC).not.toContain('className={`cnv-etoile${gmail.etat.etoile ?');
  });
});
