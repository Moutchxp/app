import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * PL-A — planche cadastrale (composant client : fetch + SVG). Garde par LECTURE DE SOURCE : on prouve la LECTURE SEULE, la
 * réutilisation du schéma pur, et la PROVENANCE HONNÊTE (jamais « à la main » pour un harnais/CLI), sans monter le DOM.
 */
const SRC = readFileSync(fileURLToPath(new URL('./PlancheParcelles.tsx', import.meta.url)), 'utf8');
const ROUTE = readFileSync(fileURLToPath(new URL('../../../../(admin)/api/admin/permis/planche/route.ts', import.meta.url)), 'utf8');

describe('PlancheParcelles — lecture seule, schéma pur réutilisé, provenance honnête', () => {
  it('LECTURE SEULE : GET de la planche, AUCUN POST/écriture depuis le composant', () => {
    expect(SRC).toContain('/api/admin/permis/planche?');
    expect(SRC).toContain('cache: '); // no-store, jamais une écriture
    expect(SRC).not.toContain("method: 'POST'");
  });
  it('PL-B — RÉUTILISE la liseuse existante (jamais dupliquée) : import de LiseusePieces', () => {
    expect(SRC).toContain("import { LiseusePieces } from './LiseusePieces'");
    expect(SRC).toContain('<LiseusePieces dossierId={dossierId}');
  });
  it('PL-B — RAYON réglable à l’écran 50→200 m (input range)', () => {
    expect(SRC).toContain('type="range"');
    expect(SRC).toMatch(/RAYON_MIN\s*=\s*50/);
    expect(SRC).toMatch(/RAYON_MAX\s*=\s*200/);
  });
  it('PL-B — TROIS modes de centrage (empreinte défaut / parcelle / adresse)', () => {
    expect(SRC).toContain("changerMode('empreinte')");
    expect(SRC).toContain("changerMode('parcelle')");
    expect(SRC).toContain("changerMode('adresse')");
  });
  it('PL-B — « on ne devine pas » : l’avertissement de centrage est affiché (adresse non résolue)', () => {
    expect(SRC).toContain('data.centreAvertissement');
  });
  it('PL-B — SURVOL→nom (title), TAP/CLIC (onClick→sélection), CLAVIER (tabIndex + onFocus/onKeyDown) : utilisable au doigt ET au clavier', () => {
    expect(SRC).toContain('<title>');
    expect(SRC).toContain('onClick={() => setSelection');
    expect(SRC).toContain('tabIndex={0}');
    expect(SRC).toMatch(/onFocus=\{\(\) => setSelection/);
  });
  it('la ROUTE n’expose QUE GET (aucune mutation)', () => {
    expect(ROUTE).toContain('export async function GET');
    expect(ROUTE).not.toContain('export async function POST');
  });
  it('réutilise le module PUR (schéma projeté) via le loader, pas une lib de tuiles', () => {
    expect(SRC).toContain("from '../../../../lib/permis/plancheParcellesRepo'");
    expect(SRC).toContain('schema.polygones');
    expect(SRC).not.toMatch(/leaflet|mapbox|maplibre|ol\/Map/i);
  });
  it('PROVENANCE HONNÊTE : passe par descriptionActeurParcelle ; « à la main » CONDITIONNÉ (jamais inconditionnel)', () => {
    expect(SRC).toContain('descriptionActeurParcelle');
    expect(SRC).toContain('d.aLaMain');
    expect(SRC).toContain('référence corrigée par'); // branche NON identifiable (verif-lot101)
  });
  it('HONNÊTETÉ (piège LOT 71) : rien à dessiner → un MOTIF, jamais un cadre vide muet', () => {
    expect(SRC).toContain('data.motif');
  });
});
