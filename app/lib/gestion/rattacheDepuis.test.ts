import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { motRattacheDepuis } from './historiqueEvenements';
import { sqlDansUnePeriodeOuverte, sqlPeriodes, sqlRattacheDepuis } from './etatParLaFrise';

/**
 * 🔴 Arno (23/10/2026) — « on garde DEUX dates distinctes » : l'OUVERTURE (= la création ; carte Ouverture, statistiques) et le
 * DÉBUT DE RATTACHEMENT (= la date du mail d'origine ; quels mails du fil comptent). Base SIMULÉE : rien n'est écrit. La règle
 * SQL elle-même est éprouvée sur le vrai moteur, en lecture seule (`etatParLaFrise.itest.ts`, ㉓).
 */
const emis: { sql: string; params: unknown[] }[] = [];
let colonne = true;
vi.mock('../db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.includes('INSERT INTO gestion_compteur')) return { rows: [{ dernier: 12 }], rowCount: 1 };
    if (sql.includes('INSERT INTO gestion_evenement')) return { rows: [{ id: 12 }], rowCount: 1 };
    if (sql.includes('FROM gestion_fil')) return { rows: [{ id: 3, etat: 'a_classer' }], rowCount: 1 };
    if (sql.includes('FROM gestion_message WHERE id = $1 FOR UPDATE')) return { rows: [{ id: 77, fil_id: 3, objet: 'x' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, withTransaction: async (fn: (q: typeof query) => unknown) => fn(query) };
});
vi.mock('./schema', async (orig) => ({
  ...(await orig<typeof import('./schema')>()),
  evenementQualifieDisponible: async () => true,
  rattacheDepuisDisponible: async () => colonne,
}));
const gestes = await import('./gestes');
beforeEach(() => { emis.length = 0; colonne = true; });
const pose = () => emis.find((e) => e.sql.includes('SET rattache_depuis'));
const norm = (s: string) => s.replace(/\s+/g, ' ');
const AUTEUR = { id: 1, libelle: 'arno' };

describe('🔴 à la création : le début de rattachement = la date du mail d’origine (jamais le futur), sinon la création', () => {
  it('« ce mail seul » : CE mail est le mail d’origine', async () => {
    await gestes.deplacerMessageVersNouveau(77, { objet: 'Fuite' } as never, AUTEUR).catch(() => undefined);
    const p = pose()!;
    expect(norm(p.sql)).toContain('SET rattache_depuis = coalesce( (SELECT LEAST(m.recu_le, now()) FROM gestion_message m');
    expect(norm(p.sql)).toContain('e.ouvert_le)');           // sans mail lisible : la création
    expect(p.params).toEqual([12, 77, null]);
  });
  it('toute la conversation : le mail envoyé par l’écran, retenu seulement s’il est de CET échange', async () => {
    await gestes.affecter(3, { nouveau: { objet: 'Fuite', messageOrigine: 77 } as never }, AUTEUR).catch(() => undefined);
    const p = pose()!;
    expect(norm(p.sql)).toContain('AND ($3::bigint IS NULL OR m.fil_id = $3::bigint)');
    expect(p.params).toEqual([12, 77, 3]);
  });
  it('sans mail d’origine (événement manuel) : la date de création', async () => {
    await gestes.affecter(3, { nouveau: { objet: 'Fuite' } as never }, AUTEUR).catch(() => undefined);
    expect(pose()!.params).toEqual([12, null, 3]);   // coalesce(NULL, e.ouvert_le) = la création
  });
  it('sans la migration 410 : rien n’est écrit, la création est celle d’avant', async () => {
    colonne = false;
    await gestes.deplacerMessageVersNouveau(77, { objet: 'Fuite' } as never, AUTEUR).catch(() => undefined);
    expect(pose()).toBeUndefined();
    expect(emis.some((e) => e.sql.includes('INSERT INTO gestion_evenement'))).toBe(true);
  });
  it('l’ouverture, elle, reste l’instant de la création (règle de 508cbab0, inchangée)', async () => {
    await gestes.deplacerMessageVersNouveau(77, { objet: 'Fuite', ouvertLe: '2026-10-20' } as never, AUTEUR).catch(() => undefined);
    expect(emis.find((e) => e.sql.includes('INSERT INTO gestion_evenement'))!.params).not.toContain('2026-10-20');
  });
  it('l’écran (encart, toute la conversation) envoie le mail sous lequel il vit', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/BlocEvenement.tsx', 'utf8')).toContain('messageOrigine: messageId,');
  });
});

describe('🔴 la règle des mails : la première période s’élargit vers le passé, rien d’autre ne bouge', () => {
  it('la colonne est lue sans la nommer (NULL sans la migration)', () => {
    expect(sqlRattacheDepuis('ev')).toBe("(to_jsonb(ev) ->> 'rattache_depuis')::timestamptz");
  });
  it('un mail compte s’il est dans une période, OU entre le début de rattachement et la toute première ouverture', () => {
    const sql = norm(sqlDansUnePeriodeOuverte('ev', 'msg.recu_le'));
    expect(sql).toContain("msg.recu_le >= (to_jsonb(ev) ->> 'rattache_depuis')::timestamptz");
    expect(sql).toContain('svv_p2 WHERE svv_p2.du <= msg.recu_le))');
  });
  it('🔴 les périodes et donc les réouvertures et les statistiques ne lisent PAS cette date', () => {
    expect(sqlPeriodes('SELECT 1')).not.toContain('rattache_depuis');
    expect(readFileSync('app/lib/gestion/tableauBordRepo.ts', 'utf8')).not.toContain('rattache_depuis');
  });
});

describe('🔴 la migration 410 : ajout seul, rejouable, avec reprise', () => {
  const sql = readFileSync('db/migrations/410_gestion_evenement_rattache_depuis.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  it('une colonne ajoutée si absente ; la reprise ne remplit que les lignes vides ; rien n’est supprimé', () => {
    expect(code).toContain('ALTER TABLE gestion_evenement ADD COLUMN IF NOT EXISTS rattache_depuis timestamptz;');
    expect(code).toContain('WHERE e.rattache_depuis IS NULL;');
    expect(code).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
  });
  it('reprise : le mail de la première affectation, sinon l’ouverture d’origine (journal), jamais le futur', () => {
    expect(norm(code)).toContain('FROM (SELECT a.message_id FROM gestion_affectation a WHERE a.evenement_id = e.id ORDER BY a.id LIMIT 1) a1');
    expect(norm(code)).toContain("j.entite = 'evenement' AND j.entite_id = e.id AND j.action = 'ouverture'");
    expect(norm(code)).toContain('e.ouvert_le), now())');
  });
});

describe('🔴 l’affichage : « Mails rattachés depuis le … », quand les deux dates diffèrent', () => {
  it('dates différentes → la ligne ; même jour, inconnue → rien', () => {
    expect(motRattacheDepuis('2026-10-23 10:15:00+02', '2026-10-20 09:00:00+02')).toBe('Mails rattachés depuis le 20/10/2026');
    expect(motRattacheDepuis('2026-10-23 10:15:00+02', '2026-10-23 08:00:00+02')).toBeNull();
    expect(motRattacheDepuis('2026-10-23 10:15:00+02', null)).toBeNull();
  });
  it('la fiche de l’événement la pose sous « ouvert le … », discrète', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/EvenementsDuBien.tsx', 'utf8');
    expect(src).toContain('<span className="evb-rattache" data-rattache-depuis="">{motRattacheDepuis(e.ouvertLe, e.rattacheDepuis ?? null)}</span>');
    expect(readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8')).toContain("${sqlRattacheDepuis('e')}::text AS rattache_depuis,");
  });
});
