/**
 * ══ 🔴🔴 LA CARTE COMPLÈTE — LE SERVEUR APPLIQUE LA RÈGLE (Arno, 18/10/2026), SUR UNE BASE JETABLE ══════════════════════
 *
 *   ① archiver, supprimer, ou retirer le téléphone de la DERNIÈRE carte complète d'un bien : refus explicite, rien n'est
 *      écrit ; la carte incomplète, elle, s'archive ;
 *   ② une autre carte complétée d'abord : le geste devient possible ;
 *   ③ une fiche ANCIENNE sans carte complète : jamais bloquée ;
 *   ④ la famille des LOCATAIRES (occupants en cours d'un même bien) : même règle ;
 *   ⑤ créations de la Location : refus sans aucune carte client complète, accepté avec une seule complète.
 *
 * VRAIES fonctions, VRAIE base (schéma copié, vide). 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` ou
 * `svav_test…`.
 *   DATABASE_URL=postgresql://localhost:5432/svav_jetable_l19 \
 *     npx vitest run --config vitest.integration.config.ts app/lib/location/carteComplete.itest.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { ajouterOccupant, ajouterProprietaireAuLot, archiverPersonne, creerPersonne, modifierPersonne, supprimerPersonne } from '../gestion/annuaireEditionRepo';
import { MOTIF_DERNIERE_COMPLETE_MODIFICATION, MOTIF_DERNIERE_COMPLETE_SUPPRESSION, MOTIF_PREMIERE_CARTE } from '../gestion/carteComplete';
import { creerProprietaireEtBiens } from './locationRepo';
import { creerProprietaires } from './creationBienRepo';
import { creerLocatairesSurBien } from './portefeuilleRepo';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
const baseEssai = /^svav_(jetable|test)/.test(NOM_BASE);
const AUTEUR = { id: null, libelle: 'itest carte complète' };
const S = `c${Date.now().toString(36)}`;
afterAll(async () => { if (baseEssai) await closePool(); });

const ok = <T>(i: { etat: string; data?: T }): T => { if (i.etat !== 'ok') throw new Error(JSON.stringify(i)); return i.data as T; };
const tel = (v: string) => ({ sorte: 'telephone' as const, valeur: v, libelle: 'Mobile' });
const mail = (v: string) => ({ sorte: 'email' as const, valeur: v, libelle: 'E-mail' });
const archive = async (table: string, id: number): Promise<boolean> =>
  (await query<{ a: boolean }>(`SELECT archive_le IS NOT NULL AS a FROM ${table} WHERE id = $1`, [id])).rows[0].a;
const nbCoord = async (sujet: string, id: number): Promise<number> =>
  Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM gestion_annuaire_contact WHERE sujet = $1 AND sujet_id = $2 AND archive_le IS NULL`, [sujet, id])).rows[0].n);

describe.skipIf(!baseEssai)('🔴 la carte complète, côté serveur', () => {
  let complet = 0; let incomplet = 0; let lot = 0;

  it('① la dernière carte complète d’un bien : ni archivée, ni supprimée, ni privée de son téléphone ; l’incomplète s’archive', async () => {
    const b = ok(await creerProprietaireEtBiens({ proprietaireId: null,
      proprietaire: { nom: `COMPLET${S}`, telephone: '06 31 31 31 31', email: `complet.${S}@exemple.test` },
      logement: { adresse: `7 rue Complete${S}`, codePostal: '75011', commune: 'Paris' }, annexes: [] }, AUTEUR));
    complet = b.proprietaireId; lot = b.logementId;
    incomplet = ok(await creerPersonne('proprietaire', { nom: `INCOMPLET${S}`, coordonnees: [mail(`incomplet.${S}@exemple.test`)] }, AUTEUR)).id;
    ok(await ajouterProprietaireAuLot(lot, incomplet, null, AUTEUR));

    expect(await archiverPersonne('proprietaire', complet, true, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_DERNIERE_COMPLETE_SUPPRESSION });
    expect(await supprimerPersonne('proprietaire', complet, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_DERNIERE_COMPLETE_SUPPRESSION });
    expect(await modifierPersonne('proprietaire', complet, { coordonnees: [mail(`complet.${S}@exemple.test`)] }, AUTEUR))
      .toEqual({ etat: 'refus', motif: MOTIF_DERNIERE_COMPLETE_MODIFICATION });
    // Rien n'a été écrit par ces refus.
    expect(await archive('gestion_annuaire_proprietaire', complet)).toBe(false);
    expect(await nbCoord('proprietaire', complet)).toBe(2);
    // Une modification qui GARDE la carte complète passe ; l'incomplète s'archive (et se restaure).
    ok(await modifierPersonne('proprietaire', complet, { coordonnees: [tel('06 31 31 31 32'), mail(`complet.${S}@exemple.test`)] }, AUTEUR));
    ok(await archiverPersonne('proprietaire', incomplet, true, AUTEUR));
    ok(await archiverPersonne('proprietaire', incomplet, false, AUTEUR));
  });

  it('② une autre carte complétée d’abord : la première peut alors être archivée', async () => {
    ok(await modifierPersonne('proprietaire', incomplet, { coordonnees: [tel('06 32 32 32 32'), mail(`incomplet.${S}@exemple.test`)] }, AUTEUR));
    ok(await archiverPersonne('proprietaire', complet, true, AUTEUR));
    // La seule complète, désormais, c'est l'autre : elle est protégée à son tour.
    expect(await archiverPersonne('proprietaire', incomplet, true, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_DERNIERE_COMPLETE_SUPPRESSION });
  });

  it('③ une fiche ANCIENNE sans carte complète n’est jamais bloquée', async () => {
    const vieux = ok(await creerPersonne('proprietaire', { nom: `ANCIEN${S}`, coordonnees: [tel('06 33 33 33 33')] }, AUTEUR)).id;
    const autre = ok(await creerPersonne('proprietaire', { nom: `ANCIEN2${S}`, coordonnees: [] }, AUTEUR)).id;
    const b = ok(await creerProprietaireEtBiens({ proprietaireId: vieux, proprietaire: {}, logement: { adresse: `9 rue Ancienne${S}` }, annexes: [] }, AUTEUR));
    ok(await ajouterProprietaireAuLot(b.logementId, autre, null, AUTEUR));
    // Complétion jamais bloquée, appauvrissement non plus, archivage d'une carte incomplète possible.
    ok(await modifierPersonne('proprietaire', vieux, { coordonnees: [] }, AUTEUR));
    ok(await archiverPersonne('proprietaire', vieux, true, AUTEUR));
  });

  it('④ les locataires d’une même location : la dernière carte complète est protégée', async () => {
    const l1 = ok(await creerPersonne('locataire', { nom: `LOC1${S}`, coordonnees: [tel('06 34 34 34 34'), mail(`loc1.${S}@exemple.test`)] }, AUTEUR)).id;
    const l2 = ok(await creerPersonne('locataire', { nom: `LOC2${S}`, coordonnees: [] }, AUTEUR)).id;
    ok(await ajouterOccupant(lot, l1, '2026-01-01', AUTEUR));
    ok(await ajouterOccupant(lot, l2, '2026-01-01', AUTEUR));
    expect(await archiverPersonne('locataire', l1, true, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_DERNIERE_COMPLETE_SUPPRESSION });
    ok(await archiverPersonne('locataire', l2, true, AUTEUR));
  });

  it('⑤ créations de la Location : aucune carte client complète → refus ; une seule complète → acceptée', async () => {
    const base = { enGestion: false, numeroMandatTransaction: 'MT itest' };
    expect(await creerProprietaires({ ...base, cartes: [{ nom: `SANS${S}`, coordonnees: [tel('06 35 35 35 35')] }] }, AUTEUR))
      .toEqual({ etat: 'refus', motif: MOTIF_PREMIERE_CARTE });
    const ids = ok(await creerProprietaires({ ...base, cartes: [
      { nom: `AVEC${S}`, coordonnees: [tel('06 36 36 36 36'), mail(`avec.${S}@exemple.test`)] }, { nom: `SECOND${S}`, coordonnees: [] }] }, AUTEUR)).ids;
    expect(ids).toHaveLength(2);
    expect(await creerLocatairesSurBien({ cartes: [{ nom: `LOCSANS${S}`, coordonnees: [mail(`locsans.${S}@exemple.test`)] }], existants: [], contacts: [], lotId: lot, entree: null }, AUTEUR))
      .toEqual({ etat: 'refus', motif: MOTIF_PREMIERE_CARTE });
    // Une fiche existante COMPLÈTE retenue suffit à la famille.
    const existant = ok(await creerPersonne('locataire', { nom: `EXIST${S}`, coordonnees: [tel('06 37 37 37 37'), mail(`exist.${S}@exemple.test`)] }, AUTEUR)).id;
    expect((await creerLocatairesSurBien({ cartes: [{ nom: `LOCSANS2${S}`, coordonnees: [] }], existants: [existant], contacts: [], lotId: lot, entree: null }, AUTEUR)).etat).toBe('ok');
  });
});
