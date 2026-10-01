import { query } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { annuaireDisponible } from './schema';
import { nomDeFamilleDeLImport, type AnnuaireContenu, type PersonneConnue } from './personnesDansLeTexte';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — L'ANNUAIRE TEL QUE LA RECHERCHE DANS UN TEXTE L'ATTEND ══════════════
 *
 * IMPUR (SQL), LECTURE SEULE. Il charge, le module pur décide.
 *
 * ⚠️ TOUT EN UNE FOIS, ET UNE SEULE FOIS PAR PASSE. Mesuré le 01/10/2026 : 313 propriétaires, 510 locataires,
 * 1 807 coordonnées, 365 lots. Quelques centaines de kilo-octets — à comparer aux 9 452 mails à examiner, qui
 * feraient autant de requêtes si l'on chargeait par mail.
 *
 * 🔴 « SES BIENS ACTIFS » (Arno) : pour un propriétaire, les lots encore EN GESTION ; pour un locataire, ceux
 * qu'il occupe ENCORE. Un bail terminé ou une gestion rendue ne doit pas remonter : le courrier d'aujourd'hui ne
 * concerne pas un logement qu'on ne gère plus. L'historique, lui, garde tout — il se lit ailleurs.
 */

/**
 * ══ 🔴🔴 LES MOTS QUI NE DÉSIGNENT JAMAIS UN CLIENT ════════════════════════════════════════════════════════════
 *
 * Le nom de la maison, sous ses deux formes. Ils sont écrits ici — pas en base — parce qu'ils ne viennent ni de
 * WIPPIMMO ni de `gestion_config` : c'est l'identité de l'agence.
 *
 * ⚠️ LES COLLABORATEURS, EUX, NE SONT PAS ÉCRITS À LA MAIN : on les LIT (voir plus bas). Une liste à la main
 * oublie celui qui est arrivé le mois dernier, et personne ne s'en aperçoit avant qu'une de ses signatures ait
 * proposé le logement d'un homonyme.
 */
export const MOTS_DE_LA_MAISON: readonly string[] = [
  'CRITERIMMO', 'Sans Vis-à-Vis', 'SANSVISAVIS', 'Service Gestion', 'ADHOC', 'MARS AVENIR',
];

/** Le nombre de lots qu'on garde par personne. Le module pur n'en montre que 5, mais le compte doit être juste. */
const LOTS_MAX = 50;

/**
 * LES NOMS DES COLLABORATEURS, LUS DANS LES MAILS QU'ILS ENVOIENT. LECTURE SEULE.
 *
 * 🔴 LA SOURCE EST CELLE QUI NE MENT PAS : qui a écrit depuis une de nos adresses est de la maison. On prend le
 * nom d'affichage (« Jean-Baptiste PONS ») et la partie locale de l'adresse (« jb.pons »), parce que les deux
 * apparaissent dans les signatures.
 *
 * ⚠️ AUCUN RISQUE D'EXCLURE UN CLIENT : on n'exclut pas la PERSONNE, on écarte ses MOTS comme clé de
 * reconnaissance par le contenu. Un collaborateur qui serait aussi propriétaire reste reconnu par son adresse
 * électronique, qui est une identité (cas ①).
 */
async function nomsDesCollaborateurs(): Promise<string[]> {
  const { rows } = await query<{ nom: string | null; adresse: string }>(
    `SELECT max(de_nom) AS nom, de_adresse AS adresse
       FROM gestion_message
      WHERE de_adresse ILIKE '%@sansvisavis.com' OR de_adresse ILIKE '%@criterimmo.fr'
      GROUP BY de_adresse`);
  return rows.flatMap((r) => [r.nom ?? '', r.adresse.split('@')[0].replace(/[._-]+/g, ' ')])
    .filter((x) => x.trim() !== '');
}

/** TOUT CE QU'IL FAUT POUR RECONNAÎTRE UNE PERSONNE DANS UN TEXTE. LECTURE SEULE. */
export async function chargerAnnuaireContenu(): Promise<AnnuaireContenu> {
  if (!(await annuaireDisponible())) return { personnes: [], motsExclus: [] };
  const vivante = await conditionCoordonneeVivante('c');

  // ── ① LES PERSONNES ET LEURS BIENS ACTIFS ────────────────────────────────────────────────────────────────────
  const { rows: proprios } = await query<{
    id: string; nom: string; famille: string | null; lots: string[] | null;
  }>(
    // ⚠️ `nom` N'EST PAS TOUJOURS LE SEUL NOM DE FAMILLE : mesuré le 01/10/2026, certaines fiches y portent tout
    //    (« MATZNEFF Charlotte et DAGUERRE Jean-Philippe », prénom vide). On le relit donc à la casse, comme
    //    pour un locataire — et « Charlotte » cesse de désigner quelqu'un à elle seule.
    `SELECT p.id::text, p.nom_complet AS nom, p.nom AS famille,
            (SELECT array_agg(lo.wippimmo_id ORDER BY lo.commune, lo.adresse, lo.wippimmo_id)
               FROM gestion_annuaire_lot lo
              WHERE lo.proprietaire_id = p.id
                AND (lo.gestion_fin IS NULL OR lo.gestion_fin >= current_date)) AS lots
       FROM gestion_annuaire_proprietaire p
      WHERE p.absent_le IS NULL`);

  const { rows: locataires } = await query<{
    id: string; nom: string; famille: string | null; lots: string[] | null;
  }>(
    // ⚠️ CHEZ LES LOCATAIRES, `nom` PORTE TOUT (« CHAKROUN Zahra ») : le nom de famille se lit à la casse, en TS.
    `SELECT l.id::text, l.nom, NULL::text AS famille,
            (SELECT array_agg(DISTINCT lo.wippimmo_id)
               FROM gestion_annuaire_occupation o
               JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
              WHERE o.locataire_id = l.id AND o.sortie IS NULL
                AND (lo.gestion_fin IS NULL OR lo.gestion_fin >= current_date)) AS lots
       FROM gestion_annuaire_locataire l
      WHERE l.absent_le IS NULL`);

  // ── ② LEURS COORDONNÉES, EN UNE REQUÊTE ──────────────────────────────────────────────────────────────────────
  const { rows: contacts } = await query<{ sujet: string; sujet_id: string; sorte: string; valeur: string }>(
    `SELECT c.sujet, c.sujet_id::text, c.sorte, c.valeur
       FROM gestion_annuaire_contact c
      WHERE c.absent_le IS NULL${vivante} AND c.sorte IN ('email', 'telephone')`);
  const parPersonne = new Map<string, { emails: string[]; telephones: string[] }>();
  for (const c of contacts) {
    const k = `${c.sujet}|${c.sujet_id}`;
    const e = parPersonne.get(k) ?? { emails: [], telephones: [] };
    if (c.sorte === 'email') e.emails.push(c.valeur); else e.telephones.push(c.valeur);
    parPersonne.set(k, e);
  }

  const faire = (role: 'proprietaire' | 'locataire') =>
    (r: { id: string; nom: string; famille: string | null; lots: string[] | null }): PersonneConnue => {
      const cle = `${role}|${r.id}`;
      const c = parPersonne.get(cle) ?? { emails: [], telephones: [] };
      const nom = r.nom ?? '';
      return {
        cle, role, nom,
        /**
         * 🔴🔴 LE NOM DE FAMILLE, parce que LUI SEUL peut désigner quelqu'un d'un seul mot. Chez un propriétaire
         * il a sa colonne ; chez un locataire, l'import l'écrit EN CAPITALES en tête de la ligne.
         */
        nomFamille: nomDeFamilleDeLImport((r.famille ?? '').trim() !== '' ? (r.famille ?? '') : nom),
        emails: c.emails, telephones: c.telephones,
        lots: (r.lots ?? []).filter((x) => x !== null && x !== '').slice(0, LOTS_MAX),
      };
    };

  /**
   * 🔴🔴 ET LES COMMUNES QU'ON GÈRE, écartées elles aussi. Mesuré le 01/10/2026 : une locataire s'appelle « SAS
   * NANTERRE 92 », et « Nanterre » traverse les mails (« RCS Nanterre 887 521 862 », « NANTERRE CONNEC'T »)
   * sans jamais désigner cette société. Un nom de ville n'est pas un nom de personne — et la liste se tient
   * toute seule, puisqu'elle vient des biens en gestion.
   */
  const { rows: communes } = await query<{ commune: string }>(
    'SELECT DISTINCT commune FROM gestion_annuaire_lot WHERE commune IS NOT NULL');

  return {
    personnes: [...proprios.map(faire('proprietaire')), ...locataires.map(faire('locataire'))]
      .filter((p) => p.nom.trim() !== ''),
    motsExclus: [
      ...MOTS_DE_LA_MAISON, ...(await nomsDesCollaborateurs()), ...communes.map((c) => c.commune),
    ],
  };
}
