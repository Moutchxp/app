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
import { adressesMessagesDisponibles } from './schema';
import {
  reconnaitre, releverAdresses, type ContactConnu, type OccupationConnue,
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
      WHERE c.sorte = 'email' AND c.absent_le IS NULL`);

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

/** Une colonne JSON lue sans jamais lever : une valeur abîmée ne doit pas arrêter 56 000 messages. */
function adresses(brut: string | null): string[] {
  if (brut === null || brut.trim() === '') return [];
  try {
    const j = JSON.parse(brut) as unknown;
    return Array.isArray(j) ? j.map((x) => String(x)) : [];
  } catch {
    return [];
  }
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

  for (const m of rows) {
    const relevees = releverAdresses({
      de: m.de,
      destA: adresses(m.dest_a),
      destCc: adresses(m.dest_cc),
      repondreA: adresses(m.repondre_a),
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
  return Number(rows[rows.length - 1].id);
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
