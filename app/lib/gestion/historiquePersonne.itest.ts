/**
 * ══ 🔴🔴 LOT HISTORIQUE-PERSONNE (Arno, 14/10/2026) — LES ÉCHANGES D'UNE FICHE PROPRIÉTAIRE OU LOCATAIRE, SUR UNE BASE
 * D'ESSAI ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * « TOUS les mails échangés entre CE propriétaire et nous, et eux seuls : les mails qu'il nous a envoyés ; nos mails qui
 * lui sont adressés (À, Cc, Cci), réponses comprises. La personne est reconnue par toutes les adresses de sa fiche (et des
 * personnes de la même fiche : couple, indivision). » Même chose pour le locataire (actuel et ancien).
 *
 * 🔴 BASE « svav_test… » SEULEMENT (garde ci-dessous). Aucun mail n'est envoyé : tout est écrit à la main.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_taches \
 *     npx vitest run --config vitest.integration.config.ts app/lib/gestion/historiquePersonne.itest.ts
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { query, closePool } from '../db/client';
import { etendreCible, pageHistorique, enteteHistorique, mailsDeLaFrise, porteursDePieces } from './historiqueRepo';
import { FILTRES_VIDES } from './historique';
import { cibleLocataire, cibleProprietaire, cibleLot } from './rattachement';

const NOM_BASE = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '';
if (!/^svav_test/.test(NOM_BASE)) throw new Error(`historiquePersonne.itest : refus de tourner sur « ${NOM_BASE} ».`);

const S = `hp${Date.now()}`;
const ids: Record<string, number> = {};
let n = 0;
async function un(sql: string, p: unknown[]): Promise<number> {
  const { rows } = await query<{ id: string }>(`${sql} RETURNING id::text`, p);
  return Number(rows[0].id);
}
/** Un mail : sens, expéditeur, destinataires (À / Cc), Cci (colonne), et ses lignes d'adresses. */
async function mail(o: { sens: 'recu' | 'envoye'; de: string; a?: string[]; cc?: string[]; cci?: string[]; jour: string }): Promise<number> {
  n += 1;
  const fil = await un("INSERT INTO gestion_fil (cle, etat) VALUES ($1, 'a_classer')", [`${S}-fil-${n}`]);
  const id = await un(
    `INSERT INTO gestion_message (fil_id, message_id, sens, de_adresse, recu_le, objet, dest_cci)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)`,
    [fil, `${S}-m-${n}`, o.sens, o.de, `${o.jour}T09:00:00Z`, `Mail ${n}`,
      JSON.stringify((o.cci ?? []).map((adresse) => ({ nom: null, adresse })))]);
  const ligne = async (adresse: string, role: string) => query(
    'INSERT INTO gestion_message_adresse (message_id, adresse, role) VALUES ($1, $2, $3)', [id, adresse, role]);
  await ligne(o.de, 'expediteur');
  for (const a of o.a ?? []) await ligne(a, 'destinataire');
  for (const a of o.cc ?? []) await ligne(a, 'copie');
  return id;
}

beforeAll(async () => {
  // Deux propriétaires d'un même bien (couple ajouté à la main), chacun avec son adresse.
  ids.p1 = await un(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise)
    VALUES ($1, 'MARTIN', 'MARTIN Paul', 'martin paul')`, [`${S}-P1`]);
  ids.p2 = await un(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise)
    VALUES ($1, 'MARTIN', 'MARTIN Claire', 'martin claire')`, [`${S}-P2`]);
  ids.lot = await un(`INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_texte, proprietaire_id)
    VALUES ($1, 'MARTIN Paul', $2)`, [`${S}-L1`, ids.p1]);
  await query(`INSERT INTO gestion_annuaire_lot_proprietaire (lot_id, proprietaire_id, rang) VALUES ($1, $2, 1)`, [ids.lot, ids.p2]);
  const contact = (sujet: string, id: number, valeur: string, absent = false) => query(
    `INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute${absent ? ', absent_le' : ''})
     VALUES ($1, $2, 'email', $3, $3${absent ? ', now()' : ''})`, [sujet, id, valeur]);
  await contact('proprietaire', ids.p1, `paul.${S}@exemple.test`);
  await contact('proprietaire', ids.p2, `claire.${S}@exemple.test`);
  await contact('proprietaire', ids.p1, `ancienne.${S}@exemple.test`, true);
  // Un locataire en place, un ancien.
  ids.l1 = await un(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise)
    VALUES ($1, $1, 'DURAND Léa', 'durand lea')`, [`${S}-T1`]);
  ids.l2 = await un(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise)
    VALUES ($1, $1, 'PETIT Jean', 'petit jean')`, [`${S}-T2`]);
  await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_wippimmo_id, lot_id, entree)
    VALUES ($1, $2, $3, $4, '2025-01-01')`, [`${S}-O1`, ids.l1, `${S}-L1`, ids.lot]);
  await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_wippimmo_id, lot_id, entree, sortie)
    VALUES ($1, $2, $3, $4, '2020-01-01', '2024-12-31')`, [`${S}-O2`, ids.l2, `${S}-L1`, ids.lot]);
  await contact('locataire', ids.l1, `lea.${S}@exemple.test`);
  await contact('locataire', ids.l2, `jean.${S}@exemple.test`);

  const nous = 'gestion@exemple.test';
  const paul = `paul.${S}@exemple.test`; const claire = `claire.${S}@exemple.test`;
  ids.recuPaul = await mail({ sens: 'recu', de: paul, a: [nous], jour: '2026-01-02' });
  ids.envoyeClaire = await mail({ sens: 'envoye', de: nous, a: [claire], jour: '2026-01-05' });
  ids.envoyeCcPaul = await mail({ sens: 'envoye', de: nous, a: ['tiers@exemple.test'], cc: [paul], jour: '2026-01-07' });
  ids.envoyeCciClaire = await mail({ sens: 'envoye', de: nous, a: ['tiers@exemple.test'], cci: [claire], jour: '2026-01-09' });
  ids.tiersCcPaul = await mail({ sens: 'recu', de: 'tiers@exemple.test', a: [nous], cc: [paul], jour: '2026-01-11' });
  ids.envoyeAutre = await mail({ sens: 'envoye', de: nous, a: ['autre@exemple.test'], jour: '2026-01-12' });
  ids.recuAncienne = await mail({ sens: 'recu', de: `ancienne.${S}@exemple.test`, a: [nous], jour: '2026-01-13' });
  ids.recuLea = await mail({ sens: 'recu', de: `lea.${S}@exemple.test`, a: [nous], jour: '2026-02-01' });
  ids.envoyeJean = await mail({ sens: 'envoye', de: nous, a: [`jean.${S}@exemple.test`], jour: '2023-06-01' });
});
afterAll(async () => { await closePool(); });

const echanges = { ...FILTRES_VIDES, echanges: true };
async function mailsDe(c: Parameters<typeof etendreCible>[0], f = echanges): Promise<number[]> {
  const e = await etendreCible(c, f);
  if (e.etat !== 'ok') throw new Error(e.etat);
  return (await pageHistorique(e.data, f)).lignes.map((l) => Number(l.messageId));
}

describe('🔴🔴 fiche PROPRIÉTAIRE — les échanges avec ses personnes, et eux seuls', () => {
  it('reçus de lui, nos mails à lui (À, Cc, Cci) ; jamais un tiers où il n’est qu’en copie, ni une adresse retirée', async () => {
    const m = await mailsDe(cibleProprietaire(`${S}-P1`));
    expect(new Set(m)).toEqual(new Set([ids.recuPaul, ids.envoyeClaire, ids.envoyeCcPaul, ids.envoyeCciClaire]));
  });
  it('🔴 les personnes de la même fiche (couple ajouté à la main) comptent : Claire y est, depuis la fiche de Paul', async () => {
    const m = await mailsDe(cibleProprietaire(`${S}-P1`));
    expect(m).toContain(ids.envoyeClaire);
  });
  it('ordre par défaut : du plus récent au plus ancien', async () => {
    const m = await mailsDe(cibleProprietaire(`${S}-P1`));
    expect(m).toEqual([ids.envoyeCciClaire, ids.envoyeCcPaul, ids.envoyeClaire, ids.recuPaul]);
  });
  it('les filtres de la barre s’appliquent (dates, recherche)', async () => {
    const f = { ...echanges, du: '2026-01-06', au: '2026-01-08' };
    expect(await mailsDe(cibleProprietaire(`${S}-P1`), f)).toEqual([ids.envoyeCcPaul]);
    const e = await etendreCible(cibleProprietaire(`${S}-P1`), echanges);
    if (e.etat !== 'ok') throw new Error('x');
    expect((await enteteHistorique(e.data, echanges)).total.nbMails).toBe(4);
  });
  it('sans « echanges », la sélection d’avant est intacte (union des logements, aucun mail ici)', async () => {
    expect(await mailsDe(cibleProprietaire(`${S}-P1`), { ...FILTRES_VIDES })).toEqual([]);
  });
});

describe('🔴🔴 fiche LOCATAIRE — actuel et ancien', () => {
  it('locataire en place : ses mails, et eux seuls', async () => {
    expect(await mailsDe(cibleLocataire(`${S}-T1`))).toEqual([ids.recuLea]);
  });
  it('ancien locataire : nos mails à lui, sans borne de date', async () => {
    expect(await mailsDe(cibleLocataire(`${S}-T2`))).toEqual([ids.envoyeJean]);
  });
  it('les occupations restent dites (ligne « logements occupés »)', async () => {
    const e = await etendreCible(cibleLocataire(`${S}-T2`), echanges);
    if (e.etat !== 'ok') throw new Error('x');
    expect(e.data.occupations.map((o) => [o.cle, o.depuis, o.jusqua])).toEqual([[`${S}-L1`, '2020-01-01', '2024-12-31']]);
  });
});

describe('l’historique d’un bien est intact', () => {
  it('un lot ignore « echanges » : même sélection qu’avant (par rattachement)', async () => {
    expect(await mailsDe(cibleLot(`${S}-L1`))).toEqual(await mailsDe(cibleLot(`${S}-L1`), { ...FILTRES_VIDES }));
  });
});

/* ══ 🔴🔴 LOT HISTORIQUE-PERSONNE-CLASSEMENT (Arno, 14/10/2026) — « À classer » / « Classés », frise, période ══════════ */
describe('🔴🔴 classement : À classer / Classés, combiné à la période ; couleurs de la frise', () => {
  const C: Record<string, number> = {};
  const bob = () => `bob.${S}@exemple.test`;
  beforeAll(async () => {
    C.p = await un(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise)
      VALUES ($1, 'BOB', 'BOB Pierre', 'bob pierre')`, [`${S}-P9`]);
    await query(`INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute)
      VALUES ('proprietaire', $1, 'email', $2, $2)`, [C.p, bob()]);
    const nous = 'gestion@exemple.test';
    C.aClasser = await mail({ sens: 'recu', de: bob(), a: [nous], jour: '2026-03-01' });
    C.rattache = await mail({ sens: 'recu', de: bob(), a: [nous], jour: '2026-03-02' });
    C.horsGestion = await mail({ sens: 'envoye', de: nous, a: [bob()], jour: '2026-03-03' });
    C.interneMail = await mail({ sens: 'envoye', de: nous, a: [bob()], jour: '2026-03-04' });
    C.interneEchange = await mail({ sens: 'recu', de: bob(), a: [nous], jour: '2026-03-05' });
    C.interneRetire = await mail({ sens: 'recu', de: bob(), a: [nous], jour: '2026-03-06' });
    const fil = async (id: number) => Number((await query<{ f: string }>('SELECT fil_id::text AS f FROM gestion_message WHERE id = $1', [id])).rows[0].f);
    await query(`INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, cible_libelle, origine, statut, cree_par_libelle)
      VALUES ($1, 'lot', $2, 'Bien fictif', 'manuel', 'confirme', 'épreuve')`, [C.rattache, `${S}-L1`]);
    await query(`INSERT INTO gestion_hors_gestion (message_id, pose_par_libelle) VALUES ($1, 'épreuve')`, [C.horsGestion]);
    await query(`INSERT INTO gestion_message_interne (message_id, pose_par_libelle) VALUES ($1, 'épreuve')`, [C.interneMail]);
    await query(`INSERT INTO gestion_fil_interne (fil_id, pose_par_libelle) VALUES ($1, 'épreuve')`, [await fil(C.interneEchange)]);
    // Marque d'échange, mais la marque DU MAIL a été retirée : la règle du repli dit « pas interne ».
    await query(`INSERT INTO gestion_fil_interne (fil_id, pose_par_libelle) VALUES ($1, 'épreuve')`, [await fil(C.interneRetire)]);
    await query(`INSERT INTO gestion_message_interne (message_id, pose_par_libelle, retire_le, retire_par_libelle)
      VALUES ($1, 'épreuve', now(), 'épreuve')`, [C.interneRetire]);
  });
  const cible = () => cibleProprietaire(`${S}-P9`);
  it('« À classer » : ni bien, ni Hors gestion, ni Interne (marque du mail retirée ⇒ pas interne)', async () => {
    expect(new Set(await mailsDe(cible(), { ...echanges, classement: 'a_classer' }))).toEqual(new Set([C.aClasser, C.interneRetire]));
  });
  it('« Classés » : tout le reste — rattaché, Hors gestion, Interne (mail ou échange)', async () => {
    expect(new Set(await mailsDe(cible(), { ...echanges, classement: 'classes' })))
      .toEqual(new Set([C.rattache, C.horsGestion, C.interneMail, C.interneEchange]));
  });
  it('combiné à la période : le compteur, la frise et les pièces suivent', async () => {
    const f = { ...echanges, classement: 'classes' as const, du: '2026-03-03', au: '2026-03-04' };
    expect(new Set(await mailsDe(cible(), f))).toEqual(new Set([C.horsGestion, C.interneMail]));
    const e = await etendreCible(cible(), f);
    if (e.etat !== 'ok') throw new Error('x');
    expect((await enteteHistorique(e.data, f)).filtre.nbMails).toBe(2);
    expect((await mailsDeLaFrise(e.data, f)).mails.map((m) => m.messageId).sort()).toEqual([C.horsGestion, C.interneMail].sort());
    expect((await porteursDePieces(e.data, f)).messages).toEqual([]);
  });
  it('🔴 frise : chaque mail dit s’il est à classer (rouge) ou classé (vert)', async () => {
    const e = await etendreCible(cible(), echanges);
    if (e.etat !== 'ok') throw new Error('x');
    const parId = new Map((await mailsDeLaFrise(e.data, echanges)).mails.map((m) => [m.messageId, m.aClasser]));
    expect(parId.get(C.aClasser)).toBe(true);
    expect(parId.get(C.interneRetire)).toBe(true);
    expect(parId.get(C.rattache)).toBe(false);
    expect(parId.get(C.interneEchange)).toBe(false);
  });
  it('la capsule d’une fiche de personne dit « Interne » ; celle d’un bien n’est pas touchée', async () => {
    const e = await etendreCible(cible(), echanges);
    if (e.etat !== 'ok') throw new Error('x');
    const statut = new Map((await pageHistorique(e.data, echanges)).lignes.map((l) => [Number(l.messageId), l.statut]));
    expect(statut.get(C.interneMail)).toBe('interne');
    expect(statut.get(C.aClasser)).toBe('a_classer');
    expect(statut.get(C.rattache)).toBe('classe');
    // Bien : la frise ne porte pas la couleur de classement (couleurs par famille, inchangées).
    const lot = await etendreCible(cibleLot(`${S}-L1`), { ...FILTRES_VIDES });
    if (lot.etat !== 'ok') throw new Error('x');
    expect((await mailsDeLaFrise(lot.data, { ...FILTRES_VIDES })).mails.every((m) => m.aClasser === undefined)).toBe(true);
  });
});
