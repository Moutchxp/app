/**
 * MODULE « GESTION » — LOT DRIVE-2-bis : ÉCRIRE ET RELIRE LA TRACE MAIL. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 IDEMPOTENT ET RECALCULABLE. La clé est `(message_id, adresse, rôle)` : relancer met à jour, ne double pas.
 * C'est indispensable — un nouvel import de l'annuaire reconnaît des adresses qui ne l'étaient pas, et il faut
 * pouvoir recalculer les 56 802 messages sans rien salir.
 *
 * 🔴 ON TRAVAILLE PAR PAQUETS, ET ON REPREND OÙ L'ON S'ARRÊTE. 56 802 messages ne tiennent pas en mémoire avec
 * leurs corps ; le curseur est l'identifiant du message, ce qui rend la reprise triviale et sans état à garder.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { adressesMessagesDisponibles } from './schema';
import {
  adressesDuChamp, reconnaitre, releverAdresses, type ContactConnu, type OccupationConnue,
} from './adressesMessage';
import type { AdresseEchange } from './propositionTri';

/** Combien de messages par paquet. Assez pour aller vite, assez peu pour qu'une coupure ne coûte presque rien. */
export const PAQUET_DEFAUT = 500;

export interface ComptesReleve {
  messagesVus: number;
  adressesEcrites: number;
  internes: number;
  reconnues: number;
  avecLot: number;
  transferts: number;
}

export const COMPTES_RELEVE_VIDE: ComptesReleve = {
  messagesVus: 0, adressesEcrites: 0, internes: 0, reconnues: 0, avecLot: 0, transferts: 0,
};

/** L'annuaire tel que la reconnaissance l'attend. Lu une fois par passe, jamais par message. */
export async function chargerAnnuaireAdresses(): Promise<{
  contacts: ContactConnu[]; occupations: OccupationConnue[]; adresseGestion: string; partenaires: string[];
}> {
  const { rows: contacts } = await query<{ sujet: string; sujet_id: string; valeur: string; prop: string | null }>(
    `SELECT c.sujet, c.sujet_id, c.valeur, pr.wippimmo_id AS prop
       FROM gestion_annuaire_contact c
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = c.sujet_id AND c.sujet = 'proprietaire'
      WHERE c.sorte = 'email' AND c.absent_le IS NULL${await conditionCoordonneeVivante('c')}`);

  const { rows: occs } = await query<{
    locataire_id: string; lot: string | null; prop: string | null; entree: string | null; sortie: string | null;
  }>(`SELECT o.locataire_id, lo.wippimmo_id AS lot, pr.wippimmo_id AS prop, o.entree::text, o.sortie::text
        FROM gestion_annuaire_occupation o
        LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
        LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id`);

  const { rows: cfg } = await query<{ adresse: string | null }>(
    'SELECT adresse_gestion AS adresse FROM gestion_config WHERE id = 1')
    .catch(() => ({ rows: [] as { adresse: string | null }[] }));

  // Le partenaire interne (comptabilité externalisée, lot 233) : ni nous, ni un client — mais des DEUX CÔTÉS de
  // tous les dossiers, donc jamais une clé de rattachement.
  const { rows: part } = await query<{ adresse: string }>(
    'SELECT adresse FROM gestion_partenaire_interne WHERE actif = true AND adresse IS NOT NULL')
    .catch(() => ({ rows: [] as { adresse: string }[] }));

  return {
    contacts: contacts.map((c) => ({
      email: c.valeur, role: c.sujet as 'proprietaire' | 'locataire', sujetId: Number(c.sujet_id),
      proprietaireCle: c.prop,
    })),
    occupations: occs.map((o) => ({
      locataireId: Number(o.locataire_id), lotCle: o.lot, proprietaireCle: o.prop,
      entree: o.entree, sortie: o.sortie,
    })),
    adresseGestion: cfg[0]?.adresse ?? 'gestion@criterimmo.fr',
    partenaires: part.map((p) => p.adresse),
  };
}

/**
 * RELÈVE LES ADRESSES D'UN PAQUET DE MESSAGES, à partir de `depuis` (exclu). Rend le dernier identifiant traité,
 * ou `null` quand il n'y a plus rien.
 *
 * ⚠️ LE CORPS EST TRONQUÉ À 8 000 CARACTÈRES : le bloc de transfert est toujours en tête, et 56 802 corps entiers
 * ne tiennent pas en mémoire.
 */
export async function releverPaquet(
  depuis: number,
  paquet: number,
  annuaire: Awaited<ReturnType<typeof chargerAnnuaireAdresses>>,
  c: ComptesReleve,
): Promise<number | null> {
  const { rows } = await query<{
    id: string; de: string; dest_a: string | null; dest_cc: string | null; repondre_a: string | null;
    recu_le: string; corps: string | null;
  }>(
    `SELECT id, de_adresse AS de, dest_a::text, dest_cc::text, repondre_a::text, recu_le::text,
            left(coalesce(corps_texte, ''), 8000) AS corps
       FROM gestion_message WHERE id > $1 ORDER BY id LIMIT $2`, [depuis, paquet]);
  if (rows.length === 0) return null;

  for (const m of rows) await ecrireLesAdresses(m, annuaire, c);
  return Number(rows[rows.length - 1].id);
}

/** Un message tel que les deux chemins le lisent : la relève par paquets, et le recalcul d'une fiche modifiée. */
interface MessageBrut {
  id: string; de: string; dest_a: string | null; dest_cc: string | null; repondre_a: string | null;
  recu_le: string; corps: string | null;
}

/**
 * 🔴 L'ÉCRITURE DES ADRESSES D'UN MESSAGE, ÉCRITE UNE SEULE FOIS.
 *
 * 🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — elle était dans le corps de `releverPaquet` ; le recalcul après
 * modification d'une fiche en avait besoin à l'identique. L'y recopier aurait donné deux reconnaissances possibles
 * pour un même message selon le chemin emprunté — exactement le genre d'écart qu'on ne voit jamais, parce que les
 * deux ont l'air de marcher.
 */
async function ecrireLesAdresses(
  m: MessageBrut, annuaire: Awaited<ReturnType<typeof chargerAnnuaireAdresses>>, c: ComptesReleve,
): Promise<void> {
  const relevees = releverAdresses({
    de: m.de,
    destA: adressesDuChamp(m.dest_a),
    destCc: adressesDuChamp(m.dest_cc),
    repondreA: adressesDuChamp(m.repondre_a),
    corps: m.corps ?? '',
  }, annuaire.adresseGestion, annuaire.partenaires);

  c.messagesVus += 1;
  for (const a of relevees) {
    const r = reconnaitre(a, m.recu_le, annuaire.contacts, annuaire.occupations);
    await query(
      `INSERT INTO gestion_message_adresse
         (message_id, adresse, adresse_brute, role, interne, partie, proprietaire_cle, locataire_id, lot_cle, motif, calcule_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (message_id, adresse, role) DO UPDATE SET
         adresse_brute = EXCLUDED.adresse_brute, interne = EXCLUDED.interne, partie = EXCLUDED.partie,
         proprietaire_cle = EXCLUDED.proprietaire_cle, locataire_id = EXCLUDED.locataire_id,
         lot_cle = EXCLUDED.lot_cle, motif = EXCLUDED.motif, calcule_le = now()`,
      [Number(m.id), a.adresse, a.adresseBrute, a.role, a.interne,
        r.partie, r.proprietaireCle, r.locataireId, r.lotCle, r.motif]);

    c.adressesEcrites += 1;
    if (a.interne) c.internes += 1;
    if (r.partie !== null) c.reconnues += 1;
    if (r.lotCle !== null) c.avecLot += 1;
    if (a.role === 'transfere') c.transferts += 1;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PROPOSITIONS-EMAILS-MULTIPLES — LA RECONNAISSANCE N'EST PLUS GELÉE À LA CAPTURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ═══ LE DÉFAUT, CONSTATÉ PAR ARNO LE 01/10/2026 ════════════════════════════════════════════════════════════════

   Mme THAI écrit depuis `cecilethai85@gmail.com`. Arno ajoute cette SECONDE adresse à sa fiche (elle en a deux),
   recharge, rouvre le mail : AUCUNE proposition de ses deux biens du 10 rue Chateaubriand.

   🔴 LE MOTEUR N'Y ÉTAIT POUR RIEN, ET C'EST TOUTE LA LEÇON. `reconnaitre` compare l'adresse à TOUTES les lignes
   de contact de l'annuaire — deux adresses sur une fiche ont toujours fonctionné. Ce qui ne fonctionnait pas, c'est
   que `gestion_message_adresse` porte le RÉSULTAT de cette comparaison, calculé une fois pour toutes AU MOMENT DE
   LA CAPTURE. Les trois mails du fil 36558 avaient été relevés les 29 et 30/09 ; l'adresse est entrée dans la
   fiche le 01/10 à 14h29. Leur ligne disait donc encore « adresse inconnue de l'annuaire », et le disait pour
   toujours.

   ⇒ UN CACHE QUE RIEN N'INVALIDAIT. C'est exactement ce qu'Arno demande de fermer : « toute modification des
   coordonnées d'une fiche recalcule IMMÉDIATEMENT les propositions des mails concernés ; ensuite, à l'ouverture
   d'un mail, elles sont recalculées si la fiche a changé depuis leur calcul ».

   ⚠️ AUCUNE MIGRATION : `calcule_le` existe depuis le premier jour, et `gestion_annuaire_contact` porte déjà
   `cree_le`, `archive_le` et `absent_le`. Il n'y avait pas de colonne à ajouter — seulement une question à poser.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 DE CES MESSAGES, LESQUELS ONT UNE RECONNAISSANCE PÉRIMÉE ? LECTURE SEULE.
 *
 * Périmé = l'une des adresses du message correspond à une coordonnée de l'annuaire qui a été CRÉÉE, ARCHIVÉE ou
 * marquée absente APRÈS le calcul. Les trois cas comptent : ajouter une adresse à une fiche doit faire apparaître
 * des propositions, en retirer une doit les faire disparaître.
 *
 * ⚠️ UNE ADRESSE QUE L'ANNUAIRE N'A JAMAIS CONNUE NE REND RIEN DE PÉRIMÉ : il n'y a rien à recalculer, et la
 * jointure ne trouve rien. C'est ce qui rend ce contrôle presque gratuit à l'ouverture d'un mail — mesuré le
 * 01/10/2026 : 1 807 lignes de contact, index sur `valeur` et sur `adresse`.
 */
export async function messagesAReconnaitre(messageIds: readonly number[]): Promise<number[]> {
  if (messageIds.length === 0 || !(await adressesMessagesDisponibles())) return [];
  const { rows } = await query<{ message_id: string }>(
    `SELECT DISTINCT a.message_id::text
       FROM gestion_message_adresse a
       JOIN gestion_annuaire_contact c ON c.sorte = 'email' AND c.valeur = a.adresse
      WHERE a.message_id = ANY($1::bigint[])
        AND greatest(c.cree_le, c.archive_le, c.absent_le) > a.calcule_le`, [messageIds]);
  return rows.map((r) => Number(r.message_id));
}

/** Les messages — et leurs conversations — où ces adresses apparaissent, quel que soit leur rôle. LECTURE SEULE. */
export async function messagesDeCesAdresses(adresses: readonly string[]): Promise<{
  messageIds: number[]; filIds: number[];
}> {
  const propres = [...new Set(adresses.map((a) => (a ?? '').trim().toLowerCase()).filter((a) => a !== ''))];
  if (propres.length === 0 || !(await adressesMessagesDisponibles())) return { messageIds: [], filIds: [] };
  const { rows } = await query<{ message_id: string; fil_id: string | null }>(
    `SELECT DISTINCT a.message_id::text, m.fil_id::text
       FROM gestion_message_adresse a JOIN gestion_message m ON m.id = a.message_id
      WHERE a.adresse = ANY($1::text[])`, [propres]);
  return {
    messageIds: rows.map((r) => Number(r.message_id)),
    filIds: [...new Set(rows.map((r) => r.fil_id).filter((x): x is string => x !== null).map(Number))],
  };
}

/**
 * 🔴 RECALCULE LA RECONNAISSANCE DE CES MESSAGES, et d'eux seuls. Rend le nombre de lignes réécrites.
 *
 * 🔴 C'EST LA MÊME ÉCRITURE QUE LA RELÈVE, au mot près : même `releverAdresses`, même `reconnaitre`, même
 * `INSERT … ON CONFLICT`. Une seconde écriture aurait divergé au premier ajustement, et l'on aurait vu une adresse
 * reconnue à la capture et inconnue au recalcul — ou l'inverse.
 *
 * ⚠️ `calcule_le` EST REMIS À `now()` MÊME QUAND RIEN NE CHANGE : c'est lui qui dit « cette ligne a été confrontée
 * à l'annuaire d'aujourd'hui ». Sans cela, un message dont la reconnaissance reste négative serait recalculé à
 * chaque ouverture, indéfiniment.
 */
export async function recalculerLesAdresses(messageIds: readonly number[]): Promise<number> {
  if (messageIds.length === 0 || !(await adressesMessagesDisponibles())) return 0;
  const annuaire = await chargerAnnuaireAdresses();
  const c: ComptesReleve = { ...COMPTES_RELEVE_VIDE };

  const { rows } = await query<{
    id: string; de: string; dest_a: string | null; dest_cc: string | null; repondre_a: string | null;
    recu_le: string; corps: string | null;
  }>(
    `SELECT id, de_adresse AS de, dest_a::text, dest_cc::text, repondre_a::text, recu_le::text,
            left(coalesce(corps_texte, ''), 8000) AS corps
       FROM gestion_message WHERE id = ANY($1::bigint[]) ORDER BY id`, [messageIds]);

  for (const m of rows) await ecrireLesAdresses(m, annuaire, c);
  return c.adressesEcrites;
}

/** Le plus grand identifiant de message déjà relevé : c'est le curseur de reprise. */
export async function curseurReleve(): Promise<number> {
  if (!(await adressesMessagesDisponibles())) return 0;
  const { rows } = await query<{ n: string | null }>(
    'SELECT max(message_id)::text AS n FROM gestion_message_adresse');
  return Number(rows[0]?.n ?? 0);
}

/**
 * LES ADRESSES DE TOUS LES MESSAGES D'UN ENSEMBLE DE FILS, pour fonder les propositions.
 *
 * ⚠️ ON LIT PAR FIL, ET EN UNE FOIS : une requête par pièce sur 26 000 pièces ferait 26 000 allers-retours.
 */
export async function adressesParFil(filIds: readonly number[]): Promise<Map<number, AdresseEchange[]>> {
  const m = new Map<number, AdresseEchange[]>();
  if (filIds.length === 0) return m;

  const { rows } = await query<{
    fil_id: string; message_id: string; adresse: string; interne: boolean; partie: string | null;
    proprietaire_cle: string | null; locataire_id: string | null; lot_cle: string | null; motif: string | null;
  }>(
    `SELECT msg.fil_id, a.message_id, a.adresse, a.interne, a.partie, a.proprietaire_cle, a.locataire_id,
            a.lot_cle, a.motif
       FROM gestion_message_adresse a
       JOIN gestion_message msg ON msg.id = a.message_id
      WHERE msg.fil_id = ANY($1::bigint[])`, [filIds]);

  for (const r of rows) {
    const fil = Number(r.fil_id);
    const liste = m.get(fil) ?? [];
    liste.push({
      adresse: r.adresse,
      messageId: Number(r.message_id),
      interne: r.interne,
      reconnaissance: {
        partie: r.partie as 'proprietaire' | 'locataire' | null,
        proprietaireCle: r.proprietaire_cle,
        locataireId: r.locataire_id === null ? null : Number(r.locataire_id),
        lotCle: r.lot_cle,
        motif: r.motif ?? '',
      },
    });
    m.set(fil, liste);
  }
  return m;
}

/** Les chiffres du relevé, pour le rapport. LECTURE SEULE. */
export async function chiffresReleve(): Promise<{
  messages: number; messagesCouverts: number; adresses: number; internes: number;
  reconnues: number; avecLot: number; transferts: number; distinctes: number;
}> {
  const { rows } = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM gestion_message)::text AS messages,
            (SELECT count(DISTINCT message_id) FROM gestion_message_adresse)::text AS couverts,
            (SELECT count(*) FROM gestion_message_adresse)::text AS adresses,
            (SELECT count(*) FROM gestion_message_adresse WHERE interne)::text AS internes,
            (SELECT count(*) FROM gestion_message_adresse WHERE partie IS NOT NULL)::text AS reconnues,
            (SELECT count(*) FROM gestion_message_adresse WHERE lot_cle IS NOT NULL)::text AS avec_lot,
            (SELECT count(*) FROM gestion_message_adresse WHERE role = 'transfere')::text AS transferts,
            (SELECT count(DISTINCT adresse) FROM gestion_message_adresse)::text AS distinctes`);
  const r = rows[0];
  return {
    messages: Number(r.messages), messagesCouverts: Number(r.couverts), adresses: Number(r.adresses),
    internes: Number(r.internes), reconnues: Number(r.reconnues), avecLot: Number(r.avec_lot),
    transferts: Number(r.transferts), distinctes: Number(r.distinctes),
  };
}
