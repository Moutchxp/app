import { describe, it, expect, vi } from 'vitest';
import { lireCadastre, isoler, type Requete } from './sourcesFraicheurRepo';

/**
 * FRAÎCHEUR / G2 — lecture du cadastre. Le bug corrigé : `cadastre_millesime.millesime` est TEXT (déjà « YYYY-MM-DD »), or le
 * code l'enveloppait dans `to_char(max(millesime), …)` → PostgreSQL rejette (to_char(text) n'existe pas) → la lecture jetait →
 * l'écran affichait « indisponible » alors que la donnée est là. La suite unitaire était VERTE car aucun test n'exerçait ce SQL.
 *
 * On teste ici le COMPORTEMENT (un millésime texte est lu et rendu) + par FRAGMENT SÉMANTIQUE que le millésime n'est plus
 * coercé via to_char (garde anti-régression), et que la sentinelle « indisponible » reste produite sur une vraie panne.
 */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('lireCadastre — le millésime texte est lu et rendu', () => {
  it('millésime TEXT « 2026-06-01 » → rendu tel quel, source NON « indisponible »', async () => {
    const sqls: string[] = [];
    const req: Requete = (async (text: string) => {
      sqls.push(text);
      if (text.includes('FROM parcelle')) return { rows: [{ dep: '75', n: 100 }] };
      if (text.includes('cadastre_millesime')) return { rows: [{ m: '2026-06-01', c: '2026-08-16' }] };
      return { rows: [] };
    }) as Requete;

    const r = await lireCadastre(req);
    expect(r.millesime).toBe('2026-06-01');
    expect(r.dateReference).toBe('2026-06-01');
    expect(r.indisponible).toBeFalsy();
    expect(r.vide).toBe(false);

    // Garde anti-régression (fragment sémantique, pas la forme complète) : le millésime est lu DIRECTEMENT, jamais via to_char.
    const q = sqls.map(norm).find((s) => s.includes('cadastre_millesime'))!;
    expect(q).toContain('max(millesime)');
    expect(q).not.toContain('to_char(max(millesime)'); // ← ceci aurait été RED sur le code bugué
  });

  it('cadastre_millesime vide → « aucun millésime enregistré », sans « indisponible » (donnée absente ≠ panne)', async () => {
    const req: Requete = (async (text: string) => {
      if (text.includes('FROM parcelle')) return { rows: [{ dep: '75', n: 100 }] };
      return { rows: [{ m: null, c: null }] }; // aucun millésime en base
    }) as Requete;
    const r = await lireCadastre(req);
    expect(r.millesime).toBeNull();
    expect(r.substitut).toBe('aucun millésime enregistré');
    expect(r.indisponible).toBeFalsy();
  });
});

describe('isoler — la sentinelle « indisponible » reste produite sur une vraie panne de lecture', () => {
  it('une lecture qui jette → { indisponible: true }, JAMAIS un blanc ni une date inventée', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await isoler('cadastre', () => Promise.reject(new Error('FATAL: connexion perdue')));
    expect(res).toMatchObject({ cle: 'cadastre', indisponible: true, millesime: null, dateReference: null });
    expect(err).toHaveBeenCalled(); // pas de catch muet : l'erreur est journalisée
    err.mockRestore();
  });
});
