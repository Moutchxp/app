/**
 * ══ 🔴🔴 LES VUES SELON LE STATUT DU BIEN (Arno, 21/10/2026, migration 403) — Gestion filtrée, Location complète ══════════════
 *
 *   ① GESTION : la fiche propriétaire n'a que l'en gestion (et l'ancienne gestion, rangée en « anciens ») ; la location seule
 *      est écartée et COMPTÉE (« + N bien(s) en location seule ») ; l'annuaire ne la trouve pas par l'adresse, et un
 *      propriétaire dont TOUS les biens sont en location seule n'en sort pas ;
 *   ② SANS la vue (Location, sélecteurs de mails) : tout, comme avant ;
 *   ③ « CLIENTS ET BIENS » (Location) : tous statuts, filtre par statut, recherche par nom / adresse ;
 *   ④ ADHOC & MONGA : ni bail proposé, ni envoi, pour un bien qui n'est pas en gestion.
 *
 * VRAIES fonctions, VRAIE base — une COPIE jetable de la recette avec la 403 appliquée. 🔒 REFUSE de tourner ailleurs que sur
 * une base `svav_jetable…` ou `svav_test…`, et se met de côté sans la 403.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_statut403 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/statutBienVues.itest.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { creerBienComplet, creerProprietaires } from '../location/creationBienRepo';
import { clientsEtBiens } from '../location/clientsBiensRepo';
import { bauxEnCoursDesLots, bauxEnCoursDuLocataire, envoyerNouvelleLocation, MOTIF_ENVOI_HORS_GESTION } from '../location/mailNouvelleLocationRepo';
import { analyserTerme } from './annuaireRecherche';
import { ficheLocataire, ficheProprietaire, rechercherPersonnes } from './annuaireRepo';
import { changerStatutBien } from './statutBienRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest vues du statut' };
const S = `v${Date.now().toString(36)}`;
const DPE_ENTRETIEN = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false };
const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const carte = (nom: string) => ({ nom, coordonnees: [{ sorte: 'telephone' as const, valeur: '06 07 07 07 07', libelle: 'Mobile' },
  { sorte: 'email' as const, valeur: `${nom.toLowerCase()}@exemple.test`, libelle: 'E-mail' }] });
afterAll(async () => { if (baseEssai) await closePool(); });

let avec403 = false;
beforeAll(async () => {
  if (!baseEssai) return;
  const { rows } = await query<{ c: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gestion_annuaire_lot' AND column_name = 'statut_bien') AS c`);
  avec403 = rows[0]?.c === true;
});

describe.skipIf(!baseEssai)('🔴🔴 les vues selon le statut du bien (403)', () => {
  let mixte = 0;
  let toutLS = 0;
  let enGestion = 0;
  let locationSeule = 0;
  let ancienne = 0;
  let seulLS = 0;

  beforeAll(async () => {
    if (!avec403) return;
    mixte = ok(await creerProprietaires({ cartes: [carte(`MIXTE${S}`)], enGestion: true, numeroMandat: `MG ${S}` }, AUTEUR)).ids[0];
    const bien = async (p: number, adresse: string, oui: boolean) => ok(await creerBienComplet({ proprietaireIds: [p], enGestion: oui,
      logement: { adresse, ...DPE_ENTRETIEN, famille: 'logement', typeLogement: 'appartement' }, annexes: [] }, AUTEUR)).logementId;
    enGestion = await bien(mixte, `1 rue Vue${S}`, true);
    locationSeule = await bien(mixte, `2 rue Seule${S}`, false);
    ancienne = await bien(mixte, `3 rue Ancienne${S}`, true);
    ok(await changerStatutBien(ancienne, { vers: 'ancienne_gestion', effetLe: '2026-10-01' }, AUTEUR, new Date('2026-10-21T10:00:00Z')));
    toutLS = ok(await creerProprietaires({ cartes: [carte(`TOUTLS${S}`)], enGestion: false, numeroMandatTransaction: `MT ${S}` }, AUTEUR)).ids[0];
    seulLS = await bien(toutLS, `4 rue Seule${S}`, false);
  });

  it('① GESTION — la fiche : en gestion + anciens, la location seule écartée et comptée', async () => {
    if (!avec403) return;
    const f = ok(await ficheProprietaire(mixte, { horsLocationSeule: true }));
    expect(f.biens.map((b) => [b.id, b.statut, b.fin === null])).toEqual([[enGestion, 'en_gestion', true], [ancienne, 'ancienne_gestion', false]]);
    expect(f.biensLocationSeule).toBe(1);
  });

  it('① GESTION — l’annuaire : pas de location seule par l’adresse ; un propriétaire tout en location seule n’en sort pas', async () => {
    if (!avec403) return;
    const parAdresse = ok(await rechercherPersonnes(analyserTerme(`rue Seule${S}`), { horsLocationSeule: true }));
    expect(parAdresse.personnes.map((p) => p.id)).toEqual([]);
    const parNom = ok(await rechercherPersonnes(analyserTerme(`TOUTLS${S}`), { horsLocationSeule: true }));
    expect(parNom.personnes).toEqual([]);
    const mixteTrouve = ok(await rechercherPersonnes(analyserTerme(`MIXTE${S}`), { horsLocationSeule: true })).personnes[0];
    expect(mixteTrouve.biens.map((b) => b.lotId).sort()).toEqual([enGestion, ancienne].sort());
  });

  it('② SANS la vue (Location, sélecteurs de mails) : tout, comme avant', async () => {
    if (!avec403) return;
    const f = ok(await ficheProprietaire(mixte));
    expect(f.biens.map((b) => b.statut).sort()).toEqual(['ancienne_gestion', 'en_gestion', 'location_seule']);
    expect(f.biensLocationSeule).toBeUndefined();
    expect(ok(await rechercherPersonnes(analyserTerme(`TOUTLS${S}`))).personnes.map((p) => p.id)).toEqual([toutLS]);
    expect(ok(await rechercherPersonnes(analyserTerme(`rue Seule${S}`))).personnes.map((p) => p.id).sort()).toEqual([mixte, toutLS].sort());
  });

  it('③ « CLIENTS ET BIENS » : tous statuts, filtre par statut, recherche par nom et par adresse', async () => {
    if (!avec403) return;
    const tous = await clientsEtBiens(`MIXTE${S}`, 'tous');
    expect(tous.clients.map((c) => c.id)).toEqual([mixte]);
    expect(tous.clients[0].biens.map((b) => b.statut)).toEqual(['en_gestion', 'location_seule', 'ancienne_gestion']);
    expect((await clientsEtBiens(`MIXTE${S}`, 'location_seule')).clients[0].biens.map((b) => b.id)).toEqual([locationSeule]);
    expect((await clientsEtBiens(`MIXTE${S}`, 'ancienne_gestion')).clients[0].biens.map((b) => b.id)).toEqual([ancienne]);
    expect((await clientsEtBiens(`TOUTLS${S}`, 'en_gestion')).clients).toEqual([]);
    expect((await clientsEtBiens(`4 rue Seule${S}`, 'tous')).clients.map((c) => c.id)).toEqual([toutLS]);
    expect((await clientsEtBiens(`rue Seule${S}`, 'location_seule')).clients.map((c) => c.id).sort()).toEqual([mixte, toutLS].sort());
  });

  it('④ ADHOC & MONGA : aucun bail proposé ni envoi pour un bien qui n’est pas en gestion', async () => {
    if (!avec403) return;
    const bail = async (lot: number) => Number((await query<{ id: string }>(`INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, '2026-10-01') RETURNING id::text`, [lot])).rows[0].id);
    const bg = await bail(enGestion);
    const bl = await bail(seulLS);
    const baux = await bauxEnCoursDesLots([enGestion, seulLS]);
    expect(Object.keys(baux)).toEqual([String(enGestion)]);
    expect(baux[String(enGestion)].bailId).toBe(bg);
    const envoi = await envoyerNouvelleLocation(bl, [{ adresse: 'adhoc@exemple.test', nom: 'ADHOC' }], AUTEUR, { transport: { envoyer: async () => { throw new Error('rien ne doit partir'); } } as never });
    expect(envoi).toMatchObject({ etat: expect.stringMatching(/refus|sans_schema/) });
    if (envoi.etat === 'refus') expect(envoi.motif).toBe(MOTIF_ENVOI_HORS_GESTION);
    expect(await bauxEnCoursDuLocataire(0)).toEqual([]);
  });

  it('⑤ LOCATAIRES (réponse 3b) : tout en location seule → absent de la Gestion ; mixte → seules ses occupations hors location seule', async () => {
    if (!avec403) return;
    const locataire = async (nom: string) => Number((await query<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise) VALUES ($1, $1, $2, lower($2)) RETURNING id::text`,
      [`app-${nom}`, nom])).rows[0].id);
    const occuper = async (loc: number, lot: number) => query(
      `INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree)
       SELECT $1, $2, lo.id, lo.wippimmo_id, '2026-01-01' FROM gestion_annuaire_lot lo WHERE lo.id = $3`, [`app-occ-${loc}-${lot}`, loc, lot]);
    const seul = await locataire(`LOCSEUL${S}`);
    await occuper(seul, locationSeule);
    const mixte = await locataire(`LOCMIXTE${S}`);
    await occuper(mixte, locationSeule);
    await occuper(mixte, enGestion);
    // La recherche de la Gestion ne trouve pas le locataire « tout en location seule » ; la Location (sans la vue), si.
    expect(ok(await rechercherPersonnes(analyserTerme(`LOCSEUL${S}`), { horsLocationSeule: true })).personnes).toEqual([]);
    expect(ok(await rechercherPersonnes(analyserTerme(`LOCSEUL${S}`))).personnes.map((p) => p.id)).toEqual([seul]);
    expect(ok(await rechercherPersonnes(analyserTerme(`LOCMIXTE${S}`), { horsLocationSeule: true })).personnes.map((p) => p.id)).toEqual([mixte]);
    // Sa fiche dans la Gestion : seulement l'occupation hors location seule ; celle « tout en location seule » est signalée.
    const fm = ok(await ficheLocataire(mixte, { horsLocationSeule: true }));
    expect(fm.occupations.map((o) => o.lotId)).toEqual([enGestion]);
    expect(fm.locationSeuleSeulement).toBeUndefined();
    expect(ok(await ficheLocataire(mixte)).occupations.map((o) => o.lotId).sort()).toEqual([enGestion, locationSeule].sort());
    const fs = ok(await ficheLocataire(seul, { horsLocationSeule: true }));
    expect(fs.occupations).toEqual([]);
    expect(fs.locationSeuleSeulement).toBe(true);
  });
});
