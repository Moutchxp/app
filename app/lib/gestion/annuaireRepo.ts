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
import { annuaireDisponible, libelleSourceContactDisponible } from './schema';
import type { ContactAnnuaire } from './annuaire';
import type { PlanImport } from './annuaireImport';
import type { TermeRecherche } from './annuaireRecherche';
// LOT BOITE-INTERNE-CORBEILLE — nos propres adresses ne se rapprochent d'aucune fiche. Règle CENTRALE, pas locale.
import { adressesRapprochables } from './adresseInterne';

/**
 * Un instant rendu en ISO-8601 UTC, tel que l'écran l'attend. Même écriture que `carteRepo` et `redactionRepo` :
 * trois copies d'une ligne de format valent mieux qu'un module partagé pour une seule expression SQL — mais elles
 * doivent rester IDENTIQUES, sans quoi deux écrans afficheraient la même date de deux façons.
 */
const INSTANT = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// ══ ① L'ÉCRITURE ═══════════════════════════════════════════════════════════════════════════════════════════════════

export interface ComptesImport {
  proprietairesCrees: number; proprietairesMajs: number; proprietairesInchanges: number;
  lotsCrees: number; lotsMajs: number; lotsInchanges: number;
  locatairesCrees: number; locatairesMajs: number; locatairesInchanges: number;
  occupationsCreees: number; occupationsMajs: number; occupationsInchangees: number;
  contactsCrees: number;
  /**
   * 🔴 LOT CONTACTS-ET-EVENEMENT — les contacts DÉJÀ EN BASE dont le libellé de colonne d'origine a changé (ou
   * manquait). Compté à part des créations : « 0 ajouté » était vrai et trompeur à la fois le 28/09/2026.
   */
  contactsMajs: number;
  contactsRetires: number;
  disparus: number; revenus: number;
}

export const COMPTES_VIDES: ComptesImport = {
  proprietairesCrees: 0, proprietairesMajs: 0, proprietairesInchanges: 0,
  lotsCrees: 0, lotsMajs: 0, lotsInchanges: 0,
  locatairesCrees: 0, locatairesMajs: 0, locatairesInchanges: 0,
  occupationsCreees: 0, occupationsMajs: 0, occupationsInchangees: 0,
  contactsCrees: 0, contactsMajs: 0, contactsRetires: 0, disparus: 0, revenus: 0,
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
/**
 * 🔴 EXPORTÉE POUR ÊTRE ÉPROUVÉE. La réconciliation des contacts est l'endroit où un import idempotent se trompe
 * le plus cher : elle décide, pour 1 793 lignes, laquelle est « inchangée ». Le 28/09/2026 elle en a déclaré 1 793
 * inchangées alors que leur libellé de colonne était vide — et le rapport annonçait « 0 ajouté », ce qui était
 * exact et trompeur. On la tient donc sous test directement, avec un `q` factice.
 */
export async function ecrireContacts(
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

  // LOT CONTACTS-ET-EVENEMENT — la 267 est-elle là ? Sinon la colonne n'est nommée nulle part, et rien ne change.
  const avecLibelle = await libelleSourceContactDisponible();
  /**
   * 🔴 ON RELIT LE LIBELLÉ, PAS SEULEMENT L'IDENTITÉ — DÉFAUT MESURÉ LE 28/09/2026.
   *
   * L'état « existant » ne portait que (sujet, sujet_id, sorte, valeur) : un contact déjà en base était donc réputé
   * INCHANGÉ quoi qu'il arrive, et la boucle le sautait AVANT d'écrire. Conséquence observée par Arno : la
   * migration 267 appliquée, l'import relancé avec `--appliquer` annonçait « contacts : 0 ajouté(s) » et les
   * 1 793 libellés restaient VIDES. Le rapport disait vrai sur ce qu'il faisait, et faux sur ce qu'il fallait faire.
   *
   * ⚠️ LA LEÇON : un import idempotent doit comparer TOUT CE QU'IL ÉCRIT. Le jour où l'on ajoute une colonne, la
   * clé de comparaison doit l'apprendre — sinon la colonne neuve ne se remplit jamais, en silence.
   */
  const { rows } = await q<{
    sujet: string; sujet_id: string; sorte: string; valeur: string; absent_le: string | null;
    libelle_source: string | null;
  }>(
    `SELECT sujet, sujet_id, sorte, valeur, absent_le::text,
            ${avecLibelle ? 'libelle_source' : 'NULL::text AS libelle_source'}
       FROM gestion_annuaire_contact`);
  const identite = (sujet: string, sujetId: string | number, sorte: string, valeur: string): string =>
    `${sujet}|${sujetId}|${sorte}|${valeur}`;
  /** L'état VIVANT de chaque contact : son identité → le libellé qu'il porte aujourd'hui. */
  const existants = new Map(rows.filter((r) => r.absent_le === null)
    .map((r) => [identite(r.sujet, r.sujet_id, r.sorte, r.valeur), r.libelle_source ?? '']));
  const voulus = new Set(attendus.map((a) => identite(a.sujet, String(a.sujetId), a.contact.sorte, a.contact.valeur)));

  for (const a of attendus) {
    const cle = a.sujetId === null ? null : identite(a.sujet, a.sujetId, a.contact.sorte, a.contact.valeur);
    const dejaLa = cle !== null && existants.has(cle);
    if (dejaLa) {
      /**
       * Déjà là : on n'écrit QUE si quelque chose a changé — et le libellé en fait partie depuis la 267. Sans la
       * migration, rien ne peut changer et on passe, exactement comme avant.
       */
      const libelleVoulu = avecLibelle ? (a.contact.libelleSource ?? '') : '';
      if (!avecLibelle || existants.get(cle as string) === libelleVoulu) continue;
      c.contactsMajs += 1;
    } else {
      c.contactsCrees += 1;
    }
    if (!appliquer || a.sujetId === null) continue;
    /**
     * ⚠️ SANS LA MIGRATION 267, LA COLONNE N'EST NOMMÉE NULLE PART et l'ordre est mot pour mot celui d'avant.
     * C'est la règle du module : les migrations sont livrées non appliquées, et le code tourne sans elles.
     */
    await q(
      avecLibelle
        ? `INSERT INTO gestion_annuaire_contact
             (sujet, sujet_id, sorte, valeur, valeur_brute, rang, libelle_source, absent_le, importe_le)
           VALUES ($1,$2,$3,$4,$5,$6,nullif($7,''),NULL,now())
           ON CONFLICT (sujet, sujet_id, sorte, valeur) DO UPDATE SET
             valeur_brute = EXCLUDED.valeur_brute, rang = EXCLUDED.rang,
             libelle_source = EXCLUDED.libelle_source, absent_le = NULL, importe_le = now()`
        : `INSERT INTO gestion_annuaire_contact (sujet, sujet_id, sorte, valeur, valeur_brute, rang, absent_le, importe_le)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,now())
           ON CONFLICT (sujet, sujet_id, sorte, valeur) DO UPDATE SET
             valeur_brute = EXCLUDED.valeur_brute, rang = EXCLUDED.rang, absent_le = NULL, importe_le = now()`,
      avecLibelle
        ? [a.sujet, a.sujetId, a.contact.sorte, a.contact.valeur, a.contact.valeurBrute, a.contact.rang,
          a.contact.libelleSource ?? '']
        : [a.sujet, a.sujetId, a.contact.sorte, a.contact.valeur, a.contact.valeurBrute, a.contact.rang]);
  }

  // ⚠️ `existants` est désormais une CARTE (identité → libellé) : on n'en parcourt que les CLÉS.
  for (const cle of existants.keys()) {
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

export interface ContactAffiche {
  sorte: 'telephone' | 'email'; valeur: string; affichage: string; absent: boolean;
  /**
   * 🔴 LOT FICHES-ANNUAIRE — LE LIBELLÉ D'ORIGINE (« Mobile », « Email », « Domicile »…), tel que WIPPIMMO
   * l'écrivait. Demande d'Arno : « chaque téléphone et chaque e-mail avec son libellé ». Mesuré le 29/09/2026 :
   * les 1 793 coordonnées de la base en portent un — la colonne existait, l'écran la jetait.
   *
   * ⚠️ `null` QUAND LA MIGRATION 268 N'EST PAS LÀ (sonde `libelleSourceContactDisponible`) : la colonne n'est
   * alors NOMMÉE NULLE PART, et l'écran écrit simplement « Téléphone » ou « E-mail ».
   */
  libelle: string | null;
}

export interface LigneResultat {
  lotId: number | null;
  /** La clé WIPPIMMO du lot — c'est elle, et non `lotId`, qui sert de cible de rattachement (lot RATTACHEMENT-1). */
  lotNumero: string | null;
  adresse: string | null;
  commune: string | null;
  nature: string | null;
  typeBien: string | null;
  proprietaireId: number | null;
  /**
   * LOT RATTACHEMENT-1 — la clé WIPPIMMO du propriétaire. AJOUTÉE, rien n'est retiré : `proprietaireId`
   * (l'identifiant interne, qui ouvre la fiche) reste à sa place et garde exactement le même usage.
   *
   * 🔴 POURQUOI LES DEUX. Une cible de rattachement se désigne par sa clé WIPPIMMO, la seule identité qui survive à
   * un ré-import de l'annuaire — un identifiant interne, lui, peut changer. Sans cette colonne, l'écran devrait
   * deviner la clé, ou faire une requête de plus par ligne de résultat.
   */
  proprietaireCle: string | null;
  proprietaireNom: string;
  locataireId: number | null;
  locataireNom: string | null;
  locataireDepuis: string | null;
  absent: boolean;
}

/**
 * ══ 🔴🔴 LOT FICHES-ANNUAIRE — CE QU'UNE CARTE DE BIEN DIT, ET CE QU'ELLE NE PEUT PAS DIRE ═══════════════════
 *
 * Mesuré sur la vraie base le 29/09/2026, avant d'écrire une ligne d'écran :
 *
 *   · `surface`        → AUCUNE colonne, nulle part dans le schéma. La carte écrit « non renseignée ».
 *   · dossier Drive    → il EXISTE, et pour les 365 lots : `gestion_drive_arbre`, sorte « bien », clé = le numéro
 *                        WIPPIMMO du lot. Il n'est pas sur la table du lot, d'où la jointure.
 *   · mails du bien    → `gestion_rattachement`, cible « lot », statut « confirme » : 32 938 liens sur 343 lots.
 *   · événements       → 1 en base, 0 ouvert. La carte dit « aucun » plutôt que de taire la ligne.
 *
 * 🔴 ON N'INVENTE JAMAIS UNE DONNÉE ABSENTE. `surfaceM2` vaut `null`, et l'écran écrit « non renseignée » — ce
 * qui est un fait, et non un vide qu'on lirait comme un oubli d'affichage.
 */
export interface BienDuProprietaire {
  id: number;
  numero: string;
  adresse: string | null; commune: string | null; codePostal: string | null;
  nature: string | null; typeBien: string | null;
  /** 🔴 TOUJOURS `null` AUJOURD'HUI : aucune colonne de surface n'existe. L'écran écrit « non renseignée ». */
  surfaceM2: number | null;
  debut: string | null;
  /** `null` = en gestion. Une date = le bien est SORTI de gestion : il va dans « Anciens biens ». */
  fin: string | null;
  locataire: string | null; locataireId: number | null; locataireDepuis: string | null;
  /** Combien de mails sont rattachés à ce bien (rattachements confirmés), et le plus récent. */
  mails: number;
  dernierEchange: string | null;
  evenementsOuverts: number;
  /** L'identifiant du dossier Drive du bien, quand l'arbre le connaît. */
  driveDossierId: string | null;
}

export interface FicheProprietaire {
  id: number;
  /**
   * LOT RATTACHEMENT-2 — la clé WIPPIMMO. AJOUTÉE, rien n'est retiré : `id` (l'identifiant interne, qui ouvre la
   * fiche) reste à sa place. C'est la clé, et non l'identifiant, qui désigne une CIBLE de rattachement — la seule
   * identité qui survive à un ré-import de l'annuaire.
   */
  cle: string;
  nom: string; civilite: string | null;
  adresse: string | null; commune: string | null; codePostal: string | null;
  relationDepuis: string | null; absent: boolean;
  contacts: ContactAffiche[];
  /** L'identifiant du dossier Drive du PROPRIÉTAIRE, quand l'arbre le connaît (307/307 au 29/09/2026). */
  driveDossierId: string | null;
  lots: { id: number; numero: string; adresse: string | null; commune: string | null; nature: string | null;
    typeBien: string | null; debut: string | null; locataire: string | null; locataireId: number | null }[];
  /**
   * 🔴 LES BIENS, TELS QUE LES CARTES LES MONTRENT. `lots` (au-dessus) reste : d'autres écrans le lisent, et le
   * retirer casserait ce qui marche. `biens` porte EN PLUS ce qu'une carte demande — locataire, mails, dernier
   * échange, événements, Drive — et sépare les biens en gestion des anciens.
   */
  biens: BienDuProprietaire[];
}

/**
 * ══ 🔴🔴 UNE OCCUPATION, AVEC LES COORDONNÉES DE SON OCCUPANT ═════════════════════════════════════════════════
 *
 * Demande d'Arno : « LOCATAIRE(S) EN PLACE : tous les occupants du même bail […] avec coordonnées complètes, date
 * d'entrée et liens vers leur fiche » et « HISTORIQUE DES LOCATAIRES : chaque occupation passée, avec les
 * occupants, la date d'entrée, la date de sortie et les coordonnées ».
 *
 * ═══ CE QUE LA BASE SAIT D'UN « MÊME BAIL », MESURÉ LE 29/09/2026 ═════════════════════════════════════════════
 * Un bail n'existe pas comme objet : il n'y a que des OCCUPATIONS (une personne, un lot, deux dates). Deux
 * personnes du même foyer devraient donc faire deux occupations de mêmes dates — or il n'y en a AUCUNE :
 *   · 0 lot avec deux occupations en cours ;
 *   · 0 couple (lot, date d'entrée) porté par deux personnes ;
 *   · mais 116 fiches de locataires sur 510 nomment DEUX personnes dans leur nom (« ABGRALL CAYREY Chloé et
 *     Romain »).
 *
 * 🔴 ON NE DÉCOUPE PAS CES NOMS. Rien ne dit où s'arrête l'un et où commence l'autre, ni quelle coordonnée est à
 * qui. On rend donc les occupations TELLES QU'ELLES SONT — et l'écran les groupe par PÉRIODE : si un jour deux
 * personnes partagent une entrée, elles s'afficheront ensemble, sans qu'une ligne de code change.
 * 🔭 L'étape C ouvre l'ajout d'un occupant : c'est là que le groupe en portera plusieurs, pour de vrai.
 */
export interface OccupationDuLot {
  locataireId: number;
  nom: string;
  entree: string | null;
  sortie: string | null;
  encours: boolean;
  adresse: string | null; commune: string | null; codePostal: string | null;
  contacts: ContactAffiche[];
}

export interface FicheLot {
  id: number; numero: string; nature: string | null; typeBien: string | null; immeuble: string | null;
  adresse: string | null; commune: string | null; codePostal: string | null;
  debut: string | null; fin: string | null; absent: boolean;
  /** 🔴 TOUJOURS `null` : aucune colonne de surface n'existe. L'écran écrit « non renseignée ». */
  surfaceM2: number | null;
  /** L'identifiant du dossier Drive DU LOT, lu dans l'arbre (365/365 au 29/09/2026). */
  driveDossierId: string | null;
  proprietaireId: number | null;
  /** LOT RATTACHEMENT-2 — la clé WIPPIMMO du propriétaire. Ajoutée, comme `FicheProprietaire.cle` et pour la même raison. */
  proprietaireCle: string | null;
  proprietaireNom: string;
  /** Les coordonnées du propriétaire, pour l'en-tête de la fiche du bien. Vide s'il n'est pas dans l'annuaire. */
  proprietaireContacts: ContactAffiche[];
  occupations: OccupationDuLot[];
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
 * Ce qu'une recherche rend : ses lignes, et SI ELLE A ÉTÉ COUPÉE.
 *
 * 🔴 CORRECTIF DU 26/09/2026, mesuré à l'écran sur la vraie base : chercher « puvis » ramenait 76 logements, l'écran
 * en montrait 60 et annonçait « 60 résultats » — 16 disparaissaient sans un mot. C'est exactement ce que le module
 * s'interdit ailleurs (la fenêtre de 30 jours de la file DIT combien d'échanges elle laisse de côté). On demande
 * donc UNE ligne de plus que le plafond : si elle arrive, c'est qu'il y en a d'autres, et on le dit.
 */
export interface Resultats {
  lignes: LigneResultat[];
  /** Vrai quand d'autres lignes correspondent sans être rendues. L'écran l'écrit en toutes lettres. */
  tronque: boolean;
}

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
export async function rechercher(t: TermeRecherche): Promise<IssueLecture<Resultats>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  if (t.vide) return { etat: 'ok', data: { lignes: [], tronque: false } };

  const motif = `%${t.texte}%`;
  const chiffres = t.chiffres === null ? null : `%${t.chiffres}`;
  // UNE ligne de plus que le plafond : sa présence — et elle seule — dit qu'il y en a d'autres.
  const params = [motif, t.telephone, chiffres, t.email, t.numeroLot, PLAFOND_RESULTATS + 1];

  const { rows } = await query<{
    lot_id: string | null; lot_numero: string | null; adresse: string | null; commune: string | null;
    nature: string | null; type_bien: string | null; proprietaire_id: string | null; proprietaire_nom: string;
    locataire_id: string | null; locataire_nom: string | null; locataire_depuis: string | null; absent: boolean;
    proprietaire_cle: string | null;
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
            (lo.absent_le IS NOT NULL) AS absent,
            -- LOT RATTACHEMENT-1 — la clé WIPPIMMO du propriétaire, ajoutée EN DERNIER : l'ORDER BY positionnel
            --   plus bas (4, 3, 8) reste donc valable, et les trois branches de l'UNION gardent le même alignement.
            pr.wippimmo_id AS proprietaire_cle
       FROM gestion_annuaire_lot lo
       JOIN lots_vises v ON v.id = lo.id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
       LEFT JOIN occupant oc ON oc.lot_id = lo.id

     UNION ALL
     -- ② LES PROPRIÉTAIRES SANS AUCUN LOT qui répondent quand même : ils sont dans l'annuaire, on les montre.
     SELECT NULL, NULL, pr.adresse, pr.commune, NULL, NULL, pr.id::text, pr.nom_complet,
            NULL, NULL, NULL, (pr.absent_le IS NOT NULL), pr.wippimmo_id
       FROM gestion_annuaire_proprietaire pr
      WHERE NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot x WHERE x.proprietaire_id = pr.id)
        AND (pr.nom_normalise LIKE $1 OR pr.adresse_normalisee LIKE $1
             OR pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire'))

     UNION ALL
     -- ③ LES LOCATAIRES DONT AUCUN BAIL NE VISE UN LOT CONNU (lot hors gestion) : même raison.
     SELECT NULL, NULL, lc.adresse, lc.commune, NULL, NULL, NULL, '',
            lc.id::text, lc.nom, NULL, (lc.absent_le IS NOT NULL), NULL
       FROM gestion_annuaire_locataire lc
      WHERE NOT EXISTS (SELECT 1 FROM gestion_annuaire_occupation o WHERE o.locataire_id = lc.id AND o.lot_id IS NOT NULL)
        AND (lc.nom_normalise LIKE $1 OR lc.adresse_normalisee LIKE $1
             OR lc.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'locataire'))

     ORDER BY 4 NULLS LAST, 3 NULLS LAST, 8
     LIMIT $6`, params);

  const tronque = rows.length > PLAFOND_RESULTATS;
  return {
    etat: 'ok',
    data: {
      tronque,
      lignes: rows.slice(0, PLAFOND_RESULTATS).map((r) => ({
        lotId: r.lot_id === null ? null : Number(r.lot_id),
        lotNumero: r.lot_numero,
        adresse: r.adresse, commune: r.commune, nature: r.nature, typeBien: r.type_bien,
        proprietaireId: r.proprietaire_id === null ? null : Number(r.proprietaire_id),
        proprietaireCle: r.proprietaire_cle,
        proprietaireNom: r.proprietaire_nom,
        locataireId: r.locataire_id === null ? null : Number(r.locataire_id),
        locataireNom: r.locataire_nom,
        locataireDepuis: r.locataire_depuis,
        absent: r.absent,
      })),
    },
  };
}

const contactsDe = async (sujet: 'proprietaire' | 'locataire', sujetId: number): Promise<ContactAffiche[]> => {
  /**
   * ⚠️ LA SONDE VOYAGE AVEC LA COLONNE : sans la migration 268, `libelle_source` n'existe pas, et la NOMMER
   * ferait échouer toute la fiche. C'est la règle du module depuis le premier lot.
   */
  const avecLibelle = await libelleSourceContactDisponible();
  const { rows } = await query<{
    sorte: string; valeur: string; valeur_brute: string; absent_le: string | null; libelle: string | null;
  }>(
    `SELECT sorte, valeur, valeur_brute, absent_le::text,
            ${avecLibelle ? 'libelle_source' : 'NULL::text'} AS libelle
       FROM gestion_annuaire_contact
      WHERE sujet = $1 AND sujet_id = $2 ORDER BY sorte, absent_le NULLS FIRST, rang, id`, [sujet, sujetId]);
  return rows.map((r) => ({
    sorte: r.sorte as 'telephone' | 'email',
    valeur: r.valeur,
    // On affiche CE QUI ÉTAIT ÉCRIT : un numéro reformaté n'est plus reconnu par celui qui l'a saisi.
    affichage: r.valeur_brute.trim() === '' ? r.valeur : r.valeur_brute,
    absent: r.absent_le !== null,
    libelle: r.libelle === null || r.libelle.trim() === '' ? null : r.libelle.trim(),
  }));
};

export async function ficheProprietaire(id: number): Promise<IssueLecture<FicheProprietaire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; wippimmo_id: string; nom_complet: string; civilite: string | null; adresse: string | null;
    commune: string | null; code_postal: string | null; relation_depuis: string | null; absent_le: string | null;
  }>(`SELECT id, wippimmo_id, nom_complet, civilite, adresse, commune, code_postal, relation_depuis::text,
             absent_le::text
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
      id: Number(p.id), cle: p.wippimmo_id, nom: p.nom_complet, civilite: p.civilite, adresse: p.adresse,
      commune: p.commune,
      codePostal: p.code_postal, relationDepuis: p.relation_depuis, absent: p.absent_le !== null,
      contacts: await contactsDe('proprietaire', Number(p.id)),
      driveDossierId: await dossierDriveDe('proprietaire', p.wippimmo_id),
      lots: lots.map((l) => ({
        id: Number(l.id), numero: l.wippimmo_id, adresse: l.adresse, commune: l.commune, nature: l.nature,
        typeBien: l.type_bien, debut: l.gestion_debut, locataire: l.locataire,
        locataireId: l.locataire_id === null ? null : Number(l.locataire_id),
      })),
      biens: await biensDuProprietaire(Number(p.id)),
    },
  };
}

/**
 * ══ 🔴 LE DOSSIER DRIVE D'UNE CIBLE, LU DANS L'ARBRE ═══════════════════════════════════════════════════════════
 *
 * L'arbre du Drive (`gestion_drive_arbre`) est construit et tenu à jour par le module : il porte un nœud par
 * propriétaire (307) et un par bien (365), désignés par leur CLÉ WIPPIMMO — la seule identité qui survive à un
 * ré-import de l'annuaire.
 *
 * ⚠️ UNE ABSENCE N'EST PAS UNE PANNE : un dossier pas encore construit rend `null`, et l'écran n'affiche
 * simplement pas le lien. Inventer une adresse Drive enverrait sur une page d'erreur de Google.
 */
async function dossierDriveDe(sorte: 'proprietaire' | 'bien', cle: string | null): Promise<string | null> {
  if (cle === null || cle.trim() === '') return null;
  try {
    const { rows } = await query<{ drive_id: string }>(
      `SELECT drive_id FROM gestion_drive_arbre
        WHERE sorte = $1 AND cle = $2 AND absent_le IS NULL LIMIT 1`, [sorte, cle]);
    return rows[0]?.drive_id ?? null;
  } catch {
    // L'arbre peut ne pas exister (migration non appliquée) : la fiche s'affiche quand même, sans le lien.
    return null;
  }
}

/**
 * ══ 🔴🔴 LES BIENS D'UN PROPRIÉTAIRE, AVEC DE QUOI REMPLIR UNE CARTE ══════════════════════════════════════════
 *
 * UNE SEULE REQUÊTE POUR TOUS SES BIENS, et des jointures LATÉRALES plutôt qu'une requête par carte : un
 * propriétaire en a jusqu'à une dizaine (58 en ont plus d'un), et dix allers-retours se verraient à l'écran.
 * C'est la règle du module depuis la liste de la boîte.
 *
 * 🔴 CE QUE CHAQUE MORCEAU RÉPOND, ET POURQUOI IL EST LÀ :
 *   · `oc`  — le locataire EN PLACE (occupation sans date de sortie), et depuis quand ;
 *   · `ma`  — combien de mails sont rattachés à ce bien, et le dernier ; rattachements CONFIRMÉS seulement, car
 *             une proposition que personne n'a validée n'est pas un échange de ce bien ;
 *   · `ev`  — les événements OUVERTS ;
 *   · `dr`  — le dossier Drive du bien, par sa clé WIPPIMMO.
 *
 * ⚠️ `surfaceM2` EST TOUJOURS `null` : mesuré le 29/09/2026, aucune colonne de surface n'existe dans le schéma.
 * On ne devine pas depuis le type de bien — « Type 2 » ne dit pas des mètres carrés. L'écran écrit « non
 * renseignée », qui est la vérité.
 */
async function biensDuProprietaire(proprietaireId: number): Promise<BienDuProprietaire[]> {
  const { rows } = await query<{
    id: string; wippimmo_id: string; adresse: string | null; commune: string | null; code_postal: string | null;
    nature: string | null; type_bien: string | null; gestion_debut: string | null; gestion_fin: string | null;
    locataire: string | null; locataire_id: string | null; locataire_depuis: string | null;
    mails: number; dernier_echange: string | null; evenements: number; drive_id: string | null;
  }>(
    `SELECT lo.id, lo.wippimmo_id, lo.adresse, lo.commune, lo.code_postal, lo.nature, lo.type_bien,
            lo.gestion_debut::text, lo.gestion_fin::text,
            oc.nom AS locataire, oc.locataire_id::text AS locataire_id, oc.entree::text AS locataire_depuis,
            coalesce(ma.n, 0)::int AS mails,
            ${INSTANT('ma.dernier')} AS dernier_echange,
            coalesce(ev.n, 0)::int AS evenements,
            dr.drive_id
       FROM gestion_annuaire_lot lo
       LEFT JOIN LATERAL (
         SELECT l.nom, o.locataire_id, o.entree FROM gestion_annuaire_occupation o
           JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
          WHERE o.lot_id = lo.id AND o.sortie IS NULL
          ORDER BY o.entree DESC NULLS LAST, o.id DESC LIMIT 1
       ) oc ON true
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT m.id)::int AS n, max(m.recu_le) AS dernier
           FROM gestion_rattachement r
           JOIN gestion_message m ON m.id = r.message_id
          WHERE r.cible_sorte = 'lot' AND r.cible_cle = lo.wippimmo_id AND r.statut = 'confirme'
       ) ma ON true
       /* ⚠️ UN EVENEMENT N'EST PAS RATTACHE A UN LOT, mais a des ECHANGES (gestion_affectation). « Ouvert »
          pour ce bien se lit donc : un evenement NON TRAITE, affecte a un echange dont un mail porte un
          rattachement CONFIRME vers ce lot. Ecrire e.cible_lot serait plus court — et faux : la colonne
          n'existe pas, et l'inventer ferait echouer toute la fiche.
          AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
          terminerait — piege consigne NEUF fois dans ce depot, et neuf fois dans un commentaire. */
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT e.id)::int AS n
           FROM gestion_evenement e
           JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif
           JOIN gestion_message m2 ON m2.fil_id = a.fil_id
           JOIN gestion_rattachement r2 ON r2.message_id = m2.id
          WHERE e.etat <> 'traite' AND r2.cible_sorte = 'lot' AND r2.cible_cle = lo.wippimmo_id
            AND r2.statut = 'confirme'
       ) ev ON true
       LEFT JOIN gestion_drive_arbre dr
              ON dr.sorte = 'bien' AND dr.cle = lo.wippimmo_id AND dr.absent_le IS NULL
      WHERE lo.proprietaire_id = $1
      ORDER BY (lo.gestion_fin IS NOT NULL), lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`,
    [proprietaireId]);

  return rows.map((l) => ({
    id: Number(l.id), numero: l.wippimmo_id,
    adresse: l.adresse, commune: l.commune, codePostal: l.code_postal,
    nature: l.nature, typeBien: l.type_bien,
    surfaceM2: null,
    debut: l.gestion_debut, fin: l.gestion_fin,
    locataire: l.locataire, locataireId: l.locataire_id === null ? null : Number(l.locataire_id),
    locataireDepuis: l.locataire_depuis,
    mails: l.mails, dernierEchange: l.dernier_echange, evenementsOuverts: l.evenements,
    driveDossierId: l.drive_id,
  }));
}

export async function ficheLot(id: number): Promise<IssueLecture<FicheLot>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; wippimmo_id: string; nature: string | null; type_bien: string | null; immeuble: string | null;
    adresse: string | null; commune: string | null; code_postal: string | null; gestion_debut: string | null;
    gestion_fin: string | null; absent_le: string | null; proprietaire_id: string | null;
    proprietaire_cle: string | null; proprietaire_nom: string;
  }>(
    `SELECT lo.id, lo.wippimmo_id, lo.nature, lo.type_bien, lo.immeuble, lo.adresse, lo.commune, lo.code_postal,
            lo.gestion_debut::text, lo.gestion_fin::text, lo.absent_le::text,
            pr.id::text AS proprietaire_id, pr.wippimmo_id AS proprietaire_cle,
            coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire_nom
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE lo.id = $1`, [id]);
  const l = rows[0];
  if (l === undefined) return { etat: 'inconnu' };

  // 🔴 L'HISTORIQUE EST DÉCROISSANT, LE LOCATAIRE ACTUEL EN TÊTE : c'est lui qu'on cherche neuf fois sur dix.
  const { rows: occ } = await query<{
    locataire_id: string; nom: string; entree: string | null; sortie: string | null;
    adresse: string | null; commune: string | null; code_postal: string | null;
  }>(
    `SELECT o.locataire_id::text, l.nom, o.entree::text, o.sortie::text,
            l.adresse, l.commune, l.code_postal
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = $1
      ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [id]);

  /**
   * 🔴 LES COORDONNÉES DE CHAQUE OCCUPANT, en une lecture par PERSONNE DISTINCTE. Un locataire qui revient dans
   * le même logement (cela arrive) ne se lit qu'une fois : sans ce dédoublonnage, on paierait deux requêtes pour
   * la même réponse.
   */
  const personnes = [...new Set(occ.map((o) => Number(o.locataire_id)))];
  const coords = new Map<number, ContactAffiche[]>();
  for (const pid of personnes) coords.set(pid, await contactsDe('locataire', pid));

  return {
    etat: 'ok',
    data: {
      id: Number(l.id), numero: l.wippimmo_id, nature: l.nature, typeBien: l.type_bien, immeuble: l.immeuble,
      adresse: l.adresse, commune: l.commune, codePostal: l.code_postal,
      debut: l.gestion_debut, fin: l.gestion_fin, absent: l.absent_le !== null,
      surfaceM2: null,
      driveDossierId: await dossierDriveDe('bien', l.wippimmo_id),
      proprietaireId: l.proprietaire_id === null ? null : Number(l.proprietaire_id),
      proprietaireCle: l.proprietaire_cle,
      proprietaireNom: l.proprietaire_nom,
      proprietaireContacts: l.proprietaire_id === null
        ? [] : await contactsDe('proprietaire', Number(l.proprietaire_id)),
      occupations: occ.map((o) => ({
        locataireId: Number(o.locataire_id), nom: o.nom, entree: o.entree, sortie: o.sortie,
        encours: o.sortie === null,
        adresse: o.adresse, commune: o.commune, codePostal: o.code_postal,
        contacts: coords.get(Number(o.locataire_id)) ?? [],
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
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — NOS ADRESSES SORTENT AVANT LA REQUÊTE ══════════════════════════════════
   * Règle d'Arno du 29/09/2026 : une adresse en `@sansvisavis.com` ou `@criterimmo.fr` n'est JAMAIS rapprochée
   * d'une fiche, où qu'elle apparaisse. C'était la SEULE voie du module à l'ignorer — et six fiches WIPPIMMO
   * portent bel et bien une de nos adresses (nous sommes bailleurs ou preneurs à titre personnel). Un mail
   * interne se coiffait donc de « PROPRIÉTAIRE JOREL Arnaud / MARS AVENIR / GABRIEL ESTATE, LOCATAIRE SARL
   * MACJ » : mesuré le 29/09, 1 346 mails dans 948 échanges.
   *
   * 🔴 AVANT LA REQUÊTE, ET PAS APRÈS. Filtrer le RÉSULTAT laisserait la base chercher, et surtout laisserait la
   * règle dépendre de ce que la requête a bien voulu rendre. Ici, l'adresse n'entre tout simplement pas.
   *
   * 🔴 IL NE RESTE PERSONNE ⇒ LISTE VIDE, et l'appelant n'affiche RIEN. `EncartAnnuaire` rend déjà `null` sur une
   * liste vide : le bloc des parties disparaît entièrement, au lieu de se vider en laissant son cadre.
   *
   * ⚠️ `gestion@criterimmo.fr` était déjà couverte par le domaine ; le partenaire interne (ADHOC) ne l'est pas, et
   * il ne l'était pas non plus avant ce lot. Il n'a aucune fiche à l'annuaire, donc la requête ne rend rien pour
   * lui — l'ajouter ici demanderait une lecture de plus en base pour ne rien changer.
   */
  const propres = adressesRapprochables(emails);
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
