// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';

/**
 * LOT BROUILLONS-GMAIL — L'ENREGISTREMENT EN CONTINU, REJOUÉ SUR LE VRAI ÉDITEUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ON MESURAIT AVANT CE LOT, à l'écran, le 29/09/2026 : minuterie de 1 200 ms, aucun enregistrement à la
 * fermeture ni au rechargement, aucun indicateur — et UN DOUBLON systématique (deux POST pour un brouillon neuf).
 *
 * ⚠️ CE FICHIER MONTE L'ÉDITEUR ET COMPTE LES REQUÊTES. Un test qui se contenterait de relire le source dirait que
 * le mot « keepalive » est écrit ; il ne dirait pas qu'un texte tapé survit à la fermeture de l'onglet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};

const NEUF: BrouillonEcran = {
  id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion',
  citation: null, destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
};

let container: HTMLDivElement;
let root: Root;
let posts: { corps: string; keepalive: boolean }[];
let balises: number;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; balises = 0;
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string; body?: string; keepalive?: boolean }) => {
    const url = String(entree);
    if (init?.method === 'POST' && /\/brouillons$/.test(url)) {
      posts.push({ corps: String(init.body ?? ''), keepalive: init.keepalive === true });
      return new Response(JSON.stringify({ ok: true, brouillon: { id: 4242 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  vi.stubGlobal('navigator', Object.assign(Object.create(Object.getPrototypeOf(navigator)), navigator, {
    sendBeacon: vi.fn(() => { balises += 1; return true; }),
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => {
  act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await calmer(); };

/** Monte l'éditeur et rend de quoi le faire changer, comme le ferait une frappe. */
const monter = async (depart: BrouillonEcran = NEUF) => {
  let courant = depart;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
  return {
    modifier: async (maj: Partial<BrouillonEcran>) => {
      courant = { ...courant, ...maj };
      await act(async () => { rendre(); });
      await calmer();
    },
    courant: () => courant,
  };
};

describe('🔴🔴 l’enregistrement part deux secondes après la frappe — et UNE seule fois', () => {
  it('rien n’est écrit avant les deux secondes', async () => {
    const e = await monter();
    await e.modifier({ corps: 'Bonjour,\n\nService Gestion' });
    await avancer(1500);
    expect(posts).toHaveLength(0);
    await avancer(700);
    expect(posts).toHaveLength(1);
  });

  /**
   * 🔴🔴 LE DÉFAUT MESURÉ AVANT CE LOT : le brouillon partait à +1,6 s, revenait avec son identifiant, ce qui
   * changeait son état — et une SECONDE écriture partait à +3,6 s. Une sur deux ne servait à rien.
   */
  it('🔴🔴 recevoir son identifiant ne déclenche PAS une seconde écriture', async () => {
    const e = await monter();
    await e.modifier({ corps: 'Bonjour,\n\nService Gestion' });
    await avancer(2100);
    expect(posts).toHaveLength(1);
    // L'identifiant est remonté par `onChange` : l'éditeur s'est re-rendu avec, et ne doit rien réécrire.
    expect(e.courant().id).toBe(4242);
    await avancer(5000);
    expect(posts).toHaveLength(1);
  });

  it('⚠️ et l’écriture porte bien l’identifiant reçu : on MET À JOUR, on ne recrée pas', async () => {
    const e = await monter();
    await e.modifier({ corps: 'un' });
    await avancer(2100);
    await e.modifier({ corps: 'un puis deux' });
    await avancer(2100);
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[0].corps).id).toBeNull();
    expect(JSON.parse(posts[1].corps).id).toBe(4242);
  });

  /** Un geste discret n'attend pas deux secondes : c'est celui qu'on oublie d'enregistrer en fermant. */
  it('🔴 ajouter un destinataire s’enregistre tout de suite (un quart de seconde)', async () => {
    const e = await monter();
    await e.modifier({ a: ['locataire@exemple.test'] });
    await avancer(300);
    expect(posts).toHaveLength(1);
  });
});

describe('🔴🔴 on part : le texte ne doit pas partir avec l’onglet', () => {
  it('🔴🔴 `pagehide` enregistre ce qui n’a pas encore été écrit, en requête survivante', async () => {
    const e = await monter();
    await e.modifier({ corps: 'trois mots tapés à la hâte' });
    // On part AVANT la fin des deux secondes : sans cet enregistrement, ce texte serait perdu.
    await avancer(300);
    expect(posts).toHaveLength(0);
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0].keepalive).toBe(true);
    expect(JSON.parse(posts[0].corps).corps).toContain('trois mots');
  });

  it('🔴 et rien n’est écrit deux fois : ce qui vient de partir ne repart pas', async () => {
    const e = await monter();
    await e.modifier({ corps: 'texte' });
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await calmer();
    expect(posts).toHaveLength(1);
    await avancer(3000);
    expect(posts).toHaveLength(1);
  });

  /** ⚠️ UN MAIL VIDE NE CRÉE TOUJOURS AUCUN BROUILLON — la règle d'hier, et on la garde jusque dans la sortie. */
  it('🔴🔴 partir sans avoir rien saisi n’écrit RIEN', async () => {
    await monter();
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await calmer();
    expect(posts).toHaveLength(0);
    expect(balises).toBe(0);
  });

  it('🔴 mettre en forme la signature ne crée pas de brouillon (défaut du n° 51)', async () => {
    const e = await monter();
    // Même texte utile, espaces réarrangés par la conversion HTML → texte, et du HTML en plus.
    await e.modifier({ corps: ' Service  Gestion ', corpsHtml: '<p><span style="background:#ff0">Service Gestion</span></p>' });
    await avancer(3000);
    expect(posts).toHaveLength(0);
  });
});

describe('🔴 l’indicateur, discret, en bas', () => {
  it('il ne dit rien tant qu’on n’a rien écrit, puis annonce l’enregistrement', async () => {
    const e = await monter();
    expect((container.querySelector('.red-enreg')?.textContent ?? '').trim()).toBe('');
    await e.modifier({ corps: 'quelque chose' });
    await avancer(2100);
    expect((container.querySelector('.red-enreg')?.textContent ?? '').trim()).toBe('Brouillon enregistré');
  });
});

/**
 * ══ 🔴 « Cc » ET « Cci » DANS LE CHAMP « À » ═══════════════════════════════════════════════════════════════════
 * C'est un DÉPLACEMENT demandé par Arno : le lien « Ajouter Cc / Cci » vivait SOUS le champ ; les deux boutons
 * sont maintenant DANS le champ, collés à droite, comme dans Gmail. La fonction est identique.
 */
describe('🔴 Cc et Cci sont dans le champ « À »', () => {
  it('les deux boutons sont dans la boîte du champ, et l’ancien lien n’existe plus', async () => {
    await monter();
    const champA = container.querySelector('.red-champ');
    const dedans = champA?.querySelectorAll('.red-champ-actions .red-copie-bouton') ?? [];
    expect([...dedans].map((b) => b.textContent)).toEqual(['Cc', 'Cci']);
    expect(container.textContent).not.toContain('Ajouter Cc / Cci');
  });

  it('🔴 un clic ouvre le champ correspondant, et lui seul', async () => {
    await monter();
    const [cc] = [...container.querySelectorAll('.red-copie-bouton')] as HTMLButtonElement[];
    expect([...container.querySelectorAll('.red-label')].map((l) => l.textContent)).not.toContain('Cc');
    await act(async () => { cc.click(); });
    await calmer();
    const libelles = [...container.querySelectorAll('.red-label')].map((l) => l.textContent);
    expect(libelles).toContain('Cc');
    // ⚠️ « Cci » reste replié : demander une copie ne doit pas ouvrir un champ de copie cachée dont on n'a que faire.
    expect(libelles).not.toContain('Cci');
  });

  it('🔴 un brouillon qui PORTE déjà des Cc les montre d’emblée', async () => {
    await monter({ ...NEUF, id: 14, repris: true, cc: ['b.jonqueur@exemple.test'] });
    expect([...container.querySelectorAll('.red-label')].map((l) => l.textContent)).toContain('Cc');
  });
});

/** ⚠️ L'ancien lien ne doit pas revenir par une autre porte : on le vérifie aussi sur le source. */
describe('⚠️ l’ancien lien a bien disparu du source', () => {
  it('plus de bouton « Ajouter Cc / Cci »', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    expect(code).not.toContain('Ajouter Cc / Cci');
    expect(code).toContain('actions={(');
  });
});
