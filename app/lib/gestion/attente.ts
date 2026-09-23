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
 * LOT 4d-B2 — LES MAILS DÉPLACÉS SORTENT DU CALCUL DE LEUR FIL. Un mail rattaché à une AUTRE carte que son échange ne
 * dit plus rien de cet échange : le compter ferait attendre une réponse sur un fil dont la question est partie
 * ailleurs. Il compte, lui, dans la carte qui l'a recueilli. Les trois CTE l'écartent donc au même endroit et de la
 * même façon — une seule ligne à lire pour comprendre la règle, et aucune divergence possible entre elles.
 *
 * CONTRAT DES FRAGMENTS — les requêtes qui les assemblent doivent nommer leurs CTE ainsi :
 *   `dernier` (alias `d`)       : le dernier message non exclu, TOUS expéditeurs confondus ;
 *   `dernier_hors` (alias `h`)  : le dernier message non exclu HORS partenaire interne ;
 *   `exterieur` (alias `ex`)    : les fils qui comptent au moins un correspondant extérieur.
 * `h` et `ex` sont joints en LEFT JOIN : un fil sans correspondant extérieur n'a pas de ligne dans `ex`, et l'attente
 * retombe alors sur `d` — c'est exactement le cas ②-second.
 */

/**
 * Un mail DÉPLACÉ vers une autre carte (lot 4d-B2) : il ne compte plus pour son échange d'origine. Ce fragment est
 * l'unique définition de « déplacé » ; il est collé dans les trois CTE ci-dessous.
 */
export const MESSAGE_DEPLACE = `
  EXISTS (SELECT 1 FROM gestion_affectation am
           WHERE am.message_id = m.id AND am.actif)`;

/**
 * Ce qu'un message doit satisfaire pour COMPTER dans son fil : ni exclu par une règle, ni déplacé ailleurs.
 *
 * ⚠️ LE DRAPEAU N'EST PAS UN CONFORT. `gestion_affectation.message_id` n'existe qu'après la migration 234, et les
 * migrations sont LIVRÉES NON APPLIQUÉES : entre la livraison et l'application par Arno, une requête qui nommerait
 * cette colonne ferait échouer TOUT l'écran. Tant qu'elle est absente, on rend la condition d'AVANT — et rien ne
 * change. Le drapeau est établi une fois, hors transaction, par `schema.ts`.
 */
export const messageCompte = (avecDeplacements: boolean): string =>
  avecDeplacements ? `m.exclu_le IS NULL AND NOT ${MESSAGE_DEPLACE}` : 'm.exclu_le IS NULL';

/** Le dernier message non exclu d'un fil, tous expéditeurs. Donne aussi la DATE D'ACTIVITÉ (fenêtre de la file). */
export const cteDernier = (avecDeplacements: boolean): string => `
  SELECT DISTINCT ON (m.fil_id)
         m.fil_id, m.sens, m.automatique, m.recu_le, m.de_adresse,
         coalesce(nullif(btrim(m.de_nom), ''), m.de_adresse) AS interlocuteur
    FROM gestion_message m
   WHERE ${messageCompte(avecDeplacements)}
   ORDER BY m.fil_id, m.recu_le DESC, m.id DESC`;

/**
 * Le dernier message non exclu EN IGNORANT les partenaires internes. `$p` reçoit la liste des adresses (text[]).
 * Liste vide → `<> ALL('{}')` vaut VRAI pour tout le monde : le fragment redevient identique au précédent, et le
 * comportement est CELUI D'AVANT LA MIGRATION. C'est ce qui permet de livrer la 233 non appliquée sans rien casser.
 */
export const cteDernierHorsPartenaire = (p: string, avecDeplacements = false): string => `
  SELECT DISTINCT ON (m.fil_id)
         m.fil_id, m.sens, m.automatique
    FROM gestion_message m
   WHERE ${messageCompte(avecDeplacements)} AND lower(btrim(m.de_adresse)) <> ALL (${p}::text[])
   ORDER BY m.fil_id, m.recu_le DESC, m.id DESC`;

/** Les fils où quelqu'un d'EXTÉRIEUR a écrit : ni nous (`$n`), ni un partenaire interne (`$p`). */
export const cteExterieur = (p: string, n: string, avecDeplacements = false): string => `
  SELECT DISTINCT m.fil_id
    FROM gestion_message m
   WHERE ${messageCompte(avecDeplacements)}
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

/**
 * Les trois CTE, prêtes à être collées derrière un WITH. `p` et `n` sont les placeholders des paramètres liés ;
 * `avecDeplacements` dit si la migration 234 est appliquée (cf. `schema.ts`).
 */
export function ctesAttente(p: string, n: string, avecDeplacements = false): string {
  return `dernier AS (${cteDernier(avecDeplacements)}),
     dernier_hors AS (${cteDernierHorsPartenaire(p, avecDeplacements)}),
     exterieur AS (${cteExterieur(p, n, avecDeplacements)})`;
}

/**
 * LES MAILS DÉPLACÉS D'UNE CARTE (lot 4d-B2), vus comme une conversation à part : le plus récent décide, exactement
 * comme pour un échange. Une carte qui n'a reçu que des mails isolés attend donc une réponse comme n'importe quelle
 * autre — sinon déplacer un mail reviendrait à le faire disparaître des choses à traiter.
 */
export const CTE_MESSAGES_DEPLACES = `
  SELECT DISTINCT ON (am.evenement_id)
         am.evenement_id, m.sens, m.automatique, m.recu_le
    FROM gestion_affectation am
    JOIN gestion_message m ON m.id = am.message_id
   WHERE am.actif AND am.message_id IS NOT NULL AND m.exclu_le IS NULL
   ORDER BY am.evenement_id, m.recu_le DESC, m.id DESC`;

/** L'attente d'une CARTE : l'un de ses échanges attend, ou le dernier mail qu'on y a déplacé attend. */
export const ATTEND_CARTE = `
  (coalesce(bool_or(${ATTEND}), false)
   OR coalesce(bool_or(md.sens = 'recu' AND NOT md.automatique), false))`;
