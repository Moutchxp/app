// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement as h } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * NON-RÉGRESSION — PRÉSENCE ET PLACEMENT des contrôles du bloc « Planche cadastrale » (comportement, DOM réel).
 *
 * Pourquoi ce test existe : l'alignement des colonnes (f30e208) avait DESCENDU la saisie d'adresse ET le curseur
 * « Voisines à … » SOUS le schéma cadastral. Sur un schéma haut (et en iPhone portrait), ces contrôles partaient
 * hors de vue : cliquer « Centrer sur l'adresse » ne montrait « rien » — la saisie semblait avoir disparu. Les tests
 * existants (lecture de SOURCE, `toContain`) ne l'ont pas vu : le JSX EXISTAIT dans le fichier, simplement mal placé.
 *
 * On MONTE donc réellement le composant (jsdom) et on prouve LE COMPORTEMENT :
 *   (1) les trois modes de centrage, le curseur des voisines et la validation sont PRÉSENTS ;
 *   (2) la saisie d'adresse APPARAÎT au clic « Centrer sur l'adresse » ;
 *   (3) — le cœur de la régression — saisie d'adresse ET curseur sont AU-DESSUS du schéma (ordre DOM), donc visibles
 *       juste sous la barre « Centrer : » où on les déclenche, jamais repoussés sous un grand schéma ;
 *   (4) les mêmes contrôles restent disponibles dans le PLEIN ÉCRAN du schéma (une seule source de vérité).
 * La liseuse (enfant réseau/pdf.js) est STUBBÉE ; aucun appel réseau réel (fetch mocké).
 */
vi.mock('./LiseusePieces', () => ({ LiseusePieces: () => null }));

import { PlancheParcelles } from './PlancheParcelles';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Planche = Record<string, unknown>;
// Planche NORMALE : empreinte + 1 parcelle du permis + 1 voisine → le schéma DESSINE (svg présent) et `parcellesChoix`
//   est non vide (pas d'auto-bascule en mode adresse : on teste le clic MANUEL sur « Centrer sur l'adresse »).
const planche = (): Planche => ({
  schema: { largeur: 360, hauteur: 300, empreintePath: 'M0,0 L10,0 L10,10 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'P1', path: 'M0,0 L10,0 L10,10 Z', cx: 5, cy: 5, horsEmpreinte: false },
      { repere: 'B', cleabs: 'P2', path: 'M20,0 L30,0 L30,10 Z', cx: 25, cy: 5, horsEmpreinte: true },
    ],
    transform: { minX: 0, minY: 0, scale: 1, padX: 0, padY: 0, hauteur: 300 } },
  meta: [
    { idu: 'P1', section: 'AB', numero: '1', retenue: true, origine: 'extraite', surfaceM2: 100, majPar: null, majLe: null, acteurNom: null },
    { idu: 'P2', section: 'AB', numero: '2', retenue: false, origine: null, surfaceM2: 80, majPar: null, majLe: null, acteurNom: null },
  ],
  rayonM: 50, nbRetenues: 1, nbVoisines: 1, motif: null,
  centre: { mode: 'empreinte', idu: null, point: null, provenance: null, label: null },
  centreAvertissement: null, marqueurAdresse: null,
  parcellesChoix: [{ idu: 'P1', section: 'AB', numero: '1' }, { idu: 'P2', section: 'AB', numero: '2' }], // 2 parcelles → le mode « Centrer sur une parcelle » est activable (test des 3 modes)
  parcellesDeclarees: [{ section: 'AB', numero: '1' }], // P1 est DÉCLARÉE au permis → le comparatif « déclaré ↔ sélectionné » est comparable
  localisation: { communeCode: '75119', communeNom: 'Paris 19e', sections: ['AB'], feuilleLibelle: 'Paris 19e — section AB', feuilleNote: '' },
  selection: { active: false, idus: [], validePar: null, valideLe: null, acteurNom: null },
  retenuesHorsVue: 0,
});

let container: HTMLDivElement;
let root: Root;
let posts = 0; // compte les POST (valider/retirer) → prouve que le handler du bouton est bien appelé

beforeEach(() => {
  posts = 0;
  global.fetch = vi.fn(async (_input: unknown, init?: { method?: string }) => {
    if ((init?.method ?? 'GET') === 'POST') { posts++; return { ok: true, status: 200, json: async () => ({ ok: true, planche: planche() }) } as unknown as Response; }
    return { ok: true, status: 200, json: async () => ({ planche: planche() }) } as unknown as Response;
  }) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
});

async function flush(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
function boutonTexte(txt: string, racine: ParentNode = container): HTMLButtonElement | null {
  return [...racine.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === txt) as HTMLButtonElement | null ?? null;
}
// Vrai si `avant` PRÉCÈDE `apres` dans l'ordre du document (placement « au-dessus » dans une colonne flex verticale).
function precede(avant: Element | null, apres: Element | null): boolean {
  if (!avant || !apres) return false;
  return (apres.compareDocumentPosition(avant) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}
// Path d'une parcelle repérée par son numéro (aria-label « … n° N … »), dans une racine (container ou dialog).
function parcellePath(numero: string, racine: ParentNode = container): SVGPathElement | null {
  return [...racine.querySelectorAll('path')].find((p) => (p.getAttribute('aria-label') ?? '').includes(`n° ${numero}`)) as SVGPathElement | null ?? null;
}
// Intérieur du tracé cliquable ? jsdom ne fait PAS de hit-testing (un clic synthétique déclenche onClick quel que soit le fill) : on ne peut
//   donc pas reproduire le clic « raté » d'un vrai navigateur. On vérifie la PROPRIÉTÉ qui gouverne la cible de clic — `pointer-events: all`
//   rend tout le tracé (intérieur compris) cliquable INDÉPENDAMMENT du fill (une parcelle du permis retirée a `fill: none`). C'est le
//   comportement corrigé, exprimé par la seule voie observable en jsdom.
function interieurCliquable(p: SVGPathElement | null): boolean {
  return !!p && p.style.pointerEvents === 'all';
}
function clic(p: Element | null): void { if (p) act(() => { p.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }

describe('Planche cadastrale — présence des contrôles (comportement, DOM réel)', () => {
  it('les TROIS modes de centrage + le curseur « Voisines à … » + la validation sont présents au chargement', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // (1) trois modes de centrage
    expect(boutonTexte('Toutes les parcelles')).not.toBeNull();
    expect(boutonTexte('Centrer sur une parcelle')).not.toBeNull();
    expect(boutonTexte('Centrer sur l’adresse')).not.toBeNull();
    // curseur des voisines (inconditionnel) : label + input range
    expect(container.textContent).toContain('Voisines à');
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    // validation : au chargement la composition = défaut → « Modifier la sélection » (acquise) ; le schéma est dessiné
    expect(boutonTexte('Modifier la sélection')).not.toBeNull();
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('(A) la SAISIE D’ADRESSE est présente dans les TROIS modes de centrage (condition d’affichage levée)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    const saisiePresente = () => !!container.querySelector('input[aria-label="Adresse à localiser"]');
    // mode « empreinte » (défaut) : la saisie est là SANS avoir cliqué « Centrer sur l’adresse » (+ « Localiser »)
    expect(boutonTexte('Toutes les parcelles')!.getAttribute('aria-pressed')).toBe('true');
    expect(saisiePresente()).toBe(true);
    expect(boutonTexte('Localiser')).not.toBeNull();
    // mode « parcelle »
    act(() => { boutonTexte('Centrer sur une parcelle')!.click(); });
    await flush();
    expect(boutonTexte('Centrer sur une parcelle')!.getAttribute('aria-pressed')).toBe('true');
    expect(saisiePresente()).toBe(true);
    // mode « adresse »
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    expect(boutonTexte('Centrer sur l’adresse')!.getAttribute('aria-pressed')).toBe('true');
    expect(saisiePresente()).toBe(true);
  });

  it('RÉGRESSION f30e208 — saisie d’adresse ET curseur sont AU-DESSUS du schéma (ordre DOM), pas repoussés dessous', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    const svg = container.querySelector('svg[role="img"]');
    // le curseur (toujours affiché) précède le schéma
    expect(precede(container.querySelector('input[type="range"]'), svg)).toBe(true);
    // en mode adresse, la saisie précède le schéma (juste sous la barre « Centrer : », jamais sous le dessin)
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    const svgApres = container.querySelector('svg[role="img"]');
    expect(precede(container.querySelector('input[aria-label="Adresse à localiser"]'), svgApres)).toBe(true);
    expect(precede(container.querySelector('input[type="range"]'), svgApres)).toBe(true);
  });

  it('PLEIN ÉCRAN — modal (parité « Agrandir le schéma ») : en-tête + contrôles au-dessus + DEUX ZONES [schéma | validation], rien de perdu', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // passer en mode adresse puis agrandir
    act(() => { boutonTexte('Centrer sur l’adresse')!.click(); });
    await flush();
    act(() => { boutonTexte('⤢ Agrandir le schéma')!.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    // EN-TÊTE calquée sur la référence : titre + « ✕ Fermer » (jamais l'ancien bouton d'agrandissement, qui a cédé la place).
    expect(dialog!.textContent).toContain('Planche cadastrale');
    expect(boutonTexte('✕ Fermer', dialog!)).not.toBeNull();
    expect(boutonTexte('⤢ Agrandir le schéma')).toBeNull();
    // AUCUN contrôle perdu : saisie d'adresse, « Localiser », curseur des voisines et le schéma sont là (même état de composant partagé).
    const saisie = dialog!.querySelector('input[aria-label="Adresse à localiser"]');
    const curseur = dialog!.querySelector('input[type="range"]');
    const svg = dialog!.querySelector('svg[role="img"]');
    expect(saisie).not.toBeNull();
    expect(curseur).not.toBeNull();
    expect(svg).not.toBeNull();
    expect(dialog!.textContent).toContain('Voisines à');
    expect(boutonTexte('Localiser', dialog!)).not.toBeNull();
    // CONTRÔLES DE CENTRAGE AU-DESSUS du schéma (pas d'empilement/regression) ; la VALIDATION est présente (zone latérale, à côté du schéma).
    expect(precede(saisie, svg)).toBe(true);
    expect(precede(curseur, svg)).toBe(true);
    expect(dialog!.textContent).toContain('Déclaré au permis ↔ sélectionné sur le schéma'); // le bandeau de validation/comparatif est conservé
  });
});

describe('Planche cadastrale — plein écran : fermetures et sélection partagée (parité modal « Bâtiments et projection »)', () => {
  async function ouvrirPleinEcran(): Promise<HTMLElement> {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    act(() => { boutonTexte('⤢ Agrandir le schéma')!.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    return dialog!;
  }

  it('« ✕ Fermer » referme le modal', async () => {
    await ouvrirPleinEcran();
    act(() => { boutonTexte('✕ Fermer')!.click(); });
    await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(boutonTexte('⤢ Agrandir le schéma')).not.toBeNull(); // la vue intégrée revient
  });

  it('la touche Échap referme le modal', async () => {
    await ouvrirPleinEcran();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('le clic HORS de la carte (sur le fond) referme le modal ; un clic DANS la carte ne le ferme pas', async () => {
    const dialog = await ouvrirPleinEcran();
    // clic DANS la carte (sur le schéma) : ne ferme pas (stopPropagation sur la carte centrée)
    const svg = dialog.querySelector('svg[role="img"]') as SVGElement | null;
    if (svg) { act(() => { svg.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); }
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    // clic sur le FOND (l'élément dialog lui-même = le backdrop) : ferme
    act(() => { dialog.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('SÉLECTION PARTAGÉE : cliquer une voisine en plein écran crée un changement en attente conservé à la fermeture (source unique)', async () => {
    const dialog = await ouvrirPleinEcran();
    const voisine = [...dialog.querySelectorAll('path')].find((p) => (p.getAttribute('aria-label') ?? '').includes('voisine'));
    expect(voisine).toBeTruthy();
    act(() => { voisine!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(boutonTexte('Valider la sélection', dialog)).not.toBeNull(); // le changement est en attente DANS le plein écran
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(boutonTexte('Valider la sélection')).not.toBeNull(); // …et conservé au retour en vue intégrée (même état)
  });
});

describe('Planche cadastrale — (B) « Modifier la sélection » actif + (C) contrôles de sélection au-dessus du schéma', () => {
  it('(B) « Modifier la sélection » est ACTIF au repos et son clic POSTe (vue intégrée)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    const modifier = boutonTexte('Modifier la sélection');
    expect(modifier).not.toBeNull();          // au repos (composition = défaut), le libellé est « Modifier la sélection »
    expect(modifier!.disabled).toBe(false);   // …et il n'est PLUS grisé (décision Arno)
    act(() => { modifier!.click(); });
    await flush();
    expect(posts).toBe(1);                     // son handler ré-applique la composition (POST valider)
  });

  it('(B) « Modifier la sélection » est ACTIF au repos et son clic POSTe AUSSI dans le plein écran', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    act(() => { boutonTexte('⤢ Agrandir le schéma')!.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    const modifier = boutonTexte('Modifier la sélection', dialog!);
    expect(modifier).not.toBeNull();
    expect(modifier!.disabled).toBe(false);
    act(() => { modifier!.click(); });
    await flush();
    expect(posts).toBe(1);
  });

  it('(C) plein écran : le bouton de sélection (Valider/Modifier) est AU-DESSUS du schéma dans l’ordre DOM (pas en colonne de droite)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    act(() => { boutonTexte('⤢ Agrandir le schéma')!.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    const svg = dialog!.querySelector('svg[role="img"]');
    const boutonSel = boutonTexte('Modifier la sélection', dialog!) ?? boutonTexte('Valider la sélection', dialog!);
    expect(boutonSel).not.toBeNull();
    expect(precede(boutonSel, svg)).toBe(true); // les contrôles de sélection précèdent le schéma (marge des contrôles), jamais après/à droite
  });
});

describe('Planche cadastrale — bascule symétrique et illimitée de TOUTE parcelle (cible de clic, bug re-sélection)', () => {
  const FILL_VERT = 'var(--color-svv-green-ink)';
  const FILL_VOISINE = 'var(--color-svv-muted)';

  it('parcelle DU PERMIS : retirée → re-sélectionnée → retirée (état + rendu), et son intérieur reste cliquable une fois retirée', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // au chargement, P1 (parcelle du permis) est dans la composition → rendu « sélectionnée » (vert)
    expect(parcellePath('1')!.getAttribute('fill')).toBe(FILL_VERT);
    // clic 1 → RETIRÉE : rendu « retirée » (fill none, pointillés) ET l'intérieur reste une CIBLE DE CLIC (sinon on ne pourrait plus la re-cliquer)
    clic(parcellePath('1')); await flush();
    expect(parcellePath('1')!.getAttribute('fill')).toBe('none');
    expect(parcellePath('1')!.getAttribute('aria-label')).toContain('non sélectionnée');
    expect(interieurCliquable(parcellePath('1'))).toBe(true);
    // clic 2 → RE-SÉLECTIONNÉE : retour au rendu « sélectionnée » (vert)
    clic(parcellePath('1')); await flush();
    expect(parcellePath('1')!.getAttribute('fill')).toBe(FILL_VERT);
    expect(parcellePath('1')!.getAttribute('aria-label')).toContain('sélectionnée');
    // clic 3 → RETIRÉE de nouveau (bascule illimitée)
    clic(parcellePath('1')); await flush();
    expect(parcellePath('1')!.getAttribute('fill')).toBe('none');
  });

  it('parcelle HORS permis (voisine) : sélectionnée → désélectionnée → sélectionnée (non-régression) ; intérieur cliquable', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // voisine non sélectionnée au départ (rendu neutre) ; son intérieur est une cible de clic
    expect(parcellePath('2')!.getAttribute('fill')).toBe(FILL_VOISINE);
    expect(interieurCliquable(parcellePath('2'))).toBe(true);
    clic(parcellePath('2')); await flush();
    expect(parcellePath('2')!.getAttribute('fill')).toBe(FILL_VERT);      // sélectionnée
    clic(parcellePath('2')); await flush();
    expect(parcellePath('2')!.getAttribute('fill')).toBe(FILL_VOISINE);   // désélectionnée
    clic(parcellePath('2')); await flush();
    expect(parcellePath('2')!.getAttribute('fill')).toBe(FILL_VERT);      // re-sélectionnée (illimité)
  });

  it('le comparatif « Déclaré ↔ sélectionné » se met à jour DANS LES DEUX SENS après (dé)sélection d’une parcelle du permis', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    // On garde une voisine (P2) sélectionnée pour que la composition reste NON VIDE (le comparatif exige ≥1 sélectionnée pour être comparable).
    clic(parcellePath('2')); await flush();
    // P1 déclarée ET sélectionnée → « présentes des deux côtés »
    expect(container.textContent).toContain('Présentes des deux côtés');
    // retrait de P1 → « déclarées au permis mais non sélectionnées » ; l'intérieur reste cliquable pour pouvoir revenir
    clic(parcellePath('1')); await flush();
    expect(container.textContent).toContain('Déclarées au permis mais non sélectionnées');
    expect(interieurCliquable(parcellePath('1'))).toBe(true);
    // re-sélection de P1 → le comparatif REVIENT à « présentes des deux côtés » (pas bloqué sur « non sélectionnée »)
    clic(parcellePath('1')); await flush();
    expect(container.textContent).toContain('Présentes des deux côtés');
    expect(container.textContent).not.toContain('Déclarées au permis mais non sélectionnées');
  });

  it('PLEIN ÉCRAN : la parcelle du permis se retire puis se re-sélectionne (intérieur cliquable dans le modal)', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    clic(boutonTexte('⤢ Agrandir le schéma')); await flush();
    const dialog = () => container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog()).not.toBeNull();
    expect(parcellePath('1', dialog()!)!.getAttribute('fill')).toBe(FILL_VERT);
    // retrait dans le plein écran
    clic(parcellePath('1', dialog()!)); await flush();
    expect(parcellePath('1', dialog()!)!.getAttribute('fill')).toBe('none');
    expect(interieurCliquable(parcellePath('1', dialog()!))).toBe(true);
    // re-sélection dans le plein écran
    clic(parcellePath('1', dialog()!)); await flush();
    expect(parcellePath('1', dialog()!)!.getAttribute('fill')).toBe(FILL_VERT);
  });
});

describe('Planche cadastrale — plein écran plein surface : inventaire des contrôles (non-régression)', () => {
  // Élément dont le TEXTE PROPRE (feuille) vaut exactement `txt` — pour cibler un libellé précis sans matcher un ancêtre.
  function parTexteExact(txt: string, racine: ParentNode): Element | null {
    return [...racine.querySelectorAll('*')].find((e) => e.textContent === txt && e.children.length === 0) as Element | null ?? null;
  }

  it('tous les contrôles sont présents dans le modal ; les contrôles précèdent le schéma, les infos (légende/comparatif) le suivent', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    clic(boutonTexte('⤢ Agrandir le schéma')); await flush();
    const dialog = container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog).not.toBeNull();
    // PRÉSENCE — la liste complète des contrôles (aucun perdu par le passage plein surface)
    expect(boutonTexte('Toutes les parcelles', dialog!)).not.toBeNull();
    expect(boutonTexte('Centrer sur une parcelle', dialog!)).not.toBeNull();
    expect(boutonTexte('Centrer sur l’adresse', dialog!)).not.toBeNull();
    expect(dialog!.querySelector('input[aria-label="Adresse à localiser"]')).not.toBeNull();
    expect(boutonTexte('Localiser', dialog!)).not.toBeNull();
    expect(dialog!.querySelector('input[type="range"]')).not.toBeNull(); // curseur « Voisines à »
    expect(dialog!.textContent).toContain('Voisines à');
    const boutonPrimaire = boutonTexte('Modifier la sélection', dialog!) ?? boutonTexte('Valider la sélection', dialog!);
    expect(boutonPrimaire).not.toBeNull();
    expect(dialog!.textContent).toContain('voisine (repère)');                              // légende
    expect(dialog!.textContent).toContain('Déclaré au permis ↔ sélectionné sur le schéma'); // comparatif
    expect(dialog!.textContent).toContain('Survolez ou touchez une parcelle');             // ligne d'identification/survol
    // PLACEMENT — contrôles AU-DESSUS du schéma ; infos (comparatif) APRÈS le schéma (colonne latérale, jamais au-dessus)
    const svg = dialog!.querySelector('svg[role="img"]');
    expect(precede(boutonTexte('Toutes les parcelles', dialog!), svg)).toBe(true);
    expect(precede(dialog!.querySelector('input[aria-label="Adresse à localiser"]'), svg)).toBe(true);
    expect(precede(dialog!.querySelector('input[type="range"]'), svg)).toBe(true);
    expect(precede(boutonPrimaire, svg)).toBe(true);
    const titreComparatif = parTexteExact('Déclaré au permis ↔ sélectionné sur le schéma', dialog!);
    expect(titreComparatif).not.toBeNull();
    expect(precede(svg, titreComparatif)).toBe(true); // le schéma précède les infos → celles-ci sont en colonne latérale, pas au-dessus
  });

  it('les contrôles conditionnels (« Réinitialiser », « Revenir à la configuration d’origine ») restent atteignables dans le modal', async () => {
    await act(async () => { root.render(h(PlancheParcelles, { dossierId: 1 })); });
    await flush();
    clic(boutonTexte('⤢ Agrandir le schéma')); await flush();
    const dialog = () => container.querySelector('[role="dialog"][aria-modal="true"]') as HTMLElement | null;
    expect(dialog()).not.toBeNull();
    // au repos, la composition = défaut → « Réinitialiser » absent (rien à réinitialiser)
    expect(boutonTexte('Réinitialiser à la sélection par défaut', dialog()!)).toBeNull();
    // sélectionner une voisine (change la composition) → « Réinitialiser » apparaît DANS le modal
    clic(parcellePath('2', dialog()!)); await flush();
    expect(boutonTexte('Réinitialiser à la sélection par défaut', dialog()!)).not.toBeNull();
  });
});
