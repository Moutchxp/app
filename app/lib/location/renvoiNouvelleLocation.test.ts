import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══ 🔴🔴 LOT DOUBLON-RENVOI-ADHOC (Arno, 10/11/2026) — UN RENVOI N'EST QU'UN ENVOI, TRACÉ ══════════════════════════════════════════════
 *
 * Règle d'Arno : « un renvoi de ce mail ne fait QU'ENVOYER le mail, autant de fois qu'on veut. Il ne crée, ne modifie et ne date aucune
 * location, aucune transaction, aucune entrée de locataire, aucun CA. […] Chaque renvoi est seulement tracé (qui, quand, à qui). »
 *
 * Le cas réel (production, `.captures/doublon-renvoi-adhoc/resultat-prod.txt`) : bail 542, 28 avenue Marceau (Réf. 505), PIEULHET entrée
 * le 10/10/2026 ; 1er envoi le 06/11 à 11:25 (Jean-Baptiste PONS), RENVOI le 09/11 à 17:50 (Alexandra Da Silva) à quatre adresses. On le
 * rejoue ici trois fois de suite sur la vraie fonction (`envoyerNouvelleLocation`), base et transport simulés : aucun réseau, aucun envoi.
 */
const requetes: { sql: string; params: unknown[] }[] = [];
const S = (sql: string) => sql.replace(/\s+/g, ' ');
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    requetes.push({ sql, params });
    const s = S(sql);
    if (s.includes('FROM gestion_bail WHERE id = $1')) return { rows: [{ lot_id: '356', entree: '2026-10-10' }], rowCount: 1 };
    if (s.includes('FROM gestion_annuaire_occupation WHERE bail_id = $1')) return { rows: [{ id: '560', lot_id: '356', locataire_id: '531' }], rowCount: 1 };
    if (s.includes('FROM gestion_annuaire_lot lo WHERE lo.id = ANY')) return { rows: [{ id: '356', adresse: '28 Avenue Marceau', code_postal: '92400', commune: 'Courbevoie' }], rowCount: 1 };
    if (s.includes('AS s FROM gestion_bail g JOIN gestion_annuaire_lot lo')) return { rows: [{ s: 'en_gestion' }], rowCount: 1 };
    if (s.startsWith('INSERT INTO gestion_location_mail_envoi')) return { rows: [{ quand: `2026-11-09 17:5${requetes.filter((r) => r.sql.startsWith('INSERT')).length}:00+01` }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: vi.fn(async () => true) }));
vi.mock('../gestion/statutBienRepo', () => ({ sqlStatutBien: vi.fn(async () => `'en_gestion'`), statutBienDisponible: vi.fn(async () => true) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: vi.fn(async () => ({ nom: 'Alexandra Da Silva', email: 'a.dasilva@sansvisavis.com' })) }));
vi.mock('../gestion/config', () => ({ chargerConfigGestion: vi.fn(async () => ({ adresseGestion: 'gestion@criterimmo.fr' })) }));
vi.mock('../gestion/coordonneeVivante', () => ({ conditionCoordonneeVivante: vi.fn(async () => '') }));
vi.mock('./creationBienRepo', () => ({ complementsDuBien: vi.fn(async () => null) }));
vi.mock('./conditionsEntreeRepo', () => ({ conditionsParOccupation: vi.fn(async () => new Map()) }));
vi.mock('./loyerEntreeRepo', () => ({ loyerDesOccupations: vi.fn(async () => null) }));
vi.mock('./brancheBailDriveRepo', () => ({ dossierDuBail: vi.fn(async () => null) }));
vi.mock('./digicodeImmeubleRepo', () => ({ lireDigicodeDuLot: vi.fn(async () => null) }));
vi.mock('./mandatBienRepo', () => ({ mandatsDesProprietaires: vi.fn(async () => []) }));
vi.mock('../gestion/partieCategorieRepo', () => ({ lireGarantsDuBail: vi.fn(async () => []) }));

import { envoyerNouvelleLocation } from './mailNouvelleLocationRepo';

const DESTINATAIRES = [
  { adresse: 'a.dasilva@sansvisavis.com', libelle: '' }, { adresse: 'gestion@criterimmo.fr', libelle: '' },
  { adresse: 'gestion.criterimmo@gmail.com', libelle: '' }, { adresse: 'elona@monga.io', libelle: '' },
];
const AUTEUR = { id: 7, libelle: 'a.dasilva@sansvisavis.com' };
/** Toute écriture qui toucherait une location, une transaction, une entrée de locataire ou un CA. */
const ECRITURE_INTERDITE = /(INSERT INTO|UPDATE|DELETE FROM)\s+(gestion_location_activite|gestion_bail|gestion_annuaire_occupation|gestion_annuaire_locataire|gestion_location_conditions\w*|gestion_location_preavis|transaction_\w+)\b/i;

beforeEach(() => { requetes.length = 0; });

describe('🔴🔴 le cas PIEULHET rejoué : renvoyer trois fois le mail du bail 542', () => {
  it('trois mails partent, trois traces (qui, quand, à qui) — et RIEN d’autre n’est écrit : ni location, ni bail, ni entrée, ni CA', async () => {
    const transport = { envoyer: vi.fn(async () => ({ ok: true as const })) };
    for (let i = 0; i < 3; i++) {
      const r = await envoyerNouvelleLocation(542, DESTINATAIRES, AUTEUR, { transport: transport as never });
      expect(r.etat, JSON.stringify(r)).toBe('ok');
    }
    expect(transport.envoyer).toHaveBeenCalledTimes(3);
    const ecritures = requetes.filter((r) => /^\s*(INSERT|UPDATE|DELETE)/i.test(r.sql));
    expect(ecritures).toHaveLength(3);
    for (const e of ecritures) {
      expect(S(e.sql)).toContain('INSERT INTO gestion_location_mail_envoi');
      expect(e.params[0]).toBe(542);                                        // le bail : celui de l'enregistrement initial
      expect(e.params[2]).toBe('Alexandra Da Silva');                       // qui
      expect(JSON.parse(e.params[4] as string).map((d: { adresse: string }) => d.adresse))
        .toEqual(DESTINATAIRES.map((d) => d.adresse));                      // à qui (le « quand » est posé par la base : envoye_le)
      expect(e.params[7]).toBe('envoye');
    }
    expect(requetes.filter((r) => ECRITURE_INTERDITE.test(r.sql))).toEqual([]);
  });
  it('la date d’entrée et le mois de comptabilisation ne sont même pas lus pour être réécrits : aucune requête ne nomme le suivi', async () => {
    await envoyerNouvelleLocation(542, DESTINATAIRES, AUTEUR, { transport: { envoyer: async () => ({ ok: true as const }) } as never });
    expect(requetes.filter((r) => /gestion_location_activite|date_signature/.test(r.sql))).toEqual([]);
  });
  it('un envoi en échec est tracé aussi (statut « echec »), sans rien écrire d’autre', async () => {
    const r = await envoyerNouvelleLocation(542, DESTINATAIRES, AUTEUR, { transport: { envoyer: async () => ({ ok: false as const, motif: 'refusé' }) } as never });
    expect(r.etat).toBe('echec');
    const ecritures = requetes.filter((x) => /^\s*(INSERT|UPDATE|DELETE)/i.test(x.sql));
    expect(ecritures.map((e) => [S(e.sql).slice(0, 44), e.params[7]])).toEqual([['INSERT INTO gestion_location_mail_envoi (bai', 'echec']]);
  });
});

describe('🔴 le chemin du bouton : la route et l’écran n’appellent que l’envoi', () => {
  it('POST /api/admin/location/nouvelle-location n’appelle qu’`envoyerNouvelleLocation` ; le dépôt n’écrit que le journal des envois', () => {
    const route = readFileSync('app/(admin)/api/admin/location/nouvelle-location/route.ts', 'utf8');
    const post = route.slice(route.indexOf('export async function POST'));
    expect(post).toContain('envoyerNouvelleLocation(bail');
    expect(post).not.toMatch(/enregistrer|activite|creer|suivi/i);
    const repo = readFileSync('app/lib/location/mailNouvelleLocationRepo.ts', 'utf8');
    expect(repo.match(/(INSERT INTO|UPDATE|DELETE FROM)\s+\w+/g)).toEqual(['INSERT INTO gestion_location_mail_envoi']);
  });
  it('« Renvoyer à ADHOC & MONGA » ouvre la fenêtre ; « Envoyer » n’appelle que la route d’envoi ; les boutons ne sont pas des « submit »', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/EnvoiAdhocMonga.tsx', 'utf8');
    expect(src.match(/fetch\(API, \{ method: 'POST'/g)).toHaveLength(1);
    expect(src).not.toMatch(/<form\b/);
    for (const b of src.match(/<button\b[^>]*>/g) ?? []) expect(b).toContain('type="button"');
  });
});

describe('préavis et sortie : pas de bouton de renvoi, et leurs envois n’écrivent que leur journal', () => {
  it('les mails de préavis et de sortie n’écrivent que gestion_location_mail_avis et le journal du module', () => {
    const src = readFileSync('app/lib/location/mailsPreavisSortieRepo.ts', 'utf8');
    expect([...new Set(src.match(/(INSERT INTO|UPDATE|DELETE FROM)\s+\w+/g))].sort()).toEqual(['INSERT INTO gestion_journal', 'INSERT INTO gestion_location_mail_avis']);
  });
});
