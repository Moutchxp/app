import { describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (10/11/2026, pré-visite, règle 7) — les mails Location d'un LOCATAIRE : le journal (457) lu par SES occupations (jamais par une
 * adresse). Base simulée : on vérifie le paramètre lié et les fragments sémantiques, jamais la forme exacte du SQL.
 */
const appels: { sql: string; params: unknown[] }[] = [];
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    appels.push({ sql: sql.replace(/\s+/g, ' '), params });
    return { rows: [{ id: '9', sorte: 'previsite_refus', quand: '2026-11-10', par: 'Arno', a: ['a@exemple.test'], cc: [], objet: 'o', texte: 't', statut: 'envoye' }] };
  },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));

import { mailsAvisDuLocataire } from './mailsPreavisSortieRepo';

describe('mailsAvisDuLocataire', () => {
  it('par les occupations du locataire (clé de sa fiche), du plus récent au plus ancien', async () => {
    const r = await mailsAvisDuLocataire('LOC-42');
    expect(r).toEqual([{ id: 9, sorte: 'previsite_refus', quand: '2026-11-10', par: 'Arno', a: ['a@exemple.test'], cc: [], objet: 'o', texte: 't', statut: 'envoye' }]);
    const a = appels.at(-1)!;
    expect(a.params).toEqual(['LOC-42']);
    expect(a.sql).toContain('m.occupation_ids && ARRAY(SELECT o.id FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l');
    expect(a.sql).toContain('ORDER BY m.envoye_le DESC');
  });
  it('sans clé : aucun, sans requête', async () => {
    appels.length = 0;
    expect(await mailsAvisDuLocataire('  ')).toEqual([]);
    expect(appels).toEqual([]);
  });
});
