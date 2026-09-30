import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  celleEnPlein, changerEtat, decalageDepuisLaDroite, fermer, FENETRES_MAX, GOUTTIERE_PX, LARGEUR_OUVERTE_PX,
  LARGEUR_REDUITE_PX, MARGE_DROITE_PX, MOTIF_TROP_DE_FENETRES, ouvrir, rangDepuisLaDroite,
  type FenetreRedaction,
} from './fenetresRedaction';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT REDACTION-GMAIL — LES FENÊTRES DE RÉDACTION (demande d'Arno : « comme Gmail »).
 *
 * CE QUE CE FICHIER PROTÈGE :
 *   ① DEUX AU PLUS. Une fenêtre ouverte est un message NON ENVOYÉ ; au-delà de deux, on en oublie une derrière
 *      l'autre. La troisième demande rend un MESSAGE qui dit quoi faire — un clic sans effet se lit comme une panne ;
 *   ② UNE FENÊTRE RÉDUITE COMPTE. Sinon on en réduit deux, on en ouvre deux autres, et les premières disparaissent ;
 *   ③ ROUVRIR LA MÊME NE FAIT PAS DE DOUBLON : « Répondre » cliqué deux fois rétablit la fenêtre, il n'en crée pas
 *      une seconde sur le même brouillon — et ne doit pas buter sur la limite ;
 *   ④ UNE SEULE EN PLEIN ÉCRAN : deux voiles empilés rendraient la fenêtre du dessous inatteignable au clavier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const f = (cle: string, etat: FenetreRedaction['etat'] = 'ouverte'): FenetreRedaction => ({ cle, etat });

describe('🔴 ① deux fenêtres au plus', () => {
  it('la première et la deuxième s’ouvrent', () => {
    const a = ouvrir([], 'n1');
    expect(a.ok).toBe(true);
    const b = ouvrir(a.ok ? a.fenetres : [], 'n2');
    expect(b.ok && b.fenetres.map((x) => x.cle)).toEqual(['n1', 'n2']);
  });

  it('🔴 la TROISIÈME est refusée, avec un message qui dit quoi faire', () => {
    const r = ouvrir([f('n1'), f('n2')], 'n3');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toBe(MOTIF_TROP_DE_FENETRES);
    expect(r.ok === false && r.motif).toContain('Fermez-en un');
    // …et le brouillon en cours n'est pas menacé : le message le dit aussi.
    expect(r.ok === false && r.motif).toContain('conservé');
  });

  it('la limite est bien celle qui est publiée', () => {
    expect(FENETRES_MAX).toBe(2);
  });

  /** 🔴 ② Une fenêtre RÉDUITE porte un brouillon tout autant qu'une fenêtre ouverte. */
  it('🔴 ② une fenêtre RÉDUITE compte dans la limite', () => {
    expect(ouvrir([f('n1', 'reduite'), f('n2', 'reduite')], 'n3').ok).toBe(false);
  });

  it('une fenêtre en PLEIN ÉCRAN compte aussi', () => {
    expect(ouvrir([f('n1', 'plein'), f('n2')], 'n3').ok).toBe(false);
  });

  it('fermer une fenêtre libère la place', () => {
    const restantes = fermer([f('n1'), f('n2')], 'n1');
    expect(restantes.map((x) => x.cle)).toEqual(['n2']);
    expect(ouvrir(restantes, 'n3').ok).toBe(true);
  });

  it('fermer une clé inconnue ne change rien, et ne jette pas', () => {
    expect(fermer([f('n1')], 'jamais-vue').map((x) => x.cle)).toEqual(['n1']);
    expect(fermer([], 'x')).toEqual([]);
  });
});

describe('🔴 ③ rouvrir la même fenêtre', () => {
  it('🔴 ne crée pas de doublon, et ne bute pas sur la limite', () => {
    const r = ouvrir([f('rep:900'), f('n2')], 'rep:900');
    expect(r.ok).toBe(true);
    expect(r.ok && r.fenetres).toHaveLength(2);
    expect(r.ok && r.fenetres.filter((x) => x.cle === 'rep:900')).toHaveLength(1);
  });

  it('une fenêtre RÉDUITE qu’on redemande est RÉTABLIE, pas laissée repliée', () => {
    const r = ouvrir([f('rep:900', 'reduite')], 'rep:900');
    expect(r.ok && r.fenetres[0].etat).toBe('ouverte');
  });

  it('…et elle repasse au premier plan (dernière de la liste)', () => {
    const r = ouvrir([f('a'), f('b')], 'a');
    expect(r.ok && r.fenetres.map((x) => x.cle)).toEqual(['b', 'a']);
  });
});

describe('🔴 ④ réduire, agrandir, rétablir', () => {
  it('les trois états se posent', () => {
    expect(changerEtat([f('a')], 'a', 'reduite')[0].etat).toBe('reduite');
    expect(changerEtat([f('a')], 'a', 'plein')[0].etat).toBe('plein');
    expect(changerEtat([f('a', 'plein')], 'a', 'ouverte')[0].etat).toBe('ouverte');
  });

  /** 🔴 Deux voiles empilés rendraient la fenêtre du dessous inatteignable au clavier. */
  it('🔴 une SEULE fenêtre en plein écran : l’autre redescend à « ouverte »', () => {
    const r = changerEtat([f('a', 'plein'), f('b')], 'b', 'plein');
    expect(r.find((x) => x.cle === 'b')?.etat).toBe('plein');
    expect(r.find((x) => x.cle === 'a')?.etat).toBe('ouverte');
    expect(celleEnPlein(r)?.cle).toBe('b');
  });

  it('sans plein écran, `celleEnPlein` rend `null` — pas de voile posé pour rien', () => {
    expect(celleEnPlein([f('a'), f('b', 'reduite')])).toBeNull();
    expect(celleEnPlein([])).toBeNull();
  });

  it('changer l’état d’une clé inconnue ne touche à rien', () => {
    const avant = [f('a'), f('b')];
    expect(changerEtat(avant, 'inconnue', 'reduite')).toEqual(avant);
  });
});

/** ⚠️ CÔTE À CÔTE, JAMAIS SUPERPOSÉES : superposées, la seconde masquerait la première. */
describe('la place des fenêtres ancrées', () => {
  it('la dernière ouverte est la plus à droite', () => {
    const fs = [f('a'), f('b')];
    expect(rangDepuisLaDroite(fs, 'b')).toBe(0);
    expect(rangDepuisLaDroite(fs, 'a')).toBe(1);
  });

  it('celle en plein écran ne prend pas de place dans la rangée — elle est centrée', () => {
    const fs = [f('a', 'plein'), f('b')];
    expect(rangDepuisLaDroite(fs, 'b')).toBe(0);
  });

  it('une clé inconnue ne jette pas', () => {
    expect(rangDepuisLaDroite([f('a')], 'x')).toBe(0);
  });
});

/**
 * ══ 🔴🔴 LOT BROUILLONS-GMAIL — LE DÉCALAGE EN PIXELS, ET LA BARRE DE TITRE QUI DISPARAISSAIT ═══════════════════
 *
 * DEUX DÉFAUTS D'ARNO, tous deux reproduits à l'écran le 29/09/2026 :
 *   ① en rouvrant un brouillon un peu haut (des Cc, une citation), la BARRE DE TITRE n'était plus visible — il
 *      n'en restait qu'un ruban de 3 px, et l'on ne pouvait ni réduire ni fermer la fenêtre. Mesuré : la barre se
 *      trouvait à 146 px alors que la fenêtre commençait à 189, donc HORS de sa boîte rognée (`overflow:hidden`) ;
 *   ② une fenêtre RÉDUITE est désormais une PASTILLE, bien plus étroite. Multiplier un rang par une largeur unique
 *      aurait fait passer une fenêtre ouverte PAR-DESSUS une pastille — ce que « côte à côte » interdit.
 */
describe('🔴🔴 le décalage tient compte de la largeur RÉELLE des voisins', () => {
  it('la plus à droite est à la marge', () => {
    const fs = [f('a'), f('b')];
    expect(decalageDepuisLaDroite(fs, 'b')).toBe(MARGE_DROITE_PX);
  });

  it('une fenêtre ouverte à gauche d’une autre ouverte', () => {
    const fs = [f('a'), f('b')];
    expect(decalageDepuisLaDroite(fs, 'a')).toBe(MARGE_DROITE_PX + LARGEUR_OUVERTE_PX + GOUTTIERE_PX);
  });

  /** 🔴 LE CAS QUI SE CHEVAUCHAIT : une pastille à droite, une fenêtre ouverte à gauche. */
  it('🔴 une fenêtre ouverte à gauche d’une PASTILLE ne la recouvre pas', () => {
    const fs = [f('a'), f('b', 'reduite')];
    expect(decalageDepuisLaDroite(fs, 'a')).toBe(MARGE_DROITE_PX + LARGEUR_REDUITE_PX + GOUTTIERE_PX);
  });

  it('deux pastilles côte à côte', () => {
    const fs = [f('a', 'reduite'), f('b', 'reduite')];
    expect(decalageDepuisLaDroite(fs, 'b')).toBe(MARGE_DROITE_PX);
    expect(decalageDepuisLaDroite(fs, 'a')).toBe(MARGE_DROITE_PX + LARGEUR_REDUITE_PX + GOUTTIERE_PX);
  });

  it('celle en plein écran ne prend pas de place : elle est centrée', () => {
    const fs = [f('a', 'plein'), f('b')];
    expect(decalageDepuisLaDroite(fs, 'b')).toBe(MARGE_DROITE_PX);
  });

  it('une clé inconnue ne jette pas', () => {
    expect(decalageDepuisLaDroite([f('a')], 'x')).toBe(MARGE_DROITE_PX);
  });
});

describe('🔴🔴 la barre de titre ne peut plus être rognée', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/FenetresRedaction.tsx', 'utf8');
  const style = src.slice(src.indexOf('export const CSS_FENETRES'));

  /**
   * 🔴 LA CAUSE ÉTAIT LÀ : une colonne flex dans une boîte à hauteur maximale et `overflow:hidden`. La grille donne
   * à la barre une rangée qui lui appartient, dimensionnée AVANT le corps ; rien ne peut plus la pousser dehors.
   *
   * ══ 🔴🔴 RÉÉCRIT LE 30/09/2026 — « auto 1fr » N'A PAS SUFFI, ET LE DÉFAUT EST REVENU ═══════════════════════
   *
   * Constat d'Arno sur le fil 36529 : « il ne reste qu'un mince trait noir au-dessus de De : ». Mesure à l'écran,
   * qui donne la cause exacte :
   *
   *     .fre         y=164  hauteur=580  overflow:hidden  scrollTop=42  scrollHeight=678
   *     .fre-titre   y=123  hauteur=44                    ← 41 px AU-DESSUS de sa propre fenêtre
   *
   * Une rangée « 1fr » a `min-height:auto` : elle ne borne RIEN. Le corps dépassait donc la fenêtre, ce qui la
   * rendait défilable — et un conteneur `overflow:hidden` reste défilable PAR PROGRAMME : à l'ouverture, le champ
   * « À » prend le focus, le navigateur fait défiler ses ancêtres, et la barre part par le haut.
   *
   * 🔴 L'INVARIANT EST DONC PLUS FORT QU'AVANT, et il exige les DEUX pièces. Mesuré après correction : la grille
   * vaut « 44px 535.875px » et le corps défile seul (536 px pour 799 px de contenu) — mais `.fre` garde un
   * scrollHeight de 678 pour 580 de haut, donc un défilement résiduel reste possible, et c'est le `sticky` qui
   * garantit alors la barre. Retirer l'une en croyant que l'autre suffit rouvrirait la porte.
   */
  it('🔴 la fenêtre est une GRILLE dont la rangée du corps est VRAIMENT bornée', () => {
    expect(style).toContain('display:grid;grid-template-rows:auto minmax(0,1fr)');
    expect(style).not.toContain('display:flex;flex-direction:column;width:var(--fre-largeur)');
    // ⚠️ « auto 1fr » seul est précisément ce qui a laissé le défaut revenir : il ne doit plus réapparaître.
    expect(style).not.toContain('grid-template-rows:auto 1fr');
  });

  /** 🔴 LA CEINTURE : même si `.fre` défile encore, la barre reste visible au lieu de disparaître en silence. */
  it('🔴 la barre de titre est collée au sommet de la fenêtre', () => {
    expect(style).toContain('.fre-titre{position:sticky;top:0;z-index:1;');
  });

  it('🔴 le corps peut rétrécir (min-height:0) et défile chez lui', () => {
    expect(style).toContain('.fre-corps{min-height:0;overflow-y:auto');
  });

  it('🔴 réduite, la fenêtre est une pastille : sa rangée de corps est à zéro', () => {
    expect(style).toContain('grid-template-rows:auto 0');
    expect(style).toContain(`width:min(${LARGEUR_REDUITE_PX}px`);
  });

  /** ⚠️ Les largeurs du style et celles du module pur doivent rester d'accord : deux vérités divergeraient. */
  it('⚠️ le style et le module pur nomment la MÊME largeur', () => {
    expect(style).toContain(`--fre-largeur:min(${LARGEUR_OUVERTE_PX}px`);
  });
});

describe('🔴 les trois icônes de Gmail, dans l’ordre de Gmail', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/FenetresRedaction.tsx', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

  it('réduire, puis plein écran, puis fermer', () => {
    // ⚠️ Les deux premiers libellés sont CALCULÉS (réduire / rétablir) : on cherche les mots, pas un attribut figé.
    const ordre = ['Réduire la fenêtre', 'Passer en plein écran', 'Fermer la fenêtre'].map((m) => code.indexOf(m));
    expect(ordre.every((i) => i >= 0)).toBe(true);
    expect(ordre[0]).toBeLessThan(ordre[1]);
    expect(ordre[1]).toBeLessThan(ordre[2]);
  });

  /** 🔴 LE TIRET DE GMAIL, pas un chevron : c'est la forme qu'on reconnaît sans lire. */
  it('🔴 « réduire » est un tiret quand la fenêtre est ouverte', () => {
    expect(code).toContain("{f.etat === 'reduite' ? '⌃' : '—'}");
  });

  it('les trois ont la même boîte : c’est ce qui les fait lire comme une rangée', () => {
    const style = src.slice(src.indexOf('export const CSS_FENETRES'));
    expect(style).toContain('.fre-bouton{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px');
  });
});
