// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartRattachement } from './EncartRattachement';
import { estPremierMail, MOT_BANDEAU_DIRECT, SECONDES_BANDEAU_DIRECT } from '../../../../lib/gestion/interneDetache';
import { sqlCompteBoite } from '../../../../lib/gestion/boiteRepo';

/**
 * ══ 🔴🔴 LOT INTERNE-PAR-DEFAUT-VERS-L-AVANT — « ON NE REMONTE JAMAIS DANS LE PASSÉ PAR DÉFAUT » (règle d'Arno) ══════
 *
 *   ① position par défaut du panneau « Interne » : « Ce mail + futurs échanges » ;
 *   ② mail en MILIEU de conversation : toujours le panneau, glissière sur la position 2 ;
 *   ③ PREMIER mail sans bien à retirer : marquage direct, puis « Conversation marquée Interne — Annuler » (10 s) ;
 *   ④ PREMIER mail avec un bien retiré du suivi d'un mail suivant : le panneau, SANS glissière, Confirmer / Annuler ;
 *   ⑤ la boîte « À classer » lit la marque « Interne » MAIL PAR MAIL.
 * 🔒 `fetch` et `onInterne` simulés : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let biensAperçus: unknown[];
let apercus: string[];
let gestes: { actif: boolean; remettre?: readonly number[]; choix?: string }[];
/** 🔴 LOT RATTACHEMENT-CONVERSATION — ce que `/suivi` répond. Par défaut : conversation DÉJÀ suivie (une période). */
let suiviReponse: Record<string, unknown>;
const SUIVIE = { etat: 'ok', periodes: [{ id: 1, depuisMessageId: 58100, classement: { sorte: 'biens', biens: [] } }], exceptions: [], mails: [58100, 58200, 58300], rattachee: true, interneEchange: false };
const SANS_FOND = { etat: 'ok', periodes: [], exceptions: [], mails: [58100, 58200, 58300], rattachee: false, interneEchange: false };

const LOT236 = { lienId: 173437, libelle: '1-11 rue Eugène Eichenberger, PUTEAUX — lot 236', messageId: 58115,
  recuLe: '2026-10-12T15:49:32Z' };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  biensAperçus = []; apercus = []; gestes = []; suiviReponse = SUIVIE;
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/gestion/suivi?')) return { ok: true, json: async () => suiviReponse } as unknown as Response;
    if (u.includes('/gestion/interne?') && u.includes('detacherait=1')) {
      apercus.push(new URL(u, 'http://x').searchParams.get('choix') ?? '');
      return { ok: true, json: async () => ({ etat: 'ok', biens: biensAperçus }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (messageId: number, mailsDuFil: number[]) => {
  await act(async () => {
    root.render(createElement(EncartRattachement, {
      messageId, filId: 37027, liens: [], interne: false, horsGestion: false, mailsDuFil,
      onChange: async () => {},
      onInterne: async (actif: boolean, remettre?: readonly number[], choix?: string) => {
        gestes.push({ actif, ...(remettre === undefined ? {} : { remettre }), ...(choix === undefined ? {} : { choix }) });
        return [];
      },
    } as never));
  });
  await calmer();
};
const cliquerInterne = async () => {
  await act(async () => { (container.querySelector('.ccl-case--blanche') as HTMLElement).click(); });
  await calmer();
};
const panneau = () => container.querySelector('.ert-interne-panneau:not(.ert-interne-panneau--fait)');
const choisie = () => container.querySelector('.ert-interne-panneau [role="radio"][aria-checked="true"]')?.textContent;

describe('🔴🔴 LOT GESTION-DETACHER — règle C pour « Interne » : milieu d’une conversation SANS suivi de fond', () => {
  it('🔴🔴 le panneau s’ouvre sur « One shot » ; « Confirmer » marque CE mail seul', async () => {
    suiviReponse = SANS_FOND;
    await monter(58200, [58100, 58200, 58300]);
    await cliquerInterne();
    expect(panneau()).not.toBeNull();
    expect(choisie()).toBe('One shot');
    expect(apercus).toEqual(['mail']);
    const confirmer = () => [...container.querySelectorAll('.ert-interne-panneau button')].find((b) => b.textContent?.trim() === 'Confirmer') as HTMLButtonElement;
    expect(confirmer().disabled).toBe(false);
    expect(gestes).toEqual([]);
    await act(async () => { confirmer().click(); });
    await calmer();
    expect(gestes).toEqual([{ actif: true, choix: 'mail' }]);
  });
});

describe('① ② mail en milieu d’une conversation DÉJÀ suivie : toujours le panneau, sur « Ce mail + futurs échanges » (inchangé)', () => {
  it('🔴 sans bien à retirer : le panneau s’ouvre quand même, position 2, et rien n’est marqué', async () => {
    await monter(58200, [58100, 58200, 58300]);
    await cliquerInterne();
    expect(panneau()).not.toBeNull();
    expect(choisie()).toBe('Ce mail + futurs échanges');
    expect([...container.querySelectorAll('.ert-interne-panneau [role="radio"]')].map((r) => r.textContent))
      .toEqual(['One shot', 'Ce mail + futurs échanges', 'Toute la conversation']);
    expect(apercus).toEqual(['suite']);
    expect(gestes).toEqual([]);
    expect(panneau()?.textContent).toContain('Aucun bien n’est retiré du suivi.');
  });

  it('🔴 « Annuler » ferme sans rien marquer ; « Confirmer » marque avec la portée de la glissière', async () => {
    await monter(58200, [58100, 58200, 58300]);
    await cliquerInterne();
    await act(async () => {
      ([...container.querySelectorAll('.ert-interne-panneau button')].find((b) => b.textContent?.trim() === 'Annuler') as HTMLElement).click();
    });
    await calmer();
    expect(panneau()).toBeNull();
    expect(gestes).toEqual([]);
    await cliquerInterne();
    await act(async () => {
      ([...container.querySelectorAll('.ert-interne-panneau button')].find((b) => b.textContent?.trim() === 'Confirmer') as HTMLElement).click();
    });
    await calmer();
    expect(gestes).toEqual([{ actif: true, choix: 'suite' }]);
  });
});

describe('③ premier mail, rien à retirer : marquage direct, puis le bandeau « Annuler » de 10 s', () => {
  it('🔴 aucun panneau ; le marquage part en « suite » ; le bandeau dit « Conversation marquée Interne — Annuler »', async () => {
    await monter(58109, [58109, 58115]);
    await cliquerInterne();
    expect(panneau()).toBeNull();
    expect(gestes).toEqual([{ actif: true, choix: 'suite' }]);
    const bandeau = container.querySelector('.ert-interne-direct');
    expect(bandeau?.textContent).toContain(`${MOT_BANDEAU_DIRECT} —`);
    expect(bandeau?.querySelector('button')?.textContent).toBe('Annuler');
  });

  it('🔴 « Annuler » remet tout comme avant, par la même porte et la même portée', async () => {
    await monter(58109, [58109, 58115]);
    await cliquerInterne();
    await act(async () => { (container.querySelector('.ert-interne-direct button') as HTMLElement).click(); });
    await calmer();
    expect(gestes).toEqual([{ actif: true, choix: 'suite' }, { actif: false, remettre: [], choix: 'suite' }]);
    expect(container.querySelector('.ert-interne-direct')).toBeNull();
  });

  it('🔴 le bandeau s’efface de lui-même au bout de 10 secondes', async () => {
    expect(SECONDES_BANDEAU_DIRECT).toBe(10);
    await monter(58109, [58109, 58115]);
    vi.useFakeTimers();
    await cliquerInterne();
    expect(container.querySelector('.ert-interne-direct')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(container.querySelector('.ert-interne-direct')).toBeNull();
  });
});

describe('④ premier mail avec un bien retiré du suivi d’un mail suivant : le panneau, sans glissière', () => {
  it('🔴 le cas d’Arno (58109 premier, 58115 rattaché au lot 236) : liste exacte, Confirmer / Annuler, pas de glissière', async () => {
    biensAperçus = [LOT236];
    await monter(58109, [58109, 58115]);
    await cliquerInterne();
    const p = panneau();
    expect(p).not.toBeNull();
    expect(p?.querySelectorAll('[role="radio"]')).toHaveLength(0);
    expect(p?.textContent).toContain('Marquer cette conversation « Interne » ?');
    expect(p?.textContent).toContain(
      'Le mail du 12/10 à 17:49 de cette conversation sortira du suivi de 1-11 rue Eugène Eichenberger, PUTEAUX — lot 236 (restaurable).');
    expect([...(p?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim())).toEqual(['Confirmer', 'Annuler']);
    expect(gestes).toEqual([]);
    await act(async () => {
      ([...(p?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === 'Confirmer') as HTMLElement).click();
    });
    await calmer();
    expect(gestes).toEqual([{ actif: true, choix: 'suite' }]);
  });
});

describe('le premier mail, règle pure', () => {
  it('premier, milieu, conversation inconnue', () => {
    expect(estPremierMail(1, [1, 2, 3])).toBe(true);
    expect(estPremierMail(2, [1, 2, 3])).toBe(false);
    expect(estPremierMail(9, [])).toBe(true);
  });
});

describe('⑤ la boîte « À classer » lit la marque « Interne » mail par mail', () => {
  const sql = (interneMessage: boolean) => sqlCompteBoite(false, { sorte: 'a_classer_statut', evenementId: null } as never,
    false, false, null, false, null, false, 1, true, true, true, interneMessage).replace(/\s+/g, ' ');

  it('🔴 avec la 297 : la marque du mail d’abord, la marque de l’échange en repli', () => {
    const s = sql(true);
    expect(s).toContain('AND NOT COALESCE(( SELECT (mi0.retire_le IS NULL) FROM gestion_message_interne mi0 WHERE mi0.message_id = m.id ORDER BY mi0.pose_le DESC, mi0.id DESC LIMIT 1), EXISTS ( SELECT 1 FROM gestion_fil_interne i0');
  });

  it('⚠️ sans la 297 : la lecture de l’échange, comme avant', () => {
    const s = sql(false);
    expect(s).not.toContain('gestion_message_interne');
    expect(s).toContain('AND NOT EXISTS ( SELECT 1 FROM gestion_fil_interne i0 WHERE i0.fil_id = m.fil_id AND i0.retire_le IS NULL)');
  });
});
