import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (20/11/2026, journal des syndics) — la ligne du journal (avec la 506, et sans), et l'historique du syndic sur la fiche copropriété. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], avec506: true, avec417: true, journal: [] as Record<string, unknown>[], liens: [] as Record<string, unknown>[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT count(*)::int AS n FROM pg_constraint')) return { rows: [{ n: h.avec506 ? 1 : 0 }] };
  if (s.startsWith('SELECT id::text, cle_immeuble AS cle, libelle, code_postal AS cp, commune FROM gestion_copropriete WHERE id = $1')) {
    return { rows: [{ id: '157', cle: '80 rue de normandie', libelle: '80 rue de Normandie', cp: '92400', commune: 'Courbevoie' }] };
  }
  if (s.startsWith('SELECT nom, ville FROM gestion_syndic WHERE id = $1')) return { rows: [p[0] === 51 ? { nom: 'CABINET PASCAL TOUBON', ville: 'Paris' } : { nom: 'Cabinet A', ville: null }] };
  if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete_adresse')) return { rows: [{ cle: '43 avenue marceau' }] };
  if (s.startsWith('SELECT id::text, immeuble, adresse FROM gestion_annuaire_lot')) {
    return { rows: [{ id: '14', immeuble: '80 rue de Normandie', adresse: null }, { id: '12', immeuble: '43 avenue Marceau', adresse: null }, { id: '4', immeuble: '56 avenue Puvis de Chavannes', adresse: null }] };
  }
  if (s.startsWith('SELECT j.survenu_le::text AS quand')) return { rows: h.journal };
  if (s.startsWith('SELECT cs.debut::text AS debut')) return { rows: h.liens };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec417 }));
vi.mock('../db/sondeSchema', () => ({ creerMemoireSonde: () => ({ memoiser: (_k: string, f: () => Promise<boolean>) => f(), oublier: () => {} }) }));
import { historiqueSyndic, journaliserLienSyndic, phraseLien } from './journalSyndicCopro';

const AUTEUR = { id: 12, libelle: 'c.jullien' };
const lignes = () => h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));
beforeEach(() => { h.sql = []; h.avec506 = true; h.avec417 = true; h.journal = []; h.liens = []; });

describe('la ligne du journal', () => {
  it('rattaché : entité « copropriete », qui, la phrase, l’écran d’origine dans sa colonne (417)', async () => {
    await journaliserLienSyndic(q as never, { coproId: '157', nature: 'rattache', syndicId: 51, ecran: 'la fiche syndic (création du syndic)' }, AUTEUR);
    const [l] = lignes();
    expect(l.s).toBe('INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle, sujet, champ, ecran) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)');
    expect(l.p).toEqual(['copropriete', '157', 'syndic_rattache', null, 'CABINET PASCAL TOUBON / Paris',
      'Syndic CABINET PASCAL TOUBON / Paris rattaché à la copropriété 80 rue de Normandie, 92400 Courbevoie (depuis la fiche syndic (création du syndic))',
      12, 'c.jullien', 'copropriete', 'syndic', 'la fiche syndic (création du syndic)']);
  });
  it('remplacé : l’ancien syndic en « avant » et dans la phrase ; retiré : le syndic en « avant », le motif dans la phrase', async () => {
    await journaliserLienSyndic(q as never, { coproId: '157', nature: 'remplace', syndicId: 51, ancienSyndicId: 9, ecran: 'la fiche copropriété' }, AUTEUR);
    await journaliserLienSyndic(q as never, { coproId: '157', nature: 'retire', syndicId: 51, ecran: 'la fiche syndic', motif: 'retrait' }, { id: 2, libelle: 'a.jorel@sansvisavis.com' });
    const [r, t] = lignes();
    expect(r.p.slice(2, 6)).toEqual(['syndic_remplace', 'Cabinet A', 'CABINET PASCAL TOUBON / Paris',
      'Syndic CABINET PASCAL TOUBON / Paris rattaché à la copropriété 80 rue de Normandie, 92400 Courbevoie, à la place de Cabinet A (depuis la fiche copropriété)']);
    expect(t.p.slice(2, 8)).toEqual(['syndic_retire_copropriete', 'CABINET PASCAL TOUBON / Paris', null,
      'Syndic CABINET PASCAL TOUBON / Paris retiré de la copropriété 80 rue de Normandie, 92400 Courbevoie (depuis la fiche syndic — retrait)', 2, 'a.jorel@sansvisavis.com']);
  });
  it('sans la 506 : la même ligne à CHAQUE BIEN de la copropriété (adresse principale et secondaires), rien n’est perdu ; sans la 417 : sans la colonne écran', async () => {
    h.avec506 = false; h.avec417 = false;
    await journaliserLienSyndic(q as never, { coproId: '157', nature: 'rattache', syndicId: 51, ecran: 'la fiche syndic' }, AUTEUR);
    expect(lignes().map((l) => [l.p[0], l.p[1]])).toEqual([['annuaire_lot', '14'], ['annuaire_lot', '12']]);
    expect(lignes()[0].s).not.toContain('ecran');
  });
  it('la phrase, pure', () => {
    expect(phraseLien('retire', 'X', 'Y', null, 'la fiche syndic (suppression du syndic)', 'fermeture définitive'))
      .toBe('Syndic X retiré de la copropriété Y (depuis la fiche syndic (suppression du syndic) — fermeture définitive)');
  });
});

describe('l’historique du syndic sur la fiche copropriété', () => {
  it('le journal, puis le registre des liens pour ce qui précède ; un lien dont le geste est déjà au journal n’est pas répété ; du plus récent', async () => {
    h.journal = [{ quand: '2026-11-20 10:27:00.5+01', le: '20/11/2026 à 10h27', texte: 'Syndic CABINET PASCAL TOUBON / Paris retiré de la copropriété …', par: 'Arnaud Jorel' }];
    h.liens = [{ debut: '2026-10-29 16:40:00.1+01', fin: '2026-11-20 10:27:00.5+01', le_debut: '29/10/2026 à 16h40', le_fin: '20/11/2026 à 10h27', pose: 'c.jullien',
      fin_par: 'a.jorel@sansvisavis.com', motif: 'retrait', nom: 'CABINET PASCAL TOUBON', ville: 'Paris' }];
    expect(await historiqueSyndic(157)).toEqual([
      { quand: '2026-11-20 10:27:00.5+01', le: '20/11/2026 à 10h27', texte: 'Syndic CABINET PASCAL TOUBON / Paris retiré de la copropriété …', par: 'Arnaud Jorel', source: 'journal' },
      { quand: '2026-10-29 16:40:00.1+01', le: '29/10/2026 à 16h40', texte: 'Syndic CABINET PASCAL TOUBON / Paris rattaché', par: 'c.jullien', source: 'registre' },
    ]);
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s))).toBe(false);
  });
});
