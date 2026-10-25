import 'server-only';
import { query, withTransaction } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { colonnesTrace, traceCourante } from '../gestion/traceJournal';
import {
  heritable, libelleOrigineProprietaire, locationsAReporter, memeOrigine, verifierOrigineProprietaire, ORIGINES_PROPRIETAIRE,
  type OrigineDuBien, type OrigineProprietaire, type OrigineProprietaireContact,
} from './origineProprietaire';
import { libelleOrigineContact, verifierCommercial, type OrigineContact } from './suivi/suivi';

/**
 * ══ 🔴 Arno (25/10/2026, migration 425) — L'ORIGINE DU CONTACT DU PROPRIÉTAIRE : lecture, écriture, héritage par ses locations ══════════
 * Écrite à la création (dans la transaction de la fiche) et dans la fiche du propriétaire (journal : compte, session, écran). Modifier
 * l'origine d'un propriétaire ne touche AUCUNE location déjà enregistrée ; le report, proposé à part, ne vise que les « à renseigner ».
 * Aucune action Drive.
 */
type Auteur = { id: number | null; libelle: string };
type Q = (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
export type IssueOrigine<T = undefined> = { etat: 'ok'; data: T } | { etat: 'refus'; motif: string } | { etat: 'conflit'; motif: string } | { etat: 'sans_schema' };

const SANS_SCHEMA = { etat: 'sans_schema' } as const;
export const origineProprietaireDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_annuaire_proprietaire', 'origine_contact');
const nombre = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** L'origine telle que la base la porte (null : à renseigner). PUR. */
export function origineDeLigne(r: Record<string, unknown>): OrigineProprietaire | null {
  const o = r.origine_contact;
  if (typeof o !== 'string' || !(ORIGINES_PROPRIETAIRE as readonly string[]).includes(o)) return null;
  return { origine: o as OrigineProprietaireContact, precision: (r.origine_contact_precision as string | null) ?? null,
    apporteurId: nombre(r.origine_apporteur_id), collegueId: nombre(r.origine_collegue_id), collegueLibelle: (r.origine_collegue_libelle as string | null) ?? null };
}

/** « Apporteur d'affaires — Frédéric Rousseau », « Collègue directement — Arnaud Jorel », « Personnalisé : … », « Origine inconnue — à compléter ». */
export async function motOrigine(o: OrigineProprietaire | null, q: Q = query as unknown as Q): Promise<string> {
  if (o === null) return 'à renseigner';
  if (o.origine === 'apporteur' && o.apporteurId !== null) {
    const nom = (await q('SELECT nom FROM gestion_location_apporteur WHERE id = $1', [o.apporteurId])).rows[0]?.nom as string | undefined;
    return `${libelleOrigineProprietaire(o.origine)} — ${nom ?? `n° ${o.apporteurId}`}`;
  }
  if (o.origine === 'collegue') return `${libelleOrigineProprietaire(o.origine)} — ${o.collegueLibelle ?? (o.collegueId === null ? '—' : `compte n° ${o.collegueId}`)}`;
  if (o.origine === 'personnalise') return libelleOrigineContact('personnalise', o.precision);
  return libelleOrigineProprietaire(o.origine);
}

/** Le nom du collègue (compte) au moment de la saisie. */
async function nomCollegue(q: Q, id: number | null): Promise<string | null> {
  if (id === null) return null;
  const r = (await q(`SELECT coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS n FROM admin_utilisateur WHERE id = $1`, [id])).rows[0];
  return (r?.n as string | undefined) ?? null;
}

async function journaliserProprietaire(q: Q, proprietaireId: number, action: string, avant: string, apres: string, commentaire: string, auteur: Auteur): Promise<void> {
  const t = await colonnesTrace({ sujet: 'proprietaire', champ: 'Origine du contact' }, 8);
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
           VALUES ('annuaire', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
  [proprietaireId, action, `Origine du contact : ${avant}`, `Origine du contact : ${apres}`, commentaire, auteur.id, auteur.libelle, ...t.valeurs]);
}

/**
 * ÉCRIT l'origine d'un propriétaire dans la transaction `q` (création, modification, séparation) et la journalise. Rend le mot écrit.
 * La valeur doit être VÉRIFIÉE (`verifierOrigineProprietaire`).
 */
export async function ecrireOrigineProprietaireTx(q: Q, proprietaireId: number, v: OrigineProprietaire, auteur: Auteur, commentaire: string): Promise<{ avant: string; apres: string }> {
  const avantLu = (await q(`SELECT origine_contact, origine_contact_precision, origine_apporteur_id, origine_collegue_id, origine_collegue_libelle
                              FROM gestion_annuaire_proprietaire WHERE id = $1 FOR UPDATE`, [proprietaireId])).rows[0];
  const avant = avantLu === undefined ? null : origineDeLigne(avantLu);
  const collegueLibelle = v.origine === 'collegue' ? (await nomCollegue(q, v.collegueId)) ?? v.collegueLibelle ?? null : null;
  const valeur: OrigineProprietaire = { ...v, collegueLibelle };
  await q(`UPDATE gestion_annuaire_proprietaire SET origine_contact = $2, origine_contact_precision = $3, origine_apporteur_id = $4,
                  origine_collegue_id = $5, origine_collegue_libelle = $6, origine_modifiee_le = now(), origine_modifiee_par_libelle = $7
            WHERE id = $1`, [proprietaireId, v.origine, v.precision, v.apporteurId, v.collegueId, collegueLibelle, auteur.libelle]);
  const motAvant = await motOrigine(avant, q);
  const motApres = await motOrigine(valeur, q);
  if (avant === null || !memeOrigine(avant, valeur)) await journaliserProprietaire(q, proprietaireId, 'annuaire_origine_contact', motAvant, motApres, commentaire, auteur);
  return { avant: motAvant, apres: motApres };
}

/** L'origine d'un propriétaire, et son mot (fiche, récapitulatif). `null` : sans la 425. */
export async function lireOrigineProprietaire(proprietaireId: number): Promise<{ origine: OrigineProprietaire | null; mot: string; modifieeLe: string | null; par: string | null } | null> {
  if (!(await origineProprietaireDisponible())) return null;
  const r = (await query<Record<string, unknown>>(`SELECT origine_contact, origine_contact_precision, origine_apporteur_id, origine_collegue_id,
                                                          origine_collegue_libelle, origine_modifiee_le::text AS le, origine_modifiee_par_libelle AS par
                                                     FROM gestion_annuaire_proprietaire WHERE id = $1`, [proprietaireId])).rows[0];
  if (r === undefined) return null;
  const origine = origineDeLigne(r);
  return { origine, mot: await motOrigine(origine), modifieeLe: (r.le as string | null) ?? null, par: (r.par as string | null) ?? null };
}

/** Une location d'un propriétaire (titulaire du bien) : pour la liste du report. */
export interface LocationDuProprietaire { id: number; libelle: string; dateSignature: string; origineContact: OrigineContact | null; apporteurId: number | null; mot: string }

const SQL_LOCATIONS = `SELECT a.id::text, coalesce(nullif(btrim(concat_ws(' / ', a.libelle_proprietaire, a.libelle_locataire)), ''), 'Location n° ' || a.id) AS libelle,
         a.date_signature::text AS date_signature, a.origine_contact, a.apporteur_id::text AS apporteur_id
    FROM gestion_location_activite a
   WHERE a.annule_le IS NULL
     AND (a.proprietaire_id = $1 OR (a.proprietaire_id IS NULL AND a.lot_id IN (SELECT l.id FROM gestion_annuaire_lot l WHERE l.proprietaire_id = $1)))
   ORDER BY a.date_signature DESC, a.id DESC`;

/** Les locations du propriétaire (titulaire de leur bien), et celles qu'un report toucherait (origine encore « à renseigner »). */
export async function locationsDuProprietaire(proprietaireId: number): Promise<{ toutes: LocationDuProprietaire[]; aRenseigner: LocationDuProprietaire[] }> {
  if (!(await colonneExisteMemo('gestion_location_activite', 'origine_contact'))) return { toutes: [], aRenseigner: [] };
  const rows = (await query<Record<string, unknown>>(SQL_LOCATIONS, [proprietaireId])).rows;
  const toutes = rows.map((r) => ({ id: Number(r.id), libelle: String(r.libelle), dateSignature: String(r.date_signature), origineContact: (r.origine_contact as OrigineContact | null) ?? null, apporteurId: nombre(r.apporteur_id),
    mot: r.origine_contact === null ? 'à renseigner' : libelleOrigineContact(r.origine_contact as OrigineContact) }));
  return { toutes, aRenseigner: locationsAReporter(toutes) };
}

/**
 * MODIFIE l'origine d'un propriétaire (fiche du propriétaire). Les locations déjà enregistrées ne changent PAS ; `reporter` (décoché par
 * défaut à l'écran) applique la nouvelle origine aux SEULES locations encore « à renseigner » (relues en base : une location renseignée
 * entre-temps n'est jamais écrasée), chacune journalisée. « Origine inconnue » ne se reporte pas.
 */
export async function modifierOrigineProprietaire(proprietaireId: number, brut: unknown, reporter: boolean, auteur: Auteur): Promise<IssueOrigine<{ mot: string; reportees: number }>> {
  if (!(await origineProprietaireDisponible())) return SANS_SCHEMA;
  const v = verifierOrigineProprietaire(brut);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const ecran = traceCourante()?.ecran ?? 'Fiche du propriétaire';
  return withTransaction(async (qq) => {
    const q = qq as unknown as Q;
    if ((await q('SELECT 1 FROM gestion_annuaire_proprietaire WHERE id = $1', [proprietaireId])).rows.length === 0) return { etat: 'refus', motif: 'Ce propriétaire n’existe plus.' } as const;
    const { apres } = await ecrireOrigineProprietaireTx(q, proprietaireId, v.valeur, auteur, `${ecran} — origine du contact du propriétaire modifiée`);
    let reportees = 0;
    if (reporter && heritable(v.valeur)) {
      const cibles = (await q(`${SQL_LOCATIONS.replace('ORDER BY', 'AND a.origine_contact IS NULL AND a.apporteur_id IS NULL ORDER BY')}`, [proprietaireId])).rows;
      for (const c of cibles) {
        const id = Number(c.id);
        const fait = await q(`UPDATE gestion_location_activite SET origine_contact = $2, origine_contact_precision = $3, apporteur_id = $4, collegue_id = $5,
                                     collegue_libelle = $6, modifie_le = now(), modifie_par_libelle = $7
                               WHERE id = $1 AND origine_contact IS NULL AND apporteur_id IS NULL AND annule_le IS NULL RETURNING id`,
        [id, v.valeur.origine, v.valeur.precision, v.valeur.apporteurId, v.valeur.collegueId, v.valeur.collegueLibelle ?? null, auteur.libelle]);
        if (fait.rows.length === 0) continue;
        reportees += 1;
        await journaliserActivite(q, id, 'location_origine_reportee', 'à renseigner', apres, `${ecran} — origine du propriétaire reportée sur une location « à renseigner »`, auteur);
      }
    }
    return { etat: 'ok', data: { mot: apres, reportees } } as const;
  });
}

async function journaliserActivite(q: Q, id: number, action: string, avant: string, apres: string, commentaire: string, auteur: Auteur): Promise<void> {
  const t = await colonnesTrace({ sujet: 'activite', champ: 'Origine du contact' }, 8);
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle${t.colonnes})
           VALUES ('location_activite', $1, $2, $3, $4, $5, $6, $7${t.marques})`,
  [id, action, `Origine du contact : ${avant}`, `Origine du contact : ${apres}`, commentaire, auteur.id, auteur.libelle, ...t.valeurs]);
}

/** 🔴 Arno (25/10/2026) — le filtre « Origine à compléter » de l'annuaire : les propriétaires vivants dont l'origine est « inconnue » ou à renseigner. */
export async function proprietairesOrigineACompleter(): Promise<{ disponible: boolean; proprietaires: { id: number; nom: string; origine: 'inconnue' | null }[] }> {
  if (!(await origineProprietaireDisponible())) return { disponible: false, proprietaires: [] };
  const vivant = (await colonneExisteMemo('gestion_annuaire_proprietaire', 'supprime_le')) ? ' AND supprime_le IS NULL' : '';
  const rows = (await query<{ id: string; nom: string; origine: string | null }>(
    `SELECT id::text, nom_complet AS nom, origine_contact AS origine FROM gestion_annuaire_proprietaire
      WHERE (origine_contact IS NULL OR origine_contact = 'inconnue') AND absent_le IS NULL AND archive_le IS NULL${vivant}
      ORDER BY nom_normalise, id`)).rows;
  return { disponible: true, proprietaires: rows.map((r) => ({ id: Number(r.id), nom: r.nom, origine: r.origine === 'inconnue' ? 'inconnue' : null })) };
}

/**
 * CE QU'HÉRITE UNE LOCATION DU BIEN `lotId` : l'origine du TITULAIRE (`gestion_annuaire_lot.proprietaire_id`), son nom, et si un
 * copropriétaire EN COURS porte une autre origine (connue). `null` : sans la 425, ou bien sans titulaire.
 */
export async function origineDuBien(lotId: number | null): Promise<OrigineDuBien | null> {
  if (lotId === null || !(await origineProprietaireDisponible())) return null;
  const cols = `p.id::text, p.nom_complet, p.origine_contact, p.origine_contact_precision, p.origine_apporteur_id, p.origine_collegue_id, p.origine_collegue_libelle`;
  const t = (await query<Record<string, unknown>>(`SELECT ${cols} FROM gestion_annuaire_lot l JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id WHERE l.id = $1`, [lotId])).rows[0];
  if (t === undefined) return null;
  const origine = origineDeLigne(t);
  const copros = (await query<Record<string, unknown>>(`SELECT ${cols} FROM gestion_annuaire_lot_proprietaire lp JOIN gestion_annuaire_proprietaire p ON p.id = lp.proprietaire_id
                                                         WHERE lp.lot_id = $1 AND lp.jusqu_a IS NULL AND lp.proprietaire_id <> $2`, [lotId, Number(t.id)])).rows;
  const autres = copros.map(origineDeLigne).filter(heritable);
  return { proprietaireId: Number(t.id), nom: String(t.nom_complet ?? ''), origine,
    coproprietairesDifferents: autres.some((o) => !heritable(origine) || !memeOrigine(o, origine)) };
}

/** L'empreinte de l'origine d'une location (le conflit du bloc 9 : quelqu'un l'a changée depuis l'ouverture). PUR. */
export const empreinteOrigine = (r: { origine_contact?: unknown; origine_contact_precision?: unknown; apporteur_id?: unknown; collegue_id?: unknown }): string =>
  [r.origine_contact ?? '', r.origine_contact_precision ?? '', r.apporteur_id ?? '', r.collegue_id ?? ''].map(String).join('|');

/** L'origine d'une location (bloc 9), son empreinte et ce qu'elle hérite de son bien. */
export async function lireOrigineActivite(activiteId: number): Promise<{ origineContact: OrigineContact | null; origineContactPrecision: string | null; apporteurId: number | null;
  collegueId: number | null; empreinte: string; avecGestion: boolean; bien: OrigineDuBien | null } | null> {
  const precision = (await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision')) ? 'origine_contact_precision' : 'NULL::text AS origine_contact_precision';
  const r = (await query<Record<string, unknown>>(`SELECT origine_contact, ${precision}, apporteur_id, collegue_id, lot_id, avec_gestion FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL`, [activiteId])).rows[0];
  if (r === undefined) return null;
  return { origineContact: (r.origine_contact as OrigineContact | null) ?? null, origineContactPrecision: (r.origine_contact_precision as string | null) ?? null,
    apporteurId: nombre(r.apporteur_id), collegueId: nombre(r.collegue_id), empreinte: empreinteOrigine(r), avecGestion: r.avec_gestion === true, bien: await origineDuBien(nombre(r.lot_id)) };
}

/**
 * 🔴 Arno (25/10/2026) — BLOC 9 « ORIGINE DU CONTACT » DE LA FICHE DU BIEN (ouverte depuis le Suivi du mois) : écrit l'origine sur la
 * LOCATION de la ligne (la même donnée que le bloc 4), indépendamment du bien. Conflit : l'origine a changé depuis l'ouverture → refusé.
 * Le propriétaire n'est jamais touché. Les règles de la ligne restent celles du bloc 4 (« Relocation » seulement avec la case).
 */
export async function modifierOrigineActivite(activiteId: number, brut: unknown, empreinte: unknown, auteur: Auteur): Promise<IssueOrigine<{ mot: string }>> {
  if (!(await colonneExisteMemo('gestion_location_activite', 'origine_contact'))) return SANS_SCHEMA;
  if (!Number.isSafeInteger(activiteId) || activiteId <= 0) return { etat: 'refus', motif: 'Ligne inconnue.' };
  const c = verifierCommercial((brut ?? {}) as Record<string, unknown>, true);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  const v = c.valeurs;
  const ecran = traceCourante()?.ecran ?? 'Fiche du bien (Suivi du mois)';
  return withTransaction(async (qq) => {
    const q = qq as unknown as Q;
    const avecPrecision = await colonneExisteMemo('gestion_location_activite', 'origine_contact_precision');
    const r = (await q(`SELECT origine_contact, ${avecPrecision ? 'origine_contact_precision' : 'NULL::text AS origine_contact_precision'}, apporteur_id, collegue_id, avec_gestion, mandat_gestion
                          FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE`, [activiteId])).rows[0];
    if (r === undefined) return { etat: 'refus', motif: 'Cette location n’existe plus.' } as const;
    if (typeof empreinte !== 'string' || empreinte !== empreinteOrigine(r)) {
      return { etat: 'conflit', motif: 'L’origine de cette location a été modifiée depuis l’ouverture de la fiche : rien n’a été enregistré. Fermez et rouvrez la fiche.' } as const;
    }
    if (v.origineContact === 'relocation' && r.avec_gestion !== true) return { etat: 'refus', motif: 'L’origine « Relocation » n’existe qu’avec la case « Relocation » de la location.' } as const;
    if (v.origineContact === 'personnalise' && !avecPrecision) return { etat: 'refus', motif: 'L’origine « Personnalisé » demande la mise à jour de la base (migration 411).' } as const;
    const avant = libelleOrigineContact((r.origine_contact as OrigineContact | null) ?? null, r.origine_contact_precision as string | null) || 'à renseigner';
    const apres = libelleOrigineContact(v.origineContact, v.origineContactPrecision);
    const collegueLibelle = v.origineContact === 'collegue' ? await nomCollegue(q, v.collegueId) : null;
    if (v.origineContact === 'collegue' && collegueLibelle === null) return { etat: 'refus', motif: 'Le collègue est inconnu.' } as const;
    if (v.apporteurId !== null && nombre(r.apporteur_id) !== v.apporteurId) {
      // Le même contrôle que le bloc 4 : un apporteur archivé ou « à rattacher » ne se choisit pas.
      const interne = (await colonneExisteMemo('gestion_location_apporteur', 'compte_id')) ? 'a.compte_id IS NOT NULL OR ' : '';
      const ap = (await q(`SELECT archive_le IS NOT NULL AS archive, (${interne}EXISTS (SELECT 1 FROM gestion_location_apporteur_collegue WHERE apporteur_id = a.id)) AS rattache
                             FROM gestion_location_apporteur a WHERE id = $1`, [v.apporteurId])).rows[0];
      if (ap === undefined) return { etat: 'refus', motif: 'Apporteur inconnu.' } as const;
      if (ap.archive === true || ap.rattache !== true) return { etat: 'refus', motif: 'Cet apporteur est « à rattacher » : rattachez-le d’abord à un collègue (roue Paramètres → Apporteurs).' } as const;
    }
    // Un AUTRE apporteur (ou plus d'apporteur) : son taux et le montant saisi repartent de l'annuaire ; le même : inchangés.
    await q(`UPDATE gestion_location_activite SET origine_contact = $2, ${avecPrecision ? 'origine_contact_precision = $3,' : ''} apporteur_id = $4, collegue_id = $5,
                    apporteur_taux = CASE WHEN $4::bigint IS NULL OR apporteur_id IS DISTINCT FROM $4::bigint THEN NULL ELSE apporteur_taux END,
                    apporteur_commission_saisie = CASE WHEN $4::bigint IS NULL OR apporteur_id IS DISTINCT FROM $4::bigint THEN NULL ELSE apporteur_commission_saisie END,
                    collegue_libelle = $6, modifie_le = now(), modifie_par_libelle = $7 WHERE id = $1${avecPrecision ? '' : ' AND ($3::text IS NULL OR TRUE)'}`,
    [activiteId, v.origineContact, v.origineContactPrecision, v.apporteurId, v.collegueId, collegueLibelle, auteur.libelle]);
    if (avant !== apres || empreinte !== empreinteOrigine({ origine_contact: v.origineContact, origine_contact_precision: v.origineContactPrecision, apporteur_id: v.apporteurId, collegue_id: v.collegueId })) {
      await journaliserActivite(q, activiteId, 'location_suivi_ligne_modifiee', avant, apres, `${ecran} — Origine du contact : ${avant} → ${apres}`, auteur);
    }
    return { etat: 'ok', data: { mot: apres } } as const;
  });
}
