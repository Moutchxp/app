import { query } from '../db/client';
import { envoiCiblesDisponibles, envoiInterneDisponible, interneDisponible, rattachementsDisponibles } from './schema';
import type { Auteur } from './gestes';

/**
 * MODULE « GESTION » — LOT RATTACHER-EN-ECRIVANT : LES BIENS COCHÉS PENDANT L'ÉCRITURE.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `horsGestionRepo.ts`).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE ÇA RÉPARE. Le brouillon portait déjà un champ `cibles`, et `envoi.ts` déclarait déjà la dépendance
 * qui devait les poser après l'envoi (`DepsEnvoiComplet.classer`). Mais CETTE DÉPENDANCE N'A JAMAIS ÉTÉ CÂBLÉE :
 * constaté le 30/09/2026, `depsEnvoiReel` ne la fournit pas, aucun appelant ne la fournit, et `deps.classer` vaut
 * donc `undefined` en production. Les biens cochés à l'écriture n'étaient posés NULLE PART — sans erreur, sans
 * trace, sans que rien ne le dise.
 *
 * ═══ 🔴 LE CHEMIN, EN DEUX TEMPS ════════════════════════════════════════════════════════════════════════════════
 *
 *   ① À L'ENVOI — `enregistrerCiblesEnvoi` écrit l'INTENTION, attachée à l'envoi. Le message n'existe pas encore
 *      en base : c'est la relève qui le capturera depuis le dossier « Envoyés » de Gmail.
 *   ② APRÈS LA RELÈVE — `appliquerCiblesEnAttente` retrouve le message par son `gmail_message_id`, pose un
 *      rattachement MANUEL confirmé par cible, et date `applique_le`.
 *
 * 🔴 RIEN NE PEUT FAIRE ÉCHOUER UN ENVOI. Les deux fonctions attrapent leurs erreurs et les signalent au journal
 * DU SERVEUR. Un rattachement manqué se repose en deux clics ; un mail renvoyé parce qu'on a cru qu'il n'était pas
 * parti, non. C'est la règle du module depuis le 24/09/2026.
 *
 * ⚠️ SANS LA MIGRATION 282, LA TABLE N'EST NOMMÉE NULLE PART : chaque fonction sonde d'abord et rend `0`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une cible telle que le brouillon la porte. Mêmes mots que `gestion_rattachement` : on copie, on ne traduit pas. */
export interface CibleEnvoi {
  sorte: string;
  cle: string | null;
  id: number | null;
  libelle: string;
}

/**
 * 🔴 LES SEULES SORTES ACCEPTÉES, et c'est un GARDE, pas un filtre de confort. `proprietaire` et `locataire` ont
 * été sorties du type au lot FICHE-RATTACHEMENT parce que c'était une voie de création de liens « personne » qui
 * ne s'ouvrait qu'au moment de l'envoi. Le type la ferme à la compilation, ceci la ferme à l'exécution, et la
 * contrainte de la migration 282 la ferme en base. PUR.
 */
export const SORTES_CIBLE_ENVOI: readonly string[] = ['lot', 'evenement'];

export function ciblesRetenues(cibles: readonly CibleEnvoi[]): CibleEnvoi[] {
  const vues = new Set<string>();
  const out: CibleEnvoi[] = [];
  for (const c of cibles) {
    if (!SORTES_CIBLE_ENVOI.includes(c.sorte)) continue;
    if ((c.libelle ?? '').trim() === '') continue;
    const cle = `${c.sorte}|${c.cle ?? ''}|${c.id ?? 0}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push({ sorte: c.sorte, cle: c.cle ?? null, id: c.id ?? null, libelle: c.libelle.trim().slice(0, 300) });
  }
  return out.slice(0, 50);
}

/**
 * ① À L'ENVOI — ÉCRIRE L'INTENTION. Rend le nombre de cibles enregistrées.
 *
 * ⚠️ `ON CONFLICT DO NOTHING` : rejouer la validation d'un même envoi n'en crée pas deux.
 */
export async function enregistrerCiblesEnvoi(o: {
  envoiId: number; cibles: readonly CibleEnvoi[]; auteur: Auteur;
}): Promise<number> {
  try {
    const cibles = ciblesRetenues(o.cibles);
    if (cibles.length === 0) return 0;
    if (!(await envoiCiblesDisponibles())) return 0;
    const libelle = (o.auteur.libelle ?? '').trim();
    // 🔴 JAMAIS AUTOMATIQUE : la base le refuse aussi, mais on ne lui envoie pas une ligne qu'elle rejettera.
    if (libelle === '' || libelle.toLowerCase() === 'automatique') return 0;

    const { rows } = await query<{ id: string }>(
      `INSERT INTO gestion_envoi_cible
         (envoi_id, cible_sorte, cible_cle, cible_id, cible_libelle, auteur_id, auteur_libelle)
       SELECT $1, c.sorte, c.cle, c.id, c.libelle, $3, $4
         FROM jsonb_to_recordset($2::jsonb) AS c(sorte text, cle text, id bigint, libelle text)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [o.envoiId, JSON.stringify(cibles), o.auteur.id, libelle]);
    return rows.length;
  } catch (e) {
    console.error('[gestion/envoiCibles] enregistrement impossible (envoi=%d)', o.envoiId, e);
    return 0;
  }
}

/**
 * ══ 🔴🔴 RETROUVER LE MESSAGE CAPTURÉ D'UN ENVOI — ET POURQUOI CE N'EST PAS TRIVIAL ═════════════════════════════
 *
 * Première écriture de ce lot : un `JOIN gestion_message m ON m.gmail_message_id = e.gmail_message_id`. Elle
 * paraît évidente, et elle ne rattache RIEN.
 *
 * 🔴 DEUX CONSTATS MESURÉS LE 30/09/2026, sur deux envois réels :
 *   ① `gestion_message.gmail_message_id` est VIDE pour les messages capturés. La relève passe par IMAP et ne
 *      connaît pas les identifiants de l'API Gmail : la colonne n'est remplie que PLUS TARD, et seulement pour
 *      les messages sur lesquels on a fait un geste (`memoriserAncrage`). Sur nos deux envois : `null`.
 *   ② L'IDENTIFIANT RFC NE CORRESPOND PAS NON PLUS. Gmail RÉÉCRIT le `Message-ID` en expédiant : l'envoi porte
 *      `<20260930140721587.134652a7…>`, la copie capturée porte `<CAJ6+kPGt-Ot4eBSjfPwNzVLq7Qee…>`. Ce ne sont
 *      pas deux formes du même identifiant, ce sont deux identifiants.
 *
 * ═══ CE QU'ON FAIT À LA PLACE, ET CE QU'ON REFUSE DE FAIRE ══════════════════════════════════════════════════════
 *
 * L'identifiant Gmail reste ESSAYÉ EN PREMIER : quand il est là, il est exact, et rien ne vaut mieux. À défaut on
 * reconnaît la copie par ce qui ne peut pas mentir sur un envoi qu'on vient de faire : c'est un message ENVOYÉ,
 * de MÊME OBJET, arrivé dans la FENÊTRE de l'expédition.
 *
 * 🔴 ET SURTOUT : EN CAS D'AMBIGUÏTÉ, ON NE POSE RIEN. Si deux messages envoyés portent le même objet dans la
 * fenêtre, la sous-requête rend `NULL` (le `LIMIT 1` est gardé par un `count(*) = 1`) et l'intention RESTE en
 * attente. Un rattachement posé sur le mauvais mail est une erreur silencieuse dans l'historique d'un client ;
 * une intention qui attend encore se voit et se rejoue. Entre les deux, le choix n'est pas discutable.
 *
 * ⚠️ LA FENÊTRE EST ÉTROITE ET ASYMÉTRIQUE : de 2 minutes AVANT (l'horloge du serveur de mail n'est pas la nôtre)
 * à 2 heures APRÈS (la relève passe toutes les minutes, mais une panne peut la retarder).
 */
const SQL_MESSAGE_DE_L_ENVOI = `(
  SELECT CASE WHEN count(*) = 1 THEN min(m.id) END
    FROM gestion_message m
   WHERE m.sens = 'envoye'
     AND (
       -- ① L'IDENTIFIANT GMAIL, quand il est connu : exact, et il tranche seul.
       (e.gmail_message_id IS NOT NULL AND m.gmail_message_id = e.gmail_message_id)
       -- ② À DÉFAUT : même objet, dans la fenêtre de l'expédition.
       OR (m.gmail_message_id IS NULL
           AND coalesce(m.objet, '') = coalesce(e.objet, '')
           AND m.recu_le >= e.parti_le - interval '2 minutes'
           AND m.recu_le <= e.parti_le + interval '2 hours')
     ))`;

/**
 * ② APRÈS LA RELÈVE — POSER LES RATTACHEMENTS DONT LE MESSAGE EST ENFIN LÀ. Rend le nombre posé.
 *
 * 🔴 UNE SEULE REQUÊTE, ET ELLE EST IDEMPOTENTE. Le `INSERT … SELECT` joint les intentions en attente aux
 * messages capturés par leur identifiant Gmail. Un `NOT EXISTS` écarte ce qui serait déjà posé — la relève peut
 * repasser autant qu'elle veut, elle ne créera jamais un doublon.
 *
 * ⚠️ `origine = 'manuel'` ET `statut = 'confirme'`, ET C'EST LE POINT : ces cibles ont été cochées par quelqu'un,
 * dans une fenêtre, avant d'envoyer. Les poser en « proposition » ferait re-trancher une décision déjà prise, et
 * l'échange resterait « à classer » alors qu'il ne l'est pas.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS. Appelée à la fin d'une relève, elle ne doit pas pouvoir faire échouer une passe qui a
 * par ailleurs tout capturé.
 */
export async function appliquerCiblesEnAttente(): Promise<number> {
  try {
    if (!(await envoiCiblesDisponibles()) || !(await rattachementsDisponibles())) return 0;
    const { rows } = await query<{ id: string }>(
      `WITH prets AS (
         SELECT ec.id AS cible_id, ${SQL_MESSAGE_DE_L_ENVOI} AS message_id,
                ec.cible_sorte, ec.cible_cle, ec.cible_libelle, ec.auteur_id, ec.auteur_libelle
           FROM gestion_envoi_cible ec
           JOIN gestion_envoi e ON e.id = ec.envoi_id
          WHERE ec.applique_le IS NULL AND e.etat = 'envoye' AND e.parti_le IS NOT NULL
       ), prets_trouves AS (
         SELECT * FROM prets WHERE message_id IS NOT NULL
       ), poses AS (
         INSERT INTO gestion_rattachement
           (message_id, cible_sorte, cible_cle, cible_libelle, origine, statut, motif,
            cree_par, cree_par_libelle, statut_le, statut_par, statut_par_libelle)
         SELECT p.message_id, p.cible_sorte, p.cible_cle, p.cible_libelle, 'manuel', 'confirme',
                'bien choisi pendant la rédaction, avant l''envoi',
                p.auteur_id, p.auteur_libelle, now(), p.auteur_id, p.auteur_libelle
           FROM prets_trouves p
          WHERE NOT EXISTS (
                SELECT 1 FROM gestion_rattachement r
                 WHERE r.message_id = p.message_id AND r.cible_sorte = p.cible_sorte
                   AND coalesce(r.cible_cle, '') = coalesce(p.cible_cle, '')
                   AND r.statut IN ('propose', 'confirme'))
         RETURNING message_id
       )
       UPDATE gestion_envoi_cible ec
          SET applique_le = now(), message_id = p.message_id
         FROM prets_trouves p
        WHERE ec.id = p.cible_id
        RETURNING ec.id::text`);
    return rows.length;
  } catch (e) {
    // 🔴 JAMAIS UNE PASSE DE RELÈVE EN ÉCHEC POUR ÇA : c'est une comptabilité en retard, pas du courrier perdu.
    console.error('[gestion/envoiCibles] application impossible', e);
    return 0;
  }
}

/**
 * ══ 🔴🔴 « INTERNE » DEMANDÉ SUR UN MESSAGE **NEUF** ════════════════════════════════════════════════════════════
 *
 * Quand on RÉPOND, l'échange existe : le bouton de la modale le marque tout de suite. Quand on écrit un message
 * NEUF — le cas le plus fréquent pour un mot à un collègue —, il n'existe pas encore : il naît quand la relève
 * capture le message. On retient donc l'intention sur l'ENVOI, et le même rattrapage la pose ensuite.
 *
 * ⚠️ SANS LA MIGRATION 283, la colonne n'est nommée nulle part et cette fonction rend `false` : l'écran dit alors
 * de marquer la conversation depuis « Classer » une fois le message parti. Une moitié de fonction ANNONCÉE.
 */
export async function demanderInternePourEnvoi(envoiId: number): Promise<boolean> {
  try {
    if (!(await envoiInterneDisponible())) return false;
    await query('UPDATE gestion_envoi SET interne_demande = true WHERE id = $1', [envoiId]);
    return true;
  } catch (e) {
    console.error('[gestion/envoiCibles] demande « interne » impossible (envoi=%d)', envoiId, e);
    return false;
  }
}

/**
 * ② bis — POSER « INTERNE » SUR LES ÉCHANGES DONT LE MESSAGE EST ENFIN LÀ. Rend le nombre posé.
 *
 * 🔴 UNE SEULE REQUÊTE, IDEMPOTENTE. Elle joint les envois qui attendent aux messages capturés par leur
 * identifiant Gmail, pose la marque sur leur ÉCHANGE, et éteint le drapeau. `ON CONFLICT DO NOTHING` sur l'index
 * partiel : un échange déjà marqué ne l'est pas deux fois, et la relève peut repasser sans rien casser.
 *
 * ⚠️ L'AUTEUR EST CELUI DE L'ENVOI, et c'est ce qui rend la ligne acceptable pour la base : `gestion_fil_interne`
 * refuse un libellé vide ou « automatique ». Ce n'est pas le programme qui décide, c'est la personne qui a coché
 * la case avant d'envoyer — on ne fait que reporter sa décision au moment où elle devient posable.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS : appelée en fin de relève, elle ne doit pas pouvoir faire échouer une passe.
 */
export async function appliquerInterneEnAttente(): Promise<number> {
  try {
    if (!(await envoiInterneDisponible()) || !(await interneDisponible())) return 0;
    const { rows } = await query<{ id: string }>(
      `WITH prets AS (
         -- 🔴 LE MÊME FRAGMENT QUE LES BIENS, et c'est important : les deux gestes retrouvent le message par
         --    la MÊME règle. Deux façons de reconnaître la copie d'un envoi finiraient par ne plus désigner le
         --    même message — et l'on aurait un mail rattaché à un bien, et son ÉCHANGE marqué sur un autre.
         SELECT e.id AS envoi_id, m.fil_id, e.auteur_id, e.auteur_libelle
           FROM gestion_envoi e
           JOIN gestion_message m ON m.id = ${SQL_MESSAGE_DE_L_ENVOI}
          WHERE e.interne_demande AND e.etat = 'envoye' AND e.parti_le IS NOT NULL AND m.fil_id IS NOT NULL
            AND btrim(coalesce(e.auteur_libelle, '')) <> ''
            AND lower(btrim(coalesce(e.auteur_libelle, ''))) <> 'automatique'
       ), poses AS (
         INSERT INTO gestion_fil_interne (fil_id, pose_par, pose_par_libelle)
         SELECT p.fil_id, p.auteur_id, p.auteur_libelle FROM prets p
         ON CONFLICT (fil_id) WHERE retire_le IS NULL DO NOTHING
         RETURNING fil_id
       )
       UPDATE gestion_envoi e
          SET interne_demande = false
         FROM prets p
        WHERE e.id = p.envoi_id
        RETURNING e.id::text`);
    return rows.length;
  } catch (e) {
    console.error('[gestion/envoiCibles] application « interne » impossible', e);
    return 0;
  }
}

/** Combien d'intentions attendent encore leur message ? Pour le dire à l'écran, et pour les épreuves. */
export async function ciblesEnAttente(): Promise<number> {
  if (!(await envoiCiblesDisponibles())) return 0;
  const { rows } = await query<{ n: number }>(
    'SELECT count(*)::int AS n FROM gestion_envoi_cible WHERE applique_le IS NULL');
  return rows[0]?.n ?? 0;
}
