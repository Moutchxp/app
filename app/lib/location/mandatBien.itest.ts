/**
 * ══ 🔴🔴 « NOUVEAU BIEN » : LE MANDAT SELON « BIEN EN GESTION ? » (Arno, 21/10/2026, migration 397), SUR UNE COPIE DE LA RECETTE ══
 *
 *   ① Oui + mandat de gestion (n°, date) → écrit sur la fiche du propriétaire (champs existants + date 397) ; la transaction
 *      n'est pas touchée ; ② Non + mandat de transaction → l'inverse ; ③ un mandat d'une sorte contraire au choix final n'est pas
 *      écrit ; ④ sans mandat → rien ne change ; ⑤ l'encart du bien, la fiche propriétaire et le mail « Nouvelle location »
 *      l'affichent ; ⑥ le pré-remplissage lit le mandat existant.
 * 🔒 TOUT COURT DANS UNE TRANSACTION ANNULÉE ; la 397 y est appliquée puis annulée. 🔒 Base `svav_test…` seulement :
 *   createdb svav_test_mandat397 && pg_dump --no-owner --no-privileges svav_recette | psql -q -d svav_test_mandat397
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_mandat397 npx vitest run --config vitest.integration.config.ts app/lib/location/mandatBien.itest.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ouvrirEssaiAnnule, type EssaiAnnule } from '../db/essaiAnnule';
import { oublierSchema } from '../gestion/schema';
import { creerBienComplet, creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBienAvec } from './portefeuilleRepo';
import { ficheProprietaireLocation } from './locationRepo';
import { resumeDuBien } from './resumeBienRepo';
import { donneesNouvelleLocation } from './mailNouvelleLocationRepo';
import { htmlNouvelleLocation } from './mailNouvelleLocation';
import { mandatsDesProprietaires } from './mandatBienRepo';
import { oublierSchemaLocation } from './sondeLocation';
import type { DepsBrancheBail } from './brancheBailDriveRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_test/.test(NOM_BASE);
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const S = `t${Date.now().toString(36)}`;
const SANS_DRIVE: DepsBrancheBail = { fetch: (async () => { throw new Error('Drive interdit'); }) as typeof fetch, jeton: async () => ({ etat: 'expire', motif: 'épreuve' }) };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const proprio = async (id: number) => (await query<{ mg: string | null; dg: string | null; mt: string | null; dt: string | null }>(
  `SELECT numero_mandat_gestion AS mg, mandat_gestion_signe_le::text AS dg, numero_mandat_transaction AS mt, mandat_transaction_signe_le::text AS dt
     FROM gestion_annuaire_proprietaire WHERE id = $1`, [id])).rows[0];
const carte = (nom: string, n: number) => ({ nom, coordonnees: [{ sorte: 'telephone' as const, valeur: `06 43 54 65 ${String(n).padStart(2, '0')}`, libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase()}.${n}@exemple.test`, libelle: 'E-mail' }] });

let essai: EssaiAnnule | null = null;
beforeAll(async () => { if (baseEssai) essai = await ouvrirEssaiAnnule(); });
afterAll(async () => { if (baseEssai) { await essai?.annuler(); await closePool(); } });

describe.skipIf(!baseEssai)('🔴🔴 migration 397 — le mandat selon « Bien en gestion ? »', () => {
  let p = 0; let bienGestion = 0;
  const bien = async (voie: string, enGestion: boolean, mandat?: unknown) => ok(await creerBienComplet({
    proprietaireIds: [p], annexes: [], enGestion, ...(mandat === undefined ? {} : { mandat }),
    logement: { adresse: voie, codePostal: '92400', commune: 'COURBEVOIE', famille: 'logement', typeLogement: 'studio', dpeClasse: 'D', dpeDate: '2024-01-01', entretienAPrevoir: false },
  }, AUTEUR));

  it('⓪ la recette SANS la 397, appliquée dans la transaction ; un propriétaire avec un mandat de gestion déjà connu', async () => {
    expect((await query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_proprietaire' AND column_name = 'mandat_gestion_signe_le'`)).rowCount).toBe(0);
    await query(readFileSync(path.join(process.cwd(), 'db/migrations/397_location_mandat_date_signature.sql'), 'utf8'));
    oublierSchemaLocation(); oublierSchema();
    p = ok(await creerProprietaires({ cartes: [carte(`MANDAT${S}`, 1)], enGestion: true, numeroMandat: 'MG-ANCIEN' }, AUTEUR)).ids[0];
    expect(await proprio(p)).toEqual({ mg: 'MG-ANCIEN', dg: null, mt: null, dt: null });
    // ⑥ le pré-remplissage lit le mandat existant.
    expect((await mandatsDesProprietaires([p]))[0]).toMatchObject({ gestion: { numero: 'MG-ANCIEN', signeLe: null }, transaction: { numero: null, signeLe: null } });
  });

  it('① Oui + mandat de gestion : écrit sur la fiche du propriétaire (n° et date) ; la transaction n’est pas touchée', async () => {
    const r = await bien(`1 rue Mandat ${S}`, true, { sorte: 'gestion', numero: 'MG-41', signeLe: '2026-10-15' });
    bienGestion = r.logementId;
    expect(r.mandatRefus).toBeNull();
    expect(await proprio(p)).toEqual({ mg: 'MG-41', dg: '2026-10-15', mt: null, dt: null });
  });

  it('③ un mandat d’une sorte CONTRAIRE au choix final n’est pas écrit ; ④ sans mandat, rien ne change', async () => {
    await bien(`2 rue Mandat ${S}`, true, { sorte: 'transaction', numero: 'MT-PERDU', signeLe: '2026-01-01' });
    await bien(`3 rue Mandat ${S}`, true);
    expect(await proprio(p)).toEqual({ mg: 'MG-41', dg: '2026-10-15', mt: null, dt: null });
  });

  it('② Non + mandat de transaction locative : écrit ; le mandat de gestion reste', async () => {
    await bien(`4 rue Mandat ${S}`, false, { sorte: 'transaction', numero: 'MT-7', signeLe: '2026-09-01' });
    expect(await proprio(p)).toEqual({ mg: 'MG-41', dg: '2026-10-15', mt: 'MT-7', dt: '2026-09-01' });
    const j = await query<{ action: string }>(`SELECT action FROM gestion_journal WHERE entite = 'annuaire' AND entite_id = $1 AND commentaire LIKE '%Nouveau bien%' ORDER BY id`, [p]);
    expect(j.rows.map((r) => r.action)).toEqual(['location_numero_mandat', 'location_numero_mandat_transaction']);
  });

  it('⑤ affiché : l’encart du bien (selon « Bien en gestion ? »), la fiche propriétaire, le mail « Nouvelle location »', async () => {
    expect((await resumeDuBien(bienGestion))?.mandat).toEqual({ sorte: 'gestion', lignes: ['Mandat de gestion n° MG-41, signé le 15/10/2026'] });
    const transaction = Number((await query<{ id: string }>(`SELECT id::text FROM gestion_annuaire_lot WHERE adresse = $1`, [`4 rue Mandat ${S}`])).rows[0].id);
    expect((await resumeDuBien(transaction))?.mandat).toEqual({ sorte: 'transaction', lignes: ['Mandat de transaction locative n° MT-7, signé le 01/09/2026'] });
    expect(ok(await ficheProprietaireLocation(p))).toMatchObject({ numeroMandat: 'MG-41', mandatGestionSigneLe: '2026-10-15', numeroMandatTransaction: 'MT-7', mandatTransactionSigneLe: '2026-09-01' });
    const i = ok(await creerLocatairesSurBienAvec({ cartes: [carte(`LOCMANDAT${S}`, 2)], existants: [], contacts: [], lotId: bienGestion, entree: '2026-11-01' }, AUTEUR, SANS_DRIVE)) as { bailId: number };
    const d = (await donneesNouvelleLocation(i.bailId))!;
    expect(d.statut.mandat).toBe('Mandat de gestion n° MG-41, signé le 15/10/2026');
    expect(htmlNouvelleLocation(d)).toContain('Mandat de gestion n° MG-41, signé le 15/10/2026');
  });
});
