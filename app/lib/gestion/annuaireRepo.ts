/**
 * MODULE « GESTION » — LOT ANNUAIRE-1 : L'ANNUAIRE EN BASE. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION. Sans la migration 253, chaque fonction rend
 * « pas disponible » et n'émet AUCUNE requête : nommer une table absente ferait échouer l'écran entier, pas
 * seulement l'annuaire.
 *
 * 🔴 RIEN N'EST JAMAIS EFFACÉ. Un propriétaire, un lot, un bail ou un contact qui disparaît d'un export suivant
 * reçoit une DATE (`absent_le`) ; sa ligne reste, avec tout son historique. Un export qui le ramène efface la date.
 * C'est la règle du module, et ici elle protège contre le pire : un export tronqué (une exportation interrompue,
 * un filtre oublié) effacerait sinon la moitié de l'annuaire sans un mot.
 *
 * 🔴 L'IMPORT EST IDEMPOTENT PAR CONSTRUCTION. Chaque table porte l'identifiant WIPPIMMO en clé UNIQUE, et chaque
 * écriture est un `INSERT … ON CONFLICT DO UPDATE`. Relancer l'import dix fois de suite laisse exactement le même
 * contenu, et le rapport le dit : tout en « inchangé ».
 *
 * 🔒 AUCUNE DE CES FONCTIONS N'ÉCRIT TANT QUE `appliquer` EST FAUX. Le mode « à blanc » parcourt les mêmes lignes,
 * compare aux mêmes lignes en base, et compte — sans un seul INSERT.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { annuaireDisponible } from './schema';
import type { ContactAnnuaire } from './annuaire';
import type { PlanImport } from './annuaireImport';
import type { TermeRecherche } from './annuaireRecherche';

// ══ ① L'ÉCRITURE ═══════════════════════════════════════════════════════════════════════════════════════════════════

export interface ComptesImport {
  proprietairesCrees: number; proprietairesMajs: number; proprietairesInchanges: number;
  lotsCrees: number; lotsMajs: number; lotsInchanges: number;
  locatairesCrees: number; locatairesMajs: number; locatairesInchanges: number;
  occupationsCreees: number; occupationsMajs: number; occupationsInchangees: number;
  contactsCrees: number; contactsRetires: number;
  disparus: number; revenus: number;
}

export const COMPTES_VIDES: ComptesImport = {
  proprietairesCrees: 0, proprietairesMajs: 0, proprietairesInchanges: 0,
  lotsCrees: 0, lotsMajs: 0, lotsInchanges: 0,
  locatairesCrees: 0, locatairesMajs: 0, locatairesInchanges: 0,
  occupationsCreees: 0, occupationsMajs: 0, occupationsInchangees: 0,
  contactsCrees: 0, contactsRetires: 0, disparus: 0, revenus: 0,
};

export type IssueImport =
  | { etat: 'ok'; comptes: ComptesImport; importId: number | null }
  | { etat: 'sans_schema' };

/** Ce qu'une ligne existante porte, pour décider « mis à jour » ou « inchangé » sans réécrire pour rien. */
type Empreinte = Record<string, string | null>;

const memeEmpreinte = (a: Empreinte, b: Empreinte): boolean =>
  Object.keys(a).every((k) => (a[k] ?? '') === (b[k] ?? ''));

/**
 * ÉCRIT (ou SIMULE) UN PLAN D'IMPORT.
 *
 * ⚠️ TOUT EN UNE TRANSACTION. Un import à moitié posé — les propriétaires oui, les lots non — laisserait un
 * annuaire dont chaque lot serait orphelin, sans que rien ne le signale. Ou tout, ou rien.
 *
 * 🔴 L'ORDRE EST IMPOSÉ PAR LES CLÉS ÉTRANGÈRES : propriétaires, puis lots (qui les citent), puis locataires, puis
 * occupations (qui citent les deux). Les contacts en dernier, quand les sujets ont un identifiant.
 */
export async function appliquerPlan(plan: PlanImport, options: {
  appliquer: boolean; dossier: string; auteur?: string;
}): Promise<IssueImport> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };

  return withTransaction(async (q) => {
    const importId = await ouvrirPasse(q, options);
    const c: ComptesImport = { ...COMPTES_VIDES };

    const proprietaires = await ecrireProprietaires(q, plan, options.appliquer, c);
    const idsLots = await ecrireLots(q, plan, proprietaires.parCle, options.appliquer, c);
    const idsLocataires = await ecrireLocataires(q, plan, options.appliquer, c);
    await ecrireOccupations(q, plan, idsLocataires, idsLots, options.appliquer, c);
    await ecrireContacts(q, plan, proprietaires.parId, idsLocataires, options.appliquer, c);
    await marquerDisparus(q, plan, options.appliquer, c);

    await cloreLaPasse(q, importId, plan, c, options.appliquer);
    // 🔴 LA SIMULATION NE LAISSE RIEN. On a parcouru, comparé et compté dans la transaction ; on la défait.
    //   Un `ROLLBACK` explicite serait un second chemin à tenir : lever ici fait exactement la même chose, et
    //   `withTransaction` s'en charge. On rattrape l'exception juste au-dessus.
    if (!options.appliquer) throw new AnnuleSimulation(c);
    return { etat: 'ok' as const, comptes: c, importId };
  }).catch((e: unknown) => {
    if (e instanceof AnnuleSimulation) return { etat: 'ok' as const, comptes: e.comptes, importId: null };
    throw e;
  });
}

/** Le signal qui défait la transaction d'une simulation. Ce n'est PAS une erreur : c'est le mode « à blanc ». */
class AnnuleSimulation extends Error {
  constructor(readonly comptes: ComptesImport) { super('simulation'); }
}

async function ouvrirPasse(q: RequeteTx, o: { appliquer: boolean; dossier: string; auteur?: string }): Promise<number> {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO gestion_annuaire_import (mode, dossier, auteur_libelle) VALUES ($1, $2, $3) RETURNING id`,
    [o.appliquer ? 'applique' : 'simulation', o.dossier, o.auteur ?? 'automatique']);
  return Number(rows[0].id);
}

async function cloreLaPasse(
  q: RequeteTx, importId: number, plan: PlanImport, c: ComptesImport, appliquer: boolean,
): Promise<void> {
  const rejets = plan.rejets.map((r) => `${r.source} l.${r.ligne} — ${r.motif}`).join('\n');
  const homonymes = plan.homonymes
    .map((h) => `${h.nom} : identifiants WIPPIMMO ${h.wippimmoIds.join(', ')} (${h.lotsEnAttente} lot(s) en attente)`)
    .join('\n');
  await q(
    `UPDATE gestion_annuaire_import SET termine_le = now(), resultat = 'ok',
       proprietaires_crees = $2, proprietaires_majs = $3, proprietaires_inchanges = $4,
       lots_crees = $5, lots_majs = $6, lots_inchanges = $7,
       locataires_crees = $8, locataires_majs = $9, locataires_inchanges = $10,
       occupations_creees = $11, occupations_majs = $12, occupations_inchangees = $13,
       contacts_crees = $14, contacts_retires = $15,
       rejets = $16, rejets_detail = $17, homonymes = $18, homonymes_detail = $19,
       disparus = $20, revenus = $21
     WHERE id = $1`,
    [importId, c.proprietairesCrees, c.proprietairesMajs, c.proprietairesInchanges,
      c.lotsCrees, c.lotsMajs, c.lotsInchanges,
      c.locatairesCrees, c.locatairesMajs, c.locatairesInchanges,
      c.occupationsCreees, c.occupationsMajs, c.occupationsInchangees,
      c.contactsCrees, c.contactsRetires,
      plan.rejets.length, rejets === '' ? null : rejets,
      plan.homonymes.length, homonymes === '' ? null : homonymes,
      c.disparus, c.revenus]);

  if (appliquer) {
    // Un import est un GESTE : il laisse une ligne dans le journal du module, comme une relève ou un envoi.
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
       VALUES ('annuaire', $1, 'import', $2, 'automatique')`,
      [importId,
        `annuaire WIPPIMMO importé : ${c.proprietairesCrees + c.proprietairesMajs} propriétaire(s), `
        + `${c.lotsCrees + c.lotsMajs} lot(s), ${c.occupationsCreees + c.occupationsMajs} bail/baux touchés ; `
        + `${plan.rejets.length} rejet(s), ${plan.homonymes.length} homonyme(s), ${c.disparus} disparu(s).`]);
  }
}

/**
 * DEUX INDEX SORTENT D'ICI, ET CE N'EST PAS UNE COMMODITÉ.
 *   · `parId` (identifiant WIPPIMMO → id) sert aux CONTACTS : chaque bailleur a les siens ;
 *   · `parCle` (nom normalisé → id) sert aux LOTS, qui ne connaissent leur propriétaire que par son NOM.
 *
 * 🔴 UN NOM PORTÉ PAR DEUX BAILLEURS N'ENTRE PAS DANS `parCle`. Avec un seul index par nom, le second bailleur
 * écrasait le premier — et les contacts de l'un seraient partis chez l'autre, en silence. C'est exactement le
 * genre d'erreur qu'un annuaire ne doit pas pouvoir commettre : on téléphonerait à un inconnu.
 */
async function ecrireProprietaires(
  q: RequeteTx, plan: PlanImport, appliquer: boolean, c: ComptesImport,
): Promise<{ parId: Map<string, number>; parCle: Map<string, number> }> {
  const { rows } = await q<{ id: string; wippimmo_id: string } & Empreinte>(
    `SELECT id, wippimmo_id, civilite, nom, prenom, nom_complet, nom_normalise, adresse, commune, code_postal,
            adresse_normalisee, relation_depuis::text, absent_le::text
       FROM gestion_annuaire_proprietaire`);
  const existants = new Map(rows.map((r) => [r.wippimmo_id, r]));
  const parId = new Map<string, number>();
  const parCle = new Map<string, number>();

  // Les noms portés par PLUSIEURS bailleurs, comptés ici même : ils n'entreront jamais dans l'index par nom.
  const combien = new Map<string, number>();
  for (const p of plan.proprietaires) combien.set(p.nomNormalise, (combien.get(p.nomNormalise) ?? 0) + 1);

  /** Retient l'identifiant sous ses deux index — et n'indexe par NOM que les noms portés par un seul bailleur. */
  const retenir = (p: { wippimmoId: string; nomNormalise: string }, id: number): void => {
    parId.set(p.wippimmoId, id);
    if ((combien.get(p.nomNormalise) ?? 0) === 1) parCle.set(p.nomNormalise, id);
  };

  for (const p of plan.proprietaires) {
    const avant = existants.get(p.wippimmoId);
    const apres: Empreinte = {
      civilite: p.civilite, nom: p.nom, prenom: p.prenom, nom_complet: p.nomComplet,
      nom_normalise: p.nomNormalise, adresse: p.adresse, commune: p.commune, code_postal: p.codePostal,
      adresse_normalisee: p.adresseNormalisee, relation_depuis: p.relationDepuis,
      // Un propriétaire présent dans CET export n'est plus absent : la date doit repartir à NULL.
      absent_le: null,
    };
    if (avant === undefined) c.proprietairesCrees += 1;
    else if (memeEmpreinte(apres, avant)) { c.proprietairesInchanges += 1; retenir(p, Number(avant.id)); continue; }
    else { c.proprietairesMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer) { if (avant !== undefined) retenir(p, Number(avant.id)); continue; }
    const { rows: r } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_proprietaire
         (wippimmo_id, civilite, nom, prenom, nom_complet, nom_normalise, adresse, commune, code_postal,
          adresse_normalisee, relation_depuis, absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,NULL,now())
       ON CONFLICT (wippimmo_id) DO UPDATE SET
         civilite = EXCLUDED.civilite, nom = EXCLUDED.nom, prenom = EXCLUDED.prenom,
         nom_complet = EXCLUDED.nom_complet, nom_normalise = EXCLUDED.nom_normalise,
         adresse = EXCLUDED.adresse, commune = EXCLUDED.commune, code_postal = EXCLUDED.code_postal,
         adresse_normalisee = EXCLUDED.adresse_normalisee, relation_depuis = EXCLUDED.relation_depuis,
         absent_le = NULL, importe_le = now()
       RETURNING id`,
      [p.wippimmoId, p.civilite, p.nom, p.prenom, p.nomComplet, p.nomNormalise, p.adresse, p.commune,
        p.codePostal, p.adresseNormalisee, p.relationDepuis]);
    retenir(p, Number(r[0].id));
  }
  return { parId, parCle };
}

async function ecrireLots(
  q: RequeteTx, plan: PlanImport, idsProprietaires: ReadonlyMap<string, number>, appliquer: boolean, c: ComptesImport,
): Promise<Map<string, number>> {
  const { rows } = await q<{ id: string; wippimmo_id: string } & Empreinte>(
    `SELECT id, wippimmo_id, proprietaire_id::text, proprietaire_texte, immeuble, nature, type_bien, adresse,
            commune, code_postal, adresse_normalisee, gestion_debut::text, gestion_fin::text, absent_le::text
       FROM gestion_annuaire_lot`);
  const existants = new Map(rows.map((r) => [r.wippimmo_id, r]));
  const ids = new Map<string, number>();

  for (const l of plan.lots) {
    const proprietaireId = l.proprietaireCle === null ? null : idsProprietaires.get(l.proprietaireCle) ?? null;
    const avant = existants.get(l.wippimmoId);
    const apres: Empreinte = {
      proprietaire_id: proprietaireId === null ? null : String(proprietaireId),
      proprietaire_texte: l.proprietaireTexte, immeuble: l.immeuble, nature: l.nature, type_bien: l.typeBien,
      adresse: l.adresse, commune: l.commune, code_postal: l.codePostal, adresse_normalisee: l.adresseNormalisee,
      gestion_debut: l.gestionDebut, gestion_fin: l.gestionFin, absent_le: null,
    };
    if (avant === undefined) c.lotsCrees += 1;
    else if (memeEmpreinte(apres, avant)) { c.lotsInchanges += 1; ids.set(l.wippimmoId, Number(avant.id)); continue; }
    else { c.lotsMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer) { if (avant !== undefined) ids.set(l.wippimmoId, Number(avant.id)); continue; }
    const { rows: r } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_lot
         (wippimmo_id, proprietaire_id, proprietaire_texte, immeuble, nature, type_bien, adresse, commune,
          code_postal, adresse_normalisee, gestion_debut, gestion_fin, absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date,NULL,now())
       ON CONFLICT (wippimmo_id) DO UPDATE SET
         proprietaire_id = EXCLUDED.proprietaire_id, proprietaire_texte = EXCLUDED.proprietaire_texte,
         immeuble = EXCLUDED.immeuble, nature = EXCLUDED.nature, type_bien = EXCLUDED.type_bien,
         adresse = EXCLUDED.adresse, commune = EXCLUDED.commune, code_postal = EXCLUDED.code_postal,
         adresse_normalisee = EXCLUDED.adresse_normalisee, gestion_debut = EXCLUDED.gestion_debut,
         gestion_fin = EXCLUDED.gestion_fin, absent_le = NULL, importe_le = now()
       RETURNING id`,
      [l.wippimmoId, proprietaireId, l.proprietaireTexte, l.immeuble, l.nature, l.typeBien, l.adresse,
        l.commune, l.codePostal, l.adresseNormalisee, l.gestionDebut, l.gestionFin]);
    ids.set(l.wippimmoId, Number(r[0].id));
  }
  return ids;
}

async function ecrireLocataires(
  q: RequeteTx, plan: PlanImport, appliquer: boolean, c: ComptesImport,
): Promise<Map<string, number>> {
  const { rows } = await q<{ id: string; cle_personne: string } & Empreinte>(
    `SELECT id, cle_personne, wippimmo_id, nom, nom_normalise, adresse, commune, code_postal,
            adresse_normalisee, absent_le::text
       FROM gestion_annuaire_locataire`);
  const existants = new Map(rows.map((r) => [r.cle_personne, r]));
  const ids = new Map<string, number>();

  for (const p of plan.locataires) {
    const avant = existants.get(p.clePersonne);
    const apres: Empreinte = {
      wippimmo_id: p.wippimmoId, nom: p.nom, nom_normalise: p.nomNormalise, adresse: p.adresse,
      commune: p.commune, code_postal: p.codePostal, adresse_normalisee: p.adresseNormalisee, absent_le: null,
    };
    if (avant === undefined) c.locatairesCrees += 1;
    else if (memeEmpreinte(apres, avant)) { c.locatairesInchanges += 1; ids.set(p.clePersonne, Number(avant.id)); continue; }
    else { c.locatairesMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer) { if (avant !== undefined) ids.set(p.clePersonne, Number(avant.id)); continue; }
    const { rows: r } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire
         (cle_personne, wippimmo_id, nom, nom_normalise, adresse, commune, code_postal, adresse_normalisee,
          absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,now())
       ON CONFLICT (cle_personne) DO UPDATE SET
         wippimmo_id = EXCLUDED.wippimmo_id, nom = EXCLUDED.nom, nom_normalise = EXCLUDED.nom_normalise,
         adresse = EXCLUDED.adresse, commune = EXCLUDED.commune, code_postal = EXCLUDED.code_postal,
         adresse_normalisee = EXCLUDED.adresse_normalisee, absent_le = NULL, importe_le = now()
       RETURNING id`,
      [p.clePersonne, p.wippimmoId, p.nom, p.nomNormalise, p.adresse, p.commune, p.codePostal, p.adresseNormalisee]);
    ids.set(p.clePersonne, Number(r[0].id));
  }
  return ids;
}

async function ecrireOccupations(
  q: RequeteTx, plan: PlanImport, idsLocataires: ReadonlyMap<string, number>,
  idsLots: ReadonlyMap<string, number>, appliquer: boolean, c: ComptesImport,
): Promise<void> {
  const { rows } = await q<{ wippimmo_id: string } & Empreinte>(
    `SELECT wippimmo_id, locataire_id::text, lot_id::text, lot_wippimmo_id, entree::text, sortie::text,
            absent_le::text
       FROM gestion_annuaire_occupation`);
  const existants = new Map(rows.map((r) => [r.wippimmo_id, r]));

  for (const o of plan.occupations) {
    const locataireId = idsLocataires.get(o.clePersonne) ?? null;
    const lotId = idsLots.get(o.lotWippimmoId) ?? null;
    const avant = existants.get(o.wippimmoId);
    const apres: Empreinte = {
      locataire_id: locataireId === null ? null : String(locataireId),
      lot_id: lotId === null ? null : String(lotId),
      lot_wippimmo_id: o.lotWippimmoId, entree: o.entree, sortie: o.sortie, absent_le: null,
    };
    if (avant === undefined) c.occupationsCreees += 1;
    else if (memeEmpreinte(apres, avant)) { c.occupationsInchangees += 1; continue; }
    else { c.occupationsMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer || locataireId === null) continue;
    await q(
      `INSERT INTO gestion_annuaire_occupation
         (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, sortie, absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,NULL,now())
       ON CONFLICT (wippimmo_id) DO UPDATE SET
         locataire_id = EXCLUDED.locataire_id, lot_id = EXCLUDED.lot_id,
         lot_wippimmo_id = EXCLUDED.lot_wippimmo_id, entree = EXCLUDED.entree, sortie = EXCLUDED.sortie,
         absent_le = NULL, importe_le = now()`,
      [o.wippimmoId, locataireId, lotId, o.lotWippimmoId, o.entree, o.sortie]);
  }
}

/**
 * LES CONTACTS. Leur clé naturelle est (sujet, sujet, sorte, valeur) : le même numéro réécrit ne crée rien.
 *
 * 🔴 UN CONTACT QUI DISPARAÎT DE L'EXPORT EST MARQUÉ, PAS EFFACÉ (`absent_le`). Un numéro retiré de WIPPIMMO par
 * erreur reste ainsi lisible, avec sa mention — et un export qui le ramène le réveille.
 */
async function ecrireContacts(
  q: RequeteTx, plan: PlanImport, idsProprietaires: ReadonlyMap<string, number>,
  idsLocataires: ReadonlyMap<string, number>, appliquer: boolean, c: ComptesImport,
): Promise<void> {
  const attendus: { sujet: 'proprietaire' | 'locataire'; sujetId: number | null; contact: ContactAnnuaire }[] = [];
  for (const p of plan.proprietaires) {
    // ⚠️ `null` = le sujet n'existe pas ENCORE. Cela n'arrive qu'en SIMULATION (en mode réel, l'insertion vient
    //   d'avoir lieu) : ses contacts sont alors tous des créations, et il faut les compter — sinon le mode « à
    //   blanc » annoncerait zéro contact sur un premier import, ce qui serait faux et alarmant.
    const id = idsProprietaires.get(p.wippimmoId) ?? null;
    for (const contact of p.contacts) attendus.push({ sujet: 'proprietaire', sujetId: id, contact });
  }
  for (const p of plan.locataires) {
    const id = idsLocataires.get(p.clePersonne) ?? null;
    for (const contact of p.contacts) attendus.push({ sujet: 'locataire', sujetId: id, contact });
  }

  const { rows } = await q<{ sujet: string; sujet_id: string; sorte: string; valeur: string; absent_le: string | null }>(
    `SELECT sujet, sujet_id, sorte, valeur, absent_le::text FROM gestion_annuaire_contact`);
  const existants = new Set(rows.filter((r) => r.absent_le === null)
    .map((r) => `${r.sujet}|${r.sujet_id}|${r.sorte}|${r.valeur}`));
  const voulus = new Set(attendus.map((a) => `${a.sujet}|${a.sujetId}|${a.contact.sorte}|${a.contact.valeur}`));

  for (const a of attendus) {
    if (a.sujetId !== null && existants.has(`${a.sujet}|${a.sujetId}|${a.contact.sorte}|${a.contact.valeur}`)) continue;
    c.contactsCrees += 1;
    if (!appliquer || a.sujetId === null) continue;
    await q(
      `INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute, rang, absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,NULL,now())
       ON CONFLICT (sujet, sujet_id, sorte, valeur) DO UPDATE SET
         valeur_brute = EXCLUDED.valeur_brute, rang = EXCLUDED.rang, absent_le = NULL, importe_le = now()`,
      [a.sujet, a.sujetId, a.contact.sorte, a.contact.valeur, a.contact.valeurBrute, a.contact.rang]);
  }

  for (const cle of existants) {
    if (voulus.has(cle)) continue;
    c.contactsRetires += 1;
    if (!appliquer) continue;
    const [sujet, sujetId, sorte, valeur] = cle.split('|');
    await q(
      `UPDATE gestion_annuaire_contact SET absent_le = now()
        WHERE sujet = $1 AND sujet_id = $2 AND sorte = $3 AND valeur = $4 AND absent_le IS NULL`,
      [sujet, Number(sujetId), sorte, valeur]);
  }
}

/**
 * CE QUI N'EST PLUS DANS L'EXPORT EST MARQUÉ « ABSENT », JAMAIS EFFACÉ.
 *
 * ⚠️ ON NE MARQUE QUE CE QUI N'ÉTAIT PAS DÉJÀ MARQUÉ : sans ce `AND absent_le IS NULL`, chaque import repousserait
 * la date et l'on perdrait le DEPUIS QUAND — la seule information qui rende la mention utile.
 */
async function marquerDisparus(
  q: RequeteTx, plan: PlanImport, appliquer: boolean, c: ComptesImport,
): Promise<void> {
  const cibles: { table: string; colonne: string; presents: string[] }[] = [
    { table: 'gestion_annuaire_proprietaire', colonne: 'wippimmo_id', presents: plan.proprietaires.map((p) => p.wippimmoId) },
    { table: 'gestion_annuaire_lot', colonne: 'wippimmo_id', presents: plan.lots.map((l) => l.wippimmoId) },
    { table: 'gestion_annuaire_locataire', colonne: 'cle_personne', presents: plan.locataires.map((p) => p.clePersonne) },
    { table: 'gestion_annuaire_occupation', colonne: 'wippimmo_id', presents: plan.occupations.map((o) => o.wippimmoId) },
  ];
  for (const { table, colonne, presents } of cibles) {
    const { rows } = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE absent_le IS NULL AND NOT (${colonne} = ANY($1::text[]))`,
      [presents]);
    c.disparus += Number(rows[0]?.n ?? 0);
    if (!appliquer) continue;
    await q(
      `UPDATE ${table} SET absent_le = now() WHERE absent_le IS NULL AND NOT (${colonne} = ANY($1::text[]))`,
      [presents]);
  }
}

// ══ ② LA LECTURE ═══════════════════════════════════════════════════════════════════════════════════════════════════

export interface ContactAffiche { sorte: 'telephone' | 'email'; valeur: string; affichage: string; absent: boolean }

export interface LigneResultat {
  lotId: number | null;
  lotNumero: string | null;
  adresse: string | null;
  commune: string | null;
  nature: string | null;
  typeBien: string | null;
  proprietaireId: number | null;
  proprietaireNom: string;
  locataireId: number | null;
  locataireNom: string | null;
  locataireDepuis: string | null;
  absent: boolean;
}

export interface FicheProprietaire {
  id: number; nom: string; civilite: string | null;
  adresse: string | null; commune: string | null; codePostal: string | null;
  relationDepuis: string | null; absent: boolean;
  contacts: ContactAffiche[];
  lots: { id: number; numero: string; adresse: string | null; commune: string | null; nature: string | null;
    typeBien: string | null; debut: string | null; locataire: string | null; locataireId: number | null }[];
}

export interface FicheLot {
  id: number; numero: string; nature: string | null; typeBien: string | null; immeuble: string | null;
  adresse: string | null; commune: string | null; codePostal: string | null;
  debut: string | null; fin: string | null; absent: boolean;
  proprietaireId: number | null; proprietaireNom: string;
  occupations: { locataireId: number; nom: string; entree: string | null; sortie: string | null; encours: boolean }[];
}

export interface FicheLocataire {
  id: number; nom: string; adresse: string | null; commune: string | null; codePostal: string | null;
  absent: boolean; contacts: ContactAffiche[];
  occupations: { lotId: number | null; numero: string; adresse: string | null; commune: string | null;
    entree: string | null; sortie: string | null; encours: boolean; horsGestion: boolean }[];
}

export type IssueLecture<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' } | { etat: 'inconnu' };

/** Combien de lignes une recherche peut rendre. Au-delà, l'écran DIT qu'il y en a d'autres — il ne les cache pas. */
export const PLAFOND_RESULTATS = 60;

/**
 * LA RECHERCHE, GROUPÉE PAR LOGEMENT.
 *
 * 🔴 LE LOGEMENT EST L'UNITÉ DE RÉPONSE, parce que c'est la question posée : « qui est qui par rapport à un
 * logement ». On cherche donc les LOTS — par leur adresse, par leur numéro, par le nom ou les coordonnées de leur
 * propriétaire, par le nom ou les coordonnées de leurs locataires — et chaque ligne rendue porte le trio
 * adresse / propriétaire / locataire actuel.
 *
 * ⚠️ UN PROPRIÉTAIRE OU UN LOCATAIRE SANS LOT EXISTE AUSSI (un bailleur dont on ne gère rien, un locataire d'un
 * lot hors gestion). Il est rendu avec `lotId = null` plutôt que passé sous silence — sinon chercher son nom ne
 * donnerait rien alors qu'il est bien dans l'annuaire.
 */
export async function rechercher(t: TermeRecherche): Promise<IssueLecture<LigneResultat[]>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  if (t.vide) return { etat: 'ok', data: [] };

  const motif = `%${t.texte}%`;
  const chiffres = t.chiffres === null ? null : `%${t.chiffres}`;
  const params = [motif, t.telephone, chiffres, t.email, t.numeroLot, PLAFOND_RESULTATS];

  const { rows } = await query<{
    lot_id: string | null; lot_numero: string | null; adresse: string | null; commune: string | null;
    nature: string | null; type_bien: string | null; proprietaire_id: string | null; proprietaire_nom: string;
    locataire_id: string | null; locataire_nom: string | null; locataire_depuis: string | null; absent: boolean;
  }>(
    `WITH contacts_trouves AS (
       SELECT sujet, sujet_id FROM gestion_annuaire_contact
        WHERE ($2::text IS NOT NULL AND valeur = $2)
           OR ($3::text IS NOT NULL AND valeur LIKE $3)
           OR ($4::text IS NOT NULL AND valeur = $4)
     ),
     -- Le locataire EN COURS d'un lot : celui dont le bail n'a pas de sortie. Le plus récent s'il y en avait
     -- plusieurs (l'export n'en montre aucun, mesuré, mais une donnée future ne doit pas faire choisir au hasard).
     occupant AS (
       SELECT DISTINCT ON (o.lot_id) o.lot_id, o.locataire_id, o.entree, l.nom
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
        WHERE o.sortie IS NULL AND o.lot_id IS NOT NULL
        ORDER BY o.lot_id, o.entree DESC NULLS LAST, o.id DESC
     ),
     -- ① LES LOTS QUI RÉPONDENT, par quelque bout qu'on les prenne.
     lots_vises AS (
       SELECT lo.id
         FROM gestion_annuaire_lot lo
         LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
        WHERE lo.adresse_normalisee LIKE $1
           OR lo.proprietaire_texte ILIKE $1
           OR ($5::text IS NOT NULL AND lo.wippimmo_id = $5)
           OR pr.nom_normalise LIKE $1
           OR pr.adresse_normalisee LIKE $1
           OR pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire')
       UNION
       SELECT o.lot_id AS id
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
        WHERE o.lot_id IS NOT NULL
          AND (l.nom_normalise LIKE $1
               OR l.adresse_normalisee LIKE $1
               OR l.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'locataire'))
     )
     SELECT lo.id::text AS lot_id, lo.wippimmo_id AS lot_numero, lo.adresse, lo.commune, lo.nature,
            lo.type_bien, pr.id::text AS proprietaire_id,
            coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire_nom,
            oc.locataire_id::text AS locataire_id, oc.nom AS locataire_nom, oc.entree::text AS locataire_depuis,
            (lo.absent_le IS NOT NULL) AS absent
       FROM gestion_annuaire_lot lo
       JOIN lots_vises v ON v.id = lo.id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
       LEFT JOIN occupant oc ON oc.lot_id = lo.id

     UNION ALL
     -- ② LES PROPRIÉTAIRES SANS AUCUN LOT qui répondent quand même : ils sont dans l'annuaire, on les montre.
     SELECT NULL, NULL, pr.adresse, pr.commune, NULL, NULL, pr.id::text, pr.nom_complet,
            NULL, NULL, NULL, (pr.absent_le IS NOT NULL)
       FROM gestion_annuaire_proprietaire pr
      WHERE NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot x WHERE x.proprietaire_id = pr.id)
        AND (pr.nom_normalise LIKE $1 OR pr.adresse_normalisee LIKE $1
             OR pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire'))

     UNION ALL
     -- ③ LES LOCATAIRES DONT AUCUN BAIL NE VISE UN LOT CONNU (lot hors gestion) : même raison.
     SELECT NULL, NULL, lc.adresse, lc.commune, NULL, NULL, NULL, '',
            lc.id::text, lc.nom, NULL, (lc.absent_le IS NOT NULL)
       FROM gestion_annuaire_locataire lc
      WHERE NOT EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.locataire_id = lc.id AND o.lot_id IS NOT NULL)
        AND (lc.nom_normalise LIKE $1 OR lc.adresse_normalisee LIKE $1
             OR lc.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'locataire'))

     ORDER BY 4 NULLS LAST, 3 NULLS LAST, 8
     LIMIT $6`, params);

  return {
    etat: 'ok',
    data: rows.map((r) => ({
      lotId: r.lot_id === null ? null : Number(r.lot_id),
      lotNumero: r.lot_numero,
      adresse: r.adresse, commune: r.commune, nature: r.nature, typeBien: r.type_bien,
      proprietaireId: r.proprietaire_id === null ? null : Number(r.proprietaire_id),
      proprietaireNom: r.proprietaire_nom,
      locataireId: r.locataire_id === null ? null : Number(r.locataire_id),
      locataireNom: r.locataire_nom,
      locataireDepuis: r.locataire_depuis,
      absent: r.absent,
    })),
  };
}

const contactsDe = async (sujet: 'proprietaire' | 'locataire', sujetId: number): Promise<ContactAffiche[]> => {
  const { rows } = await query<{ sorte: string; valeur: string; valeur_brute: string; absent_le: string | null }>(
    `SELECT sorte, valeur, valeur_brute, absent_le::text FROM gestion_annuaire_contact
      WHERE sujet = $1 AND sujet_id = $2 ORDER BY sorte, absent_le NULLS FIRST, rang, id`, [sujet, sujetId]);
  return rows.map((r) => ({
    sorte: r.sorte as 'telephone' | 'email',
    valeur: r.valeur,
    // On affiche CE QUI ÉTAIT ÉCRIT : un numéro reformaté n'est plus reconnu par celui qui l'a saisi.
    affichage: r.valeur_brute.trim() === '' ? r.valeur : r.valeur_brute,
    absent: r.absent_le !== null,
  }));
};

export async function ficheProprietaire(id: number): Promise<IssueLecture<FicheProprietaire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; nom_complet: string; civilite: string | null; adresse: string | null; commune: string | null;
    code_postal: string | null; relation_depuis: string | null; absent_le: string | null;
  }>(`SELECT id, nom_complet, civilite, adresse, commune, code_postal, relation_depuis::text, absent_le::text
        FROM gestion_annuaire_proprietaire WHERE id = $1`, [id]);
  const p = rows[0];
  if (p === undefined) return { etat: 'inconnu' };

  const { rows: lots } = await query<{
    id: string; wippimmo_id: string; adresse: string | null; commune: string | null; nature: string | null;
    type_bien: string | null; gestion_debut: string | null; locataire: string | null; locataire_id: string | null;
  }>(
    `SELECT lo.id, lo.wippimmo_id, lo.adresse, lo.commune, lo.nature, lo.type_bien, lo.gestion_debut::text,
            oc.nom AS locataire, oc.locataire_id::text AS locataire_id
       FROM gestion_annuaire_lot lo
       LEFT JOIN LATERAL (
         SELECT l.nom, o.locataire_id FROM gestion_annuaire_occupation o
           JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
          WHERE o.lot_id = lo.id AND o.sortie IS NULL
          ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1
       ) oc ON true
      WHERE lo.proprietaire_id = $1
      ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`, [id]);

  return {
    etat: 'ok',
    data: {
      id: Number(p.id), nom: p.nom_complet, civilite: p.civilite, adresse: p.adresse, commune: p.commune,
      codePostal: p.code_postal, relationDepuis: p.relation_depuis, absent: p.absent_le !== null,
      contacts: await contactsDe('proprietaire', Number(p.id)),
      lots: lots.map((l) => ({
        id: Number(l.id), numero: l.wippimmo_id, adresse: l.adresse, commune: l.commune, nature: l.nature,
        typeBien: l.type_bien, debut: l.gestion_debut, locataire: l.locataire,
        locataireId: l.locataire_id === null ? null : Number(l.locataire_id),
      })),
    },
  };
}

export async function ficheLot(id: number): Promise<IssueLecture<FicheLot>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; wippimmo_id: string; nature: string | null; type_bien: string | null; immeuble: string | null;
    adresse: string | null; commune: string | null; code_postal: string | null; gestion_debut: string | null;
    gestion_fin: string | null; absent_le: string | null; proprietaire_id: string | null; proprietaire_nom: string;
  }>(
    `SELECT lo.id, lo.wippimmo_id, lo.nature, lo.type_bien, lo.immeuble, lo.adresse, lo.commune, lo.code_postal,
            lo.gestion_debut::text, lo.gestion_fin::text, lo.absent_le::text,
            pr.id::text AS proprietaire_id, coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire_nom
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE lo.id = $1`, [id]);
  const l = rows[0];
  if (l === undefined) return { etat: 'inconnu' };

  // 🔴 L'HISTORIQUE EST DÉCROISSANT, LE LOCATAIRE ACTUEL EN TÊTE : c'est lui qu'on cherche neuf fois sur dix.
  const { rows: occ } = await query<{
    locataire_id: string; nom: string; entree: string | null; sortie: string | null;
  }>(
    `SELECT o.locataire_id::text, l.nom, o.entree::text, o.sortie::text
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = $1
      ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [id]);

  return {
    etat: 'ok',
    data: {
      id: Number(l.id), numero: l.wippimmo_id, nature: l.nature, typeBien: l.type_bien, immeuble: l.immeuble,
      adresse: l.adresse, commune: l.commune, codePostal: l.code_postal,
      debut: l.gestion_debut, fin: l.gestion_fin, absent: l.absent_le !== null,
      proprietaireId: l.proprietaire_id === null ? null : Number(l.proprietaire_id),
      proprietaireNom: l.proprietaire_nom,
      occupations: occ.map((o) => ({
        locataireId: Number(o.locataire_id), nom: o.nom, entree: o.entree, sortie: o.sortie,
        encours: o.sortie === null,
      })),
    },
  };
}

export async function ficheLocataire(id: number): Promise<IssueLecture<FicheLocataire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; nom: string; adresse: string | null; commune: string | null; code_postal: string | null;
    absent_le: string | null;
  }>(`SELECT id, nom, adresse, commune, code_postal, absent_le::text
        FROM gestion_annuaire_locataire WHERE id = $1`, [id]);
  const p = rows[0];
  if (p === undefined) return { etat: 'inconnu' };

  const { rows: occ } = await query<{
    lot_id: string | null; numero: string; adresse: string | null; commune: string | null;
    entree: string | null; sortie: string | null;
  }>(
    `SELECT o.lot_id::text, coalesce(lo.wippimmo_id, o.lot_wippimmo_id) AS numero, lo.adresse, lo.commune,
            o.entree::text, o.sortie::text
       FROM gestion_annuaire_occupation o
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE o.locataire_id = $1
      ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [id]);

  return {
    etat: 'ok',
    data: {
      id: Number(p.id), nom: p.nom, adresse: p.adresse, commune: p.commune, codePostal: p.code_postal,
      absent: p.absent_le !== null,
      contacts: await contactsDe('locataire', Number(p.id)),
      occupations: occ.map((o) => ({
        lotId: o.lot_id === null ? null : Number(o.lot_id),
        numero: o.numero, adresse: o.adresse, commune: o.commune, entree: o.entree, sortie: o.sortie,
        encours: o.sortie === null, horsGestion: o.lot_id === null,
      })),
    },
  };
}

// ══ ③ LE PONT AVEC LA BOÎTE MAIL ═══════════════════════════════════════════════════════════════════════════════════

export interface IndiceAnnuaire {
  role: 'proprietaire' | 'locataire';
  id: number;
  nom: string;
  /** « 12 rue X, Puteaux » — le logement qui rattache cette personne, quand il y en a un seul. */
  logement: string | null;
  /** Combien de logements en tout. Au-delà de 1, l'encart le dit plutôt que d'en choisir un. */
  nbLogements: number;
}

/**
 * QUI EST CET EXPÉDITEUR ? Rendu par ADRESSE E-MAIL EXACTE, jamais par nom.
 *
 * 🔴 PAR L'ADRESSE, ET RIEN QUE PAR ELLE. Rapprocher un expéditeur par son nom afficherait « Propriétaire de
 * 12 rue X » sur le courrier d'un homonyme — une erreur qu'on ne verrait jamais, et qui ferait répondre à la
 * mauvaise personne. L'adresse, elle, ne ment pas.
 *
 * 🔒 LECTURE SEULE, ET SANS AUCUN EFFET SUR LE CLASSEMENT : cette fonction ne touche ni `gestion_fil`, ni
 * `gestion_message`, ni la moindre affectation.
 */
export async function indicesParEmail(emails: readonly string[]): Promise<IssueLecture<IndiceAnnuaire[]>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const propres = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e !== ''))];
  if (propres.length === 0) return { etat: 'ok', data: [] };

  const { rows } = await query<{
    role: string; id: string; nom: string; logement: string | null; nb: string;
  }>(
    `WITH vises AS (
       SELECT sujet, sujet_id FROM gestion_annuaire_contact
        WHERE sorte = 'email' AND absent_le IS NULL AND valeur = ANY($1::text[])
     )
     SELECT 'proprietaire' AS role, pr.id::text, pr.nom_complet AS nom,
            (SELECT concat_ws(', ', lo.adresse, lo.commune) FROM gestion_annuaire_lot lo
              WHERE lo.proprietaire_id = pr.id ORDER BY lo.wippimmo_id LIMIT 1) AS logement,
            (SELECT count(*)::text FROM gestion_annuaire_lot lo WHERE lo.proprietaire_id = pr.id) AS nb
       FROM gestion_annuaire_proprietaire pr
      WHERE pr.id IN (SELECT sujet_id FROM vises WHERE sujet = 'proprietaire')
     UNION ALL
     SELECT 'locataire', lc.id::text, lc.nom,
            (SELECT concat_ws(', ', lo.adresse, lo.commune)
               FROM gestion_annuaire_occupation o LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
              WHERE o.locataire_id = lc.id ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST LIMIT 1),
            (SELECT count(*)::text FROM gestion_annuaire_occupation o WHERE o.locataire_id = lc.id)
       FROM gestion_annuaire_locataire lc
      WHERE lc.id IN (SELECT sujet_id FROM vises WHERE sujet = 'locataire')`, [propres]);

  return {
    etat: 'ok',
    data: rows.map((r) => ({
      role: r.role as 'proprietaire' | 'locataire',
      id: Number(r.id), nom: r.nom,
      logement: r.logement === null || r.logement.trim() === '' ? null : r.logement,
      nbLogements: Number(r.nb),
    })),
  };
}

/** La date du dernier import abouti, pour que l'écran dise DE QUAND datent les données qu'il montre. */
export async function dernierImport(): Promise<{ le: string; mode: string } | null> {
  if (!(await annuaireDisponible())) return null;
  const { rows } = await query<{ termine_le: string; mode: string }>(
    `SELECT termine_le::text, mode FROM gestion_annuaire_import
      WHERE resultat = 'ok' AND mode = 'applique' ORDER BY id DESC LIMIT 1`);
  return rows[0] === undefined ? null : { le: rows[0].termine_le, mode: rows[0].mode };
}
