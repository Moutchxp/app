import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { normaliserTexte } from '../gestion/annuaire';
import { annulerTache } from '../gestion/tachesRepo';
import { synchroniserApresGeste } from '../gestion/agendaSynchroRepo';
import { enregistrerPreavisAvecMails } from './mailsPreavisSortieRepo';
import { annulerPreavis } from './preavisRepo';
import { avecPerimetreTest, type PerimetreTest } from './perimetreTest';
import { testDisponible } from './preavisTestSonde';
export { oublierSondeTest, sqlHorsTest, testDisponible } from './preavisTestSonde';
import { ADRESSE_TEST, COMMUNE_TEST, CP_TEST, NOM_LOCATAIRE_TEST, PRENOM_LOCATAIRE_TEST, PROPRIETAIRE_TEXTE_TEST, MOTIF_SANS_473 } from './preavisTest';

/**
 * ══ 🔴🔴 LE PRÉAVIS DE TEST, EN BASE (Arno, 14/11/2026, migration 473) ═════════════════════════════════════════════════════════════════════
 * Réservé aux ADMINISTRATEURS (la route le vérifie en base). Un test = un bien FICTIF (« location seule », aucun propriétaire, aucun dossier
 * Drive : rien n'est écrit dans le Drive), un locataire FICTIF dont l'unique e-mail est l'adresse du compte créateur, son occupation, et le
 * préavis — enregistré DANS le périmètre du test (ses mails ne partent qu'au créateur, cf. `perimetreTest.ts`).
 * La table 473 désigne ce qui est « du test » ; tout le reste de l'application l'exclut de ses compteurs, alertes, listes et analyses.
 * « Supprimer » : préavis annulé, tâches annulées (l'agenda du créateur suit), test MASQUÉ partout — rien n'est effacé.
 */
// 🔴 Arno (19/11/2026) — le périmètre d'un geste vit dans `perimetreDuGeste.ts` (SANS `server-only` : la synchronisation d'agenda, lancée aussi
// par un script, le lit) ; repris ici à l'identique pour les appelants d'avant.
export { perimetreDuGeste, testsDe, type IssuePerimetre } from './perimetreDuGeste';
import { versPerimetre, type LigneTest } from './perimetreDuGeste';

/** Les lots des préavis de test (masqués compris) — pour exclure, côté application, ce que le SQL ne filtre pas. */
export async function lotsDeTest(): Promise<Map<number, { testId: number; createurId: number; supprime: boolean }>> {
  if (!(await testDisponible())) return new Map();
  const { rows } = await query<{ id: string; lot_id: string; createur_id: string; supprime_le: string | null }>(
    'SELECT id::text, lot_id::text, createur_id::text, supprime_le::text FROM gestion_location_preavis_test');
  return new Map(rows.map((r) => [Number(r.lot_id), { testId: Number(r.id), createurId: Number(r.createur_id), supprime: r.supprime_le !== null }]));
}

export type IssueTest<T> = { etat: 'ok'; data: T } | { etat: 'refus'; motif: string } | { etat: 'sans_schema'; motif: string } | { etat: 'inconnu' };

/**
 * CRÉE un préavis de test : bien, locataire (e-mail = l'adresse du compte, relue en base), occupation entrée il y a un an, inscription 473,
 * puis le préavis (reçu aujourd'hui, 1 mois) DANS le périmètre du test — ses mails ne partent qu'au créateur.
 */
export async function creerPreavisTest(auteur: Auteur, o: { envoyerMails?: boolean } = {}): Promise<IssueTest<{ testId: number; lotId: number; occupationId: number; preavis: unknown }>> {
  if (!(await testDisponible())) return { etat: 'sans_schema', motif: MOTIF_SANS_473 };
  if (auteur.id === null) return { etat: 'refus', motif: 'Un préavis de test se crée depuis un compte nommé.' };
  const { rows: compte } = await query<{ identifiant: string }>('SELECT identifiant FROM admin_utilisateur WHERE id = $1', [auteur.id]);
  const email = compte[0]?.identifiant?.trim() ?? '';
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { etat: 'refus', motif: 'Votre compte n’a pas d’adresse e-mail : impossible d’y recevoir les mails du test.' };
  const cree = await withTransaction(async (q) => {
    const cle = `app-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows: lot } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_texte, adresse, code_postal, commune, statut_bien, en_gestion)
       VALUES ($1, $2, $3, $4, $5, 'location_seule', false) RETURNING id::text`,
      [`${cle}-lot`, PROPRIETAIRE_TEXTE_TEST, ADRESSE_TEST, CP_TEST, COMMUNE_TEST]);
    const lotId = Number(lot[0].id);
    const { rows: loc } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, prenom, nom_normalise, rang)
       VALUES ($1, $1, $2, $3, $4, 0) RETURNING id::text`,
      [`${cle}-locataire`, NOM_LOCATAIRE_TEST, PRENOM_LOCATAIRE_TEST, normaliserTexte(NOM_LOCATAIRE_TEST)]);
    const locataireId = Number(loc[0].id);
    // 🔴 l'UNIQUE e-mail du locataire fictif : l'adresse du compte créateur
    await q(`INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute, rang, origine)
             VALUES ('locataire', $1, 'email', $2, $2, 0, 'saisie')`, [locataireId, email.toLowerCase()]);
    const { rows: occ } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree)
       VALUES ($1, $2, $3, $4, (now() AT TIME ZONE 'Europe/Paris')::date - 365) RETURNING id::text`,
      [`${cle}-occupation`, locataireId, lotId, `${cle}-lot`]);
    const occupationId = Number(occ[0].id);
    const { rows: t } = await q<{ id: string }>(
      `INSERT INTO gestion_location_preavis_test (lot_id, locataire_id, occupation_id, createur_id, createur_email)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::text`, [lotId, locataireId, occupationId, auteur.id, email.toLowerCase()]);
    return { testId: Number(t[0].id), lotId, occupationId, email: email.toLowerCase() };
  });
  const recuLe = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const preavis = await avecPerimetreTest({ testId: cree.testId, createurEmail: cree.email },
    () => enregistrerPreavisAvecMails({ occupationIds: [cree.occupationId], recuLe, choix: { mode: 'mois', duree: 1 }, motif: 'Préavis de test' },
      auteur, o.envoyerMails !== false, {}, false));
  return { etat: 'ok', data: { testId: cree.testId, lotId: cree.lotId, occupationId: cree.occupationId, preavis } };
}

/**
 * « SUPPRIMER CE PRÉAVIS DE TEST » : son préavis ouvert est annulé, ses tâches ouvertes (pré-visite, état des lieux) annulées — l'agenda du
 * créateur suit —, puis le test est MASQUÉ partout. Rien n'est effacé (verrous de l'historique intacts). Son créateur, ou un administrateur.
 */
export async function supprimerPreavisTest(testId: number, auteur: Auteur): Promise<IssueTest<{ testId: number; tachesAnnulees: number[] }>> {
  if (!(await testDisponible())) return { etat: 'sans_schema', motif: MOTIF_SANS_473 };
  const { rows } = await query<LigneTest>(
    `SELECT id::text, lot_id::text, occupation_id::text, locataire_id::text, createur_id::text, createur_email, supprime_le::text
       FROM gestion_location_preavis_test WHERE id = $1`, [testId]);
  const t = rows[0];
  if (t === undefined) return { etat: 'inconnu' };
  if (t.supprime_le !== null) return { etat: 'refus', motif: 'Ce préavis de test est déjà supprimé.' };
  return avecPerimetreTest(versPerimetre(t), async () => {
    const { rows: preavis } = await query<{ id: string }>(
      `SELECT p.id::text FROM gestion_location_preavis p JOIN gestion_annuaire_occupation o ON o.id = p.occupation_id
        WHERE o.lot_id = $1 AND p.remplace_le IS NULL AND p.annule_le IS NULL`, [Number(t.lot_id)]);
    for (const p of preavis) await annulerPreavis({ preavisId: Number(p.id) }, auteur);
    const { rows: taches } = await query<{ id: string }>(`SELECT id::text FROM gestion_tache WHERE lot_id = $1 AND etat = 'a_faire'`, [Number(t.lot_id)]);
    const annulees: number[] = [];
    for (const x of taches) {
      const r = await annulerTache(Number(x.id), auteur);
      if (r.ok) { annulees.push(Number(x.id)); await synchroniserApresGeste(Number(x.id)); }
    }
    await query('UPDATE gestion_location_preavis_test SET supprime_le = now(), supprime_par = $2 WHERE id = $1 AND supprime_le IS NULL', [testId, auteur.libelle]);
    return { etat: 'ok' as const, data: { testId, tachesAnnulees: annulees } };
  });
}
