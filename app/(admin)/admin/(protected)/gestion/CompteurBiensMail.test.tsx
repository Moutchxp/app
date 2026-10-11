// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { DateEtBiens, viderMemoireBiensRattaches, viderMemoireBulleBiens } from './CompteurBiensMail';
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
  viderMemoireBulleBiens();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  reponse = { 1: 1, 2: 3, 3: 0 };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    appels.push(String(url));
    if (String(url).includes('detail=')) {
      return { ok: true, json: async () => ({ etat: 'ok', biens: [
        { cle: '219', adresse: '25 rue Edith Cavell', codePostal: '92400', commune: 'COURBEVOIE', nature: 'Appartement meublé', typeBien: 'Type 2', proprietaire: 'JULLIEN - GARRIDO Cédric' },
        { cle: '373', adresse: '15 rue Carle Hebert', codePostal: '92400', commune: 'COURBEVOIE', nature: null, typeBien: null, proprietaire: 'JULLIEN - GARRIDO Cédric' },
      ] }) } as unknown as Response;
    }
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
const svv = () => { let r = document.querySelector('.svv-adm-root'); if (r === null) { r = document.createElement('div'); r.className = 'svv-adm-root'; document.body.appendChild(r); } return r; };

describe('🔴 le nombre de biens sous la date', () => {
  it('UNE requête pour toute la liste ; la date reste telle quelle, le nombre juste dessous', async () => {
    await monter([1, 2, 3]);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toBe('/api/admin/gestion/biens-par-mail?messages=1,2,3');
    expect(textes()).toEqual(['date 11 bien rattaché', 'date 23 biens rattachés', 'date 3aucun bien rattaché']);
    /* La date est le premier enfant, intact ; le compteur vient dessous. */
    const pile = container.querySelector('.cbm-pile') as HTMLElement;
    expect(pile.firstElementChild?.className).toBe('vdb-quand');
    expect(pile.lastElementChild?.classList.contains('cbm-biens')).toBe(true);
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

describe('🔴🔴 LOT BULLE-BIENS-RATTACHES — la bulle du compteur', () => {
  const declencheur = (i = 0) => container.querySelectorAll('.cbm-biens')[i] as HTMLElement;
  const laBulle = () => document.querySelector('.cbm-bulle') as HTMLElement | null;
  it('au survol : une ligne par bien, propriétaire à droite ; le détail est lu UNE fois, puis gardé', async () => {
    svv();
    await monter([2]);
    expect(declencheur().getAttribute('role')).toBe('button');
    expect(declencheur().tabIndex).toBe(0);
    await act(async () => { declencheur().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    await calmer();
    const lignes = [...(laBulle()?.querySelectorAll('.cbm-bulle-ligne') ?? [])];
    expect(lignes.map((l) => l.querySelector('.cbm-bulle-bien')?.textContent)).toEqual([
      '25 rue Edith Cavell, 92400 COURBEVOIE — Appartement meublé · Type 2 — lot 219',
      '15 rue Carle Hebert, 92400 COURBEVOIE — type non renseigné — lot 373',
    ]);
    expect(lignes[0].querySelector('.cbm-bulle-proprio')?.textContent).toBe('JULLIEN - GARRIDO Cédric');
    /* 🔴 dans la racine de l'administration (thème), jamais sous la ligne */
    expect(laBulle()?.closest('.svv-adm-root')).not.toBeNull();
    expect(container.contains(laBulle())).toBe(false);
    /* Refermer puis rouvrir : aucune seconde lecture. */
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await calmer();
    expect(laBulle()).toBeNull();
    await act(async () => { declencheur().focus(); });
    await calmer();
    expect(laBulle()).not.toBeNull();
    expect(appels.filter((u) => u.includes('detail=2'))).toHaveLength(1);
  });
  it('au toucher / clic : la bulle s’ouvre et la ligne ne se plie pas', async () => {
    svv();
    const ligne = vi.fn();
    await act(async () => {
      root.render(createElement('button', { type: 'button', onClick: ligne },
        createElement(DateEtBiens, { messageId: 2, date: createElement('span', null, 'date') })));
    });
    await calmer();
    await act(async () => { declencheur().click(); });
    await calmer();
    expect(laBulle()).not.toBeNull();
    expect(ligne).not.toHaveBeenCalled();
  });
  it('« aucun bien rattaché » : pas de bulle', async () => {
    await monter([3]);
    expect(declencheur().getAttribute('role')).toBeNull();
    await act(async () => { declencheur().dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    await calmer();
    expect(laBulle()).toBeNull();
    expect(appels.some((u) => u.includes('detail='))).toBe(false);
  });
});
