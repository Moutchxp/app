// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { DateEtBiens, viderMemoireBiensRattaches } from './CompteurBiensMail';
import { annoncerClassement } from '../../../../lib/gestion/signalClassement';

/**
 * ══ 🔴🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — « N BIENS RATTACHÉS » SOUS LA DATE ══════════════════════════════
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let reponse: Record<string, number>;

beforeEach(() => {
  viderMemoireBiensRattaches();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  reponse = { 1: 1, 2: 3, 3: 0 };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    appels.push(String(url));
    return { ok: true, json: async () => ({ etat: 'ok', parMail: reponse }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (ids: number[]) => {
  await act(async () => {
    root.render(createElement('ul', null, ids.map((id) => createElement('li', { key: id },
      createElement(DateEtBiens, { messageId: id, date: createElement('span', { className: 'vdb-quand' }, `date ${id}`) })))));
  });
  await calmer();
};
const textes = () => [...container.querySelectorAll('.cbm-pile')].map((p) => p.textContent);

describe('🔴 le nombre de biens sous la date', () => {
  it('UNE requête pour toute la liste ; la date reste telle quelle, le nombre juste dessous', async () => {
    await monter([1, 2, 3]);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toBe('/api/admin/gestion/biens-par-mail?messages=1,2,3');
    expect(textes()).toEqual(['date 11 bien rattaché', 'date 23 biens rattachés', 'date 3aucun bien rattaché']);
    /* La date est le premier enfant, intact ; le compteur vient dessous. */
    const pile = container.querySelector('.cbm-pile') as HTMLElement;
    expect(pile.firstElementChild?.className).toBe('vdb-quand');
    expect(pile.lastElementChild?.className).toBe('cbm-biens');
  });

  it('⚠️ tant qu’on ne sait pas, rien n’est écrit (jamais un « aucun » provisoire)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ etat: 'erreur' }) }) as unknown as Response) as unknown as typeof fetch;
    await monter([7]);
    expect(container.querySelector('.cbm-biens')).toBeNull();
    expect(container.querySelector('.vdb-quand')?.textContent).toBe('date 7');
  });

  it('🔴 après une validation (signal de classement), le chiffre se relit sans recharger la page', async () => {
    await monter([1, 2]);
    expect(textes()[0]).toBe('date 11 bien rattaché');
    reponse = { 1: 2, 2: 3 };
    await act(async () => { annoncerClassement({ messageId: 1, filId: 9 }); });
    await calmer();
    expect(appels).toHaveLength(2);
    expect(textes()[0]).toBe('date 12 biens rattachés');
  });
});

describe('🔴 partout où une ligne de mail s’affiche', () => {
  const lire = (f: string) => readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
  it('historique du bien, vue conversation, boîte mail', () => {
    expect(lire('VieDuBien.tsx')).toContain('<DateEtBiens messageId={l.messageId}');
    expect(lire('Conversation.tsx')).toContain('<DateEtBiens messageId={message.messageId}');
    expect(lire('BoiteMail.tsx')).toContain('<DateEtBiens messageId={l.messageAffiche}');
  });
  it('la fenêtre de rattachement annonce le changement après son écriture et après « Annuler »', () => {
    const r = lire('RattachementsDuFil.tsx');
    expect(r).toContain('annoncerClassement({ messageId: mailId, filId });');
    expect(r).toContain('annoncerClassement({ messageId: mailId ?? 0, filId });');
  });
});

describe('🔴 le même calcul que la fenêtre « Bien(s) rattaché(s) à ce mail »', () => {
  it('liens vivants et confirmés (sqlLiensDuBien sans propositions), lots connus de l’annuaire, une requête groupée', () => {
    const src = readFileSync('app/lib/gestion/compteBiensMailRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(src).toContain("sqlLiensDuBien('r')");
    expect(src).not.toContain('avecPropositions');
    expect(src).toContain('JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle');
    expect(src).toContain('count(DISTINCT r.cible_cle)');
    expect(src).toContain('r.message_id = ANY($1::bigint[])');
  });
});
