/**
 * MODULE « GESTION » — LOT 4d : « ATTEND UNE RÉPONSE DE NOTRE PART », en UNE SEULE définition.
 *
 * Cet état n'est PAS stocké : il se déduit des messages, à chaque lecture. C'est voulu — une colonne « attend » serait
 * fausse dès le message suivant, et il faudrait la réparer. Mais une règle dérivée n'a de valeur que si elle est écrite
 * UNE fois : la file, les cartes et le détail d'un échange doivent répondre la même chose, sinon l'écran se contredit.
 * D'où ce fichier : les fragments SQL vivent ici, et nulle part ailleurs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * TROIS SORTES D'EXPÉDITEURS (lot 4d) — avant, il n'y en avait que deux, et la file se trompait.
 *
 *  ① NOUS — `gestion_config.adresse_gestion`. Un message de nous ÉTEINT l'attente : la balle est dans l'autre camp.
 *
 *  ② UN PARTENAIRE INTERNE — table `gestion_partenaire_interne` (migration 233). Il travaille AVEC nous et n'est
 *     jamais en contact direct avec les clients : la comptabilité externalisée (ADHOC Gestion) écrit 168 messages,
 *     tous adressés à notre seule boîte. Son cas dépend du fil :
 *       · le fil comporte au moins un CORRESPONDANT EXTÉRIEUR → ses messages sont TRANSPARENTS : ils ne valent ni
 *         réponse au client, ni nouvelle demande. L'attente se calcule sur le dernier message entre nous et l'extérieur.
 *         Sans quoi une note interne de la compta ferait croire qu'on a répondu au locataire — alors que rien n'est parti.
 *       · le fil ne contient QUE nous et lui → c'est un demandeur ORDINAIRE. Une question de la comptabilité est un
 *         vrai événement : « une demande qui attend une réponse de notre part, quel qu'en soit l'auteur » (Arno).
 *
 *  ③ TOUT LE RESTE — locataire, propriétaire, artisan, syndic… et les COLLÈGUES. Un collègue du service location qui
 *     transfère le mail d'un locataire pose une vraie demande : il n'est PAS « nous » ici (cf. migration 229).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * CONTRAT DES FRAGMENTS — les requêtes qui les assemblent doivent nommer leurs CTE ainsi :
 *   `dernier` (alias `d`)       : le dernier message non exclu, TOUS expéditeurs confondus ;
 *   `dernier_hors` (alias `h`)  : le dernier message non exclu HORS partenaire interne ;
 *   `exterieur` (alias `ex`)    : les fils qui comptent au moins un correspondant extérieur.
 * `h` et `ex` sont joints en LEFT JOIN : un fil sans correspondant extérieur n'a pas de ligne dans `ex`, et l'attente
 * retombe alors sur `d` — c'est exactement le cas ②-second.
 */

/** Le dernier message non exclu d'un fil, tous expéditeurs. Donne aussi la DATE D'ACTIVITÉ (fenêtre de la file). */
export const CTE_DERNIER = `
  SELECT DISTINCT ON (m.fil_id)
         m.fil_id, m.sens, m.automatique, m.recu_le, m.de_adresse,
         coalesce(nullif(btrim(m.de_nom), ''), m.de_adresse) AS interlocuteur
    FROM gestion_message m
   WHERE m.exclu_le IS NULL
   ORDER BY m.fil_id, m.recu_le DESC, m.id DESC`;

/**
 * Le dernier message non exclu EN IGNORANT les partenaires internes. `$p` reçoit la liste des adresses (text[]).
 * Liste vide → `<> ALL('{}')` vaut VRAI pour tout le monde : le fragment redevient identique au précédent, et le
 * comportement est CELUI D'AVANT LA MIGRATION. C'est ce qui permet de livrer la 233 non appliquée sans rien casser.
 */
export const cteDernierHorsPartenaire = (p: string): string => `
  SELECT DISTINCT ON (m.fil_id)
         m.fil_id, m.sens, m.automatique
    FROM gestion_message m
   WHERE m.exclu_le IS NULL AND lower(btrim(m.de_adresse)) <> ALL (${p}::text[])
   ORDER BY m.fil_id, m.recu_le DESC, m.id DESC`;

/** Les fils où quelqu'un d'EXTÉRIEUR a écrit : ni nous (`$n`), ni un partenaire interne (`$p`). */
export const cteExterieur = (p: string, n: string): string => `
  SELECT DISTINCT m.fil_id
    FROM gestion_message m
   WHERE m.exclu_le IS NULL
     AND lower(btrim(m.de_adresse)) <> ALL (${p}::text[])
     AND lower(btrim(m.de_adresse)) <> lower(btrim(${n}))`;

/**
 * L'ATTENTE. Un fil attend une réponse de notre part si le dernier message QUI COMPTE est reçu et probablement humain.
 * « Qui compte » dépend de la présence d'un correspondant extérieur — c'est toute la règle du lot 4d.
 */
export const ATTEND = `
  CASE WHEN ex.fil_id IS NOT NULL
       THEN (h.sens = 'recu' AND NOT h.automatique)
       ELSE (d.sens = 'recu' AND NOT d.automatique)
  END`;

/**
 * Les jointures qui vont avec `ATTEND`, à poser après la jointure sur `dernier`. TOUJOURS les deux, TOUJOURS ensemble :
 * `ATTEND` lit `h` et `ex`, et il les lit en LEFT JOIN (leur absence a un sens — cf. le cas ②-second).
 * `filCol` est la colonne qui porte l'identifiant du fil dans la requête appelante : `f.id` pour la file,
 * `a.fil_id` pour les cartes, qui passent par la table des affectations.
 */
export const jointuresAttente = (filCol: string): string => `
  LEFT JOIN dernier_hors h ON h.fil_id = ${filCol}
  LEFT JOIN exterieur ex ON ex.fil_id = ${filCol}`;

/** Les trois CTE, prêtes à être collées derrière un WITH. `p` et `n` sont les placeholders des paramètres liés. */
export function ctesAttente(p: string, n: string): string {
  return `dernier AS (${CTE_DERNIER}),
     dernier_hors AS (${cteDernierHorsPartenaire(p)}),
     exterieur AS (${cteExterieur(p, n)})`;
}
