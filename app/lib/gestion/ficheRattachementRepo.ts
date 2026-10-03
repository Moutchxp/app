import { query } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { decortiquerNumero, formaterTelephone } from './telephoneAffichage';
import { annuaireDisponible, horsGestionDisponible, libelleSourceContactDisponible, rattachementsDisponibles } from './schema';
import { libelleContact } from './annuaire';
import { adresseComplete } from './ficheBien';
import type {
  BienRattache, CoordonneeFiche, FicheRattachementFil, PersonneRattachement,
} from './ficheRattachement';
import { ordonnerBiens, ordonnerPersonnes } from './ficheRattachement';

/**
 * MODULE « GESTION » — LOT FICHE-RATTACHEMENT : CE QU'IL FAUT POUR LA FENÊTRE « VISUALISER / MODIFIER ». LECTURE
 * SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE FICHIER RÉPOND À UNE SEULE QUESTION : « cet ÉCHANGE, à quels BIENS est-il rattaché, et que faut-il savoir de
 * chacun pour agir sans rouvrir WIPPIMMO ? »
 *
 * ⚠️ NE PAS CONFONDRE AVEC `classementBien.ts`, qui répond à « à quels biens ce MAIL pourrait-il se rattacher ? ».
 * Là-bas on PROPOSE avant de classer ; ici on DÉCRIT ce qui est déjà posé. Les deux lisent le même annuaire, et
 * c'est pour cela qu'ils partagent `ficheBien` (les mots) et `libelleContact` (les libellés de colonnes) — mais
 * leurs questions ne se confondent pas, et les fondre donnerait un module qui ne sait plus de quoi il parle.
 *
 * 🔒 LECTURE SEULE : aucun `INSERT`, `UPDATE` ni `DELETE`. Les gestes restent ceux de la route des rattachements,
 * avec leur journal. Un test statique le vérifie sur ce fichier.
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce fichier par `tsx`. La frontière navigateur est
 * tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface LienDB {
  id: string;
  message_id: string;
  cible_cle: string | null;
  statut: string;
  origine: string;
  statut_par_libelle: string | null;
  date_mail: string | null;
}

interface LotDB {
  id: string; cle: string; adresse: string | null; code_postal: string | null; commune: string | null;
  immeuble: string | null; nature: string | null; type_bien: string | null;
  proprietaire_id: string | null; proprietaire_cle: string | null; proprietaire_nom: string | null;
  proprietaire_civilite: string | null;
  /** Le dossier Drive du propriétaire, connu depuis le lot 253. C'est le point d'entrée du dossier du bien. */
  drive_dossier_id: string | null;
}

/** La clé d'une personne dans la carte des contacts : sa sorte et son identifiant interne. PUR. */
function cleContact(sujet: string, sujetId: string | number): string { return `${sujet}|${sujetId}`; }

/**
 * ══ 🔴 LE STATUT D'UN BIEN, à partir de ses liens. PUR. ══════════════════════════════════════════════════════════
 *
 * 🔴 « CLASSÉ » L'EMPORTE SUR « AUTO », QUI L'EMPORTE SUR « À TRANCHER ». Un bien qu'un humain a confirmé une fois
 * est classé, même si dix autres mails de la conversation ne portent qu'une proposition : c'est la décision la plus
 * forte qui qualifie le dossier. L'inverse ferait descendre un classement humain au rang de proposition dès qu'un
 * mail de plus arrive.
 */
export function statutDesLiens(
  liens: readonly { statut: string; origine: string; statut_par_libelle: string | null }[],
): BienRattache['statut'] {
  const confirmes = liens.filter((l) => l.statut === 'confirme');
  if (confirmes.some((l) => l.origine === 'manuel' || l.statut_par_libelle !== null)) return 'classe';
  if (confirmes.length > 0) return 'auto';
  return 'a_trancher';
}

/**
 * ══ 🔴 LES BIENS RATTACHÉS À UN ÉCHANGE, ET TOUT CE QU'ON VEUT EN SAVOIR. LECTURE SEULE. ═════════════════════════
 *
 * ⚠️ SANS ANNUAIRE OU SANS RATTACHEMENTS, on rend `disponible: false` plutôt qu'une liste vide. Une liste vide se
 * lirait « cet échange n'est rattaché à rien », ce qui serait faux : on n'a simplement pas pu regarder.
 */
export async function ficheRattachementDuFil(
  filId: number,
  /**
   * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — DE QUEL MAIL LA FENÊTRE PARLE ════════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « elle porte sur UN mail précis : le mail cliqué, ou depuis une ligne de liste le
   * mail affiché sur la ligne (le plus récent de l'échange). En tête : expéditeur, date, objet de ce mail. »
   *
   * 🔴 LE REPLI EST LE MAIL LE PLUS RÉCENT, et c'est exactement ce que la ligne de liste montre. `null` dit donc
   * « celui de la ligne », pas « aucun » : la fenêtre a toujours un mail, c'est tout l'objet du lot.
   *
   * ⚠️ UN MAIL D'UN AUTRE ÉCHANGE EST IGNORÉ (la requête le borne à `fil_id = $1`) : on ne compose pas un en-tête
   * à partir d'un identifiant qui ne vient pas de cette conversation.
   */
  messageId: number | null = null,
): Promise<FicheRattachementFil> {
  const vide: FicheRattachementFil = {
    filId, objet: null, nbMailsDuFil: 0, biens: [], horsGestion: false, messageRecentId: null,
    enTete: null, disponible: false,
  };
  if (!(await rattachementsDisponibles()) || !(await annuaireDisponible())) return vide;

  // ── ① L'ÉCHANGE : son objet et son nombre de mails ──────────────────────────────────────────────────────────
  const { rows: fil } = await query<{ objet: string | null; nb: number; recent: string | null }>(
    `SELECT (SELECT m.objet FROM gestion_message m
              WHERE m.fil_id = $1 ORDER BY m.recu_le DESC, m.id DESC LIMIT 1) AS objet,
            (SELECT m.id::text FROM gestion_message m
              WHERE m.fil_id = $1 ORDER BY m.recu_le DESC, m.id DESC LIMIT 1) AS recent,
            (SELECT count(*) FROM gestion_message m WHERE m.fil_id = $1)::int AS nb`, [filId]);
  const objet = fil[0]?.objet ?? null;
  const nbMailsDuFil = fil[0]?.nb ?? 0;
  const messageRecentId = fil[0]?.recent == null ? null : Number(fil[0].recent);

  /**
   * 🔴🔴 L'EN-TÊTE DU MAIL DONT LA FENÊTRE PARLE — expéditeur, date, objet. UNE requête, bornée à l'échange.
   *
   * ⚠️ `COALESCE($2, recent)` PLUTÔT QU'UNE SECONDE BRANCHE : un seul chemin de lecture, donc un seul
   * comportement à éprouver. Et l'en-tête est `null` quand l'échange est vide — ce qui ne devrait pas arriver,
   * mais se dit plutôt que de s'inventer.
   */
  const cible = messageId !== null && Number.isSafeInteger(messageId) && messageId > 0
    ? messageId : messageRecentId;
  const { rows: tete } = cible === null ? { rows: [] } : await query<{
    id: string; de: string | null; de_nom: string | null; recu_le: string; objet: string | null;
  }>(
    `SELECT m.id::text, m.de_adresse AS de, m.de_nom,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le, m.objet
       FROM gestion_message m WHERE m.id = $2 AND m.fil_id = $1`, [filId, cible]);
  const enTete = tete[0] === undefined ? null : {
    messageId: Number(tete[0].id),
    de: tete[0].de ?? '',
    deNom: tete[0].de_nom,
    recuLe: tete[0].recu_le,
    objet: tete[0].objet,
  };

  /**
   * ── ② LES LIENS VIVANTS DE L'ÉCHANGE ─────────────────────────────────────────────────────────────────────────
   * ⚠️ `cible_sorte = 'lot'` SEULEMENT. Un reste d'ancien modèle (« propriétaire ») n'a pas de bien à décrire :
   * il est montré, tel qu'il est, par l'encart du mail — jamais présenté ici comme un bien rattaché. C'est la
   * règle du lot, et c'est la raison pour laquelle cette requête ne cherche pas à « traduire » ces lignes.
   */
  const { rows: liens } = await query<LienDB>(
    `SELECT r.id::text, r.message_id::text, r.cible_cle, r.statut, r.origine, r.statut_par_libelle,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date_mail
       FROM gestion_rattachement r
       JOIN gestion_message m ON m.id = r.message_id
      WHERE m.fil_id = $1 AND r.statut IN ('propose', 'confirme') AND r.cible_sorte = 'lot'
        AND r.cible_cle IS NOT NULL
      ORDER BY m.recu_le DESC, r.id`, [filId]);

  const horsGestion = (await horsGestionDisponible())
    ? (await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_hors_gestion h
         JOIN gestion_message m ON m.id = h.message_id
        WHERE m.fil_id = $1 AND h.retire_le IS NULL`, [filId])).rows[0]?.n > 0
    : false;

  if (liens.length === 0) {
    return {
      filId, objet, nbMailsDuFil, biens: [], horsGestion, messageRecentId, enTete, disponible: true,
    };
  }

  // ── ③ LES LOTS CONCERNÉS, ET LEUR PROPRIÉTAIRE ──────────────────────────────────────────────────────────────
  const cles = [...new Set(liens.map((l) => l.cible_cle as string))];
  const { rows: lots } = await query<LotDB>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.code_postal, lo.commune,
            lo.immeuble, lo.nature, lo.type_bien,
            lo.proprietaire_id::text AS proprietaire_id,
            pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom,
            pr.civilite AS proprietaire_civilite, pr.drive_dossier_id
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE lo.wippimmo_id = ANY($1::text[])`, [cles]);
  const parCle = new Map(lots.map((l) => [l.cle, l]));

  /**
   * ── ④ LES LOCATAIRES, À LA DATE DU MAIL LE PLUS RÉCENT QUI PORTE CE RATTACHEMENT ─────────────────────────────
   *
   * 🔴 « À LA DATE », ET NON « AUJOURD'HUI ». Un échange d'août 2025 parle du locataire d'août 2025 ; afficher
   * l'occupant actuel ferait rappeler quelqu'un qui n'habitait pas là. Les liens sont déjà triés du plus récent
   * au plus ancien : la première date rencontrée pour un lot est la bonne.
   */
  const dateParCle = new Map<string, string | null>();
  for (const l of liens) {
    const cle = l.cible_cle as string;
    if (!dateParCle.has(cle)) dateParCle.set(cle, l.date_mail);
  }

  const occupations = new Map<string, {
    locataireId: string; cle: string; nom: string; depuis: string | null; jusqua: string | null;
  }[]>();
  for (const cle of cles) {
    const lot = parCle.get(cle);
    if (lot === undefined) continue;
    const { rows } = await query<{
      locataire_id: string; cle: string; nom: string; depuis: string | null; jusqua: string | null;
    }>(
      // ⚠️ PAS DE CIVILITÉ POUR UN LOCATAIRE : l'export WIPPIMMO n'en porte pas (la table n'a pas la colonne).
      //    On ne l'invente donc pas — la carte affiche le nom seul, comme partout ailleurs dans le module.
      `SELECT lc.id::text AS locataire_id, lc.wippimmo_id AS cle, lc.nom,
              o.entree::text AS depuis, o.sortie::text AS jusqua
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
        WHERE o.lot_id = $1
          AND (o.entree IS NULL OR o.entree <= $2::date)
          AND (o.sortie IS NULL OR o.sortie >= $2::date)
        ORDER BY o.entree DESC NULLS LAST, o.id DESC`,
      [lot.id, dateParCle.get(cle) ?? null]);
    occupations.set(cle, rows.map((r) => ({
      locataireId: r.locataire_id, cle: r.cle, nom: r.nom, depuis: r.depuis, jusqua: r.jusqua,
    })));
  }

  /**
   * ── ⑤ LES MOYENS DE CONTACT, EN UNE SEULE REQUÊTE ────────────────────────────────────────────────────────────
   * ⚠️ UNE REQUÊTE POUR TOUTES LES PERSONNES DE LA FENÊTRE, jamais une par carte : la règle du module depuis le
   * bandeau « Rattaché à ». `absent_le IS NULL` — un contact disparu d'un ré-import n'est pas supprimé, il est
   * DATÉ ; l'afficher ferait appeler un numéro que WIPPIMMO ne donne plus.
   */
  const idsProprios = [...new Set(lots.map((l) => l.proprietaire_id).filter((x): x is string => x !== null))];
  const idsLocataires = [...new Set([...occupations.values()].flat().map((x) => x.locataireId))];
  const contacts = new Map<string, { emails: CoordonneeFiche[]; telephones: CoordonneeFiche[] }>();
  if (idsProprios.length > 0 || idsLocataires.length > 0) {
    const avecLibelle = await libelleSourceContactDisponible();
    const { rows: cts } = await query<{
      sujet: string; sujet_id: string; sorte: string; valeur: string; valeur_brute: string;
      rang: number; libelle_source: string | null;
    }>(
      `SELECT sujet, sujet_id::text AS sujet_id, sorte, valeur, valeur_brute, rang,
              ${avecLibelle ? 'libelle_source' : "NULL::text AS libelle_source"}
         FROM gestion_annuaire_contact
        WHERE absent_le IS NULL${await conditionCoordonneeVivante()}
          AND ((sujet = 'proprietaire' AND sujet_id = ANY($1::bigint[]))
            OR (sujet = 'locataire'    AND sujet_id = ANY($2::bigint[])))
        ORDER BY sorte, rang, id`, [idsProprios, idsLocataires]);
    for (const c of cts) {
      const k = cleContact(c.sujet, c.sujet_id);
      const e = contacts.get(k) ?? { emails: [], telephones: [] };
      // 🔴 LE LIBELLÉ N'EST JAMAIS VIDE : `libelleContact` retombe sur la sorte numérotée par le rang.
      const coord: CoordonneeFiche = {
        valeur: c.valeur,
        // 🔴 LOT FICHES-RETOUCHES — un telephone s'affiche groupe par deux ; un e-mail n'est pas touche.
        affichage: c.sorte === 'telephone'
          ? formaterTelephone(c.valeur, c.valeur_brute)
          : (c.valeur_brute.trim() === '' ? c.valeur : c.valeur_brute),
        // 🔴 LOT ANNOTATIONS-TEL — ce qui traînait à côté du numéro, et le type qu'il impose.
        note: c.sorte === 'telephone' ? decortiquerNumero(c.valeur_brute).note : null,
        typeAnnotation: c.sorte === 'telephone' ? decortiquerNumero(c.valeur_brute).type : null,
        libelle: libelleContact({ sorte: c.sorte, rang: c.rang, libelleSource: c.libelle_source }),
      };
      if (c.sorte === 'email') e.emails.push(coord);
      else if (c.sorte === 'telephone') e.telephones.push(coord);
      contacts.set(k, e);
    }
  }
  const contactsDe = (sujet: string, id: string | null) =>
    (id === null ? undefined : contacts.get(cleContact(sujet, id))) ?? { emails: [], telephones: [] };

  /**
   * ── ⑥ 🔴 QUI A ÉCRIT DANS CET ÉCHANGE ────────────────────────────────────────────────────────────────────────
   *
   * C'est ce qui met un bloc « Expéditeur » en tête. On lit le RÔLE `expediteur` des adresses déjà relevées
   * (lot DRIVE-2-bis) : la reconnaissance a déjà dit, pour chacune, si elle est celle d'un propriétaire ou d'un
   * locataire, et lequel. On ne relit aucun mail, on ne devine rien.
   *
   * ⚠️ NOS ADRESSES SONT ÉCARTÉES. `gestion@` est expéditrice de la moitié des messages d'un échange : la garder
   * mettrait « Expéditeur » sur tout le monde, c'est-à-dire sur personne.
   */
  const { rows: expediteurs } = await query<{ partie: string | null; proprietaire_cle: string | null; locataire_id: string | null }>(
    `SELECT DISTINCT a.partie, a.proprietaire_cle, a.locataire_id::text AS locataire_id
       FROM gestion_message_adresse a
       JOIN gestion_message m ON m.id = a.message_id
      WHERE m.fil_id = $1 AND a.role = 'expediteur' AND a.interne = false
        AND a.partie IS NOT NULL`, [filId]);
  /**
   * 🔴🔴 ON FILTRE SUR LA `partie`, ET C'EST INDISPENSABLE — défaut trouvé à l'écran le 28/09/2026 sur « Paiement
   * loyer Octobre » (fil 36505).
   *
   * Une adresse de LOCATAIRE porte AUSSI la clé de son bailleur (`proprietaire_cle`) : c'est normal, la
   * reconnaissance dit tout ce qu'elle sait. Lire cette colonne sans regarder `partie` marquait donc « Expéditeur »
   * sur le PROPRIÉTAIRE dès qu'un locataire écrivait — la fenêtre montrait alors deux expéditeurs, et mettait en
   * tête celui qui n'avait rien envoyé. On aurait rappelé le bailleur au lieu de la locataire.
   */
  const propriosEcrivains = new Set(expediteurs
    .filter((e) => e.partie === 'proprietaire')
    .map((e) => e.proprietaire_cle).filter((x): x is string => x !== null));
  const locatairesEcrivains = new Set(expediteurs
    .filter((e) => e.partie === 'locataire')
    .map((e) => e.locataire_id).filter((x): x is string => x !== null));

  // ── ⑦ L'ASSEMBLAGE ───────────────────────────────────────────────────────────────────────────────────────────
  const biens: BienRattache[] = [];
  for (const cle of cles) {
    const lot = parCle.get(cle);
    if (lot === undefined) continue;
    const siens = liens.filter((l) => l.cible_cle === cle);

    const personnes: PersonneRattachement[] = [];
    if (lot.proprietaire_cle !== null) {
      const c = contactsDe('proprietaire', lot.proprietaire_id);
      personnes.push({
        role: 'proprietaire', cle: lot.proprietaire_cle,
        id: lot.proprietaire_id === null ? null : Number(lot.proprietaire_id),
        nom: lot.proprietaire_nom ?? '(sans nom)', civilite: lot.proprietaire_civilite,
        telephones: c.telephones, emails: c.emails,
        /**
         * 🔴 UN LOCATAIRE QUI ÉCRIT NE MET PAS SON BAILLEUR EN TÊTE. On compare la clé du propriétaire de CE bien
         * à celle des expéditeurs : sans cela, un mail de locataire aurait marqué « Expéditeur » sur le
         * propriétaire, ce qui est faux et ferait rappeler la mauvaise personne.
         */
        expediteur: propriosEcrivains.has(lot.proprietaire_cle),
      });
    }
    for (const o of occupations.get(cle) ?? []) {
      const c = contactsDe('locataire', o.locataireId);
      personnes.push({
        role: 'locataire', cle: o.cle, id: Number(o.locataireId), nom: o.nom, civilite: null,
        telephones: c.telephones, emails: c.emails,
        depuis: o.depuis, jusqua: o.jusqua,
        expediteur: locatairesEcrivains.has(o.locataireId),
      });
    }

    biens.push({
      cle,
      adresseComplete: adresseComplete({
        adresse: lot.adresse, codePostal: lot.code_postal, commune: lot.commune,
      }),
      numeroLot: cle,
      nature: motUtile(lot.nature),
      typeBien: motUtile(lot.type_bien),
      /**
       * 🔴🔴 LA SURFACE N'EXISTE PAS DANS L'EXPORT WIPPIMMO (mesuré le 28/09/2026 : `gestion_annuaire_lot` n'a
       * aucune colonne de surface). On rend donc `null`, et l'écran écrit « surface non renseignée ». On ne la
       * déduit PAS du type de bien : « Type 2 » dit un nombre de pièces, pas des mètres carrés.
       */
      surfaceM2: null,
      statut: statutDesLiens(siens),
      dateMail: dateParCle.get(cle) ?? null,
      nbMails: new Set(siens.map((l) => l.message_id)).size,
      dossierDriveId: lot.drive_dossier_id,
      personnes: ordonnerPersonnes(personnes),
      lienIds: siens.map((l) => Number(l.id)),
    });
  }

  return {
    filId, objet, nbMailsDuFil, biens: ordonnerBiens(biens), horsGestion, messageRecentId, enTete,
    disponible: true,
  };
}

/**
 * « A renseigner » EST UNE VALEUR DE L'IMPORT, PAS UNE VALEUR UTILE : WIPPIMMO l'écrit quand la nature n'a pas été
 * saisie. L'afficher remplirait la fiche d'un mot qui ne dit rien. Même règle que `ficheBien.ts`. PUR.
 */
function motUtile(brut: string | null): string | null {
  const v = (brut ?? '').trim();
  if (v === '' || /^a\s*renseigner$/i.test(v.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return null;
  return v;
}
