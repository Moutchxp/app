/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : L'HISTORIQUE, LU EN BASE. IMPUR (SQL), STRICTEMENT EN LECTURE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE N'ÉCRIT RIEN, et ne sait pas écrire : aucun INSERT, aucun UPDATE. Les gestes sur les propositions
 * passent par la route des rattachements, celle du lot RATTACHEMENT-1 — il n'y a qu'un chemin d'écriture.
 *
 * 🔴 UNE SEULE DÉFINITION DE « LES MAILS DE CETTE CIBLE ». Elle est construite une fois (`cteMessages`) et partagée
 * par les TROIS questions de l'écran : la page de la frise, le compteur d'en-tête, et la liste des interlocuteurs.
 * Trois définitions donneraient trois chiffres pour une même chose, et c'est toujours celui qu'on regarde le moins qui
 * garde le faux.
 *
 * 🔴 AUCUNE REQUÊTE SUR TOUT L'HISTORIQUE D'UN COUP. La frise est paginée ; le corps des mails n'est lu qu'en EXTRAIT
 * borné. Le lot 282 porte 429 mails : il doit s'ouvrir aussi vite qu'un lot qui en porte trois.
 *
 * ⚠️ IL NE TOUCHE NI GMAIL, NI LE DRIVE. Les liens Drive déjà connus des pièces s'affichent par le composant existant,
 * qui interroge sa propre route — rien de neuf n'est demandé à Google ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { adressesDuChamp } from './adressesMessage';
import { nomBien, nomProprietaire } from './driveArbre';
import { deplacementsDeMailsDisponibles, rattachementsDisponibles } from './schema';
import { cibleEvenement, cibleLot, cibleProprietaire, type Cible } from './rattachement';
import { libelleCible, type LienAffiche } from './rattachementRepo';
import {
  texteCible, INTERLOCUTEURS_MAX,
  type EnteteHistorique, type FiltresHistorique, type Interlocuteur, type LigneHistorique, type PieceHistorique,
} from './historique';

/** L'extrait d'un mail dans la frise : assez pour reconnaître de quoi il parle, pas assez pour peser. */
export const EXTRAIT_MAX = 240;
/** Combien de destinataires on nomme par ligne. Au-delà, l'écran dit « et N autres ». */
export const DESTINATAIRES_MAX = 4;

export type Issue<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' } | { etat: 'inconnue' };

// ── LA CIBLE, ÉTENDUE ───────────────────────────────────────────────────────────────────────────────────────────

export interface CibleEtendue {
  /** La cible demandée, telle quelle. */
  cible: Cible;
  titre: string;
  sousTitre: string | null;
  /** Les clés de lot à inclure. */
  lots: string[];
  /** Les clés de propriétaire à inclure. */
  proprietaires: string[];
  /** Les identifiants d'événement à inclure. */
  evenements: number[];
  /** Nom lisible de chaque cible incluse, indexé par sa forme courte d'adresse. */
  libelles: Map<string, string>;
  /** Le propriétaire du logement demandé, quand il y en a un — sert à proposer l'interrupteur. */
  proprietaireDuLot: { cle: string; libelle: string } | null;
  /** Les logements du propriétaire demandé — sert à proposer l'interrupteur et le regroupement. */
  logementsDuProprietaire: { cle: string; libelle: string }[];
}

/**
 * CE QUE « L'HISTORIQUE DE CETTE CIBLE » RECOUVRE EXACTEMENT, selon les interrupteurs. LECTURE SEULE.
 *
 * 🔴 UN ÉVÉNEMENT RECOUVRE AUSSI SES ÉCHANGES AFFECTÉS, et c'est une décision qu'il faut dire. Le moteur ne propose
 * jamais d'événement (aucune adresse ne désigne une carte) : un historique d'événement limité aux rattachements serait
 * donc vide, et le point d'entrée « carte » ne servirait à rien. On y joint donc les échanges que
 * `gestion_affectation` pose sur cette carte — l'axe du flux de travail, qui existait bien avant ce lot. Chaque ligne
 * DIT d'où elle vient (`source`), pour que les deux axes ne se confondent pas.
 */
export async function etendreCible(cible: Cible, f: FiltresHistorique): Promise<Issue<CibleEtendue>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };

  const vide: CibleEtendue = {
    cible, titre: '', sousTitre: null, lots: [], proprietaires: [], evenements: [],
    libelles: new Map(), proprietaireDuLot: null, logementsDuProprietaire: [],
  };

  if (cible.sorte === 'evenement') {
    const { rows } = await query<{ reference: string; objet: string; etat: string }>(
      'SELECT reference, objet, etat FROM gestion_evenement WHERE id = $1', [cible.id ?? 0]);
    if (rows.length === 0) return { etat: 'inconnue' };
    const titre = `${rows[0].reference} — ${rows[0].objet}`;
    return {
      etat: 'ok',
      data: {
        ...vide, titre, sousTitre: `carte ${libelleEtat(rows[0].etat)}`,
        evenements: [cible.id ?? 0], libelles: new Map([[texteCible(cible), titre]]),
      },
    };
  }

  if (cible.sorte === 'lot') {
    const { rows } = await query<{
      prop: string | null; prop_nom: string | null; adresse: string | null; cp: string | null;
      commune: string | null; nature: string | null; type_bien: string | null; absent: boolean;
    }>(`SELECT pr.wippimmo_id AS prop, pr.nom_complet AS prop_nom, lo.adresse, lo.code_postal AS cp, lo.commune,
               lo.nature, lo.type_bien, (lo.absent_le IS NOT NULL) AS absent
          FROM gestion_annuaire_lot lo
          LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
         WHERE lo.wippimmo_id = $1`, [cible.cle ?? '']);
    if (rows.length === 0) return { etat: 'inconnue' };
    const l = rows[0];
    const titre = nomBien({
      wippimmoId: cible.cle ?? '', proprietaireWippimmoId: l.prop, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    });
    const proprietaireDuLot = l.prop === null ? null : {
      cle: l.prop,
      libelle: nomProprietaire({ wippimmoId: l.prop, nomComplet: l.prop_nom ?? '' }),
    };
    const libelles = new Map([[texteCible(cible), titre]]);
    if (proprietaireDuLot !== null) {
      libelles.set(texteCible(cibleProprietaire(proprietaireDuLot.cle)), proprietaireDuLot.libelle);
    }
    return {
      etat: 'ok',
      data: {
        ...vide, titre,
        sousTitre: l.absent ? 'ce logement n’est plus dans l’export de gestion' : proprietaireDuLot?.libelle ?? null,
        lots: [cible.cle ?? ''],
        proprietaires: f.avecProprietaire && proprietaireDuLot !== null ? [proprietaireDuLot.cle] : [],
        libelles, proprietaireDuLot,
      },
    };
  }

  // ── UN PROPRIÉTAIRE ──────────────────────────────────────────────────────────────────────────────────────────
  const { rows: pr } = await query<{ nom_complet: string; absent: boolean }>(
    'SELECT nom_complet, (absent_le IS NOT NULL) AS absent FROM gestion_annuaire_proprietaire WHERE wippimmo_id = $1',
    [cible.cle ?? '']);
  if (pr.length === 0) return { etat: 'inconnue' };
  const titre = nomProprietaire({ wippimmoId: cible.cle ?? '', nomComplet: pr[0].nom_complet });

  const { rows: lots } = await query<{
    cle: string; adresse: string | null; cp: string | null; commune: string | null;
    nature: string | null; type_bien: string | null;
  }>(`SELECT lo.wippimmo_id AS cle, lo.adresse, lo.code_postal AS cp, lo.commune, lo.nature, lo.type_bien
        FROM gestion_annuaire_lot lo
        JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
       WHERE pr.wippimmo_id = $1 ORDER BY lo.wippimmo_id`, [cible.cle ?? '']);

  const logements = lots.map((l) => ({
    cle: l.cle,
    libelle: nomBien({
      wippimmoId: l.cle, proprietaireWippimmoId: cible.cle, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    }),
  }));

  const libelles = new Map([[texteCible(cible), titre]]);
  for (const l of logements) libelles.set(texteCible(cibleLot(l.cle)), l.libelle);

  return {
    etat: 'ok',
    data: {
      ...vide, titre,
      sousTitre: pr[0].absent
        ? 'ce propriétaire n’est plus dans l’export de gestion'
        : `${logements.length} logement${logements.length > 1 ? 's' : ''} en gestion`,
      proprietaires: [cible.cle ?? ''],
      lots: f.avecLogements ? logements.map((l) => l.cle) : [],
      libelles, logementsDuProprietaire: logements,
    },
  };
}

/** L'état d'une carte, en mots. PUR. */
function libelleEtat(e: string): string {
  if (e === 'a_traiter') return 'à traiter';
  if (e === 'en_cours') return 'en cours';
  return 'traitée';
}

// ── LA DÉFINITION PARTAGÉE DES MAILS DE LA CIBLE ────────────────────────────────────────────────────────────────

/**
 * LE `WITH` QUI DIT « CES MAILS-LÀ », une fois pour les trois questions de l'écran.
 *
 * Les paramètres sont TOUJOURS dans le même ordre : $1 lots, $2 propriétaires, $3 événements. La suite du SQL ajoute
 * les siens à partir de $4.
 *
 * ⚠️ `DISTINCT ON (message_id)` EN MODE PLAT, pour qu'un mail rattaché à la fois au logement et à son propriétaire
 * n'apparaisse pas deux fois dans la frise. La priorité choisit la cible la plus PRÉCISE (logement avant
 * propriétaire) : c'est celle qui renseigne le plus. En mode GROUPÉ, au contraire, on garde les deux lignes — un mail
 * qui concerne deux logements doit apparaître sous les deux.
 */
function cteMessages(o: { avecCarte: boolean; deplacements: boolean; grouper: boolean }): string {
  const carte = o.avecCarte
    ? `
     UNION ALL
     -- LES ÉCHANGES POSÉS SUR CETTE CARTE (axe du flux de travail, antérieur à ce lot). Voir \`etendreCible\`.
     SELECT m2.id AS message_id, 'evenement'::text AS cible_sorte, NULL::text AS cible_cle,
            af.evenement_id AS cible_id, NULL::text AS cible_libelle, 4 AS prio, 'carte'::text AS source
       FROM gestion_affectation af
       JOIN gestion_message m2 ON ${o.deplacements
    ? '((af.message_id IS NULL AND m2.fil_id = af.fil_id) OR af.message_id = m2.id)'
    : 'm2.fil_id = af.fil_id'}
      WHERE af.actif AND af.evenement_id = ANY($3::bigint[])`
    : '';

  return `liens AS (
     SELECT r.message_id, r.cible_sorte, r.cible_cle, r.cible_id, r.cible_libelle,
            CASE r.cible_sorte WHEN 'lot' THEN 1 WHEN 'proprietaire' THEN 2 ELSE 3 END AS prio,
            'rattachement'::text AS source
       FROM gestion_rattachement r
      WHERE r.statut = 'confirme'
        AND ((r.cible_sorte = 'lot'          AND r.cible_cle = ANY($1::text[]))
          OR (r.cible_sorte = 'proprietaire' AND r.cible_cle = ANY($2::text[]))
          OR (r.cible_sorte = 'evenement'    AND r.cible_id  = ANY($3::bigint[])))
        AND r.piece_id IS NULL${carte}
   ),
   choisis AS (
     ${o.grouper
    ? `SELECT DISTINCT message_id, cible_sorte, cible_cle, cible_id, cible_libelle, prio, source FROM liens`
    : `SELECT DISTINCT ON (message_id) message_id, cible_sorte, cible_cle, cible_id, cible_libelle, prio, source
          FROM liens ORDER BY message_id, prio`}
   )`;
}

/**
 * LES CONDITIONS DE FILTRE, et les paramètres qu'elles ajoutent à partir de $4 ($1 à $3 étant les clés de cible).
 *
 * 🔴 UNE SEULE FONCTION AJOUTE UN PARAMÈTRE, ET ELLE REND SON NUMÉRO. Le premier jet empilait la valeur puis
 * calculait le numéro à partir de `params.length` — donc TOUJOURS un de trop, puisque la valeur venait d'être
 * ajoutée. La requête liait alors le tableau des interlocuteurs au `LIMIT`, et PostgreSQL refusait :
 * « argument of LIMIT must be type bigint, not type text[] » (mesuré sur le cluster jetable le 26/09/2026). Un
 * placeholder calculé à la main est un défaut qui attend son heure ; ici il ne peut plus diverger de sa valeur.
 */
function conditions(f: FiltresHistorique): { sql: string; params: unknown[] } {
  const bouts: string[] = [];
  const params: unknown[] = [];
  /** Ajoute une valeur et rend SON placeholder. Les deux ne peuvent plus se désaccorder. */
  const ajouter = (v: unknown): string => `$${params.push(v) + 3}`;

  if (f.interlocuteurs.length > 0) {
    bouts.push(`EXISTS (SELECT 1 FROM gestion_message_adresse ia
                         WHERE ia.message_id = m.id AND ia.adresse = ANY(${ajouter(f.interlocuteurs)}::text[]))`);
  }
  if (f.du !== null) bouts.push(`m.recu_le >= ${ajouter(f.du)}::date`);
  // BORNE HAUTE INCLUSE : « au 7 mars » doit contenir le 7 mars, donc on compare au lendemain à minuit.
  if (f.au !== null) bouts.push(`m.recu_le < (${ajouter(f.au)}::date + 1)`);
  if (f.pieces === 'avec') bouts.push('EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  if (f.pieces === 'sans') bouts.push('NOT EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
  if (f.texte.trim() !== '') {
    const p = ajouter(`%${f.texte.trim()}%`);
    // L'objet ET le texte : chercher « préavis » sans regarder le corps ne trouverait que les mails bien intitulés.
    bouts.push(`(coalesce(m.objet, '') ILIKE ${p} OR coalesce(m.corps_texte, '') ILIKE ${p})`);
  }
  return { sql: bouts.length === 0 ? '' : ` AND ${bouts.join(' AND ')}`, params };
}

function clesDe(c: CibleEtendue): [string[], string[], number[]] {
  return [c.lots, c.proprietaires, c.evenements];
}

// ── LES TROIS QUESTIONS ─────────────────────────────────────────────────────────────────────────────────────────

export interface PageHistorique {
  lignes: LigneHistorique[];
  /** Vrai quand d'autres mails suivent. L'écran le DIT plutôt que de laisser croire qu'on a tout vu. */
  suite: boolean;
}

/** UNE PAGE DE LA FRISE, la plus récente en haut. LECTURE SEULE. */
export async function pageHistorique(c: CibleEtendue, f: FiltresHistorique): Promise<PageHistorique> {
  const cond = conditions(f);
  const [lots, props, evs] = clesDe(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: f.grouper });

  const pTaille = 4 + cond.params.length;
  const { rows } = await query<{
    message_id: string; fil_id: string; recu_le: string; sens: string; de: string; de_nom: string | null;
    objet: string | null; extrait: string | null; dest_a: string | null; dest_cc: string | null;
    cible_sorte: string; cible_cle: string | null; cible_id: string | null; cible_libelle: string | null;
    source: string;
  }>(
    `WITH ${cte}
     SELECT m.id AS message_id, m.fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.sens, m.de_adresse AS de, m.de_nom, m.objet,
            left(coalesce(m.corps_texte, ''), ${EXTRAIT_MAX}) AS extrait,
            m.dest_a::text, m.dest_cc::text,
            ch.cible_sorte, ch.cible_cle, ch.cible_id, ch.cible_libelle, ch.source
       FROM choisis ch
       JOIN gestion_message m ON m.id = ch.message_id
      WHERE true${cond.sql}
      ORDER BY m.recu_le DESC, m.id DESC
      LIMIT $${pTaille} OFFSET $${pTaille + 1}`,
    // UNE ligne de plus que la page : sa présence, et elle seule, dit qu'il y a une suite.
    [lots, props, evs, ...cond.params, f.taille + 1, f.page * f.taille]);

  const suite = rows.length > f.taille;
  const gardees = rows.slice(0, f.taille);
  const pieces = await piecesDesMessages(gardees.map((r) => Number(r.message_id)));

  return {
    suite,
    lignes: gardees.map((r) => {
      const parCible: Cible = r.cible_sorte === 'evenement'
        ? cibleEvenement(r.cible_id === null ? 0 : Number(r.cible_id))
        : r.cible_sorte === 'lot' ? cibleLot(r.cible_cle ?? '') : cibleProprietaire(r.cible_cle ?? '');
      return {
        messageId: Number(r.message_id), filId: Number(r.fil_id), recuLe: r.recu_le,
        sens: r.sens === 'envoye' ? 'envoye' : 'recu',
        de: r.de, deNom: r.de_nom, objet: r.objet,
        extrait: (r.extrait ?? '').trim() === '' ? null : (r.extrait ?? '').trim(),
        destinataires: destinatairesLisibles(r.dest_a, r.dest_cc),
        pieces: pieces.get(Number(r.message_id)) ?? [],
        parCible,
        // Le libellé FIGÉ du lien quand il y en a un ; sinon celui que l'annuaire donne aujourd'hui.
        cibleLibelle: r.cible_libelle ?? c.libelles.get(texteCible(parCible)) ?? libelleCible(parCible, {
          lots: new Map(), proprietaires: new Map(),
        }),
        source: r.source === 'carte' ? 'carte' : 'rattachement',
      };
    }),
  };
}

/**
 * LES DESTINATAIRES d'un mail, lisibles et bornés.
 *
 * 🔴 PAR `adressesDuChamp`, ET PAR RIEN D'AUTRE. Ces colonnes `jsonb` contiennent des OBJETS `{nom, adresse}` : un
 * `String(x)` y produit « [object Object] », défaut SILENCIEUX qui a coûté 77 678 adresses perdues au lot
 * DRIVE-2-bis. Il n'existe qu'un lecteur de ces colonnes dans tout le module, et c'est celui-là.
 *
 * ⚠️ ON EN REND UN DE PLUS QUE LA BORNE : sa présence, et elle seule, permet à l'écran de dire « et N autres ».
 */
function destinatairesLisibles(destA: string | null, destCc: string | null): string[] {
  return [...adressesDuChamp(destA), ...adressesDuChamp(destCc)].slice(0, DESTINATAIRES_MAX + 1);
}

/** Les pièces de plusieurs mails, en UNE requête. Une requête par ligne de frise se verrait à l'écran. */
async function piecesDesMessages(ids: readonly number[]): Promise<Map<number, PieceHistorique[]>> {
  const m = new Map<number, PieceHistorique[]>();
  if (ids.length === 0) return m;
  const { rows } = await query<{
    message_id: string; id: string; nom_fichier: string; type_mime: string | null; taille_octets: string | null;
    cle_stockage: string | null; motif_non_stocke: string | null;
  }>(
    `SELECT message_id, id, nom_fichier, type_mime, taille_octets::text, cle_stockage, motif_non_stocke
       FROM gestion_piece WHERE message_id = ANY($1::bigint[]) ORDER BY message_id, id`, [ids]);
  for (const r of rows) {
    const cle = Number(r.message_id);
    m.set(cle, [...(m.get(cle) ?? []), {
      pieceId: Number(r.id), nomFichier: r.nom_fichier, typeMime: r.type_mime,
      tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
      disponible: r.cle_stockage !== null, motifNonStocke: r.motif_non_stocke,
    }]);
  }
  return m;
}

/**
 * LE COMPTEUR D'EN-TÊTE : combien de mails, combien de pièces, du premier au dernier.
 *
 * ⚠️ DEUX CHIFFRES, PAS UN. Celui du filtre en cours (« ce que vous regardez ») ET le total sans filtre (« ce qu'il y
 * a »). N'en donner qu'un ferait croire, filtre posé, que l'historique est plus court qu'il n'est.
 */
export async function enteteHistorique(c: CibleEtendue, f: FiltresHistorique): Promise<{
  filtre: EnteteHistorique; total: EnteteHistorique;
}> {
  const [lots, props, evs] = clesDe(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  // Le compteur ne GROUPE jamais : un mail compte pour un, même s'il concerne deux logements.
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false });

  const compter = async (cond: { sql: string; params: unknown[] }): Promise<EnteteHistorique> => {
    const { rows } = await query<{ mails: string; pieces: string; premier: string | null; dernier: string | null }>(
      `WITH ${cte}
       SELECT count(*)::text AS mails,
              coalesce(sum((SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)), 0)::text AS pieces,
              to_char(min(m.recu_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS premier,
              to_char(max(m.recu_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier
         FROM choisis ch JOIN gestion_message m ON m.id = ch.message_id
        WHERE true${cond.sql}`,
      [lots, props, evs, ...cond.params]);
    const r = rows[0];
    return {
      nbMails: Number(r.mails), nbPieces: Number(r.pieces), premierLe: r.premier, dernierLe: r.dernier,
    };
  };

  const [filtre, total] = await Promise.all([
    compter(conditions(f)),
    compter({ sql: '', params: [] }),
  ]);
  return { filtre, total };
}

/**
 * QUI PARLE DANS CES ÉCHANGES, et combien de fois.
 *
 * 🔴 LA LISTE NE DÉPEND PAS DES INTERLOCUTEURS COCHÉS. Sinon cocher une personne ferait disparaître toutes les autres
 * du filtre, et on ne pourrait plus en ajouter une seconde — le filtre se refermerait sur lui-même. Les AUTRES filtres
 * (période, pièces, recherche), eux, s'appliquent : la liste reflète ce qu'on regarde.
 */
export async function interlocuteursHistorique(
  c: CibleEtendue, f: FiltresHistorique,
): Promise<{ liste: Interlocuteur[]; tronque: boolean }> {
  const [lots, props, evs] = clesDe(c);
  const deplacements = await deplacementsDeMailsDisponibles();
  const cte = cteMessages({ avecCarte: evs.length > 0, deplacements, grouper: false });
  const cond = conditions({ ...f, interlocuteurs: [] });
  const pLimite = 4 + cond.params.length;

  const { rows } = await query<{ adresse: string; interne: boolean; n: string; nom: string | null }>(
    `WITH ${cte},
     mails AS (SELECT m.id FROM choisis ch JOIN gestion_message m ON m.id = ch.message_id WHERE true${cond.sql})
     SELECT a.adresse, a.interne, count(DISTINCT a.message_id)::text AS n,
            -- Le nom d'affichage le plus fréquent pour cette adresse. La colonne adresse_brute porte « Nom <adr> » :
            -- on en retire la partie entre chevrons, et ce qui reste est le nom (vide quand il n'y en avait pas).
            mode() WITHIN GROUP (
              ORDER BY nullif(btrim(regexp_replace(coalesce(a.adresse_brute, ''), '<[^>]*>', '', 'g')), '')
            ) AS nom
       FROM gestion_message_adresse a
       JOIN mails ON mails.id = a.message_id
      GROUP BY a.adresse, a.interne
      ORDER BY count(DISTINCT a.message_id) DESC, a.adresse
      LIMIT $${pLimite}`,
    [lots, props, evs, ...cond.params, INTERLOCUTEURS_MAX + 1]);

  const tronque = rows.length > INTERLOCUTEURS_MAX;
  return {
    tronque,
    liste: rows.slice(0, INTERLOCUTEURS_MAX).map((r) => ({
      adresse: r.adresse, nom: r.nom, nbMails: Number(r.n), interne: r.interne,
    })),
  };
}

/**
 * LES PROPOSITIONS NON CONFIRMÉES qui visent cette cible. Elles vivent dans une section À PART de la frise.
 *
 * 🔴 ELLES NE SONT PAS DANS LA FRISE, et c'est le point : la frise est ce qui EST rattaché. Mélanger des candidats
 * ferait lire comme un fait ce qui n'est qu'une hypothèse — et l'historique d'un logement ne vaut que si l'on peut
 * s'y fier. Elles portent les mêmes boutons que la file de tri, donc le même chemin d'écriture.
 */
export async function propositionsHistorique(c: CibleEtendue): Promise<{
  lignes: (LienAffiche & { objet: string | null; recuLe: string; de: string; nbPieces: number })[];
}> {
  const [lots, props, evs] = clesDe(c);
  const { rows } = await query<{
    id: string; message_id: string; piece_id: string | null; cible_sorte: string; cible_cle: string | null;
    cible_id: string | null; cible_libelle: string | null; origine: string; statut: string;
    confiance: string | null; regle: string | null; motif: string | null; adresses: string | null;
    statut_par_libelle: string | null; objet: string | null; recu_le: string; de: string; nb: string;
  }>(
    `SELECT r.id, r.message_id, r.piece_id, r.cible_sorte, r.cible_cle, r.cible_id, r.cible_libelle,
            r.origine, r.statut, r.confiance, r.regle, r.motif, r.adresses, r.statut_par_libelle,
            m.objet, to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            m.de_adresse AS de,
            (SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)::text AS nb
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'propose'
        AND ((r.cible_sorte = 'lot'          AND r.cible_cle = ANY($1::text[]))
          OR (r.cible_sorte = 'proprietaire' AND r.cible_cle = ANY($2::text[]))
          OR (r.cible_sorte = 'evenement'    AND r.cible_id  = ANY($3::bigint[])))
      ORDER BY m.recu_le DESC, r.id DESC
      LIMIT 50`, [lots, props, evs]);

  return {
    lignes: rows.map((r) => {
      const cible: Cible = {
        sorte: r.cible_sorte as Cible['sorte'], cle: r.cible_cle,
        id: r.cible_id === null ? null : Number(r.cible_id),
      };
      return {
        id: Number(r.id), messageId: Number(r.message_id),
        pieceId: r.piece_id === null ? null : Number(r.piece_id),
        cible, libelle: r.cible_libelle ?? texteCible(cible),
        origine: r.origine === 'manuel' ? 'manuel' : 'automatique',
        statut: 'propose', confiance: r.confiance, regle: r.regle, motif: r.motif,
        adresses: (r.adresses ?? '').split(' ').filter((a) => a !== ''),
        parUnHumain: r.statut_par_libelle !== null,
        objet: r.objet, recuLe: r.recu_le, de: r.de, nbPieces: Number(r.nb),
      };
    }),
  };
}
