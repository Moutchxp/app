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

describe('Sous-lignes « surface » (Analyse) — fond surélevé tokenisé et scopé', () => {
  it('globals.css : la variante --surface passe par un TOKEN de surface (zéro hex en dur dans la règle)', () => {
    const css = compact(lire('app/globals.css'));
    expect(css).toContain('.svv-repli-titre--surface{background:var(--color-svv-surface-raised)');
    // le corps de la règle n'introduit AUCUNE couleur en dur (tout par token)
    const i = css.indexOf('.svv-repli-titre--surface{');
    const regle = css.slice(i, css.indexOf('}', i));
    expect(regle).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    // token défini en CLAIR (@theme, blanc = demande Arno) ET dans les DEUX blocs sombres (data-theme=dark + system) — plus clair que le conteneur
    expect(css).toContain('--color-svv-surface-raised: #ffffff;');
    expect((css.match(/--color-svv-surface-raised: #2a3442;/g) ?? []).length).toBe(2);
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

  it('SCOPE Analyse : seul ProjectionVue active `sousLignesSurface` ; En cours / Réponses / Archives / Rattachement NON', () => {
    expect(lire(P + 'ProjectionVue.tsx')).toContain('sousLignesSurface');
    for (const rel of ['SuiviDemandes.tsx', 'ReponsesVue.tsx', 'ArchivesVue.tsx', 'SuiviRattachementVue.tsx']) {
      expect(lire(P + rel).includes('sousLignesSurface'), `${rel} ne doit PAS activer le fond surélevé`).toBe(false);
    }
  });

  it('ligne MÈRE inchangée : ProjectionVue n’ajoute aucun modificateur de titre (le fond surélevé vit dans CaracteristiquesBloc, sur les sous-lignes)', () => {
    expect(lire(P + 'ProjectionVue.tsx')).not.toContain('titreClasseExtra');
  });
});
