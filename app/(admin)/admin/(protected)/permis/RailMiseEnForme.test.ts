// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RechercheVivier, type TransfertRenvoi } from './RechercheVivier';
import { BandeauReglages } from './DemandesRendu';
import { BlocRepliable } from './BlocRepliable';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';

/**
 * MISE EN FORME du rail (lot repli) — COMPORTEMENT de la composition RÉELLE montée par ADemanderVue : le moteur de recherche
 * (RechercheVivier) et le bandeau d'ancienneté (BandeauReglages) enveloppés dans le MÊME BlocRepliable que les autres blocs de
 * l'écran. jsdom + act, sans testing-library ; `createElement`, pas de JSX (convention .test.ts). On vérifie le REPLI (fermé au
 * montage, sur les deux rails), la PRÉSERVATION de l'état du moteur au replier/déplier (invariant clé — le BlocRepliable cache en
 * CSS, ne démonte pas), la non-régression du RENVOI (ouvrirSignal rouvre + rejoue le report) et le PLACEMENT (source ADemanderVue).
 * Aucune assertion de couleur/pixel/classe.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let urls: string[];

const CATS = [
  { cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 },
  { cle: 'surelevation', libelle: 'Surélévation', rang: 2 },
];
// Un permis du vivier (forme PermisVivier suffisante pour le rendu de ligne + le compteur).
const PERMIS = { codeInsee: '69123', numDau: 'PC-069', communeNom: 'Lyon', categorie: 'immeuble_neuf', dossierId: 1, type: 'PC', dateAutorisation: '2025-01-01', adresse: '1 rue X' };

const R = (corps: unknown): Response => ({ ok: true, json: async () => corps } as unknown as Response);

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url); urls.push(u);
    if (u.includes('/vivier-recherche')) return R({ resultats: [PERMIS], total: 1, autreProcess: 0, tronque: false, bloquees: {}, plafonds: {} });
    return R({});
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const flush = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); };
const boutons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const parTexte = (m: RegExp): HTMLButtonElement | undefined => boutons().find((b) => m.test(b.textContent ?? ''));
const clic = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const champRecherche = (): HTMLInputElement | null => container.querySelector('input[aria-label^="Rechercher un permis"]');
const vivierUrls = (): string[] => urls.filter((u) => u.includes('/vivier-recherche'));

// Réplique EXACTE de l'enveloppe montée par ADemanderVue : titre porté par le repli, RechercheVivier en render-prop avec titreExterne.
//   `ouvrirQuand` (§2) = latch de dépliage au montage quand le rail actif est en mode manuel (ADemanderVue passe `railManuelCertain`).
const moteur = (process: Process, transfert?: TransfertRenvoi, ouvrirQuand?: boolean) => createElement(BlocRepliable, {
  titre: `Rechercher un permis / une ville — vivier ${PROCESS_META[process].court}`,
  ouvrirSignal: transfert?.jeton,
  ouvrirQuand,
}, () => createElement(RechercheVivier, {
  process, categories: CATS, onBasculer: vi.fn(), transfert, mode: 'auto', onPrepared: vi.fn(), signalRafraichir: 0, titreExterne: true,
}));
const rendreMoteur = async (process: Process, transfert?: TransfertRenvoi, ouvrirQuand?: boolean): Promise<void> => {
  await act(async () => { root.render(moteur(process, transfert, ouvrirQuand)); }); await flush();
};
const titreMoteur = (): HTMLButtonElement | undefined => parTexte(/Rechercher un permis \/ une ville — vivier/);
const rechercher = async (texte: string): Promise<void> => {
  const input = champRecherche()!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, texte); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};

describe('Moteur de recherche — FERMÉ au montage, sur les deux rails', () => {
  it('rail Téléservice : ligne de titre présente (libellé actuel), repliée, sans champ de recherche visible', async () => {
    await rendreMoteur('formulaire');
    const t = titreMoteur();
    expect(t?.textContent).toContain('vivier Téléservice');
    expect(t?.getAttribute('aria-expanded')).toBe('false'); // fermé
    expect(champRecherche()).toBeNull();                     // contenu non déplié
    expect(vivierUrls()).toHaveLength(0);                    // rien n'est chargé tant que c'est replié
  });

  it('rail E-mail : même ligne de titre (« vivier E-mail »), repliée', async () => {
    await rendreMoteur('email');
    expect(titreMoteur()?.textContent).toContain('vivier E-mail');
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('false');
    expect(champRecherche()).toBeNull();
  });
});

describe('Moteur de recherche — DÉPLIÉ au montage en mode MANUEL (ouvrirQuand), sur les deux rails ; panneau complet TOUJOURS fermé (§2)', () => {
  const moteurComplet = (): HTMLButtonElement | undefined => parTexte(/Moteur de recherche complet/);

  it('rail Téléservice, manuel : le moteur est DÉPLIÉ au montage (champ visible), le panneau « Moteur de recherche complet » reste FERMÉ', async () => {
    await rendreMoteur('formulaire', undefined, true);
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('true'); // déplié par la latch (rail en manuel)
    expect(champRecherche()).not.toBeNull();                            // le moteur est monté et visible
    expect(moteurComplet()?.getAttribute('aria-expanded')).toBe('false'); // le panneau d'options, lui, reste fermé
  });

  it('rail E-mail, manuel : même dépliage au montage, panneau complet fermé', async () => {
    await rendreMoteur('email', undefined, true);
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('true');
    expect(champRecherche()).not.toBeNull();
    expect(moteurComplet()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('mode automatique (ouvrirQuand=false) : le moteur reste FERMÉ au montage sur les deux rails', async () => {
    await rendreMoteur('formulaire', undefined, false);
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('false');
    expect(champRecherche()).toBeNull();
    await rendreMoteur('email', undefined, false);
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('false');
    expect(champRecherche()).toBeNull();
  });
});

describe('Moteur de recherche — DÉPLIÉ : recherche fonctionnelle, scope du rail (aucune régression)', () => {
  it('ouvrir → champ visible ; chercher → appel vivier-recherche scopé au process + compteur « N affichés sur M » + ligne', async () => {
    await rendreMoteur('formulaire');
    await clic(titreMoteur()!);
    expect(champRecherche()).not.toBeNull();
    await rechercher('lyon');
    const url = new URL(vivierUrls().at(-1)!, 'http://test');
    expect(url.searchParams.get('q')).toBe('lyon');
    expect(url.searchParams.get('process')).toBe('formulaire'); // scope du rail préservé
    expect(container.textContent).toContain('1 affiché sur 1'); // compteur honnête
    expect(container.textContent).toContain('PC-069');          // la ligne de résultat
  });
});

describe('Moteur de recherche — REPLIER/DÉPLIER préserve critères et résultats (invariant clé)', () => {
  it('replier puis déplier ne perd ni le terme, ni les résultats, et NE RELANCE PAS la recherche', async () => {
    await rendreMoteur('formulaire');
    await clic(titreMoteur()!);      // ouvrir
    await rechercher('lyon');
    expect(vivierUrls()).toHaveLength(1);
    await clic(titreMoteur()!);      // replier
    // caché en CSS, PAS démonté : le champ et les résultats restent dans le DOM avec leur valeur.
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('false');
    expect(champRecherche()?.value).toBe('lyon');
    expect(container.textContent).toContain('PC-069');
    await clic(titreMoteur()!);      // déplier de nouveau
    expect(champRecherche()?.value).toBe('lyon');   // terme intact
    expect(container.textContent).toContain('PC-069'); // résultats intacts
    expect(vivierUrls()).toHaveLength(1);           // AUCUN rechargement (état conservé, pas re-fetché)
  });
});

describe('Moteur de recherche — RENVOI (ouvrirSignal) : le repli s’ouvre et rejoue le report (non-régression §D)', () => {
  it('un transfert armé après coup OUVRE le bloc replié et exécute la recherche reportée', async () => {
    await rendreMoteur('formulaire');                 // fermé, sans transfert
    expect(champRecherche()).toBeNull();
    // le parent commute + arme un transfert (nouveau jeton) pour le rail d'arrivée → BlocRepliable.ouvrirSignal ouvre + monte le moteur.
    await rendreMoteur('formulaire', { cible: 'formulaire', q: 'villeurbanne', types: [], tri: null, jeton: 1 });
    expect(titreMoteur()?.getAttribute('aria-expanded')).toBe('true'); // repli ouvert par le renvoi
    expect(champRecherche()?.value).toBe('villeurbanne');
    const url = new URL(vivierUrls().at(-1)!, 'http://test');
    expect(url.searchParams.get('q')).toBe('villeurbanne'); // le report a bien exécuté la recherche
  });
});

describe('Bandeau d’ancienneté — REPLIABLE, fermé par défaut, fonctionnel une fois déplié (§3)', () => {
  const ancienne = () => createElement(BlocRepliable, { titre: 'Ancienneté & ordre d’examen' },
    () => createElement(BandeauReglages, { ancienneteMaxAnnees: 3, triLibelle: 'Date décroissante', moisSaisie: '36', maxMois: 36, onMois: vi.fn(), onAllerReglages: vi.fn() }));
  const champAnciennete = (): HTMLInputElement | null => container.querySelector('input[aria-label^="Ancienneté à filtrer"]');

  it('fermé au montage : titre court présent, champ « Filtrer par ancienneté » non déplié', async () => {
    await act(async () => { root.render(ancienne()); }); await flush();
    const t = parTexte(/Ancienneté & ordre/);
    expect(t).toBeDefined();
    expect(t?.getAttribute('aria-expanded')).toBe('false');
    expect(champAnciennete()).toBeNull();
  });

  it('déplié : le champ d’ancienneté et sa plage autorisée apparaissent et sont fonctionnels', async () => {
    const onMois = vi.fn();
    await act(async () => {
      root.render(createElement(BlocRepliable, { titre: 'Ancienneté & ordre d’examen' },
        () => createElement(BandeauReglages, { ancienneteMaxAnnees: 3, triLibelle: 'Date décroissante', moisSaisie: '36', maxMois: 36, onMois, onAllerReglages: vi.fn() })));
    });
    await flush();
    await clic(parTexte(/Ancienneté & ordre/)!);
    const champ = champAnciennete();
    expect(champ).not.toBeNull();
    expect(container.textContent).toContain('Plage autorisée : 1 – 36 mois');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(champ!, '12'); champ!.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onMois).toHaveBeenCalledWith('12'); // le filtre agit une fois déplié
  });
});

describe('Placement dans ADemanderVue (§1) — moteur sous le bloc auto/manuel, UNE seule instance', () => {
  const src = readFileSync(join(process.cwd(), 'app/(admin)/admin/(protected)/permis/ADemanderVue.tsx'), 'utf8');
  const compact = src.replace(/\s+/g, ' ');

  it('le moteur est UNIQUE (jamais dupliqué) et enveloppé dans un BlocRepliable portant le libellé du vivier', () => {
    expect((compact.match(/<RechercheVivier\b/g) ?? []).length).toBe(1);
    expect(compact).toContain('titre={`Rechercher un permis / une ville — vivier ${PROCESS_META[process].court}`}');
    expect(compact).toContain('titreExterne'); // le libellé est porté par le repli, pas répété dans le composant
    expect(compact).toContain('ouvrirSignal={transfert?.jeton}'); // le renvoi ouvre le repli
  });

  it('§2 — le moteur reçoit ouvrirQuand={railManuelCertain} (déplié au montage en manuel) SANS lâcher ouvrirSignal (renvoi inchangé)', () => {
    expect(compact).toContain('ouvrirSignal={transfert?.jeton}'); // non-régression §D : le renvoi reste branché
    expect(compact).toContain('ouvrirQuand={railManuelCertain}'); // §2 : dépliage au montage quand le rail actif est en manuel
    // railManuelCertain = manuel CERTAIN par rail : téléservice (état local) OU e-mail flag LU à OFF ; `null` (inconnu) n'ouvre jamais le moteur.
    expect(compact).toContain("modeTeleservice === 'manuel'");
    expect(compact).toContain('emailEnvoiAuto === false');
  });

  it('ORDRE : bloc auto/manuel → moteur repliable → stock (le moteur est bien JUSTE SOUS le bloc de sélection)', () => {
    const iMode = compact.indexOf('<ModeDemandeTeleservice');
    const iMoteur = compact.indexOf('titre={`Rechercher un permis / une ville — vivier');
    const iStock = compact.indexOf('<BlocStock');
    expect(iMode).toBeGreaterThanOrEqual(0);
    expect(iMoteur).toBeGreaterThan(iMode);
    expect(iStock).toBeGreaterThan(iMoteur);
  });

  it('le bandeau d’ancienneté est lui aussi enveloppé dans un BlocRepliable (titre court)', () => {
    expect(compact).toContain('titre="Ancienneté & ordre d’examen"');
    const iTitre = compact.indexOf('titre="Ancienneté & ordre');
    const iBandeau = compact.indexOf('<BandeauReglages');
    expect(iTitre).toBeGreaterThanOrEqual(0);
    expect(iBandeau).toBeGreaterThan(iTitre); // le bandeau est le contenu du repli
  });
});
