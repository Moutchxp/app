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
let trouves: { id: string }[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(),
  withTransaction: async (f: (q: (s: string, v?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) =>
    f(async (s: string, v: unknown[] = []) => {
      appels.push({ sql: sql(s), v });
      if (s.includes('FOR UPDATE')) return { rows: trouves };
      if (s.includes('UPDATE gestion_rattachement')) return { rows: trouves.map((t) => ({ ...t, message_id: '42', cible_cle: '219' })) };
      return { rows: [] };
    }),
}));
const { sortirDuSuivi, restaurerDansLeSuivi } = await import('./sortieSuiviRepo');

/* LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS — CE QU'ILS DISAIENT AVANT : la sortie posait `sorti_le` en laissant le
   statut « confirme ». Elle pose désormais le STATUT « sorti » sur la ligne du couple (mail, bien) — migration 340. */
describe('③ « Sortir du suivi » marque le COUPLE (mail, bien), n’efface rien, et se restaure', () => {
  beforeEach(() => { appels.length = 0; trouves = [{ id: '7' }]; });
  const A = { id: 1, libelle: 'a.jorel@sansvisavis.com' };

  it('ne lit que les liens de CE bien, pose le réglage de session exigé par la base, puis le statut « sorti »', async () => {
    expect(await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A, motif: 'doublon' })).toEqual({ ok: true, liens: 1 });
    const lecture = appels.find((x) => x.sql.includes('FOR UPDATE'));
    expect(lecture?.sql).toContain("message_id = $1 AND cible_sorte = 'lot' AND cible_cle = $2 AND piece_id IS NULL AND statut = $3");
    expect(lecture?.v).toEqual([42, '219', 'confirme']);
    expect(appels.some((x) => x.sql.includes("set_config('svav.sortie_suivi', 'on', true)"))).toBe(true);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE gestion_rattachement'));
    expect(maj?.sql).toContain("SET statut = 'sorti'");
    expect(maj?.sql).toContain("WHERE id = $1 AND statut = 'confirme' AND cible_sorte = 'lot'");
    expect(appels.some((x) => /DELETE|statut = 'retire'/.test(x.sql))).toBe(false);
  });
  it('historisé au journal (date, auteur), une ligne par lien', async () => {
    await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A });
    const j = appels.find((x) => x.sql.includes('INSERT INTO gestion_journal'));
    expect(j?.sql).toContain("'sortir_du_suivi', 'confirme', 'sorti'");
    expect(j?.v).toEqual([7, 'mail 42 · lot 219', 1, 'a.jorel@sansvisavis.com']);
  });
  it('« Restaurer » rend « confirme » au lien sorti de CE bien, à tout moment', async () => {
    expect(await restaurerDansLeSuivi({ messageId: 42, lotCle: '219', auteur: A })).toEqual({ ok: true, liens: 1 });
    expect(appels.find((x) => x.sql.includes('FOR UPDATE'))?.v).toEqual([42, '219', 'sorti']);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE gestion_rattachement'));
    expect(maj?.sql).toContain("SET statut = 'confirme'");
    expect(maj?.sql).toContain('sorti_le = NULL');
  });
  it('rien à marquer (déjà sorti, autre bien) : refus dit, rien au journal', async () => {
    trouves = [];
    expect(await sortirDuSuivi({ messageId: 42, lotCle: '219', auteur: A })).toMatchObject({ ok: false });
    expect(appels.some((x) => x.sql.includes('gestion_journal'))).toBe(false);
  });
});

describe('④ LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS — le verrou resserré et les six gestes', () => {
  const M340 = sql(readFileSync(join(ici, '../../../db/migrations/340_gestion_sortie_suivi_par_bien.sql'), 'utf8'));
  const corps340 = M340.slice(M340.indexOf('CREATE OR REPLACE FUNCTION gestion_rattachement_verrou'));
  it('« sorti » est un statut du lien de BIEN (le couple mail, bien), daté', () => {
    expect(M340).toContain("CHECK (statut IN ('propose', 'confirme', 'rejete', 'retire', 'sorti'))");
    expect(M340).toContain("CHECK (statut <> 'sorti' OR (cible_sorte = 'lot' AND sorti_le IS NOT NULL))");
  });
  it('🔴 plus d’exception « auteur humain » : un lien confirmé ne change de statut que par la fonction dédiée', () => {
    expect(corps340).not.toContain('statut_par IS NULL');
    expect(corps340).toContain("IF OLD.statut = 'confirme' AND NEW.statut <> 'confirme' THEN IF NOT dediee THEN");
    expect(corps340).toContain("IF OLD.cible_sorte = 'lot' AND NEW.statut <> 'sorti'");
  });
  it('un AJOUT n’est jamais bloqué : aucune règle ne refuse de passer à « confirme »', () => {
    expect(corps340).toContain("IF OLD.statut = 'sorti' AND NEW.statut NOT IN ('sorti', 'confirme')");
    expect(corps340).not.toMatch(/NEW\.statut = 'confirme'[^;]*RAISE/);
  });
  it('les six gestes passent par `changerStatut`, qui convertit tout retrait d’un bien confirmé en « sorti du suivi »', () => {
    const ratt = sql(lire('rattachementRepo.ts'));
    expect(ratt).toContain("if (avant === 'confirme' && o.statut !== 'confirme' && rows[0].cible_sorte === 'lot' && !(o.annulationAjout === true && rows[0].recent === true))");
    /* 🔴 LOT TRACE-ONE-SHOT (342) — le même appel, la photo du suivi de fond en plus (null pour une sortie automatique). */
    expect(ratt).toContain('await sortirLeLien(q, o.lienId, o.auteur, o.motif ?? null, photo)');
    // rattacher : re-cocher un bien sorti le RESTAURE (une seule ligne par couple)
    expect(ratt).toContain("WHERE ${OU_IDENTITE} AND statut = 'sorti' ORDER BY id DESC LIMIT 1");
  });
  it('les annulations d’AJOUT (Monga, Interne levé, suivi) le disent ; « Interne » relit les « sortis » pour « Annuler »', () => {
    expect(lire('mongaClassement.ts')).toContain('annulationAjout: true');
    expect(lire('interneRepo.ts')).toContain('annulationAjout: true');
    expect(lire('periodeRepo.ts')).toContain('annulationAjout: true');
    expect(lire('interneRepo.ts')).toContain("statut IN ('retire', 'sorti') AND coalesce(statut_motif, '') = $2");
  });
  it('la cascade des interventions ne touche plus qu’aux PROPOSITIONS', () => {
    expect(sql(lire('contactExterneRepo.ts'))).toContain("AND r.regle = $5 AND r.statut = 'propose'");
  });
  it('les écrans demandent avant de sortir un mail d’un bien (phrase d’Arno)', () => {
    const G = join(ici, '../../(admin)/admin/(protected)/gestion');
    for (const f of ['ClasserMail.tsx', 'ModifierRattachement.tsx', 'EncartRattachement.tsx']) {
      expect(readFileSync(join(G, f), 'utf8'), f).toContain('confirmerSortieDesBiens(');
    }
  });
});
