import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base MOCKÉE : aucune connexion réelle. Gmail est INJECTÉ — rien ne sort d'ici.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { marquerFilGmail, nonLusGmail, PLAFOND_NON_LUS, type DepsLectureGmail, type DepsMarquageGmail } from './lectureGmail';

/**
 * LOT 5-BOITE-2 — LE LU / NON LU VIENT DE GMAIL (choix d'Arno du 25/09/2026 : un seul état, commun à l'équipe).
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE CAS COMPTE :
 *   ① UNE seule question posée à Gmail pour toute la liste — la méthode « un appel par message » du lot 5-FIDÈLE
 *      serait ruineuse sur trente échanges ;
 *   ② le rapprochement se fait par `Message-ID`, seule clé commune : MESURÉ, 51 de nos 56 793 messages seulement
 *      connaissent leur identifiant Gmail, qui ne peut donc pas servir ;
 *   ③ tout est BORNÉ, et une réponse tronquée le DIT — un compteur partiel qui se tairait serait un compteur faux ;
 *   ④ sans connexion Google, il n'y a pas d'état : ni gras, ni compteur, et l'écran doit pouvoir le dire ;
 *   ⑤ le marquage passe par le FIL, en un appel, et un échange absent de Gmail n'est pas une panne.
 */

const OK = <T,>(valeur: T) => ({ ok: true as const, valeur });
const KO = (motif: string) => ({ ok: false as const, motif });

function deps(o: {
  jeton?: string | null;
  messages?: { id: string; threadId: string }[];
  complet?: boolean;
  entetes?: Record<string, string | null>;
} = {}): { d: DepsLectureGmail; appels: string[] } {
  const appels: string[] = [];
  const d: DepsLectureGmail = {
    jeton: async () => (o.jeton === undefined ? 'JETON' : o.jeton),
    lister: async (_j, plafond) => {
      appels.push(`lister(${plafond})`);
      return OK({ messages: o.messages ?? [], complet: o.complet !== false });
    },
    entete: async (_j, id) => {
      appels.push(`entete(${id})`);
      const m = (o.entetes ?? {})[id];
      return m === undefined ? KO('inconnu') : OK({ id, threadId: `T-${id}`, messageIdRfc: m });
    },
  };
  return { d, appels };
}

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('🔴 ① une seule question pour toute la liste', () => {
  it('un appel de liste, puis un en-tête par message non lu — jamais un appel par échange affiché', async () => {
    const { d, appels } = deps({
      messages: [{ id: 'g1', threadId: 't1' }, { id: 'g2', threadId: 't2' }],
      entetes: { g1: '<a@x>', g2: '<b@x>' },
    });
    queryMock.mockResolvedValue({ rows: [{ fil_id: '11' }] });
    await nonLusGmail(d);
    expect(appels).toEqual([`lister(${PLAFOND_NON_LUS})`, 'entete(g1)', 'entete(g2)']);
  });

  it('aucun non-lu → aucun en-tête demandé, et aucune requête en base', async () => {
    const { d, appels } = deps({ messages: [] });
    const r = await nonLusGmail(d);
    expect(r).toEqual({ fils: new Set(), total: 0, complet: true, disponible: true });
    expect(appels).toEqual([`lister(${PLAFOND_NON_LUS})`]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ② le rapprochement se fait par Message-ID', () => {
  it('les `Message-ID` sont traduits en échanges par UNE requête, chevrons retirés des deux côtés', async () => {
    const { d } = deps({
      messages: [{ id: 'g1', threadId: 't1' }, { id: 'g2', threadId: 't2' }],
      entetes: { g1: '<a@x>', g2: 'b@x' },
    });
    queryMock.mockResolvedValue({ rows: [{ fil_id: '11' }, { fil_id: '12' }] });
    const r = await nonLusGmail(d);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][1]).toEqual([['a@x', 'b@x']]);
    // …et la comparaison normalise AUSSI le côté base : un chevron d'écart raterait tout, silencieusement.
    expect(String(queryMock.mock.calls[0][0])).toContain("btrim(m.message_id, '<>')");
    expect(r.fils).toEqual(new Set([11, 12]));
    expect(r.total).toBe(2);
  });

  it('un message Gmail sans en-tête lisible est ignoré, sans faire échouer le reste', async () => {
    const { d } = deps({
      messages: [{ id: 'g1', threadId: 't1' }, { id: 'g2', threadId: 't2' }],
      entetes: { g1: null, g2: '<b@x>' },
    });
    queryMock.mockResolvedValue({ rows: [{ fil_id: '12' }] });
    const r = await nonLusGmail(d);
    expect(queryMock.mock.calls[0][1]).toEqual([['b@x']]);
    expect(r.fils).toEqual(new Set([12]));
  });

  it('aucun en-tête exploitable → liste vide, et AUCUNE requête en base', async () => {
    const { d } = deps({ messages: [{ id: 'g1', threadId: 't1' }], entetes: { g1: null } });
    expect((await nonLusGmail(d)).fils.size).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ③ tout est borné, et une réponse tronquée le DIT', () => {
  it('le plafond coupe la liste, et `complet` passe à faux', async () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, threadId: `t${i}` }));
    const entetes = Object.fromEntries(messages.map((m, i) => [m.id, `<${i}@x>`]));
    const { d, appels } = deps({ messages, entetes });
    queryMock.mockResolvedValue({ rows: [{ fil_id: '11' }] });
    const r = await nonLusGmail(d, 2);
    expect(appels.filter((a) => a.startsWith('entete'))).toHaveLength(2); // 2 en-têtes, pas 5
    expect(r.complet).toBe(false);
  });

  it('Gmail qui annonce une suite rend `complet` faux, même sous le plafond', async () => {
    const { d } = deps({ messages: [{ id: 'g1', threadId: 't1' }], entetes: { g1: '<a@x>' }, complet: false });
    queryMock.mockResolvedValue({ rows: [{ fil_id: '11' }] });
    expect((await nonLusGmail(d)).complet).toBe(false);
  });
});

describe('🔴 ④ sans connexion Google, on ne devine pas', () => {
  it('aucun jeton → rien n’est non lu, et `disponible` dit POURQUOI', async () => {
    const { d, appels } = deps({ jeton: null });
    const r = await nonLusGmail(d);
    expect(r.disponible).toBe(false);
    expect(r.fils.size).toBe(0);
    expect(appels).toEqual([]); // on n'appelle même pas Gmail
  });

  /** Un refus de Gmail ne doit pas mettre toute la boîte en gras, ni la faire échouer : on se tait. */
  it('un refus de Gmail rend un état INDISPONIBLE, jamais un faux « tout est lu »', async () => {
    const d: DepsLectureGmail = {
      jeton: async () => 'JETON',
      lister: async () => KO('HTTP 503'),
      entete: async () => KO('jamais appelé'),
    };
    expect((await nonLusGmail(d)).disponible).toBe(false);
  });
});

describe('🔴 ⑤ marquer un échange, dans Gmail', () => {
  /**
   * LOT LISTE-GMAIL-FIX — `ancres` au pluriel : le marquage essaie plusieurs portes d'entrée vers le fil Gmail, et
   * s'arrête à la première qui mène. `ancre` (singulier) reste accepté par ce jeu d'essai pour que les cas d'avant
   * se lisent inchangés — il est simplement traduit en une liste d'un élément.
   */
  function depsM(o: {
    jeton?: string | null; ancre?: string | null; ancres?: string[];
    trouve?: { id: string; threadId: string } | null;
    trouvePar?: (mid: string) => { id: string; threadId: string } | null;
  } = {}) {
    const faits: string[] = [];
    const d: DepsMarquageGmail = {
      jeton: async () => (o.jeton === undefined ? 'JETON' : o.jeton),
      ancres: async () => (o.ancres ?? (o.ancre === undefined ? ['<a@x>'] : o.ancre === null ? [] : [o.ancre])),
      chercher: async (_j, mid) => {
        faits.push(`chercher(${mid})`);
        if (o.trouvePar) return OK(o.trouvePar(mid));
        return OK(o.trouve === undefined ? { id: 'g1', threadId: 'T9' } : o.trouve);
      },
      modifierFil: async (_j, fil, opt) => {
        faits.push(`modifier(${fil}, +${(opt.ajouter ?? []).join('')} -${(opt.retirer ?? []).join('')})`);
        return OK({ id: fil });
      },
    };
    return { d, faits };
  }

  it('marquer LU retire `UNREAD` du FIL, en un seul appel', async () => {
    const { d, faits } = depsM();
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'ok', lu: true });
    expect(faits).toEqual(['chercher(a@x)', 'modifier(T9, + -UNREAD)']);
  });

  it('marquer NON LU pose `UNREAD` sur le FIL', async () => {
    const { d, faits } = depsM();
    expect(await marquerFilGmail(d, 5, false)).toEqual({ etat: 'ok', lu: false });
    expect(faits[1]).toBe('modifier(T9, +UNREAD -)');
  });

  it('les chevrons du `Message-ID` sont retirés : Gmail les refuse', async () => {
    const { d, faits } = depsM({ ancre: '<avec@chevrons>' });
    await marquerFilGmail(d, 5, true);
    expect(faits[0]).toBe('chercher(avec@chevrons)');
  });

  it('sans connexion Google, on le dit — et on ne touche à rien', async () => {
    const { d, faits } = depsM({ jeton: null });
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'sans_connexion' });
    expect(faits).toEqual([]);
  });

  /** Un échange venu d'une autre boîte, ou effacé de Gmail : ce n'est PAS une panne, et le mot le dit. */
  it('échange introuvable dans Gmail → « introuvable », jamais une erreur', async () => {
    expect(await marquerFilGmail(depsM({ trouve: null }).d, 5, true)).toEqual({ etat: 'introuvable' });
    expect(await marquerFilGmail(depsM({ ancre: null }).d, 5, true)).toEqual({ etat: 'introuvable' });
  });

  /**
   * 🔴 LE DÉFAUT RÉPARÉ LE 27/09/2026, constaté par Arno sur un avis de non-remise. L'ancre était le DERNIER message
   * reçu, et lui seul : quand ce message-là n'était pas retrouvable, l'échange entier était déclaré absent de Gmail
   * — alors qu'un autre de ses messages y menait très bien. Vérifié sur la vraie boîte : le message envoyé de
   * l'échange 35848 rend le fil `1a0d4a9fb5ed3eed`, exactement celui qu'il fallait.
   */
  it('🔴 si la première ancre ne mène nulle part, on essaie la suivante', async () => {
    const { d, faits } = depsM({
      ancres: ['<perdu@x>', '<bon@x>'],
      trouvePar: (mid) => (mid === 'bon@x' ? { id: 'g2', threadId: 'T7' } : null),
    });
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'ok', lu: true });
    expect(faits).toEqual(['chercher(perdu@x)', 'chercher(bon@x)', 'modifier(T7, + -UNREAD)']);
  });

  it('aucune ancre ne mène au fil → « introuvable », après les avoir TOUTES essayées', async () => {
    const { d, faits } = depsM({ ancres: ['<a@x>', '<b@x>', '<c@x>'], trouve: null });
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'introuvable' });
    expect(faits).toEqual(['chercher(a@x)', 'chercher(b@x)', 'chercher(c@x)']);
  });

  /** ⚠️ UN REFUS ARRÊTE TOUT : il se répétera à l'identique sur les ancres suivantes, et il doit être dit. */
  it('un refus de Gmail arrête l’essai des ancres suivantes', async () => {
    const faits: string[] = [];
    const d: DepsMarquageGmail = {
      jeton: async () => 'JETON',
      ancres: async () => ['<a@x>', '<b@x>'],
      chercher: async (_j, mid) => { faits.push(mid); return KO('Recherche Gmail impossible (HTTP 429).'); },
      modifierFil: async () => OK({ id: 'T' }),
    };
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'refus', motif: 'Recherche Gmail impossible (HTTP 429).' });
    expect(faits).toEqual(['a@x']); // on n'a pas insisté
  });

  it('un refus de Gmail est rendu AVEC son motif', async () => {
    const d: DepsMarquageGmail = {
      jeton: async () => 'JETON',
      ancres: async () => ['<a@x>'],
      chercher: async () => OK({ id: 'g1', threadId: 'T9' }),
      modifierFil: async () => KO('Gmail a refusé la modification : quota'),
    };
    expect(await marquerFilGmail(d, 5, true)).toEqual({ etat: 'refus', motif: 'Gmail a refusé la modification : quota' });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT LISTE-GMAIL-FIX — LA RECHERCHE COUVRE TOUTE LA BOÎTE, ET LES ANCRES SONT ORDONNÉES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la recherche d’un Message-ID ne doit plus ignorer le spam ni la corbeille', () => {
  /**
   * 🔴 LE DÉFAUT D'ARNO, MESURÉ SUR LA VRAIE BOÎTE le 27/09/2026. La recherche Gmail EXCLUT le spam et la corbeille
   * par défaut. L'avis de non-remise <6ab82696…@mx.google.com> était introuvable par « rfc822msgid:… » et retrouvé
   * par « in:anywhere rfc822msgid:… », avec les libellés TRASH — et le MÊME fil que le message envoyé de l'échange.
   * Sans `in:anywhere`, tout l'échange était déclaré absent de gestion@, ce qui était faux.
   */
  it('la requête envoyée à Gmail porte « in:anywhere »', () => {
    const src = readFileSync('app/lib/gestion/google.ts', 'utf8');
    expect(src).toContain('in:anywhere rfc822msgid:');
  });
});

describe('🔴 l’ordre des ancres d’un échange', () => {
  /**
   * Trois règles, dans cet ordre : d'abord ce qu'on SAIT être dans Gmail (`gmail_message_id` connu), puis les
   * REÇUS (l'ancre historique), puis les ENVOYÉS — un message que nous avons envoyé est dans la boîte de gestion@
   * et mène au même fil. C'est cette dernière règle qui rend le lu/non lu possible sur les 26 086 échanges (sur
   * 36 413) qui n'ont AUCUN message reçu, et qui n'avaient donc jamais d'ancre du tout.
   */
  it('le SQL classe par identifiant Gmail connu, puis par sens reçu, puis par date', () => {
    const src = readFileSync('app/lib/gestion/lectureGmail.ts', 'utf8');
    const plat = src.replace(/\s+/g, ' ');
    expect(plat).toContain('ORDER BY (gmail_message_id IS NOT NULL) DESC, (sens = \'recu\') DESC, recu_le DESC');
    // ⚠️ Et il ne filtre PLUS sur le sens : c'était la restriction qui privait 26 086 échanges d'ancre.
    expect(plat).not.toContain("WHERE fil_id = $1 AND sens = 'recu'");
  });

  it('le nombre d’ancres est BORNÉ : chaque essai coûte une recherche Gmail', () => {
    const src = readFileSync('app/lib/gestion/lectureGmail.ts', 'utf8');
    expect(src).toContain('ANCRES_MAX = 5');
    expect(src.replace(/\s+/g, ' ')).toContain('LIMIT ${ANCRES_MAX}');
  });
});
