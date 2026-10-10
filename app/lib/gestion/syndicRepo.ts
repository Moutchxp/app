import { query, withTransaction, type RequeteTx } from '../db/client';
import { normaliserTexte } from './annuaire';
import { enregistrerContactsImmeuble } from './contactsImmeubleRepo';
import type { Auteur } from './gestes';
import {
  civiliteLue, cleEmail, cleNom, nomAvecVille, type ContactAilleurs,
  cleCoordonnee, cleTelephone, lignesDoublonCoordonnee, quiPorte, type Civilite, type CoordonneeConnue, type CoordonneeSaisie,
  type ProprietaireCoordonnee,
  adresseImmeuble, cleImmeuble, communeLisible, type AdresseBan, type FicheSyndic, type ImmeubleConnu, type LotDeCopropriete,
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

/** Les migrations 324, 325 ET 326 sont-elles appliquées ? Sans elles, l'écran le dit et n'offre aucun geste. */
export async function syndicsDisponibles(): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT to_regclass('public.gestion_syndic_coordonnee') IS NOT NULL
        AND to_regclass('public.gestion_syndic_contact_copropriete') IS NOT NULL
        AND to_regclass('public.gestion_syndic_note_bien') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'gestion_syndic' AND column_name = 'supprime_le') AS ok`);
  return rows[0]?.ok === true;
}

interface GroupeImmeuble { libelle: string; codePostal: string | null; commune: string | null; lots: LotDeCopropriete[] }

/** Les lots de l'annuaire, groupés par la clé de leur immeuble — avec le code postal et la commune de leurs lots. */
async function lotsParImmeuble(): Promise<Map<string, GroupeImmeuble>> {
  const { rows } = await query<{
    id: string; numero: string; immeuble: string | null; adresse: string | null; commune: string | null; code_postal: string | null;
    proprietaires: Array<{ affiche: string; tri: string }> | null;
  }>(
    /* LOT SYNDIC-BLOC-PORTEFEUILLE — les PROPRIÉTAIRES de chaque lot (« M. JULLIEN ») : le propriétaire de l'import puis
       les copropriétaires ajoutés à la main (lien en cours), cartes non supprimées. LECTURE SEULE. */
    `SELECT lo.id::text, lo.wippimmo_id AS numero, lo.immeuble, lo.adresse, lo.commune, lo.code_postal,
            (SELECT json_agg(json_build_object('affiche', t.affiche, 'tri', t.tri) ORDER BY t.r, t.id)
               FROM (SELECT 0 AS r, p.id, btrim(coalesce(p.civilite, '') || ' ' || upper(coalesce(nullif(btrim(p.nom), ''), p.nom_complet, ''))) AS affiche,
                            lower(coalesce(nullif(btrim(p.nom), ''), p.nom_complet, '')) AS tri
                       FROM gestion_annuaire_proprietaire p WHERE p.id = lo.proprietaire_id AND p.supprime_le IS NULL
                     UNION ALL
                     SELECT 1 + coalesce(lp.rang, 0), p2.id,
                            btrim(coalesce(p2.civilite, '') || ' ' || upper(coalesce(nullif(btrim(p2.nom), ''), p2.nom_complet, ''))),
                            lower(coalesce(nullif(btrim(p2.nom), ''), p2.nom_complet, ''))
                       FROM gestion_annuaire_lot_proprietaire lp JOIN gestion_annuaire_proprietaire p2 ON p2.id = lp.proprietaire_id
                      WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL AND p2.supprime_le IS NULL
                        AND p2.id IS DISTINCT FROM lo.proprietaire_id) t
              WHERE t.affiche <> '') AS proprietaires
       FROM gestion_annuaire_lot lo
      WHERE lo.absent_le IS NULL
      ORDER BY lo.immeuble, lo.wippimmo_id`);
  const m = new Map<string, GroupeImmeuble>();
  for (const r of rows) {
    const cle = cleImmeuble(r.immeuble);
    if (cle === '') continue;
    const g = m.get(cle) ?? { libelle: (r.immeuble ?? '').trim(), codePostal: null, commune: null, lots: [] };
    // Le premier lot qui connaît son code postal et sa commune les donne à l'immeuble.
    if (g.codePostal === null && (r.code_postal ?? '').trim() !== '') g.codePostal = (r.code_postal ?? '').trim();
    if (g.commune === null && (r.commune ?? '').trim() !== '') g.commune = communeLisible(r.commune);
    const proprios = r.proprietaires ?? [];
    g.lots.push({
      id: Number(r.id), numero: r.numero, adresse: r.adresse, commune: r.commune,
      proprietaires: proprios.map((x) => x.affiche), triProprietaire: proprios[0] ? normaliserTexte(proprios[0].tri) : undefined,
    });
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
    syndic_id: string | null; syndic_nom: string | null; syndic_ville: string | null;
  }>(
    `SELECT c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, s.id::text AS syndic_id, s.nom AS syndic_nom,
            s.ville AS syndic_ville
       FROM gestion_copropriete c
       LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
       LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL`);
  const syndicDe = new Map(rows.map((r) => [r.cle, r]));
  const out: ImmeubleConnu[] = [];
  for (const [cle, g] of parCle) {
    const s = syndicDe.get(cle);
    out.push({
      cle, libelle: g.libelle, codePostal: g.codePostal ?? s?.code_postal ?? null, commune: g.commune ?? s?.commune ?? null,
      lots: g.lots, syndic: s?.syndic_id ? { id: Number(s.syndic_id), nom: s.syndic_nom ?? '', ville: s.syndic_ville } : null,
    });
  }
  // Les copropriétés déclarées sans lot dans l'annuaire (BAN, ou saisies à la main) : elles existent aussi.
  for (const r of rows) {
    if (parCle.has(r.cle)) continue;
    out.push({
      cle: r.cle, libelle: r.libelle, codePostal: r.code_postal, commune: r.commune, lots: [],
      syndic: r.syndic_id ? { id: Number(r.syndic_id), nom: r.syndic_nom ?? '', ville: r.syndic_ville } : null,
    });
  }
  return out.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/** La liste des syndics (non supprimés) : nom, nombre de copropriétés en cours, nombre de biens, et de quoi chercher. */
export async function listerSyndics(): Promise<SyndicResume[]> {
  const parCle = await lotsParImmeuble();
  const { rows } = await query<{
    id: string; nom: string; email: string | null; telephone: string | null; ville: string | null;
    cles: string[] | null; emails: string[] | null;
  }>(
    `SELECT s.id::text, s.nom, s.email, s.telephone, s.ville,
            (SELECT array_agg(c.cle_immeuble) FROM gestion_copropriete_syndic cs
               JOIN gestion_copropriete c ON c.id = cs.copropriete_id
              WHERE cs.syndic_id = s.id AND cs.fin IS NULL) AS cles,
            (SELECT array_agg(k.valeur) FROM gestion_syndic_contact ct
               JOIN gestion_syndic_coordonnee k ON k.contact_id = ct.id AND k.retire_le IS NULL
              WHERE ct.syndic_id = s.id AND ct.retire_le IS NULL AND ct.parti_le IS NULL AND k.sorte = 'email') AS emails
       FROM gestion_syndic s
      WHERE s.supprime_le IS NULL
      ORDER BY lower(s.nom), s.id`);
  return rows.map((r) => {
    const cles = r.cles ?? [];
    const nbBiens = cles.reduce((n, c) => n + (parCle.get(c)?.lots.length ?? 0), 0);
    const emails = [r.email ?? '', ...(r.emails ?? [])].filter((x) => x !== '');
    const domaines = emails.map((e) => e.split('@')[1] ?? '');
    return {
      id: Number(r.id), nom: r.nom, email: r.email, telephone: r.telephone, ville: r.ville,
      nbCoproprietes: cles.length, nbBiens,
      // LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — la ville se cherche aussi : « foncia courbevoie ».
      cherchable: normaliserTexte([r.nom, r.ville ?? '', ...emails, ...domaines].join(' ')),
    };
  });
}

/**
 * La fiche complète d'un syndic, ou `null` (inconnu ou supprimé).
 * LOT SYNDIC-NOTE-PAR-BIEN — avec `lotId`, elle porte aussi la note du couple (ce lot, ce syndic), et elle seule.
 */
export async function ficheSyndic(id: number, lotId: number | null = null): Promise<FicheSyndic | null> {
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

  const { rows: contacts } = await query<{
    id: string; titre: string | null; prenom: string | null; nom: string | null; tous_immeubles: boolean; civilite: string | null;
  }>(
    `SELECT id::text, titre, prenom, nom, tous_immeubles, civilite FROM gestion_syndic_contact
      WHERE syndic_id = $1 AND retire_le IS NULL AND parti_le IS NULL ORDER BY rang, id`, [id]);
  // LOT SYNDIC-CONTACT-PARTI — les anciens contacts (« ne travaille plus ici »), avec les coordonnées qu'ils avaient :
  // celles retirées À L'INSTANT de leur départ (même horodatage de transaction).
  const { rows: anciens } = await query<{
    id: string; titre: string | null; prenom: string | null; nom: string | null; civilite: string | null; parti_le: string;
    coordonnees: Array<{ sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }> | null;
  }>(
    `SELECT c.id::text, c.titre, c.prenom, c.nom, c.civilite, c.parti_le::text,
            (SELECT json_agg(json_build_object('sorte', k.sorte, 'libelle', k.libelle, 'valeur', k.valeur) ORDER BY k.rang, k.id)
               FROM gestion_syndic_coordonnee k WHERE k.contact_id = c.id AND k.retire_le = c.parti_le) AS coordonnees
       FROM gestion_syndic_contact c
      WHERE c.syndic_id = $1 AND c.retire_le IS NULL AND c.parti_le IS NOT NULL ORDER BY c.parti_le DESC, c.id`, [id]);
  // LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — les affectations EN COURS des contacts de ce syndic.
  const { rows: affectations } = await query<{ contact_id: string; cle: string }>(
    `SELECT a.contact_id::text, c.cle_immeuble AS cle
       FROM gestion_syndic_contact_copropriete a
       JOIN gestion_syndic_contact ct ON ct.id = a.contact_id
       JOIN gestion_copropriete c ON c.id = a.copropriete_id
      WHERE ct.syndic_id = $1 AND ct.retire_le IS NULL AND a.retire_le IS NULL
      ORDER BY a.id`, [id]);
  const { rows: coords } = await query<{ id: string; contact_id: string; sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }>(
    `SELECT k.id::text, k.contact_id::text, k.sorte, k.libelle, k.valeur
       FROM gestion_syndic_coordonnee k JOIN gestion_syndic_contact c ON c.id = k.contact_id
      WHERE c.syndic_id = $1 AND c.retire_le IS NULL AND c.parti_le IS NULL AND k.retire_le IS NULL ORDER BY k.rang, k.id`, [id]);
  const { rows: liens } = await query<{
    id: string; cle: string; libelle: string; code_postal: string | null; commune: string | null;
    debut: string; fin: string | null; fin_motif: string | null;
  }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune, cs.debut::text, cs.fin::text, cs.fin_motif
       FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id
      WHERE cs.syndic_id = $1 ORDER BY cs.fin IS NOT NULL, c.libelle, cs.debut DESC`, [id]);
  const parCle = await lotsParImmeuble();
  let noteBien: string | null = null;
  if (lotId !== null) {
    const { rows: nb } = await query<{ texte: string }>(
      `SELECT texte FROM gestion_syndic_note_bien WHERE lot_id = $1 AND syndic_id = $2 AND fin IS NULL`, [lotId, id]);
    noteBien = nb[0]?.texte ?? null;
  }

  return {
    noteBien,
    anciens: anciens.map((a) => ({
      id: Number(a.id), titre: a.titre, prenom: a.prenom, nom: a.nom, civilite: civiliteLue(a.civilite) ?? null,
      partiLe: a.parti_le, coordonnees: a.coordonnees ?? [],
    })),
    id: Number(s.id), nom: s.nom, adresse: s.adresse, codePostal: s.code_postal, ville: s.ville,
    telephone: s.telephone, telephone2: s.telephone_2, email: s.email, note: s.note,
    creeLe: s.cree_le, creeParLibelle: s.cree_par_libelle, majLe: s.maj_le, majParLibelle: s.maj_par_libelle,
    contacts: contacts.map((c) => ({
      id: Number(c.id), titre: c.titre, prenom: c.prenom, nom: c.nom, civilite: civiliteLue(c.civilite) ?? null,
      tousImmeubles: c.tous_immeubles !== false,
      immeubles: c.tous_immeubles !== false ? [] : affectations.filter((a) => a.contact_id === c.id).map((a) => a.cle),
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
Promise<{ ok: true; id: number } | { ok: false; motif: string; avertissement?: string[] }> {
  return withTransaction(async (q) => {
    // 🔴 LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL Y AVAIT : un e-mail déjà porté par un contact d'un AUTRE
    // syndic était REFUSÉ (et l'index 327 le refusait en base). Décision d'Arno : un e-mail ou un téléphone déjà utilisé
    // n'est plus qu'un AVERTISSEMENT. Sans confirmation explicite de l'écran (`confirmeDoublons`), le serveur le renvoie
    // et N'ÉCRIT RIEN — décidé AVANT toute écriture (piège withTransaction).
    if (saisie.confirmeDoublons !== true) {
      const lignes = await doublonsDeLaSaisie(q, id, saisie);
      if (lignes.length > 0) return { ok: false, motif: lignes.join(' '), avertissement: lignes };
    }
    // LOT SYNDIC-NOTE-PAR-BIEN — le bien de la note doit exister : refus AVANT toute écriture.
    if (saisie.noteBien) {
      const { rows: lot } = await q<{ id: string }>(`SELECT id::text FROM gestion_annuaire_lot WHERE id = $1`, [saisie.noteBien.lotId]);
      if (lot.length === 0) return { ok: false, motif: 'Note du bien : ce bien n’existe pas.' };
    }
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

    // LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — les copropriétés D'ABORD : les affectations des contacts les désignent.
    await enregistrerCoproprietes(q, syndicId, saisie, auteur);
    await enregistrerContacts(q, syndicId, saisie, auteur);
    if (saisie.noteBien) await enregistrerNoteBien(q, syndicId, saisie.noteBien.lotId, saisie.noteBien.texte, auteur);
    // LOT COPRO-CONTACTS-IMMEUBLE — le carnet de l'immeuble voyage avec la fiche, mais ne dépend PAS du syndic.
    if (saisie.contactsImmeuble) await enregistrerContactsImmeuble(q, saisie.contactsImmeuble, auteur);
    return { ok: true, id: syndicId };
  });
}

/**
 * ══ 🔴 LOT SYNDIC-NOTE-PAR-BIEN — LA NOTE DU COUPLE (lot, syndic), HISTORISÉE ═══════════════════════════════════════
 * Inchangée ⇒ rien. Modifiée ⇒ la ligne en cours est FERMÉE (`fin`, qui) et une nouvelle ouverte. Vidée ⇒ la ligne en
 * cours est fermée, aucune n'est ouverte. Jamais d'effacement ; la note générale du cabinet n'est pas touchée.
 */
async function enregistrerNoteBien(q: RequeteTx, syndicId: number, lotId: number, texte: string, auteur: Auteur): Promise<void> {
  const t = texte.trim();
  const { rows } = await q<{ id: string; texte: string }>(
    `SELECT id::text, texte FROM gestion_syndic_note_bien WHERE lot_id = $1 AND syndic_id = $2 AND fin IS NULL FOR UPDATE`, [lotId, syndicId]);
  const enCours = rows[0];
  if ((enCours?.texte ?? '') === t) return;
  if (enCours !== undefined) {
    await q(`UPDATE gestion_syndic_note_bien SET fin = now(), fin_par = $2, fin_par_libelle = $3 WHERE id = $1`,
      [enCours.id, auteur.id, auteur.libelle]);
  }
  if (t !== '') {
    await q(`INSERT INTO gestion_syndic_note_bien (lot_id, syndic_id, texte, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5)`,
      [lotId, syndicId, t, auteur.id, auteur.libelle]);
  }
}

async function enregistrerContacts(q: RequeteTx, syndicId: number, saisie: SyndicSaisi, auteur: Auteur): Promise<void> {
  // LOT SYNDIC-CONTACT-PARTI — le catalogue = les contacts NI retirés NI partis ; les partis sont lus à part (pour une
  // réintégration) et ne sont jamais « retirés » parce qu'absents de la saisie.
  const { rows: existants } = await q<{ id: string; parti: boolean }>(
    `SELECT id::text, parti_le IS NOT NULL AS parti FROM gestion_syndic_contact WHERE syndic_id = $1 AND retire_le IS NULL FOR UPDATE`, [syndicId]);
  const ids = new Set(existants.filter((r) => !r.parti).map((r) => Number(r.id)));
  const partis = new Set(existants.filter((r) => r.parti).map((r) => Number(r.id)));
  const gardes = new Set<number>();
  for (const [rang, c] of saisie.contacts.entries()) {
    let contactId: number;
    if (c.parti === true) {
      // ══ LOT SYNDIC-CONTACT-PARTI — « NE TRAVAILLE PLUS ICI » ══ marqué parti (qui, quand), JAMAIS effacé ; ses
      // affectations FERMÉES (historisées) ; ses coordonnées RETIRÉES au même instant — elles restent en base, et son
      // e-mail redevient libre (index 327). Un identifiant inconnu de ce syndic : rien.
      if (c.id == null || !ids.has(c.id)) continue;
      gardes.add(c.id);
      await q(`UPDATE gestion_syndic_contact SET parti_le = now(), parti_par = $2, parti_par_libelle = $3 WHERE id = $1`,
        [c.id, auteur.id, auteur.libelle]);
      await q(`UPDATE gestion_syndic_coordonnee SET retire_le = now() WHERE contact_id = $1 AND retire_le IS NULL`, [c.id]);
      await q(
        `UPDATE gestion_syndic_contact_copropriete SET retire_le = now(), retire_par_libelle = $2, retire_motif = 'contact parti'
          WHERE contact_id = $1 AND retire_le IS NULL`, [c.id, auteur.libelle]);
      continue;
    }
    if (c.reintegre === true && c.id != null && partis.has(c.id)) {
      // ══ LOT SYNDIC-CONTACT-PARTI — « RÉINTÉGRER AU CATALOGUE » ══ le départ est défait (trace : reintegre_le) ; il
      // revient SANS copropriété ; ses coordonnées sont RECRÉÉES plus bas (les anciennes lignes restent en historique).
      contactId = c.id;
      gardes.add(contactId);
      await q(
        `UPDATE gestion_syndic_contact SET parti_le = NULL, parti_par = NULL, parti_par_libelle = NULL,
                reintegre_le = now(), reintegre_par_libelle = $2 WHERE id = $1`, [contactId, auteur.libelle]);
      await q(
        `UPDATE gestion_syndic_contact SET titre = $2, prenom = $3, nom = $4, rang = $5, maj_le = now(), maj_par_libelle = $6,
                tous_immeubles = $7, civilite = $8
          WHERE id = $1`, [contactId, nul(c.titre), nul(c.prenom), nul(c.nom), rang, auteur.libelle, c.tousImmeubles, c.civilite ?? null]);
    } else if (c.id != null && ids.has(c.id)) {
      contactId = c.id;
      gardes.add(contactId);
      await q(
        `UPDATE gestion_syndic_contact SET titre = $2, prenom = $3, nom = $4, rang = $5, maj_le = now(), maj_par_libelle = $6,
                tous_immeubles = $7, civilite = $8
          WHERE id = $1`, [contactId, nul(c.titre), nul(c.prenom), nul(c.nom), rang, auteur.libelle, c.tousImmeubles, c.civilite ?? null]);
    } else {
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_syndic_contact (syndic_id, titre, prenom, nom, rang, cree_par_libelle, tous_immeubles, civilite)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
        [syndicId, nul(c.titre), nul(c.prenom), nul(c.nom), rang, auteur.libelle, c.tousImmeubles, c.civilite ?? null]);
      contactId = Number(rows[0]?.id);
    }
    // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — toujours des affectations explicites (`tous_immeubles` est écrit à faux).
    await enregistrerAffectations(q, contactId, c.immeubles, auteur);
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
    // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — ses coordonnées partent avec lui : son e-mail redevient libre (index 327).
    await q(`UPDATE gestion_syndic_coordonnee SET retire_le = now() WHERE contact_id = ANY($1::bigint[]) AND retire_le IS NULL`, [retires]);
    await q(
      `UPDATE gestion_syndic_contact_copropriete SET retire_le = now(), retire_par_libelle = $2, retire_motif = 'contact retiré'
        WHERE contact_id = ANY($1::bigint[]) AND retire_le IS NULL`, [retires, auteur.libelle]);
  }
}

/**
 * ══ 🔴 LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — LES IMMEUBLES QUE SUIT UN CONTACT ═════════════════════════════════════
 * Les affectations EN COURS du contact sont comparées à celles voulues (clés des copropriétés) : les manquantes sont
 * créées (avec l'auteur), celles qui ne sont plus voulues RETIRÉES (`retire_le`, motif). Rien n'est effacé.
 * LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — il n'y a plus de « Tous les immeubles » implicite : un contact ne suit QUE ses
 * affectations. La case « Tous les immeubles » de l'écran coche les copropriétés ACTUELLES, qui arrivent ici en clés.
 */
async function enregistrerAffectations(q: RequeteTx, contactId: number, cles: readonly string[], auteur: Auteur): Promise<void> {
  const { rows: voulues } = await q<{ id: string }>(
    `SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = ANY($1::text[])`, [[...cles]]);
  const idsVoulus = new Set(voulues.map((r) => r.id));
  const { rows: enCours } = await q<{ id: string; copropriete_id: string }>(
    `SELECT id::text, copropriete_id::text FROM gestion_syndic_contact_copropriete
      WHERE contact_id = $1 AND retire_le IS NULL FOR UPDATE`, [contactId]);
  const deja = new Set(enCours.map((r) => r.copropriete_id));
  const aRetirer = enCours.filter((r) => !idsVoulus.has(r.copropriete_id)).map((r) => r.id);
  if (aRetirer.length > 0) {
    await q(
      `UPDATE gestion_syndic_contact_copropriete SET retire_le = now(), retire_par_libelle = $2, retire_motif = $3
        WHERE id = ANY($1::bigint[])`, [aRetirer, auteur.libelle, 'retrait de l’affectation']);
  }
  for (const id of idsVoulus) {
    if (deja.has(id)) continue;
    await q(
      `INSERT INTO gestion_syndic_contact_copropriete (contact_id, copropriete_id, affecte_par, affecte_par_libelle)
       VALUES ($1, $2, $3, $4)`, [contactId, id, auteur.id, auteur.libelle]);
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
    // LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — et les contacts du syndic qui PERD l'immeuble cessent de le suivre.
    await retirerAffectationsDeLaCopro(q, Number(l.syndic_id), l.copro_id, aMoi ? 'copropriété retirée du syndic' : 'changement de syndic', auteur);
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

/** Les affectations EN COURS des contacts d'un syndic à une copropriété : retirées (historisées), jamais effacées. */
async function retirerAffectationsDeLaCopro(q: RequeteTx, syndicId: number, coproId: string, motif: string, auteur: Auteur): Promise<void> {
  await q(
    `UPDATE gestion_syndic_contact_copropriete a SET retire_le = now(), retire_par_libelle = $3, retire_motif = $4
       FROM gestion_syndic_contact c
      WHERE a.contact_id = c.id AND c.syndic_id = $1 AND a.copropriete_id = $2 AND a.retire_le IS NULL`,
    [syndicId, coproId, auteur.libelle, motif]);
}

/**
 * ══ 🔴 LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — RETIRER UN SYNDIC D'UNE SEULE COPROPRIÉTÉ ═══════════════════════════════
 *
 * ARNO : « détacher un syndic d'une résidence sans rien détruire, puis en choisir ou créer un autre ». Dans UNE
 * transaction, sans DELETE :
 *   a. le lien copropriété ↔ syndic EN COURS est FERMÉ (motif « retrait de la résidence ») : les lots du portefeuille
 *      de cet immeuble n'ont plus ce syndic — c'est par l'immeuble qu'un lot connaît son syndic ;
 *   b. les affectations des contacts de ce syndic à CETTE copropriété sont retirées (historisées) ; les contacts
 *      restent au catalogue avec leurs autres copropriétés ;
 *   c. les notes « par bien » (lot, syndic) ne sont PAS touchées : elles restent en base, simplement plus affichées ;
 *   d. le syndic n'est JAMAIS supprimé, même sans plus aucune copropriété ;
 *   e. une ligne de journal PAR LOT (entité « annuaire_lot », action « syndic_retire »).
 * ⚠️ Les refus (syndic inconnu, copropriété non rattachée) se décident AVANT toute écriture.
 */
export async function retirerDeLaCopropriete(syndicId: number, immeuble: string, auteur: Auteur):
Promise<{ ok: true; lots: number } | { ok: false; motif: string }> {
  const cle = cleImmeuble(immeuble);
  if (cle === '') return { ok: false, motif: 'Copropriété non désignée.' };
  const parCle = await lotsParImmeuble();
  return withTransaction(async (q) => {
    const { rows } = await q<{ nom: string; ville: string | null }>(
      `SELECT nom, ville FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE`, [syndicId]);
    const s = rows[0];
    if (s === undefined) return { ok: false, motif: 'Ce syndic n’existe pas ou a été supprimé.' };
    const { rows: liens } = await q<{ lien_id: string; copro_id: string; libelle: string; code_postal: string | null; commune: string | null }>(
      `SELECT cs.id::text AS lien_id, c.id::text AS copro_id, c.libelle, c.code_postal, c.commune
         FROM gestion_copropriete_syndic cs JOIN gestion_copropriete c ON c.id = cs.copropriete_id
        WHERE cs.syndic_id = $1 AND c.cle_immeuble = $2 AND cs.fin IS NULL FOR UPDATE OF cs`, [syndicId, cle]);
    const l = liens[0];
    if (l === undefined) return { ok: false, motif: 'Cette copropriété n’est pas (ou plus) rattachée à ce syndic.' };
    await q(
      `UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'retrait de la résidence'
        WHERE id = $1`, [l.lien_id, auteur.id, auteur.libelle]);
    await retirerAffectationsDeLaCopro(q, syndicId, l.copro_id, 'syndic retiré de la copropriété', auteur);
    const g = parCle.get(cle);
    const syndic = nomAvecVille(s.nom, s.ville);
    const adresse = adresseImmeuble(l.libelle, g?.codePostal ?? l.code_postal, g?.commune ?? l.commune);
    for (const lot of g?.lots ?? []) {
      await q(
        `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle)
         VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
        [lot.id, syndic, `Syndic ${syndic} retiré de la copropriété ${adresse}`, auteur.id, auteur.libelle]);
    }
    return { ok: true, lots: g?.lots.length ?? 0 };
  });
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
    await q(
      `UPDATE gestion_syndic_contact_copropriete a SET retire_le = now(), retire_par_libelle = $2, retire_motif = 'suppression du syndic'
         FROM gestion_syndic_contact c WHERE a.contact_id = c.id AND c.syndic_id = $1 AND a.retire_le IS NULL`, [id, auteur.libelle]);
    await q(
      `UPDATE gestion_syndic_coordonnee k SET retire_le = now() FROM gestion_syndic_contact c
        WHERE k.contact_id = c.id AND c.syndic_id = $1 AND c.retire_le IS NULL AND k.retire_le IS NULL`, [id]);
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

/**
 * ══ 🔴 LOT SYNDIC-CONTACTS-ANTI-DOUBLON — LES CONTACTS DES AUTRES SYNDICS ══════════════════════════════════════════
 * Les contacts vivants des syndics non supprimés, SAUF ceux du syndic `syndicId` (dont le formulaire fait foi), avec
 * leurs e-mails déjà normalisés (`cleEmail`). La comparaison se fait en JavaScript, avec les MÊMES fonctions que
 * l'écran (`cleNom`, `cleEmail`) : une seule normalisation, donc une seule réponse.
 */
async function contactsAilleurs(q: RequeteTx | typeof query, syndicId: number | null):
Promise<Array<ContactAilleurs & { emails: string[] }>> {
  const { rows } = await (q as typeof query)<{
    prenom: string | null; nom: string | null; titre: string | null; syndic_id: string; syndic_nom: string; syndic_ville: string | null;
    emails: string[] | null;
  }>(
    `SELECT c.prenom, c.nom, c.titre, s.id::text AS syndic_id, s.nom AS syndic_nom, s.ville AS syndic_ville,
            (SELECT array_agg(k.valeur) FROM gestion_syndic_coordonnee k
              WHERE k.contact_id = c.id AND k.sorte = 'email' AND k.retire_le IS NULL) AS emails
       FROM gestion_syndic_contact c JOIN gestion_syndic s ON s.id = c.syndic_id
      WHERE c.retire_le IS NULL AND c.parti_le IS NULL AND s.supprime_le IS NULL AND ($1::bigint IS NULL OR s.id <> $1)`, [syndicId]);
  return rows.map((r) => ({
    prenom: r.prenom, nom: r.nom, titre: r.titre, syndicId: Number(r.syndic_id), syndicNom: r.syndic_nom, syndicVille: r.syndic_ville,
    emails: (r.emails ?? []).map(cleEmail),
  }));
}

/** Les doublons d'un contact dans les AUTRES syndics : par e-mail (bloquant), par Prénom + NOM (avertissement). */
export async function doublonsAilleurs(syndicId: number | null, prenom: string, nom: string, emails: readonly string[],
  telephones: readonly string[] = []):
Promise<{ emails: ContactAilleurs[]; noms: ContactAilleurs[]; coordonnees: CoordonneeConnue[] }> {
  const autres = await contactsAilleurs(query, syndicId);
  const mes = new Set(emails.map(cleEmail).filter((e) => e !== ''));
  const tels = new Set(telephones.map(cleTelephone).filter((t) => t !== ''));
  const n = cleNom(prenom, nom);
  const sans = ({ emails: _e, ...c }: ContactAilleurs & { emails: string[] }): ContactAilleurs => c;
  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — les porteurs, dans LES DEUX carnets (syndics et immeubles), de ces
  // e-mails et téléphones : l'écran en fait un avertissement précis (et non plus un blocage).
  const connues = mes.size + tels.size === 0 ? [] : (await coordonneesConnues(query))
    .filter((k) => (k.sorte === 'email' ? mes.has(k.cle) : tels.has(k.cle)));
  return {
    emails: mes.size === 0 ? [] : autres.filter((c) => c.emails.some((e) => mes.has(e))).map(sans),
    noms: n === '' ? [] : autres.filter((c) => cleNom(c.prenom, c.nom) === n).map(sans),
    coordonnees: connues.map(({ coordId: _k, ...c }) => c),
  };
}

/**
 * ══ LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — TOUTES LES COORDONNÉES ACTIVES DES DEUX CARNETS ══════════════════
 * Contacts de syndic (ni retirés, ni partis, syndic non supprimé) et contacts d'immeuble (non retirés), avec qui les
 * porte. Les clés de comparaison sont calculées ici, par la MÊME normalisation que l'écran. LECTURE SEULE.
 */
async function coordonneesConnues(q: RequeteTx | typeof query): Promise<Array<CoordonneeConnue & { coordId: number }>> {
  const { rows: s } = await (q as typeof query)<{
    coord_id: string; sorte: 'email' | 'telephone'; valeur: string; contact_id: string; civilite: string | null; prenom: string | null;
    nom: string | null; titre: string | null; syndic_id: string; syndic_nom: string; syndic_ville: string | null; copros: string[] | null;
  }>(
    `SELECT k.id::text AS coord_id, k.sorte, k.valeur, ct.id::text AS contact_id, ct.civilite, ct.prenom, ct.nom, ct.titre,
            s.id::text AS syndic_id, s.nom AS syndic_nom, s.ville AS syndic_ville,
            (SELECT array_agg(c.cle_immeuble) FROM gestion_syndic_contact_copropriete a JOIN gestion_copropriete c ON c.id = a.copropriete_id
              WHERE a.contact_id = ct.id AND a.retire_le IS NULL) AS copros
       FROM gestion_syndic_coordonnee k JOIN gestion_syndic_contact ct ON ct.id = k.contact_id JOIN gestion_syndic s ON s.id = ct.syndic_id
      WHERE k.retire_le IS NULL AND ct.retire_le IS NULL AND ct.parti_le IS NULL AND s.supprime_le IS NULL`);
  const { rows: i } = await (q as typeof query)<{
    coord_id: string; sorte: 'email' | 'telephone'; valeur: string; contact_id: string; civilite: string | null; prenom: string | null;
    nom: string | null; categorie: string; libelle: string | null; cle: string; immeuble: string; code_postal: string | null; commune: string | null;
  }>(
    `SELECT k.id::text AS coord_id, k.sorte, k.valeur, ct.id::text AS contact_id, ct.civilite, ct.prenom, ct.nom, ct.categorie, ct.libelle,
            c.cle_immeuble AS cle, c.libelle AS immeuble, c.code_postal, c.commune
       FROM gestion_copropriete_contact_coordonnee k JOIN gestion_copropriete_contact ct ON ct.id = k.contact_id
       JOIN gestion_copropriete c ON c.id = ct.copropriete_id
      WHERE k.retire_le IS NULL AND ct.retire_le IS NULL`);
  const categorie = (c: string, l: string | null): string => (c === 'gardien' ? 'Gardien' : c === 'conseil_syndical' ? 'Conseil syndical' : (l ?? '').trim());
  return [
    ...s.map((r): CoordonneeConnue & { coordId: number } => ({
      coordId: Number(r.coord_id), sorte: r.sorte, cle: cleCoordonnee(r.sorte, r.valeur),
      proprietaire: { genre: 'syndic', contactId: Number(r.contact_id), civilite: civiliteLue(r.civilite) ?? null, prenom: r.prenom, nom: r.nom,
        titre: r.titre, syndicId: Number(r.syndic_id), syndicNom: r.syndic_nom, syndicVille: r.syndic_ville, coproprietes: r.copros ?? [] },
    })),
    ...i.map((r): CoordonneeConnue & { coordId: number } => ({
      coordId: Number(r.coord_id), sorte: r.sorte, cle: cleCoordonnee(r.sorte, r.valeur),
      proprietaire: { genre: 'immeuble', contactId: Number(r.contact_id), civilite: civiliteLue(r.civilite) ?? null, prenom: r.prenom, nom: r.nom,
        categorie: categorie(r.categorie, r.libelle), immeubleCle: r.cle, immeubleAdresse: adresseImmeuble(r.immeuble, r.code_postal, r.commune) },
    })),
  ].filter((k) => k.cle !== '');
}

/**
 * LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — LE CONTRÔLE SERVEUR. Les coordonnées NOUVELLES ou MODIFIÉES de la saisie
 * (une coordonnée déjà enregistrée telle quelle a déjà été confirmée) qui sont déjà portées par un AUTRE contact —
 * d'un autre syndic, d'un autre immeuble, ou d'un autre contact de la saisie elle-même (le formulaire fait foi pour ce
 * syndic et pour cet immeuble). Rend les lignes de l'avertissement ; vide : rien à confirmer.
 */
async function doublonsDeLaSaisie(q: RequeteTx, id: number | null, saisie: SyndicSaisi): Promise<string[]> {
  const connues = await coordonneesConnues(q);
  const cleCarnet = saisie.contactsImmeuble ? cleImmeuble(saisie.contactsImmeuble.immeuble) : null;
  const dansLaSaisie = (p: ProprietaireCoordonnee): boolean =>
    (p.genre === 'syndic' && id !== null && p.syndicId === id) || (p.genre === 'immeuble' && cleCarnet !== null && p.immeubleCle === cleCarnet);
  const externes = connues.filter((k) => !dansLaSaisie(k.proprietaire));
  const deja = new Map(connues.filter((k) => dansLaSaisie(k.proprietaire)).map((k) => [`${k.proprietaire.genre}:${k.coordId}`, k.cle]));
  type Porteur = { genre: 'syndic' | 'immeuble'; rang: number; contact: { id?: number | null; civilite?: Civilite | null; prenom: string; nom: string; coordonnees: CoordonneeSaisie[] }; p: ProprietaireCoordonnee };
  const porteurs: Porteur[] = [
    ...saisie.contacts.filter((c) => c.parti !== true).map((c, rang): Porteur => ({ genre: 'syndic', rang, contact: c, p: {
      genre: 'syndic', contactId: c.id ?? null, civilite: c.civilite ?? null, prenom: c.prenom, nom: c.nom, titre: c.titre,
      syndicId: id, syndicNom: saisie.nom, syndicVille: nul(saisie.ville), coproprietes: c.immeubles } })),
    ...(saisie.contactsImmeuble?.contacts ?? []).map((c, rang): Porteur => ({ genre: 'immeuble', rang, contact: c, p: {
      genre: 'immeuble', contactId: c.id, civilite: c.civilite, prenom: c.prenom, nom: c.nom,
      categorie: c.categorie === 'gardien' ? 'Gardien' : c.categorie === 'conseil_syndical' ? 'Conseil syndical' : c.libelle,
      immeubleCle: cleCarnet ?? '', immeubleAdresse: saisie.contactsImmeuble?.immeuble ?? '' } })),
  ];
  const lignes: string[] = [];
  const dites = new Set<string>();
  for (const moi of porteurs) {
    for (const k of moi.contact.coordonnees) {
      const cle = cleCoordonnee(k.sorte, k.valeur);
      if (cle === '' || dites.has(`${k.sorte}:${cle}`)) continue;
      if (k.id != null && deja.get(`${moi.genre}:${k.id}`) === cle) continue; // inchangée : déjà confirmée
      const autres = [
        ...externes.filter((x) => x.sorte === k.sorte && x.cle === cle).map((x) => quiPorte(x.proprietaire)),
        ...porteurs.filter((o) => o !== moi && o.contact.coordonnees.some((y) => y.sorte === k.sorte && cleCoordonnee(y.sorte, y.valeur) === cle))
          .map((o) => quiPorte(o.p)),
      ].filter((v, j, t) => t.indexOf(v) === j);
      if (autres.length === 0) continue;
      dites.add(`${k.sorte}:${cle}`);
      lignes.push(...lignesDoublonCoordonnee(k.sorte, k.valeur, autres));
    }
  }
  return lignes;
}
