// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Conversation } from './Conversation';

/**
 * ══ 🔴🔴 LOT BOUTON-HISTORIQUE-SUR-LES-MAILS-RATTACHES — LE BOUTON « Historique » DANS LA VRAIE CONVERSATION ══════════
 * Affiché seulement sous un bouton vert (au moins un bien rattaché actif) ; un bien ⇒ la fiche directement ; plusieurs
 * ⇒ une liste (aria-expanded), fermée par Échap ou un clic à côté ; la fiche courante n'est jamais proposée.
 * 🔒 AUCUNE DONNÉE RÉELLE : un fil inventé, `fetch` simulé ; rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGES = [12].map((messageId) => ({
  messageId, de: 'madame.fictive@exemple.test', deNom: 'Madame Fictive', sens: 'recu',
  recuLe: '2026-10-01T10:00:00Z', objet: 'Chaudière', corps: 'Elle ne chauffe plus.',
  extrait: 'Elle ne chauffe plus.', automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
  nonRemises: [], destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
}));
const FIL = { filId: 7, objet: 'Chaudière', etat: 'a_classer', reference: null, evenementId: null, evenementObjet: null };

const lien = (id: number, cle: string, statut = 'confirme') => ({
  id, messageId: 12, pieceId: null, cible: { sorte: 'lot', cle, id: null }, libelle: `Lot ${cle}`, categorie: 'logement',
  bien: { adresse: `${cle} rue Inventée`, commune: 'VILLEFICTIVE', nature: 'Appartement', typeBien: null, immeuble: null },
  origine: 'manuel', statut, confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null,
});
const DETAIL = (cles: string[]) => cles.map((cle) => ({
  cle, adresse: `${cle} rue Inventée`, codePostal: '99000', commune: 'VILLEFICTIVE', nature: 'Appartement',
  typeBien: 'Type 2', proprietaire: `PROPRIÉTAIRE ${cle}`,
}));

let container: HTMLDivElement;
let root: Root;
let liens: ReturnType<typeof lien>[];
let ecritures: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  liens = [];
  ecritures = [];
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') ecritures.push(u);
    if (u.includes('biens-par-mail?detail=')) {
      return { ok: true, json: async () => ({ etat: 'ok', biens: DETAIL(liens.map((l) => l.cible.cle)) }) } as unknown as Response;
    }
    if (u.includes('/messages')) return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: { 12: liens } }) } as unknown as Response;
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 7, maintenant: new Date('2026-10-03T12:00:00Z'), onGeste: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const bouton = () => container.querySelector('.bhm-bouton') as HTMLButtonElement | null;
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};

describe('bouton « Historique » — affichage conditionnel', () => {
  it('mail « À classer » (aucun bien confirmé) : pas de bouton, les carrés restent sans enveloppe', async () => {
    liens = [lien(1, '40', 'propose')];
    await monter({ onFicheBien: vi.fn() });
    expect(bouton()).toBeNull();
    expect(container.querySelector('.cnv-entete-droite')).toBeNull();
  });

  it('écran qui n’offre pas la fiche (conversation dans une carte) : pas de bouton', async () => {
    liens = [lien(1, '40')];
    await monter();
    expect(container.querySelector('.ccl-case--verte')).not.toBeNull();
    expect(bouton()).toBeNull();
  });

  it('un bien rattaché : le bouton est là, avec l’adresse, au-dessus du bouton vert', async () => {
    liens = [lien(1, '40')];
    await monter({ onFicheBien: vi.fn() });
    expect(container.querySelector('.ccl-case--verte')).not.toBeNull();
    const b = bouton();
    expect(b).not.toBeNull();
    expect(b?.textContent).toContain('Historique');
    expect(b?.textContent).toContain('40 rue Inventée, VILLEFICTIVE');
    expect(b?.closest('.cnv-entete-bloc')).not.toBeNull();
  });
});

describe('bouton « Historique » — un bien, plusieurs biens', () => {
  it('un bien : un clic ouvre sa fiche directement, sans liste ni aria-expanded', async () => {
    liens = [lien(1, '40')];
    const onFicheBien = vi.fn();
    await monter({ onFicheBien });
    expect(bouton()?.hasAttribute('aria-expanded')).toBe(false);
    await cliquer(bouton() as Element);
    expect(onFicheBien).toHaveBeenCalledWith('40');
    expect(container.querySelector('.bhm-liste')).toBeNull();
  });

  it('plusieurs biens : « N biens », la liste se déplie (aria-expanded), une ligne ouvre CE bien', async () => {
    liens = [lien(1, '40'), lien(2, '41'), lien(3, '42')];
    const onFicheBien = vi.fn();
    await monter({ onFicheBien });
    expect(bouton()?.textContent).toContain('3 biens');
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
    await cliquer(bouton() as Element);
    expect(bouton()?.getAttribute('aria-expanded')).toBe('true');
    const lignes = [...container.querySelectorAll('.bhm-ligne')];
    expect(lignes).toHaveLength(3);
    expect(lignes[1].textContent).toContain('41 rue Inventée');
    expect(lignes[1].textContent).toContain('lot 41');
    expect(lignes[1].textContent).toContain('PROPRIÉTAIRE 41');
    await cliquer(lignes[1]);
    expect(onFicheBien).toHaveBeenCalledTimes(1);
    expect(onFicheBien).toHaveBeenCalledWith('41');
    expect(container.querySelector('.bhm-liste')).toBeNull();
  });

  it('la liste se referme par Échap et par un clic à côté', async () => {
    liens = [lien(1, '40'), lien(2, '41')];
    await monter({ onFicheBien: vi.fn() });
    await cliquer(bouton() as Element);
    expect(container.querySelector('.bhm-liste')).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('.bhm-liste')).toBeNull();
    expect(bouton()?.getAttribute('aria-expanded')).toBe('false');
    await cliquer(bouton() as Element);
    expect(container.querySelector('.bhm-liste')).not.toBeNull();
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(container.querySelector('.bhm-liste')).toBeNull();
  });
});

describe('bouton « Historique » — la fiche courante est exclue', () => {
  it('ouverte depuis l’historique du bien 40 : seul 41 est proposé, en lien direct', async () => {
    liens = [lien(1, '40'), lien(2, '41')];
    const onFicheBien = vi.fn();
    await monter({ onFicheBien, bienCourant: '40' });
    expect(bouton()?.textContent).toContain('41 rue Inventée');
    await cliquer(bouton() as Element);
    expect(onFicheBien).toHaveBeenCalledWith('41');
  });

  it('le seul bien est celui de la fiche : pas de bouton', async () => {
    liens = [lien(1, '40')];
    await monter({ onFicheBien: vi.fn(), bienCourant: '40' });
    expect(container.querySelector('.ccl-case--verte')).not.toBeNull();
    expect(bouton()).toBeNull();
  });
});

describe('lecture seule', () => {
  it('aucun geste du bouton n’écrit', async () => {
    liens = [lien(1, '40'), lien(2, '41')];
    await monter({ onFicheBien: vi.fn() });
    const avant = ecritures.length;
    await cliquer(bouton() as Element);
    await cliquer(container.querySelector('.bhm-ligne') as Element);
    expect(ecritures.slice(avant)).toEqual([]);
  });
});
