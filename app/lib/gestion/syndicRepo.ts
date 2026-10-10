import { query, withTransaction, type RequeteTx } from '../db/client';
import { normaliserTexte } from './annuaire';
import type { Auteur } from './gestes';
import {
  cleImmeuble, type FicheSyndic, type ImmeubleConnu, type LotDeCopropriete, type SyndicResume, type SyndicSaisi,
} from './syndics';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 2 — LE DÉPÔT DE L'ANNUAIRE DES SYNDICS ══════════════════════
 *
 * Lit et écrit les cinq tables de la migration 324. Les règles (validation, aperçu) vivent dans `syndics.ts`.
 *
 * 🔴 UNE SEULE PORTE D'ÉCRITURE : `enregistrerSyndic`. Créer, modifier, ajouter ou retirer une copropriété,
 * ajouter ou retirer un contact — tout passe par elle, dans UNE transaction. Deux chemins pour la même écriture
 * finiraient par diverger, et c'est celui qu'on regarde le moins qui garderait l'erreur.
 *
 * 🔴 RIEN N'EST EFFACÉ. Un immeuble retiré, ou repris par un autre syndic, FERME son lien (`fin`) ; un contact ou
 * une coordonnée retirés reçoivent `retire_le`. Aucun DELETE dans ce module.
 *
 * ⚠️ LE LIEN LOT ↔ COPROPRIÉTÉ SE CALCULE ICI, en JavaScript, par `normaliserTexte` — la MÊME fonction que celle qui
 * écrit la clé. Le refaire en SQL donnerait deux normalisations, et un jour deux réponses. À cette échelle
 * (365 lots), lire la colonne entière coûte une requête de quelques millisecondes.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `contactExterneRepo.ts`).
 */

/** La migration 324 est-elle appliquée ? Sans elle, l'écran le dit et n'offre aucun geste. */
export async function syndicsDisponibles(): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT to_regclass('public.gestion_syndic_coordonnee') IS NOT NULL AS ok`);
  return rows[0]?.ok === true;
}

/** Les lots de l'annuaire, groupés par la clé de leur immeuble. */
async function lotsParImmeuble(): Promise<Map<string, { libelle: string; lots: LotDeCopropriete[] }>> {
  const { rows } = await query<{ id: string; numero: string; immeuble: string | null; adresse: string | null; commune: string | null }>(
    `SELECT id::text, wippimmo_id AS numero, immeuble, adresse, commune
       FROM gestion_annuaire_lot
      WHERE absent_le IS NULL
      ORDER BY immeuble, wippimmo_id`);
  const m = new Map<string, { libelle: string; lots: LotDeCopropriete[] }>();
  for (const r of rows) {
    const cle = cleImmeuble(r.immeuble);
    if (cle === '') continue;
    const g = m.get(cle) ?? { libelle: (r.immeuble ?? '').trim(), lots: [] };
    g.lots.push({ id: Number(r.id), numero: r.numero, adresse: r.adresse, commune: r.commune });
    m.set(cle, g);
  }
  return m;
}

/**
 * TOUS LES IMMEUBLES CONNUS — ceux de l'annuaire (avec leurs lots) et ceux déjà déclarés comme copropriété —
 * avec leur syndic EN COURS. Sert à la fois au bouton de la carte bien, à l'auto-complétion et à l'aperçu.
 */
export async function immeublesConnus(): Promise<ImmeubleConnu[]> {
  const parCle = await lotsParImmeuble();
  const { rows } = await query<{ cle: string; libelle: string; syndic_id: string | null; syndic_nom: string | null }>(
    `SELECT c.cle_immeuble AS cle, c.libelle, s.id::text AS syndic_id, s.nom AS syndic_nom
       FROM gestion_copropriete c
       LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
       LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id`);
  const syndicDe = new Map(rows.map((r) => [r.cle, r]));
  const out: ImmeubleConnu[] = [];
  for (const [cle, g] of parCle) {
    const s = syndicDe.get(cle);
    out.push({
      cle, libelle: g.libelle, lots: g.lots,
      syndic: s?.syndic_id ? { id: Number(s.syndic_id), nom: s.syndic_nom ?? '' } : null,
    });
  }
  // Les copropriétés déclarées sans lot dans l'annuaire (saisies à la main) : elles existent aussi.
  for (const r of rows) {
    if (parCle.has(r.cle)) continue;
    out.push({
      cle: r.cle, libelle: r.libelle, lots: [],
      syndic: r.syndic_id ? { id: Number(r.syndic_id), nom: r.syndic_nom ?? '' } : null,
    });
  }
  return out.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/** La liste des syndics : nom, nombre de copropriétés en cours, nombre de biens, et de quoi chercher. */
export async function listerSyndics(): Promise<SyndicResume[]> {
  const parCle = await lotsParImmeuble();
  const { rows } = await query<{
    id: string; nom: string; email: string | null; telephone: string | null; cles: string[] | null; emails: string[] | null;
  }>(
    `SELECT s.id::text, s.nom, s.email, s.telephone,
            (SELECT array_agg(c.cle_immeuble) FROM gestion_copropriete_syndic cs
               JOIN gestion_copropriete c ON c.id = cs.copropriete_id
              WHERE cs.syndic_id = s.id AND cs.fin IS NULL) AS cles,
            (SELECT array_agg(k.valeur) FROM gestion_syndic_contact ct
               JOIN gestion_syndic_coordonnee k ON k.contact_id = ct.id AND k.retire_le IS NULL
              WHERE ct.syndic_id = s.id AND ct.retire_le IS NULL AND k.sorte = 'email') AS emails
       FROM gestion_syndic s
      ORDER BY lower(s.nom), s.id`);
  return rows.map((r) => {
    const cles = r.cles ?? [];
    const nbBiens = cles.reduce((n, c) => n + (parCle.get(c)?.lots.length ?? 0), 0);
    const emails = [r.email ?? '', ...(r.emails ?? [])].filter((x) => x !== '');
    const domaines = emails.map((e) => e.split('@')[1] ?? '');
    return {
      id: Number(r.id), nom: r.nom, email: r.email, telephone: r.telephone,
      nbCoproprietes: cles.length, nbBiens,
      cherchable: normaliserTexte([r.nom, ...emails, ...domaines].join(' ')),
    };
  });
}

/** La fiche complète d'un syndic, ou `null`. */
export async function ficheSyndic(id: number): Promise<FicheSyndic | null> {
  const { rows } = await query<{
    id: string; nom: string; adresse: string | null; telephone: string | null; email: string | null; note: string | null;
    cree_le: string; cree_par_libelle: string; maj_le: string | null; maj_par_libelle: string | null;
  }>(
    `SELECT id::text, nom, adresse, telephone, email, note, cree_le::text, cree_par_libelle, maj_le::text, maj_par_libelle
       FROM gestion_syndic WHERE id = $1`, [id]);
  const s = rows[0];
  if (s === undefined) return null;

  const { rows: contacts } = await query<{ id: string; titre: string | null; prenom: string | null; nom: string | null }>(
    `SELECT id::text, titre, prenom, nom FROM gestion_syndic_contact
      WHERE syndic_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [id]);
  const { rows: coords } = await query<{ id: string; contact_id: string; sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }>(
    `SELECT k.id::text, k.contact_id::text, k.sorte, k.libelle, k.valeur
       FROM gestion_syndic_coordonnee k JOIN gestion_syndic_contact c ON c.id = k.contact_id
      WHERE c.syndic_id = $1 AND c.retire_le IS NULL AND k.retire_le IS NULL ORDER BY k.rang, k.id`, [id]);
  const { rows: liens } = await query<{
    id: string; cle: string; libelle: string; debut: string; fin: string | null; fin_motif: string | null;
  }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, cs.debut::text, cs.fin::text, cs.fin_motif
       FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id
      WHERE cs.syndic_id = $1 ORDER BY cs.fin IS NOT NULL, c.libelle, cs.debut DESC`, [id]);
  const parCle = await lotsParImmeuble();

  return {
    id: Number(s.id), nom: s.nom, adresse: s.adresse, telephone: s.telephone, email: s.email, note: s.note,
    creeLe: s.cree_le, creeParLibelle: s.cree_par_libelle, majLe: s.maj_le, majParLibelle: s.maj_par_libelle,
    contacts: contacts.map((c) => ({
      id: Number(c.id), titre: c.titre, prenom: c.prenom, nom: c.nom,
      coordonnees: coords.filter((k) => k.contact_id === c.id)
        .map((k) => ({ id: Number(k.id), sorte: k.sorte, libelle: k.libelle, valeur: k.valeur })),
    })),
    coproprietes: liens.filter((l) => l.fin === null).map((l) => ({
      id: Number(l.id), cle: l.cle, libelle: l.libelle, debut: l.debut, lots: parCle.get(l.cle)?.lots ?? [],
    })),
    historique: liens.filter((l) => l.fin !== null)
      .map((l) => ({ libelle: l.libelle, debut: l.debut, fin: l.fin as string, motif: l.fin_motif })),
  };
}

const nul = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/**
 * 🔴 LA SEULE PORTE D'ÉCRITURE. `id === null` ⇒ création. Rend l'identifiant du syndic.
 *
 * Dans UNE transaction :
 *   ① le syndic (insertion, ou mise à jour avec auteur et date) ;
 *   ② les contacts : ceux qui portent un identifiant DE CE SYNDIC sont mis à jour, les nouveaux insérés, les
 *      absents de la saisie RETIRÉS (`retire_le`) ; même règle pour leurs coordonnées ;
 *   ③ les copropriétés : chaque immeuble saisi est déclaré (s'il ne l'est pas) ; s'il est géré par un AUTRE syndic,
 *      ce lien-là est FERMÉ (« changement de syndic ») avant d'ouvrir le nouveau ; les immeubles de ce syndic
 *      absents de la saisie sont FERMÉS (« retrait »). Jamais d'effacement.
 *
 * ⚠️ LES REFUS SE DÉCIDENT AVANT TOUTE ÉCRITURE (syndic inexistant) — `withTransaction` COMMIT au retour normal, et
 * un refus rendu après un UPDATE écrirait quand même (piège consigné du dépôt).
 */
export async function enregistrerSyndic(id: number | null, saisie: SyndicSaisi, auteur: Auteur):
Promise<{ ok: true; id: number } | { ok: false; motif: string }> {
  return withTransaction(async (q) => {
    let syndicId: number;
    if (id === null) {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_syndic (nom, adresse, telephone, email, note, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
        [saisie.nom, nul(saisie.adresse), nul(saisie.telephone), nul(saisie.email), nul(saisie.note), auteur.id, auteur.libelle]);
      syndicId = Number(rows[0]?.id);
    } else {
      const { rows: existe } = await q<{ id: string }>(`SELECT id::text FROM gestion_syndic WHERE id = $1 FOR UPDATE`, [id]);
      if (existe.length === 0) return { ok: false, motif: 'Ce syndic n’existe pas.' };
      syndicId = id;
      await q(
        `UPDATE gestion_syndic SET nom = $2, adresse = $3, telephone = $4, email = $5, note = $6,
                maj_le = now(), maj_par = $7, maj_par_libelle = $8
          WHERE id = $1`,
        [syndicId, saisie.nom, nul(saisie.adresse), nul(saisie.telephone), nul(saisie.email), nul(saisie.note), auteur.id, auteur.libelle]);
    }

    await enregistrerContacts(q, syndicId, saisie, auteur);
    await enregistrerCoproprietes(q, syndicId, saisie, auteur);
    return { ok: true, id: syndicId };
  });
}

async function enregistrerContacts(q: RequeteTx, syndicId: number, saisie: SyndicSaisi, auteur: Auteur): Promise<void> {
  const { rows: existants } = await q<{ id: string }>(
    `SELECT id::text FROM gestion_syndic_contact WHERE syndic_id = $1 AND retire_le IS NULL FOR UPDATE`, [syndicId]);
  const ids = new Set(existants.map((r) => Number(r.id)));
  const gardes = new Set<number>();
  for (const [rang, c] of saisie.contacts.entries()) {
    let contactId: number;
    if (c.id != null && ids.has(c.id)) {
      contactId = c.id;
      gardes.add(contactId);
      await q(
        `UPDATE gestion_syndic_contact SET titre = $2, prenom = $3, nom = $4, rang = $5, maj_le = now(), maj_par_libelle = $6
          WHERE id = $1`, [contactId, nul(c.titre), nul(c.prenom), nul(c.nom), rang, auteur.libelle]);
    } else {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_syndic_contact (syndic_id, titre, prenom, nom, rang, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
        [syndicId, nul(c.titre), nul(c.prenom), nul(c.nom), rang, auteur.libelle]);
      contactId = Number(rows[0]?.id);
    }
    // Les coordonnées de ce contact : même règle (mise à jour / insertion / retrait).
    const { rows: kx } = await q<{ id: string }>(
      `SELECT id::text FROM gestion_syndic_coordonnee WHERE contact_id = $1 AND retire_le IS NULL`, [contactId]);
    const kIds = new Set(kx.map((r) => Number(r.id)));
    const kGardes = new Set<number>();
    for (const [kr, k] of c.coordonnees.entries()) {
      if (k.id != null && kIds.has(k.id)) {
        kGardes.add(k.id);
        await q(`UPDATE gestion_syndic_coordonnee SET sorte = $2, libelle = $3, valeur = $4, rang = $5 WHERE id = $1`,
          [k.id, k.sorte, nul(k.libelle), k.valeur, kr]);
      } else {
        await q(`INSERT INTO gestion_syndic_coordonnee (contact_id, sorte, libelle, valeur, rang) VALUES ($1, $2, $3, $4, $5)`,
          [contactId, k.sorte, nul(k.libelle), k.valeur, kr]);
      }
    }
    const kRetires = [...kIds].filter((x) => !kGardes.has(x));
    if (kRetires.length > 0) {
      await q(`UPDATE gestion_syndic_coordonnee SET retire_le = now() WHERE id = ANY($1::bigint[])`, [kRetires]);
    }
  }
  const retires = [...ids].filter((x) => !gardes.has(x));
  if (retires.length > 0) {
    await q(`UPDATE gestion_syndic_contact SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])`,
      [retires, auteur.libelle]);
  }
}

async function enregistrerCoproprietes(q: RequeteTx, syndicId: number, saisie: SyndicSaisi, auteur: Auteur): Promise<void> {
  const voulues = new Map(saisie.immeubles.map((l) => [cleImmeuble(l), l]));
  // ① déclarer les immeubles qui ne le sont pas encore (le libellé du premier qui l'a déclaré est gardé).
  for (const [cle, libelle] of voulues) {
    await q(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4) ON CONFLICT (cle_immeuble) DO NOTHING`, [cle, libelle, auteur.id, auteur.libelle]);
  }
  // ② les liens EN COURS des immeubles voulus, et ceux de ce syndic — verrouillés avant d'écrire.
  const { rows: enCours } = await q<{ lien_id: string; copro_id: string; cle: string; syndic_id: string }>(
    `SELECT cs.id::text AS lien_id, c.id::text AS copro_id, c.cle_immeuble AS cle, cs.syndic_id::text
       FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id
      WHERE cs.fin IS NULL AND (c.cle_immeuble = ANY($1::text[]) OR cs.syndic_id = $2)
      FOR UPDATE OF cs`, [[...voulues.keys()], syndicId]);
  for (const l of enCours) {
    const voulu = voulues.has(l.cle);
    const aMoi = Number(l.syndic_id) === syndicId;
    if (aMoi && voulu) continue;
    // Repris par ce syndic (changement), ou retiré de ce syndic (retrait) : on FERME, on n'efface pas.
    await q(
      `UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = $4 WHERE id = $1`,
      [l.lien_id, auteur.id, auteur.libelle, aMoi ? 'retrait' : 'changement de syndic']);
  }
  // ③ ouvrir les liens qui manquent.
  const dejaAMoi = new Set(enCours.filter((l) => Number(l.syndic_id) === syndicId && voulues.has(l.cle)).map((l) => l.cle));
  for (const cle of voulues.keys()) {
    if (dejaAMoi.has(cle)) continue;
    await q(
      `INSERT INTO gestion_copropriete_syndic (copropriete_id, syndic_id, pose_par, pose_par_libelle)
       SELECT id, $2, $3, $4 FROM gestion_copropriete WHERE cle_immeuble = $1`,
      [cle, syndicId, auteur.id, auteur.libelle]);
  }
}
