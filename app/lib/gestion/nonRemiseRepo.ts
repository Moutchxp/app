/**
 * MODULE « GESTION » — LOT ENVOI-DIAG : LES AVIS DE NON-REMISE EN BASE. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 IL NE TOUCHE NI GMAIL, NI LE DRIVE, NI MinIO. Il ne fait que RELIRE des messages déjà capturés et inscrire le
 * résultat de leur lecture. Rien n'est téléchargé, rien n'est marqué lu, aucun libellé n'est posé.
 *
 * 🔴 LA DÉCISION EST AILLEURS. Reconnaître un avis, le lire, le classer permanent ou temporaire, en tirer un motif
 * français : tout cela est dans `nonRemise.ts`, pur et éprouvé sans base. Ici on ne fait que deux choses qu'un module
 * pur ne peut pas faire — demander à la base quel message l'avis concerne, et écrire le lien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { nonRemiseDisponible } from './schema';
import {
  estAvisNonRemise, lireAvis, motifNonRemise, phraseNonRemise, sorteAvis,
  type SorteNonRemise,
} from './nonRemise';

/**
 * COMBIEN DE JOURS EN ARRIÈRE LA RELÈVE REGARDE.
 *
 * 🔴 UNE FENÊTRE, ET PAS UN CURSEUR D'IDENTIFIANT. Un curseur « après le dernier avis inscrit » ne marcherait pas
 * ici : la plupart des messages ne sont PAS des avis, donc le curseur n'avancerait pas et la même tranche serait
 * relue à chaque passe, une fois par minute. Une fenêtre de date s'appuie sur l'index de `recu_le` et reste bornée
 * quoi qu'il arrive. Un avis arrive toujours dans les minutes ou les heures qui suivent l'envoi ; sept jours
 * couvrent même les avis de retard, qui réessaient jusqu'à 48 h. Le rattrapage complet, lui, est une commande.
 */
export const FENETRE_AVIS_JOURS = 7;

/** Ce qu'une lecture d'avis a produit. */
export interface ComptesAvis {
  examines: number;
  reconnus: number;
  inscrits: number;
  rattaches: number;
  orphelins: number;
}

export const COMPTES_AVIS_VIDES: ComptesAvis = {
  examines: 0, reconnus: 0, inscrits: 0, rattaches: 0, orphelins: 0,
};

interface MessageBrut {
  id: number; deAdresse: string | null; objet: string | null; corps: string | null;
}

/**
 * LES MESSAGES À EXAMINER : ceux de la fenêtre dont aucun avis n'a encore été lu. LECTURE SEULE.
 *
 * ⚠️ LE PRÉFILTRE SQL EST LARGE EXPRÈS, et la décision reste à `estAvisNonRemise`. Un `ILIKE` sur le corps ferait un
 * balayage complet ; on écarte donc seulement sur l'expéditeur et l'objet — deux signaux bon marché — et on laisse
 * passer tout ce qui porte un rapport machine possible. La fonction pure tranche ensuite, et c'est elle qu'on
 * éprouve. Deux définitions du mot « avis », une en SQL et une en TypeScript, finiraient par ne plus se recouvrir.
 */
export async function messagesAExaminer(jours = FENETRE_AVIS_JOURS, plafond = 500): Promise<MessageBrut[]> {
  const { rows } = await query<{
    id: string; de_adresse: string | null; objet: string | null; corps_texte: string | null;
  }>(
    `SELECT m.id, m.de_adresse, m.objet, m.corps_texte
       FROM gestion_message m
      WHERE m.recu_le >= now() - ($1::int * interval '1 day')
        AND m.sens = 'recu'
        AND NOT EXISTS (SELECT 1 FROM gestion_non_remise n WHERE n.avis_message_id = m.id)
        AND (m.de_adresse ILIKE '%mailer-daemon@%' OR m.de_adresse ILIKE '%postmaster@%'
             OR m.de_adresse ILIKE '%mail-daemon@%' OR m.objet ILIKE 'delivery status%'
             OR m.objet ILIKE 'non remis%' OR m.objet ILIKE 'message non distribu%'
             OR m.objet ILIKE 'undeliverable%' OR m.objet ILIKE 'undelivered mail%'
             OR m.objet ILIKE 'returned mail%' OR m.objet ILIKE 'address not found%'
             OR m.objet ILIKE 'échec de la remise%')
      ORDER BY m.id
      LIMIT $2`, [jours, plafond]);
  return rows.map((r) => ({
    id: Number(r.id), deAdresse: r.de_adresse, objet: r.objet, corps: r.corps_texte,
  }));
}

/**
 * QUEL MESSAGE CET AVIS CONCERNE-T-IL ? LECTURE SEULE. `null` = aucun de ceux que nous connaissons.
 *
 * 🔴 ON DEMANDE À LA BASE, ON NE CHOISIT PAS. L'avis cite plusieurs `Message-ID` (le sien, celui de l'original,
 * parfois des fragments d'en-têtes DKIM). Plutôt que de deviner lequel est le bon, on lui présente TOUS les
 * candidats et on retient celui qu'elle reconnaît. Un identifiant inventé ou mal découpé ne correspond simplement à
 * rien, et l'avis reste orphelin — ce qui est la bonne réponse.
 *
 * 🔴 ET SEULEMENT UN MESSAGE QUE NOUS AVONS ENVOYÉ. Un avis de non-remise porte sur un envoi, jamais sur une
 * réception. Sans ce garde, un identifiant malencontreusement partagé pourrait coller « non distribué » sur un mail
 * reçu — afficher un échec d'envoi sur le message d'un locataire serait incompréhensible.
 */
export async function origineDeLAvis(candidats: readonly string[]): Promise<{ messageId: number; filId: number } | null> {
  if (candidats.length === 0) return null;
  const { rows } = await query<{ id: string; fil_id: string }>(
    `SELECT id, fil_id FROM gestion_message
      WHERE message_id = ANY($1::text[]) AND sens = 'envoye'
      ORDER BY id DESC LIMIT 1`, [[...candidats]]);
  return rows[0] ? { messageId: Number(rows[0].id), filId: Number(rows[0].fil_id) } : null;
}

/**
 * LIT LES AVIS DE LA FENÊTRE ET INSCRIT CE QU'ILS DISENT. Rend ses comptes ; ne jette que si la base tombe.
 *
 * ⚠️ `ON CONFLICT DO NOTHING` sur `avis_message_id` : un avis ne se lit qu'une fois, et c'est cette clé qui rend la
 * commande de rattrapage rejouable sans précaution.
 *
 * ⚠️ UN AVIS DE BONNE REMISE N'EST PAS INSCRIT. Certains serveurs en envoient (`Action: delivered`) ; `sorteAvis`
 * rend alors `aucun`, et écrire une ligne « non-remise » pour un message parfaitement arrivé serait le contraire du
 * service rendu. Il est compté « reconnu » mais pas « inscrit » : l'écart se lit dans le rapport.
 */
export async function lireAvisEnAttente(
  jours = FENETRE_AVIS_JOURS, plafond = 500, c: ComptesAvis = { ...COMPTES_AVIS_VIDES },
): Promise<ComptesAvis> {
  if (!(await nonRemiseDisponible())) return c;

  for (const m of await messagesAExaminer(jours, plafond)) {
    c.examines += 1;
    if (!estAvisNonRemise(m)) continue;
    c.reconnus += 1;

    const avis = lireAvis(m.corps);
    const sorte = sorteAvis(avis);
    if (sorte === 'aucun') continue;

    const origine = await origineDeLAvis(avis.candidats);
    const { rowCount } = await query(
      `INSERT INTO gestion_non_remise
         (avis_message_id, origine_message_id, origine_fil_id, sorte, destinataire, action, statut, diagnostic, motif)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (avis_message_id) DO NOTHING`,
      [m.id, origine?.messageId ?? null, origine?.filId ?? null, sorte, avis.destinataire,
        avis.action, avis.statut, avis.diagnostic, motifNonRemise(avis)]);
    if ((rowCount ?? 0) === 0) continue;

    c.inscrits += 1;
    if (origine === null) c.orphelins += 1; else c.rattaches += 1;
  }
  return c;
}

/**
 * LA DATE D'UN AVIS — ET CE N'EST PAS `constate_le`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DÉFAUT TROUVÉ AU PREMIER RATTRAPAGE RÉEL, le 27/09/2026 à 01:28. `constate_le` porte l'instant où NOUS avons lu
 * l'avis, pas celui où le serveur distant l'a envoyé. Le rattrapage a lu 74 avis étalés du 09/01/2025 au 26/09/2026
 * — et leur a donné à tous le même `constate_le`, à la seconde près. Trier là-dessus, c'est trier par ordre
 * d'insertion : « l'avis le plus récent de cet échange » devenait « celui dont l'identifiant est le plus grand ».
 *
 * La date d'un avis est celle du MESSAGE qui le porte (`recu_le`), et elle ne bouge jamais. `constate_le` garde son
 * sens — quand nous l'avons su, ce qui sert à mesurer notre propre retard — et n'ordonne plus rien.
 *
 * ⚠️ AUCUNE MIGRATION POUR ÇA : la donnée juste était déjà là, dans `gestion_message`. Ajouter une colonne aurait
 * créé une seconde vérité à tenir, alors qu'il suffisait d'aller lire la bonne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const DATE_DE_L_AVIS = 'a.recu_le';

/** Ce qu'un avis rattaché fait dire à l'écran, sur le message concerné comme sur la ligne de liste. */
export interface MentionNonRemise {
  sorte: SorteNonRemise;
  phrase: string;
  destinataire: string | null;
  /** L'identifiant de l'avis lui-même — pour que l'écran puisse proposer de l'ouvrir. */
  avisMessageId: number;
}

/** Une mention, depuis une ligne de la table. PUR sauf qu'elle vit ici, au plus près de la lecture. */
function mention(r: {
  sorte: string; motif: string; destinataire: string | null; avis_message_id: string;
}): MentionNonRemise {
  const sorte = r.sorte === 'permanent' ? 'permanent' : 'temporaire';
  return {
    sorte,
    phrase: phraseNonRemise({ sorte, destinataire: r.destinataire, motif: r.motif }),
    destinataire: r.destinataire,
    avisMessageId: Number(r.avis_message_id),
  };
}

/**
 * LES AVIS QUI CONCERNENT CES MESSAGES — pour le fil ouvert. LECTURE SEULE.
 *
 * ⚠️ UN MESSAGE PEUT EN PORTER PLUSIEURS : un mail à cinq destinataires dont deux échouent rend deux avis, et un
 * retard suivi d'un échec définitif en rend deux autres. On les rend TOUS, du plus récent au plus ancien, et c'est
 * l'écran qui choisit ce qu'il montre — n'en garder qu'un ici cacherait qu'une seule des cinq personnes a reçu.
 */
export async function nonRemisesDesMessages(messageIds: readonly number[]): Promise<Map<number, MentionNonRemise[]>> {
  const m = new Map<number, MentionNonRemise[]>();
  if (messageIds.length === 0 || !(await nonRemiseDisponible())) return m;
  const { rows } = await query<{
    origine_message_id: string; sorte: string; motif: string; destinataire: string | null; avis_message_id: string;
  }>(
    `SELECT n.origine_message_id, n.sorte, n.motif, n.destinataire, n.avis_message_id
       FROM gestion_non_remise n
       JOIN gestion_message a ON a.id = n.avis_message_id
      WHERE n.origine_message_id = ANY($1::bigint[])
      ORDER BY ${DATE_DE_L_AVIS} DESC`, [[...messageIds]]);
  for (const r of rows) {
    const cle = Number(r.origine_message_id);
    const liste = m.get(cle) ?? [];
    liste.push(mention(r));
    m.set(cle, liste);
  }
  return m;
}

/**
 * LE PIRE AVIS DE CHAQUE ÉCHANGE — pour la liste Envoyés. LECTURE SEULE.
 *
 * 🔴 « LE PIRE », ET NON « LE DERNIER ». Un échec DÉFINITIF suivi d'un avis de retard sur un autre destinataire ne
 * doit pas se transformer en « remise retardée » sur la ligne : ce qui compte pour qui parcourt sa liste, c'est
 * qu'un message n'est pas arrivé. Le permanent l'emporte donc toujours, et à égalité c'est le plus récent.
 */
export async function nonRemisesDesFils(filIds: readonly number[]): Promise<Map<number, MentionNonRemise>> {
  const m = new Map<number, MentionNonRemise>();
  if (filIds.length === 0 || !(await nonRemiseDisponible())) return m;
  const { rows } = await query<{
    origine_fil_id: string; sorte: string; motif: string; destinataire: string | null; avis_message_id: string;
  }>(
    `SELECT DISTINCT ON (n.origine_fil_id)
            n.origine_fil_id, n.sorte, n.motif, n.destinataire, n.avis_message_id
       FROM gestion_non_remise n
       JOIN gestion_message a ON a.id = n.avis_message_id
      WHERE n.origine_fil_id = ANY($1::bigint[])
      ORDER BY n.origine_fil_id,
               -- le permanent d'abord, puis le plus récent : exactement la règle énoncée au-dessus.
               -- La date est celle de l'AVIS, pas celle de sa lecture par nous. Voir DATE_DE_L_AVIS.
               (n.sorte = 'permanent') DESC, ${DATE_DE_L_AVIS} DESC`, [[...filIds]]);
  for (const r of rows) m.set(Number(r.origine_fil_id), mention(r));
  return m;
}

/** Les chiffres d'ensemble, pour le rapport de la commande de rattrapage. LECTURE SEULE. */
export async function chiffresNonRemise(): Promise<{
  total: number; permanents: number; temporaires: number; rattaches: number; orphelins: number;
} | null> {
  if (!(await nonRemiseDisponible())) return null;
  const { rows } = await query<{
    total: string; permanents: string; temporaires: string; rattaches: string; orphelins: string;
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE sorte = 'permanent')::text AS permanents,
            count(*) FILTER (WHERE sorte = 'temporaire')::text AS temporaires,
            count(*) FILTER (WHERE origine_message_id IS NOT NULL)::text AS rattaches,
            count(*) FILTER (WHERE origine_message_id IS NULL)::text AS orphelins
       FROM gestion_non_remise`);
  const r = rows[0];
  return {
    total: Number(r.total), permanents: Number(r.permanents), temporaires: Number(r.temporaires),
    rattaches: Number(r.rattaches), orphelins: Number(r.orphelins),
  };
}
