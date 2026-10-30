import { bailDisponible, bailEnCoursDuLotDans } from '../location/bailRepo';
import { renommerBrancheBail, type DepsBrancheBail } from '../location/brancheBailDriveRepo';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { refusFamilleCarte } from './familleCarteRepo';
import { carteEstComplete } from './carteComplete';
import { colonnesTrace, modificationDepuis } from './traceJournal';
import { MOT_COLONNE_PERSONNE, motifConflitFiche } from './traceFiche';
import { colonneExisteMemo } from '../location/sondeLocation';
import { annuaireModifiableDisponible, suppressionPersonneDisponible } from './schema';
import { nomComplet, normaliserTexte } from './annuaire';
// 🔴 LOT SUPPRIMER-CARTE — le motif du refus, écrit une fois : l'écran et le serveur disent la MÊME phrase.
import { MOTIF_DERNIERE_CARTE } from './personneVivante';
import {
  MOTIF_DERNIER_PROPRIETAIRE, notePropre, texteOuRien, verifierCoordonnees, verifierSeparation,
  type CoordonneeSaisie, type RepartitionCoordonnee,
} from './annuaireEdition';
import type { Auteur } from './rattachementRepo';
/**
 * 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — CORRIGER UNE FICHE DOIT CHANGER CE QUE LES MAILS PROPOSENT, TOUT DE
 * SUITE. Sans cela, le geste n'a d'effet que sur les mails à venir, et celui qu'on regarde — celui qui a motivé la
 * correction — reste muet. Voir `rafraichirPropositions`.
 */
import { rafraichirPourAdresses, rafraichirPourNoms } from './rafraichirPropositions';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
// 🔴 LOT L1 — le loyer de départ et le taux, écrits avec l'occupant quand l'écran les donne.
import { enregistrerConditions } from './honorairesGestionRepo';
import { reintegrerSiComplet } from '../location/regroupementRepo';
import { ecrireOrigineProprietaireTx, origineProprietaireDisponible } from '../location/origineProprietaireRepo';
import type { OrigineProprietaire } from '../location/origineProprietaire';

/**
 * LOT FICHES-ANNUAIRE (étape C) — ÉCRIRE DANS L'ANNUAIRE. IMPUR (base), et le seul module qui écrive.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 QUATRE PROMESSES, ET CHAQUE FONCTION D'ICI LES TIENT TOUTES LES QUATRE.
 *
 * ① RIEN N'EST JAMAIS SUPPRIMÉ. Pas un `DELETE` dans ce fichier — un garde statique le vérifie sur le TEXTE.
 *    Archiver DATE une ligne ; retirer une coordonnée la DATE aussi. Tout se restaure.
 *
 * ② TOUT CHANGEMENT EST JOURNALISÉ : qui, quand, avant, après. `gestion_journal` existe, il est append-only, et
 *    il porte déjà ces quatre colonnes. En créer un second serait un second endroit où chercher.
 *
 * ③ CE QUI EST SAISI ICI DEVIENT PRIORITAIRE. Chaque champ modifié POSE UN VERROU (`gestion_annuaire_verrou`) :
 *    l'import WIPPIMMO ne le réécrit plus, et signale la divergence dans son rapport au lieu de l'appliquer.
 *    🔴 UN VERROU PAR CHAMP, jamais par fiche : corriger un téléphone ne doit pas figer l'adresse postale, que
 *    WIPPIMMO continue de tenir à jour.
 *
 * ④ TOUT PASSE PAR UNE TRANSACTION. Une coordonnée écrite sans son verrou serait écrasée au prochain import ;
 *    un verrou posé sans la coordonnée figerait une valeur qui n'existe pas. Les deux vont ensemble ou pas du tout.
 *
 * ⚠️ SANS LA MIGRATION 278, CHAQUE FONCTION REFUSE PROPREMENT (`sans_schema`) et ne nomme AUCUNE des colonnes
 * nouvelles. L'écran rend alors « Modifier » désactivé, avec son motif écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type Sujet = 'proprietaire' | 'locataire';

export type IssueEdition<T = void> =
  | { etat: 'ok'; data: T }
  | { etat: 'sans_schema' }
  | { etat: 'inconnu' }
  | { etat: 'refus'; motif: string; rang?: number }
  /** 🔴 Arno (24/10/2026, 417) — la fiche a été modifiée depuis son ouverture (repère `depuisJournalId`) : rien n'est écrit. */
  | { etat: 'conflit'; motif: string };

const TABLE: Record<Sujet, string> = {
  proprietaire: 'gestion_annuaire_proprietaire',
  locataire: 'gestion_annuaire_locataire',
};

/**
 * ══ 🔴 LE JOURNAL D'UN CHANGEMENT ═════════════════════════════════════════════════════════════════════════════
 *
 * `entite = 'annuaire'` est DÉJÀ accepté par la contrainte du journal (vérifié le 29/09/2026) : aucune migration
 * n'est nécessaire pour journaliser, et c'est tant mieux — un journal qui attendrait une migration serait un
 * journal absent le jour où il sert.
 *
 * ⚠️ AU MIEUX-EFFORT, JAMAIS BLOQUANT ? NON — ICI, SI. Le journal est écrit DANS la transaction : une
 * modification qu'on ne saurait pas expliquer ne doit pas exister. C'est l'inverse de la règle des envois (où le
 * mail est déjà parti quand le journal échoue) : ici, rien n'est parti nulle part.
 */
async function journaliser(q: RequeteTx, o: {
  personneId: number; action: string; avant: string | null; apres: string | null;
  commentaire: string; auteur: Auteur;
  /** 🔴 417 — le sujet et le champ (une ligne par champ) ; avec eux, la session et l'écran quand le geste vient d'un écran tracé. */
  sujet?: Sujet; champ?: string | null;
}): Promise<void> {
  const t = o.sujet === undefined ? { colonnes: '', marques: '', valeurs: [] } : await colonnesTrace({ sujet: o.sujet, champ: o.champ ?? null }, 8);
  await q(
    `INSERT INTO gestion_journal
       (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
     VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
    [o.personneId, o.action, o.avant, o.apres, o.commentaire, o.auteur.id, o.auteur.libelle, ...t.valeurs]);
}

/**
 * POSE UN VERROU sur un champ, en gardant la valeur que WIPPIMMO portait.
 *
 * 🔴 `ON CONFLICT DO UPDATE` : reverrouiller un champ déjà verrouillé rafraîchit qui et quand, mais NE TOUCHE PAS
 * `valeur_import` — c'est la valeur du PREMIER verrou qui raconte la divergence d'origine, et la réécrire
 * effacerait ce que l'import disait avant qu'on n'y touche.
 */
async function verrouiller(q: RequeteTx, o: {
  sujet: Sujet; sujetId: number; champ: string; valeurImport: string | null; auteur: Auteur;
}): Promise<void> {
  await q(
    `INSERT INTO gestion_annuaire_verrou (sujet, sujet_id, champ, valeur_import, pose_par, pose_par_libelle)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sujet, sujet_id, champ) DO UPDATE
       SET pose_le = now(), pose_par = EXCLUDED.pose_par, pose_par_libelle = EXCLUDED.pose_par_libelle`,
    [o.sujet, o.sujetId, o.champ, o.valeurImport, o.auteur.id, o.auteur.libelle]);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① MODIFIER UNE PERSONNE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ChampsPersonne {
  civilite?: string | null;
  nom?: string | null;
  prenom?: string | null;
  qualite?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  commune?: string | null;
  note?: string | null;
  /** La liste COMPLÈTE des coordonnées voulues, dans l'ordre voulu. Absente = on n'y touche pas. */
  coordonnees?: CoordonneeSaisie[];
}

/**
 * ══ 🔴🔴 MODIFIER — LE GESTE CENTRAL DE L'ÉTAPE C ═════════════════════════════════════════════════════════════
 *
 * Il écrit ce qui a changé, et RIEN D'AUTRE : un champ absent de la demande n'est pas touché, et ne se verrouille
 * pas. Modifier un téléphone ne doit pas geler l'adresse postale que WIPPIMMO tient à jour.
 *
 * 🔴 LES COORDONNÉES SE REMPLACENT EN BLOC, ET C'EST VOULU. L'écran envoie la liste COMPLÈTE, dans l'ordre voulu :
 * ajouter, retirer et réordonner sont le même geste, et les traiter séparément demanderait à l'écran de calculer
 * un différentiel — donc de se tromper un jour sur l'ordre.
 *
 * 🔴 CE QUI DISPARAÎT DE LA LISTE EST ARCHIVÉ, PAS EFFACÉ (`archive_le`). Distinct de `absent_le`, qui dit « plus
 * dans le dernier export » : confondre les deux ferait réapparaître au prochain import ce qu'on vient de retirer.
 */
export async function modifierPersonne(
  sujet: Sujet, id: number, champs: ChampsPersonne, auteur: Auteur,
  /** 🔴 Arno (24/10/2026, 417) — `depuisJournalId` : le repère du journal à l'ouverture de la fiche ; une modification postérieure
   *  (par quelqu'un d'autre) fait refuser l'enregistrement, sans rien écraser. Absent : le geste d'avant (aucun contrôle). */
  o: { depuisJournalId?: number } = {},
): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };

  /**
   * ⚠️ LE NOM NE PEUT PAS DEVENIR VIDE. La base le refuserait de toute façon (`nom` est NOT NULL, avec une
   * contrainte `btrim(nom) <> ''`), mais elle le refuserait par une erreur Postgres illisible à l'écran. On le
   * dit donc en français, ici, avant d'écrire quoi que ce soit.
   */
  if (champs.nom !== undefined && texteOuRien(champs.nom, 200) === null) {
    return { etat: 'refus', motif: 'Le nom ne peut pas être vide.' };
  }

  // ⚠️ LES COORDONNÉES SONT VÉRIFIÉES AVANT D'OUVRIR LA TRANSACTION : un refus ne doit rien avoir commencé.
  let retenues = null as ReturnType<typeof verifierCoordonnees> | null;
  if (champs.coordonnees !== undefined) {
    retenues = verifierCoordonnees(champs.coordonnees);
    if (!retenues.ok) return { etat: 'refus', motif: retenues.motif, rang: retenues.rang };
  }

  /**
   * 🔴 LES ADRESSES ÉLECTRONIQUES TOUCHÉES — celles qui ENTRENT comme celles qui SORTENT. On les recueille dans la
   * transaction et on s'en sert APRÈS : un recalcul qui lirait la base avant le COMMIT n'y verrait rien de nouveau.
   */
  const emailsTouches = new Set<string>();
  /**
   * 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — LES NOMS TOUCHÉS, l'ancien comme le nouveau. Un nom corrigé change ce
   * que le TEXTE des mails désigne : les propositions de contenu doivent suivre, dans les deux sens.
   */
  const nomsTouches = new Set<string>();

  const issue = await withTransaction(async (q) => {
    const { rows } = await q<Record<string, string | null>>(
      `SELECT * FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    const avant = rows[0];
    if (avant === undefined) return { etat: 'inconnu' as const };
    if (o.depuisJournalId !== undefined) {
      const autre = await modificationDepuis(q as never, sujet, id, o.depuisJournalId);
      if (autre !== null) return { etat: 'conflit' as const, motif: motifConflitFiche(autre) };
    }

    /* 🔴🔴 LA CARTE COMPLÈTE (Arno, 18/10/2026) — une modification qui retirerait le téléphone ou l'e-mail de la DERNIÈRE
       carte complète de sa famille est refusée, AVANT toute écriture. Une fiche archivée ne compte plus dans sa famille. */
    if ((avant.archive_le ?? null) === null && (champs.coordonnees !== undefined || champs.nom !== undefined)) {
      const nomApres = champs.nom !== undefined ? champs.nom : (avant.nom ?? avant.nom_complet ?? '');
      let coordApres: { sorte: string; valeur: string }[];
      if (retenues !== null && retenues.ok) coordApres = retenues.retenues.map((c) => ({ sorte: c.sorte, valeur: c.valeur }));
      else {
        const { rows: k } = await q<{ sorte: string; valeur: string }>(
          `SELECT sorte, valeur FROM gestion_annuaire_contact WHERE sujet = $1 AND sujet_id = $2 AND absent_le IS NULL AND archive_le IS NULL`, [sujet, id]);
        coordApres = k;
      }
      const motif = await refusFamilleCarte(q, sujet, id, carteEstComplete({ nom: nomApres, coordonnees: coordApres }), 'modification');
      if (motif !== null) return { etat: 'refus' as const, motif };
    }

    // ── LES CHAMPS SIMPLES ────────────────────────────────────────────────────────────────────────────────────
    const colonnes: Record<string, string | null> = {};
    const poser = (champ: string, colonne: string, valeur: string | null | undefined, max = 200) => {
      if (valeur === undefined) return;
      const propre = champ === 'note' ? notePropre(valeur) : texteOuRien(valeur, max);
      if ((avant[colonne] ?? null) === propre) return;
      colonnes[colonne] = propre;
    };
    poser('civilite', 'civilite', champs.civilite, 40);
    poser('nom', 'nom', champs.nom, 200);
    poser('prenom', 'prenom', champs.prenom, 120);
    poser('qualite', 'qualite', champs.qualite, 200);
    poser('adresse', 'adresse', champs.adresse, 300);
    poser('code_postal', 'code_postal', champs.codePostal, 20);
    poser('commune', 'commune', champs.commune, 200);
    poser('note', 'note', champs.note);

    for (const [colonne, valeur] of Object.entries(colonnes)) {
      // 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — l'ANCIEN nom autant que le nouveau : les propositions que l'ancien
      //   fondait doivent disparaître, celles du nouveau apparaître.
      if (colonne === 'nom' || colonne === 'prenom') {
        for (const x of [avant[colonne] ?? '', valeur ?? '']) if (x.trim() !== '') nomsTouches.add(x);
      }
      await q(`UPDATE ${TABLE[sujet]} SET ${colonne} = $2 WHERE id = $1`, [id, valeur]);
      await verrouiller(q, { sujet, sujetId: id, champ: colonne, valeurImport: avant[colonne] ?? null, auteur });
      await journaliser(q, {
        personneId: id, action: `annuaire_${colonne}`,
        avant: avant[colonne] ?? null, apres: valeur,
        commentaire: `${colonne} modifié dans la fiche`, auteur, sujet, champ: MOT_COLONNE_PERSONNE[colonne] ?? colonne,
      });
    }

    /**
     * ⚠️ LE NOM RECOMPOSÉ SUIT LE NOM ET LE PRÉNOM. `nom_complet` et `nom_normalise` sont ce que la RECHERCHE
     * interroge : les laisser en arrière rendrait une personne renommée introuvable par son nouveau nom — le
     * genre de défaut qu'on ne découvre qu'en la cherchant, c'est-à-dire trop tard.
     */
    if (sujet === 'proprietaire' && (colonnes.nom !== undefined || colonnes.prenom !== undefined)) {
      const nom = colonnes.nom ?? avant.nom ?? '';
      const prenom = colonnes.prenom ?? avant.prenom ?? null;
      const complet = nomComplet(nom, prenom);
      await q(
        `UPDATE gestion_annuaire_proprietaire SET nom_complet = $2, nom_normalise = $3 WHERE id = $1`,
        [id, complet, normaliserTexte(complet)]);
    }
    if (sujet === 'locataire' && colonnes.nom !== undefined) {
      await q(
        `UPDATE gestion_annuaire_locataire SET nom_normalise = $2 WHERE id = $1`,
        [id, normaliserTexte(colonnes.nom ?? '')]);
    }
    /**
     * 🔴 Arno (24/10/2026) — LA COPIE DU NOM SUR LES LIGNES DU SUIVI DE LA LOCATION, DANS LA MÊME TRANSACTION. Une ligne SAISIE
     * dans l'outil (`source = 'saisie'`) porte les locataires de son bail en texte (« prénom nom », séparés par « , », la formule de
     * `enregistrerActivite`) : elle suit le nouveau nom. Une ligne REPRISE du fichier (`import`) garde le texte du fichier (on
     * n'invente rien, et la règle d'Arno le dit pour les lignes sans bail).
     */
    if (sujet === 'locataire' && (colonnes.nom !== undefined || colonnes.prenom !== undefined)
      && await colonneExisteMemo('gestion_location_activite', 'libelle_locataire') && await colonneExisteMemo('gestion_annuaire_occupation', 'bail_id')) {
      await q(
        `UPDATE gestion_location_activite a SET libelle_locataire = (
           SELECT coalesce(string_agg(coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom, ''), ', ' ORDER BY lo.id), '')
             FROM gestion_annuaire_occupation oc JOIN gestion_annuaire_locataire lo ON lo.id = oc.locataire_id WHERE oc.bail_id = a.bail_id)
          WHERE a.source = 'saisie' AND a.bail_id IN (SELECT oc.bail_id FROM gestion_annuaire_occupation oc WHERE oc.locataire_id = $1 AND oc.bail_id IS NOT NULL)`,
        [id]);
    }

    // ── LES COORDONNÉES ───────────────────────────────────────────────────────────────────────────────────────
    if (retenues !== null && retenues.ok) {
      const { rows: anciennes } = await q<{ id: string; sorte: string; valeur: string }>(
        `SELECT id::text, sorte, valeur FROM gestion_annuaire_contact
          WHERE sujet = $1 AND sujet_id = $2 AND archive_le IS NULL`, [sujet, id]);
      const voulues = new Set(retenues.retenues.map((c) => `${c.sorte}:${c.valeur}`));

      // 🔴 CE QUI SORT EST ARCHIVÉ — jamais effacé. On garde qui l'a retiré et quand, dans le journal.
      for (const a of anciennes) {
        if (voulues.has(`${a.sorte}:${a.valeur}`)) continue;
        if (a.sorte === 'email') emailsTouches.add(a.valeur);
        await q('UPDATE gestion_annuaire_contact SET archive_le = now() WHERE id = $1', [Number(a.id)]);
        await journaliser(q, {
          personneId: id, action: 'annuaire_coordonnee_retiree',
          avant: `${a.sorte} ${a.valeur}`, apres: null,
          commentaire: 'coordonnée retirée de la fiche (archivée, jamais supprimée)', auteur, sujet, champ: 'Coordonnées',
        });
      }

      // 🔴 CE QUI ENTRE OU REVIENT : `ON CONFLICT` sur la clé unique (sujet, sujet_id, sorte, valeur). Une
      //    coordonnée retirée puis remise se RÉVEILLE (archive_le à NULL) au lieu de faire une seconde ligne.
      for (const c of retenues.retenues) {
        // ⚠️ TOUTES LES ADRESSES RETENUES, pas seulement les nouvelles : une adresse remise après avoir été
        //   archivée ne produit pas de ligne « ancienne », et c'est pourtant le cas où le recalcul compte le plus.
        if (c.sorte === 'email') emailsTouches.add(c.valeur);
        await q(
          `INSERT INTO gestion_annuaire_contact
             (sujet, sujet_id, sorte, valeur, valeur_brute, rang, libelle, origine, archive_le)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'saisie', NULL)
           ON CONFLICT (sujet, sujet_id, sorte, valeur) DO UPDATE
             SET valeur_brute = EXCLUDED.valeur_brute, rang = EXCLUDED.rang, libelle = EXCLUDED.libelle,
                 origine = 'saisie', archive_le = NULL, absent_le = NULL`,
          [sujet, id, c.sorte, c.valeur, c.valeurBrute, c.rang, c.libelle]);
      }
      const resume = retenues.retenues.map((c) => `${c.sorte} ${c.valeurBrute}`).join(' · ');
      await verrouiller(q, {
        sujet, sujetId: id, champ: 'contacts',
        valeurImport: anciennes.map((a) => `${a.sorte} ${a.valeur}`).join(' · ') || null, auteur,
      });
      await journaliser(q, {
        personneId: id, action: 'annuaire_coordonnees',
        avant: anciennes.map((a) => `${a.sorte} ${a.valeur}`).join(' · ') || null,
        apres: resume || null,
        commentaire: 'coordonnées de la fiche modifiées', auteur, sujet, champ: 'Coordonnées',
      });
    }

    return { etat: 'ok' as const, data: undefined };
  });

  /**
   * ══ 🔴🔴 LE RECALCUL IMMÉDIAT (demande d'Arno du 01/10/2026) ═══════════════════════════════════════════════
   *
   * APRÈS LE COMMIT, ET JAMAIS DEDANS : le recalcul relit l'annuaire pour reconnaître les adresses des mails ; à
   * l'intérieur de la transaction, il lirait l'état d'AVANT et conclurait que rien n'a changé.
   *
   * ⚠️ IL NE PEUT PAS FAIRE ÉCHOUER LA MODIFICATION, qui est déjà écrite et journalisée. Un échec se DIT au
   * journal du serveur, et le filet de l'ouverture d'un mail rattrapera ces mails-là — c'est précisément à cela
   * qu'il sert.
   */
  if (issue.etat === 'ok' && (emailsTouches.size > 0 || nomsTouches.size > 0)) {
    try {
      if (emailsTouches.size > 0) await rafraichirPourAdresses([...emailsTouches]);
      // 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — et les mails où ce NOM est écrit, dans le texte.
      if (nomsTouches.size > 0) await rafraichirPourNoms([...nomsTouches]);
    } catch (e) {
      console.error('[annuaire] recalcul des propositions impossible après modification de la fiche %s %d',
        sujet, id, e);
    }
  }
  return issue;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② L'ORDRE DES CARTES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * RANGE les cartes dans l'ordre donné. Le premier de la liste porte le rang 1 — jamais 0, qui veut dire
 * « jamais réglé » et ferait retomber sur l'ordre par défaut (cf. `ordreDesCartes`).
 */
export async function ordonnerPersonnes(sujet: Sujet, ids: readonly number[], auteur: Auteur): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  if (ids.length === 0) return { etat: 'ok', data: undefined };
  return withTransaction(async (q) => {
    for (const [i, id] of ids.entries()) {
      await q(`UPDATE ${TABLE[sujet]} SET rang = $2 WHERE id = $1`, [id, i + 1]);
    }
    await journaliser(q, {
      personneId: ids[0], action: 'annuaire_ordre', avant: null, apres: ids.join(', '),
      commentaire: 'ordre des cartes réglé à la main', auteur,
    });
    return { etat: 'ok' as const, data: undefined };
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ ARCHIVER ET RESTAURER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 « SUPPRIMER » = ARCHIVER, ET RIEN D'AUTRE ════════════════════════════════════════════════════════════
 *
 * Arno : « la personne sort des fiches actives, mais ses mails, rattachements et historique restent. Restaurer
 * est possible ». C'est exactement ce que fait cette fonction : elle DATE une colonne. Aucune autre table n'est
 * touchée — ni les rattachements, ni les occupations, ni les liens de propriété.
 */
export async function archiverPersonne(
  sujet: Sujet, id: number, archiver: boolean, auteur: Auteur,
): Promise<IssueEdition<{ nom: string }>> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ nom: string; archive_le: string | null }>(
      `SELECT ${sujet === 'proprietaire' ? 'nom_complet AS nom' : 'nom'}, archive_le::text
         FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    const p = rows[0];
    if (p === undefined) return { etat: 'inconnu' as const };

    /**
     * ══ 🔴🔴 UN BIEN DOIT TOUJOURS AVOIR AU MOINS UN PROPRIÉTAIRE ═════════════════════════════════════════════
     *
     * Règle d'Arno : « Il est impossible d'archiver […] le DERNIER propriétaire actif d'un bien. […] Garde côté
     * serveur aussi : refus dans la transaction, même en cas d'appel direct. »
     *
     * 🔴 LE GARDE EST ICI, ET PAS SEULEMENT À L'ÉCRAN. Le bouton grisé protège de la maladresse ; il ne protège
     * de rien du tout contre un appel direct à la route, une fenêtre restée ouverte pendant qu'un collègue
     * archivait l'autre propriétaire, ou un futur écran qui oublierait la règle. Un bien sans propriétaire est un
     * bien qu'on ne sait plus à qui facturer : l'invariant se tient là où il ne peut pas être contourné.
     *
     * ⚠️ DANS LA TRANSACTION, ET APRÈS LE `FOR UPDATE` de la fiche : entre la lecture et l'écriture, personne ne
     * peut archiver l'autre propriétaire du même bien sans attendre ce verrou.
     */
    // 🔴🔴 LA CARTE COMPLÈTE (Arno, 18/10/2026) — archiver la DERNIÈRE carte complète de sa famille est refusé.
    if (archiver && p.archive_le === null) {
      const motif = await refusFamilleCarte(q, sujet, id, null, 'suppression');
      if (motif !== null) return { etat: 'refus' as const, motif };
    }
    if (archiver && sujet === 'proprietaire') {
      const orphelin = await lotSansProprietaireApres(q, id);
      if (orphelin !== null) {
        return {
          etat: 'refus' as const,
          motif: `${MOTIF_DERNIER_PROPRIETAIRE} Le lot ${orphelin} n’en aurait plus aucun. `
            + 'Ajoutez ou désignez d’abord un autre propriétaire, ou utilisez « Remplacer ».',
        };
      }
    }

    await q(
      `UPDATE ${TABLE[sujet]}
          SET archive_le = ${archiver ? 'now()' : 'NULL'},
              archive_par_libelle = ${archiver ? '$2' : 'NULL'}
        WHERE id = $1`,
      archiver ? [id, auteur.libelle] : [id]);
    await journaliser(q, {
      personneId: id, action: archiver ? 'annuaire_archive' : 'annuaire_restaure',
      avant: p.archive_le, apres: archiver ? 'archivée' : null,
      commentaire: archiver
        ? 'fiche archivée — rien n’est supprimé, ses mails et son historique restent'
        : 'fiche restaurée dans l’annuaire actif',
      auteur,
    });
    return { etat: 'ok' as const, data: { nom: p.nom } };
  });
}

/**
 * ══ 🔴🔴 LOT SUPPRIMER-CARTE — SUPPRIMER UNE FICHE DE PERSONNE ════════════════════════════════════════════════
 *
 * Arno : « la personne n'apparaît plus NULLE PART dans l'app […] Techniquement, c'est une suppression logique
 * (marquage “supprimée”, qui, quand) : les mails, les rattachements et les historiques des biens restent intacts.
 * Aucune ligne n'est effacée en base. »
 *
 * ═══ 🔴 AUCUN `DELETE`, ET CE N'EST PAS UNE PRUDENCE DE PRINCIPE ════════════════════════════════════════════════
 *
 * Effacer la ligne casserait les clés étrangères des occupations et des lots — c'est-à-dire l'historique du bien
 * lui-même, que ce lot promet de laisser intact. On MARQUE, et toutes les lectures d'affichage écartent ce qui
 * est marqué (fragment `sqlPersonneVivante`, écrit à un seul endroit).
 *
 * ═══ 🔴🔴 LE GARDE : UNE FICHE DOIT GARDER AU MOINS UN PROPRIÉTAIRE ═════════════════════════════════════════════
 *
 * Arno : « Contrôle aussi côté serveur, dans la transaction, avec test, y compris en appel direct. »
 *
 * 🔴 C'EST LE MÊME GARDE QUE L'ARCHIVAGE (`lotSansProprietaireApres`), ET C'EST VOULU : les deux gestes retirent
 * un propriétaire de la vue, et une seconde écriture de la règle finirait par diverger — l'un des deux
 * autoriserait ce que l'autre refuse, et personne ne saurait lequel a raison.
 *
 * ⚠️ LA REQUÊTE DU GARDE NE CONNAÎT QUE `archive_le`. La suppression pose donc AUSSI `archive_le` : une fiche
 * supprimée est, par construction, une fiche qui n'est plus active — et le garde la compte alors correctement
 * pour le propriétaire SUIVANT qu'on voudrait retirer. Sans cela, supprimer les deux propriétaires d'un bien
 * l'un après l'autre aurait été possible.
 */
export async function supprimerPersonne(
  sujet: Sujet, id: number, auteur: Auteur,
): Promise<IssueEdition<{ nom: string }>> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  if (!await suppressionPersonneDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ nom: string; supprime_le: string | null }>(
      `SELECT ${sujet === 'proprietaire' ? 'nom_complet AS nom' : 'nom'}, supprime_le::text
         FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    const p = rows[0];
    if (p === undefined) return { etat: 'inconnu' as const };
    // ⚠️ DÉJÀ SUPPRIMÉE : on ne refuse pas, on ne réécrit pas. Deux clics ne doivent pas faire deux journaux.
    if (p.supprime_le !== null) return { etat: 'ok' as const, data: { nom: p.nom } };

    /**
     * 🔴 LE GARDE, DANS LA TRANSACTION ET APRÈS LE `FOR UPDATE`. Entre la lecture et l'écriture, personne ne peut
     * retirer l'autre propriétaire du même bien sans attendre ce verrou. Le bouton grisé de l'écran protège de la
     * maladresse ; celui-ci protège d'un appel direct, d'une fenêtre restée ouverte, et d'un futur écran qui
     * oublierait la règle.
     */
    // 🔴🔴 LA CARTE COMPLÈTE (Arno, 18/10/2026) — supprimer la DERNIÈRE carte complète (active) de sa famille est refusé.
    {
      const { rows: a } = await q<{ actif: boolean }>(`SELECT archive_le IS NULL AS actif FROM ${TABLE[sujet]} WHERE id = $1`, [id]);
      if (a[0]?.actif === true) {
        const motif = await refusFamilleCarte(q, sujet, id, null, 'suppression');
        if (motif !== null) return { etat: 'refus' as const, motif };
      }
    }
    if (sujet === 'proprietaire') {
      const orphelin = await lotSansProprietaireApres(q, id);
      if (orphelin !== null) {
        return {
          etat: 'refus' as const,
          motif: `${MOTIF_DERNIERE_CARTE} Le lot ${orphelin} n’en aurait plus aucun. `
            + 'Ajoutez ou désignez d’abord une autre fiche, ou utilisez « Remplacer ».',
        };
      }
    }

    await marquerPersonneSupprimeeTx(q, sujet, id, auteur);
    return { etat: 'ok' as const, data: { nom: p.nom } };
  });
}

/**
 * LE MARQUAGE « SUPPRIMÉE » D'UNE FICHE (et son journal), dans la transaction de l'appelant — écrit UNE fois : `supprimerPersonne` (après
 * ses gardes) et 🔴 LOT LS1 la suppression d'une location (Suivi du mois), où le garde « dernière carte complète » est levé pour ce seul
 * geste (décision d'Arno : toute la famille part avec la location). Aucune ligne n'est effacée ; le `commentaire` dit d'où vient le geste.
 */
export async function marquerPersonneSupprimeeTx(q: RequeteTx, sujet: Sujet, id: number, auteur: Auteur, commentaire?: string): Promise<void> {
  await q(
    `UPDATE ${TABLE[sujet]}
        SET supprime_le = now(), supprime_par = $2, supprime_par_libelle = $3,
            archive_le = coalesce(archive_le, now()),
            archive_par_libelle = coalesce(archive_par_libelle, $3)
      WHERE id = $1`, [id, auteur.id, auteur.libelle]);

  await journaliser(q, {
    personneId: id, action: 'annuaire_supprime', avant: null, apres: 'supprimée',
    commentaire: commentaire ?? 'fiche supprimée — elle ne s’affiche plus nulle part ; aucune ligne n’est effacée, et ses '
      + 'mails, ses rattachements et l’historique du bien restent intacts',
    auteur,
  });
}

/**
 * ══ 🔴🔴 LE LOT QUI RESTERAIT SANS PROPRIÉTAIRE SI L'ON ARCHIVAIT CETTE PERSONNE ══════════════════════════════════
 *
 * Rend la CLÉ WIPPIMMO du premier lot orphelin, ou `null` si aucun ne le deviendrait.
 *
 * ═══ POURQUOI DEUX SOURCES DE PROPRIÉTÉ, ET POURQUOI IL FAUT LES DEUX ═════════════════════════════════════════════
 * Un lot connaît ses propriétaires par `gestion_annuaire_lot.proprietaire_id` (ce que l'import écrit — UN seul) ET
 * par `gestion_annuaire_lot_proprietaire` (les liens ajoutés à la main, plusieurs, avec leur période). N'en
 * regarder qu'une laisserait passer exactement le cas qu'on veut interdire : archiver le propriétaire d'import d'un
 * bien qui n'a aucun co-propriétaire ajouté.
 *
 * 🔴 « ACTIF » VEUT DIRE NON ARCHIVÉ, et pour un lien ajouté, EN COURS (`jusqu_a IS NULL`). Un ancien propriétaire
 * appartient à l'historique du bien : le compter ferait croire que le bien a encore quelqu'un.
 *
 * ⚠️ UN LOT SORTI DE GESTION COMPTE AUSSI. On garde ses mails, son historique et ses pièces ; un bien dont on ne
 * saurait plus dire à qui il était reste une perte, même s'il n'est plus géré aujourd'hui.
 */
async function lotSansProprietaireApres(q: RequeteTx, proprietaireId: number): Promise<string | null> {
  if (!await annuaireModifiableDisponible()) return null;
  const { rows } = await q<{ cle: string }>(
    /* AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul accent grave
       terminerait — piege consigne TREIZE fois dans ce depot, et treize fois dans un commentaire.
       ses_lots : les biens ou cette personne est proprietaire, par l'une ou l'autre source.
       autres   : pour chacun, combien d'AUTRES proprietaires ACTIFS il lui reste. */
    `WITH ses_lots AS (
       SELECT id AS lot_id FROM gestion_annuaire_lot WHERE proprietaire_id = $1
       UNION
       SELECT lot_id FROM gestion_annuaire_lot_proprietaire WHERE proprietaire_id = $1 AND jusqu_a IS NULL
     )
     SELECT lo.wippimmo_id AS cle
       FROM ses_lots s JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id
      WHERE NOT EXISTS (
        SELECT 1 FROM gestion_annuaire_proprietaire pr
         WHERE pr.id = lo.proprietaire_id AND pr.id <> $1 AND pr.archive_le IS NULL)
        AND NOT EXISTS (
        SELECT 1 FROM gestion_annuaire_lot_proprietaire lp
          JOIN gestion_annuaire_proprietaire pr2 ON pr2.id = lp.proprietaire_id
         WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL AND lp.proprietaire_id <> $1
           AND pr2.archive_le IS NULL)
      ORDER BY lo.wippimmo_id
      LIMIT 1`, [proprietaireId]);
  return rows[0]?.cle ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ SÉPARER UNE FICHE EN DEUX PERSONNES
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 SÉPARER — ET LA RÉPARTITION VIENT D'ARNO, JAMAIS DE NOUS ═════════════════════════════════════════════
 *
 * 66 fiches de propriétaires et 116 de locataires nomment deux personnes dans un seul nom. Ce geste en fait deux
 * fiches, et Arno décide COORDONNÉE PAR COORDONNÉE laquelle va où — par des cases à cocher. Rien n'est réparti
 * automatiquement : une répartition devinée se tromperait une fois sur trois, et personne ne le verrait avant
 * d'appeler le mauvais numéro.
 *
 * 🔴 LA FICHE D'ORIGINE EST CONSERVÉE. Elle est renommée du PREMIER nom et garde ses liens (lots, occupations,
 * rattachements) ; la SECONDE est créée à côté, avec `issu_de` qui dit d'où elle sort. Archiver l'originale
 * aurait détaché tout son historique — c'est précisément ce qu'on refuse.
 *
 * ⚠️ LA CLÉ DE LA FICHE NOUVELLE EST « app-… ». `wippimmo_id` est NOT NULL UNIQUE : une personne qui n'existe pas
 * chez WIPPIMMO a besoin d'une identité à nous, et le préfixe dit d'où elle vient.
 */
export async function separerPersonne(sujet: Sujet, id: number, o: {
  premier: string; second: string; repartition: readonly RepartitionCoordonnee[];
}, auteur: Auteur): Promise<IssueEdition<{ nouvelId: number }>> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  const verdict = verifierSeparation(o.premier, o.second);
  if (!verdict.ok) return { etat: 'refus', motif: verdict.motif };

  /** 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — séparer DÉPLACE des adresses d'une fiche à l'autre : le propriétaire
   *  que ces adresses désignent change, donc les propositions des mails qui les portent aussi. */
  const emailsTouches = new Set<string>();

  const issue = await withTransaction(async (q) => {
    const { rows } = await q<Record<string, string | null>>(
      `SELECT * FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    const p = rows[0];
    if (p === undefined) return { etat: 'inconnu' as const };

    const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const second = texteOuRien(o.second, 200) ?? '';
    let nouvelId: number;
    if (sujet === 'proprietaire') {
      const { rows: neuf } = await q<{ id: string }>(
        `INSERT INTO gestion_annuaire_proprietaire
           (wippimmo_id, civilite, nom, prenom, nom_complet, nom_normalise, adresse, commune, code_postal,
            adresse_normalisee, relation_depuis, drive_dossier_id, rang, issu_de)
         VALUES ($1, NULL, $2, NULL, $2, $3, $4, $5, $6, $7, $8, NULL, 0, $9)
         RETURNING id::text`,
        [cle, second, normaliserTexte(second), p.adresse, p.commune, p.code_postal,
          p.adresse_normalisee, p.relation_depuis, id]);
      nouvelId = Number(neuf[0].id);
      // 🔴 Arno (25/10/2026, 425) — « Séparer en deux personnes » : la seconde fiche reprend l'origine du contact de la première.
      if (await origineProprietaireDisponible()) {
        await q(`UPDATE gestion_annuaire_proprietaire n SET origine_contact = o.origine_contact, origine_contact_precision = o.origine_contact_precision,
                        origine_apporteur_id = o.origine_apporteur_id, origine_collegue_id = o.origine_collegue_id, origine_collegue_libelle = o.origine_collegue_libelle,
                        origine_modifiee_le = CASE WHEN o.origine_contact IS NULL THEN NULL ELSE now() END,
                        origine_modifiee_par_libelle = CASE WHEN o.origine_contact IS NULL THEN NULL ELSE $3 END
                   FROM gestion_annuaire_proprietaire o WHERE n.id = $1 AND o.id = $2`, [nouvelId, id, auteur.libelle]);
      }
    } else {
      const { rows: neuf } = await q<{ id: string }>(
        `INSERT INTO gestion_annuaire_locataire
           (cle_personne, wippimmo_id, nom, nom_normalise, adresse, commune, code_postal, adresse_normalisee,
            rang, issu_de)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, 0, $8)
         RETURNING id::text`,
        [cle, second, normaliserTexte(second), p.adresse, p.commune, p.code_postal, p.adresse_normalisee, id]);
      nouvelId = Number(neuf[0].id);
    }

    // ── LA FICHE D'ORIGINE PREND LE PREMIER NOM ──────────────────────────────────────────────────────────────
    const premier = texteOuRien(o.premier, 200) ?? '';
    if (sujet === 'proprietaire') {
      await q(
        `UPDATE gestion_annuaire_proprietaire SET nom = $2, nom_complet = $2, nom_normalise = $3 WHERE id = $1`,
        [id, premier, normaliserTexte(premier)]);
    } else {
      await q(
        `UPDATE gestion_annuaire_locataire SET nom = $2, nom_normalise = $3 WHERE id = $1`,
        [id, premier, normaliserTexte(premier)]);
    }
    await verrouiller(q, { sujet, sujetId: id, champ: 'nom', valeurImport: p.nom ?? null, auteur });

    // ── LA RÉPARTITION DES COORDONNÉES, TELLE QU'ARNO L'A COCHÉE ─────────────────────────────────────────────
    for (const r of o.repartition) {
      const { rows: c } = await q<{ sorte: string; valeur: string; valeur_brute: string; libelle: string | null }>(
        `SELECT sorte, valeur, valeur_brute, libelle FROM gestion_annuaire_contact
          WHERE id = $1 AND sujet = $2 AND sujet_id = $3`, [r.contactId, sujet, id]);
      const coord = c[0];
      if (coord === undefined) continue;
      if (coord.sorte === 'email') emailsTouches.add(coord.valeur);
      // Elle va à la SECONDE (copie) dès que la part la nomme.
      if (r.part === 'second' || r.part === 'les_deux') {
        await q(
          `INSERT INTO gestion_annuaire_contact
             (sujet, sujet_id, sorte, valeur, valeur_brute, rang, libelle, origine)
           VALUES ($1, $2, $3, $4, $5, 0, $6, 'saisie')
           ON CONFLICT (sujet, sujet_id, sorte, valeur) DO UPDATE SET archive_le = NULL`,
          [sujet, nouvelId, coord.sorte, coord.valeur, coord.valeur_brute, coord.libelle]);
      }
      // Elle QUITTE la première dès que la part ne la nomme plus — archivée, jamais effacée.
      if (r.part === 'second') {
        await q('UPDATE gestion_annuaire_contact SET archive_le = now() WHERE id = $1', [r.contactId]);
      }
    }

    await journaliser(q, {
      personneId: id, action: 'annuaire_separee',
      avant: p.nom_complet ?? p.nom ?? null, apres: `${premier} | ${second}`,
      commentaire: `fiche séparée en deux personnes (la seconde porte l’identifiant ${nouvelId})`, auteur,
    });
    await journaliser(q, {
      personneId: nouvelId, action: 'annuaire_creee',
      avant: null, apres: second,
      commentaire: `fiche créée en séparant la fiche ${id}`, auteur,
    });
    return { etat: 'ok' as const, data: { nouvelId } };
  });

  // ⚠️ APRÈS LE COMMIT, et sans pouvoir faire échouer la séparation : même règle que `modifierPersonne`.
  if (issue.etat === 'ok' && emailsTouches.size > 0) {
    try {
      await rafraichirPourAdresses([...emailsTouches]);
    } catch (e) {
      console.error('[annuaire] recalcul des propositions impossible après séparation de %s %d', sujet, id, e);
    }
  }
  return issue;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LES PROPRIÉTAIRES D'UN BIEN — AJOUTER, REMPLACER
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * AJOUTE un propriétaire à un bien (co-propriété, indivision), sans toucher à celui qui y est déjà.
 *
 * ⚠️ `ON CONFLICT DO NOTHING` sur l'index partiel « un seul lien EN COURS par couple » : rajouter deux fois la
 * même personne ne fait pas deux lignes, et ne casse pas non plus — le geste est simplement déjà fait.
 */
export async function ajouterProprietaireAuLot(
  lotId: number, proprietaireId: number, depuis: string | null, auteur: Auteur,
): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    await q(
      `INSERT INTO gestion_annuaire_lot_proprietaire
         (lot_id, proprietaire_id, rang, depuis, cree_par, cree_par_libelle)
       VALUES ($1, $2, coalesce((SELECT max(rang) + 1 FROM gestion_annuaire_lot_proprietaire WHERE lot_id = $1), 1),
               $3::date, $4, $5)
       ON CONFLICT (lot_id, proprietaire_id) WHERE jusqu_a IS NULL DO NOTHING`,
      [lotId, proprietaireId, depuis, auteur.id, auteur.libelle]);
    await journaliser(q, {
      personneId: proprietaireId, action: 'annuaire_proprietaire_ajoute',
      avant: null, apres: `lot ${lotId}`,
      commentaire: `ajouté comme propriétaire du lot ${lotId}`, auteur,
    });
    return { etat: 'ok' as const, data: undefined };
  });
}

/**
 * ══ 🔴 REMPLACER UN PROPRIÉTAIRE — LA VENTE ══════════════════════════════════════════════════════════════════
 *
 * Arno : « remplacer un propriétaire (vente : l'ancien passe dans l'historique du bien, avec sa date de fin) ».
 *
 * 🔴 L'ANCIEN N'EST NI ARCHIVÉ NI DÉTACHÉ : son lien est CLOS par une date de fin. Il garde ses mails, ses
 * rattachements et sa fiche — il a possédé ce bien, et l'historique doit continuer de le dire.
 */
export async function remplacerProprietaireDuLot(lotId: number, o: {
  ancienId: number; nouveauId: number; date: string | null;
}, auteur: Auteur): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    /**
     * ══ 🔴🔴 REMPLACER, OUI — REMPLACER PAR PERSONNE, NON ═════════════════════════════════════════════════════
     *
     * Arno : « “Remplacer” reste possible, PUISQUE le successeur est créé dans la même opération ». C'est
     * exactement ce qui rend ce geste acceptable, et c'est donc exactement ce qu'il faut vérifier : si le
     * successeur n'existe pas, ou s'il est lui-même archivé, le bien se retrouverait sans propriétaire — par la
     * porte de derrière, alors qu'on a fermé celle de devant.
     */
    const { rows: succ } = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_annuaire_proprietaire
        WHERE id = $1 AND archive_le IS NULL`, [o.nouveauId]);
    if ((succ[0]?.n ?? 0) === 0) {
      return {
        etat: 'refus' as const,
        motif: `${MOTIF_DERNIER_PROPRIETAIRE} Le successeur désigné n’existe pas, ou il est archivé.`,
      };
    }

    await q(
      `UPDATE gestion_annuaire_lot_proprietaire
          SET jusqu_a = coalesce($3::date, ${SQL_AUJOURDHUI_PARIS})
        WHERE lot_id = $1 AND proprietaire_id = $2 AND jusqu_a IS NULL`,
      [lotId, o.ancienId, o.date]);
    await q(
      `INSERT INTO gestion_annuaire_lot_proprietaire
         (lot_id, proprietaire_id, rang, depuis, cree_par, cree_par_libelle)
       VALUES ($1, $2, 1, coalesce($3::date, ${SQL_AUJOURDHUI_PARIS}), $4, $5)
       ON CONFLICT (lot_id, proprietaire_id) WHERE jusqu_a IS NULL DO NOTHING`,
      [lotId, o.nouveauId, o.date, auteur.id, auteur.libelle]);
    await journaliser(q, {
      personneId: o.ancienId, action: 'annuaire_proprietaire_remplace',
      avant: `propriétaire du lot ${lotId}`, apres: `remplacé par ${o.nouveauId}`,
      commentaire: `vente : l’ancien propriétaire passe dans l’historique du lot ${lotId}`, auteur,
    });
    return { etat: 'ok' as const, data: undefined };
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ LES OCCUPANTS D'UN BIEN — AJOUTER, ENREGISTRER UN DÉPART
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** CRÉE une personne dans l'annuaire, à la main. Rend son identifiant. */
export async function creerPersonne(
  sujet: Sujet, o: ChampsPersonne & { nom: string }, auteur: Auteur,
  /** 🔴 Arno (25/10/2026, 425) — l'origine du contact d'un PROPRIÉTAIRE, VÉRIFIÉE par l'appelant, écrite dans la même transaction. */
  options: { origine?: OrigineProprietaire | null } = {},
): Promise<IssueEdition<{ id: number }>> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  const nom = texteOuRien(o.nom, 200);
  if (nom === null) return { etat: 'refus', motif: 'Le nom est obligatoire.' };

  /**
   * ⚠️ LES COORDONNÉES SONT VÉRIFIÉES AVANT D'OUVRIR LA TRANSACTION, comme pour une modification : un refus ne
   * doit rien avoir commencé — surtout pas créer une fiche à moitié, qu'il faudrait ensuite retrouver.
   */
  const retenues = verifierCoordonnees(o.coordonnees ?? []);
  if (!retenues.ok) return { etat: 'refus', motif: retenues.motif, rang: retenues.rang };

  const issue = await withTransaction(async (q) => {
    const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const civilite = texteOuRien(o.civilite, 40);
    const prenom = texteOuRien(o.prenom, 120);
    const complet = sujet === 'proprietaire' ? nomComplet(nom, prenom) : nom;
    const champs = [
      texteOuRien(o.qualite, 200), notePropre(o.note),
      texteOuRien(o.adresse, 300), texteOuRien(o.codePostal, 20), texteOuRien(o.commune, 200),
    ];
    /**
     * 🔴🔴 TOUTE LA FICHE EN UNE SEULE ÉCRITURE, coordonnées comprises. L'écran envoie désormais sept champs et
     * deux coordonnées d'un coup (carte d'ajout = carte Modifier vide) : les écrire en deux appels laisserait,
     * au moindre refus du second, une fiche nue dans l'annuaire — sans téléphone, sans adresse, et sans que
     * personne sache d'où elle sort. Ou tout, ou rien.
     */
    const { rows } = sujet === 'proprietaire'
      ? await q<{ id: string }>(
        `INSERT INTO gestion_annuaire_proprietaire
           (wippimmo_id, civilite, nom, prenom, nom_complet, nom_normalise, rang,
            qualite, note, adresse, code_postal, commune)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11) RETURNING id::text`,
        [cle, civilite, nom, prenom, complet, normaliserTexte(complet), ...champs])
      : await q<{ id: string }>(
        `INSERT INTO gestion_annuaire_locataire
           (cle_personne, wippimmo_id, civilite, nom, prenom, nom_normalise, rang,
            qualite, note, adresse, code_postal, commune)
         VALUES ($1, $1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10) RETURNING id::text`,
        [cle, civilite, nom, prenom, normaliserTexte(nom), ...champs]);
    const id = Number(rows[0].id);

    for (const c of retenues.retenues) {
      await q(
        `INSERT INTO gestion_annuaire_contact
           (sujet, sujet_id, sorte, valeur, valeur_brute, rang, libelle, origine)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'saisie')`,
        [sujet, id, c.sorte, c.valeur, c.valeurBrute, c.rang, c.libelle]);
    }
    /**
     * 🔴 UNE FICHE CRÉÉE ICI EST INTÉGRALEMENT À NOUS : chacun de ses champs est verrouillé d'emblée. WIPPIMMO
     * ne la connaît pas (sa clé commence par « app- ») ; le jour où un import prétendrait la recouvrir, il
     * devrait le SIGNALER, pas l'écraser.
     */
    for (const champ of ['civilite', 'nom', 'prenom', 'qualite', 'note', 'adresse', 'code_postal', 'commune',
      'contacts']) {
      await verrouiller(q, { sujet, sujetId: id, champ, valeurImport: null, auteur });
    }

    await journaliser(q, {
      personneId: id, action: 'annuaire_creee', avant: null, apres: complet,
      commentaire: `fiche créée à la main dans l’annuaire, avec ${retenues.retenues.length} coordonnée(s)`,
      auteur,
    });
    if (sujet === 'proprietaire' && options.origine && await origineProprietaireDisponible()) {
      await ecrireOrigineProprietaireTx(q as unknown as Parameters<typeof ecrireOrigineProprietaireTx>[0], id, options.origine, auteur,
        'origine du contact saisie à la création du propriétaire');
    }
    return { etat: 'ok' as const, data: { id } };
  });

  /**
   * 🔴 UNE FICHE CRÉÉE REND RECONNAISSABLES DES ADRESSES QUI NE L'ÉTAIENT PAS — y compris sur des mails VIEUX de
   * plusieurs mois. C'est le cas le plus utile du lot : on crée la fiche d'un correspondant, et son courrier
   * passé rejoint aussitôt le bon dossier.
   */
  const emails = retenues.ok ? retenues.retenues.filter((c) => c.sorte === 'email').map((c) => c.valeur) : [];
  if (issue.etat === 'ok') {
    try {
      if (emails.length > 0) await rafraichirPourAdresses(emails);
      // 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — une fiche créée rend un NOM reconnaissable dans tout le courrier passé.
      await rafraichirPourNoms([nom, o.prenom ?? '']);
    } catch (e) {
      console.error('[annuaire] recalcul des propositions impossible après création d’une fiche %s', sujet, e);
    }
  }
  return issue;
}

/**
 * AJOUTE un occupant à un bien, avec sa date d'entrée. Plusieurs occupants d'un même bail partagent la date.
 *
 * 🔴 LOT L1 — `conditions` (facultatives) : le loyer de départ et le taux de gestion de cette location, écrits DANS LA
 * MÊME TRANSACTION (ajout seul, journalisé). Absentes : rien ne change par rapport à avant ce lot ; la carte du nouvel
 * occupant propose alors « Saisir » avec le taux pré-rempli. Un refus des conditions annule tout le geste.
 */
export async function ajouterOccupant(
  lotId: number, locataireId: number, entree: string | null, auteur: Auteur,
  conditions?: Record<string, unknown> | null,
  /** Le Drive, injecté pour les épreuves (par défaut : le vrai, via le jeton de gestion). */
  depsDrive?: DepsBrancheBail,
): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  // Arno (20/10/2026, 393) : « Ajouter un occupant » rattache le nouvel occupant au BAIL EN COURS du lot (s'il y en a un).
  const avecBail = await bailDisponible();
  let bailRejoint: number | null = null;
  const issue = await withTransaction(async (q) => {
    const bail = avecBail ? await bailEnCoursDuLotDans(q, lotId) : null;
    bailRejoint = bail;
    const cree = await ajouterOccupantDans(q, lotId, locataireId, entree, auteur, bail);
    if (cree === null) return { etat: 'inconnu' as const };
    if (conditions !== undefined && conditions !== null) {
      const issue = await enregistrerConditions(cree, conditions, auteur, q);
      // Un refus lève : `withTransaction` défait alors l'occupation ET son journal — ou tout, ou rien.
      if (issue.etat === 'refus') throw new RefusConditions(issue.motif);
    }
    /* 🔴 Arno (19/10/2026) — à chaque entrée : si TOUS les lots de la fiche d'origine sont désormais loués aux mêmes
       locataires, ils se réunissent en une seule fiche (réintégration, dans cette transaction). */
    await reintegrerSiComplet(q, [lotId], auteur);
    return { etat: 'ok' as const, data: undefined };
  }).catch((e: unknown) => {
    if (e instanceof RefusConditions) return { etat: 'refus' as const, motif: e.message };
    throw e;
  });
  /* Arno (20/10/2026, 394) : le dossier Drive de CE bail (« BAIL MARTIN ») prend le nom du nouvel occupant. Après la
     transaction, jamais bloquant : un échec du Drive ne défait pas l'entrée de l'occupant. */
  const rejoint: number | null = bailRejoint;
  if (issue.etat === 'ok' && rejoint !== null) await renommerBrancheBail(rejoint, depsDrive).catch(() => undefined);
  return issue;
}

/**
 * L'INSERTION d'une occupation, dans la transaction de l'appelant (le geste « Ajouter un occupant », et le bail de la tuile
 * Location sur plusieurs lots). Journalisée. Rend l'identifiant de l'occupation, `null` si le lot n'existe pas.
 */
export async function ajouterOccupantDans(q: RequeteTx, lotId: number, locataireId: number, entree: string | null, auteur: Auteur,
  /** Le BAIL à rejoindre (migration 393) ; absent : la base le choisit (bail en cours du même bien à la même date, ou neuf). */
  bailId: number | null = null): Promise<number | null> {
  const { rows: lot } = await q<{ wippimmo_id: string }>('SELECT wippimmo_id FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  if (lot[0] === undefined) return null;
  const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows: cree } = await q<{ id: string }>(
    `INSERT INTO gestion_annuaire_occupation
       (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree${bailId !== null ? ', bail_id' : ''})
     VALUES ($1, $2, $3, $4, $5::date${bailId !== null ? ', $6' : ''})
     RETURNING id`,
    [cle, locataireId, lotId, lot[0].wippimmo_id, entree, ...(bailId !== null ? [bailId] : [])]);
  await journaliser(q, {
    personneId: locataireId, action: 'annuaire_occupant_ajoute',
    avant: null, apres: `lot ${lotId}${entree === null ? '' : ` depuis le ${entree}`}`,
    commentaire: `occupant ajouté au lot ${lotId}`, auteur,
  });
  return Number(cree[0].id);
}

/** Le refus des conditions d'une location au geste « Ajouter un occupant » : il défait toute la transaction. */
class RefusConditions extends Error {}

/*
 * 🔴🔴 « ENREGISTRER UN DÉPART » N'A PLUS SA PROPRE ÉCRITURE (Arno, 18/10/2026 — « une seule porte pour la sortie »).
 * L'ancien `enregistrerDepart` posait `sortie` sans garde (il écrasait une date existante), sans borne, sans les annexes
 * du bail et sans mail. Le bouton « Enregistrer un départ… » de la Gestion appelle désormais, par sa route, LA fonction de
 * sortie commune `enregistrerSortie` (`app/lib/location/sortieLocatairesRepo.ts`) — mêmes contrôles, mêmes annexes, même
 * journal, même mail que la sortie de la tuile Location. Aucune ligne n'est retirée : une sortie DATE l'occupation.
 */

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ CE QUE L'IMPORT DOIT SAVOIR
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface Verrou { sujet: Sujet; sujetId: number; champ: string; valeurImport: string | null }

/**
 * ══ 🔴🔴 LES CHAMPS QUE L'APPLICATION POSSÈDE ═════════════════════════════════════════════════════════════════
 *
 * L'import les lit AVANT d'écrire : il ne touche pas à un champ verrouillé, et inscrit la divergence dans son
 * rapport (« WIPPIMMO dit X, l'app dit Y »). C'est la promesse d'Arno, et c'est cette lecture qui la tient.
 *
 * ⚠️ SANS LA MIGRATION, LA LISTE EST VIDE — donc l'import se comporte exactement comme avant ce lot. C'est la
 * bonne réponse : sans la table, aucune saisie n'a pu avoir lieu, donc il n'y a rien à protéger.
 */
export async function verrousDeLAnnuaire(): Promise<Verrou[]> {
  if (!await annuaireModifiableDisponible()) return [];
  const { rows } = await query<{ sujet: string; sujet_id: string; champ: string; valeur_import: string | null }>(
    'SELECT sujet, sujet_id::text, champ, valeur_import FROM gestion_annuaire_verrou');
  return rows.map((r) => ({
    sujet: r.sujet as Sujet, sujetId: Number(r.sujet_id), champ: r.champ, valeurImport: r.valeur_import,
  }));
}
