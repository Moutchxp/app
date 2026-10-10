import { query, withTransaction, type RequeteTx } from '../db/client';
import { normaliserTexte } from './annuaire';
import type { Auteur } from './gestes';
import {
  cleImmeuble, communeLisible, type AdresseBan, type FicheSyndic, type ImmeubleConnu, type LotDeCopropriete,
  type SyndicResume, type SyndicSaisi,
} from './syndics';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN, COMMIT 2 — LE DÉPÔT DE L'ANNUAIRE DES SYNDICS ══════════════════════
 * (complété au lot FICHE-SYNDIC-FINITIONS : code postal et ville, 2ᵉ standard, suppression, BAN locale.)
 *
 * Lit et écrit les tables des migrations 324 et 325. Les règles (validation, aperçu) vivent dans `syndics.ts`.
 *
 * 🔴 DEUX PORTES D'ÉCRITURE, ET DEUX SEULEMENT : `enregistrerSyndic` (créer, modifier, rattacher ou retirer une
 * copropriété, un contact, une coordonnée) et `supprimerSyndic`. Chacune tient dans UNE transaction.
 *
 * 🔴 RIEN N'EST EFFACÉ. Un immeuble retiré, ou repris par un autre syndic, FERME son lien (`fin`) ; un contact ou
 * une coordonnée retirés reçoivent `retire_le` ; un syndic supprimé reçoit `supprime_le` et sort des listes.
 * Aucun DELETE dans ce module.
 *
 * ⚠️ LE LIEN LOT ↔ COPROPRIÉTÉ SE CALCULE ICI, en JavaScript, par `normaliserTexte` — la MÊME fonction que celle qui
 * écrit la clé. Le refaire en SQL donnerait deux normalisations, et un jour deux réponses. À cette échelle
 * (365 lots), lire la colonne entière coûte une requête de quelques millisecondes.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `contactExterneRepo.ts`).
 */

/** Les migrations 324 ET 325 sont-elles appliquées ? Sans elles, l'écran le dit et n'offre aucun geste. */
export async function syndicsDisponibles(): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT to_regclass('public.gestion_syndic_coordonnee') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'gestion_syndic' AND column_name = 'supprime_le') AS ok`);
  return rows[0]?.ok === true;
}

interface GroupeImmeuble { libelle: string; codePostal: string | null; commune: string | null; lots: LotDeCopropriete[] }

/** Les lots de l'annuaire, groupés par la clé de leur immeuble — avec le code postal et la commune de leurs lots. */
async function lotsParImmeuble(): Promise<Map<string, GroupeImmeuble>> {
  const { rows } = await query<{
    id: string; numero: string; immeuble: string | null; adresse: string | null; commune: string | null; code_postal: string | null;
  }>(
    `SELECT id::text, wippimmo_id AS numero, immeuble, adresse, commune, code_postal
       FROM gestion_annuaire_lot
      WHERE absent_le IS NULL
      ORDER BY immeuble, wippimmo_id`);
  const m = new Map<string, GroupeImmeuble>();
  for (const r of rows) {
    const cle = cleImmeuble(r.immeuble);
    if (cle === '') continue;
    const g = m.get(cle) ?? { libelle: (r.immeuble ?? '').trim(), codePostal: null, commune: null, lots: [] };
    // Le premier lot qui connaît son code postal et sa commune les donne à l'immeuble.
    if (g.codePostal === null && (r.code_postal ?? '').trim() !== '') g.codePostal = (r.code_postal ?? '').trim();
    if (g.commune === null && (r.commune ?? '').trim() !== '') g.commune = communeLisible(r.commune);
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
  const { rows } = await query<{
    cle: string; libelle: string; code_postal: string | null; commune: string | null;
    syndic_id: string | null; syndic_nom: string | null;
  }>(
    `SELECT c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, s.id::text AS syndic_id, s.nom AS syndic_nom
       FROM gestion_copropriete c
       LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
       LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL`);
  const syndicDe = new Map(rows.map((r) => [r.cle, r]));
  const out: ImmeubleConnu[] = [];
  for (const [cle, g] of parCle) {
    const s = syndicDe.get(cle);
    out.push({
      cle, libelle: g.libelle, codePostal: g.codePostal ?? s?.code_postal ?? null, commune: g.commune ?? s?.commune ?? null,
      lots: g.lots, syndic: s?.syndic_id ? { id: Number(s.syndic_id), nom: s.syndic_nom ?? '' } : null,
    });
  }
  // Les copropriétés déclarées sans lot dans l'annuaire (BAN, ou saisies à la main) : elles existent aussi.
  for (const r of rows) {
    if (parCle.has(r.cle)) continue;
    out.push({
      cle: r.cle, libelle: r.libelle, codePostal: r.code_postal, commune: r.commune, lots: [],
      syndic: r.syndic_id ? { id: Number(r.syndic_id), nom: r.syndic_nom ?? '' } : null,
    });
  }
  return out.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/** La liste des syndics (non supprimés) : nom, nombre de copropriétés en cours, nombre de biens, et de quoi chercher. */
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
      WHERE s.supprime_le IS NULL
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

/** La fiche complète d'un syndic, ou `null` (inconnu ou supprimé). */
export async function ficheSyndic(id: number): Promise<FicheSyndic | null> {
  const { rows } = await query<{
    id: string; nom: string; adresse: string | null; code_postal: string | null; ville: string | null;
    telephone: string | null; telephone_2: string | null; email: string | null; note: string | null;
    cree_le: string; cree_par_libelle: string; maj_le: string | null; maj_par_libelle: string | null;
  }>(
    `SELECT id::text, nom, adresse, code_postal, ville, telephone, telephone_2, email, note,
            cree_le::text, cree_par_libelle, maj_le::text, maj_par_libelle
       FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL`, [id]);
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
    id: string; cle: string; libelle: string; code_postal: string | null; commune: string | null;
    debut: string; fin: string | null; fin_motif: string | null;
  }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, cs.debut::text, cs.fin::text, cs.fin_motif
       FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id
      WHERE cs.syndic_id = $1 ORDER BY cs.fin IS NOT NULL, c.libelle, cs.debut DESC`, [id]);
  const parCle = await lotsParImmeuble();

  return {
    id: Number(s.id), nom: s.nom, adresse: s.adresse, codePostal: s.code_postal, ville: s.ville,
    telephone: s.telephone, telephone2: s.telephone_2, email: s.email, note: s.note,
    creeLe: s.cree_le, creeParLibelle: s.cree_par_libelle, majLe: s.maj_le, majParLibelle: s.maj_par_libelle,
    contacts: contacts.map((c) => ({
      id: Number(c.id), titre: c.titre, prenom: c.prenom, nom: c.nom,
      coordonnees: coords.filter((k) => k.contact_id === c.id)
        .map((k) => ({ id: Number(k.id), sorte: k.sorte, libelle: k.libelle, valeur: k.valeur })),
    })),
    coproprietes: liens.filter((l) => l.fin === null).map((l) => {
      const g = parCle.get(l.cle);
      return {
        id: Number(l.id), cle: l.cle, libelle: l.libelle, debut: l.debut, lots: g?.lots ?? [],
        codePostal: g?.codePostal ?? l.code_postal, commune: g?.commune ?? l.commune,
      };
    }),
    historique: liens.filter((l) => l.fin !== null)
      .map((l) => ({ libelle: l.libelle, debut: l.debut, fin: l.fin as string, motif: l.fin_motif })),
  };
}

const nul = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/**
 * 🔴 LA PORTE D'ÉCRITURE DE LA FICHE. `id === null` ⇒ création. Rend l'identifiant du syndic.
 *
 * Dans UNE transaction :
 *   ① le syndic (insertion, ou mise à jour avec auteur et date) ;
 *   ② les contacts : ceux qui portent un identifiant DE CE SYNDIC sont mis à jour, les nouveaux insérés, les
 *      absents de la saisie RETIRÉS (`retire_le`) ; même règle pour leurs coordonnées ;
 *   ③ les copropriétés : chaque immeuble saisi est déclaré (s'il ne l'est pas) ; s'il est géré par un AUTRE syndic,
 *      ce lien-là est FERMÉ (« changement de syndic ») avant d'ouvrir le nouveau ; les immeubles de ce syndic
 *      absents de la saisie sont FERMÉS (« retrait »). Jamais d'effacement.
 *
 * ⚠️ LES REFUS SE DÉCIDENT AVANT TOUTE ÉCRITURE (syndic inexistant ou supprimé) — `withTransaction` COMMIT au retour
 * normal, et un refus rendu après un UPDATE écrirait quand même (piège consigné du dépôt).
 */
export async function enregistrerSyndic(id: number | null, saisie: SyndicSaisi, auteur: Auteur):
Promise<{ ok: true; id: number } | { ok: false; motif: string }> {
  return withTransaction(async (q) => {
    let syndicId: number;
    const champs = [saisie.nom, nul(saisie.adresse), nul(saisie.codePostal), nul(saisie.ville),
      nul(saisie.telephone), nul(saisie.telephone2), nul(saisie.email), nul(saisie.note)];
    if (id === null) {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_syndic (nom, adresse, code_postal, ville, telephone, telephone_2, email, note,
                                     cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text`,
        [...champs, auteur.id, auteur.libelle]);
      syndicId = Number(rows[0]?.id);
    } else {
      const { rows: existe } = await q<{ id: string }>(
        `SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE`, [id]);
      if (existe.length === 0) return { ok: false, motif: 'Ce syndic n’existe pas.' };
      syndicId = id;
      await q(
        `UPDATE gestion_syndic SET nom = $2, adresse = $3, code_postal = $4, ville = $5, telephone = $6, telephone_2 = $7,
                email = $8, note = $9, maj_le = now(), maj_par = $10, maj_par_libelle = $11
          WHERE id = $1`,
        [syndicId, ...champs, auteur.id, auteur.libelle]);
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
  const voulues = new Map(saisie.immeubles.map((i) => [cleImmeuble(i.libelle), i]));
  // ① déclarer les immeubles qui ne le sont pas encore (le libellé du premier qui l'a déclaré est gardé) ; un code
  //    postal ou une commune connus complètent une copropriété qui n'en avait pas — jamais n'écrasent.
  for (const [cle, i] of voulues) {
    await q(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cle_immeuble) DO UPDATE
          SET code_postal = coalesce(gestion_copropriete.code_postal, EXCLUDED.code_postal),
              commune = coalesce(gestion_copropriete.commune, EXCLUDED.commune)`,
      [cle, i.libelle, nul(i.codePostal), nul(i.commune), auteur.id, auteur.libelle]);
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

/**
 * ══ 🔴 LOT FICHE-SYNDIC-FINITIONS — SUPPRIMER UN SYNDIC ═════════════════════════════════════════════════════════
 *
 * ARNO : « La suppression retire le syndic, ses contacts et ses liens de copropriété (les biens repassent en “Créer
 * le syndic”). Trace dans le journal (qui, quand). »
 *
 * Dans UNE transaction, et SANS DELETE : le syndic reçoit `supprime_le` (qui, quand) et sort de toutes les listes ;
 * ses contacts reçoivent `retire_le` ; ses liens de copropriété EN COURS sont FERMÉS (« suppression du syndic »).
 * Une ligne va dans `gestion_journal` (entité « annuaire », action « suppression_syndic ») avec le nom du cabinet
 * et le nombre de copropriétés et de biens qu'il gérait.
 *
 * ⚠️ Le refus (inconnu ou déjà supprimé) se décide AVANT toute écriture.
 */
export async function supprimerSyndic(id: number, auteur: Auteur):
Promise<{ ok: true; coproprietes: number } | { ok: false; motif: string }> {
  const parCle = await lotsParImmeuble();
  return withTransaction(async (q) => {
    const { rows } = await q<{ nom: string }>(
      `SELECT nom FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE`, [id]);
    const s = rows[0];
    if (s === undefined) return { ok: false, motif: 'Ce syndic n’existe pas ou a déjà été supprimé.' };
    const { rows: liens } = await q<{ id: string; cle: string }>(
      `SELECT cs.id::text, c.cle_immeuble AS cle FROM gestion_copropriete_syndic cs
         JOIN gestion_copropriete c ON c.id = cs.copropriete_id
        WHERE cs.syndic_id = $1 AND cs.fin IS NULL FOR UPDATE OF cs`, [id]);
    const nbBiens = liens.reduce((n, l) => n + (parCle.get(l.cle)?.lots.length ?? 0), 0);
    if (liens.length > 0) {
      await q(
        `UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'suppression du syndic'
          WHERE id = ANY($1::bigint[])`, [liens.map((l) => l.id), auteur.id, auteur.libelle]);
    }
    await q(`UPDATE gestion_syndic_contact SET retire_le = now(), retire_par_libelle = $2 WHERE syndic_id = $1 AND retire_le IS NULL`,
      [id, auteur.libelle]);
    await q(`UPDATE gestion_syndic SET supprime_le = now(), supprime_par = $2, supprime_par_libelle = $3 WHERE id = $1`,
      [id, auteur.id, auteur.libelle]);
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire', $1, 'suppression_syndic', $2, $3, $4, $5)`,
      [id, s.nom, `syndic supprimé — ${liens.length} copropriété(s), ${nbBiens} bien(s) repassent sans syndic`,
        auteur.id, auteur.libelle]);
    return { ok: true, coproprietes: liens.length };
  });
}

/**
 * ══ 🔴 LOT FICHE-SYNDIC-FINITIONS — UNE ADRESSE HORS PORTEFEUILLE, DEPUIS LA BAN LOCALE ═════════════════════════
 *
 * ARNO : « Si l'adresse n'est pas dans le portefeuille : la proposer aussi depuis la base d'adresses déjà présente
 * dans l'application (BAN locale, si elle couvre la commune) ; n'appelle AUCUN service en ligne nouveau. »
 *
 * 🔴 LA SOURCE : la table `adresse_ban` de la base PostgreSQL locale (≈ 558 000 adresses, 137 communes d'Île-de-France,
 * Paris compris). Aucun appel réseau.
 *
 * ⚠️ `adresse_ban` NE PORTE PAS DE CODE POSTAL. Il est déduit, dans cet ordre : ① Paris (INSEE 751xx → 750xx) ;
 * ② le code postal le plus fréquent de NOS lots dans cette commune ; ③ celui de la mairie dans l'annuaire DILA déjà
 * importé (`dila_import`). Sinon, l'adresse est proposée sans code postal — jamais avec un code inventé.
 *
 * ⚠️ IL FAUT UN NUMÉRO ET AU MOINS TROIS LETTRES DE VOIE : une copropriété est un immeuble, pas une rue, et une voie
 * seule rendrait des centaines de numéros. Mesuré le 10/10/2026 : ≈ 120 ms (recherche normalisée sans index).
 */
export async function adressesBanLocale(saisie: string, max = 6): Promise<AdresseBan[]> {
  const n = normaliserTexte(saisie);
  const m = /^(\d{1,4})\s*(bis|ter|quater|[a-z])?\s+(.{3,})$/.exec(n);
  if (m === null) return [];
  const numero = Number(m[1]);
  const suffixe = m[2] ?? null;
  const voie = m[3].trim();
  const { rows } = await query<{
    numero: number; suffixe: string | null; nom_voie: string; nom_commune: string; code_postal: string | null;
  }>(
    `SELECT DISTINCT ON (b.numero, coalesce(b.suffixe, ''), b.nom_voie, b.insee_commune)
            b.numero, b.suffixe, b.nom_voie, b.nom_commune,
            CASE WHEN b.insee_commune ~ '^751[0-2][0-9]$' THEN '750' || substr(b.insee_commune, 4, 2)
                 ELSE coalesce(
                   (SELECT lo.code_postal FROM gestion_annuaire_lot lo
                     WHERE lo.code_postal ~ '^[0-9]{5}$'
                       AND lower(unaccent(lo.commune)) = lower(unaccent(b.nom_commune))
                     GROUP BY lo.code_postal ORDER BY count(*) DESC LIMIT 1),
                   (SELECT d.adresse_code_postal FROM dila_import d
                     WHERE d.code_insee_commune = b.insee_commune AND d.adresse_code_postal ~ '^[0-9]{5}$' LIMIT 1))
            END AS code_postal
       FROM adresse_ban b
      WHERE b.numero = $1
        AND ($2::text IS NULL OR lower(coalesce(b.suffixe, '')) LIKE $2 || '%')
        AND regexp_replace(lower(unaccent(b.nom_voie)), '[^a-z0-9]+', ' ', 'g') LIKE '%' || $3 || '%'
      LIMIT $4`,
    [numero, suffixe, voie, max]);
  return rows.map((r) => {
    const libelle = [String(r.numero), r.suffixe ?? '', r.nom_voie].filter((x) => x !== '').join(' ');
    return { cle: cleImmeuble(libelle), libelle, codePostal: r.code_postal, commune: r.nom_commune };
  });
}

/**
 * ══ 🔴 LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — LA VILLE PROPOSÉE À PARTIR DU CODE POSTAL ═════════════════════════
 *
 * ARNO : « Bonus : saisir le code postal propose la ville (BAN locale). »
 *
 * ⚠️ LA BAN LOCALE (`adresse_ban`) NE PORTE PAS DE CODE POSTAL — mesuré : aucune colonne. On lit donc ce que
 * l'application connaît DÉJÀ, sans aucun appel réseau : ① Paris (750xx et 75116 → « Paris ») ; ② les communes de NOS
 * lots qui portent ce code postal ; ③ l'annuaire des mairies DILA déjà importé (`dila_import`). La liste est une
 * PROPOSITION : la ville reste un champ libre.
 */
export async function communesDuCodePostal(cp: string): Promise<string[]> {
  const c = cp.trim();
  if (!/^\d{5}$/.test(c)) return [];
  if (/^75(0\d\d|116)$/.test(c)) return ['Paris'];
  const { rows } = await query<{ commune: string }>(
    `SELECT commune FROM (
       SELECT lo.commune, 1 AS rang FROM gestion_annuaire_lot lo
        WHERE lo.code_postal = $1 AND coalesce(btrim(lo.commune), '') <> ''
       UNION ALL
       SELECT d.adresse_commune, 2 FROM dila_import d
        WHERE d.adresse_code_postal = $1 AND coalesce(btrim(d.adresse_commune), '') <> ''
     ) x
     GROUP BY commune ORDER BY min(rang), count(*) DESC LIMIT 12`, [c]);
  const vus = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const lisible = communeLisible(r.commune);
    const cle = normaliserTexte(lisible);
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(lisible);
  }
  return out;
}
