// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blocagesOuverts, verrouillerDefilement } from '../_composants/verrouDefilement';

/**
 * 🔴🔴 ARNO (13/11/2026) — LA PAGE NE DÉFILE JAMAIS JUSQU'À UN ÉCRAN BLANC.
 *
 * Défaut constaté en production sur la Gestion (écran partagé) : la page défilait bien au-delà de la Boîte de réception et des
 * Événements, jusqu'à un écran entièrement blanc. Mesuré au banc (vrais composants, 30 mails et 30 événements fictifs, 1440 × 861) :
 * document de 3 692 px pour un contenu qui s'arrêtait à 1 110 px.
 *
 * CAUSE : les textes réservés aux lecteurs d'écran (`.gst-sr-only` — « aucun niveau d'urgence enregistré »…) sont en
 * `position:absolute` SANS `top`/`left`. Un tel élément reste à sa place « naturelle », c'est-à-dire en bas de la liste ENTIÈRE ; et
 * comme son bloc de référence est le `body` (aucun ancêtre positionné), le panneau qui défile ne le rogne pas : il agrandit le
 * document. Trente cartes = 2 600 px de page blanche. Le motif était recopié dans 16 fichiers ; tous sont désormais épinglés en haut
 * à gauche de leur bloc de référence (`top:0;left:0`), ce qui ne change rien pour un lecteur d'écran.
 *
 * Et, en recette, la coquille imposait `min-height:100dvh` SOUS le bandeau RECETTE : 38 px de page vide sur toute page courte.
 */

const RACINE = join(process.cwd(), 'app/(admin)/admin/(protected)');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}
const SOURCES = fichiers(RACINE).map((f) => ({ f: relative(RACINE, f), texte: readFileSync(f, 'utf8') }));

/** Les blocs de déclarations CSS d'un fichier (un bloc ne contient jamais d'accolade : une seule classe de caractères, aucun retour arrière). */
const blocs = (texte: string): { tete: string; corps: string }[] =>
  [...texte.matchAll(/([^{}]{0,200})\{([^{}]*)\}/g)].map((m) => ({ tete: m[1].trim(), corps: m[2].replace(/\s+/g, '') }));

describe('aucun texte « invisible » n’agrandit la page', () => {
  const invisibles = SOURCES.flatMap(({ f, texte }) => blocs(texte)
    .filter((b) => /position:absolute/.test(b.corps) && /(^|;)width:1px/.test(b.corps) && /(^|;)height:1px/.test(b.corps))
    .map((b) => ({ f, ...b })));

  it('le motif est bien trouvé (sinon l’épreuve ne prouverait rien)', () => {
    expect(invisibles.length).toBeGreaterThanOrEqual(17);
    expect(invisibles.some((x) => x.f === 'gestion/GestionVue.tsx' && x.tete.endsWith('.gst-sr-only'))).toBe(true);
  });

  it('chaque élément de 1 px en position:absolute est épinglé (top ET left) : il ne suit plus le bas d’une liste', () => {
    const fautifs = invisibles
      .filter((x) => !/(^|;)inset:0/.test(x.corps) && !(/(^|;)top:/.test(x.corps) && /(^|;)left:/.test(x.corps)))
      .map((x) => `${x.f} ${x.tete.split('\n').pop()}`);
    expect(fautifs).toEqual([]);
  });
});

describe('la coquille de l’admin n’ajoute pas une hauteur d’écran à ce qui est déjà affiché', () => {
  const sidebar = SOURCES.find((s) => s.f === 'Sidebar.tsx')!.texte;
  const regle = (sel: string) => blocs(sidebar).filter((b) => b.tete.split('\n').pop()!.trim() === sel).map((b) => b.corps);

  it('une seule hauteur minimale « écran », portée par la racine qui contient la coquille', () => {
    expect(regle('.svv-adm-root:has(> .svv-adm-shell)')).toEqual([expect.stringContaining('min-height:100dvh')]);
    for (const corps of regle('.svv-adm-shell')) expect(corps).not.toMatch(/min-height:[^;]*(vh|dvh|svh)/);
  });

  it('la colonne de gauche ne fixe pas une hauteur d’écran (au plus : max-height), sans quoi elle allonge toute page courte', () => {
    const corps = regle('.svv-adm-sidebar').filter((c) => c.includes('position:sticky'));
    expect(corps).toHaveLength(1);
    expect(corps[0]).toContain('max-height:100dvh');
    expect(corps[0]).not.toMatch(/(^|;)height:/);
  });

  it('ni la coquille, ni son contenu, ni le main ne reçoivent ailleurs une hauteur en vh', () => {
    const fautifs = SOURCES.flatMap(({ f, texte }) => blocs(texte)
      .map((b) => ({ ...b, sel: (b.tete.split('\n').pop() ?? '').trim() }))
      .filter((b) => b.sel !== '.svv-adm-root:has(> .svv-adm-shell)')
      .filter((b) => /\.svv-adm-(shell|content|main)\b/.test(b.sel) && /(^|;)(min-)?height:[^;]*(vh|dvh|svh)/.test(b.corps))
      .map((b) => `${f} ${b.sel}`));
    expect(fautifs).toEqual([]);
  });
});

describe('le verrou de défilement des fenêtres ne laisse rien derrière lui', () => {
  it('ouvrir puis fermer des fenêtres (même dans le désordre) : le body retrouve un style VIDE — ni overflow, ni padding, ni hauteur', () => {
    const style = document.body.getAttribute('style') ?? '';
    const a = verrouillerDefilement();
    const b = verrouillerDefilement();
    expect(document.body.style.overflow).toBe('hidden');
    a(); b(); a();
    expect(blocagesOuverts()).toBe(0);
    expect(document.body.getAttribute('style') ?? '').toBe(style);
    for (const p of ['overflow', 'padding-right', 'padding-bottom', 'margin-bottom', 'height', 'min-height']) {
      expect(document.body.style.getPropertyValue(p)).toBe('');
      expect(document.documentElement.style.getPropertyValue(p)).toBe('');
    }
  });
});
