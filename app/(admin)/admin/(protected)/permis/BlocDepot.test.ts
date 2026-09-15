// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DepotAffiche } from './DemandesRendu';
import { BlocDepot } from './BlocDepot';

/**
 * Lot 1 « carrousel Téléservice » (présentation) — COMPORTEMENT du carrousel de BlocDepot, sur un vrai rendu (jsdom + act,
 * sans testing-library ; createElement, pas de JSX). Aucune assertion de couleur/classe/pixel, aucune lecture de source.
 * `fetch` (chargement de la file + trace « copier ») et `navigator.clipboard` sont mockés.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  // clipboard : BoutonCopier n'appelle onCopie qu'APRÈS un writeText résolu → on le mocke pour que les gestes « copier » aboutissent.
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];

const carte = (id: number, commune: string): DepotAffiche => ({
  id, reference: `SVAV-DEM-2026-${String(id).padStart(6, '0')}`, communeNom: commune,
  url: `https://ts.${commune.toLowerCase()}.fr`, corps: `Texte de la demande pour ${commune}`, nbDossiers: 1, statut: 'prete',
  dossiers: [{ type: 'PC', numDau: '07511524V0006' }],
});

/** Monte BlocDepot avec la file `demandes` servie par le GET, et laisse le chargement se vider. */
const monter = async (demandes: DepotAffiche[], onChangement = vi.fn()): Promise<void> => {
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/api/admin/permis/demandes/depot')) return { ok: true, json: async () => ({ demandes, releveDelaiSecondes: 60 }) } as unknown as Response;
    return { ok: true, json: async () => ({}) } as unknown as Response; // /depot-presume (trace « copier »), etc.
  }) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(BlocDepot, { signalRafraichir: 0, onChangement })); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('Lot 1 — carrousel Téléservice (BlocDepot)', () => {
  it('liste vide → RIEN n’est rendu (return null conservé : pas de carrousel vide, pas de cadre orphelin)', async () => {
    await monter([]);
    expect(container.textContent).toBe('');
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it('N cartes → les N sont présentes, dans l’ORDRE de la source (listerADeposer)', async () => {
    await monter([carte(1, 'Alpha'), carte(2, 'Beta'), carte(3, 'Gamma')]);
    // une carte = un bouton « Marquer comme déposée »
    expect(boutons().filter((b) => b.textContent === 'Marquer comme déposée')).toHaveLength(3);
    const t = container.textContent ?? '';
    expect(t.indexOf('Alpha')).toBeGreaterThanOrEqual(0);
    expect(t.indexOf('Alpha')).toBeLessThan(t.indexOf('Beta'));
    expect(t.indexOf('Beta')).toBeLessThan(t.indexOf('Gamma'));
    // position initiale en TEXTE
    expect(container.textContent).toContain('1 sur 3');
  });

  it('la navigation (Suivant / Précédent) change la carte courante (position en texte)', async () => {
    await monter([carte(1, 'Alpha'), carte(2, 'Beta'), carte(3, 'Gamma')]);
    const suivant = boutons().find((b) => b.getAttribute('aria-label') === 'Carte suivante');
    const precedent = boutons().find((b) => b.getAttribute('aria-label') === 'Carte précédente');
    expect(suivant && precedent).toBeTruthy();
    expect((precedent as HTMLButtonElement).disabled).toBe(true); // début → Précédent inactif
    act(() => { suivant!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('2 sur 3');
    act(() => { suivant!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('3 sur 3');
    act(() => { precedent!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('2 sur 3');
  });

  it('les gestes de CarteDepot restent déclenchables : « Copier le texte » et « Copier le numéro » tracent le signal de dépôt', async () => {
    await monter([carte(1, 'Alpha')]);
    const copierTexte = boutons().find((b) => b.textContent === 'Copier le texte');
    const copierNum = boutons().find((b) => b.textContent === 'Copier le numéro de permis');
    expect(copierTexte && copierNum).toBeTruthy();
    await act(async () => { copierTexte!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { copierNum!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    const appels = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(appels.some((u) => u.includes('/api/admin/permis/depot-presume'))).toBe(true); // signalerDepot a bien tracé (onCopie déclenché)
  });

  it('« Copier l’adresse » copie l’adresse affichée SANS effet de bord : accusé « Adresse copiée », AUCUNE trace de dépôt', async () => {
    // Carte RÉELLE portant une adresse « propre » → la ligne « Adresse : … » et son bouton de copie apparaissent.
    const c: DepotAffiche = { ...carte(1, 'Asnieres'), dossiers: [{ type: 'PC', numDau: '07511524V0006', adresse: '1 rue de la Paix', codePostal: '75002', communeNom: 'Asnieres', parcelles: ['AB-1'], soeurs: [] }] };
    await monter([c]);
    const copierAdr = boutons().find((b) => /Copier l.adresse/.test(b.textContent ?? ''));
    expect(copierAdr).toBeTruthy();
    await act(async () => { copierAdr!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    // (1) copie clipboard = l'adresse AFFICHÉE (voie + ville/CP), SANS l'arrondissement (ligne séparée « Arrondissement : … »).
    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;
    expect(writeText).toHaveBeenCalled();
    const copie = String(writeText.mock.calls.at(-1)?.[0] ?? '');
    expect(copie).toContain('rue de la Paix');     // la voie affichée
    expect(copie).not.toContain('Arrondissement'); // jamais le libellé de la ligne séparée
    // (2) ACCUSÉ vert (MÊME modèle que les deux autres) : le bouton passe à « ✓ Adresse copiée ».
    expect(copierAdr!.getAttribute('aria-pressed')).toBe('true');
    expect(copierAdr!.textContent).toContain('Adresse copiée');
    // (3) AUCUN effet de bord : PAS de trace de dépôt (à l'inverse de « Copier le texte / le numéro », vérifiés au test précédent).
    const appels2 = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(appels2.some((u) => u.includes('/api/admin/permis/depot-presume'))).toBe(false);
  });
});

/**
 * LOT 9 — AFFICHAGE AUTOMATIQUE : cartes de dépôt VIRTUELLES (communes libres) rendues COMPLÈTES sans clic, matérialisées au 1er
 * geste réel. Le GET renvoie `virtuels` ; le POST /demandes/depot-auto (matérialisation) renvoie l'id de la demande créée.
 */
const virtuel = (cle: string, commune: string) => ({
  cle, codeInsee: '75056', communeNom: commune, url: `https://ts.${commune.toLowerCase()}.fr`,
  corps: `Texte de la demande pour ${commune}`, nbDossiers: 1,
  dossiers: [{ type: 'PC' as const, numDau: '07511524V0006', adresse: '1 rue de la Paix', codePostal: '75002', communeNom: commune, parcelles: ['AB-1'], soeurs: [] }],
});

describe('LOT 9 — cartes virtuelles (BlocDepot)', () => {
  let appels: { url: string; method: string; body: unknown }[];
  const monterV = async (demandes: DepotAffiche[], virtuels: ReturnType<typeof virtuel>[], opts: { afficherVirtuels?: boolean; onChangement?: () => void } = {}): Promise<void> => {
    appels = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url); const method = init?.method ?? 'GET';
      appels.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/demandes/depot-auto')) return { ok: true, status: 200, json: async () => ({ ok: true, id: 4242 }) } as unknown as Response; // matérialisation
      if (u.includes('/demandes/depot') && method === 'POST') return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response; // dépôt
      if (u.includes('/demandes/depot')) return { ok: true, json: async () => ({ demandes, virtuels, releveDelaiSecondes: 60 }) } as unknown as Response; // GET liste
      return { ok: true, json: async () => ({}) } as unknown as Response; // depot-presume, etc.
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(BlocDepot, { signalRafraichir: 0, afficherVirtuels: opts.afficherVirtuels ?? true, onChangement: opts.onChangement ?? vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };
  const posteDepotAuto = (): boolean => appels.some((a) => a.url.includes('/demandes/depot-auto') && a.method === 'POST');

  it('commune libre → sa carte de dépôt COMPLÈTE est rendue SANS clic (texte + copier + déposer), et AUCUN POST tant qu’on n’y touche pas', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')]);
    expect(container.textContent).toContain('Asnieres');
    expect(container.querySelector('textarea')).toBeTruthy();                          // le corps figé est présent
    expect(boutons().some((b) => b.textContent === 'Copier le texte')).toBe(true);
    expect(boutons().some((b) => b.textContent === 'Marquer comme déposée')).toBe(true);
    expect(posteDepotAuto()).toBe(false);                                              // PREUVE — rien affiché ≠ rien créé : aucune demande fantôme
  });

  it('plus AUCUN bouton intermédiaire « Préparer cette demande / les demandes » à l’écran', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')]);
    expect(boutons().some((b) => /Préparer (cette demande|les demandes)/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('la carte virtuelle n’a PAS de bouton « Annuler » (aucune demande à annuler tant qu’elle n’est pas matérialisée)', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')]);
    expect(container.textContent).not.toMatch(/Annuler cette demande/i);
  });

  it('« Copier le texte » sur une carte virtuelle → matérialise la demande (POST …/depot-auto)', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')]);
    const copier = boutons().find((b) => b.textContent === 'Copier le texte');
    await act(async () => { copier!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(posteDepotAuto()).toBe(true); // la copie (client) déclenche la matérialisation en arrière-plan
  });

  it('« Copier l’adresse » sur une carte virtuelle NE matérialise PAS la demande (aucun POST …/depot-auto)', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')]);
    const copierAdr = boutons().find((b) => /Copier l.adresse/.test(b.textContent ?? ''));
    expect(copierAdr).toBeTruthy();                    // la carte virtuelle a une adresse « propre » → le bouton est là
    await act(async () => { copierAdr!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(posteDepotAuto()).toBe(false);              // À PART, sans effet de bord : copier l'adresse ne crée AUCUNE demande
  });

  it('« Marquer comme déposée » sur une carte virtuelle → matérialise PUIS dépose (id renvoyé réutilisé)', async () => {
    const onChangement = vi.fn();
    await monterV([], [virtuel('11-12', 'Asnieres')], { onChangement });
    const deposer = boutons().find((b) => b.textContent === 'Marquer comme déposée');
    await act(async () => { deposer!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(posteDepotAuto()).toBe(true);                                              // matérialisation d'abord
    const depot = appels.find((a) => a.url.includes('/demandes/depot') && !a.url.includes('depot-auto') && a.method === 'POST');
    expect(depot).toBeTruthy();
    expect((depot!.body as { id?: number }).id).toBe(4242);                           // le dépôt réutilise l'id matérialisé
    expect(onChangement).toHaveBeenCalled();                                          // succès → rafraîchissement
  });

  it('mode manuel (afficherVirtuels=false) → les cartes virtuelles sont masquées (les réelles restent)', async () => {
    await monterV([carte(1, 'Reelle')], [virtuel('11-12', 'Asnieres')], { afficherVirtuels: false });
    expect(container.textContent).toContain('Reelle');       // la demande déjà préparée reste
    expect(container.textContent).not.toContain('Asnieres'); // la virtuelle est masquée en mode manuel
  });

  it('afficherVirtuels=false ET aucune demande réelle → RIEN (return null)', async () => {
    await monterV([], [virtuel('11-12', 'Asnieres')], { afficherVirtuels: false });
    expect(container.textContent).toBe('');
  });
});

/**
 * RELECTURE EN DIRECT — le carrousel SUIT le vivier SERVEUR (GET …/demandes/depot) : une commune qui n'est plus proposée (référence
 * enregistrée, dépôt sans référence, auto-confirmation d'accusé…) voit sa carte disparaître SANS rechargement de page, avec une
 * confirmation la NOMMANT, et un état vide explicite si tout part. GARDE ANTI-MORPHING : aucune carte ne s'efface pendant un geste
 * (champ focalisé). On PILOTE la réponse serveur (`reponse`, mutable) et on déclenche la relecture par un événement `focus`.
 */
describe('RELECTURE EN DIRECT — le carrousel suit le vivier serveur (sans reload)', () => {
  let reponse: { demandes: DepotAffiche[]; virtuels: unknown[] };
  const monterSuivi = async (): Promise<void> => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/api/admin/permis/demandes/depot')) return { ok: true, json: async () => ({ ...reponse, releveDelaiSecondes: 60 }) } as unknown as Response;
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(BlocDepot, { signalRafraichir: 0, onChangement: vi.fn() })); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };
  const relireAuFocus = async (): Promise<void> => {
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  };
  const nbCartes = (): number => boutons().filter((b) => b.textContent === 'Marquer comme déposée').length;

  it('une commune qui quitte le vivier serveur → carte retirée au retour de focus, SANS reload, + confirmation la nommant', async () => {
    reponse = { demandes: [carte(1, 'Alpha'), carte(2, 'Beta')], virtuels: [] };
    await monterSuivi();
    expect(nbCartes()).toBe(2);
    reponse = { demandes: [carte(1, 'Alpha')], virtuels: [] }; // le serveur ne propose plus Beta (bascule hors carrousel)
    await relireAuFocus();
    expect(nbCartes()).toBe(1);                              // carte Beta retirée sans rechargement de page
    expect(container.textContent).toContain('1 sur 1');      // carrousel recomposé (compteur remis à jour)
    expect(container.textContent).toMatch(/Beta.*partie en/); // confirmation NOMMANT la commune partie
  });

  it('ANTI-MORPHING — pendant une saisie dans une carte (champ focalisé), la relecture ne retire AUCUNE carte', async () => {
    reponse = { demandes: [carte(1, 'Alpha'), carte(2, 'Beta')], virtuels: [] };
    await monterSuivi();
    const input = container.querySelector('input') as HTMLInputElement | null; // champ « référence mairie » d'une carte
    expect(input).toBeTruthy();
    input!.focus(); // geste EN COURS dans une carte
    reponse = { demandes: [carte(1, 'Alpha')], virtuels: [] }; // Beta a disparu côté serveur…
    await relireAuFocus();
    expect(nbCartes()).toBe(2); // …mais les DEUX cartes restent (aucun morphing pendant la saisie)
  });

  it('carrousel VIDÉ après un départ → état vide EXPLICITE (jamais un blanc)', async () => {
    reponse = { demandes: [carte(1, 'Alpha')], virtuels: [] };
    await monterSuivi();
    reponse = { demandes: [], virtuels: [] }; // plus rien à déposer
    await relireAuFocus();
    expect(nbCartes()).toBe(0);                                             // plus aucune carte
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toMatch(/Alpha.*partie en/);              // confirmation du départ (nommée)
    expect(container.textContent).toMatch(/Plus aucune commune à déposer/); // état vide explicite (pas un blanc)
  });
});
