import { query } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { decortiquerNumero, formaterTelephone } from './telephoneAffichage';
import { annuaireDisponible } from './schema';
import { analyserTerme, type TermeRecherche } from './annuaireRecherche';
import { adresseComplete, type Coordonnee, type PersonneFiche } from './ficheBien';
import { libelleContact } from './annuaire';
import { libelleSourceContactDisponible } from './schema';
import { classerResultats, raisonsTriees, type RaisonCorrespondance } from './rechercheBien';

/**
 * MODULE « GESTION » — LOT BIEN-RATTACHE : LA RECHERCHE LIBRE D'UN BIEN. IMPUR (SQL), LECTURE SEULE.
 *
 * ⚠️ PAS DE `import 'server-only'` : les commandes de ligne importent les dépôts du module, et `server-only` lève
 * hors du bundle react-server. La frontière est tenue par les gardes (`clientBoundary.guard.test.ts`).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES RÉSULTATS SONT TOUJOURS DES BIENS — jamais une personne. Chercher « MARTY » rend SES BIENS ; chercher son
 * téléphone rend les mêmes. C'est la règle du lot AFFECTATION-PAR-BIEN, et cette recherche ne peut pas y déroger :
 * elle ne sélectionne que dans `gestion_annuaire_lot`.
 *
 * 🔴 TOUS LES MOTS DE LA REQUÊTE, DANS N'IMPORTE QUEL ORDRE. Le prédicat est
 * `NOT EXISTS (SELECT 1 FROM unnest($mots) m WHERE foin NOT LIKE '%' || m || '%')` : il dit « aucun mot ne
 * manque », ce qui est exactement la demande. Un `LIKE '%toute la requête%'` — ce que faisait la recherche
 * d'avant — ratait « 4 victor hugo » sur « 4-6-8 rue Victor Hugo », parce que les mots n'y sont pas collés.
 *
 * ⚠️ POURQUOI PAS UN `AND` DE LIKE CONSTRUIT EN JAVASCRIPT : le nombre de mots varie, et une requête dont la FORME
 * change à chaque frappe ne peut pas être préparée par PostgreSQL — ni relue par qui la débogue. `unnest` d'un
 * paramètre `text[]` garde UNE seule forme de requête, quel que soit le nombre de mots.
 *
 * 🔴 LES LOCATAIRES PASSÉS COMPTENT. Demande d'Arno : « un nom (propriétaire ou locataire, actuel ou passé) ». Un
 * litige de dépôt de garantie se traite AVEC le locataire sorti — l'exclure rendrait la recherche inutile
 * précisément quand on en a le plus besoin. La raison affichée dit alors « locataire passé DUPONT ».
 *
 * ⚠️ AUCUN INDEX N'EST AJOUTÉ. Mesuré le 28/09/2026 : 365 lots, 510 locataires, 1 793 contacts — la table entière
 * tient dans un souffle, et le dépôt interdit d'ajouter un index sans avoir vérifié par `EXPLAIN` que le
 * planificateur le PREND. Sur 365 lignes, il ne le prendrait pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Combien de biens au plus. Au-delà, on le DIT : une liste tronquée en silence fait chercher ce qu'on a caché. */
export const PLAFOND_BIENS = 40;

export interface BienTrouve {
  /** La clé WIPPIMMO du lot : c'est elle, la cible de rattachement. */
  cle: string;
  libelle: string;
  adresse: string;
  /**
   * 🔴 LOT MODALE-RATTACHER-PROPRE — LA VOIE ET LA COMMUNE, SÉPARÉES. `adresse` est l'adresse COMPLÈTE (avec le
   * code postal), telle que les cartes l'affichent depuis toujours. Le TITRE d'un bien, lui, s'écrit
   * « voie, COMMUNE — qualité » (demande d'Arno, sans code postal) : il lui faut donc les deux morceaux, et
   * les redécouper d'une chaîne composée serait une analyse syntaxique de ce qu'on vient d'assembler.
   */
  adresseVoie: string | null;
  commune: string | null;
  nature: string | null;
  typeBien: string | null;
  /** Le propriétaire et le ou les locataires À LA DATE DU MAIL, comme dans la fiche de proposition. */
  parties: PersonneFiche[];
  raisons: RaisonCorrespondance[];
}

export interface ResultatsBiens {
  lignes: BienTrouve[];
  tronque: boolean;
  /** `false` = annuaire absent : l'écran le DIT au lieu de rendre une liste vide qui se lirait « rien trouvé ». */
  disponible: boolean;
}

interface LigneDB {
  cle: string; adresse: string | null; code_postal: string | null; commune: string | null;
  nature: string | null; type_bien: string | null;
  lot_id: string; proprietaire_id: string | null; proprietaire_cle: string | null; proprietaire_nom: string | null;
  par_adresse: boolean; par_lot: boolean; par_proprietaire: boolean;
  par_contact_proprietaire: boolean;
  /** Les locataires qui ont fait répondre ce bien : nom, et si leur bail était clos à la date du mail. */
  locataires_trouves: string[] | null;
  locataires_passes: string[] | null;
  locataires_contact: string[] | null;
}

/**
 * 🔴 LES BIENS QUI RÉPONDENT À LA REQUÊTE, avec la RAISON de chacun. LECTURE SEULE.
 *
 * `dateMail` décide qui est « locataire » et qui est « locataire passé » : c'est la date du courrier qu'on classe,
 * jamais aujourd'hui. Un mail d'août doit trouver l'occupant d'août.
 */
export async function chercherBiens(
  brut: string, o: { dateMail?: string | null; limite?: number } = {},
): Promise<ResultatsBiens> {
  if (!(await annuaireDisponible())) return { lignes: [], tronque: false, disponible: false };

  const t: TermeRecherche = analyserTerme(brut);
  if (t.vide) return { lignes: [], tronque: false, disponible: true };

  const date = (o.dateMail ?? '').slice(0, 10);
  const dateUtile = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const limite = Math.min(Math.max(1, o.limite ?? PLAFOND_BIENS), 200);
  /**
   * 🔴 LOT FICHES-ANNUAIRE (étape C) — LA CONDITION QUI ÉCARTE UNE COORDONNÉE RETIRÉE À LA MAIN.
   * Chercher un bien par un numéro qu'Arno vient d'enlever d'une fiche le trouverait encore : le geste
   * n'aurait servi qu'à moitié. Vide tant que la migration 278 n'est pas là (la sonde voyage avec la colonne).
   */
  const vivante = await conditionCoordonneeVivante();

  const { rows } = await query<LigneDB>(
    `WITH mots AS (SELECT unnest($1::text[]) AS m),
     /* ── LES CONTACTS QUI RÉPONDENT : téléphone (complet ou fin de numéro) ou e-mail ───────────────────────── */
     contacts_trouves AS (
       SELECT sujet, sujet_id FROM gestion_annuaire_contact
        WHERE absent_le IS NULL${vivante}
          AND (($2::text IS NOT NULL AND valeur = $2)
            OR ($3::text IS NOT NULL AND valeur LIKE $3)
            OR ($4::text IS NOT NULL AND valeur = $4))
     ),
     /* ── LES OCCUPATIONS QUI RÉPONDENT PAR LE NOM OU PAR UN CONTACT DU LOCATAIRE ───────────────────────────── */
     occ AS (
       SELECT o.lot_id, l.nom, l.id AS locataire_id, o.sortie,
              /* 🔴 « PASSÉ » SE JUGE À LA DATE DU MAIL, jamais à aujourd'hui : un mail d'août cherche l'occupant
                 d'août. Sans date utilisable, on retombe sur la date du jour — et on le dit dans le libellé. */
              (o.sortie IS NOT NULL AND o.sortie < coalesce($5::date, current_date)) AS passe,
              (NOT EXISTS (SELECT 1 FROM mots WHERE l.nom_normalise NOT LIKE '%' || m || '%')) AS par_nom,
              (l.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'locataire')) AS par_contact
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
        WHERE o.lot_id IS NOT NULL
     )
     SELECT lo.id::text AS lot_id, lo.wippimmo_id AS cle, lo.adresse, lo.code_postal, lo.commune,
            lo.nature, lo.type_bien,
            pr.id::text AS proprietaire_id, pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom,
            /* ── LES RAISONS, calculées en base pour n'en rapporter qu'une ligne par bien ──────────────────── */
            (NOT EXISTS (SELECT 1 FROM mots
                          WHERE (lo.adresse_normalisee || ' ' || coalesce(lo.code_postal, '')) NOT LIKE '%' || m || '%'))
              AS par_adresse,
            ($6::text IS NOT NULL AND lo.wippimmo_id = $6) AS par_lot,
            (pr.id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM mots WHERE pr.nom_normalise NOT LIKE '%' || m || '%')) AS par_proprietaire,
            (pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire'))
              AS par_contact_proprietaire,
            (SELECT array_agg(DISTINCT x.nom) FROM occ x
              WHERE x.lot_id = lo.id AND x.par_nom AND NOT x.passe) AS locataires_trouves,
            (SELECT array_agg(DISTINCT x.nom) FROM occ x
              WHERE x.lot_id = lo.id AND x.par_nom AND x.passe) AS locataires_passes,
            (SELECT array_agg(DISTINCT x.nom) FROM occ x
              WHERE x.lot_id = lo.id AND x.par_contact) AS locataires_contact
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      /* ⚠️ LE FILTRE EST LE MÊME QUE LES COLONNES CI-DESSUS : un bien n'entre que s'il a AU MOINS une raison.
         Le répéter ici plutôt que d'envelopper la requête garde UNE seule lecture de la table. */
      WHERE (NOT EXISTS (SELECT 1 FROM mots
                          WHERE (lo.adresse_normalisee || ' ' || coalesce(lo.code_postal, '')) NOT LIKE '%' || m || '%'))
         OR ($6::text IS NOT NULL AND lo.wippimmo_id = $6)
         OR (pr.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mots WHERE pr.nom_normalise NOT LIKE '%' || m || '%'))
         OR pr.id IN (SELECT sujet_id FROM contacts_trouves WHERE sujet = 'proprietaire')
         OR EXISTS (SELECT 1 FROM occ x WHERE x.lot_id = lo.id AND (x.par_nom OR x.par_contact))
      LIMIT $7`,
    [t.mots, t.telephone, t.chiffres === null ? null : `%${t.chiffres}`, t.email, dateUtile, t.numeroLot,
      limite + 1]);

  const tronque = rows.length > limite;
  const gardees = tronque ? rows.slice(0, limite) : rows;
  if (gardees.length === 0) return { lignes: [], tronque: false, disponible: true };

  // ── LES PARTIES DE CHAQUE BIEN À LA DATE DU MAIL, et leurs contacts : deux requêtes, pas deux par ligne ──────
  const parties = await partiesDesBiens(gardees, dateUtile);

  const lignes: BienTrouve[] = gardees.map((r) => {
    const raisons: RaisonCorrespondance[] = [];
    if (r.par_adresse) raisons.push({ sorte: 'adresse', detail: '' });
    if (r.par_lot) raisons.push({ sorte: 'lot', detail: '' });
    if (r.par_proprietaire) raisons.push({ sorte: 'proprietaire', detail: r.proprietaire_nom ?? '' });
    if (r.par_contact_proprietaire) {
      raisons.push({
        sorte: t.email !== null ? 'email_proprietaire' : 'telephone_proprietaire',
        detail: r.proprietaire_nom ?? '',
      });
    }
    for (const nom of r.locataires_trouves ?? []) raisons.push({ sorte: 'locataire', detail: nom });
    for (const nom of r.locataires_passes ?? []) raisons.push({ sorte: 'locataire_passe', detail: nom });
    for (const nom of r.locataires_contact ?? []) {
      raisons.push({ sorte: t.email !== null ? 'email_locataire' : 'telephone_locataire', detail: nom });
    }

    const adresse = adresseComplete({ adresse: r.adresse, codePostal: r.code_postal, commune: r.commune });
    return {
      cle: r.cle,
      adresse,
      libelle: adresse === '' ? `Lot ${r.cle}` : `${adresse} — lot ${r.cle}`,
      adresseVoie: r.adresse, commune: r.commune,
      nature: r.nature, typeBien: r.type_bien,
      parties: parties.get(r.cle) ?? [],
      raisons: raisonsTriees(raisons),
    };
  });

  return { lignes: classerResultats(lignes), tronque, disponible: true };
}

/**
 * LES PARTIES (propriétaire + locataires à la date) DES BIENS TROUVÉS, avec leurs contacts. LECTURE SEULE.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUTE LA LISTE, jamais deux par ligne : quarante résultats feraient quatre-vingts allers
 * et retours, et cela se verrait à l'écran.
 */
async function partiesDesBiens(
  lots: readonly LigneDB[], dateMail: string | null,
): Promise<Map<string, PersonneFiche[]>> {
  const out = new Map<string, PersonneFiche[]>();
  if (lots.length === 0) return out;

  const { rows: occ } = await query<{
    lot_id: string; locataire_id: string; cle: string; nom: string; depuis: string | null; jusqua: string | null;
  }>(
    `SELECT o.lot_id::text, l.id::text AS locataire_id, l.wippimmo_id AS cle, l.nom,
            o.entree::text AS depuis, o.sortie::text AS jusqua
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.lot_id = ANY($1::bigint[])
        AND (o.entree IS NULL OR o.entree <= coalesce($2::date, current_date))
        AND (o.sortie IS NULL OR o.sortie >= coalesce($2::date, current_date))
      ORDER BY o.entree DESC NULLS LAST, o.id DESC`,
    [lots.map((l) => Number(l.lot_id)), dateMail]);

  const avecLibelle = await libelleSourceContactDisponible();
  const idsProprios = [...new Set(lots.map((l) => l.proprietaire_id).filter((x): x is string => x !== null))];
  const idsLocataires = [...new Set(occ.map((o) => o.locataire_id))];
  const contacts = new Map<string, { emails: Coordonnee[]; telephones: Coordonnee[] }>();

  if (idsProprios.length > 0 || idsLocataires.length > 0) {
    const { rows: cts } = await query<{
      sujet: string; sujet_id: string; sorte: string; valeur: string; valeur_brute: string;
      rang: number; libelle_source: string | null;
    }>(
      `SELECT sujet, sujet_id::text AS sujet_id, sorte, valeur, valeur_brute, rang,
              ${avecLibelle ? 'libelle_source' : 'NULL::text AS libelle_source'}
         FROM gestion_annuaire_contact
        WHERE absent_le IS NULL${await conditionCoordonneeVivante()}
          AND ((sujet = 'proprietaire' AND sujet_id = ANY($1::bigint[]))
            OR (sujet = 'locataire'    AND sujet_id = ANY($2::bigint[])))
        ORDER BY sorte, rang, id`,
      [idsProprios.map(Number), idsLocataires.map(Number)]);
    for (const c of cts) {
      const k = `${c.sujet}|${c.sujet_id}`;
      const e = contacts.get(k) ?? { emails: [], telephones: [] };
      const coord: Coordonnee = {
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
      if (c.sorte === 'email') e.emails.push(coord); else if (c.sorte === 'telephone') e.telephones.push(coord);
      contacts.set(k, e);
    }
  }
  const de = (sujet: string, id: string | null) =>
    (id === null ? undefined : contacts.get(`${sujet}|${id}`)) ?? { emails: [], telephones: [] };

  for (const l of lots) {
    const liste: PersonneFiche[] = [];
    if (l.proprietaire_cle !== null) {
      const c = de('proprietaire', l.proprietaire_id);
      liste.push({
        role: 'proprietaire', cle: l.proprietaire_cle, nom: l.proprietaire_nom ?? '(sans nom)',
        emails: c.emails, telephones: c.telephones,
      });
    }
    for (const o of occ.filter((x) => x.lot_id === l.lot_id)) {
      const c = de('locataire', o.locataire_id);
      liste.push({
        role: 'locataire', cle: o.cle, nom: o.nom, depuis: o.depuis, jusqua: o.jusqua,
        emails: c.emails, telephones: c.telephones,
      });
    }
    out.set(l.cle, liste);
  }
  return out;
}
