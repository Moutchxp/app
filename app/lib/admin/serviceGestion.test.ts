import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ══ 🔴🔴 LOT PROFIL-GESTION-ET-ROUGE-PROPRIETAIRE — « APPARTIENT AU SERVICE GESTION » ══════════════════════════════════
 *   ① la migration 341 n'écrit RIEN hors de la valeur par défaut : aucun compte coché ;
 *   ② la case s'écrit en UNE requête atomique avec sa ligne de journal (date, auteur, avant/après) ;
 *   ③ la case ne donne AUCUN droit : aucune garde ne la lit.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
let disponible = true;
vi.mock('./schemaDroits', () => ({ serviceGestionDisponible: async () => disponible }));
const { definirServiceGestion, lireServiceGestion, servicesGestion } = await import('./serviceGestion');

beforeEach(() => { query.mockReset(); disponible = true; });
const plat = (sql: unknown): string => String(sql).replace(/\s+/g, ' ');

describe('① la migration 341 — un ajout, aucun compte coché', () => {
  const prose = readFileSync('db/migrations/341_admin_service_gestion.sql', 'utf8');
  const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  it('ajoute `service_gestion` FAUSSE par défaut, et rien d’autre comme colonne', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+service_gestion\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    const touchees = [...code.matchAll(/(?:ADD|DROP|ALTER|RENAME)\s+COLUMN(?:\s+IF (?:NOT )?EXISTS)?\s+(\w+)/gi)].map((m) => m[1]);
    expect(touchees).toEqual(['service_gestion']);
  });
  it('🔴 n’écrit dans AUCUNE ligne : ni UPDATE, ni INSERT, ni DELETE (aucun compte n’est coché ici)', () => {
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN)/i.test(code)).toBe(false);
  });
  it('admet l’action `changement_service_gestion` au journal, en gardant les huit d’avant', () => {
    for (const a of ['creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions',
      'reinitialisation_mot_de_passe', 'changement_mot_de_passe', 'changement_identite', 'changement_service_gestion']) {
      expect(code).toContain(`'${a}'`);
    }
  });
});

describe('② l’écriture : atomique, historisée, une ligne visée', () => {
  it('UPDATE et journal (avant / après, auteur) dans la MÊME requête ; paramètres liés', async () => {
    query.mockResolvedValue({ rows: [{ id: 4 }] });
    expect(await definirServiceGestion(4, true, 2)).toBe(true);
    const [sql, params] = query.mock.calls[0];
    expect(plat(sql)).toContain('UPDATE admin_utilisateur u SET service_gestion = $2');
    expect(plat(sql)).toContain("INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) SELECT 'changement_service_gestion'");
    expect(plat(sql)).toContain('avant.service_gestion IS DISTINCT FROM $2');          // rien n'est écrit sans changement
    expect(params).toEqual([4, true, 2]);
  });
  it('compte introuvable ⇒ `false`', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await definirServiceGestion(99, true, 2)).toBe(false);
  });
  it('migration absente ⇒ aucune requête, `false` ; la lecture rend « non » et « indisponible »', async () => {
    disponible = false;
    expect(await definirServiceGestion(4, true, 2)).toBe(false);
    expect(await lireServiceGestion(4)).toEqual({ valeur: false, disponible: false, modifieLe: null, modifiePar: null });
    expect((await servicesGestion([4])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
  it('la lecture rend la case et son dernier changement (date, auteur)', async () => {
    query.mockResolvedValue({ rows: [{ valeur: true, ts: '2026-10-11 15:00:00+02', auteur: 'Arnaud Jorel' }] });
    expect(await lireServiceGestion(4)).toEqual({ valeur: true, disponible: true, modifieLe: '2026-10-11 15:00:00+02', modifiePar: 'Arnaud Jorel' });
  });
});

describe('③ 🔒 la case ne donne AUCUN droit', () => {
  it('aucune garde ni aucun calcul de droit ne la lit', () => {
    for (const f of ['app/lib/admin/garde.ts', 'app/lib/admin/session.ts', 'app/lib/admin/comptes.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('service_gestion');
      expect(readFileSync(f, 'utf8'), f).not.toContain('serviceGestion');
    }
  });
});
