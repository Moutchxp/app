import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * PL-A/B/C — planche cadastrale (composant client). Garde par LECTURE DE SOURCE : réutilisation du schéma pur, provenance HONNÊTE,
 * et (PL-C) le BASCULEMENT au clic LOCAL + les deux boutons d'écriture explicites, sans monter le DOM.
 */
const SRC = readFileSync(fileURLToPath(new URL('./PlancheParcelles.tsx', import.meta.url)), 'utf8');
const ROUTE = readFileSync(fileURLToPath(new URL('../../../../(admin)/api/admin/permis/planche/route.ts', import.meta.url)), 'utf8');

describe('PlancheParcelles — schéma pur, provenance honnête (PL-A/B)', () => {
  it('RÉUTILISE la liseuse existante (jamais dupliquée) + le module PUR (pas de lib de tuiles)', () => {
    expect(SRC).toContain("import { LiseusePieces } from './LiseusePieces'");
    expect(SRC).toContain('<LiseusePieces dossierId={dossierId}');
    expect(SRC).toContain("from '../../../../lib/permis/plancheParcellesRepo'");
    expect(SRC).toContain('schema.polygones');
    expect(SRC).not.toMatch(/leaflet|mapbox|maplibre|ol\/Map/i);
  });
  it('RAYON 50→200 m + TROIS modes de centrage', () => {
    expect(SRC).toContain('type="range"');
    expect(SRC).toMatch(/RAYON_MIN\s*=\s*50/); expect(SRC).toMatch(/RAYON_MAX\s*=\s*200/);
    expect(SRC).toContain("changerMode('empreinte')"); expect(SRC).toContain("changerMode('parcelle')"); expect(SRC).toContain("changerMode('adresse')");
  });
  it('SURVOL instantané (onMouseMove + position:fixed), <title> a11y, OÙ L’ON EST', () => {
    expect(SRC).toContain('onMouseMove='); expect(SRC).toContain('setSurvol'); expect(SRC).toContain("position: 'fixed'"); expect(SRC).toContain('<title>');
    expect(SRC).toContain('data.localisation.feuilleLibelle'); expect(SRC).toContain('non résolue en base');
  });
  it('PROVENANCE HONNÊTE : descriptionActeurParcelle, « à la main » CONDITIONNÉ, jamais inconditionnel', () => {
    expect(SRC).toContain('descriptionActeurParcelle');
    expect(SRC).toContain('auteur non identifié'); // état validé par un auteur non-admin → jamais « à la main »
  });
});

describe('PlancheParcelles — sélection PL-C (basculement local + boutons d’écriture)', () => {
  it('CLIC = BASCULEMENT LOCAL : onClick → basculer(id), un clic N’ÉCRIT RIEN (aucun fetch dans le basculement)', () => {
    expect(SRC).toContain('onClick={() => basculer(id)}');
    expect(SRC).toMatch(/const basculer = [\s\S]*?setComposition/); // basculer ne touche QUE l'état local
    expect(SRC.match(/const basculer = \([\s\S]*?\};/)?.[0] ?? '').not.toContain('fetch');
  });
  it('VERT = composition (allumée) ; re-clic désélectionne (aria-pressed reflète l’état)', () => {
    expect(SRC).toContain('composition.has(id)');
    expect(SRC).toContain('aria-pressed={dans}');
    expect(SRC).toContain('var(--color-svv-green-ink)'); // vert des sélectionnées
  });
  it('CLAVIER + TACTILE : tabIndex sur les parcelles actionnables, Enter/Espace bascule, cibles ≥ 40 px (mobile-first)', () => {
    expect(SRC).toMatch(/tabIndex=\{focusable\(m\) \? 0 : -1\}/);
    expect(SRC).toContain("if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(id); }");
    expect(SRC).toMatch(/minHeight:\s*40/);
  });
  it('BOUTON « Valider la sélection » → POST valider ; refusé si composition vide', () => {
    expect(SRC).toContain('Valider la sélection');
    expect(SRC).toContain("poster('valider', [...composition])");
    expect(SRC).toContain('disabled={enCours || composition.size === 0}');
    expect(SRC).toContain('une empreinte vide n’est pas validable');
  });
  it('BOUTON « Revenir à la configuration d’origine » → POST retirer, SEULEMENT si une sélection existe', () => {
    expect(SRC).toContain('Revenir à la configuration d’origine');
    expect(SRC).toContain("poster('retirer')");
    expect(SRC).toMatch(/data\.selection\.active && <button[\s\S]*Revenir à la configuration/);
  });
  it('« Réinitialiser à la sélection par défaut » : LOCAL (composition = défaut automatique), pas d’écriture', () => {
    expect(SRC).toContain('Réinitialiser à la sélection par défaut');
    expect(SRC).toContain('const reinitialiser = () => { setComposition(new Set(defautIdus));');
  });
  it('GESTE DÉLIBÉRÉ : DIT ce qui se recalcule (empreinte + bâti + projection) ; état courant DIT (auto vs validé par QUI/QUAND)', () => {
    expect(SRC).toContain('recalcule l’empreinte, la photo du bâti et la projection');
    expect(SRC).toContain('Sélection validée'); expect(SRC).toContain('Configuration automatique');
    expect(SRC).toContain("data.selection.valideLe"); // QUAND
  });
  it('un POST passe bien par la route de modification /api/admin/permis/planche (method POST)', () => {
    expect(SRC).toContain("fetch('/api/admin/permis/planche', { method: 'POST'");
  });
});

describe('route /api/admin/permis/planche — GET (lecture) + POST (modification)', () => {
  it('GET et POST exposés ; POST DÉLÈGUE à validerSelection / retirerSelection (aucun SQL dans la route)', () => {
    expect(ROUTE).toContain('export async function GET'); expect(ROUTE).toContain('export async function POST');
    expect(ROUTE).toContain('validerSelection'); expect(ROUTE).toContain('retirerSelection');
    expect(ROUTE).not.toMatch(/INSERT|UPDATE|DELETE|SELECT /); // la route n'écrit aucun SQL : elle délègue au moteur (jamais permis_parcelle ici)
  });
  it('PROVENANCE : auteur = auteurDe(garde) (admin authentifié), jamais une chaîne de harnais', () => {
    expect(ROUTE).toContain('const auteur = auteurDe(garde)');
    expect(ROUTE).toContain('validerSelection(dossierId, idus, auteur)');
    expect(ROUTE).toContain('retirerSelection(dossierId, auteur)');
  });
  it('SÉLECTION VIDE refusée explicitement (400), jamais un succès silencieux', () => {
    expect(ROUTE).toContain('sélection vide');
    expect(ROUTE).toMatch(/idus\.length === 0[\s\S]*status: 400/);
  });
});
