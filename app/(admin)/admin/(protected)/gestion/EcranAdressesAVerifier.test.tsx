// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CSS_ECRAN_ADRESSES, EcranAdressesAVerifier } from './EcranAdressesAVerifier';

/** 🔴🔴 Arno (20/11/2026, « Adresse officielle BAN », lot 6) — l'écran « Adresses à vérifier » : la file, les quatre gestes confirmés, l'annulation. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[]; let reponse: Record<string, unknown>;
const FILE = [
  { cle: 'k1', ecriture: '33-35 rue Pergolèse 75116 Paris', codePostal: '75116', commune: 'Paris', lots: [1, 2], statut: 'a_verifier', motif: 'Plage de numéros (33-35) : à vérifier',
    propositions: [{ banId: 'B33', libelle: '33 rue Pergolèse, 75116 Paris', score: 1 }],
    plage: { texte: '33-35', adresses: [{ banId: 'B33', libelle: '33 rue Pergolèse, 75116 Paris', score: null }, { banId: 'B35', libelle: '35 rue Pergolèse, 75116 Paris', score: null }] } },
  { cle: 'k2', ecriture: '7 rue Inconnue', codePostal: '77000', commune: 'Melun', lots: [9], statut: 'introuvable', motif: 'Commune absente de la Base Adresse locale', propositions: [], plage: null },
];
const RECENTS = [{ operationId: 7, le: '20/11/2026 à 15h02', par: 'a.jorel@sansvisavis.com', geste: 'valider', ecriture: '15 rue Cavalotti', adresses: ['15 rue Cavallotti, 75018 Paris'], raison: null }];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  reponse = { etat: 'ok', data: { message: 'enregistré' } };
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json(reponse); }
    if (String(u).startsWith('/api/admin/gestion/adresses-a-verifier')) return json({ etat: 'ok', data: { file: FILE, recents: RECENTS } });
    return json({ etat: 'ok', data: [] });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
const attendre = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const monter = async (onCompte?: (n: number) => void) => { await act(async () => { root.render(createElement(EcranAdressesAVerifier, { onCompte })); }); await attendre(); };

describe('la file', () => {
  it('une carte par écriture : l’écriture, le statut ÉCRIT à côté de sa couleur, la commune, le nombre de biens, le motif, les propositions et leur ressemblance ; le compteur', async () => {
    const compte = vi.fn();
    await monter(compte);
    expect(container.querySelector('[data-eav-compte]')!.textContent).toBe('2');
    expect(compte).toHaveBeenCalledWith(2);
    const [a, b] = [...container.querySelectorAll('[data-eav-ecriture]')];
    expect(a.querySelector('[data-eav-statut]')!.textContent).toBe('À vérifier');
    expect(b.querySelector('[data-eav-statut]')!.textContent).toBe('Introuvable');
    expect(a.textContent).toContain('75116 Paris · 2 biens');
    expect(a.querySelector('[data-eav-motif]')!.textContent).toBe('Plage de numéros (33-35) : à vérifier');
    expect(a.querySelector('.eav-propositions')!.textContent).toContain('33 rue Pergolèse, 75116 Paris — ressemblance 1,00');
    expect(a.querySelector('[data-eav-plusieurs]')).not.toBeNull();
    expect(b.querySelector('[data-eav-plusieurs]')).toBeNull(); // pas de plage : pas de geste « Plusieurs adresses »
  });
});

describe('les gestes, chacun après une fenêtre de confirmation', () => {
  it('a) valider : la fenêtre dit l’adresse ; rien n’est envoyé avant « Confirmer » ; puis la confirmation visible', async () => {
    await monter();
    await clic(container.querySelector('[data-eav-valider="B33"]'));
    const f = container.querySelector('[data-eav-fenetre="confirmer"]')!;
    expect(f.getAttribute('role')).toBe('dialog');
    expect(f.textContent).toContain('33 rue Pergolèse, 75116 Paris');
    expect(posts).toEqual([]);
    await clic(f.querySelector('[data-eav-confirmer]'));
    expect(posts).toEqual([{ action: 'geste', geste: 'valider', cle: 'k1', banId: 'B33' }]);
    expect(container.querySelector('[data-eav-fenetre]')).toBeNull();
    expect(container.querySelector('[data-eav-message]')!.textContent).toBe('✓ enregistré');
  });
  it('« Retour » ferme la fenêtre sans rien envoyer ; un refus du serveur reste dans la fenêtre', async () => {
    await monter();
    await clic(container.querySelector('[data-eav-valider="B33"]'));
    await clic([...container.querySelectorAll('[data-eav-fenetre] button')].find((x) => x.textContent === 'Retour')!);
    expect(container.querySelector('[data-eav-fenetre]')).toBeNull();
    expect(posts).toEqual([]);
    reponse = { etat: 'refus', motif: 'Cette adresse officielle est déjà celle d’une AUTRE copropriété enregistrée' };
    await clic(container.querySelector('[data-eav-valider="B33"]'));
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect(container.querySelector('[data-eav-refus]')!.textContent).toMatch(/AUTRE copropriété/);
  });
  it('c) plusieurs adresses : au moins deux cochées ; la fenêtre les cite toutes', async () => {
    await monter();
    await clic(container.querySelector('[data-eav-plusieurs]'));
    const valider = container.querySelector('[data-eav-plusieurs-valider]') as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    await clic(container.querySelector('[data-eav-coche="B33"]'));
    await clic(container.querySelector('[data-eav-coche="B35"]'));
    expect(valider.disabled).toBe(false);
    await clic(valider);
    expect(container.querySelector('[data-eav-fenetre]')!.textContent).toContain('33 rue Pergolèse, 75116 Paris · 35 rue Pergolèse, 75116 Paris');
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect(posts).toEqual([{ action: 'geste', geste: 'plusieurs', cle: 'k1', banIds: ['B33', 'B35'] }]);
  });
  it('d) hors périmètre : impossible sans raison', async () => {
    await monter();
    await clic(container.querySelectorAll('[data-eav-hors]')[1]);
    const bouton = container.querySelector('[data-eav-hors-valider]') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    const t = container.querySelector('[data-eav-raison]') as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, 'commune non couverte'); t.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(bouton.disabled).toBe(false);
    await clic(bouton);
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect(posts).toEqual([{ action: 'geste', geste: 'hors', cle: 'k2', raison: 'commune non couverte' }]);
  });
  it('b) une autre adresse : le champ d’auto-complétion unique ; « Utiliser » reste inactif tant qu’aucune adresse n’est choisie dans la liste', async () => {
    await monter();
    await clic(container.querySelector('[data-eav-autre]'));
    expect(container.querySelector('[data-eav-panneau-autre] input')).not.toBeNull();
    expect((container.querySelector('[data-eav-autre-utiliser]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('annuler ce choix', () => {
  it('les choix faits restent annulables, après confirmation', async () => {
    await monter();
    expect(container.querySelector('[data-eav-recent="7"]')!.textContent).toContain('« 15 rue Cavalotti » — proposition validée : 15 rue Cavallotti, 75018 Paris');
    await clic(container.querySelector('[data-eav-annuler="7"]'));
    expect(container.querySelector('[data-eav-fenetre="annuler"]')).not.toBeNull();
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect(posts).toEqual([{ action: 'annuler', operationId: 7 }]);
  });
});

describe('pendant que la file se relit', () => {
  it('après un geste, les boutons restent grisés jusqu’à ce que la file soit relue (jamais un second clic sur une ligne périmée)', async () => {
    let relire: (() => void) | null = null;
    await monter();
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json(reponse); }
      await new Promise<void>((r) => { relire = r; });
      return json({ etat: 'ok', data: { file: FILE, recents: [] } });
    }) as unknown as typeof fetch;
    await clic(container.querySelector('[data-eav-annuler="7"]'));
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect((container.querySelector('[data-eav-annuler="7"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('[data-eav-valider="B33"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { relire!(); }); await attendre();
    expect((container.querySelector('[data-eav-valider="B33"]') as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[data-eav-annuler="7"]')).toBeNull();
  });
});

describe('le style', () => {
  it('jetons --color-svv-* seulement, cibles de 44 px, aucun accent grave', () => {
    expect(CSS_ECRAN_ADRESSES).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
    expect(CSS_ECRAN_ADRESSES).toContain('.eav-btn{min-height:44px}');
    expect(CSS_ECRAN_ADRESSES).not.toContain('`');
  });
});
