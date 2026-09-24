/**
 * MODULE « GESTION » — LOT 4d : CHERCHER UN ÉVÉNEMENT. IMPUR (base), en LECTURE SEULE.
 *
 * La même recherche sert aux TROIS gestes qui doivent désigner une carte : affecter un échange depuis la file,
 * déplacer un échange, déplacer un mail. Une seule implémentation, donc un seul comportement — si la recherche trouve
 * une carte dans un cas, elle la trouve dans les trois.
 *
 * CE SUR QUOI ELLE CHERCHE : le titre (quoi), qui demande (nom et adresse), l'adresse libre, la référence GES-…, ET
 * les noms et adresses des expéditeurs des messages rattachés. Ce dernier point est le plus utile à l'usage : on se
 * souvient du nom du locataire ou de l'artisan bien avant de se souvenir du titre qu'on a donné à la carte.
 *
 * INSENSIBLE AUX ACCENTS ET À LA CASSE, sans dépendre d'une extension PostgreSQL : `translate()` sur l'ensemble FERMÉ
 * des accents français. `unaccent` existe sur la base d'Arno, mais une recherche qui cesse de fonctionner le jour où
 * l'on change de serveur est une dette qu'on se pose à soi-même.
 *
 * TOUS LES MOTS doivent être trouvés (ET, pas OU), chacun n'importe où : « fuite marceau » trouve la carte « Fuite
 * salle de bain » dont l'adresse est « 28 avenue Marceau ». C'est le comportement qu'on attend d'un champ de recherche.
 */
import { query } from '../db/client';

export interface EvenementTrouve {
  id: number;
  reference: string;
  objet: string;
  demandeur: string | null;
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  nbFils: number;
}

/** Ce qu'on rapporte au plus. Au-delà, on ne fait pas défiler : on affine sa recherche. */
export const MAX_RESULTATS = 30;
/** Bornes de sûreté sur la saisie : un mot d'une lettre ne filtre rien, et 6 mots suffisent à désigner une carte. */
const MAX_MOTS = 6;
const MAX_LONGUEUR_MOT = 40;

const ACCENTS = 'àâäáãåÀÂÄÁÃÅéèêëÉÈÊËíìîïÍÌÎÏóòôöõÓÒÔÖÕúùûüÚÙÛÜçÇñÑýÿÝ';
const SANS____ = 'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnNyyY';

/**
 * La normalisation, en SQL. `translate` + `lower` : aucune extension, le même résultat partout.
 *
 * LOT 5c — EXPORTÉE (et rien d'autre n'a changé). La recherche dans le courrier doit normaliser EXACTEMENT comme
 * celle des cartes, sans quoi « Marceau » se trouverait ici et pas là. Une seule définition, donc une seule vérité.
 *
 * ⚠️ Ces deux fonctions sont IMMUTABLE pour PostgreSQL — c'est ce qui rend l'expression INDEXABLE (`unaccent`, lui, ne
 * l'est pas sans enrobage). Ne pas les remplacer par `unaccent()` sans refaire l'index du lot 5c.
 */
export const normSql = (expr: string) => `translate(lower(coalesce(${expr}, '')), '${ACCENTS}', '${SANS____}')`;
const norm = normSql;

/**
 * La MÊME normalisation, en TypeScript, pour les mots saisis. Les deux doivent rester d'accord : c'est vérifié par un
 * test qui les compare sur les mêmes chaînes, exécuté contre un vrai PostgreSQL.
 */
export function normaliser(s: string): string {
  let out = '';
  for (const c of s.toLowerCase()) {
    const i = ACCENTS.indexOf(c);
    out += i === -1 ? c : SANS____[i];
  }
  return out;
}

/** Découpe une saisie en mots normalisés, bornés. Vide si la saisie ne contient rien d'exploitable. PUR. */
export function motsDe(saisie: string): string[] {
  return normaliser(saisie)
    .split(/[^a-z0-9@._+-]+/)
    .filter((m) => m.length > 0)
    .map((m) => m.slice(0, MAX_LONGUEUR_MOT))
    .slice(0, MAX_MOTS);
}

/**
 * Le texte d'un événement, tout entier, normalisé : ses propres champs ET les expéditeurs de ses messages rattachés.
 * Construit à la volée — il n'y a pas de colonne de recherche à maintenir, donc rien qui puisse devenir périmé.
 */
const TEXTE_CHERCHABLE = `
  ${norm('e.reference')} || ' ' || ${norm('e.objet')} || ' ' || ${norm('e.demandeur_nom')} || ' ' ||
  ${norm('e.demandeur_email')} || ' ' || ${norm('e.adresse_libre')} || ' ' ||
  coalesce((SELECT string_agg(DISTINCT ${norm('m.de_nom')} || ' ' || ${norm('m.de_adresse')}, ' ')
              FROM gestion_message m
              JOIN gestion_affectation a2 ON a2.fil_id = m.fil_id AND a2.actif
             WHERE a2.evenement_id = e.id AND m.exclu_le IS NULL), '')`;

/**
 * Cherche des événements. Saisie vide → les plus récemment ouverts, ce qui fait de ce champ une LISTE par défaut :
 * on ne force personne à taper pour voir ce qui existe.
 *
 * Les événements OUVERTS passent devant les traités — rattacher à une carte close est rare, et reste possible en la
 * cherchant par son nom.
 */
export async function chercherEvenements(saisie: string, limite = MAX_RESULTATS): Promise<EvenementTrouve[]> {
  const mots = motsDe(saisie ?? '');
  // TOUS les mots doivent être présents : chacun devient une condition, toutes liées par ET.
  const conditions = mots.map((_, i) => `(${TEXTE_CHERCHABLE}) LIKE '%' || $${i + 2} || '%'`);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query<{
    id: number; reference: string; objet: string; demandeur: string | null;
    adresse_libre: string | null; etat: string; nb_fils: number;
  }>(
    `SELECT e.id::int AS id, e.reference, e.objet,
            coalesce(nullif(btrim(e.demandeur_nom), ''), e.demandeur_email) AS demandeur,
            e.adresse_libre, e.etat,
            (SELECT count(*) FROM gestion_affectation a WHERE a.evenement_id = e.id AND a.actif)::int AS nb_fils
       FROM gestion_evenement e
       ${where}
      ORDER BY (e.traite_le IS NOT NULL) ASC, e.ouvert_le DESC, e.id DESC
      LIMIT $1`,
    [limite, ...mots],
  );
  return rows.map((r) => ({
    id: r.id, reference: r.reference, objet: r.objet, demandeur: r.demandeur, adresseLibre: r.adresse_libre,
    etat: r.etat === 'en_cours' || r.etat === 'traite' ? r.etat : 'a_traiter',
    nbFils: r.nb_fils,
  }));
}
