import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPUI_LONG_MS, APPUI_LONG_TOLERANCE_PX, creerAppuiLong, deplacerDansMenu, menuLigne, type EtatLigne,
} from './menuLigne';

/**
 * LOT 5-BOITE-3 — LE MENU D'UNE LIGNE DE LA BOÎTE.
 *
 * 🔴 CE QUI EST ÉPROUVÉ ICI, ET POURQUOI :
 *   ① l'ORDRE est celui de Gmail — l'équipe y travaille toute la journée, un menu qui « fait mieux » oblige à
 *      chercher, chaque fois, où est passé ce qu'on connaissait ;
 *   ② « Archiver » n'y est PAS (demande d'Arno), et rien ne l'imite ;
 *   ③ aucune entrée ne fait semblant : sans la migration 251, pas de corbeille ; sans le droit d'écrire, pas de
 *      rédaction ni de lu/non lu (qui écrit dans Gmail depuis le lot 5-BOITE-2) ;
 *   ④ le lu/non lu est UNE entrée, « l'une OU l'autre » : afficher les deux obligerait à lire laquelle s'applique.
 */

const etat = (o: Partial<EtatLigne> = {}): EtatLigne =>
  ({ nonLu: false, enCorbeille: false, corbeilleDisponible: true, peutEcrire: true, ...o });

const cles = (e: EtatLigne): string[] => menuLigne(e).map((x) => x.cle);
const libelles = (e: EtatLigne): string[] => menuLigne(e).map((x) => x.libelle);

describe('🔴 ① l’ordre, et rien que lui', () => {
  it('Répondre · Répondre à tous · Transférer · Supprimer · Marquer comme non lu', () => {
    expect(libelles(etat())).toEqual([
      'Répondre', 'Répondre à tous', 'Transférer', 'Supprimer', 'Marquer comme non lu',
    ]);
  });

  /** Le trait sépare « ce qui répond » de « ce qui agit sur l'échange » — l'équipe s'en sert pour viser sans lire. */
  it('un trait avant ce qui agit sur l’échange, et un seul', () => {
    const avec = menuLigne(etat()).filter((e) => e.separateurAvant);
    expect(avec.map((e) => e.cle)).toEqual(['corbeille']);
  });
});

describe('🔴 ② « Archiver » n’existe pas', () => {
  it('aucune entrée n’archive, ni ne s’en approche', () => {
    for (const e of [etat(), etat({ nonLu: true }), etat({ enCorbeille: true })]) {
      expect(JSON.stringify(menuLigne(e)).toLowerCase()).not.toContain('archiv');
    }
  });
});

describe('🔴 ③ aucune entrée ne fait semblant', () => {
  it('sans la migration 251 : ni « Supprimer » ni « Restaurer »', () => {
    expect(cles(etat({ corbeilleDisponible: false }))).toEqual(['repondre', 'repondre_tous', 'transferer', 'non_lu']);
  });

  it('sans le droit d’écrire : ni rédaction, ni lu/non lu — il écrirait dans Gmail', () => {
    expect(cles(etat({ peutEcrire: false }))).toEqual(['corbeille']);
  });

  it('sans droit NI migration : aucune entrée du tout, donc aucun bouton à ouvrir', () => {
    expect(menuLigne(etat({ peutEcrire: false, corbeilleDisponible: false }))).toEqual([]);
  });

  /** Un menu qui commence par un trait est un menu mal séparé : le séparateur suit toujours quelque chose. */
  it('le séparateur n’apparaît jamais en PREMIÈRE position', () => {
    for (const e of [etat(), etat({ peutEcrire: false }), etat({ corbeilleDisponible: false })]) {
      const m = menuLigne(e);
      if (m.length > 0) expect(m[0].separateurAvant).not.toBe(true);
    }
  });
});

describe('🔴 ④ une seule entrée par état, jamais les deux', () => {
  it('non lu → « Marquer comme lu » ; lu → « Marquer comme non lu »', () => {
    expect(cles(etat({ nonLu: true }))).toContain('lu');
    expect(cles(etat({ nonLu: true }))).not.toContain('non_lu');
    expect(cles(etat({ nonLu: false }))).toContain('non_lu');
    expect(cles(etat({ nonLu: false }))).not.toContain('lu');
  });

  it('à la corbeille → « Restaurer », jamais « Supprimer » une seconde fois', () => {
    expect(cles(etat({ enCorbeille: true }))).toContain('restaurer');
    expect(cles(etat({ enCorbeille: true }))).not.toContain('corbeille');
  });

  /** « Supprimer » DIT ce qu'il fait vraiment : rien n'est supprimé. Sans ça, le mot fait peur pour rien. */
  it('« Supprimer » explique qu’il ne supprime rien, et que l’échange revient tout seul', () => {
    const e = menuLigne(etat()).find((x) => x.cle === 'corbeille');
    expect(e?.aide).toContain('Rien n’est supprimé');
    expect(e?.aide).toContain('intact dans Gmail');
    expect(e?.aide).toContain('revient tout seul');
  });

  it('le lu/non lu DIT qu’il vaut pour toute l’équipe — c’est celui de Gmail', () => {
    expect(menuLigne(etat()).find((x) => x.cle === 'non_lu')?.aide).toContain('toute l’équipe');
  });
});

describe('le clavier', () => {
  it('les flèches bouclent aux deux bouts : un menu qui s’arrête paraît bloqué', () => {
    expect(deplacerDansMenu('ArrowDown', 0, 3)).toBe(1);
    expect(deplacerDansMenu('ArrowDown', 2, 3)).toBe(0);
    expect(deplacerDansMenu('ArrowUp', 0, 3)).toBe(2);
    expect(deplacerDansMenu('ArrowUp', 2, 3)).toBe(1);
  });

  it('Début et Fin sautent aux extrémités', () => {
    expect(deplacerDansMenu('Home', 2, 3)).toBe(0);
    expect(deplacerDansMenu('End', 0, 3)).toBe(2);
  });

  it('toute autre touche est rendue à qui de droit — on ne capture pas ce qui ne nous regarde pas', () => {
    for (const t of ['Escape', 'Tab', 'a', 'Enter', ' ']) expect(deplacerDansMenu(t, 0, 3)).toBeNull();
  });

  it('un menu vide ne déplace rien', () => {
    expect(deplacerDansMenu('ArrowDown', 0, 0)).toBeNull();
  });
});

/**
 * 🔴 L'APPUI LONG, ÉPROUVÉ OÙ IL PEUT L'ÊTRE. Fabriquer un `TouchEvent` à la main ne reproduit PAS un doigt : mesuré
 * le 25/09/2026, les événements tactiles synthétiques n'arrivaient pas à React dans l'ordre émis et le harnais
 * rendait un résultat décalé d'une séquence. La RÈGLE, elle, ne dépend d'aucun navigateur — et c'est elle qui décide.
 */
describe('l’appui long, et le défilement qui ne doit pas l’être', () => {
  it('le délai est celui d’iOS : au-dessous, un simple tapotement ouvrirait le menu', () => {
    expect(APPUI_LONG_MS).toBe(500);
  });
  it('la tolérance existe, et elle est petite : au-delà, le doigt FAIT DÉFILER', () => {
    expect(APPUI_LONG_TOLERANCE_PX).toBeGreaterThan(0);
    expect(APPUI_LONG_TOLERANCE_PX).toBeLessThanOrEqual(16);
  });

  /** Une horloge de doublure : on déclenche la minuterie à la main, sans attendre une demi-seconde par test. */
  function horloge() {
    const armees: { rappel: () => void; jeton: number }[] = [];
    let n = 0;
    return {
      programmer: (rappel: () => void) => { n += 1; armees.push({ rappel, jeton: n }); return n; },
      annulerMinuterie: (j: unknown) => { const i = armees.findIndex((a) => a.jeton === j); if (i >= 0) armees.splice(i, 1); },
      sonner: () => { const a = armees.shift(); a?.rappel(); },
      enAttente: () => armees.length,
    };
  }

  it('le doigt maintenu OUVRE le menu', () => {
    const h = horloge(); let ouvertures = 0;
    const a = creerAppuiLong({ ouvrir: () => { ouvertures += 1; }, ...h });
    a.commencer(50, 300);
    expect(a.arme()).toBe(true);
    h.sonner();
    expect(ouvertures).toBe(1);
  });

  it('🔴 le doigt qui GLISSE annule : sinon faire défiler la liste ouvrirait un menu sur trois', () => {
    const h = horloge(); let ouvertures = 0;
    const a = creerAppuiLong({ ouvrir: () => { ouvertures += 1; }, ...h });
    a.commencer(50, 300);
    expect(a.bouger(50, 380)).toBe(true);   // 80 px : c'est un défilement
    expect(a.arme()).toBe(false);
    expect(h.enAttente()).toBe(0);          // la minuterie a bien été retirée
    expect(ouvertures).toBe(0);
  });

  it('un tremblement du doigt n’annule PAS : personne ne tient un doigt parfaitement immobile', () => {
    const h = horloge();
    const a = creerAppuiLong({ ouvrir: () => {}, ...h });
    a.commencer(50, 300);
    expect(a.bouger(53, 304)).toBe(false);
    expect(a.arme()).toBe(true);
  });

  it('le doigt qui SE LÈVE annule : un tapotement ouvre l’échange, il n’ouvre pas le menu', () => {
    const h = horloge(); let ouvertures = 0;
    const a = creerAppuiLong({ ouvrir: () => { ouvertures += 1; }, ...h });
    a.commencer(50, 300);
    a.annuler();
    expect(h.enAttente()).toBe(0);
    expect(ouvertures).toBe(0);
  });

  it('un second contact ne laisse JAMAIS deux minuteries derrière lui', () => {
    const h = horloge();
    const a = creerAppuiLong({ ouvrir: () => {}, ...h });
    a.commencer(50, 300);
    a.commencer(60, 310);
    expect(h.enAttente()).toBe(1);
  });

  it('bouger sans avoir posé le doigt ne fait rien — et ne casse rien', () => {
    const a = creerAppuiLong({ ouvrir: () => {}, ...horloge() });
    expect(a.bouger(0, 0)).toBe(false);
  });
});

/**
 * GARANTIES D'ÉCRAN, lues dans la source. Elles tiennent ce qu'aucun test de fonction pure ne peut tenir : que les
 * TROIS portes existent vraiment, et qu'aucune n'a été oubliée en chemin.
 */
describe('garanties statiques — les trois portes du menu', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/MenuLigne.tsx', 'utf8');

  it('clic droit, appui long ET bouton « ⋯ » : les trois ouvrent le MÊME menu', () => {
    expect(src).toContain('onContextMenu');
    expect(src).toContain('onTouchStart');
    expect(src).toContain('aria-haspopup="menu"');
    // Le clic droit remplace le menu du navigateur — sinon les deux s'ouvriraient l'un sur l'autre.
    expect(src).toContain('e.preventDefault()');
  });

  it('le défilement ANNULE l’appui long — au doigt ET quand la page défile', () => {
    expect(src).toContain('onTouchMove');
    expect(src).toContain('creerAppuiLong');
    // Seconde ceinture : dès que le navigateur prend la main sur le défilement, il cesse parfois d'émettre des
    //   `touchmove` vers React. Sans elle, glisser la liste ouvrirait un menu une fois sur trois.
    expect(src).toContain("addEventListener('scroll'");
  });

  it('Échap referme ET rend le focus à la ligne — se perdre dans trente échanges, c’est repartir de zéro', () => {
    expect(src).toContain("e.key === 'Escape'");
    expect(src).toContain('bouton.current?.focus()');
  });

  it('le bouton est toujours visible : aucune interaction au seul survol', () => {
    // Rien dans le style ne masque le bouton au repos pour le révéler au survol.
    expect(src).not.toMatch(/\.mlg-bouton\{[^}]*(display:none|opacity:0)/);
    expect(src).toContain('min-height:44px');
  });
});
