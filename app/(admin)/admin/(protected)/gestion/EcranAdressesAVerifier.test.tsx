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
    propositions: [{ banId: 'B33', libelle: '33 rue Pergolèse, 75116 Paris', court: '33 rue Pergolèse', score: 1 }], essai: false,
    plage: { texte: '33-35', adresses: [{ banId: 'B33', libelle: '33 rue Pergolèse, 75116 Paris', court: '33 rue Pergolèse', score: null }, { banId: 'B35', libelle: '35 rue Pergolèse, 75116 Paris', court: '35 rue Pergolèse', score: null }] } },
  { cle: 'k2', ecriture: '7 rue Inconnue', codePostal: '77000', commune: 'MELUN', lots: [9], statut: 'introuvable', motif: 'Commune absente de la Base Adresse locale', propositions: [], plage: null, essai: false },
  { cle: 'k3', ecriture: '18 Rue Pierre Curie', codePostal: '92800', commune: 'PUTEAUX', lots: [4, 5], statut: 'a_verifier', motif: 'Nom de voie trop différent', essai: false, plage: null,
    propositions: [{ banId: 'B18', libelle: '18 rue Pierre et Marie Curie, 92800 Puteaux', court: '18 rue Pierre et Marie Curie', score: 0.76 }] },
  { cle: 'k4', ecriture: '126 - 128 rue de Villiers', codePostal: '92300', commune: 'LEVALLOIS PERRET', lots: [6], statut: 'a_verifier', motif: 'Plage de numéros (126-128)', essai: false,
    propositions: [{ banId: 'B128', libelle: '128 rue de Villiers, 92300 Levallois-Perret', court: '128 rue de Villiers', score: 1 }],
    plage: { texte: '126-128', adresses: [{ banId: 'B128', libelle: '128 rue de Villiers, 92300 Levallois-Perret', court: '128 rue de Villiers', score: null }] } },
  { cle: 'k5', ecriture: '7 rue _TEST Digicode', codePostal: '92600', commune: 'Asnières-sur-Seine', lots: [7, 8], statut: 'a_verifier', motif: 'Aucune proposition fiable', propositions: [], plage: null, essai: true },
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
    expect(container.querySelector('[data-eav-compte]')!.textContent).toBe('4'); // la fiche d'essai n'est pas comptée
    expect(compte).toHaveBeenCalledWith(4);
    const [a, b] = [...container.querySelectorAll('[data-eav-principales] > [data-eav-ecriture]')];
    expect(a.querySelector('[data-eav-statut]')!.textContent).toBe('À vérifier');
    expect(b.querySelector('[data-eav-statut]')!.textContent).toBe('Introuvable');
    expect(a.textContent).toContain('75116 Paris · 2 biens');
    expect(a.querySelector('[data-eav-motif]')!.textContent).toBe('Plage de numéros (33-35) : à vérifier');
    expect(a.querySelector('.eav-propositions')!.textContent).toContain('33 rue Pergolèse, 75116 Paris — ressemblance 1,00');
    expect(a.querySelector('[data-eav-plusieurs]')).not.toBeNull();
    expect(b.querySelector('[data-eav-plusieurs]')).toBeNull(); // pas de plage : pas de geste « Plusieurs adresses »
    expect(b.querySelector('[data-eav-commune]')!.textContent).toBe('77000 Melun · 1 bien'); // la commune en casse normale
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
  it('c) plusieurs adresses : toutes les adresses de la plage DÉJÀ cochées ; décocher tout rend « Valider » inactif ; la fenêtre les cite toutes', async () => {
    await monter();
    await clic(container.querySelector('[data-eav-plusieurs]'));
    const valider = container.querySelector('[data-eav-plusieurs-valider]') as HTMLButtonElement;
    expect([...container.querySelectorAll<HTMLInputElement>('[data-eav-coche]')].map((x) => x.checked)).toEqual([true, true]);
    await clic(container.querySelector('[data-eav-coche="B33"]'));
    await clic(container.querySelector('[data-eav-coche="B35"]'));
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

describe('b) la liste de l’auto-complétion passe par la fonction d’affichage unique', () => {
  it('« 1 Villa Des Lilas » / « COURBEVOIE » s’affiche « 1 villa des Lilas, 92400 Courbevoie », dans la liste, le champ et la fenêtre ; la valeur envoyée reste celle de la BAN', async () => {
    const f0 = global.fetch;
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => (String(u).startsWith('https://api-adresse.data.gouv.fr/')
      ? json({ features: [{ properties: { label: '1 Villa Des Lilas 92400 COURBEVOIE', name: '1 Villa Des Lilas', postcode: '92400', city: 'COURBEVOIE' } }] })
      : (f0 as (a: unknown, b?: unknown) => Promise<Response>)(u, init))) as unknown as typeof fetch;
    await monter();
    await clic(container.querySelector('[data-eav-autre]'));
    const champ = container.querySelector('[data-eav-panneau-autre] input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '1 villa des lilas'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); }); await attendre();
    const prop = container.querySelector('.cab-prop')!;
    expect(prop.textContent).toBe('1 villa des Lilas, 92400 Courbevoie');
    await act(async () => { prop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }); await attendre();
    expect((container.querySelector('[data-eav-panneau-autre] input') as HTMLInputElement).value).toBe('1 villa des Lilas, 92400 Courbevoie');
    await clic(container.querySelector('[data-eav-autre-utiliser]'));
    expect(container.querySelector('[data-eav-fenetre]')!.textContent).toContain('1 villa des Lilas, 92400 Courbevoie');
    await clic(container.querySelector('[data-eav-confirmer]'));
    expect((posts[0].adresse as Record<string, string>).voie).toBe('1 Villa Des Lilas');
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

describe('🔴 les plages de numéros (Arno, 20/11/2026)', () => {
  it('« Plusieurs adresses » est le bouton PRINCIPAL, TOUJOURS présent (même quand la Base ne connaît qu’un numéro : 126-128) ; « Une seule adresse : … » est secondaire', async () => {
    await monter();
    for (const ecr of ['33-35 rue Pergolèse 75116 Paris', '126 - 128 rue de Villiers']) {
      const c = [...container.querySelectorAll('[data-eav-ecriture]')].find((x) => x.getAttribute('data-eav-ecriture') === ecr)!;
      expect(c.querySelector('[data-eav-plusieurs]')!.className).toContain('svv-btn-primary');
      const seule = c.querySelector('[data-eav-valider]')!;
      expect(seule.className).toContain('svv-btn-outline');
      expect(seule.textContent).toMatch(/^Une seule adresse : (33 rue Pergolèse|128 rue de Villiers)$/);
    }
    // pas une plage : « Valider la proposition », bouton principal
    const pc = [...container.querySelectorAll('[data-eav-ecriture]')].find((x) => x.getAttribute('data-eav-ecriture') === '18 Rue Pierre Curie')!;
    expect(pc.querySelector('[data-eav-valider]')!.textContent).toBe('Valider la proposition');
    expect(pc.querySelector('[data-eav-valider]')!.className).toContain('svv-btn-primary');
    expect(pc.textContent).toContain('18 rue Pierre et Marie Curie, 92800 Puteaux');
  });
  it('126-128 : la seule adresse connue est cochée, « Valider ces adresses » est actif, et l’écran dit que la Base ne connaît qu’un numéro', async () => {
    await monter();
    const c = [...container.querySelectorAll('[data-eav-ecriture]')].find((x) => x.getAttribute('data-eav-ecriture') === '126 - 128 rue de Villiers')!;
    await clic(c.querySelector('[data-eav-plusieurs]'));
    expect((c.querySelector('[data-eav-coche="B128"]') as HTMLInputElement).checked).toBe(true);
    expect(c.querySelector('[data-eav-plage-seule]')).not.toBeNull();
    expect((c.querySelector('[data-eav-plusieurs-valider]') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('🔴 les fiches d’essai (Arno, 20/11/2026)', () => {
  it('à part, dans un bloc replié « Fiches d’essai (N) » en bas, avec les mêmes gestes ; hors du compte', async () => {
    await monter();
    const bloc = container.querySelector('[data-eav-essais]') as HTMLDetailsElement;
    expect(bloc.open).toBe(false);
    expect(bloc.querySelector('[data-eav-essais-titre]')!.textContent).toBe('Fiches d’essai (1)');
    const carte = bloc.querySelector('[data-eav-ecriture="7 rue _TEST Digicode"]')!;
    expect(carte.querySelector('[data-eav-autre]')).not.toBeNull();
    expect(carte.querySelector('[data-eav-hors]')).not.toBeNull();
    expect(container.querySelector('[data-eav-principales] [data-eav-ecriture="7 rue _TEST Digicode"]')).toBeNull();
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
