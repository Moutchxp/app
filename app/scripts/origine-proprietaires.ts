/**
 * CLI `location:origine-proprietaires` — L'ORIGINE DU CONTACT DES PROPRIÉTAIRES EXISTANTS (Arno, 25/10/2026, migration 425).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Pour chaque propriétaire dont l'origine n'est pas encore saisie : propose celle de ses locations (titulaire du bien) si elles sont
 * TOUTES IDENTIQUES — les locations vides, « Relocation » et « Propriétaire déjà client » sont ignorées (décision d'Arno) ; liste à part
 * les cas DIVERGENTS et VIDES, sans y toucher (`planOrigineProprietaires`). REJOUABLE : un propriétaire déjà renseigné n'est plus examiné.
 *
 * 🔴 ESSAI PAR DÉFAUT : il lit et écrit son rapport, aucune écriture en base. `--reel` écrit les origines proposées (seulement là où
 *    l'origine est encore vide), dans UNE transaction, et journalise chacune (`gestion_journal`, entité « annuaire ») — migration 425
 *    requise (sans elle, `--reel` est refusé). Aucune location n'est modifiée. Aucune action Drive.
 * 🔴 Le rapport va dans `.captures/origine-proprietaires/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:origine-proprietaires                 (essai)
 *   npm run location:origine-proprietaires -- --reel       (pour de bon)
 *   … -- --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { libelleOrigineProprietaire, planOrigineProprietaires, texteOrigineProprietaires, type OrigineProprietaire, type ProprietaireExamine } from '../lib/location/origineProprietaire';

const P = '[location:origine-proprietaires]';
const NOM_SCRIPT = 'origine-proprietaires';
const AUTEUR = `script ${NOM_SCRIPT}`;

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const colonne = async (t: string, c: string): Promise<boolean> => (await query<{ n: string }>(
      'SELECT count(*) AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).rows[0]?.n === '1';
    const avec425 = await colonne('gestion_annuaire_proprietaire', 'origine_contact');
    const avecPrecision = await colonne('gestion_location_activite', 'origine_contact_precision');
    if (reel && !avec425) throw new Error('migration 425 absente : l’origine du contact ne peut pas être écrite sur le propriétaire.');
    const vivant = (await colonne('gestion_annuaire_proprietaire', 'supprime_le')) ? ' AND p.supprime_le IS NULL' : '';
    const { rows: props } = await query<{ id: string; nom: string; origine: string | null }>(
      `SELECT p.id::text, p.nom_complet AS nom, ${avec425 ? 'p.origine_contact' : 'NULL::text'} AS origine
         FROM gestion_annuaire_proprietaire p WHERE p.absent_le IS NULL AND p.archive_le IS NULL${vivant} ORDER BY p.nom_normalise, p.id`);
    // Les locations de chaque propriétaire : celles dont il est le titulaire du bien (la même lecture que l'héritage).
    const { rows: locs } = await query<{ proprietaire: string; origine_contact: string | null; precision: string | null; apporteur_id: string | null; collegue_id: string | null; collegue_libelle: string | null }>(
      `SELECT coalesce(a.proprietaire_id, l.proprietaire_id)::text AS proprietaire, a.origine_contact,
              ${avecPrecision ? 'a.origine_contact_precision' : 'NULL::text'} AS precision, a.apporteur_id::text, a.collegue_id::text, a.collegue_libelle
         FROM gestion_location_activite a LEFT JOIN gestion_annuaire_lot l ON l.id = a.lot_id
        WHERE a.annule_le IS NULL AND coalesce(a.proprietaire_id, l.proprietaire_id) IS NOT NULL`);
    const parProp = new Map<number, ProprietaireExamine['locations']>();
    for (const r of locs) {
      const k = Number(r.proprietaire);
      parProp.set(k, [...(parProp.get(k) ?? []), { origineContact: r.origine_contact, origineContactPrecision: r.precision, apporteurId: r.apporteur_id, collegueId: r.collegue_id, collegueLibelle: r.collegue_libelle }]);
    }
    const examines: ProprietaireExamine[] = props.map((r) => ({ id: Number(r.id), nom: r.nom, origineActuelle: r.origine, locations: parProp.get(Number(r.id)) ?? [] }));
    const plan = planOrigineProprietaires(examines);
    const apporteurs = new Map((await query<{ id: string; nom: string }>('SELECT id::text, nom FROM gestion_location_apporteur')).rows.map((r) => [Number(r.id), r.nom]));
    const comptes = new Map((await query<{ id: string; n: string }>(
      `SELECT id::text, coalesce(nullif(btrim(concat_ws(' ', prenom, nom)), ''), identifiant) AS n FROM admin_utilisateur`)).rows.map((r) => [Number(r.id), r.n]));
    const mot = (o: OrigineProprietaire): string => o.origine === 'apporteur' ? `${libelleOrigineProprietaire(o.origine)} — ${apporteurs.get(o.apporteurId ?? 0) ?? `n° ${o.apporteurId}`}`
      : o.origine === 'collegue' ? `${libelleOrigineProprietaire(o.origine)} — ${o.collegueId !== null ? comptes.get(o.collegueId) ?? `compte n° ${o.collegueId}` : `${o.collegueLibelle ?? '—'} (sans compte)`}`
        : o.origine === 'personnalise' ? `Personnalisé : ${o.precision ?? ''}` : libelleOrigineProprietaire(o.origine);
    let ecrits = 0;
    if (reel) {
      ecrits = await withTransaction(async (q) => {
        let n = 0;
        for (const d of plan) {
          if (d.sorte !== 'proposee') continue;
          const o = d.origine;
          const fait = await q(`UPDATE gestion_annuaire_proprietaire SET origine_contact = $2, origine_contact_precision = $3, origine_apporteur_id = $4, origine_collegue_id = $5,
                                       origine_collegue_libelle = $6, origine_modifiee_le = now(), origine_modifiee_par_libelle = $7
                                 WHERE id = $1 AND origine_contact IS NULL RETURNING id`,
          [d.p.id, o.origine, o.precision, o.apporteurId, o.collegueId, o.origine === 'collegue' ? (o.collegueId !== null ? comptes.get(o.collegueId) ?? null : o.collegueLibelle ?? null) : null, AUTEUR]);
          if (fait.rows.length === 0) continue;
          await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                   VALUES ('annuaire', $1, 'annuaire_origine_contact', 'Origine du contact : à renseigner', $2, $3, NULL, $4)`,
          [d.p.id, `Origine du contact : ${mot(o)}`, `${NOM_SCRIPT} — origine reprise de ses ${d.nb} location(s), toutes identiques`, AUTEUR]);
          n += 1;
        }
        return n;
      });
    }
    const texte = texteOrigineProprietaires(plan, { reel, base, ecrits, mot });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}${avec425 ? '' : ' — migration 425 absente : essai seulement'}`);
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exitCode = 1; });
}
