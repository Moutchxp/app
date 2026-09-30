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
// 🔴 LOT SUPPRIMER-CARTE — une fiche supprimée ne s'affiche NULLE PART. Le fragment est écrit une seule fois.
import { personneVivanteAvec } from './personneVivante';
import { sqlPersonneVivante } from './personneVivanteSql';
import { annuaireDisponible, annuaireModifiableDisponible, libelleSourceContactDisponible, suppressionPersonneDisponible } from './schema';
import { conditionCoordonneeVivante } from './coordonneeVivante';
// LOT FICHES-RETOUCHES — un numero affiche par l'app est groupe par deux chiffres.
import { decortiquerNumero, formaterTelephone } from './telephoneAffichage';
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
  /**
   * ══ 🔴🔴 LOT FICHES-ANNUAIRE (étape C) — CE QUE L'IMPORT N'A PAS APPLIQUÉ, ET POURQUOI ═══════════════════════
   *
   * Règle d'Arno : « une valeur modifiée dans l'app devient PRIORITAIRE et n'est plus jamais écrasée par un
   * réimport. L'import liste les divergences (“WIPPIMMO dit X, l'app dit Y”) dans son rapport, SANS LES
   * APPLIQUER ».
   *
   * Chaque ligne est une phrase lisible, prête pour le rapport. Une liste VIDE est la réponse normale : elle dit
   * qu'aucun champ saisi ici ne contredit l'export.
   *
   * 🔴 POURQUOI LES DIRE PLUTÔT QUE LES TAIRE. Un champ verrouillé qui diverge est une VRAIE information : soit
   * WIPPIMMO a été corrigé à son tour (et le verrou peut être levé), soit il se trompe (et le verrou fait son
   * travail). Taire la divergence rendrait le verrou indiscernable d'un oubli.
   */
  divergences: string[];
}

export const COMPTES_VIDES: ComptesImport = {
  proprietairesCrees: 0, proprietairesMajs: 0, proprietairesInchanges: 0,
  lotsCrees: 0, lotsMajs: 0, lotsInchanges: 0,
  locatairesCrees: 0, locatairesMajs: 0, locatairesInchanges: 0,
  occupationsCreees: 0, occupationsMajs: 0, occupationsInchangees: 0,
  contactsCrees: 0, contactsMajs: 0, contactsRetires: 0, disparus: 0, revenus: 0, divergences: [],
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
    /**
     * ⚠️ `divergences: []` EST RÉÉCRIT À LA MAIN, ET CE N'EST PAS UNE REDONDANCE. `{ ...COMPTES_VIDES }` copie la
     * RÉFÉRENCE du tableau : sans cette ligne, chaque import pousserait ses divergences dans la constante
     * partagée, et le second import hériterait de celles du premier — un cumul invisible, et faux.
     */
    const c: ComptesImport = { ...COMPTES_VIDES, divergences: [] };
    /**
     * 🔴 LES VERROUS SONT LUS UNE FOIS, AVANT TOUT. Ils disent quels champs l'application possède : l'import ne
     * les réécrit pas, et signale la divergence. Vide sans la migration 278 — l'import se comporte alors
     * exactement comme avant ce lot, ce qui est la bonne réponse : sans la table, aucune saisie n'a pu avoir lieu.
     */
    const verrous = await lireVerrous(q);

    const proprietaires = await ecrireProprietaires(q, plan, options.appliquer, c, verrous);
    const idsLots = await ecrireLots(q, plan, proprietaires.parCle, options.appliquer, c);
    const idsLocataires = await ecrireLocataires(q, plan, options.appliquer, c, verrous);
    await ecrireOccupations(q, plan, idsLocataires, idsLots, options.appliquer, c);
    await ecrireContacts(q, plan, proprietaires.parId, idsLocataires, options.appliquer, c, verrous);
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

/**
 * ══ 🔴🔴 LES CHAMPS QUE L'APPLICATION POSSÈDE, LUS UNE FOIS PAR IMPORT ════════════════════════════════════════════
 *
 * LOT FICHES-ANNUAIRE (étape C). `gestion_annuaire_verrou` (migration 278) porte un verrou PAR CHAMP : corriger un
 * téléphone ne gèle pas l'adresse postale, que WIPPIMMO continue de tenir à jour.
 *
 * Clé : `sujet|identifiant|champ`. Valeur : ce que WIPPIMMO portait AU MOMENT DU VERROU — inutile ici, mais rendue
 * pour que le rapport puisse dire d'où vient la divergence.
 *
 * 🔴 UNE CARTE PLUTÔT QU'UNE REQUÊTE PAR PERSONNE : l'import parcourt 307 propriétaires et 510 locataires. Huit
 * cents requêtes de plus, dans une transaction, pour lire une table qui compte quelques dizaines de lignes.
 *
 * ⚠️ VIDE SANS LA MIGRATION : la table n'est pas NOMMÉE, et l'import se comporte mot pour mot comme avant ce lot.
 */
export type Verrous = ReadonlyMap<string, string | null>;

export const CLE_VERROU = (sujet: string, id: number | string, champ: string): string =>
  `${sujet}|${id}|${champ}`;

async function lireVerrous(q: RequeteTx): Promise<Verrous> {
  if (!(await annuaireModifiableDisponible())) return new Map();
  const { rows } = await q<{ sujet: string; sujet_id: string; champ: string; valeur_import: string | null }>(
    'SELECT sujet, sujet_id::text, champ, valeur_import FROM gestion_annuaire_verrou');
  return new Map(rows.map((r) => [CLE_VERROU(r.sujet, r.sujet_id, r.champ), r.valeur_import]));
}

/**
 * ══ 🔴 CE QUE L'IMPORT A LE DROIT DE RÉÉCRIRE, POUR UNE PERSONNE DONNÉE ═══════════════════════════════════════════
 *
 * Rend le `SET` d'un `ON CONFLICT DO UPDATE` privé des colonnes VERROUILLÉES, et la liste des champs écartés.
 *
 * 🔴 `nom_complet` ET `nom_normalise` SUIVENT LE NOM ET LE PRÉNOM. Ce sont des colonnes DÉRIVÉES : réécrire l'une
 * sans l'autre laisserait une fiche dont le nom affiché ne serait plus celui du nom — et, pire, dont la RECHERCHE
 * ne trouverait plus la personne sous le nom qu'on voit à l'écran. Verrouiller « nom » les gèle donc toutes deux.
 *
 * ⚠️ `absent_le = NULL` ET `importe_le = now()` NE SE VERROUILLENT JAMAIS : ils ne disent pas ce que vaut une
 * fiche, mais que l'export vient de la nommer. Les geler ferait croire une personne disparue alors qu'elle est là.
 */
function setSansVerrous(colonnes: readonly string[], verrouilles: ReadonlySet<string>): {
  set: string; ecartees: string[];
} {
  const gele = (col: string): boolean => verrouilles.has(col)
    || ((col === 'nom_complet' || col === 'nom_normalise') && (verrouilles.has('nom') || verrouilles.has('prenom')));
  const gardees = colonnes.filter((c) => !gele(c));
  return {
    set: [...gardees.map((c) => `${c} = EXCLUDED.${c}`), 'absent_le = NULL', 'importe_le = now()'].join(', '),
    ecartees: colonnes.filter(gele),
  };
}

/**
 * LA PHRASE D'UNE DIVERGENCE, écrite une seule fois pour que le rapport parle toujours de la même façon.
 *
 * ⚠️ « non renseigné » PLUTÔT QUE RIEN : « WIPPIMMO dit  , l'app dit 06… » serait illisible, et laisserait croire
 * à un bogue d'affichage. Une absence est une valeur, et elle se dit.
 */
function phraseDivergence(
  qui: string, champ: string, wippimmo: string | null, appli: string | null,
): string {
  const mot = (v: string | null): string => (v === null || v.trim() === '' ? 'non renseigné' : v.trim());
  return `${qui} — ${champ} : WIPPIMMO dit « ${mot(wippimmo)} », l’app dit « ${mot(appli)} » (non appliqué).`;
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
        + `${plan.rejets.length} rejet(s), ${plan.homonymes.length} homonyme(s), ${c.disparus} disparu(s)`
        /**
         * 🔴 LES DIVERGENCES SONT DANS LE JOURNAL, ET PAS SEULEMENT DANS LE RAPPORT DE LA COMMANDE. Un rapport
         * affiché dans un terminal disparaît avec le terminal ; le journal, lui, répond encore dans six mois à
         * « pourquoi ce numéro n'a-t-il pas changé ? ». Le détail complet, lui, vit dans `comptes.divergences`.
         */
        + (c.divergences.length === 0 ? '.'
          : ` ; ${c.divergences.length} divergence(s) NON APPLIQUÉE(S) (champs saisis dans l’application, `
            + `prioritaires) :\n${c.divergences.slice(0, 50).join('\n')}`)]);
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
  q: RequeteTx, plan: PlanImport, appliquer: boolean, c: ComptesImport, verrous: Verrous,
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

  const COLONNES = ['civilite', 'nom', 'prenom', 'nom_complet', 'nom_normalise', 'adresse', 'commune',
    'code_postal', 'adresse_normalisee', 'relation_depuis'] as const;

  for (const p of plan.proprietaires) {
    const avant = existants.get(p.wippimmoId);
    const apres: Empreinte = {
      civilite: p.civilite, nom: p.nom, prenom: p.prenom, nom_complet: p.nomComplet,
      nom_normalise: p.nomNormalise, adresse: p.adresse, commune: p.commune, code_postal: p.codePostal,
      adresse_normalisee: p.adresseNormalisee, relation_depuis: p.relationDepuis,
      // Un propriétaire présent dans CET export n'est plus absent : la date doit repartir à NULL.
      absent_le: null,
    };

    /**
     * ══ 🔴🔴 LES CHAMPS SAISIS DANS L'APPLICATION SONT PRIORITAIRES ═══════════════════════════════════════════
     * On les écarte de la COMPARAISON comme de l'ÉCRITURE, et on dit la divergence.
     *
     * 🔴 DE LA COMPARAISON AUSSI, et c'est le point délicat : un champ verrouillé qui diffère rendrait la fiche
     * « à mettre à jour » à CHAQUE import, pour toujours. Le rapport annoncerait des mises à jour qui n'en sont
     * pas, et l'idempotence de l'import — sa propriété la plus précieuse — serait perdue en silence.
     */
    const verrouilles = new Set(COLONNES.filter(
      (col) => avant !== undefined && verrous.has(CLE_VERROU('proprietaire', avant.id as string, col))));
    const comparable: Empreinte = { ...apres };
    for (const col of verrouilles) {
      delete comparable[col];
      if (avant !== undefined && (avant[col] ?? '') !== (apres[col] ?? '')) {
        c.divergences.push(phraseDivergence(p.nomComplet, col, apres[col], avant[col]));
      }
    }

    if (avant === undefined) c.proprietairesCrees += 1;
    else if (memeEmpreinte(comparable, avant)) { c.proprietairesInchanges += 1; retenir(p, Number(avant.id)); continue; }
    else { c.proprietairesMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer) { if (avant !== undefined) retenir(p, Number(avant.id)); continue; }
    const { set } = setSansVerrous(COLONNES, verrouilles);
    const { rows: r } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_proprietaire
         (wippimmo_id, civilite, nom, prenom, nom_complet, nom_normalise, adresse, commune, code_postal,
          adresse_normalisee, relation_depuis, absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,NULL,now())
       ON CONFLICT (wippimmo_id) DO UPDATE SET ${set}
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
  q: RequeteTx, plan: PlanImport, appliquer: boolean, c: ComptesImport, verrous: Verrous,
): Promise<Map<string, number>> {
  const { rows } = await q<{ id: string; cle_personne: string } & Empreinte>(
    `SELECT id, cle_personne, wippimmo_id, nom, nom_normalise, adresse, commune, code_postal,
            adresse_normalisee, absent_le::text
       FROM gestion_annuaire_locataire`);
  const existants = new Map(rows.map((r) => [r.cle_personne, r]));
  const ids = new Map<string, number>();
  const COLONNES = ['wippimmo_id', 'nom', 'nom_normalise', 'adresse', 'commune', 'code_postal',
    'adresse_normalisee'] as const;

  for (const p of plan.locataires) {
    const avant = existants.get(p.clePersonne);
    const apres: Empreinte = {
      wippimmo_id: p.wippimmoId, nom: p.nom, nom_normalise: p.nomNormalise, adresse: p.adresse,
      commune: p.commune, code_postal: p.codePostal, adresse_normalisee: p.adresseNormalisee, absent_le: null,
    };
    // 🔴 MÊME RÈGLE QUE POUR LES PROPRIÉTAIRES : un champ saisi ici est prioritaire, et la divergence se DIT.
    const verrouilles = new Set(COLONNES.filter(
      (col) => avant !== undefined && verrous.has(CLE_VERROU('locataire', avant.id as string, col))));
    const comparable: Empreinte = { ...apres };
    for (const col of verrouilles) {
      delete comparable[col];
      if (avant !== undefined && (avant[col] ?? '') !== (apres[col] ?? '')) {
        c.divergences.push(phraseDivergence(p.nom, col, apres[col], avant[col]));
      }
    }

    if (avant === undefined) c.locatairesCrees += 1;
    else if (memeEmpreinte(comparable, avant)) { c.locatairesInchanges += 1; ids.set(p.clePersonne, Number(avant.id)); continue; }
    else { c.locatairesMajs += 1; if (avant.absent_le !== null) c.revenus += 1; }

    if (!appliquer) { if (avant !== undefined) ids.set(p.clePersonne, Number(avant.id)); continue; }
    const { set } = setSansVerrous(COLONNES, verrouilles);
    const { rows: r } = await q<{ id: string }>(
      `INSERT INTO gestion_annuaire_locataire
         (cle_personne, wippimmo_id, nom, nom_normalise, adresse, commune, code_postal, adresse_normalisee,
          absent_le, importe_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,now())
       ON CONFLICT (cle_personne) DO UPDATE SET ${set}
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
  verrous: Verrous = new Map(),
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

  /**
   * ══ 🔴🔴 UNE PERSONNE DONT LES COORDONNÉES ONT ÉTÉ SAISIES ICI EST INTOUCHABLE ══════════════════════════════
   *
   * Règle d'Arno : ce qui est modifié dans l'application est PRIORITAIRE. Pour les coordonnées, le verrou porte
   * sur le BLOC entier (`champ = 'contacts'`) : elles se modifient ensemble — ajouter, retirer, réordonner sont
   * le même geste — et les verrouiller une par une obligerait à inventer une identité stable pour chaque numéro.
   *
   * 🔴 « INTOUCHABLE » VEUT DIRE LES DEUX SENS : l'import n'AJOUTE pas les siennes, et ne MARQUE PAS ABSENTES
   * celles qu'il ne connaît plus. Ne faire que la moitié laisserait la fiche d'Arno se vider toute seule à chaque
   * import — le pire résultat possible, parce qu'il ressemble à un effacement sans en être un.
   */
  const bloque = (sujet: string, sujetId: string | number | null): boolean =>
    sujetId !== null && verrous.has(CLE_VERROU(sujet, sujetId, 'contacts'));

  for (const a of attendus) {
    if (bloque(a.sujet, a.sujetId)) {
      const cleV = a.sujetId === null ? null : identite(a.sujet, a.sujetId, a.contact.sorte, a.contact.valeur);
      // On ne le dit que si l'export apporte quelque chose que la fiche n'a pas : sinon il n'y a pas divergence.
      if (cleV !== null && !existants.has(cleV)) {
        c.divergences.push(phraseDivergence(
          `${a.sujet} ${a.sujetId}`, `coordonnée ${a.contact.sorte}`, a.contact.valeurBrute, 'retirée ou absente'));
      }
      continue;
    }
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
    const [sujet, sujetId, sorte, valeur] = cle.split('|');
    // 🔴 L'AUTRE MOITIÉ DU VERROU : une fiche dont les coordonnées sont à nous ne se vide pas toute seule.
    if (bloque(sujet, sujetId)) continue;
    c.contactsRetires += 1;
    if (!appliquer) continue;
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
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — L'IDENTIFIANT DE LA LIGNE. Ajouté, rien n'est retiré.
   *
   * Il sert à DEUX gestes qui ne peuvent pas s'en passer : l'écran « Séparer en deux personnes » (Arno répartit
   * CHAQUE coordonnée par une case à cocher — il faut donc pouvoir la nommer) et l'archivage d'une coordonnée
   * retirée à la main. Désigner une coordonnée par sa valeur aurait suffi tant qu'elles sont uniques par
   * personne… ce qui est vrai en base, mais cesserait de l'être au premier doublon d'affichage.
   */
  id: number;
  sorte: 'telephone' | 'email'; valeur: string; affichage: string; absent: boolean;
  /**
   * 🔴 LOT ANNOTATIONS-TEL — CE QUI TRAÎNAIT À CÔTÉ DU NUMÉRO, et qui mérite d'être lu : « M.Moreau », un second
   * numéro, une marque de doute. L'écran le pose en petite note grise SOUS le numéro. `null` = rien à dire.
   *
   * ⚠️ IL N'EST JAMAIS DANS LA VALEUR NI DANS CE QU'ON COPIE : le numéro se compose et se recopie seul.
   */
  note: string | null;
  /**
   * 🔴 LE TYPE QUE L'ANNOTATION IMPOSE (« (M) » → Mobile, « (F) », « Bureau » → Fixe). Il l'emporte sur le libellé
   * importé : il est écrit à côté du numéro lui-même, donc plus précis que l'intitulé de la colonne.
   */
  typeAnnotation: 'mobile' | 'fixe' | null;
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

/**
 * ══ 🔴🔴 UNE PERSONNE DE L'ANNUAIRE, TELLE QU'UNE CARTE LA MONTRE ═════════════════════════════════════════════
 *
 * Demande d'Arno (complément à l'étape C) : « chaque propriétaire (et chaque locataire sur les fiches bien et
 * locataire) est une CARTE, et les cartes se suivent de gauche à droite […] « Modifier » (icône crayon) en haut à
 * droite de chaque carte ». Une carte a donc besoin de TOUT ce qui s'y modifie — et d'un identifiant, puisque
 * chaque geste porte sur UNE personne.
 *
 * 🔴 LE MÊME OBJET POUR UN PROPRIÉTAIRE ET POUR UN LOCATAIRE. Ce sont deux tables, mais une seule carte à
 * l'écran, un seul formulaire, un seul jeu de gestes. Deux types jumeaux auraient dédoublé le composant, puis
 * divergé au premier ajout de champ.
 *
 * ⚠️ `qualite`, `note`, `rang` ET `archive` SONT `null`/0/`false` SANS LA MIGRATION 278 : les colonnes ne sont
 * alors nommées nulle part, l'écran écrit « non renseigné », et « Modifier » est rendu DÉSACTIVÉ avec son motif.
 */
export interface PersonneAnnuaire {
  sujet: 'proprietaire' | 'locataire';
  id: number;
  /** La clé WIPPIMMO — l'identité qui survit à un ré-import, et la cible d'un rattachement. */
  cle: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  /** Le nom tel qu'on l'affiche : « M. ROI Nathan ». Recomposé côté base pour les propriétaires. */
  nomAffiche: string;
  qualite: string | null;
  note: string | null;
  /** L'ordre réglé à la main. 0 = jamais réglé — l'écran retombe alors sur Monsieur, Madame, puis les autres. */
  rang: number;
  /** Vrai quand la fiche est ARCHIVÉE (jamais supprimée). Elle sort des listes actives et se restaure. */
  archive: boolean;
  /** Quand elle a été archivée, et par qui — pour que « Restaurer » sache ce qu'il défait. */
  archiveLe: string | null;
  archivePar: string | null;
  adresse: string | null; commune: string | null; codePostal: string | null;
  absent: boolean;
  contacts: ContactAffiche[];
  /**
   * ══ 🔴🔴 LOT FICHES-RETOUCHES-2 — CETTE PERSONNE EST-ELLE LE DERNIER PROPRIÉTAIRE D'UN BIEN ? ═════════════════
   *
   * Vrai quand l'archiver laisserait AU MOINS UN bien sans aucun propriétaire actif. L'écran grise alors
   * « Archiver », avec l'infobulle « Un bien doit toujours avoir au moins un propriétaire » — et le serveur
   * refuse de la même façon si on l'appelle directement (`lotSansProprietaireApres`).
   *
   * 🔴 CALCULÉ EN BASE, PAS À L'ÉCRAN. L'écran ne voit que les propriétaires de LA FICHE OUVERTE ; une personne
   * peut posséder d'autres biens, avec d'autres co-propriétaires. Un calcul côté écran dirait « il en reste un »
   * en regardant la mauvaise liste — et griserait, ou dégriserait, au hasard.
   *
   * ⚠️ TOUJOURS `false` POUR UN LOCATAIRE : un logement peut être vacant, et un locataire s'archive sans que rien
   * ne devienne incohérent. La règle ne vaut que pour les propriétaires.
   */
  dernierProprietaire: boolean;
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
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — LES CARTES DU BLOC « COORDONNÉES », DANS L'ORDRE.
   *
   * Le ou les propriétaires du même ensemble de biens. Sans la migration 278, elle porte EXACTEMENT une personne,
   * celle de la fiche — la vérité d'aujourd'hui, puisqu'un lot n'a qu'un propriétaire à l'import.
   *
   * ⚠️ `nom`, `civilite`, `contacts`, `adresse` (au-dessus) RESTENT : d'autres écrans les lisent, et l'en-tête de
   * la fiche s'en sert. `personnes` ajoute, il ne remplace pas.
   */
  personnes: PersonneAnnuaire[];
  /**
   * Vrai quand la migration 278 est là. Faux = les fiches s'affichent en LECTURE SEULE et « Modifier » est rendu
   * DÉSACTIVÉ avec son motif écrit — jamais absent, ce qui enverrait chercher un bug.
   */
  modifiable: boolean;
  /** 🔴 LOT SUPPRIMER-CARTE — vrai quand la migration 287 est là. Faux ⇒ « Supprimer » n'est pas offert. */
  suppressionDisponible: boolean;
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
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — L'IDENTIFIANT DE L'OCCUPATION, et non celui de la personne. C'est LUI que
   * « enregistrer un départ » date : une même personne peut avoir occupé deux fois le même logement, et daterait
   * alors la mauvaise période si on la désignait par son seul nom.
   */
  occupationId: number;
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
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — LES CARTES DES PROPRIÉTAIRES DE CE BIEN, dans l'ordre. Sans la migration
   * 278 : exactement celui de l'import. Avec : tous ceux dont le lien vers ce lot est EN COURS.
   */
  proprietaires: PersonneAnnuaire[];
  /**
   * 🔴 LES CARTES DES OCCUPANTS EN PLACE (occupation sans date de sortie), dans l'ordre. `occupations` reste :
   * c'est lui qui porte l'HISTORIQUE, avec les dates. Celui-ci porte de quoi MODIFIER une personne.
   */
  occupants: PersonneAnnuaire[];
  /** Vrai quand la migration 278 est là. Faux = lecture seule, « Modifier » désactivé avec son motif. */
  modifiable: boolean;
  /** 🔴 LOT SUPPRIMER-CARTE — vrai quand la migration 287 est là. Faux ⇒ « Supprimer » n'est pas offert. */
  suppressionDisponible: boolean;
  /**
   * 🔴 LOT FICHES-RETOUCHES-2 — COMBIEN D'ÉVÉNEMENTS OUVERTS CONCERNENT CE BIEN. Le cartouche orange de l'en-tête
   * s'affiche dès qu'il y en a un, et dit le nombre au-delà. Même lecture que la carte de la fiche propriétaire
   * (`BienDuProprietaire.evenementsOuverts`) : un événement NON TRAITÉ, affecté à un échange dont un mail porte un
   * rattachement CONFIRMÉ vers ce lot.
   */
  evenementsOuverts: number;
}

/**
 * ══ 🔴🔴 LE LOGEMENT D'UN LOCATAIRE, TEL QU'UNE CARTE LE MONTRE ═══════════════════════════════════════════════
 *
 * Demande d'Arno (étape C) : « fiche locataire plus légère : coordonnées, le logement en carte vers la fiche
 * bien, les dates, le propriétaire, et ses mails ». Une carte a donc besoin du bien ET de son propriétaire —
 * sinon il faudrait ouvrir la fiche du bien pour savoir à qui appartient le logement qu'on habite.
 *
 * ⚠️ `horsGestion` VEUT DIRE « CE LOT N'EST PAS DANS NOTRE ANNUAIRE » (l'occupation le nomme par une clé
 * WIPPIMMO que `gestion_annuaire_lot` ne porte pas). La carte n'est alors pas cliquable, et le DIT — plutôt
 * qu'un lien vers une fiche inexistante.
 */
export interface LogementDuLocataire {
  lotId: number | null;
  numero: string;
  adresse: string | null; commune: string | null; codePostal: string | null;
  nature: string | null; typeBien: string | null;
  /** 🔴 TOUJOURS `null` : aucune colonne de surface n'existe. L'écran écrit « non renseignée ». */
  surfaceM2: number | null;
  entree: string | null; sortie: string | null; encours: boolean; horsGestion: boolean;
  proprietaireId: number | null; proprietaireNom: string | null;
  /** Combien de mails sont rattachés à ce bien (rattachements CONFIRMÉS), et le dernier. */
  mails: number; dernierEchange: string | null;
  driveDossierId: string | null;
}

export interface FicheLocataire {
  id: number; nom: string; adresse: string | null; commune: string | null; codePostal: string | null;
  absent: boolean; contacts: ContactAffiche[];
  occupations: { lotId: number | null; numero: string; adresse: string | null; commune: string | null;
    entree: string | null; sortie: string | null; encours: boolean; horsGestion: boolean }[];
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — LES LOGEMENTS EN CARTES. `occupations` (au-dessus) RESTE : l'écran de
   * recherche et l'encart de la boîte le lisent. `logements` porte EN PLUS ce qu'une carte demande.
   */
  logements: LogementDuLocataire[];
  /**
   * ══ 🔴🔴 RÈGLE D'ARNO : « chercher un locataire montre TOUS les occupants du même logement » ═══════════════
   *
   * Les cartes du bloc « Coordonnées » de la fiche locataire portent donc la personne demandée ET les autres
   * occupants EN PLACE du même logement — pas seulement celle dont on a tapé le nom. On appelle le foyer, pas
   * un nom : ne montrer qu'un des deux conjoints ferait rater l'autre numéro, et c'est exactement ce qu'Arno
   * décrit comme le défaut de l'annuaire d'avant.
   *
   * La personne demandée est TOUJOURS dedans, même sans logement en cours (un locataire parti garde sa fiche).
   */
  personnes: PersonneAnnuaire[];
  /** Vrai quand la migration 278 est là. Faux = lecture seule, « Modifier » désactivé avec son motif. */
  modifiable: boolean;
  /** 🔴 LOT SUPPRIMER-CARTE — vrai quand la migration 287 est là. Faux ⇒ « Supprimer » n'est pas offert. */
  suppressionDisponible: boolean;
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
        WHERE true${await conditionCoordonneeVivante()}
          AND (($2::text IS NOT NULL AND valeur = $2)
            OR ($3::text IS NOT NULL AND valeur LIKE $3)
            OR ($4::text IS NOT NULL AND valeur = $4))
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
  /**
   * ══ 🔴🔴 LOT FICHES-ANNUAIRE (étape C) — DEUX LIBELLÉS, ET LE NÔTRE GAGNE ═══════════════════════════════════
   *
   * `libelle_source` garde ce que WIPPIMMO écrivait ; `libelle` (migration 278) porte ce qu'Arno a saisi. On rend
   * le second QUAND IL EXISTE, et le premier sinon : écraser `libelle_source` aurait perdu la trace de l'import,
   * et ignorer `libelle` aurait fait taire la saisie — les deux coexistent, et c'est voulu.
   *
   * ⚠️ UNE COORDONNÉE ARCHIVÉE À LA MAIN NE SORT PLUS. `archive_le` (retirée par nous) est DISTINCTE de
   * `absent_le` (plus dans le dernier export) : la première disparaît de la fiche, la seconde s'affiche grisée
   * parce qu'elle a servi et pourrait resservir. Les confondre effacerait de l'historique ou ferait réapparaître
   * ce que quelqu'un venait de retirer.
   *
   * 🔴 LES DEUX SONDES VOYAGENT AVEC LEURS COLONNES : sans la migration 268 il n'y a pas de `libelle_source`,
   * sans la 278 ni `libelle` ni `archive_le` — et les NOMMER ferait échouer toute la fiche.
   */
  const modifiable = await annuaireModifiableDisponible();
  const colonneLibelle = modifiable && avecLibelle ? 'coalesce(libelle, libelle_source)'
    : modifiable ? 'libelle'
      : avecLibelle ? 'libelle_source' : 'NULL::text';
  const { rows } = await query<{
    id: string; sorte: string; valeur: string; valeur_brute: string; absent_le: string | null;
    libelle: string | null;
  }>(
    `SELECT id::text, sorte, valeur, valeur_brute, absent_le::text,
            ${colonneLibelle} AS libelle
       FROM gestion_annuaire_contact
      WHERE sujet = $1 AND sujet_id = $2${modifiable ? ' AND archive_le IS NULL' : ''}
      /* 🔴 L'ORDRE MANUEL PASSE DEVANT LA SORTE — CORRIGE A L'ECRAN LE 29/09/2026.
         Arno demande de pouvoir « reordonner des telephones et des e-mails ». Trier d'abord par la SORTE rendait
         ce geste sans effet : la liste revenait toujours e-mails puis telephones, quel que soit le rang
         enregistre. La carte, elle, GROUPE par sorte a l'affichage (telephones ensemble, e-mails ensemble) :
         retirer la sorte du tri ne change donc rien a ce qu'on voit, et rend au rang son sens.
         Sans la migration 278, le tri reste MOT POUR MOT celui d'avant : rien n'a pu etre reordonne.
         AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
         terminerait — piege consigne DOUZE fois dans ce depot, et douze fois dans un commentaire. */
      ORDER BY ${modifiable ? '' : 'sorte, '}absent_le NULLS FIRST, rang, id`, [sujet, sujetId]);
  return rows.map((r) => ({
    id: Number(r.id),
    sorte: r.sorte as 'telephone' | 'email',
    valeur: r.valeur,
    /**
     * ══ 🔴 LOT FICHES-RETOUCHES — UN NUMÉRO LISIBLE, GROUPÉ PAR DEUX ════════════════════════════════════════
     *
     * L'INVARIANT D'AVANT DISAIT : « On affiche CE QUI ÉTAIT ÉCRIT : un numéro reformaté n'est plus reconnu par
     * celui qui l'a saisi. » Il est RÉÉCRIT, et non abandonné — Arno a tranché l'autre sens : « Tout numéro
     * affiché PAR L'APP est groupé par deux chiffres ». La crainte d'origine était qu'un reformatage rende le
     * numéro méconnaissable ; `formaterTelephone` fait l'inverse, puisqu'il RESPECTE l'écriture d'origine
     * (national ou international) et laisse un numéro étranger tel quel. Ce qui est reformaté, ce sont les
     * 0659088256 collés de l'export — précisément ceux qu'on ne sait pas lire à voix haute.
     *
     * ⚠️ UN E-MAIL N'EST PAS TOUCHÉ : `formaterTelephone` ne s'applique qu'aux téléphones.
     */
    affichage: r.sorte === 'telephone'
      ? formaterTelephone(r.valeur, r.valeur_brute)
      : (r.valeur_brute.trim() === '' ? r.valeur : r.valeur_brute),
    note: r.sorte === 'telephone' ? decortiquerNumero(r.valeur_brute).note : null,
    typeAnnotation: r.sorte === 'telephone' ? decortiquerNumero(r.valeur_brute).type : null,
    absent: r.absent_le !== null,
    libelle: r.libelle === null || r.libelle.trim() === '' ? null : r.libelle.trim(),
  }));
};

/**
 * ══ 🔴🔴 LES PERSONNES D'UNE CARTE, DANS L'ORDRE, AVEC LEURS COORDONNÉES ══════════════════════════════════════
 *
 * UNE SEULE REQUÊTE POUR TOUTES LES PERSONNES demandées, puis une lecture de coordonnées par personne DISTINCTE.
 * Un bien a un ou deux propriétaires, exceptionnellement quatre : lire chacun séparément se verrait à l'écran, et
 * c'est la règle du module depuis la liste de la boîte.
 *
 * 🔴 L'ORDRE VIENT DE LA BASE, PAS DE L'ÉCRAN. `rang` réglé à la main d'abord (les 0 en dernier, puisque 0 veut
 * dire « jamais réglé »), puis Monsieur, puis Madame, puis les autres, puis le nom. L'écran peut donc afficher le
 * tableau tel quel — et deux écrans qui lisent la même liste la montrent dans le même ordre.
 *
 * ⚠️ LES ARCHIVÉES SONT RENDUES, ET DITES ARCHIVÉES. Les cacher ici priverait « Restaurer » de sa cible ; c'est
 * l'appelant qui choisit de les ranger à part.
 */
async function personnesDe(
  sujet: 'proprietaire' | 'locataire', ids: readonly number[],
): Promise<PersonneAnnuaire[]> {
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return [];
  const modifiable = await annuaireModifiableDisponible();
  /* ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
     terminerait — piege consigne DOUZE fois dans ce depot, et douze fois dans un commentaire.
     Les colonnes de la migration 278 ne sont NOMMEES que si la sonde les a vues ; sinon on rend des valeurs
     neutres, de meme type, pour que le reste de la requete ne bouge pas d'une ligne. */
  const neuves = modifiable
    ? `qualite, note, rang, archive_le::text, archive_par_libelle`
    : `NULL::text AS qualite, NULL::text AS note, 0 AS rang, NULL::text AS archive_le,
       NULL::text AS archive_par_libelle`;
  const identite = sujet === 'proprietaire'
    ? `wippimmo_id AS cle, civilite, prenom, nom, nom_complet AS nom_affiche`
    : modifiable
      ? `cle_personne AS cle, civilite, prenom, nom, nom AS nom_affiche`
      : `cle_personne AS cle, NULL::text AS civilite, NULL::text AS prenom, nom, nom AS nom_affiche`;
  /**
   * 🔴 L'ORDRE DEMANDÉ PAR ARNO : « Monsieur en premier, Madame en deuxième, puis les autres (société,
   * représentant…) ; l'ordre se règle à la main dans le mode Modifier ». Le rang réglé à la main PASSE DEVANT.
   *
   * ⚠️ « Mme » AVANT « M » DANS LE CASE, exprès : `'Mme' ILIKE 'm%'` est VRAI, et tester Monsieur d'abord
   * rangerait toutes les dames en première position. Le piège est silencieux — il ne se voit qu'à l'écran.
   */
  /**
   * ⚠️ `0::int`, ET NON `0` TOUT NU. Dans un `ORDER BY`, PostgreSQL lit un entier littéral comme une POSITION de
   * colonne : `ORDER BY 0` échoue par « ORDER BY position 0 is not in select list », et `ORDER BY 2` trierait
   * silencieusement sur la deuxième colonne du SELECT. Le transtypage en fait une expression, donc une constante.
   * Défaut mesuré à l'écran le 29/09/2026 : la fiche rendait « Fiche illisible » sans la migration 278.
   */
  const rangTri = modifiable ? 'rang' : '0::int';
  const civiliteTri = sujet === 'proprietaire' || modifiable ? 'civilite' : 'NULL::text';

  const { rows } = await query<{
    id: string; cle: string; civilite: string | null; prenom: string | null; nom: string; nom_affiche: string;
    qualite: string | null; note: string | null; rang: number; archive_le: string | null;
    archive_par_libelle: string | null; adresse: string | null; commune: string | null;
    code_postal: string | null; absent_le: string | null;
  }>(
    `SELECT id::text, ${identite}, ${neuves}, adresse, commune, code_postal, absent_le::text
       FROM ${sujet === 'proprietaire' ? 'gestion_annuaire_proprietaire' : 'gestion_annuaire_locataire'} pe
      WHERE id = ANY($1::bigint[]) AND ${await sqlPersonneVivante('pe')}
      ORDER BY (${rangTri} = 0), ${rangTri},
               CASE WHEN ${civiliteTri} ILIKE 'mme%' OR ${civiliteTri} ILIKE 'mad%' THEN 1
                    WHEN ${civiliteTri} ILIKE 'm%' THEN 0
                    ELSE 2 END,
               nom, id`,
    [uniques]);

  const coords = new Map<number, ContactAffiche[]>();
  for (const r of rows) coords.set(Number(r.id), await contactsDe(sujet, Number(r.id)));
  const derniers = sujet === 'proprietaire'
    ? await derniersProprietaires(rows.map((r) => Number(r.id)))
    : new Set<number>();

  return rows.map((r) => ({
    sujet, id: Number(r.id), cle: r.cle,
    civilite: r.civilite, prenom: r.prenom, nom: r.nom, nomAffiche: r.nom_affiche,
    qualite: r.qualite, note: r.note, rang: r.rang,
    archive: r.archive_le !== null, archiveLe: r.archive_le, archivePar: r.archive_par_libelle,
    adresse: r.adresse, commune: r.commune, codePostal: r.code_postal,
    absent: r.absent_le !== null,
    contacts: coords.get(Number(r.id)) ?? [],
    dernierProprietaire: derniers.has(Number(r.id)),
  }));
}

/**
 * ══ 🔴🔴 QUI EST LE DERNIER PROPRIÉTAIRE D'AU MOINS UN BIEN ═══════════════════════════════════════════════════════
 *
 * Rend les identifiants de ceux dont l'archivage laisserait un bien SANS aucun propriétaire actif.
 *
 * 🔴 UNE SEULE REQUÊTE POUR TOUTE LA RANGÉE, jamais une par carte : la fiche de JULLIEN-GARRIDO en porte cinq, et
 * cinq allers-retours de plus se verraient. C'est la règle du module depuis la liste de la boîte.
 *
 * 🔴 LA MÊME LECTURE QUE LE GARDE DU SERVEUR (`lotSansProprietaireApres`, annuaireEditionRepo) : deux sources de
 * propriété — celle de l'import (`gestion_annuaire_lot.proprietaire_id`) et les liens ajoutés à la main, EN COURS.
 * Si l'écran et le serveur ne regardaient pas la même chose, un bouton actif mènerait à un refus, ou l'inverse.
 *
 * ⚠️ VIDE SANS LA MIGRATION 278 : personne n'est archivable de toute façon, et la table des liens n'existe pas.
 */
async function derniersProprietaires(ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0 || !await annuaireModifiableDisponible()) return new Set();
  const { rows } = await query<{ proprietaire_id: string }>(
    /* AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
       terminerait — piege consigne TREIZE fois dans ce depot, et treize fois dans un commentaire.
       liens : (personne, lot) pour les personnes demandees, par l'une ou l'autre source de propriete. */
    `WITH liens AS (
       SELECT proprietaire_id, id AS lot_id FROM gestion_annuaire_lot
        WHERE proprietaire_id = ANY($1::bigint[])
       UNION
       SELECT proprietaire_id, lot_id FROM gestion_annuaire_lot_proprietaire
        WHERE proprietaire_id = ANY($1::bigint[]) AND jusqu_a IS NULL
     )
     SELECT DISTINCT li.proprietaire_id::text AS proprietaire_id
       FROM liens li JOIN gestion_annuaire_lot lo ON lo.id = li.lot_id
      WHERE NOT EXISTS (
        SELECT 1 FROM gestion_annuaire_proprietaire pr
         WHERE pr.id = lo.proprietaire_id AND pr.id <> li.proprietaire_id AND pr.archive_le IS NULL)
        AND NOT EXISTS (
        SELECT 1 FROM gestion_annuaire_lot_proprietaire lp
          JOIN gestion_annuaire_proprietaire pr2 ON pr2.id = lp.proprietaire_id
         WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL AND lp.proprietaire_id <> li.proprietaire_id
           AND pr2.archive_le IS NULL)`, [[...ids]]);
  return new Set(rows.map((r) => Number(r.proprietaire_id)));
}

/**
 * ══ 🔴🔴 LES CO-PROPRIÉTAIRES D'UN MÊME ENSEMBLE DE BIENS ═════════════════════════════════════════════════════
 *
 * Demande d'Arno (étape A, rappelée par le complément) : le premier bloc porte « les COORDONNÉES COMPLÈTES du ou
 * des propriétaires du même ensemble de biens (co-propriétaires, indivision, société + représentant) ».
 *
 * ═══ CE QUE LA BASE SAIT, MESURÉ LE 29/09/2026 ════════════════════════════════════════════════════════════════
 * `gestion_annuaire_lot.proprietaire_id` est UNIQUE par lot : l'import ne sait pas dire « ce bien a deux
 * propriétaires ». 66 fiches sur 307 nomment pourtant deux personnes DANS leur nom (« AISSAOUI Mohamed et
 * Amina »). Un ensemble de co-propriétaires ne peut donc exister que par le geste d'Arno.
 *
 * 🔴 D'OÙ LA TABLE `gestion_annuaire_lot_proprietaire` (migration 278) : elle porte les liens AJOUTÉS à la main,
 * avec leur rang et leur période. Sans elle, cette fonction rend la personne demandée, SEULE — ce qui est la
 * vérité d'aujourd'hui, et non une carte vide.
 */
async function coproprietairesDe(proprietaireId: number): Promise<PersonneAnnuaire[]> {
  if (!await annuaireModifiableDisponible()) return personnesDe('proprietaire', [proprietaireId]);
  const { rows } = await query<{ proprietaire_id: string }>(
    /**
     * ⚠️ DEUX SOURCES DE PROPRIÉTÉ, ET IL FAUT LES DEUX. Corrigé le 29/09/2026, sur la fiche de M. ROI Nathan :
     * un co-propriétaire venait d'être ajouté, et la fiche n'en montrait toujours qu'un. La raison : la requête
     * ne partait que de la table des liens AJOUTÉS, où le propriétaire D'ORIGINE n'a aucune ligne — c'est
     * `gestion_annuaire_lot.proprietaire_id` qui le porte, et l'import ne remplit pas l'autre table.
     *
     * On cherche donc D'ABORD SES BIENS (par l'une ou l'autre source), puis TOUS ceux qui les possèdent, par
     * l'une ou l'autre source. Un lien AJOUTÉ ne compte que s'il est EN COURS (`jusqu_a IS NULL`) : un ancien
     * propriétaire appartient à l'historique du bien, pas au bloc des coordonnées d'aujourd'hui.
     *
     * AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
     * terminerait — piege consigne DOUZE fois dans ce depot, et douze fois dans un commentaire.
     */
    `WITH ses_lots AS (
       SELECT id AS lot_id FROM gestion_annuaire_lot WHERE proprietaire_id = $1
       UNION
       SELECT lot_id FROM gestion_annuaire_lot_proprietaire WHERE proprietaire_id = $1 AND jusqu_a IS NULL
     )
     SELECT DISTINCT lo.proprietaire_id::text AS proprietaire_id
       FROM gestion_annuaire_lot lo JOIN ses_lots s ON s.lot_id = lo.id
      WHERE lo.proprietaire_id IS NOT NULL
     UNION
     SELECT DISTINCT lp.proprietaire_id::text
       FROM gestion_annuaire_lot_proprietaire lp JOIN ses_lots s ON s.lot_id = lp.lot_id
      WHERE lp.jusqu_a IS NULL`, [proprietaireId]);
  const ids = [proprietaireId, ...rows.map((r) => Number(r.proprietaire_id))];
  return personnesDe('proprietaire', ids);
}

export async function ficheProprietaire(id: number): Promise<IssueLecture<FicheProprietaire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; wippimmo_id: string; nom_complet: string; civilite: string | null; adresse: string | null;
    commune: string | null; code_postal: string | null; relation_depuis: string | null; absent_le: string | null;
  }>(`SELECT id, wippimmo_id, nom_complet, civilite, adresse, commune, code_postal, relation_depuis::text,
             absent_le::text
        FROM gestion_annuaire_proprietaire pe
       WHERE id = $1 AND ${await sqlPersonneVivante('pe')}`, [id]);
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
      personnes: await coproprietairesDe(Number(p.id)),
      modifiable: await annuaireModifiableDisponible(),
      /**
       * 🔴 LOT SUPPRIMER-CARTE — la migration 287 est-elle là ? Faux ⇒ l'entrée « Supprimer » n'est pas offerte
       * du tout : proposer un geste que la base ne saurait pas garder serait pire qu'une fonction absente.
       */
      suppressionDisponible: await suppressionPersonneDisponible(),
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
    id: string; locataire_id: string; nom: string; entree: string | null; sortie: string | null;
    adresse: string | null; commune: string | null; code_postal: string | null;
  }>(
    `SELECT o.id::text, o.locataire_id::text, l.nom, o.entree::text, o.sortie::text,
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

  /**
   * ══ 🔴 LES PROPRIÉTAIRES DE CE BIEN, POUR LES CARTES ══════════════════════════════════════════════════════
   * Avec la migration 278 : les liens EN COURS de la table dédiée — c'est ce qui permet la co-propriété et la
   * vente. Sans elle : le propriétaire unique de l'import, ce qui est la vérité d'aujourd'hui.
   */
  const modifiable = await annuaireModifiableDisponible();

  /**
   * 🔴 LES ÉVÉNEMENTS OUVERTS DE CE BIEN. Même lecture que la carte de la fiche propriétaire, au mot près : deux
   * comptages différents pour un même bien finiraient par se contredire d'un écran à l'autre.
   */
  const { rows: ev } = await query<{ n: number }>(
    `SELECT count(DISTINCT e.id)::int AS n
       FROM gestion_evenement e
       JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif
       JOIN gestion_message m2 ON m2.fil_id = a.fil_id
       JOIN gestion_rattachement r2 ON r2.message_id = m2.id
      WHERE e.etat <> 'traite' AND r2.cible_sorte = 'lot' AND r2.cible_cle = $1
        AND r2.statut = 'confirme'`, [l.wippimmo_id]);

  let idsProprietaires: number[] = l.proprietaire_id === null ? [] : [Number(l.proprietaire_id)];
  if (modifiable) {
    const { rows: lp } = await query<{ proprietaire_id: string }>(
      `SELECT proprietaire_id::text FROM gestion_annuaire_lot_proprietaire
        WHERE lot_id = $1 AND jusqu_a IS NULL ORDER BY (rang = 0), rang, id`, [id]);
    idsProprietaires = [...idsProprietaires, ...lp.map((r) => Number(r.proprietaire_id))];
  }

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
        occupationId: Number(o.id),
        locataireId: Number(o.locataire_id), nom: o.nom, entree: o.entree, sortie: o.sortie,
        encours: o.sortie === null,
        adresse: o.adresse, commune: o.commune, codePostal: o.code_postal,
        contacts: coords.get(Number(o.locataire_id)) ?? [],
      })),
      evenementsOuverts: ev[0]?.n ?? 0,
      proprietaires: await personnesDe('proprietaire', idsProprietaires),
      occupants: await personnesDe(
        'locataire', occ.filter((o) => o.sortie === null).map((o) => Number(o.locataire_id))),
      modifiable,
      /**
       * 🔴 LOT SUPPRIMER-CARTE — la migration 287 est-elle là ? Faux ⇒ l'entrée « Supprimer » n'est pas offerte
       * du tout : proposer un geste que la base ne saurait pas garder serait pire qu'une fonction absente.
       */
      suppressionDisponible: await suppressionPersonneDisponible(),
    },
  };
}

export async function ficheLocataire(id: number): Promise<IssueLecture<FicheLocataire>> {
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    id: string; nom: string; adresse: string | null; commune: string | null; code_postal: string | null;
    absent_le: string | null;
  }>(`SELECT id, nom, adresse, commune, code_postal, absent_le::text
        FROM gestion_annuaire_locataire pe
       WHERE id = $1 AND ${await sqlPersonneVivante('pe')}`, [id]);
  const p = rows[0];
  if (p === undefined) return { etat: 'inconnu' };

  /**
   * ══ 🔴 LES LOGEMENTS, AVEC DE QUOI REMPLIR UNE CARTE, EN UNE SEULE REQUÊTE ═════════════════════════════════
   * Le bien, son propriétaire, ses mails et son dossier Drive par des jointures LATÉRALES — même forme que
   * `biensDuProprietaire`, et pour la même raison : un locataire a une à trois occupations, et trois
   * allers-retours de plus se verraient à l'écran.
   */
  const { rows: occ } = await query<{
    lot_id: string | null; numero: string; adresse: string | null; commune: string | null;
    code_postal: string | null; nature: string | null; type_bien: string | null;
    entree: string | null; sortie: string | null;
    proprietaire_id: string | null; proprietaire_nom: string | null;
    mails: number; dernier_echange: string | null; drive_id: string | null;
  }>(
    `SELECT o.lot_id::text, coalesce(lo.wippimmo_id, o.lot_wippimmo_id) AS numero, lo.adresse, lo.commune,
            lo.code_postal, lo.nature, lo.type_bien,
            o.entree::text, o.sortie::text,
            pr.id::text AS proprietaire_id, coalesce(pr.nom_complet, lo.proprietaire_texte) AS proprietaire_nom,
            coalesce(ma.n, 0)::int AS mails,
            ${INSTANT('ma.dernier')} AS dernier_echange,
            dr.drive_id
       FROM gestion_annuaire_occupation o
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT m.id)::int AS n, max(m.recu_le) AS dernier
           FROM gestion_rattachement r
           JOIN gestion_message m ON m.id = r.message_id
          WHERE r.cible_sorte = 'lot' AND r.cible_cle = lo.wippimmo_id AND r.statut = 'confirme'
       ) ma ON true
       LEFT JOIN gestion_drive_arbre dr
              ON dr.sorte = 'bien' AND dr.cle = lo.wippimmo_id AND dr.absent_le IS NULL
      WHERE o.locataire_id = $1
      ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST, o.id DESC`, [id]);

  /**
   * ══ 🔴🔴 TOUS LES OCCUPANTS DU MÊME LOGEMENT — LA RÈGLE D'ARNO ═════════════════════════════════════════════
   * « chercher un locataire montre TOUS les occupants du même logement ». On part donc des logements OCCUPÉS
   * aujourd'hui par cette personne, et on ramène toutes les occupations EN COURS de ces mêmes lots.
   *
   * ⚠️ LA PERSONNE DEMANDÉE EST TOUJOURS EN TÊTE DE LA LISTE D'IDENTIFIANTS : un locataire parti n'a plus de
   * logement en cours, et sa propre fiche ne doit pas disparaître de sa propre fiche.
   */
  const lotsEnCours = occ.filter((o) => o.sortie === null && o.lot_id !== null).map((o) => Number(o.lot_id));
  const idsFoyer = [Number(p.id)];
  if (lotsEnCours.length > 0) {
    const { rows: voisins } = await query<{ locataire_id: string }>(
      `SELECT DISTINCT locataire_id::text FROM gestion_annuaire_occupation
        WHERE lot_id = ANY($1::bigint[]) AND sortie IS NULL`, [lotsEnCours]);
    idsFoyer.push(...voisins.map((v) => Number(v.locataire_id)));
  }

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
      logements: occ.map((o) => ({
        lotId: o.lot_id === null ? null : Number(o.lot_id),
        numero: o.numero, adresse: o.adresse, commune: o.commune, codePostal: o.code_postal,
        nature: o.nature, typeBien: o.type_bien, surfaceM2: null,
        entree: o.entree, sortie: o.sortie, encours: o.sortie === null, horsGestion: o.lot_id === null,
        proprietaireId: o.proprietaire_id === null ? null : Number(o.proprietaire_id),
        proprietaireNom: o.proprietaire_nom,
        mails: o.mails, dernierEchange: o.dernier_echange, driveDossierId: o.drive_id,
      })),
      personnes: await personnesDe('locataire', idsFoyer),
      modifiable: await annuaireModifiableDisponible(),
      /**
       * 🔴 LOT SUPPRIMER-CARTE — la migration 287 est-elle là ? Faux ⇒ l'entrée « Supprimer » n'est pas offerte
       * du tout : proposer un geste que la base ne saurait pas garder serait pire qu'une fonction absente.
       */
      suppressionDisponible: await suppressionPersonneDisponible(),
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT ANNUAIRE-PERSONNES — CHERCHER UNE PERSONNE, ET RENDRE DES PERSONNES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le rôle d'une personne dans un résultat. Une même personne peut en porter deux. */
export type RolePersonne = 'proprietaire' | 'locataire' | 'ancien_locataire';

/** Un bien lié à une personne, en texte court : « 25 rue Edith Cavell, Courbevoie — lot 219 ». */
export interface BienLie {
  lotId: number | null;
  numero: string;
  adresse: string | null;
  commune: string | null;
}

export interface PersonneTrouvee {
  /** La fiche PRINCIPALE, celle qu'un clic ouvre. Propriétaire l'emporte quand la personne est les deux. */
  sujet: 'proprietaire' | 'locataire';
  id: number;
  cle: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  /** « M. JULLIEN - GARRIDO Cédric » — le nom tel qu'on l'écrit en gras. */
  nomAffiche: string;
  /** Un rôle, ou deux quand la personne est à la fois propriétaire et locataire. Dans l'ordre d'affichage. */
  roles: RolePersonne[];
  archive: boolean;
  /**
   * 🔴 LA FICHE SECONDAIRE, quand la personne porte DEUX fiches (propriétaire et locataire). Le clic principal
   * mène à la fiche propriétaire ; ce lien-ci mène à l'autre. Sans lui, une moitié de la personne serait
   * inatteignable depuis l'annuaire.
   */
  autreFicheId: number | null;
  /** Le PREMIER mobile, déjà formaté (« 06 59 08 82 56 »). `null` quand elle n'en a pas. */
  mobile: string | null;
  /** Le PREMIER e-mail. `null` quand elle n'en a pas. */
  email: string | null;
  biens: BienLie[];
  /** « propriétaire du lot 219 », « locataire en place du lot 219 »… `null` quand c'est le NOM qui a répondu. */
  raison: string | null;
  /**
   * 🔴 LA CLÉ DU BIEN PARTAGÉ, quand plusieurs personnes du résultat se rattachent au MÊME bien. L'écran les
   * range alors sous un filet discret : colocataires, couple, co-propriétaires — on voit qu'ils vont ensemble.
   * `null` = cette personne ne partage son bien avec personne d'autre dans CE résultat.
   */
  groupe: string | null;
}

export interface ResultatsPersonnes {
  personnes: PersonneTrouvee[];
  tronque: boolean;
}

/** Les mots d'un nom, triés — la seule identité qu'on accepte pour fondre deux fiches en une. PUR. */
function motsTries(nomNormalise: string): string {
  return nomNormalise.split(/\s+/).filter((m) => m !== '').sort().join(' ');
}

/**
 * ══ 🔴🔴 L'ANNUAIRE REND DES PERSONNES, PLUS DES BIENS ════════════════════════════════════════════════════════════
 *
 * Constat d'Arno : « un annuaire sert à chercher une PERSONNE. Aujourd'hui les résultats sont des biens
 * immobiliers. Il faut afficher des noms ; un clic sur un propriétaire mène à sa fiche propriétaire, un clic sur un
 * locataire à sa fiche locataire. »
 *
 * ═══ CE QUE LA RECHERCHE ACCEPTE N'A PAS BOUGÉ D'UN MOT ═══════════════════════════════════════════════════════════
 * Nom, prénom, adresse, commune, téléphone (espaces, points, +33), e-mail, n° de lot, sans accent ni casse. C'est
 * ce qu'elle REND qui change : la personne, jamais le bien.
 *   · un NOM      → la personne ;
 *   · une ADRESSE ou un N° DE LOT → le ou les propriétaires, les locataires en place et les anciens de ce bien,
 *                   chacun avec sa raison en clair (« propriétaire du lot 219 ») ;
 *   · un TÉLÉPHONE ou un E-MAIL → la personne qui le porte.
 *
 * 🔴 `rechercher` (au-dessus) N'EST PAS TOUCHÉE, et c'est voulu : elle rend des LOTS, et la recherche de bien du
 * panneau « Rattacher à un bien » en dépend. Deux questions, deux fonctions — les mêler aurait fait rendre des
 * personnes à un écran qui ne sait rattacher qu'à des biens.
 *
 * ⚠️ PLUSIEURS REQUÊTES PLUTÔT QU'UNE : deux pour trouver (propriétaires, locataires), deux pour enrichir
 * (coordonnées, biens). Les tables tiennent dans un souffle — 307 propriétaires, 510 locataires, 365 lots,
 * 1 793 coordonnées — et une seule requête portant les quatre questions serait illisible à la première relecture.
 */
export async function rechercherPersonnes(
  t: TermeRecherche, o: { avecArchivees?: boolean } = {},
): Promise<IssueLecture<ResultatsPersonnes>> {
  /**
   * 🔴 LOT SUPPRIMER-CARTE — « cette fiche existe-t-elle encore ? », décidé UNE fois (`personneVivanteAvec`).
   * Sans la migration 287, il rend `true` : la requête est alors mot pour mot celle d'avant ce lot.
   */
  const avecSuppression = await suppressionPersonneDisponible();
  const vivante = (alias: string): string => personneVivanteAvec(avecSuppression, alias);
  if (!(await annuaireDisponible())) return { etat: 'sans_schema' };
  if (t.vide) return { etat: 'ok', data: { personnes: [], tronque: false } };

  const modifiable = await annuaireModifiableDisponible();
  const chiffres = t.chiffres === null ? null : `%${t.chiffres}`;
  const mots = t.mots.length > 0 ? t.mots : [t.texte];
  const params = [mots, t.telephone, chiffres, t.email, t.numeroLot];

  /**
   * ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   * terminerait — piege consigne QUATORZE fois dans ce depot, et quatorze fois dans un commentaire.
   *
   * CONTACTS_TROUVES : la coordonnee tapee, sous ses trois formes (numero complet, fin de numero, e-mail).
   * LOTS_VISES       : les biens que l'adresse ou le numero de lot designent. Ce sont EUX qui ramenent des
   *                    personnes par leur bien, et la raison le dira en clair.
   * PAR_NOM          : « aucun mot ne manque » — chercher « garrido jullien » trouve « JULLIEN - GARRIDO ».
   */
  const COMMUN = `
    WITH mots AS (SELECT unnest($1::text[]) AS m),
    contacts_trouves AS (
      SELECT sujet, sujet_id FROM gestion_annuaire_contact
       WHERE absent_le IS NULL${await conditionCoordonneeVivante()}
         AND (($2::text IS NOT NULL AND valeur = $2)
           OR ($3::text IS NOT NULL AND valeur LIKE $3)
           OR ($4::text IS NOT NULL AND valeur = $4))
    ),
    lots_vises AS (
      SELECT lo.id, lo.wippimmo_id
        FROM gestion_annuaire_lot lo
       WHERE ($5::text IS NOT NULL AND lo.wippimmo_id = $5)
          OR NOT EXISTS (SELECT 1 FROM mots
                          WHERE (coalesce(lo.adresse_normalisee, '') || ' ' || coalesce(lo.code_postal, ''))
                                NOT LIKE '%' || m || '%')
    )`;

  // ── ① LES PROPRIÉTAIRES QUI RÉPONDENT ─────────────────────────────────────────────────────────────────────────
  const { rows: proprios } = await query<{
    id: string; cle: string; civilite: string | null; prenom: string | null; nom: string; nom_complet: string;
    nom_normalise: string; archive: boolean; par_nom: boolean; lot_vise: string | null;
  }>(
    `${COMMUN}
     SELECT pr.id::text, pr.wippimmo_id AS cle, pr.civilite, pr.prenom, pr.nom, pr.nom_complet, pr.nom_normalise,
            ${modifiable ? '(pr.archive_le IS NOT NULL)' : 'false'} AS archive,
            (NOT EXISTS (SELECT 1 FROM mots WHERE pr.nom_normalise NOT LIKE '%' || m || '%')) AS par_nom,
            (SELECT min(v.wippimmo_id) FROM lots_vises v
              JOIN gestion_annuaire_lot lo2 ON lo2.id = v.id
             WHERE lo2.proprietaire_id = pr.id) AS lot_vise
       FROM gestion_annuaire_proprietaire pr
      WHERE ${vivante('pr')} AND ((NOT EXISTS (SELECT 1 FROM mots WHERE pr.nom_normalise NOT LIKE '%' || m || '%'))
         OR pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire')
         OR EXISTS (SELECT 1 FROM lots_vises v JOIN gestion_annuaire_lot lo2 ON lo2.id = v.id
                     WHERE lo2.proprietaire_id = pr.id))`, params);

  // ── ② LES LOCATAIRES QUI RÉPONDENT, avec l'état de leur occupation ────────────────────────────────────────────
  const { rows: locs } = await query<{
    id: string; cle: string; civilite: string | null; prenom: string | null; nom: string; nom_normalise: string;
    archive: boolean; par_nom: boolean; en_place: boolean; lot_vise: string | null; lot_vise_en_cours: boolean;
  }>(
    `${COMMUN}
     SELECT lc.id::text, lc.cle_personne AS cle,
            ${modifiable ? 'lc.civilite, lc.prenom' : 'NULL::text AS civilite, NULL::text AS prenom'},
            lc.nom, lc.nom_normalise,
            ${modifiable ? '(lc.archive_le IS NOT NULL)' : 'false'} AS archive,
            (NOT EXISTS (SELECT 1 FROM mots WHERE lc.nom_normalise NOT LIKE '%' || m || '%')) AS par_nom,
            EXISTS (SELECT 1 FROM gestion_annuaire_occupation o
                     WHERE o.locataire_id = lc.id AND o.sortie IS NULL) AS en_place,
            (SELECT min(v.wippimmo_id) FROM lots_vises v
               JOIN gestion_annuaire_occupation o ON o.lot_id = v.id
              WHERE o.locataire_id = lc.id) AS lot_vise,
            EXISTS (SELECT 1 FROM lots_vises v JOIN gestion_annuaire_occupation o ON o.lot_id = v.id
                     WHERE o.locataire_id = lc.id AND o.sortie IS NULL) AS lot_vise_en_cours
       FROM gestion_annuaire_locataire lc
      WHERE ${vivante('lc')} AND ((NOT EXISTS (SELECT 1 FROM mots WHERE lc.nom_normalise NOT LIKE '%' || m || '%'))
         OR lc.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'locataire')
         OR EXISTS (SELECT 1 FROM lots_vises v JOIN gestion_annuaire_occupation o ON o.lot_id = v.id
                     WHERE o.locataire_id = lc.id))`, params);

  return assemblerPersonnes(proprios, locs, o.avecArchivees === true);
}

/** Ce que la requête des propriétaires rend, avant enrichissement. */
interface ProprioBrut {
  id: string; cle: string; civilite: string | null; prenom: string | null; nom: string; nom_complet: string;
  nom_normalise: string; archive: boolean; par_nom: boolean; lot_vise: string | null;
}
/** Ce que la requête des locataires rend, avant enrichissement. */
interface LocBrut {
  id: string; cle: string; civilite: string | null; prenom: string | null; nom: string; nom_normalise: string;
  archive: boolean; par_nom: boolean; en_place: boolean; lot_vise: string | null; lot_vise_en_cours: boolean;
}

/**
 * ══ 🔴🔴 ASSEMBLER LES PERSONNES : ENRICHIR, FONDRE, RANGER, GROUPER ══════════════════════════════════════════════
 *
 * Quatre gestes, dans cet ordre, et chacun a sa raison d'être là.
 */
async function assemblerPersonnes(
  proprios: readonly ProprioBrut[], locs: readonly LocBrut[], avecArchivees: boolean,
): Promise<IssueLecture<ResultatsPersonnes>> {
  const idsP = proprios.map((p) => Number(p.id));
  const idsL = locs.map((l) => Number(l.id));

  // ── ① LES COORDONNÉES : le PREMIER mobile et le PREMIER e-mail, en UNE requête pour tout le monde ──────────────
  const coords = new Map<string, { mobile: string | null; email: string | null }>();
  if (idsP.length > 0 || idsL.length > 0) {
    const avecLibelle = await libelleSourceContactDisponible();
    const { rows } = await query<{
      sujet: string; sujet_id: string; sorte: string; valeur: string; valeur_brute: string;
      libelle: string | null;
    }>(
      `SELECT sujet, sujet_id::text, sorte, valeur, valeur_brute,
              ${avecLibelle ? 'libelle_source' : 'NULL::text'} AS libelle
         FROM gestion_annuaire_contact
        WHERE absent_le IS NULL${await conditionCoordonneeVivante()}
          AND ((sujet = 'proprietaire' AND sujet_id = ANY($1::bigint[]))
            OR (sujet = 'locataire'    AND sujet_id = ANY($2::bigint[])))
        ORDER BY sorte, rang, id`, [idsP, idsL]);
    for (const r of rows) {
      const cle = `${r.sujet}|${r.sujet_id}`;
      const e = coords.get(cle) ?? { mobile: null, email: null };
      // ⚠️ LE PREMIER DE CHAQUE SORTE, et rien d'autre : la ligne d'annuaire est une ligne, pas une fiche.
      if (r.sorte === 'telephone' && e.mobile === null) e.mobile = formaterTelephone(r.valeur, r.valeur_brute);
      if (r.sorte === 'email' && e.email === null) e.email = r.valeur;
      coords.set(cle, e);
    }
  }

  // ── ② LES BIENS LIÉS : ceux d'un propriétaire, ceux qu'un locataire occupe ou a occupés ───────────────────────
  const biens = new Map<string, BienLie[]>();
  if (idsP.length > 0 || idsL.length > 0) {
    const { rows } = await query<{
      cle: string; lot_id: string; numero: string; adresse: string | null; commune: string | null;
    }>(
      `SELECT 'proprietaire|' || lo.proprietaire_id::text AS cle, lo.id::text AS lot_id,
              lo.wippimmo_id AS numero, lo.adresse, lo.commune
         FROM gestion_annuaire_lot lo
        WHERE lo.proprietaire_id = ANY($1::bigint[])
        UNION ALL
       SELECT DISTINCT 'locataire|' || o.locataire_id::text, lo.id::text, lo.wippimmo_id, lo.adresse, lo.commune
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
        WHERE o.locataire_id = ANY($2::bigint[])
        ORDER BY 3`, [idsP, idsL]);
    for (const r of rows) {
      const liste = biens.get(r.cle) ?? [];
      if (!liste.some((b) => b.numero === r.numero)) {
        liste.push({ lotId: Number(r.lot_id), numero: r.numero, adresse: r.adresse, commune: r.commune });
      }
      biens.set(r.cle, liste);
    }
  }

  /**
   * ── ③ FONDRE LES DEUX FICHES D'UNE MÊME PERSONNE ────────────────────────────────────────────────────────────
   *
   * Arno : « Une personne qui est à la fois propriétaire et locataire apparaît une seule fois, avec ses deux
   * capsules (clic → fiche propriétaire, lien secondaire vers la fiche locataire). »
   *
   * 🔴 DEUX CONDITIONS, ET IL FAUT LES DEUX : les MOTS DU NOM identiques (triés, donc « GAALOUL Najah et
   * Stéphanie » retrouve « GAALOUL Stéphanie et Najah ») ET au moins une COORDONNÉE partagée.
   *
   * ═══ POURQUOI PAS UNE SEULE ═══════════════════════════════════════════════════════════════════════════════
   * Mesuré le 30/09/2026 : par le NOM seul, 0 couple — la condition ne fondrait donc jamais rien, et serait
   * une promesse vide. Par la COORDONNÉE seule, 10 couples — dont 9 sont nos PROPRES sociétés (MARS AVENIR,
   * SARL MACJ, GABRIEL ESTATE, JOREL Arnaud), qui partagent nos adresses d'agence : les fondre aurait
   * transformé quatre personnes morales distinctes en une seule. Les deux ensemble : EXACTEMENT un couple,
   * GAALOUL — le vrai.
   */
  const parMotsProprio = new Map<string, ProprioBrut>();
  for (const p of proprios) parMotsProprio.set(motsTries(p.nom_normalise), p);
  const coordsDe = (cle: string): Set<string> => {
    const e = coords.get(cle);
    return new Set([e?.mobile, e?.email].filter((x): x is string => x !== null && x !== undefined));
  };
  /** locataire id → le propriétaire avec qui il fusionne. */
  const fusion = new Map<string, ProprioBrut>();
  for (const l of locs) {
    const p = parMotsProprio.get(motsTries(l.nom_normalise));
    if (p === undefined) continue;
    const communes = [...coordsDe(`locataire|${l.id}`)].filter((v) => coordsDe(`proprietaire|${p.id}`).has(v));
    if (communes.length > 0) fusion.set(l.id, p);
  }

  // ── ④ LES LIGNES, ENFIN ───────────────────────────────────────────────────────────────────────────────────────
  const lignes: (PersonneTrouvee & { pertinence: number })[] = [];

  for (const p of proprios) {
    const cle = `proprietaire|${p.id}`;
    const jumeau = [...fusion.entries()].find(([, q]) => q.id === p.id);
    const loc = jumeau === undefined ? null : locs.find((l) => l.id === jumeau[0]) ?? null;
    const roles: RolePersonne[] = ['proprietaire'];
    if (loc !== null) roles.push(loc.en_place ? 'locataire' : 'ancien_locataire');
    lignes.push({
      sujet: 'proprietaire', id: Number(p.id), cle: p.cle,
      civilite: p.civilite, prenom: p.prenom, nom: p.nom, nomAffiche: p.nom_complet,
      roles, archive: p.archive,
      autreFicheId: loc === null ? null : Number(loc.id),
      mobile: coords.get(cle)?.mobile ?? null, email: coords.get(cle)?.email ?? null,
      biens: biens.get(cle) ?? [],
      raison: p.par_nom || p.lot_vise === null ? null : `propriétaire du lot ${p.lot_vise}`,
      groupe: null,
      pertinence: p.par_nom ? 0 : 1,
    });
  }

  for (const l of locs) {
    // Fondue dans son propriétaire : elle a déjà sa ligne, avec ses deux capsules.
    if (fusion.has(l.id)) continue;
    const cle = `locataire|${l.id}`;
    lignes.push({
      sujet: 'locataire', id: Number(l.id), cle: l.cle,
      civilite: l.civilite, prenom: l.prenom, nom: l.nom, nomAffiche: l.nom,
      roles: [l.en_place ? 'locataire' : 'ancien_locataire'], archive: l.archive,
      autreFicheId: null,
      mobile: coords.get(cle)?.mobile ?? null, email: coords.get(cle)?.email ?? null,
      biens: biens.get(cle) ?? [],
      raison: l.par_nom || l.lot_vise === null
        ? null
        : `${l.lot_vise_en_cours ? 'locataire en place' : 'ancien locataire'} du lot ${l.lot_vise}`,
      groupe: null,
      pertinence: l.par_nom ? 0 : 1,
    });
  }

  /**
   * 🔴 LES ARCHIVÉES SONT MASQUÉES PAR DÉFAUT, jamais supprimées du calcul : la case « Afficher les archivées »
   * les ramène sans relancer la recherche du côté serveur avec d'autres règles — c'est la même liste, filtrée.
   */
  const visibles = avecArchivees ? lignes : lignes.filter((x) => !x.archive);

  /**
   * ══ 🔴 L'ORDRE : PERTINENCE DU NOM D'ABORD, PUIS LES RÔLES ══════════════════════════════════════════════════
   * Arno : « pertinence du nom d'abord, puis Propriétaires avant Locataires en place avant Anciens locataires ».
   * Une personne trouvée par SON NOM passe donc devant celle trouvée par le bien qu'elle occupe : c'est elle
   * qu'on cherchait.
   */
  const rangRole = (r: RolePersonne): number => (r === 'proprietaire' ? 0 : r === 'locataire' ? 1 : 2);
  visibles.sort((a, b) => a.pertinence - b.pertinence
    || rangRole(a.roles[0]) - rangRole(b.roles[0])
    || a.nomAffiche.localeCompare(b.nomAffiche, 'fr'));

  /**
   * ══ 🔴 LE GROUPE : CEUX QUI PARTAGENT UN BIEN VONT ENSEMBLE ═════════════════════════════════════════════════
   * Arno : « Colocataires, couples, co-propriétaires : chaque personne est une ligne à part. Quand ils partagent
   * le même bien, ils sont regroupés sous un filet discret, pour qu'on voie qu'ils vont ensemble. »
   *
   * ⚠️ ON NE GROUPE QUE CE QUI EST VRAIMENT PARTAGÉ : un bien porté par une seule personne du résultat ne fait
   * pas un groupe. Sans cette condition, chaque personne serait « groupée » toute seule, et le filet ne dirait
   * plus rien.
   */
  const combien = new Map<string, number>();
  for (const x of visibles) for (const b of x.biens) combien.set(b.numero, (combien.get(b.numero) ?? 0) + 1);
  for (const x of visibles) {
    const partage = x.biens.find((b) => (combien.get(b.numero) ?? 0) > 1);
    x.groupe = partage === undefined ? null : partage.numero;
  }

  const tronque = visibles.length > PLAFOND_RESULTATS;
  return {
    etat: 'ok',
    data: {
      tronque,
      personnes: visibles.slice(0, PLAFOND_RESULTATS)
        .map(({ pertinence: _p, ...reste }) => reste),
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
  /**
   * 🔴 LOT SUPPRIMER-CARTE — « cette fiche existe-t-elle encore ? », décidé UNE fois (`personneVivanteAvec`).
   * Sans la migration 287, il rend `true` : la requête est alors mot pour mot celle d'avant ce lot.
   */
  const avecSuppression = await suppressionPersonneDisponible();
  const vivante = (alias: string): string => personneVivanteAvec(avecSuppression, alias);
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
          ${await conditionCoordonneeVivante()}
     )
     SELECT 'proprietaire' AS role, pr.id::text, pr.nom_complet AS nom,
            (SELECT concat_ws(', ', lo.adresse, lo.commune) FROM gestion_annuaire_lot lo
              WHERE lo.proprietaire_id = pr.id ORDER BY lo.wippimmo_id LIMIT 1) AS logement,
            (SELECT count(*)::text FROM gestion_annuaire_lot lo WHERE lo.proprietaire_id = pr.id) AS nb
       FROM gestion_annuaire_proprietaire pr
      WHERE ${vivante('pr')} AND pr.id IN (SELECT sujet_id FROM vises WHERE sujet = 'proprietaire')
     UNION ALL
     SELECT 'locataire', lc.id::text, lc.nom,
            (SELECT concat_ws(', ', lo.adresse, lo.commune)
               FROM gestion_annuaire_occupation o LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
              WHERE o.locataire_id = lc.id ORDER BY (o.sortie IS NULL) DESC, o.entree DESC NULLS LAST LIMIT 1),
            (SELECT count(*)::text FROM gestion_annuaire_occupation o WHERE o.locataire_id = lc.id)
       FROM gestion_annuaire_locataire lc
      WHERE ${vivante('lc')} AND lc.id IN (SELECT sujet_id FROM vises WHERE sujet = 'locataire')`, [propres]);

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
