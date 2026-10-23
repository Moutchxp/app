import { query, withTransaction, type RequeteTx } from '../db/client';
import { sqlBornesDeLEvenement, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';
import { instantDeCloture, ramenerLesOuvertures } from './mongaEtapeRepo';

/**
 * ══ 🔴🔴 REPRISE — LES ÉVÉNEMENTS À L'ÉTAPE « CLÔTURE » DONT LA PÉRIODE N'EST PAS FERMÉE (Arno, 23/10/2026) ═══════════════
 *
 * « Les événements qui sont à l'étape “Clôture” sans période fermée (en dev, en recette ET en prod) doivent être clos
 * proprement (période fermée à la date de passage à “Clôture”, sinon à leur dernière modification ; auteur = celui du passage
 * à “Clôture” s'il est connu). »
 *
 * 🔴 QUI : un événement OUVERT selon la frise dont l'étape courante est une Clôture — la dernière carte par date (la miniature
 * du bloc « Événements ») OU la dernière posée (l'ordre de la frise). Une Clôture écartée ne compte pas.
 *
 * 🔴 COMMENT : AUCUNE CARTE AJOUTÉE, AUCUNE SUPPRIMÉE. La carte Clôture déjà posée est simplement REDATÉE : sa date devient celle
 * du passage à « Clôture » (`cree_le` de la carte ; pour une Clôture Monga confirmée, `confirme_le`), sinon sa dernière
 * modification (`maj_le`). 🔴 JAMAIS DANS LE FUTUR, ET JAMAIS APRÈS CETTE DATE (Arno, 23/10/2026) : si une ouverture est datée
 * à cette date ou après (GES-2026-000010 : ouverture déplacée au 02/11/2026), c'est l'OUVERTURE qui est ramenée une seconde
 * avant la clôture (`ramenerLesOuvertures`, la date d'origine gardée au journal), et la clôture garde la date du passage.
 * L'auteur de la clôture reste celui de la carte. `maj_le` / `maj_par_libelle` disent que la reprise est passée.
 *
 * ⚠️ UNE CLÔTURE MONGA « À CONFIRMER » N'EST PAS UNE CLÔTURE DÉCIDÉE : elle n'est confirmée (puis redatée) qu'avec
 * `avecAConfirmer`, sinon elle est seulement LISTÉE. Le bloc « Événements » l'écarte déjà par sécurité.
 *
 * 🔴 REJOUABLE : un événement réparé est clos ; il ne sort plus de la sélection. 🔴 TOUT OU RIEN : la passe réelle est UNE
 * transaction, et chaque événement est relu après sa réparation — s'il restait ouvert, tout est annulé.
 */
export const AUTEUR_REPRISE = 'reprise reparer-clotures-ouvertes';

export interface ClotureOuverte {
  evenementId: number;
  reference: string | null;
  objet: string | null;
  bien: string | null;
  carteId: number;
  source: 'monga' | 'manuelle';
  certitude: string;
  /** La date de la carte aujourd'hui (`survenu_le`). */
  dateActuelle: string;
  /** La date de passage à « Clôture » retenue, et d'où elle vient. */
  dateRetenue: string;
  origine: 'passage' | 'confirmation' | 'modification';
  auteur: string | null;
  /** La date que la carte prendra : la date retenue, jamais plus tard. */
  dateFinale: string;
  /** La même, en horodatage complet (rejoué tel quel par la passe réelle). */
  instant: string;
  /** Les ouvertures datées à la clôture ou après (souvent dans le futur), ramenées une seconde avant elle. */
  ouverturesRamenees: string[];
}

const HORS_CARTE = "'facture','rappel_devis','contact_injoignable','commentaire','note'";
const CARTES_DE_E = `x.statut = 'vif' AND x.type NOT IN (${HORS_CARTE})
       AND (x.evenement_id = e.id OR x.reference IN (SELECT reference FROM gestion_monga_lien
                                                      WHERE evenement_id = e.id AND retire_le IS NULL))`;

/** La date retenue, en SQL, sur l'alias `c` de la carte Clôture. Aucun accent dans le SQL émis. */
const SQL_DATE_RETENUE = `coalesce(CASE WHEN c.certitude = 'confirmee' THEN c.confirme_le END, c.cree_le, c.maj_le)`;

export async function listerCloturesOuvertes(q: RequeteTx = query): Promise<ClotureOuverte[]> {
  const { rows } = await q<{
    evenement_id: string; reference: string | null; objet: string | null; bien: string | null; carte_id: string;
    source: 'monga' | 'manuelle'; certitude: string; date_actuelle: string; date_retenue: string; origine: ClotureOuverte['origine'];
    auteur: string | null; date_finale: string; instant: string; ouvertures: string[] | null;
  }>(
    `WITH cand AS (
       SELECT e.id,
              (SELECT x.id FROM gestion_monga_etape x WHERE ${CARTES_DE_E} ORDER BY x.survenu_le DESC, x.id DESC LIMIT 1) AS par_date,
              (SELECT x.id FROM gestion_monga_etape x WHERE ${CARTES_DE_E} ORDER BY x.rang_pose DESC NULLS LAST, x.id DESC LIMIT 1) AS par_pose
         FROM gestion_evenement e
        WHERE ${sqlEvenementOuvertParLaFrise('e')})
     SELECT DISTINCT ON (e.id)
            e.id::text AS evenement_id, e.reference, e.objet,
            coalesce((SELECT concat_ws(' - ', 'lot ' || p.cle, nullif(btrim(concat_ws(' ', lo.adresse, lo.commune)), ''))
                        FROM gestion_evenement_partie p
                        LEFT JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = p.cle
                       WHERE p.evenement_id = e.id AND p.sorte = 'lot' AND p.retire_le IS NULL
                       ORDER BY p.cle LIMIT 1),
                     nullif(btrim(e.adresse_libre), '')) AS bien,
            c.id::text AS carte_id, c.source, c.certitude,
            to_char(c.survenu_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS date_actuelle,
            to_char(${SQL_DATE_RETENUE} AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS date_retenue,
            CASE WHEN c.certitude = 'confirmee' AND c.confirme_le IS NOT NULL THEN 'confirmation'
                 WHEN c.cree_le IS NOT NULL THEN 'passage' ELSE 'modification' END AS origine,
            CASE WHEN c.certitude = 'confirmee' THEN coalesce(c.confirme_par_libelle, c.cree_par_libelle)
                 ELSE coalesce(c.cree_par_libelle, c.auteur) END AS auteur,
            to_char(${SQL_DATE_RETENUE} AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS date_finale,
            (${SQL_DATE_RETENUE})::text AS instant,
            (SELECT array_agg(to_char(b.quand AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') ORDER BY b.quand)
               FROM (${sqlBornesDeLEvenement('e')}) b
              WHERE b.sens = 'ouvre' AND b.quand >= ${SQL_DATE_RETENUE} AND b.carte <> c.id) AS ouvertures
       FROM cand
       JOIN gestion_evenement e ON e.id = cand.id
       JOIN gestion_monga_etape c ON c.id IN (cand.par_date, cand.par_pose)
      WHERE c.type = 'cloture' AND c.statut = 'vif' AND c.certitude <> 'ecartee'
      ORDER BY e.id, c.survenu_le DESC, c.id DESC`);
  return rows.map((r) => ({
    evenementId: Number(r.evenement_id), reference: r.reference, objet: r.objet, bien: r.bien, carteId: Number(r.carte_id),
    source: r.source, certitude: r.certitude, dateActuelle: r.date_actuelle, dateRetenue: r.date_retenue, origine: r.origine,
    auteur: r.auteur, dateFinale: r.date_finale, instant: r.instant, ouverturesRamenees: r.ouvertures ?? [],
  }));
}

export interface PasseReprise {
  reel: boolean;
  avecAConfirmer: boolean;
  trouvees: ClotureOuverte[];
  /** Les identifiants d'événements réellement clos par la passe (vide à blanc). */
  reparees: number[];
}

/** Une Clôture « à confirmer » n'est traitée qu'avec `avecAConfirmer`. PUR. */
export function aTraiter(c: ClotureOuverte, avecAConfirmer: boolean): boolean {
  return c.certitude !== 'a_confirmer' || avecAConfirmer;
}

export async function passerReprise(o: { reel: boolean; avecAConfirmer: boolean }): Promise<PasseReprise> {
  if (!o.reel) {
    return { reel: false, avecAConfirmer: o.avecAConfirmer, trouvees: await listerCloturesOuvertes(), reparees: [] };
  }
  return withTransaction(async (q) => {
    const trouvees = await listerCloturesOuvertes(q);
    const reparees: number[] = [];
    for (const c of trouvees.filter((x) => aTraiter(x, o.avecAConfirmer))) {
      await q(`SELECT id FROM gestion_evenement WHERE id = $1 FOR UPDATE`, [c.evenementId]);
      /* La clôture prend la date du passage, plafonnée à elle-même : jamais plus tard, jamais dans le futur. */
      const instant = await instantDeCloture(q, [c.evenementId], c.carteId, c.instant, c.instant);
      await ramenerLesOuvertures(q, c.evenementId, instant, c.carteId, AUTEUR_REPRISE);
      await q(
        `UPDATE gestion_monga_etape c
            SET certitude = CASE WHEN c.certitude = 'a_confirmer' THEN 'confirmee' ELSE c.certitude END,
                confirme_le = CASE WHEN c.certitude = 'a_confirmer' THEN now() ELSE c.confirme_le END,
                confirme_par_libelle = CASE WHEN c.certitude = 'a_confirmer' THEN $3 ELSE c.confirme_par_libelle END,
                survenu_le = $2::timestamptz,
                maj_le = now(), maj_par_libelle = $3
          WHERE c.id = $1 AND c.type = 'cloture' AND c.statut = 'vif'`,
        [c.carteId, instant, AUTEUR_REPRISE]);
      const { rows } = await q<{ ouvert: boolean }>(
        `SELECT ${sqlEvenementOuvertParLaFrise('e')} AS ouvert FROM gestion_evenement e WHERE e.id = $1`, [c.evenementId]);
      if (rows[0]?.ouvert !== false) throw new Error(`L’événement ${c.evenementId} reste ouvert après la reprise : tout est annulé.`);
      reparees.push(c.evenementId);
    }
    return { reel: true, avecAConfirmer: o.avecAConfirmer, trouvees, reparees };
  });
}
