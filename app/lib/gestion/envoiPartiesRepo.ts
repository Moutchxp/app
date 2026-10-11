import { query } from '../db/client';
import {
  adresseDe, estInterne, personnesDuChamp, reconnaitre, type ContactConnu, type OccupationConnue, type Reconnaissance,
  type RoleAdresse,
} from './adressesMessage';
import { chargerAnnuaireAdresses } from './adressesRepo';
import { SQL_MESSAGE_DE_L_ENVOI } from './envoiCiblesRepo';
import { envoiPartiesDisponibles } from './schema';

/**
 * MODULE « GESTION » — LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS : LES PARTIES D'UN MAIL QUE NOUS ENVOYONS.
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `envoiCiblesRepo.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO : « un mail envoyé […] est rattaché automatiquement à TOUTE partie dont au moins une adresse figure dans À, Cc
 * ou Cci, quel que soit le bien de cette partie. Cela couvre les clients, les contacts du syndic et le carnet de
 * l'immeuble. Une adresse inconnue reste enregistrée avec le mail, sans partie. Même mécanisme que pour les mails
 * entrants. Aucune écriture rétroactive sur les mails existants. »
 *
 * 🔴 LE MÊME MÉCANISME QUE LES MAILS ENTRANTS : `gestion_message_adresse`, une ligne par (message, adresse, rôle),
 * et la MÊME reconnaissance des clients (`reconnaitre`, sur tout l'annuaire, à la date du mail). Ce module n'ajoute
 * que ce que la relève ne peut pas savoir d'un mail reçu :
 *   · le Cci (rôle `copie_cachee`), que nous connaissons parce que c'est nous qui l'avons écrit ;
 *   · les contacts du syndic, l'e-mail générique d'un syndic et le carnet de l'immeuble (`partie_externe`).
 *
 * 🔴 LE CHEMIN, EN DEUX TEMPS — celui des biens cochés (`envoiCiblesRepo`), à l'identique :
 *   ① À L'ENVOI — rien à faire : `gestion_envoi.parties_demandees` vaut VRAI par défaut depuis la migration 338, et
 *      l'envoi porte déjà ses destinataires (`dest_a`, `dest_cc`, `dest_cci`).
 *   ② APRÈS LA RELÈVE — `appliquerPartiesEnAttente` retrouve le message capturé (même requête que les biens cochés,
 *      même refus en cas d'ambiguïté), écrit ses adresses, et date `parties_appliquees_le`.
 *
 * 🔴 AUCUNE ÉCRITURE RÉTROACTIVE : les envois d'avant la migration valent FAUX, et ne sont jamais lus ici. La relève
 * ordinaire (`releverPaquet`) et le recalcul après une fiche modifiée ne touchent pas les colonnes de ce module : ils
 * n'écrivent que le À et le Cc, et leurs colonnes à eux.
 *
 * 🔴 RIEN NE PEUT FAIRE ÉCHOUER UNE PASSE DE RELÈVE : la fonction attrape ses erreurs et le dit au journal du serveur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une adresse d'un syndic, d'un de ses contacts ou du carnet d'un immeuble, telle que la reconnaissance l'attend. */
export interface AdresseExterne {
  email: string;
  sorte: 'syndic' | 'syndic_contact' | 'immeuble_contact';
  syndicId: number | null;
  syndicContactId: number | null;
  coproprieteContactId: number | null;
  /** « contact du syndic X », pour le motif écrit à côté de la ligne. */
  libelle: string;
}

/** Ce qu'une ligne de `gestion_message_adresse` porte, pour une adresse d'un mail envoyé. */
export interface PartieDestinataire {
  adresse: string;
  adresseBrute: string;
  role: Extract<RoleAdresse, 'destinataire' | 'copie' | 'copie_cachee'>;
  interne: boolean;
  client: Reconnaissance;
  externe: AdresseExterne | null;
  motif: string;
}

/**
 * LES PARTIES DES DESTINATAIRES D'UN ENVOI. PUR.
 *
 * Chaque adresse de À, Cc et Cci : son rôle, le client que l'annuaire y reconnaît (À LA DATE DE L'ENVOI, quel que
 * soit son bien — c'est `reconnaitre`, la même que pour un mail reçu), et la partie non cliente qu'elle désigne.
 * Une adresse peut être les deux (un copropriétaire membre du conseil syndical) : les deux sont écrits.
 * Une adresse inconnue reste dans la liste, sans partie. Une de nos adresses n'est jamais une partie.
 *
 * ⚠️ LA PRIORITÉ ENTRE PARTIES NON CLIENTES : un CONTACT nommé du syndic d'abord (c'est une personne), puis
 * l'e-mail générique du syndic, puis le carnet de l'immeuble.
 */
export function partiesDesDestinataires(
  envoi: { a: readonly string[]; cc: readonly string[]; cci: readonly string[]; date: string },
  annuaire: { contacts: readonly ContactConnu[]; occupations: readonly OccupationConnue[]; adresseGestion: string; partenaires: readonly string[] },
  externes: readonly AdresseExterne[],
): PartieDestinataire[] {
  const ordre: Record<AdresseExterne['sorte'], number> = { syndic_contact: 0, syndic: 1, immeuble_contact: 2 };
  const out: PartieDestinataire[] = [];
  const vus = new Set<string>();
  const champs: Array<[readonly string[], PartieDestinataire['role']]> = [
    [envoi.a, 'destinataire'], [envoi.cc, 'copie'], [envoi.cci, 'copie_cachee'],
  ];
  for (const [liste, role] of champs) {
    for (const brut of liste) {
      const adresse = adresseDe(brut);
      if (adresse === null) continue;
      const cle = `${adresse}|${role}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      const interne = estInterne(adresse, annuaire.adresseGestion, annuaire.partenaires);
      const relevee = { adresse, adresseBrute: brut.trim().slice(0, 320), role, interne };
      const client = reconnaitre(relevee, envoi.date, annuaire.contacts, annuaire.occupations);
      const externe = interne ? null : [...externes]
        .filter((x) => x.email === adresse)
        .sort((x, y) => ordre[x.sorte] - ordre[y.sorte])[0] ?? null;
      const motif = externe === null ? client.motif
        : client.partie === null ? externe.libelle : `${client.motif} ; ${externe.libelle}`;
      out.push({ ...relevee, client, externe, motif });
    }
  }
  return out;
}

/** Les adresses des syndics (générique), de leurs contacts EN COURS et des carnets d'immeuble. LECTURE SEULE. */
export async function chargerAdressesExternes(): Promise<AdresseExterne[]> {
  const { rows } = await query<{
    email: string; sorte: AdresseExterne['sorte']; syndic_id: string | null; contact_id: string | null;
    copro_contact_id: string | null; libelle: string;
  }>(
    `SELECT lower(btrim(s.email)) AS email, 'syndic' AS sorte, s.id::text AS syndic_id, NULL::text AS contact_id,
            NULL::text AS copro_contact_id, 'e-mail du syndic ' || s.nom AS libelle
       FROM gestion_syndic s
      WHERE s.supprime_le IS NULL AND coalesce(btrim(s.email), '') <> ''
     UNION ALL
     SELECT lower(btrim(k.valeur)), 'syndic_contact', s.id::text, ct.id::text, NULL::text,
            'contact du syndic ' || s.nom
       FROM gestion_syndic_coordonnee k
       JOIN gestion_syndic_contact ct ON ct.id = k.contact_id
       JOIN gestion_syndic s ON s.id = ct.syndic_id
      WHERE k.sorte = 'email' AND k.retire_le IS NULL AND ct.retire_le IS NULL AND ct.parti_le IS NULL
        AND s.supprime_le IS NULL
     UNION ALL
     SELECT lower(btrim(k.valeur)), 'immeuble_contact', NULL::text, NULL::text, ct.id::text,
            'contact de l''immeuble ' || c.libelle
       FROM gestion_copropriete_contact_coordonnee k
       JOIN gestion_copropriete_contact ct ON ct.id = k.contact_id
       JOIN gestion_copropriete c ON c.id = ct.copropriete_id
      WHERE k.sorte = 'email' AND k.retire_le IS NULL AND ct.retire_le IS NULL`);
  return rows.map((r) => ({
    email: r.email, sorte: r.sorte,
    syndicId: r.syndic_id === null ? null : Number(r.syndic_id),
    syndicContactId: r.contact_id === null ? null : Number(r.contact_id),
    coproprieteContactId: r.copro_contact_id === null ? null : Number(r.copro_contact_id),
    libelle: r.libelle,
  }));
}

/** Les adresses d'une colonne jsonb de l'envoi, avec leur nom d'affichage quand il y en a un. */
function champ(brut: unknown): string[] {
  const texte = brut === null || brut === undefined ? null : typeof brut === 'string' ? brut : JSON.stringify(brut);
  return personnesDuChamp(texte).map((p) => (p.nom === null ? p.adresse : `${p.nom} <${p.adresse}>`));
}

/**
 * ② APRÈS LA RELÈVE — ÉCRIRE LES PARTIES DES ENVOIS DONT LE MESSAGE EST ENFIN LÀ. Rend le nombre d'envois traités.
 *
 * ⚠️ IDEMPOTENTE : `ON CONFLICT (message_id, adresse, rôle) DO UPDATE`, et l'envoi est daté une fois traité. La relève
 * qui écrit ensuite le À et le Cc du même message recalcule les colonnes CLIENTS à l'identique et laisse les autres.
 */
export async function appliquerPartiesEnAttente(): Promise<number> {
  try {
    if (!(await envoiPartiesDisponibles())) return 0;
    const { rows: prets } = await query<{
      id: string; message_id: string | null; dest_a: unknown; dest_cc: unknown; dest_cci: unknown; parti_le: string;
    }>(
      `SELECT e.id::text, ${SQL_MESSAGE_DE_L_ENVOI}::text AS message_id, e.dest_a, e.dest_cc, e.dest_cci,
              e.parti_le::text
         FROM gestion_envoi e
        WHERE e.parties_demandees AND e.parties_appliquees_le IS NULL
          AND e.etat = 'envoye' AND e.parti_le IS NOT NULL
        ORDER BY e.id
        LIMIT 200`);
    const trouves = prets.filter((p) => p.message_id !== null);
    if (trouves.length === 0) return 0;
    const annuaire = await chargerAnnuaireAdresses();
    const externes = await chargerAdressesExternes();
    let faits = 0;
    for (const e of trouves) {
      const lignes = partiesDesDestinataires(
        { a: champ(e.dest_a), cc: champ(e.dest_cc), cci: champ(e.dest_cci), date: e.parti_le }, annuaire, externes);
      for (const l of lignes) {
        await query(
          `INSERT INTO gestion_message_adresse
             (message_id, adresse, adresse_brute, role, interne, partie, proprietaire_cle, locataire_id, lot_cle, motif,
              partie_externe, syndic_id, syndic_contact_id, copropriete_contact_id, calcule_le)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
           ON CONFLICT (message_id, adresse, role) DO UPDATE SET
             interne = EXCLUDED.interne, partie = EXCLUDED.partie, proprietaire_cle = EXCLUDED.proprietaire_cle,
             locataire_id = EXCLUDED.locataire_id, lot_cle = EXCLUDED.lot_cle, motif = EXCLUDED.motif,
             partie_externe = EXCLUDED.partie_externe, syndic_id = EXCLUDED.syndic_id,
             syndic_contact_id = EXCLUDED.syndic_contact_id, copropriete_contact_id = EXCLUDED.copropriete_contact_id,
             calcule_le = now()`,
          [Number(e.message_id), l.adresse, l.adresseBrute, l.role, l.interne, l.client.partie,
            l.client.proprietaireCle, l.client.locataireId, l.client.lotCle, l.motif,
            l.externe?.sorte ?? null, l.externe?.syndicId ?? null, l.externe?.syndicContactId ?? null,
            l.externe?.coproprieteContactId ?? null]);
      }
      await query(
        `UPDATE gestion_envoi SET parties_appliquees_le = now(), parties_message_id = $2 WHERE id = $1`,
        [Number(e.id), Number(e.message_id)]);
      faits += 1;
    }
    return faits;
  } catch (e) {
    // 🔴 JAMAIS UNE PASSE DE RELÈVE EN ÉCHEC POUR ÇA : c'est une comptabilité en retard, pas du courrier perdu.
    console.error('[gestion/envoiParties] application impossible', e);
    return 0;
  }
}
