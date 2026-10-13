import { query } from '../db/client';
import { cleImmeuble, cleEmail, cleTelephone } from './syndics';
import { sqlLiensDuBien } from './rattachement';
import { ACTION_PERIODE_CONTACT, norme, periodesEnPoste } from './reintegrationContact';
import { estAdresseInterne } from './adresseInterne';
import { syndicLocalDisponible } from './schema';
import { biensRangesSyndicLocal } from './partieCategorieRepo';
import {
  reconnaitreSyndical, ROLE_SYNDIC_A_LA_MAIN, roleCabinet, roleContactSyndic, roleImmeuble, syndicauxDesAdresses, type PersonneSyndicale,
  type SyndicalDeLAdresse,
} from './partiesSyndic';

/**
 * ══ 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — LES PERSONNES DE LA FICHE SYNDIC D'UN BIEN. LECTURE SEULE. ═══════════════
 *
 * Pour chaque bien (clé WIPPIMMO, celle des rattachements) : les copropriétés liées à son adresse — l'adresse
 * principale de la copropriété OU l'une de ses adresses secondaires en cours —, leur syndic EN COURS (cabinet :
 * e-mail générique, standard, 2ᵉ standard), les contacts de ce syndic qui couvrent cette copropriété (« tous les
 * immeubles » ou affectés), y compris ceux qui « ne travaillent plus ici » avec les coordonnées qu'ils avaient au
 * départ, et le carnet de l'immeuble.
 *
 * ⚠️ LE LIEN LOT ↔ COPROPRIÉTÉ SE CALCULE EN JAVASCRIPT, par `cleImmeuble` — la MÊME fonction que celle qui écrit la
 * clé (règle de `syndicRepo.ts`). Le refaire en SQL donnerait deux normalisations.
 *
 * 🔒 AUCUNE ÉCRITURE. ⚠️ PAS DE `import 'server-only'` ICI — convention du module (scripts `tsx`).
 */

interface Copro { id: number; cle: string }

/** Les copropriétés connues, chacune avec toutes ses clés d'adresse (principale + secondaires en cours). */
async function clesDesCoproprietes(): Promise<Map<string, number[]>> {
  const { rows } = await query<{ id: string; cle: string }>(
    `SELECT c.id::text, c.cle_immeuble AS cle FROM gestion_copropriete c
     UNION ALL
     SELECT a.copropriete_id::text, a.cle_immeuble FROM gestion_copropriete_adresse a WHERE a.retire_le IS NULL`);
  const m = new Map<string, number[]>();
  for (const r of rows) {
    const k = cleImmeuble(r.cle);
    if (k === '') continue;
    const ids = m.get(k) ?? [];
    if (!ids.includes(Number(r.id))) ids.push(Number(r.id));
    m.set(k, ids);
  }
  return m;
}

/** Les copropriétés de chaque bien demandé (clé WIPPIMMO → identifiants de copropriété). */
async function coproprietesDesBiens(lotCles: readonly string[]): Promise<Map<string, Copro[]>> {
  const out = new Map<string, Copro[]>();
  if (lotCles.length === 0) return out;
  const { rows } = await query<{ cle: string; immeuble: string | null; adresse: string | null }>(
    `SELECT lo.wippimmo_id AS cle, lo.immeuble, lo.adresse FROM gestion_annuaire_lot lo
      WHERE lo.wippimmo_id = ANY($1::text[])`, [[...lotCles]]);
  const parCle = await clesDesCoproprietes();
  for (const r of rows) {
    const vus = new Set<number>();
    const copros: Copro[] = [];
    for (const adr of [r.immeuble, r.adresse]) {
      const k = cleImmeuble(adr);
      for (const id of parCle.get(k) ?? []) if (!vus.has(id)) { vus.add(id); copros.push({ id, cle: k }); }
    }
    out.set(r.cle, copros);
  }
  return out;
}

/**
 * LES PERSONNES SYNDICALES DE PLUSIEURS BIENS, en une passe (clé WIPPIMMO → personnes). LECTURE SEULE.
 * Un bien sans copropriété connue rend une liste vide.
 */
export async function personnesSyndicalesDesBiens(lotCles: readonly string[]): Promise<Map<string, PersonneSyndicale[]>> {
  const cles = [...new Set(lotCles.map((c) => c.trim()).filter((c) => c !== ''))];
  const coprosDe = await coproprietesDesBiens(cles);
  const toutes = [...new Set([...coprosDe.values()].flat().map((c) => c.id))];
  const out = new Map<string, PersonneSyndicale[]>(cles.map((c) => [c, []]));
  if (toutes.length === 0) return out;

  const [{ rows: cabinets }, { rows: contacts }, { rows: immeuble }] = await Promise.all([
    query<{ copro: string; nom: string; email: string | null; telephone: string | null; telephone_2: string | null }>(
      `SELECT cs.copropriete_id::text AS copro, s.nom, s.email, s.telephone, s.telephone_2
         FROM gestion_copropriete_syndic cs JOIN gestion_syndic s ON s.id = cs.syndic_id
        WHERE cs.copropriete_id = ANY($1::bigint[]) AND cs.fin IS NULL AND s.supprime_le IS NULL`, [toutes]),
    query<{
      copro: string; id: string; titre: string | null; civilite: string | null; prenom: string | null; nom: string | null;
      parti_le: string | null; coordonnees: Array<{ sorte: string; valeur: string; retire_le: string | null }> | null;
      retours: Array<{ depart: string; retour: string }> | null;
    }>(
      `SELECT cs.copropriete_id::text AS copro, ct.id::text, ct.titre, ct.civilite, ct.prenom, ct.nom,
              ct.parti_le::text AS parti_le,
              (SELECT json_agg(json_build_object('depart', j.valeur_avant, 'retour', j.valeur_apres))
                 FROM gestion_journal j
                WHERE j.entite = 'annuaire' AND j.entite_id = ct.id AND j.action = '${ACTION_PERIODE_CONTACT}') AS retours,
              (SELECT json_agg(json_build_object('sorte', k.sorte, 'valeur', k.valeur, 'retire_le', k.retire_le))
                 FROM gestion_syndic_coordonnee k
                WHERE k.contact_id = ct.id
                  AND (k.retire_le IS NULL OR (ct.parti_le IS NOT NULL AND k.retire_le = ct.parti_le)
                       OR k.retire_le IN (SELECT j.valeur_avant::timestamptz FROM gestion_journal j
                                           WHERE j.entite = 'annuaire' AND j.entite_id = ct.id
                                             AND j.action = '${ACTION_PERIODE_CONTACT}'))) AS coordonnees
         FROM gestion_copropriete_syndic cs
         JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
         JOIN gestion_syndic_contact ct ON ct.syndic_id = s.id AND ct.retire_le IS NULL
        WHERE cs.copropriete_id = ANY($1::bigint[]) AND cs.fin IS NULL
          AND (ct.tous_immeubles
               OR EXISTS (SELECT 1 FROM gestion_syndic_contact_copropriete a
                           WHERE a.contact_id = ct.id AND a.copropriete_id = cs.copropriete_id
                             AND (a.retire_le IS NULL OR (ct.parti_le IS NOT NULL AND a.retire_le = ct.parti_le)
                                  OR a.retire_le IN (SELECT j.valeur_avant::timestamptz FROM gestion_journal j
                                                      WHERE j.entite = 'annuaire' AND j.entite_id = ct.id
                                                        AND j.action = '${ACTION_PERIODE_CONTACT}'))))`,
      [toutes]),
    query<{
      copro: string; categorie: string; libelle: string | null; civilite: string | null; prenom: string | null;
      nom: string | null; coordonnees: Array<{ sorte: string; valeur: string }> | null;
    }>(
      `SELECT ct.copropriete_id::text AS copro, ct.categorie, ct.libelle, ct.civilite, ct.prenom, ct.nom,
              (SELECT json_agg(json_build_object('sorte', k.sorte, 'valeur', k.valeur))
                 FROM gestion_copropriete_contact_coordonnee k
                WHERE k.contact_id = ct.id AND k.retire_le IS NULL) AS coordonnees
         FROM gestion_copropriete_contact ct
        WHERE ct.copropriete_id = ANY($1::bigint[]) AND ct.retire_le IS NULL`, [toutes]),
  ]);

  const nomDe = (civ: string | null, prenom: string | null, nom: string | null): string =>
    [civ, prenom, (nom ?? '').toLocaleUpperCase('fr')].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ');
  const coords = (l: Array<{ sorte: string; valeur: string }> | null, sorte: 'email' | 'telephone'): string[] =>
    (l ?? []).filter((k) => k.sorte === sorte)
      .map((k) => (sorte === 'email' ? cleEmail(k.valeur) : cleTelephone(k.valeur)))
      .filter((k) => k !== '');

  const parCopro = new Map<number, PersonneSyndicale[]>();
  const poser = (copro: string, p: PersonneSyndicale): void => {
    if (p.emails.length === 0 && p.telephones.length === 0) return;
    const id = Number(copro);
    parCopro.set(id, [...(parCopro.get(id) ?? []), p]);
  };
  for (const c of cabinets) {
    poser(c.copro, {
      sorte: 'cabinet', role: roleCabinet(c.nom), nom: c.nom.trim(),
      emails: [cleEmail(c.email)].filter((k) => k !== ''),
      telephones: [cleTelephone(c.telephone), cleTelephone(c.telephone_2)].filter((k) => k !== ''),
      partiLe: null,
    });
  }
  for (const c of contacts) {
    const commun = { sorte: 'contact_syndic' as const, role: roleContactSyndic(c.titre), nom: nomDe(c.civilite, c.prenom, c.nom) };
    if ((c.retours ?? []).length === 0) {
      poser(c.copro, { ...commun, emails: coords(c.coordonnees, 'email'), telephones: coords(c.coordonnees, 'telephone'), partiLe: c.parti_le });
      continue;
    }
    /**
     * 🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — PARTI PUIS REVENU : UNE ENTRÉE PAR PÉRIODE, chacune avec
     * les coordonnées QU'ELLE avait (retirées au départ qui la clôt ; en cours pour la dernière). Reconnue pendant
     * chaque période en poste, pas entre les deux — et un ancien e-mail ne désigne pas la personne après son départ.
     */
    const periodes = periodesEnPoste(c.retours ?? [], c.parti_le);
    const memeInstant = (a: string | null, b: string | null): boolean =>
      a !== null && b !== null && Date.parse(norme(a)) === Date.parse(norme(b));
    for (const per of periodes) {
      const siennes = (c.coordonnees ?? []).filter((k) => (per.au === null ? k.retire_le === null : memeInstant(k.retire_le, per.au)));
      poser(c.copro, { ...commun, emails: coords(siennes, 'email'), telephones: coords(siennes, 'telephone'),
        partiLe: c.parti_le, periodes: [per] });
    }
  }
  for (const c of immeuble) {
    poser(c.copro, {
      sorte: 'immeuble', role: roleImmeuble(c.categorie, c.libelle), nom: nomDe(c.civilite, c.prenom, c.nom),
      emails: coords(c.coordonnees, 'email'), telephones: coords(c.coordonnees, 'telephone'),
      partiLe: null,
    });
  }
  for (const [lot, copros] of coprosDe) {
    out.set(lot, copros.flatMap((c) => parCopro.get(c.id) ?? []));
  }
  return out;
}

/** Les personnes syndicales d'UN bien. LECTURE SEULE. */
export async function personnesSyndicalesDuBien(lotCle: string): Promise<PersonneSyndicale[]> {
  return (await personnesSyndicalesDesBiens([lotCle])).get(lotCle.trim()) ?? [];
}

/**
 * LES ADRESSES D'UN BIEN QUE LA FICHE SYNDIC RECONNAÎT, avec leur rôle. LECTURE SEULE.
 *
 * Les adresses sont celles des mails de l'historique du bien (`sqlLiensDuBien`, le fragment unique), hors des
 * nôtres, chacune avec la date de son PREMIER mail sur ce bien ; `telephones` (adresse → téléphone de signature)
 * permet la reconnaissance par le numéro quand l'e-mail ne dit rien.
 */
export async function syndicauxDuBien(
  lotCle: string,
  telephones: ReadonlyMap<string, string | null> = new Map(),
): Promise<Array<{ adresse: string } & SyndicalDeLAdresse>> {
  const lot = lotCle.trim();
  if (lot === '') return [];
  const personnes = await personnesSyndicalesDuBien(lot);
  if (personnes.length === 0) return [];
  const { rows } = await query<{ adresse: string; premier: string | null }>(
    `SELECT lower(btrim(a.adresse)) AS adresse, min(m.recu_le)::text AS premier
       FROM gestion_rattachement r
       JOIN gestion_message_adresse a ON a.message_id = r.message_id
       JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_cle = $1 AND ${sqlLiensDuBien('r')} AND NOT a.interne
      GROUP BY 1`, [lot]);
  return syndicauxDesAdresses(personnes, rows.map((r) => ({
    adresse: r.adresse, premierMail: r.premier, telephone: telephones.get(r.adresse) ?? null,
  })));
}

/**
 * ══ 🔴🔴 LE CARTOUCHE EXPÉDITEUR — L'EXPÉDITEUR D'UN MAIL EST-IL LE SYNDIC (OU L'IMMEUBLE) DE CES BIENS ? ═══════════
 *
 * Pour chaque bien demandé (clé WIPPIMMO) : le rôle et le nom que la fiche syndic donne à l'adresse De: de ce mail, À
 * LA DATE DU MAIL (un contact parti ne compte plus pour ses mails postérieurs). Un bien que rien ne relie à
 * l'expéditeur n'est pas dans la réponse. Le mail est désigné par son identifiant : aucune adresse ne voyage dans
 * une chaîne de requête. LECTURE SEULE.
 */
export async function expediteurSyndicalDesBiens(
  messageId: number, lotCles: readonly string[],
): Promise<Record<string, { role: string; nom: string }>> {
  const out: Record<string, { role: string; nom: string }> = {};
  if (lotCles.length === 0) return out;
  /* L'adresse De: telle que la fenêtre de rattachement la lit (`m.de_adresse`, cf. `ficheRattachementRepo`). */
  const { rows } = await query<{ adresse: string | null; recu_le: string | null }>(
    `SELECT lower(btrim(m.de_adresse)) AS adresse, m.recu_le::text AS recu_le
       FROM gestion_message m WHERE m.id = $1`, [messageId]);
  const de = rows[0];
  if (de === undefined || (de.adresse ?? '') === '' || estAdresseInterne(de.adresse ?? '')) return out;
  const personnes = await personnesSyndicalesDesBiens(lotCles);
  for (const [cle, liste] of personnes) {
    const r = reconnaitreSyndical(liste, { email: de.adresse }, de.recu_le);
    if (r !== null) out[cle] = { role: r.role, nom: r.nom };
  }
  /**
   * ══ 🔴🔴 LOT GLISSER-DEPOSER-ENTRE-TOUTES-LES-FAMILLES-DES-PARTIES — LE CLASSEMENT LOCAL, BIEN PAR BIEN ═══════════════
   * Une adresse rangée À LA MAIN en « Syndic & immeuble » sur un bien (migration 344) y prend le rose du cartouche,
   * sur CE bien seulement : la ligne est lue pour chaque bien demandé, jamais ailleurs. La fiche syndic, quand elle
   * reconnaît l'adresse, garde la main (son rôle est plus précis). Lecture seule.
   */
  const restants = lotCles.filter((c) => out[c] === undefined);
  if (restants.length > 0 && (await syndicLocalDisponible())) {
    const locaux = await biensRangesSyndicLocal(de.adresse ?? '', restants);
    if (locaux.length > 0) {
      const { rows: n } = await query<{ nom: string | null }>(`SELECT m.de_nom AS nom FROM gestion_message m WHERE m.id = $1`, [messageId]);
      const nom = (n[0]?.nom ?? '').trim() || (de.adresse ?? '');
      for (const l of locaux) out[l] = { role: ROLE_SYNDIC_A_LA_MAIN, nom };
    }
  }
  return out;
}
