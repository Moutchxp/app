import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mise en forme (page Analyse) — les 4 sous-lignes de « Caractéristiques du permis (saisie) » sont DÉTACHÉES de leur conteneur par un
 * fond surélevé (modificateur `.svv-repli-titre--surface`), UNIQUEMENT dans Analyse (ProjectionVue). GARDE :
 *  · le fond passe par un TOKEN (aucun hex en dur dans la règle), défini en clair (@theme) ET dans les DEUX blocs sombres ;
 *  · le modificateur est ADDITIF (BlocRepliable inchangé quand la prop est absente) et SCOPÉ aux 4 sous-lignes via `sousLignesSurface` ;
 *  · la ligne MÈRE ne le porte pas, et les AUTRES écrans réutilisant CaracteristiquesBloc (En cours, Réponses, Archives, Rattachement)
 *    restent STRICTEMENT inchangés (prop absente).
 * Style « source-scan » (cf. RailMiseEnForme / themeTokens) : on fige des fragments SÉMANTIQUES stables, jamais une mise en forme exacte.
 */
const P = 'app/(admin)/admin/(protected)/permis/';
const lire = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');
const compact = (s: string): string => s.replace(/\s+/g, ' ');

// Luminance relative WCAG + ratio de contraste depuis un hex #rrggbb — pour asserter des ÉCARTS CHIFFRÉS (jamais une simple présence).
const lum = (hex: string): number => {
  const [r, g, b] = hex.replace('#', '').match(/.{2}/g)!.map((h) => parseInt(h, 16));
  const f = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contraste = (a: string, b: string): number => { const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b)); return (hi + 0.05) / (lo + 0.05); };

describe('Sous-lignes « surface » (Analyse) — fond surélevé tokenisé et scopé', () => {
  it('globals.css : la variante --surface passe par un TOKEN de surface (zéro hex en dur dans la règle)', () => {
    const css = compact(lire('app/globals.css'));
    expect(css).toContain('.svv-repli-titre--surface{background:var(--color-svv-surface-raised)');
    // le corps de la règle n'introduit AUCUNE couleur en dur (tout par token)
    const i = css.indexOf('.svv-repli-titre--surface{');
    const regle = css.slice(i, css.indexOf('}', i));
    expect(regle).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // token défini en CLAIR (@theme) ET dans les DEUX blocs sombres (data-theme=dark + system)
    expect(css).toContain('--color-svv-surface-raised: #ffffff;');
    expect((css.match(/--color-svv-surface-raised: #37455a;/g) ?? []).length).toBe(2);
  });

  it('THÈME CLAIR strictement inchangé : blanc (#ffffff), validé par Arno — non touché par ce lot', () => {
    const css = compact(lire('app/globals.css'));
    expect(css).toContain('--color-svv-surface-raised: #ffffff;');
    // le rouge n'est redéfini QU'en sombre : aucune règle scopée pour le clair
    expect(css).not.toContain("[data-theme='light'] .svv-repli-titre--surface");
  });

  it('THÈME SOMBRE : le fond surélevé est FRANCHEMENT plus clair que le conteneur (écart chiffré, jamais inversé)', () => {
    const RAISED = '#37455a', FIELD = '#242e3c'; // valeurs sombres (assertées présentes ci-dessus / dans le bloc de tokens)
    expect(lum(RAISED)).toBeGreaterThan(lum(FIELD));               // surélevé = PLUS CLAIR que le conteneur (même sens qu'en clair)
    expect(contraste(RAISED, FIELD)).toBeGreaterThanOrEqual(1.3);  // écart FRANC (mesuré ≈ 1,41), pas une nuance de 2 %
  });

  it('THÈME SOMBRE : le rouge d’alerte dédié tient AA (≥4,5:1) sur la surface surélevée, appliqué QUE là (règle scopée dark + system)', () => {
    const css = compact(lire('app/globals.css'));
    expect(css).toContain('--color-svv-red-raised: #ff9a9a;');
    expect(contraste('#ff9a9a', '#37455a')).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain(".svv-adm-root[data-theme='dark'] .svv-repli-titre--surface { --color-svv-red: var(--color-svv-red-raised); }");
    expect(css).toContain(".svv-adm-root[data-theme='system'] .svv-repli-titre--surface { --color-svv-red: var(--color-svv-red-raised); }");
  });

  it('BlocRepliable (unifié) : `titreClasseExtra` est ADDITIF — absent ⇒ `svv-repli-titre` seul (autres appelants inchangés)', () => {
    const src = compact(lire(P + 'BlocRepliable.tsx'));
    expect(src).toContain('titreClasseExtra?: string;');
    expect(src).toContain('svv-repli-titre${titreClasseExtra'); // la classe de base n'est jamais remplacée, seulement complétée
  });

  it('CaracteristiquesBloc : les 4 sous-cartouches reçoivent le modificateur, dérivé de la prop `sousLignesSurface`', () => {
    const src = lire(P + 'CaracteristiquesBloc.tsx');
    expect(src).toContain("sousLignesSurface ? 'svv-repli-titre--surface' : undefined");
    expect((src.match(/titreClasseExtra=\{classeSousLigne\}/g) ?? []).length).toBe(4);
  });

  it('SCOPE fiche partagée : le fond surélevé est activé dans FichePermisBlocs (Analyse ET Rattachement) ; les 3 écrans plats (En cours / Réponses / Archives) NON', () => {
    // Décision Arno (lot 2, 21/09) — le fond surélevé vit dans la FICHE PARTAGÉE, montée en Analyse ET en Rattachement (parité visuelle des 6
    //   lignes). Il n'est donc plus gaté par le mode : `sousLignesSurface` (nu) dans FichePermisBlocs. Les 3 écrans PLATS montent CaracteristiquesBloc
    //   SANS cette prop → strictement inchangés. ProjectionVue / SuiviRattachementVue délèguent à la fiche : ils reçoivent le fond VIA elle, sans porter le littéral.
    expect(lire(P + 'FichePermisBlocs.tsx')).toContain('sousLignesSurface'); // la fiche partagée l'active (Analyse + Rattachement)
    for (const rel of ['SuiviDemandes.tsx', 'ReponsesVue.tsx', 'ArchivesVue.tsx']) {
      expect(lire(P + rel).includes('sousLignesSurface'), `${rel} (écran plat) ne doit PAS activer le fond surélevé`).toBe(false);
    }
    for (const rel of ['ProjectionVue.tsx', 'SuiviRattachementVue.tsx']) {
      expect(lire(P + rel).includes('sousLignesSurface'), `${rel} délègue à la fiche partagée (ne porte pas le littéral)`).toBe(false);
    }
  });

  it('ligne MÈRE inchangée : ni ProjectionVue ni FichePermisBlocs n’ajoutent de modificateur de titre (le fond surélevé vit dans CaracteristiquesBloc, sur les sous-lignes)', () => {
    expect(lire(P + 'ProjectionVue.tsx')).not.toContain('titreClasseExtra');
    expect(lire(P + 'FichePermisBlocs.tsx')).not.toContain('titreClasseExtra');
  });
});
