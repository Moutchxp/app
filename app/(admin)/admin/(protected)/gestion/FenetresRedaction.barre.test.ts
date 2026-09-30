// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetresRedaction } from './FenetresRedaction';
import type { BrouillonEcran, ContexteRedactionEcran } from './Redaction';

/**
 * LOT FIL-APERCU-MINIATURES — LA BARRE DE TITRE D'UNE FENÊTRE DE RÉDACTION EXISTE, ET ELLE EST ENTIÈRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LE DÉFAUT D'ARNO, CONSTATÉ LE 30/09/2026 SUR LE FIL 36529 : « la barre de titre a disparu. Il ne reste qu'un
 * mince trait noir au-dessus de “De : CRITERIMMO”. » Plus de titre, plus d'icônes : on ne pouvait plus réduire,
 * agrandir ni fermer la fenêtre — donc plus la fermer autrement qu'en rechargeant la page.
 *
 * 🔴 LA CAUSE, MESURÉE À L'ÉCRAN ET NON DEVINÉE :
 *
 *     .fre         y=164  hauteur=580  overflow:hidden  scrollTop=42  scrollHeight=678
 *     .fre-titre   y=123  hauteur=44                    ← 41 px AU-DESSUS de sa propre fenêtre
 *
 * La barre était RENDUE, avec ses trois boutons — elle était sortie de la boîte par le haut, et rognée. Une rangée
 * de grille « 1fr » a `min-height:auto` : elle ne borne rien. Le corps dépassait donc la fenêtre, ce qui la rendait
 * défilable — et un conteneur `overflow:hidden` reste défilable PAR PROGRAMME. À l'ouverture, le champ « À » prend
 * le focus, le navigateur fait défiler tous ses ancêtres pour le rendre visible, et la barre part par le haut.
 *
 * ⚠️ CE FICHIER ÉPROUVE LE RENDU, PAS UNE INTENTION. Un garde de source dirait que le mot « fre-titre » est écrit ;
 * il ne dirait pas que la barre EXISTE dans le document avec ses trois boutons. C'est ce qu'Arno demande : « un
 * test qui échoue si la barre de titre d'une fenêtre de rédaction n'est pas rendue ou n'a pas ses 3 boutons ».
 *
 * ⚠️ CE QU'IL NE PEUT PAS PROUVER : le rognage lui-même. jsdom ne fait aucune mise en page — pas de hauteur, pas
 * de défilement, donc pas de `scrollTop`. Les deux pièces du correctif (la borne `minmax(0,1fr)` et la barre
 * `sticky`) sont donc tenues par le garde de style de `fenetresRedaction.test.ts`, qui les nomme toutes les deux.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};

const brouillon = (o: Partial<BrouillonEcran> = {}): BrouillonEcran => ({
  id: null, voie: 'nouveau', a: [], cc: [], cci: [], objet: '', corps: '\n\nService Gestion',
  citation: null, destinatairesApproximatifs: false, filId: null, repondALeMessageId: null, ...o,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

const monter = async (o: { etat?: 'ouverte' | 'reduite' | 'plein'; objet?: string; voie?: BrouillonEcran['voie'] } = {}) => {
  const b = brouillon({ objet: o.objet ?? '', voie: o.voie ?? 'nouveau' });
  // 🔴 LOT BANDEAU-ET-BROUILLONS — on compte les demandes de fermeture : la correction de la croix ne doit pas
  //   l'empêcher de fermer, et c'est le risque exact de cette correction.
  let demandes = 0;
  await act(async () => {
    root.render(createElement(FenetresRedaction, {
      fenetres: [{ cle: 'f1', etat: o.etat ?? 'ouverte' }],
      brouillons: new Map([['f1', b]]),
      contexte: CONTEXTE,
      fermetures: new Map(),
      onChange: () => {}, onFermer: () => {}, onDemanderFermeture: () => { demandes += 1; },
      onGeste: () => {}, onEnvoye: () => {}, onEtat: () => {},
    } as never));
  });
  await calmer();
  return { demandes: () => demandes };
};

const barre = () => container.querySelector('.fre-titre');
const boutons = () => [...(barre()?.querySelectorAll('button') ?? [])]
  .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');

describe('🔴🔴 la barre de titre est rendue, avec ses trois boutons', () => {
  /**
   * 🔴 L'ÉPREUVE QU'ARNO DEMANDE. Elle échoue si la barre disparaît du document, quelle qu'en soit la raison —
   * un retrait, une condition mal posée, un composant qui ne la rend plus.
   */
  it('🔴 une fenêtre ouverte a sa barre, et la barre a ses trois boutons', async () => {
    await monter();
    expect(barre()).not.toBeNull();
    // Réduire, plein écran, fermer — les trois gestes de Gmail, dans l'ordre de Gmail.
    expect(boutons()).toEqual(expect.arrayContaining([
      'Réduire la fenêtre', 'Passer en plein écran', 'Fermer la fenêtre',
    ]));
  });

  /** 🔴 LE TITRE EST LÀ AUSSI : c'est l'objet quand il existe, « Nouveau message » sinon. */
  it('🔴 le titre dit l’objet, ou « Nouveau message »', async () => {
    await monter();
    expect(container.querySelector('.fre-titre-mot')?.textContent).toBe('Nouveau message');
    await monter({ objet: 'Devis douche' });
    expect(container.querySelector('.fre-titre-mot')?.textContent).toBe('Devis douche');
  });

  /**
   * 🔴 RÉDUITE, LA FENÊTRE N'EST PLUS QUE SA BARRE — c'est même tout ce qu'il en reste. Si la barre disparaissait
   * dans cet état, une fenêtre réduite deviendrait une pastille vide, impossible à rouvrir ET impossible à fermer.
   */
  it('🔴 réduite, la fenêtre garde sa barre et ses trois boutons', async () => {
    await monter({ etat: 'reduite' });
    expect(barre()).not.toBeNull();
    expect(boutons()).toEqual(expect.arrayContaining([
      'Rétablir la fenêtre', 'Passer en plein écran', 'Fermer la fenêtre',
    ]));
  });

  /** 🔴 ET EN PLEIN ÉCRAN : c'est le seul endroit d'où l'on peut en sortir. */
  it('🔴 en plein écran, la barre propose d’en sortir', async () => {
    await monter({ etat: 'plein' });
    expect(barre()).not.toBeNull();
    expect(boutons()).toEqual(expect.arrayContaining([
      'Réduire la fenêtre', 'Quitter le plein écran', 'Fermer la fenêtre',
    ]));
  });

  /**
   * ⚠️ LA BARRE EST LE PREMIER ENFANT DE LA FENÊTRE, et c'est structurel : elle occupe la première rangée de la
   * grille. Posée ailleurs, elle repasserait sous le corps — et c'est précisément ce que le défaut d'Arno
   * produisait à l'œil.
   */
  it('🔴 la barre est le PREMIER enfant de la fenêtre', async () => {
    await monter();
    const f = container.querySelector('.fre');
    expect(f?.children[0]?.className).toContain('fre-titre');
    expect(f?.children[1]?.className).toContain('fre-corps');
  });
});

/**
 * ══ 🔴🔴 LOT BANDEAU-ET-BROUILLONS — LA CROIX NE PREND PAS LE FOCUS AU CHAMP « À » ════════════════════════════
 *
 * CONSTAT D'ARNO, mesuré en base le 30/09/2026 : cinq brouillons du jour (n° 66, 68, 72, 73, 74) n'avaient NI
 * objet, NI autre corps que la signature — seulement un destinataire. Reproduit à l'écran avant de corriger :
 * ouvrir « Nouveau message », taper une adresse dans « À », cliquer CETTE croix → brouillon n° 75, identique.
 *
 * 🔴 La cause : le champ « À » valide ce qu'on a tapé à la perte de focus (bonne règle pour passer au champ
 * suivant) ; cliquer la croix faisait perdre ce focus AVANT de fermer, donc le geste de fermeture fabriquait
 * lui-même le destinataire qui rendait le brouillon digne d'être gardé.
 *
 * ⚠️ ON ÉPROUVE L'ANNULATION DU `mousedown`, et c'est bien le comportement : sans déplacement de focus, `onBlur`
 * ne se déclenche pas. jsdom n'implémente pas le focus provoqué par un `mousedown` — le défaut ne s'y reproduit
 * donc pas, et la preuve de bout en bout a été faite dans le navigateur, sur l'application réelle.
 */
describe('🔴🔴 la croix ne valide pas une adresse à moitié tapée', () => {
  it('🔴 son `mousedown` est ANNULÉ : le focus reste dans le champ', async () => {
    await monter();
    const croix = [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === 'Fermer la fenêtre');
    expect(croix, 'la croix doit exister').not.toBeUndefined();
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => { croix?.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  });

  /**
   * ⚠️ ELLE FERME TOUJOURS. Annuler le comportement par défaut du `mousedown` n'empêche pas le clic : si cette
   * épreuve tombait, la fenêtre ne se fermerait plus du tout — c'est le risque exact de la correction.
   */
  it('⚠️ et elle DEMANDE toujours la fermeture au clic', async () => {
    const f = await monter();
    const croix = [...document.querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === 'Fermer la fenêtre');
    act(() => { croix?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    act(() => { croix?.click(); });
    expect(f.demandes()).toBe(1);
  });
});
