import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (26/10/2026, 428) — LE DROIT « ACCÈS AU RÉSULTAT NET DE L'AGENCE » :
 *   ① la migration 428 : une colonne, À FAUX pour tous, aucun compte autorisé d'office ;
 *   ② l'écriture : forcée à faux sans la tuile Location, atomique avec son journal (avant / après, auteur, SESSION) ;
 *   ③ la lecture « peut voir » : administrateur toujours ; collaborateur actif = Location ET Oui ; sinon non.
 */
const query = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => query(...a) }));
let disponible = true;
vi.mock('./schemaDroits', () => ({ droitResultatNetDisponible: async () => disponible, droitLocationDisponible: async () => true }));
const { definirResultatNet, lireResultatNet, peutVoirResultatNet } = await import('./resultatNet');

beforeEach(() => { query.mockReset(); disponible = true; });
const plat = (sql: unknown): string => String(sql).replace(/\s+/g, ' ');

describe('① la migration 428 — un ajout, à faux pour tous', () => {
  const prose = readFileSync('db/migrations/428_admin_droit_resultat_net.sql', 'utf8');
  const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  it('ajoute `perm_resultat_net` FAUSSE par défaut, et aucune autre colonne', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+perm_resultat_net\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
    const touchees = [...code.matchAll(/(?:ADD|DROP|ALTER|RENAME)\s+COLUMN(?:\s+IF (?:NOT )?EXISTS)?\s+(\w+)/gi)].map((m) => m[1]);
    expect(touchees).toEqual(['perm_resultat_net']);
  });
  it('🔴 n’écrit dans AUCUNE ligne : aucun compte autorisé d’office (pas même Jean-Baptiste PONS)', () => {
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|COLUMN)/i.test(code)).toBe(false);
    expect(code).not.toMatch(/PONS|identifiant/i);
  });
});

describe('② l’écriture', () => {
  it('UPDATE et journal dans la MÊME requête : forcée à faux sans la tuile Location ; avant / après ; auteur ; session', async () => {
    query.mockResolvedValue({ rows: [{ id: 4 }] });
    expect(await definirResultatNet(4, true, 1, 'session-abc')).toBe(true);
    const [sql, params] = query.mock.calls[0];
    const s = plat(sql);
    expect(s).toContain("WHERE id = $1 AND role = 'collaborateur' FOR UPDATE");
    expect(s).toContain('SET perm_resultat_net = ($2::boolean AND avant.perm_location)');
    expect(s).toContain("INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) SELECT 'changement_permissions', maj.id, $3,");
    expect(s).toContain("jsonb_build_object('perm_resultat_net', maj.ancienne, 'session', $4::text)");
    expect(s).toContain("jsonb_build_object('perm_resultat_net', maj.nouvelle, 'session', $4::text)");
    expect(s).toContain('IS DISTINCT FROM'); // rien n'est écrit (ni journalisé) si la valeur ne change pas
    expect(params).toEqual([4, true, 1, 'session-abc']);
  });
  it('sans la migration 428 : rien n’est écrit', async () => {
    disponible = false;
    expect(await definirResultatNet(4, true, 1, null)).toBe(false);
    expect(await lireResultatNet(4)).toEqual({ valeur: false, disponible: false });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('③ qui voit le bloc', () => {
  const avec = (r: { role: string; actif: boolean; droit: boolean } | undefined) => query.mockResolvedValue({ rows: r === undefined ? [] : [r] });
  it('administrateur actif : oui ; collaborateur Location + Oui : oui ; sinon non ; inactif ou inconnu : non', async () => {
    avec({ role: 'administrateur', actif: true, droit: false }); expect(await peutVoirResultatNet(1)).toBe(true);
    avec({ role: 'collaborateur', actif: true, droit: true }); expect(await peutVoirResultatNet(2)).toBe(true);
    expect(plat(query.mock.calls.at(-1)?.[0])).toContain('perm_location AND perm_resultat_net AS droit');
    avec({ role: 'collaborateur', actif: true, droit: false }); expect(await peutVoirResultatNet(3)).toBe(false);
    avec({ role: 'collaborateur', actif: false, droit: true }); expect(await peutVoirResultatNet(4)).toBe(false);
    avec(undefined); expect(await peutVoirResultatNet(5)).toBe(false);
    expect(await peutVoirResultatNet(null)).toBe(false);
  });
  it('sans la migration 428 : seuls les administrateurs', async () => {
    disponible = false;
    avec({ role: 'collaborateur', actif: true, droit: false });
    expect(await peutVoirResultatNet(2)).toBe(false);
    expect(plat(query.mock.calls.at(-1)?.[0])).toContain('false AS droit');
  });
});
