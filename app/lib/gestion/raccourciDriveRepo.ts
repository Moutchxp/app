import { query } from '../db/client';
import { sqlLiensDuBien } from './rattachement';
import { rattachementsDisponibles } from './schema';
import { adressesRapprochables } from './adresseInterne';
/* 🔴🔴 `gestion_contact_carte` NE SE NOMME QUE DEPUIS `partieCategorieRepo` — un garde du module le tient. On
   passe donc par sa fonction, jamais par une requête à nous : une table à une seule porte le reste. */
import { biensEtCotesDesContacts } from './partieCategorieRepo';
import type { BienPourLaFenetre, ProprietairePourLaFenetre, RaisonBien } from './raccourciDrive';

/**
 * MODULE « GESTION » — LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE : SUR QUELS BIENS LA FENÊTRE DRIVE S'OUVRE, LU EN
 * BASE. Lecture seule, STRICTEMENT : aucun INSERT, aucun UPDATE, et aucun appel à Google.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 AUCUN APPEL AU DRIVE ICI, ET C'EST CE QUI REND LE RACCOURCI GRATUIT. Notre base connaît déjà l'arbre du
 * Drive (`gestion_drive_arbre`, construit et tenu à jour par le module) : un nœud par bien (365 sur 365 lots au
 * 07/10/2026) et un par propriétaire (307 sur 307). On ne cherche donc rien chez Google à l'ouverture de la
 * fenêtre — ni `files.list`, ni descente dans une arborescence.
 *
 * 🔴 ET C'EST LE DOSSIER DE LA FICHE DU BIEN, AU NŒUD PRÈS. « Dossier Drive du lot » (`Annuaire.tsx`) lit
 * `gestion_drive_arbre` sorte « bien », clé = le numéro de lot — exactement ce que lit ce module. Arno a nommé ce
 * dossier-là (« celui de “Dossier Drive” sur la fiche bien ») ; prendre le dossier du PROPRIÉTAIRE, comme le fait
 * le raccourci du lot DRIVE-DOSSIER-DU-BIEN, aurait ouvert un cran trop haut et mené ailleurs que la fiche.
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce genre de fichier par `tsx`. La frontière
 * navigateur est tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface LigneLot {
  cle: string;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  proprietaire: string | null;
  proprietaire_cle: string | null;
  dossier_bien: string | null;
}

/**
 * Le libellé d'un bien. PUR.
 *
 * ⚠️ LE NUMÉRO DE LOT EST TOUJOURS ÉCRIT, même quand l'adresse l'est aussi — et c'est mesuré, pas décoratif : RD
 * PROMOTION ET CIE porte SIX lots à la même adresse (19 rue Diderot, Issy-les-Moulineaux). Sans le numéro, ses six
 * vignettes seraient six lignes identiques.
 */
function libelleDuLot(r: LigneLot): string {
  const lieu = [r.adresse, [r.code_postal, r.commune].filter((x) => (x ?? '') !== '').join(' ')]
    .filter((x) => (x ?? '') !== '').join(', ');
  return lieu === '' ? `lot ${r.cle}` : `${lieu} — lot ${r.cle}`;
}

/**
 * 🔴 LE DOSSIER DU BIEN VIENT DE L'ARBRE, PAR UNE JOINTURE, et jamais d'une seconde requête par lot : un
 * propriétaire en porte jusqu'à six, et six allers-retours à l'ouverture de la fenêtre se verraient.
 *
 * ⚠️ `absent_le IS NULL` : un dossier retiré du Drive reste dans l'arbre, marqué absent. L'ouvrir mènerait à une
 * page d'erreur de Google.
 */
const CHAMPS_LOT = `lo.wippimmo_id AS cle, lo.adresse, lo.code_postal, lo.commune,
  pr.nom_complet AS proprietaire, pr.wippimmo_id AS proprietaire_cle, dr.drive_id AS dossier_bien`;

const JOINTURES_LOT = `LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
  LEFT JOIN gestion_drive_arbre dr ON dr.sorte = 'bien' AND dr.cle = lo.wippimmo_id AND dr.absent_le IS NULL`;

function enBien(r: LigneLot, raison: RaisonBien): BienPourLaFenetre {
  return {
    cle: r.cle,
    libelle: libelleDuLot(r),
    proprietaire: r.proprietaire,
    raison,
    dossierId: r.dossier_bien,
    // Le nom réel du dossier n'est pas en base : le Drive le donnera en l'ouvrant. On n'invente pas de nom.
    dossierNom: null,
  };
}

/**
 * ══ 🔴 ⓐ LES BIENS AUXQUELS LE MAIL EST DÉJÀ RATTACHÉ ════════════════════════════════════════════════════════════
 *
 * Deux sources, dans cet ordre : les lots choisis À LA MAIN pendant l'écriture (« Classer ce mail »), puis les
 * rattachements vivants de l'échange auquel on répond.
 *
 * 🔴 LE PRÉDICAT VIENT DU FRAGMENT UNIQUE (`sqlLiensDuBien`) — « qu'est-ce qu'un bien rattaché à un mail » n'a
 * qu'une définition dans ce dépôt, et c'est la règle du lot HISTORIQUES-UNE-SEULE-REGLE. La réécrire ici ferait
 * un cinquième endroit à corriger au premier changement.
 *
 * ⚠️ SANS LA MIGRATION 257, on ne NOMME PAS `gestion_rattachement` : seuls les lots explicites sont rendus, et la
 * fenêtre est celle d'avant ce lot. Nommer une table absente ferait échouer son ouverture entière.
 */
async function clesRattachees(filId: number | null, cles: readonly string[]): Promise<string[]> {
  const explicites = [...new Set(cles.map((c) => String(c).trim()).filter((c) => c !== ''))].slice(0, 20);
  let duFil: string[] = [];
  if (filId !== null && (await rattachementsDisponibles())) {
    const { rows } = await query<{ cle: string }>(
      `SELECT DISTINCT ON (r.cible_cle) r.cible_cle AS cle
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
        WHERE m.fil_id = $1 AND ${sqlLiensDuBien('r')}
        ORDER BY r.cible_cle, r.cree_le`, [filId]);
    duFil = rows.map((r) => r.cle);
  }
  return [...new Set([...explicites, ...duFil])];
}

/** Les lots nommés, lus avec leur dossier. L'ORDRE DEMANDÉ EST REMIS : `ANY` ne le garantit pas. */
async function lotsNommes(cles: readonly string[]): Promise<LigneLot[]> {
  if (cles.length === 0) return [];
  const { rows } = await query<LigneLot>(
    `SELECT ${CHAMPS_LOT}
       FROM gestion_annuaire_lot lo ${JOINTURES_LOT}
      WHERE lo.wippimmo_id = ANY ($1::text[]) AND lo.absent_le IS NULL`, [cles]);
  const parCle = new Map(rows.map((r) => [r.cle, r]));
  return cles.map((c) => parCle.get(c)).filter((r): r is LigneLot => r !== undefined);
}

/**
 * ══ 🔴🔴 ⓑ QUE DIT L'ANNUAIRE DE CETTE ADRESSE ═══════════════════════════════════════════════════════════════════
 *
 * 🔴 LE PROPRIÉTAIRE PRIME SUR LE LOCATAIRE, exactement comme dans `reconnaitre` (module `adressesMessage`) : un
 * bailleur ne déménage pas de son bien, c'est le rapprochement le plus stable. Deux ordres de priorité différents
 * dans le même module auraient fini par proposer deux dossiers différents pour une même adresse.
 *
 * ⚠️ LES CONTACTS ARCHIVÉS OU ABSENTS SONT ÉCARTÉS, les autres non : une adresse ajoutée à la main par le « + »
 * (`origine = 'saisie'`, 18 en base) vaut exactement celle d'un import. C'est la demande d'Arno — « CARTE DE
 * CONTACT créée par le “+” : mêmes règles que son client » — et elle s'obtient sans règle de plus, puisque
 * `origine` n'entre tout simplement pas dans la requête.
 */
async function sujetDeLAdresse(
  adresse: string,
): Promise<{ sujet: 'proprietaire' | 'locataire'; id: number } | null> {
  const { rows } = await query<{ sujet: string; sujet_id: string }>(
    `SELECT c.sujet, c.sujet_id::text
       FROM gestion_annuaire_contact c
      WHERE c.sorte = 'email' AND lower(btrim(c.valeur)) = $1
        AND c.absent_le IS NULL AND c.archive_le IS NULL
      ORDER BY (c.sujet = 'proprietaire') DESC, c.rang NULLS LAST, c.id`, [adresse]);
  const r = rows[0];
  if (r === undefined) return null;
  const sujet = r.sujet === 'proprietaire' ? 'proprietaire' : 'locataire';
  return { sujet, id: Number(r.sujet_id) };
}

/**
 * ══ 🔴 LES BIENS D'UN LOCATAIRE — TOUS, LE PLUS RÉCENT EN PREMIER ════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « LOCATAIRE (actuel ou ancien) : le ou les biens qu'il occupe ou a occupés (le plus récent en
 * premier) ».
 *
 * 🔴 ON NE CHOISIT PAS PAR LA DATE DU MAIL, et c'est une différence VOULUE avec `reconnaitre`, qui, lui, cherche
 * le bail en cours À LA DATE DU MAIL et renonce quand il y en a plusieurs. Les deux répondent à des questions
 * différentes : lui décide d'un RATTACHEMENT (où ranger ce mail-ci, une seule réponse possible), ici on propose
 * des RACCOURCIS (où l'on va sans doute aller, et plusieurs propositions valent mieux qu'aucune). Renoncer
 * devant trois baux, comme il le fait, ne donnerait aucune vignette là où trois sont utiles.
 *
 * ⚠️ L'ORDRE : un bail EN COURS d'abord, puis les terminés du plus récent au plus ancien. `coalesce(sortie,
 * 'infinity')` met les baux sans sortie en tête sans avoir à écrire deux tris — et `infinity` plutôt qu'une date
 * lointaine écrite à la main, qui aurait fini par être dépassée.
 *
 * ⚠️ UN MÊME LOT PEUT ÊTRE OCCUPÉ DEUX FOIS (il est reparti, puis revenu) : `DISTINCT ON` ne garde que le bail le
 * plus récent, sans quoi la même vignette apparaîtrait deux fois.
 */
async function biensDuLocataire(locataireId: number): Promise<BienPourLaFenetre[]> {
  const { rows } = await query<LigneLot & { en_cours: boolean }>(
    `SELECT ${CHAMPS_LOT}, (o.sortie IS NULL OR o.sortie >= current_date) AS en_cours
       FROM (
         SELECT DISTINCT ON (oc.lot_wippimmo_id) oc.lot_wippimmo_id, oc.sortie, oc.entree
           FROM gestion_annuaire_occupation oc
          WHERE oc.locataire_id = $1 AND oc.absent_le IS NULL
            AND btrim(coalesce(oc.lot_wippimmo_id, '')) <> ''
          ORDER BY oc.lot_wippimmo_id, coalesce(oc.sortie, 'infinity'::date) DESC, oc.entree DESC NULLS LAST
       ) o
       JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = o.lot_wippimmo_id AND lo.absent_le IS NULL
       ${JOINTURES_LOT}
      ORDER BY coalesce(o.sortie, 'infinity'::date) DESC, o.entree DESC NULLS LAST, lo.wippimmo_id
      LIMIT 20`, [locataireId]);
  return rows.map((r) => enBien(r, r.en_cours ? 'locataire' : 'ancien_locataire'));
}

/**
 * ══ 🔴 LES BIENS D'UN PROPRIÉTAIRE, ET SON PROPRE DOSSIER ════════════════════════════════════════════════════════
 *
 * ⚠️ L'ORDRE EST CELUI DE LA FICHE (`annuaireRepo`) : les biens encore gérés d'abord, puis par commune et adresse.
 * Un autre ordre ici ferait lire deux listes différentes pour un même bailleur, à deux endroits de l'écran.
 *
 * ⚠️ LE DOSSIER DU PROPRIÉTAIRE EST LU DANS L'ARBRE, comme celui des biens — et non dans
 * `gestion_annuaire_proprietaire.drive_dossier_id`, qui dit la même chose par une autre porte. Une seule porte :
 * le jour où l'arbre et la colonne divergent, c'est l'arbre qui décrit le Drive.
 */
async function biensDuProprietaire(
  proprietaireId: number,
): Promise<{ biens: BienPourLaFenetre[]; proprietaire: ProprietairePourLaFenetre | null }> {
  const { rows } = await query<LigneLot>(
    `SELECT ${CHAMPS_LOT}
       FROM gestion_annuaire_lot lo ${JOINTURES_LOT}
      WHERE lo.proprietaire_id = $1 AND lo.absent_le IS NULL
      ORDER BY (lo.gestion_fin IS NOT NULL), lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id
      LIMIT 20`, [proprietaireId]);
  if (rows.length === 0) return { biens: [], proprietaire: null };

  const multi = rows.length > 1;
  const biens = rows.map((r) => enBien(r, multi ? 'proprietaire_multi' : 'proprietaire'));
  if (!multi) return { biens, proprietaire: null };

  const { rows: pr } = await query<{ nom: string; drive_id: string | null }>(
    `SELECT p.nom_complet AS nom, dr.drive_id
       FROM gestion_annuaire_proprietaire p
       LEFT JOIN gestion_drive_arbre dr
              ON dr.sorte = 'proprietaire' AND dr.cle = p.wippimmo_id AND dr.absent_le IS NULL
      WHERE p.id = $1`, [proprietaireId]);
  const p = pr[0];
  return {
    biens,
    proprietaire: p === undefined ? null : {
      nom: p.nom ?? '', dossierId: p.drive_id, dossierNom: null, nbBiens: rows.length,
    },
  };
}

/**
 * ══ 🔴🔴 LA RÉPONSE COMPLÈTE : LES BIENS DE LA FENÊTRE, ET LE DOSSIER DU PROPRIÉTAIRE S'IL Y A LIEU ══════════════
 *
 * 🔴 L'ORDRE DE PRIORITÉ D'ARNO, APPLIQUÉ ICI ET NULLE PART AILLEURS : ⓐ le mail est rattaché → ces biens-là, et
 * la recherche par adresse n'est MÊME PAS LANCÉE ; ⓑ sinon la première adresse du « À » qui n'est pas des nôtres ;
 * ⓒ sinon rien. Le « et rien d'autre » de ⓐ s'obtient par un retour anticipé — la seule forme qui ne puisse pas
 * se mélanger par accident avec la suite.
 *
 * 🔴 « LA PREMIÈRE ADRESSE QUI N'EST PAS UNE ADRESSE DE L'AGENCE » vient d'`adressesRapprochables`, l'unique
 * définition du dépôt (`adresseInterne.ts`). Six fiches WIPPIMMO portent une de nos adresses : la réécrire ici
 * aurait ouvert, en répondant à un collègue, le dossier d'un logement sans rapport avec l'échange.
 *
 * ⚠️ UNE SEULE ADRESSE EST CONSULTÉE, la première — pas toutes. C'est la règle écrite, et c'est aussi ce qui rend
 * la fenêtre stable : ajouter un second destinataire ne doit pas faire changer les vignettes sous la main.
 */
export async function biensPourLaFenetreDrive(o: {
  filId?: number | null;
  /** Les lots choisis à l'écriture (`brouillon.cibles`). */
  cles?: readonly string[];
  /** Les adresses du champ « À », dans l'ordre de saisie. */
  adresses?: readonly string[];
}): Promise<{ biens: BienPourLaFenetre[]; proprietaire: ProprietairePourLaFenetre | null }> {
  const filId = Number.isSafeInteger(o.filId ?? NaN) && (o.filId ?? 0) > 0 ? (o.filId as number) : null;

  // ⓐ — et si elle répond, on s'arrête là.
  const cles = await clesRattachees(filId, o.cles ?? []);
  if (cles.length > 0) {
    const lignes = await lotsNommes(cles);
    if (lignes.length > 0) return { biens: lignes.map((r) => enBien(r, 'rattache')), proprietaire: null };
  }

  // ⓑ — la première adresse utilisable du champ « À ».
  const adresse = adressesRapprochables(o.adresses ?? [])[0];
  if (adresse === undefined) return { biens: [], proprietaire: null };

  const sujet = await sujetDeLAdresse(adresse);
  if (sujet !== null) {
    if (sujet.sujet === 'proprietaire') return await biensDuProprietaire(sujet.id);
    return { biens: await biensDuLocataire(sujet.id), proprietaire: null };
  }

  /**
   * ══ 🔴🔴 ⓑ bis — LA CARTE DE CONTACT CRÉÉE PAR LE « + » ════════════════════════════════════════════════════
   *
   * DEMANDE D'ARNO : « CARTE DE CONTACT créée par le “+” (contact du propriétaire ou du locataire) : mêmes
   * règles que son client, POUR LE BIEN CONCERNÉ. »
   *
   * 🔴 ELLE PASSE APRÈS L'ANNUAIRE, ET C'EST L'ORDRE JUSTE. Une adresse qui est à la fois dans l'annuaire ET sur
   * une carte de contact désigne d'abord un client : l'annuaire dit QUI elle est, la carte dit seulement sur
   * quel dossier on l'a rencontrée. L'inverse aurait fait passer un propriétaire pour le contact d'un autre.
   *
   * 🔴 « POUR LE BIEN CONCERNÉ » EST LA MOITIÉ IMPORTANTE : une carte porte UN bien (`lot_cle` est sa clé), et
   * c'est celui-là qu'on propose — jamais tous les biens de son client. Le contact de l'artisan du lot 432 n'a
   * rien à voir avec les cinq autres logements du même bailleur.
   */
  const cartes = (await biensEtCotesDesContacts([adresse])).get(adresse) ?? [];
  if (cartes.length === 0) return { biens: [], proprietaire: null };
  const lignes = await lotsNommes([...new Set(cartes.map((c) => c.lotCle))]);
  const coteDe = new Map(cartes.map((c) => [c.lotCle, c.cote]));
  return {
    biens: lignes.map((r) => enBien(
      r, coteDe.get(r.cle) === 'proprietaire' ? 'contact_proprietaire' : 'contact_locataire')),
    proprietaire: null,
  };
}
