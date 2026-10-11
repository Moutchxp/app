import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ══ 🔴🔴 LOT INVARIANT-HISTORIQUE-INALTERABLE — LE GARDE ════════════════════════════════════════════════════════════════
 * RÈGLE ABSOLUE D'ARNO : « Un mail entré dans l'historique d'un bien n'en sort JAMAIS, sauf par “Sortir du suivi”,
 * mail par mail et restaurable. Rien dans l'annuaire ne touche à l'historique. » (docs/INVARIANTS_SVAV.md §14)
 *
 * Trois étages : ① le verrou en base (migration 339) est écrit tel qu'annoncé ; ② le code ne retire plus rien
 * automatiquement, et les gestes de l'annuaire ne nomment aucune table de l'historique ; ③ « Sortir du suivi » marque
 * sans rien défaire, et se restaure. Le parcours en vraie base (transaction annulée) est dans le compte rendu du lot.
 */
const ici = __dirname;
const lire = (f: string): string => readFileSync(join(ici, f), 'utf8');
const sql = (s: string): string => s.replace(/\s+/g, ' ');
const MIGRATION = sql(readFileSync(join(ici, '../../../db/migrations/339_gestion_historique_inalterable.sql'), 'utf8'));

describe('① le verrou en base (migration 339)', () => {
  it('ni DELETE ni TRUNCATE sur les mails, les rattachements, les adresses de mail et les pièces', () => {
    expect(MIGRATION).toContain("ARRAY['gestion_message', 'gestion_rattachement', 'gestion_message_adresse', 'gestion_piece']");
    expect(MIGRATION).toContain('BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gestion_historique_refuser_suppression()');
    expect(MIGRATION).toContain('BEFORE TRUNCATE ON %I FOR EACH STATEMENT');
  });
  it('un lien : identité intouchable, pas de retrait automatique d’un lien confirmé, sortie par la fonction dédiée seule', () => {
    expect(MIGRATION).toContain('NEW.cible_cle IS DISTINCT FROM OLD.cible_cle');
    expect(MIGRATION).toContain("OLD.statut = 'confirme' AND NEW.statut <> 'confirme' AND NEW.statut_par IS NULL");
    expect(MIGRATION).toContain("current_setting('svav.sortie_suivi', true)");
  });
  it('une partie reconnue sur une adresse de mail ne s’efface pas', () => {
    expect(MIGRATION).toContain('IF OLD.partie IS NOT NULL AND NEW.partie IS NULL THEN NEW.partie := OLD.partie');
  });
  it('les CASCADE vers ces tables deviennent NO ACTION, sans rien supprimer', () => {
    expect(MIGRATION).toContain("replace(r.def, ' ON DELETE CASCADE', '')");
    expect(MIGRATION).not.toMatch(/DELETE FROM/i);
  });
  it('les bases jetables d’épreuve seules y échappent', () => {
    expect(MIGRATION).toContain("current_database() = 'gestion_jetable' OR current_database() LIKE 'svav_test%'");
  });
});

describe('② le code ne fait plus sortir un mail tout seul', () => {
  const ratt = sql(lire('rattachementRepo.ts'));
  it('le moteur ne retire que des PROPOSITIONS (jamais un lien confirmé)', () => {
    const corps = ratt.slice(ratt.indexOf('async function retirerLiensPerimes'), ratt.indexOf('export async function examinerPaquet'));
    expect(corps).toContain("AND origine = 'automatique' AND statut = 'propose' AND statut_par_libelle IS NULL");
    expect(corps).not.toContain("statut IN ('propose', 'confirme')");
  });
  it('le moteur ne rétrograde jamais un lien confirmé en proposition', () => {
    expect(ratt).toContain("SET statut = CASE WHEN statut = 'confirme' THEN 'confirme' ELSE $6 END");
  });
  it('une projection SANS auteur (héritage automatique) ne retire rien', () => {
    expect(lire('periodeRepo.ts')).toContain('if (auteur.id === null) continue;');
  });
  it('l’historique d’un bien ne lit que les liens NON sortis du suivi, sans aucune jointure sur un contact actif', () => {
    expect(lire('rattachement.ts')).toContain('AND ${alias}.sorti_le IS NULL');
  });
  it('🔴 les gestes de l’annuaire (syndic, contacts, carnet, adresses) ne nomment AUCUNE table de l’historique', () => {
    for (const f of ['syndicRepo.ts', 'contactsImmeubleRepo.ts']) {
      const src = lire(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const t of ['gestion_rattachement', 'gestion_message', 'gestion_piece']) {
        expect(src, `${f} nomme ${t}`).not.toContain(t);
      }
    }
  });
});

// ③ « Sortir du suivi », sur une base simulée ────────────────────────────────────────────────────────────────────
const appels: { sql: string; v: unknown[] }[] = [];
let lignesMaj: { id: string }[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(),
  withTransaction: async (f: (q: (s: string, v?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    f(async (s: string, v: unknown[] = []) => {
      appels.push({ sql: sql(s), v });
      return { rows: s.includes('UPDATE gestion_rattachement') ? lignesMaj : [] };
    }),
}));
const { sortirDuSuivi, restaurerDansLeSuivi } = await import('./sortieSuiviRepo');

describe('③ « Sortir du suivi » marque, n’efface rien, et se restaure', () => {
  beforeEach(() => { appels.length = 0; lignesMaj = [{ id: '7' }]; });
  const A = { id: 1, libelle: 'a.jorel@sansvisavis.com' };

  it('pose d’abord le réglage de session exigé par la base, puis marque les liens confirmés du mail vers CE bien', async () => {
    expect(await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A, motif: 'doublon' })).toEqual({ ok: true, liens: 1 });
    expect(appels[0].sql).toContain("set_config('svav.sortie_suivi', 'on', true)");
    const maj = appels.find((x) => x.sql.includes('UPDATE gestion_rattachement'));
    expect(maj?.sql).toContain('SET sorti_le = now(), sorti_par = $3, sorti_par_libelle = $4, sorti_motif = $5');
    expect(maj?.sql).toContain("cible_sorte = 'lot' AND cible_cle = $2 AND statut = 'confirme' AND piece_id IS NULL AND sorti_le IS NULL");
    expect(maj?.v).toEqual([42, '219', 1, 'a.jorel@sansvisavis.com', 'doublon']);
    expect(appels.some((x) => /DELETE|statut = 'retire'/.test(x.sql))).toBe(false);
  });
  it('historisé au journal (date, auteur), une ligne par lien', async () => {
    await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A });
    const j = appels.find((x) => x.sql.includes('INSERT INTO gestion_journal'));
    expect(j?.v.slice(0, 2)).toEqual([7, 'sortir_du_suivi']);
    expect(j?.v.slice(-2)).toEqual([1, 'a.jorel@sansvisavis.com']);
  });
  it('« Restaurer » lève la marque, à tout moment', async () => {
    expect(await restaurerDansLeSuivi({ messageId: 42, lotCle: '219', auteur: A })).toEqual({ ok: true, liens: 1 });
    const maj = appels.find((x) => x.sql.includes('UPDATE gestion_rattachement'));
    expect(maj?.sql).toContain('SET sorti_le = NULL');
    expect(appels.find((x) => x.sql.includes('INSERT INTO gestion_journal'))?.v[1]).toBe('restaurer_dans_le_suivi');
  });
  it('rien à marquer (déjà sorti, autre bien) : refus dit, rien au journal', async () => {
    lignesMaj = [];
    expect(await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A })).toMatchObject({ ok: false });
    expect(appels.some((x) => x.sql.includes('gestion_journal'))).toBe(false);
  });
});
