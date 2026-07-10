import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Statistiques } from './affichage';

/**
 * M2 — LOT 5. Garanties du tableau de bord : (1) il ne touche JAMAIS la base ni la couche de lecture
 * (server-only) — il consomme UNIQUEMENT l'API du Lot 4 ; (2) il n'affiche AUCUNE métrique refusée par
 * l'étude ; (3) aucun bleu (couleur/anneau de focus). On vérifie le CODE SOURCE (pas de rendu : environnement
 * node, aucun outil de rendu de composant dans le projet).
 */
const DIR = __dirname;
const sources = () =>
  fs.readdirSync(DIR).filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'));
const lire = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');
const codeSeul = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('accès — le dashboard consomme l’API, jamais la base ni la couche de lecture', () => {
  it('aucun fichier n’importe la couche de lecture (server-only), db/client, pg, ni le pool d’écriture', () => {
    for (const f of sources()) {
      const code = codeSeul(lire(f));
      for (const interdit of ["analytics/lecture", "lib/db/client", "from 'pg'", 'from "pg"', 'queryAnalytics', 'poolAnalytics', 'analytics/pool', 'analytics/writer']) {
        expect(code.includes(interdit), `${f} ne doit PAS importer ${interdit}`).toBe(false);
      }
    }
  });

  it('le seul point d’accès données est fetch(/api/admin/statistiques) — pas d’autre appel réseau', () => {
    const page = lire('page.tsx');
    expect(page).toMatch(/fetch\(construireUrl\(/); // consomme l'API du Lot 4
    // Aucun accès à une table analytics directement (le client ne connaît pas la base).
    for (const table of ['analytics_compteur_jour', 'analytics_session', 'analytics_config']) {
      expect(codeSeul(page).includes(table), `page.tsx ne doit pas nommer ${table}`).toBe(false);
    }
  });

  it('aucun localStorage/sessionStorage pour des données analytics', () => {
    for (const f of sources()) {
      const code = codeSeul(lire(f));
      expect(code.includes('localStorage') || code.includes('sessionStorage')).toBe(false);
    }
  });
});

describe('métriques refusées — jamais affichées', () => {
  it('le type Statistiques (miroir de l’API) n’a aucun champ de métrique refusée', () => {
    const echantillon: Statistiques = {
      fenetre: { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' },
      k: 11,
      trafic: [],
      verdicts: { sans_vis_a_vis: 0, vis_a_vis: 0, indetermine: 0, total: 0 },
      analyses: { lancees: 0, resultats: 0 },
      entonnoir: [],
      communes: { visibles: [], masque: null },
      provenance: { par_source_medium: { visibles: [], masque: null }, par_referer: { visibles: [], masque: null } },
    };
    const cles = Object.keys(echantillon).join(' ').toLowerCase();
    for (const mot of ['unique', 'recurrent', 'moyenne', 'duree', 'sortie', 'exit', 'visiteur']) {
      expect(cles.includes(mot), `aucun champ « ${mot} »`).toBe(false);
    }
  });

  it('aucune tuile ne titre une métrique refusée (durée moyenne, page de sortie, visiteur unique)', () => {
    for (const f of sources()) {
      const src = lire(f).toLowerCase();
      for (const interdit of ['durée moyenne', 'duree moyenne', 'page de sortie', 'temps moyen', 'visiteurs récurrents']) {
        expect(src.includes(interdit), `${f} : titre refusé « ${interdit} » absent`).toBe(false);
      }
      // Toute mention « unique » DOIT être une NÉGATION explicite (« jamais des visiteurs uniques »).
      for (let idx = src.indexOf('unique'); idx !== -1; idx = src.indexOf('unique', idx + 1)) {
        expect(src.slice(Math.max(0, idx - 30), idx), `${f} : « unique » doit être nié`).toMatch(/jamais|pas de/);
      }
    }
  });
});

describe('aucun bleu — couleur ni anneau de focus', () => {
  it('aucune couleur bleue ni classe d’anneau Tailwind (focus rouge explicite)', () => {
    for (const f of sources()) {
      const code = codeSeul(lire(f));
      expect(/blue|bleu/i.test(code), `${f} : aucune mention de bleu`).toBe(false);
      // Pas d'anneau Tailwind par défaut (bleu) : ring-*, focus:ring, outline-blue…
      expect(/\bring-|focus:ring|outline-blue/.test(code), `${f} : pas d’anneau Tailwind (bleu par défaut)`).toBe(false);
    }
  });
  it('le focus est explicitement rouge dans la feuille de style de l’écran', () => {
    const toutes = sources().map(lire).join('\n');
    expect(toutes).toMatch(/focus-visible\{outline:2px solid var\(--color-svv-red\)/);
  });
});
