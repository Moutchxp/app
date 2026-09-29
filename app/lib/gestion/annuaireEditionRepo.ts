import { query, withTransaction, type RequeteTx } from '../db/client';
import { annuaireModifiableDisponible } from './schema';
import { nomComplet, normaliserTexte } from './annuaire';
import {
  MOTIF_DERNIER_PROPRIETAIRE, notePropre, texteOuRien, verifierCoordonnees, verifierSeparation,
  type CoordonneeSaisie, type RepartitionCoordonnee,
} from './annuaireEdition';
import type { Auteur } from './rattachementRepo';

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
  | { etat: 'refus'; motif: string; rang?: number };

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
}): Promise<void> {
  await q(
    `INSERT INTO gestion_journal
       (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7)`,
    [o.personneId, o.action, o.avant, o.apres, o.commentaire, o.auteur.id, o.auteur.libelle]);
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

  return withTransaction(async (q) => {
    const { rows } = await q<Record<string, string | null>>(
      `SELECT * FROM ${TABLE[sujet]} WHERE id = $1 FOR UPDATE`, [id]);
    const avant = rows[0];
    if (avant === undefined) return { etat: 'inconnu' as const };

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
      await q(`UPDATE ${TABLE[sujet]} SET ${colonne} = $2 WHERE id = $1`, [id, valeur]);
      await verrouiller(q, { sujet, sujetId: id, champ: colonne, valeurImport: avant[colonne] ?? null, auteur });
      await journaliser(q, {
        personneId: id, action: `annuaire_${colonne}`,
        avant: avant[colonne] ?? null, apres: valeur,
        commentaire: `${colonne} modifié dans la fiche`, auteur,
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

    // ── LES COORDONNÉES ───────────────────────────────────────────────────────────────────────────────────────
    if (retenues !== null && retenues.ok) {
      const { rows: anciennes } = await q<{ id: string; sorte: string; valeur: string }>(
        `SELECT id::text, sorte, valeur FROM gestion_annuaire_contact
          WHERE sujet = $1 AND sujet_id = $2 AND archive_le IS NULL`, [sujet, id]);
      const voulues = new Set(retenues.retenues.map((c) => `${c.sorte}:${c.valeur}`));

      // 🔴 CE QUI SORT EST ARCHIVÉ — jamais effacé. On garde qui l'a retiré et quand, dans le journal.
      for (const a of anciennes) {
        if (voulues.has(`${a.sorte}:${a.valeur}`)) continue;
        await q('UPDATE gestion_annuaire_contact SET archive_le = now() WHERE id = $1', [Number(a.id)]);
        await journaliser(q, {
          personneId: id, action: 'annuaire_coordonnee_retiree',
          avant: `${a.sorte} ${a.valeur}`, apres: null,
          commentaire: 'coordonnée retirée de la fiche (archivée, jamais supprimée)', auteur,
        });
      }

      // 🔴 CE QUI ENTRE OU REVIENT : `ON CONFLICT` sur la clé unique (sujet, sujet_id, sorte, valeur). Une
      //    coordonnée retirée puis remise se RÉVEILLE (archive_le à NULL) au lieu de faire une seconde ligne.
      for (const c of retenues.retenues) {
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
        commentaire: 'coordonnées de la fiche modifiées', auteur,
      });
    }

    return { etat: 'ok' as const, data: undefined };
  });
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

  return withTransaction(async (q) => {
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
          SET jusqu_a = coalesce($3::date, current_date)
        WHERE lot_id = $1 AND proprietaire_id = $2 AND jusqu_a IS NULL`,
      [lotId, o.ancienId, o.date]);
    await q(
      `INSERT INTO gestion_annuaire_lot_proprietaire
         (lot_id, proprietaire_id, rang, depuis, cree_par, cree_par_libelle)
       VALUES ($1, $2, 1, coalesce($3::date, current_date), $4, $5)
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

  return withTransaction(async (q) => {
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
    return { etat: 'ok' as const, data: { id } };
  });
}

/** AJOUTE un occupant à un bien, avec sa date d'entrée. Plusieurs occupants d'un même bail partagent la date. */
export async function ajouterOccupant(
  lotId: number, locataireId: number, entree: string | null, auteur: Auteur,
): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows: lot } = await q<{ wippimmo_id: string }>(
      'SELECT wippimmo_id FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
    if (lot[0] === undefined) return { etat: 'inconnu' as const };
    const cle = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await q(
      `INSERT INTO gestion_annuaire_occupation
         (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree)
       VALUES ($1, $2, $3, $4, $5::date)`,
      [cle, locataireId, lotId, lot[0].wippimmo_id, entree]);
    await journaliser(q, {
      personneId: locataireId, action: 'annuaire_occupant_ajoute',
      avant: null, apres: `lot ${lotId}${entree === null ? '' : ` depuis le ${entree}`}`,
      commentaire: `occupant ajouté au lot ${lotId}`, auteur,
    });
    return { etat: 'ok' as const, data: undefined };
  });
}

/**
 * ENREGISTRE UN DÉPART : l'occupation est DATÉE, et passe dans l'historique du bien.
 *
 * 🔴 AUCUNE LIGNE N'EST RETIRÉE. Un locataire parti reste dans l'historique avec ses coordonnées — c'est
 * exactement ce qu'on vient y chercher deux ans plus tard.
 */
export async function enregistrerDepart(
  occupationId: number, sortie: string | null, auteur: Auteur,
): Promise<IssueEdition> {
  if (!await annuaireModifiableDisponible()) return { etat: 'sans_schema' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ locataire_id: string; lot_id: string | null; sortie: string | null }>(
      `SELECT locataire_id::text, lot_id::text, sortie::text FROM gestion_annuaire_occupation
        WHERE id = $1 FOR UPDATE`, [occupationId]);
    const o = rows[0];
    if (o === undefined) return { etat: 'inconnu' as const };
    await q(
      'UPDATE gestion_annuaire_occupation SET sortie = coalesce($2::date, current_date) WHERE id = $1',
      [occupationId, sortie]);
    await journaliser(q, {
      personneId: Number(o.locataire_id), action: 'annuaire_depart',
      avant: o.sortie, apres: sortie ?? 'aujourd’hui',
      commentaire: `départ enregistré du lot ${o.lot_id ?? '?'} — l’occupation passe dans l’historique`, auteur,
    });
    return { etat: 'ok' as const, data: undefined };
  });
}

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
