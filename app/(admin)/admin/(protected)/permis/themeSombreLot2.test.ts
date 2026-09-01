import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOT 38 (thème sombre 2/3) — GARDE : sur les surfaces balayées, le FOND et sa COULEUR DE TEXTE basculent ENSEMBLE (règle du lot).
 * Le défaut n°1 (onglet actif) venait d'un FOND oublié (#fff en dur, texte clair hérité → blanc sur blanc) ; le défaut n°2 (pli
 * « Texte de la demande initiale ») d'un TEXTE non apparié. Ce test CASSE si un #fff en dur réapparaît sur ces fonds, ou si le
 * texte cesse d'être posé sur son fond. Les zones « reste clair » (plan/tracé/carte) ne sont PAS visées ici.
 */
const lire = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\s+/g, ' ');
const P = 'app/(admin)/admin/(protected)/permis/';

describe('LOT 38 — fonds tokenisés + texte apparié (fond & texte basculent ensemble)', () => {
  it('DÉFAUT 1 — onglet actif : fond = surface (plus de #fff), texte = ink explicite', () => {
    const src = lire(P + 'PermisOnglets.tsx');
    expect(src).toContain("background: actif ? 'var(--color-svv-surface)' : 'var(--color-svv-field)', color: 'var(--color-svv-ink)'");
    expect(src).not.toContain("actif ? '#fff'"); // le fond blanc en dur de l'onglet actif a disparu
  });

  it('DÉFAUT 2 — textarea « Texte de la demande initiale » : fond = surface + texte = ink (appariés)', () => {
    const src = lire(P + 'DemandesRendu.tsx');
    expect(src).toContain("background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)'");
    expect(src).not.toContain("boxSizing: 'border-box', background: '#fff'"); // l'ancien fond blanc non apparié a disparu
  });

  it('sweep — carte Réglages (section) : fond tokenisé', () => {
    expect(lire(P + 'ReglagesRendu.tsx')).toContain("overflow: 'hidden', background: 'var(--color-svv-surface)'");
  });

  it('sweep — liste d’autocomplétion (PermisVue) : fond surface + texte ink', () => {
    expect(lire(P + 'PermisVue.tsx')).toContain("listStyle: 'none', background: 'var(--color-svv-surface)', color: 'var(--color-svv-ink)'");
  });

  it('sweep — bascules inversées (Rattachement / Réglages) : paire ink↔surface (jamais #fff), lisible dans les deux sens', () => {
    expect(lire(P + 'PermisRattachementRendu.tsx')).toContain(
      "background: actif === valeur ? 'var(--color-svv-ink)' : 'var(--color-svv-surface)', color: actif === valeur ? 'var(--color-svv-surface)' : 'var(--color-svv-ink)'",
    );
    expect(lire(P + 'ReglagesVue.tsx')).toContain(
      "background: actif ? 'var(--color-svv-ink)' : 'var(--color-svv-surface)', color: actif ? 'var(--color-svv-surface)' : 'var(--color-svv-ink)'",
    );
  });

  it('ZONE PROTÉGÉE — le tracé d’emprise n’est pas touché (reste clair, hors diff)', () => {
    // Le plan/tracé garde son fond clair EN DUR : ce test documente la frontière (TraceEmpriseRendu reste hors périmètre).
    expect(lire(P + 'TraceEmpriseRendu.tsx')).toContain("background: '#fff'");
  });
});
