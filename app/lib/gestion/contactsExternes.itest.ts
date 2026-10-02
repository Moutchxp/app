/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LA PREUVE SUR UNE VRAIE BASE, JETABLE ════════════════════════════════════════
 *
 * Demande d'Arno (02/10/2026) : « Base jetable pour les scénarios d'intégration, comme PREUVE-SUIVI-CONVERSATION.
 * Base réelle en lecture seule hors application de la migration ; empreinte avant/après. »
 *
 * ═══ 🔴🔴 CE FICHIER NE TOURNE JAMAIS SUR LA BASE RÉELLE ════════════════════════════════════════════════════════
 *
 * Il ÉCRIT (c'est tout son objet) et il refuse de démarrer si `DATABASE_URL` ne désigne pas une base de test. Le
 * garde est la PREMIÈRE chose qu'il fait, avant toute requête : une protection qui s'exécuterait après la
 * première écriture ne protégerait rien.
 *
 *   createdb svav_test_contacts && for f in db/migrations/*.sql; do psql -q svav_test_contacts -f $f; done
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_contacts \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/contactsExternes.itest.ts
 *
 * ⚠️ `.itest.ts` : `npm test` ne le ramasse pas (voir `vitest.config.ts`), et c'est voulu — il demande une base.
 *
 * ═══ CE QU'IL ÉPROUVE, ET DANS QUEL VOCABULAIRE ═════════════════════════════════════════════════════════════════
 *
 * Une INTERVENTION est une ligne de `gestion_rattachement` sous la règle `intervention` : « ce mail, rattaché au
 * logement X, concerne aussi cette personne, qui était <rôle> le jour du mail ». C'est cette table que tout le
 * reste de l'application lit — et donc la seule preuve qui vaille.
 *
 * 🔴 ET IL JOUE LES TROIS ESSAIS D'INTRUSION DE LA MIGRATION 293 (C-12 à C-14). La leçon de la 291 : le verbe
 * d'une contrainte se lit juste, et seule la tentative RÉELLE montre qu'il ne tient pas.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { query, closePool } from '../db/client';
import {
  adressesDesFiches, contexteEtape2, enregistrerContactExterne, interventionsDeLaFiche,
  interventionsDesMessages, lireContactExterne, memoireDuFil, personnesDesBiens, poserInterventions,
  retirerInterventionsSansBien, rolesALaDateDesMails, typesAProposer,
} from './contactExterneRepo';
import { poserClassement } from './periodeRepo';
import { changerStatut, rattacher } from './rattachementRepo';
import { ordonnerEtape2, REGLE_INTERVENTION } from './contactExterne';
import type { PersonneClassee } from './periodesConversation';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE GARDE : CETTE ÉPREUVE ÉCRIT, ELLE NE DOIT TOUCHER QU'UNE BASE JETABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const URL_BASE = process.env.DATABASE_URL ?? '';
const NOM_BASE = URL_BASE.split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) {
  throw new Error(
    `contactsExternes.itest : refus de tourner sur « ${NOM_BASE || '(aucune base)'} ». `
    + 'Cette épreuve ÉCRIT : elle exige une base dont le nom commence par « svav_test ».',
  );
}

const AUTEUR = { id: null, libelle: 'épreuve des contacts externes' };

/** Les décors fictifs. Aucun ne ressemble à un vrai lot, à une vraie personne ni à une vraie adresse. */
const LOT_A = 'CE-LOT-A';
const LOT_B = 'CE-LOT-B';
const PROP = 'CE-PROP-1';
/** ⚠️ L'identité d'un locataire est sa `cle_personne` (« nom#email »), jamais son `wippimmo_id`. */
const OCCUPANT = 'ce occupant#occupant@exemple.test';
const SORTANT = 'ce sortant#sortant@exemple.test';
const AVOCAT = 'avocat@cabinet.test';

let idLotA = 0;
let idLotB = 0;
let idProp = 0;
let idOccupant = 0;
let idSortant = 0;

/** Une conversation fictive, et ses messages DANS L'ORDRE DE LECTURE, avec leurs dates et leur expéditeur. */
async function conversation(
  mails: readonly { le: string; de: string; sens?: 'recu' | 'envoye'; objet?: string }[],
): Promise<{ filId: number; ids: number[] }> {
  const cle = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows: f } = await query<{ id: string }>(
    "INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer') RETURNING id::text", [cle]);
  const filId = Number(f[0].id);
  const ids: number[] = [];
  let i = 0;
  for (const m of mails) {
    i += 1;
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6) RETURNING id::text`,
      [filId, `${cle}-${i}`, m.sens ?? 'recu', m.de, `${m.le}T09:00:00Z`, m.objet ?? `Mail fictif ${i}`]);
    ids.push(Number(rows[0].id));
  }
  return { filId, ids };
}

/** Les interventions VIVANTES d'un mail, lues en base : (sorte, clé, rôle). C'est la seule preuve qui vaille. */
async function interventions(messageId: number): Promise<{ cle: string; role: string; motif: string }[]> {
  const { rows } = await query<{ cible_cle: string; role_instantane: string; motif: string | null }>(
    `SELECT cible_cle, role_instantane, motif FROM gestion_rattachement
      WHERE message_id = $1 AND regle = $2 AND statut IN ('propose', 'confirme') AND piece_id IS NULL
      ORDER BY cible_sorte, cible_cle`, [messageId, REGLE_INTERVENTION]);
  return rows.map((r) => ({ cle: r.cible_cle, role: r.role_instantane, motif: r.motif ?? '' }));
}

/** Les biens VIVANTS d'un mail. */
async function biens(messageId: number): Promise<string[]> {
  const { rows } = await query<{ cible_cle: string }>(
    `SELECT cible_cle FROM gestion_rattachement
      WHERE message_id = $1 AND cible_sorte = 'lot' AND statut = 'confirme' AND piece_id IS NULL
      ORDER BY cible_cle`, [messageId]);
  return rows.map((r) => r.cible_cle);
}

const bien = (cle: string) => ({ cle, libelle: `Bien fictif ${cle}` });
const personne = (sorte: 'proprietaire' | 'locataire', cle: string, libelle: string): PersonneClassee =>
  ({ sorte, cle, libelle });

beforeAll(async () => {
  // ── LE PROPRIÉTAIRE, SES DEUX LOTS, SES DEUX LOCATAIRES ───────────────────────────────────────────────────────
  const { rows: pr } = await query<{ id: string }>(
    `INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise, civilite)
     VALUES ($1, 'PROPRIO FICTIF', 'PROPRIO FICTIF Jean', 'proprio fictif jean', 'M.')
     ON CONFLICT (wippimmo_id) DO UPDATE SET nom = excluded.nom RETURNING id::text`, [PROP]);
  idProp = Number(pr[0].id);

  for (const [cle, voie] of [[LOT_A, '1 rue Fictive A'], [LOT_B, '2 rue Fictive B']] as const) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_annuaire_lot
         (wippimmo_id, adresse, code_postal, commune, nature, type_bien, proprietaire_texte, proprietaire_id)
       VALUES ($1, $2, '92000', 'VILLE-TEST', 'Appartement', 'Type 2', 'PROPRIO FICTIF Jean', $3)
       ON CONFLICT (wippimmo_id) DO UPDATE SET proprietaire_id = excluded.proprietaire_id
       RETURNING id::text`, [cle, voie, idProp]);
    if (cle === LOT_A) idLotA = Number(rows[0].id); else idLotB = Number(rows[0].id);
  }

  const poserLocataire = async (cle: string, nom: string): Promise<number> => {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise, civilite)
       VALUES ($1, $2, $3, $4, 'M.')
       ON CONFLICT (cle_personne) DO UPDATE SET nom = excluded.nom RETURNING id::text`,
      [cle, cle.slice(0, 12), nom, nom.toLowerCase()]);
    return Number(rows[0].id);
  };
  idOccupant = await poserLocataire(OCCUPANT, 'OCCUPANT Fictif');
  idSortant = await poserLocataire(SORTANT, 'SORTANT Fictif');

  /**
   * 🔴 LES DEUX OCCUPATIONS DU LOT A, ET ELLES SE SUIVENT :
   *   · SORTANT  : 01/01/2021 → 31/12/2023 ;
   *   · OCCUPANT : 01/02/2024 → (en cours).
   * C'est tout ce qu'il faut pour éprouver « le statut à la date du mail » dans les deux sens.
   */
  await query(
    `INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie)
     VALUES ($1, $2, $3, $4, '2021-01-01', '2023-12-31')
     ON CONFLICT (wippimmo_id) DO UPDATE SET sortie = excluded.sortie`,
    [`${LOT_A}-occ-sortant`, idSortant, idLotA, LOT_A]);
  await query(
    `INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie)
     VALUES ($1, $2, $3, $4, '2024-02-01', NULL)
     ON CONFLICT (wippimmo_id) DO UPDATE SET sortie = excluded.sortie`,
    [`${LOT_A}-occ-occupant`, idOccupant, idLotA, LOT_A]);

  // ── LES ADRESSES CONNUES DES FICHES : celle du propriétaire, celle de CHAQUE locataire (sortant compris) ──────
  const poserContact = async (sujet: string, sujetId: number, valeur: string): Promise<void> => {
    await query(
      `INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute, rang, origine)
       VALUES ($1, $2, 'email', $3, $3, 0, 'import')`, [sujet, sujetId, valeur]);
  };
  await query("DELETE FROM gestion_annuaire_contact WHERE valeur LIKE '%@exemple.test'");
  await poserContact('proprietaire', idProp, 'proprio@exemple.test');
  await poserContact('locataire', idOccupant, 'occupant@exemple.test');
  await poserContact('locataire', idSortant, 'sortant@exemple.test');
});

afterAll(async () => { await closePool(); });

/**
 * Chaque scénario part d'une base propre : on ne veut pas qu'un essai en explique un autre.
 *
 * ⚠️ LES RATTACHEMENTS SONT EFFACÉS AUSSI, et ce n'est pas un détail : sans cela, la fiche d'une personne cumule
 * les interventions de tous les scénarios précédents, et `interventionsDeLaFiche` rend 2 là où l'on en attend 1.
 * (Défaut trouvé à la première exécution de ce fichier.) On ne le fait QUE parce que la base est jetable — le
 * module, lui, ne supprime JAMAIS un rattachement.
 */
beforeEach(async () => {
  await query('DELETE FROM gestion_rattachement');
  await query('DELETE FROM gestion_message_exception_personne');
  await query('DELETE FROM gestion_message_exception_bien');
  await query('DELETE FROM gestion_message_exception');
  await query('DELETE FROM gestion_fil_periode_personne');
  await query('DELETE FROM gestion_fil_periode_bien');
  await query('DELETE FROM gestion_fil_periode');
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-1 — L'EXPÉDITEUR CONNU N'OUVRE AUCUNE ÉTAPE ; L'INCONNU L'OUVRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-1 — expéditeur connu → pas d’étape 2 · inconnu → étape 2', () => {
  it('🔴 le locataire OCCUPANT écrit lui-même : rien de nouveau', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'occupant@exemple.test' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.requise).toBe(false);
    expect(r?.motif).toBe('expediteur_connu');
  });

  it('🔴🔴 LE LOCATAIRE SORTI DEPUIS 2023 N’EST PAS UN INCONNU — « historique complet, sans limite »', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'sortant@exemple.test' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.motif).toBe('expediteur_connu');
  });

  it('🔴 le PROPRIÉTAIRE écrit : connu lui aussi', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'proprio@exemple.test' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.motif).toBe('expediteur_connu');
  });

  it('🔴🔴 UN AVOCAT INCONNU : l’étape 2 est demandée, avec les personnes du bien', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.requise).toBe(true);
    expect(r?.expediteur).toBe(AVOCAT);
    expect(r?.biens).toHaveLength(1);
    const noms = (r?.biens[0].personnes ?? []).map((p) => p.cle);
    expect(noms).toContain(PROP);
    expect(noms).toContain(OCCUPANT);
    expect(noms).toContain(SORTANT);
  });

  it('🔴 CONNU SUR *UN* DES BIENS COCHÉS SUFFIT (le lot B n’a aucune personne)', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'occupant@exemple.test' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A, LOT_B], interne: false, horsGestion: false,
    });
    expect(r?.motif).toBe('expediteur_connu');
  });

  it('🔴 une de NOS adresses → pas d’étape 2', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'a.jorel@sansvisavis.com' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.motif).toBe('adresse_interne');
    const r2 = await contexteEtape2({
      messageId: (await conversation([{ le: '2026-03-10', de: 'gestion@criterimmo.fr' }])).ids[0],
      biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r2?.motif).toBe('adresse_interne');
  });

  it('🔴🔴 NOTRE BOÎTE GMAIL DE GESTION est des nôtres → pas d’étape 2 (décision d’Arno du 02/10/2026)', async () => {
    /**
     * 🔴 LE DÉFAUT QUE CE SCÉNARIO FERME, mesuré sur la base réelle : `gestion.criterimmo@gmail.com` n'était
     * connue que de `documentsAutoRepo.NOS_ADRESSES`, une recopie — pas de la liste centrale. 940 mails de notre
     * propre boîte attendaient donc dans la file « À rattacher » comme s'ils venaient d'un inconnu.
     *
     * ⚠️ ON ÉPROUVE LE CHEMIN DU DÉPÔT, pas seulement le module pur : c'est lui qui compose les « autres »
     * adresses (gestion, partenaires) et appelle `estAdresseInterne`. Le module pur est éprouvé à part
     * (`adressesInternesPartout.test.ts`), sur les cinq voies à la fois.
     */
    const { ids } = await conversation([{ le: '2026-03-10', de: 'gestion.criterimmo@gmail.com' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.motif).toBe('adresse_interne');
    expect(r?.requise).toBe(false);
  });

  it('⚠️ et « gmail.com » reste EXTÉRIEUR : un vrai client chez le même fournisseur ouvre l’étape 2', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: 'locataire.dupont@gmail.com' }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.requise).toBe(true);
  });

  it('🔴🔴 un « Document CRITERIMMO » que NOUS envoyons → pas d’étape 2', async () => {
    const { ids } = await conversation([{
      le: '2026-03-10', de: 'gestion@criterimmo.fr', sens: 'envoye',
      objet: 'Document CRITERIMMO - Quittance Mars 2026 OCCUPANT Fictif',
    }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    /**
     * ⚠️ `envoye` EST LE PREMIER REFUS DE LA LISTE D'ARNO, et c'est bien celui qu'on attend : un document est
     * d'abord un mail que NOUS envoyons. Le refus « document » sert aux rares documents reçus en retour.
     */
    expect(r?.requise).toBe(false);
    expect(r?.motif).toBe('envoye');
  });

  it('🔴 « Interne » et « Hors gestion » → pas d’étape 2', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    expect((await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: true, horsGestion: false,
    }))?.motif).toBe('interne');
    expect((await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: true,
    }))?.motif).toBe('hors_gestion');
  });

  it('🔴 « Valider — aucun bien » → pas d’étape 2', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    expect((await contexteEtape2({
      messageId: ids[0], biensCoches: [], interne: false, horsGestion: false,
    }))?.motif).toBe('aucun_bien');
  });

  it('🔴 les adresses connues d’un bien portent TOUTES les cartes, sortants compris', async () => {
    const connues = await adressesDesFiches([LOT_A]);
    expect(connues.has('proprio@exemple.test')).toBe(true);
    expect(connues.has('occupant@exemple.test')).toBe(true);
    expect(connues.has('sortant@exemple.test')).toBe(true);
    expect(connues.has(AVOCAT)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-2 — LE STATUT EST CELUI DE LA DATE DU MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-2 — un mail ancien voit les statuts de son époque', () => {
  it('🔴🔴 mail de 2022 : SORTANT est « occupant », OCCUPANT est « à venir »', async () => {
    const { ids } = await conversation([{ le: '2022-06-15', de: AVOCAT }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    const par = new Map((r?.biens[0].personnes ?? []).map((p) => [p.cle, p.role]));
    expect(par.get(SORTANT)).toBe('locataire_occupant');
    expect(par.get(OCCUPANT)).toBe('locataire_a_venir');
    expect(par.get(PROP)).toBe('proprietaire');
  });

  it('🔴 mail de 2026 : les rôles se sont inversés — c’est bien la DATE qui décide', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const r = await contexteEtape2({
      messageId: ids[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    const par = new Map((r?.biens[0].personnes ?? []).map((p) => [p.cle, p.role]));
    expect(par.get(SORTANT)).toBe('locataire_sortant');
    expect(par.get(OCCUPANT)).toBe('locataire_occupant');
  });

  it('🔴 l’ordre d’Arno : le propriétaire actif, l’occupant, puis le sortant — le reste se déplie', async () => {
    const liste = await personnesDesBiens([LOT_A], '2026-03-10');
    const { visibles, repliees } = ordonnerEtape2(liste[0].personnes);
    expect(visibles.map((p) => p.cle)).toEqual([PROP, OCCUPANT, SORTANT]);
    expect(repliees).toHaveLength(0);
  });

  it('🔴 le rôle se calcule sur les occupations DU BIEN du classement, pas de tous les biens', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    // Le lot B n'a AUCUNE occupation : l'occupant du lot A n'y est pas « occupant ».
    const roles = await rolesALaDateDesMails([{
      messageId: ids[0], dateMail: '2026-03-10', biens: [LOT_B],
      personnes: [{ sorte: 'locataire', cle: OCCUPANT }],
    }]);
    expect([...roles.values()]).toEqual(['locataire_a_venir']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-3 — CE QUE PRODUIT LA VALIDATION : LE BIEN, *PLUS* LES PERSONNES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-3 — les relations s’AJOUTENT au lien du bien, elles ne le remplacent pas', () => {
  it('🔴 « Le bien uniquement » : le bien est rattaché, et AUCUNE personne ne l’est', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const r = await poserClassement({
      filId, messageId: ids[0], classement: { sorte: 'biens', biens: [bien(LOT_A)] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    expect(await biens(ids[0])).toEqual([LOT_A]);
    expect(await interventions(ids[0])).toEqual([]);
  });

  it('🔴🔴 une personne cochée : le bien EST TOUJOURS LÀ, et l’intervention en plus', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(await biens(ids[0])).toEqual([LOT_A]);
    const itv = await interventions(ids[0]);
    expect(itv).toHaveLength(1);
    expect(itv[0].cle).toBe(OCCUPANT);
    expect(itv[0].role).toBe('locataire_occupant');
  });

  it('🔴 plusieurs personnes, propriétaire ET locataire (cas 4 d’Arno)', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [
          personne('proprietaire', PROP, 'PROPRIO FICTIF Jean'),
          personne('locataire', SORTANT, 'SORTANT Fictif'),
        ],
      },
      choix: 'suite', auteur: AUTEUR,
    });
    const itv = await interventions(ids[0]);
    expect(itv.map((x) => x.cle).sort()).toEqual([SORTANT, PROP].sort());
    expect(new Map(itv.map((x) => [x.cle, x.role])).get(PROP)).toBe('proprietaire');
    expect(new Map(itv.map((x) => [x.cle, x.role])).get(SORTANT)).toBe('locataire_sortant');
  });

  it('🔴 la fiche de la personne les RETROUVE, avec le bien du mail à côté', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT, objet: 'Contestation' }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'suite', auteur: AUTEUR,
    });
    const liste = await interventionsDeLaFiche('locataire', OCCUPANT);
    expect(liste).toHaveLength(1);
    expect(liste[0].objet).toBe('Contestation');
    expect(liste[0].role).toBe('locataire_occupant');
    // 🔴 LE BIEN EST JOINT : une intervention ne vit jamais sans lui, et la ligne le PROUVE.
    expect(liste[0].biens.map((b) => b.cle)).toEqual([LOT_A]);
  });

  it('🔴 « via Me Martin, avocat » se compose depuis le contact mémorisé', async () => {
    const c = await enregistrerContactExterne({
      email: AVOCAT, nom: 'Me Martin', telephone: '01 45 00 00 00', type: 'avocat', auteur: AUTEUR,
    });
    expect(c.ok).toBe(true);
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await rattacher({ messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR });
    await poserInterventions({
      messageId: ids[0],
      personnes: [{
        sorte: 'locataire', cle: OCCUPANT, libelle: 'OCCUPANT Fictif', role: 'locataire_occupant',
        contactExterneId: c.ok ? c.id : null,
      }],
      contact: { email: AVOCAT, nom: 'Me Martin', telephone: null, type: 'avocat' },
      auteur: AUTEUR,
    });
    const liste = await interventionsDeLaFiche('locataire', OCCUPANT);
    expect(liste[0].via).toBe('via Me Martin, avocat');
    // Et la mention est lisible depuis le MAIL aussi (« Vie du bien »).
    const parMail = await interventionsDesMessages([ids[0]]);
    expect(parMail.get(ids[0])?.[0].via).toBe('via Me Martin, avocat');
    // 🔴 LE MOTIF DU LIEN SE RELIT SANS REJOUER LE MOTEUR.
    expect((await interventions(ids[0]))[0].motif).toContain('Me Martin');
  });

  it('⚠️ un contact mémorisé n’est JAMAIS ajouté à une fiche de l’annuaire', async () => {
    await enregistrerContactExterne({ email: AVOCAT, nom: 'Me Martin', auteur: AUTEUR });
    const { rows: p } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_annuaire_proprietaire WHERE nom_complet ILIKE $1', ['%Martin%']);
    const { rows: l } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_annuaire_locataire WHERE nom ILIKE $1', ['%Martin%']);
    const { rows: c } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_annuaire_contact WHERE valeur = $1', [AVOCAT]);
    expect(p[0].n).toBe(0);
    expect(l[0].n).toBe(0);
    expect(c[0].n).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-4 — L'INSTANTANÉ NE CHANGE JAMAIS, MÊME QUAND LE LOCATAIRE PART
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-4 — le rôle est une PHOTO : il ne bouge plus après le départ', () => {
  it('🔴🔴 posé « occupant », il reste « occupant » après qu’on ait daté la sortie', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'mail', auteur: AUTEUR,
    });
    expect((await interventions(ids[0]))[0].role).toBe('locataire_occupant');

    // ── LE LOCATAIRE PART : on date sa sortie, comme le ferait un ré-import WIPPIMMO ──────────────────────────
    await query(
      "UPDATE gestion_annuaire_occupation SET sortie = '2026-04-30' WHERE wippimmo_id = $1",
      [`${LOT_A}-occ-occupant`]);
    try {
      // 🔴 LE LIEN DÉJÀ POSÉ NE BOUGE PAS. On relit la base, pas un calcul.
      expect((await interventions(ids[0]))[0].role).toBe('locataire_occupant');
      expect((await interventionsDeLaFiche('locataire', OCCUPANT))[0].role).toBe('locataire_occupant');
      // ⚠️ ET UN MAIL **NOUVEAU** DE LA MÊME PERSONNE, LUI, VERRAIT « sortant » : la photo d'hier n'empêche pas
      //    de photographier aujourd'hui.
      const { ids: tard } = await conversation([{ le: '2026-09-01', de: AVOCAT }]);
      const r = await contexteEtape2({
        messageId: tard[0], biensCoches: [LOT_A], interne: false, horsGestion: false,
      });
      expect(new Map((r?.biens[0].personnes ?? []).map((p) => [p.cle, p.role])).get(OCCUPANT))
        .toBe('locataire_sortant');
    } finally {
      // ⚠️ ON REMET LE DÉCOR : les scénarios suivants comptent sur l'occupation en cours.
      await query(
        'UPDATE gestion_annuaire_occupation SET sortie = NULL WHERE wippimmo_id = $1',
        [`${LOT_A}-occ-occupant`]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-5 — LE SUIVI : « AUTOMATIQUE » FAIT HÉRITER, « PONCTUEL » NE FAIT RIEN HÉRITER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-5 — suivi automatique : les mails suivants héritent, rôle RECALCULÉ', () => {
  it('🔴🔴 trois mails à trois dates : chacun porte le rôle de SA date', async () => {
    /**
     * La conversation couvre le changement de locataire :
     *   · mail 1 au 15/06/2022 — SORTANT est alors occupant ;
     *   · mail 2 au 10/03/2026 — SORTANT est sortant ;
     *   · mail 3 au 01/09/2026 — idem.
     * La fenêtre est posée sur le PREMIER, et porte SORTANT.
     */
    const { filId, ids } = await conversation([
      { le: '2022-06-15', de: AVOCAT }, { le: '2026-03-10', de: AVOCAT }, { le: '2026-09-01', de: AVOCAT },
    ]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', SORTANT, 'SORTANT Fictif')],
      },
      choix: 'suite', auteur: AUTEUR,
    });

    // ① LES TROIS MAILS SONT RATTACHÉS AU BIEN (c'est la fenêtre qui projette, comme avant ce lot).
    for (const id of ids) expect(await biens(id)).toEqual([LOT_A]);
    // ② ET LES TROIS PORTENT L'INTERVENTION — avec le rôle de LEUR date.
    expect((await interventions(ids[0]))[0].role).toBe('locataire_occupant');
    expect((await interventions(ids[1]))[0].role).toBe('locataire_sortant');
    expect((await interventions(ids[2]))[0].role).toBe('locataire_sortant');
  });

  it('🔴 décocher toutes les personnes d’une fenêtre RETIRE ce qu’elle avait posé', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }, { le: '2026-03-11', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'suite', auteur: AUTEUR,
    });
    expect(await interventions(ids[1])).toHaveLength(1);

    // Une seconde fenêtre, sans personne : « Toute la conversation » remplace la première.
    await poserClassement({
      filId, messageId: ids[0], classement: { sorte: 'biens', biens: [bien(LOT_A)] },
      choix: 'conversation', auteur: AUTEUR,
    });
    expect(await interventions(ids[1])).toHaveLength(0);
    // 🔴 RIEN N'EST SUPPRIMÉ : le lien est RETIRÉ, daté et signé.
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_rattachement
        WHERE message_id = $1 AND regle = $2 AND statut = 'retire' AND statut_le IS NOT NULL`,
      [ids[1], REGLE_INTERVENTION]);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('🔴🔴 UNE FENÊTRE NE RETIRE PAS UNE INTERVENTION POSÉE À LA MAIN (le S11 des personnes)', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }, { le: '2026-03-11', de: AVOCAT }]);
    // Une fenêtre sans personne, sur toute la conversation.
    await poserClassement({
      filId, messageId: ids[0], classement: { sorte: 'biens', biens: [bien(LOT_A)] },
      choix: 'suite', auteur: AUTEUR,
    });
    // Puis QUELQU'UN coche une personne sur le SECOND mail, à la main.
    const pose = await poserInterventions({
      messageId: ids[1],
      personnes: [{
        sorte: 'locataire', cle: OCCUPANT, libelle: 'OCCUPANT Fictif', role: 'locataire_occupant',
      }],
      contact: null, auteur: AUTEUR,
    });
    expect(pose.ok).toBe(true);
    // Une nouvelle projection de la fenêtre (elle ne veut aucune personne) NE DOIT PAS l'effacer.
    await poserClassement({
      filId, messageId: ids[0], classement: { sorte: 'biens', biens: [bien(LOT_A)] },
      choix: 'suite', auteur: AUTEUR,
    });
    expect((await interventions(ids[1])).map((x) => x.cle)).toEqual([OCCUPANT]);
  });
});

describe('🔴🔴 C-6 — classement ponctuel : le mail suivant reste à classer', () => {
  it('🔴🔴 l’exception ne se propage pas, et le mail suivant ne porte RIEN', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }, { le: '2026-03-11', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      // 🔴 « Classement ponctuel » = le choix `mail` du mécanisme existant : une EXCEPTION.
      choix: 'mail', auteur: AUTEUR,
    });
    expect(await biens(ids[0])).toEqual([LOT_A]);
    expect(await interventions(ids[0])).toHaveLength(1);
    // Le mail suivant : ni bien, ni intervention. Il reste « À classer ».
    expect(await biens(ids[1])).toEqual([]);
    expect(await interventions(ids[1])).toEqual([]);
  });

  it('🔴 au mail suivant, la DERNIÈRE CONFIGURATION est proposée d’avance', async () => {
    const { filId, ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }, { le: '2026-03-11', de: AVOCAT }]);
    await poserClassement({
      filId, messageId: ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'mail', auteur: AUTEUR,
    });
    const r = await contexteEtape2({
      messageId: ids[1], biensCoches: [LOT_A], interne: false, horsGestion: false,
    });
    expect(r?.requise).toBe(true);
    // 🔴 LES DEUX CHOIX DE SUIVI NE S'AFFICHENT PLUS : ce n'est plus le premier classement de ce contact.
    expect(r?.premierClassement).toBe(false);
    expect(r?.precoche?.personnes).toEqual([`locataire:${OCCUPANT}`]);
    expect(r?.precoche?.suivi).toBe('ponctuel');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-7 — LA MÉMOIRE EST CELLE DE LA CONVERSATION, JAMAIS CELLE DE L'ADRESSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-7 — le même avocat, deux biens, deux conversations : deux mémoires', () => {
  it('🔴🔴 la seconde conversation ne sait RIEN de la première', async () => {
    const un = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const deux = await conversation([{ le: '2026-03-12', de: AVOCAT }]);

    await poserClassement({
      filId: un.filId, messageId: un.ids[0],
      classement: {
        sorte: 'biens', biens: [bien(LOT_A)],
        personnes: [personne('locataire', OCCUPANT, 'OCCUPANT Fictif')],
      },
      choix: 'suite', auteur: AUTEUR,
    });

    // 🔴 LA SECONDE CONVERSATION : premier classement de ce contact CHEZ ELLE, donc les deux choix s'affichent.
    const r = await contexteEtape2({
      messageId: deux.ids[0], biensCoches: [LOT_B], interne: false, horsGestion: false,
    });
    expect(r?.requise).toBe(true);
    expect(r?.premierClassement).toBe(true);
    expect(r?.precoche).toBeNull();

    // Et la première garde la sienne.
    const m = await memoireDuFil(un.filId, 0);
    expect(m.premierClassement).toBe(false);
  });

  it('🔴 un même contact intervient pour PLUSIEURS biens, sans se dédoubler', async () => {
    const c1 = await enregistrerContactExterne({ email: AVOCAT, nom: 'Me Martin', auteur: AUTEUR });
    const c2 = await enregistrerContactExterne({ email: AVOCAT, type: 'avocat', auteur: AUTEUR });
    expect(c1.ok && c2.ok && c1.id === c2.id).toBe(true);
    // ⚠️ ET LE SECOND APPEL N'A PAS EFFACÉ LE NOM AVEC DU VIDE.
    const { rows } = await query<{ nom: string | null; type: string | null }>(
      'SELECT nom, type FROM gestion_contact_externe WHERE email = $1', [AVOCAT]);
    expect(rows[0].nom).toBe('Me Martin');
    expect(rows[0].type).toBe('avocat');
  });

  it('⚠️ l’adresse est stockée en MINUSCULES, et la base l’exige', async () => {
    const r = await enregistrerContactExterne({ email: '  AVOCAT@Cabinet.TEST ', auteur: AUTEUR });
    expect(r.ok).toBe(true);
    const { rows } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_contact_externe WHERE email = $1', [AVOCAT]);
    expect(rows[0].n).toBe(1);
    await expect(query(
      `INSERT INTO gestion_contact_externe (email, cree_par_libelle) VALUES ('MAJUSCULE@X.TEST', 'essai')`,
    )).rejects.toThrow();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-8 — LES TROIS ESSAIS D'INTRUSION DE LA MIGRATION 293
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   LA LEÇON DE LA 291 : son verrou se LISAIT juste, et un essai d'intrusion est PASSÉ — parce qu'avec `regle` à
   NULL la comparaison rendait NULL, et qu'une contrainte CHECK accepte ce qu'elle ne sait pas réfuter. Ces trois
   essais sont donc des TESTS, et non une recommandation en commentaire.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-8 — la base REFUSE ce qu’elle doit refuser', () => {
  it('🔴🔴 ① une intervention sur un mail SANS lien vivant vers un bien est REFUSÉE', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await expect(query(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, origine, regle, statut, cree_par_libelle, role_instantane)
       VALUES ($1, 'proprietaire', 'ESSAI-293', 'manuel', 'intervention', 'confirme', 'essai', 'proprietaire')`,
      [ids[0]],
    )).rejects.toThrow(/ne se pose pas sans le bien/);
  });

  it('🔴🔴 ② la porte de service est fermée : insérer en « retire » puis passer en « confirme »', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, origine, regle, statut, statut_le, cree_par_libelle)
       VALUES ($1, 'proprietaire', 'ESSAI-293-B', 'manuel', 'intervention', 'retire', now(), 'essai')
       RETURNING id::text`, [ids[0]]);
    await expect(query(
      "UPDATE gestion_rattachement SET statut = 'confirme' WHERE id = $1", [Number(rows[0].id)],
    )).rejects.toThrow(/ne se pose pas sans le bien/);
  });

  it('🔴🔴 ③ LE PIÈGE EXACT DE LA 291 : un lien vivant vers une fiche SANS règle est REFUSÉ', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    // Le mail A un bien : ce n'est donc PAS le trigger qui refuse, c'est bien la contrainte `coalesce`.
    await rattacher({ messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR });
    await expect(query(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, origine, statut, cree_par_libelle)
       VALUES ($1, 'proprietaire', 'ESSAI-293-NULL', 'manuel', 'confirme', 'essai')`,
      [ids[0]],
    )).rejects.toThrow(/cible_bien/);
  });

  it('🔴 et l’essai qui doit PASSER : une intervention sur un mail qui A son bien', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await rattacher({ messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR });
    const r = await poserInterventions({
      messageId: ids[0],
      personnes: [{
        sorte: 'locataire', cle: OCCUPANT, libelle: 'OCCUPANT Fictif', role: 'locataire_occupant',
      }],
      contact: null, auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    expect(await interventions(ids[0])).toHaveLength(1);
  });

  it('⚠️ un rôle instantané hors liste est REFUSÉ par la base', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    await rattacher({ messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR });
    await expect(query(
      `INSERT INTO gestion_rattachement
         (message_id, cible_sorte, cible_cle, origine, regle, statut, cree_par_libelle, role_instantane)
       VALUES ($1, 'locataire', $2, 'manuel', 'intervention', 'confirme', 'essai', 'locataire_en_place')`,
      [ids[0], OCCUPANT],
    )).rejects.toThrow(/role_instantane/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-9 — LA CASCADE : UNE INTERVENTION NE SURVIT PAS AU DÉPART DE SON BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-9 — retirer le bien retire l’intervention, datée et signée', () => {
  it('🔴🔴 « Retirer » le lien du bien emporte l’intervention (chemin manuel)', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const lien = await rattacher({
      messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR,
    });
    expect(lien.ok).toBe(true);
    await poserInterventions({
      messageId: ids[0],
      personnes: [{
        sorte: 'locataire', cle: OCCUPANT, libelle: 'OCCUPANT Fictif', role: 'locataire_occupant',
      }],
      contact: null, auteur: AUTEUR,
    });
    expect(await interventions(ids[0])).toHaveLength(1);

    await changerStatut({ lienId: lien.ok ? lien.id : 0, statut: 'retire', auteur: AUTEUR });
    expect(await biens(ids[0])).toEqual([]);
    // 🔴 L'INTERVENTION A SUIVI, et elle est RETIRÉE — jamais supprimée.
    expect(await interventions(ids[0])).toEqual([]);
    const { rows } = await query<{ motif: string | null }>(
      `SELECT statut_motif AS motif FROM gestion_rattachement
        WHERE message_id = $1 AND regle = $2 AND statut = 'retire'`, [ids[0], REGLE_INTERVENTION]);
    expect(rows[0].motif).toContain('n’est plus rattaché à aucun bien');
  });

  it('🔴 un SECOND bien encore vivant garde l’intervention', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    const a = await rattacher({
      messageId: ids[0], cible: { sorte: 'lot', cle: LOT_A, id: null }, auteur: AUTEUR,
    });
    await rattacher({ messageId: ids[0], cible: { sorte: 'lot', cle: LOT_B, id: null }, auteur: AUTEUR });
    await poserInterventions({
      messageId: ids[0],
      personnes: [{
        sorte: 'locataire', cle: OCCUPANT, libelle: 'OCCUPANT Fictif', role: 'locataire_occupant',
      }],
      contact: null, auteur: AUTEUR,
    });
    await changerStatut({ lienId: a.ok ? a.id : 0, statut: 'retire', auteur: AUTEUR });
    expect(await biens(ids[0])).toEqual([LOT_B]);
    expect(await interventions(ids[0])).toHaveLength(1);
  });

  it('⚠️ la cascade est idempotente et muette quand il n’y a rien à faire', async () => {
    const { ids } = await conversation([{ le: '2026-03-10', de: AVOCAT }]);
    expect(await retirerInterventionsSansBien(ids, AUTEUR)).toBe(0);
    expect(await retirerInterventionsSansBien([], AUTEUR)).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C-10 — LE TYPE ÉCRIT À LA MAIN (migration 294)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Les deux essais écrits au pied de la migration 294, joués ici sur une base jetable. La leçon de la 291 : une
   contrainte se LIT juste, et seule la tentative réelle montre ce qu'elle laisse passer.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C-10 — « Personnaliser… » : la base accepte un type libre, et refuse ce qui dériverait', () => {
  it('🔴 un type écrit à la main est enregistré TEL QUEL', async () => {
    const r = await enregistrerContactExterne({
      email: 'huissier@etude.test', nom: 'SCP Durand', type: 'huissier de justice', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    const c = await lireContactExterne('huissier@etude.test');
    expect(c?.type).toBe('huissier de justice');
  });

  it('🔴 il est NORMALISÉ avant d’arriver en base : casse et blancs ne font pas deux types', async () => {
    await enregistrerContactExterne({
      email: 'expert2@cabinet.test', type: '  DIAGNOSTIQUEUR   Amiante ', auteur: AUTEUR,
    });
    expect((await lireContactExterne('expert2@cabinet.test'))?.type).toBe('diagnostiqueur amiante');
  });

  it('🔴🔴 et la BASE refuse ce que le dépôt aurait laissé passer (essai d’intrusion de la 294)', async () => {
    // Une majuscule : sinon « Syndic » et « syndic » feraient deux types dans la liste des prochaines fois.
    await expect(query(
      `INSERT INTO gestion_contact_externe (email, type, cree_par_libelle)
       VALUES ('essai294@exemple.test', 'Huissier', 'essai')`,
    )).rejects.toThrow(/type_chk/);
    // Un blanc de bord, et une chaîne vide : deux formes qui ne disent rien.
    await expect(query(
      `INSERT INTO gestion_contact_externe (email, type, cree_par_libelle)
       VALUES ('essai294b@exemple.test', ' huissier', 'essai')`,
    )).rejects.toThrow(/type_chk/);
    await expect(query(
      `INSERT INTO gestion_contact_externe (email, type, cree_par_libelle)
       VALUES ('essai294c@exemple.test', '', 'essai')`,
    )).rejects.toThrow(/type_chk/);
  });

  it('🔴 « Diagnostiqueur » passe désormais, ce que la contrainte de la 293 refusait', async () => {
    const r = await enregistrerContactExterne({
      email: 'diag@cabinet.test', type: 'diagnostiqueur', auteur: AUTEUR,
    });
    expect(r.ok).toBe(true);
    expect((await lireContactExterne('diag@cabinet.test'))?.type).toBe('diagnostiqueur');
  });

  it('🔴🔴 un type écrit à la main REVIENT dans la liste proposée la fois suivante', async () => {
    await enregistrerContactExterne({ email: 'h2@etude.test', type: 'huissier de justice', auteur: AUTEUR });
    const { liste, libre } = await typesAProposer();
    expect(libre).toBe(true);
    expect(liste).toContain('huissier de justice');
    // ⚠️ ET LES NEUF DE DÉPART SONT TOUJOURS EN TÊTE, dans l'ordre d'Arno.
    expect(liste.slice(0, 9)).toEqual([
      'avocat', 'garant', 'artisan', 'diagnostiqueur', 'syndic', 'expert', 'assurance', 'notaire', 'autre',
    ]);
  });
});
