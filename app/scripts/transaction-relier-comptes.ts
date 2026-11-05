/**
 * CLI `transaction:relier-comptes` — 🔴 MON ESPACE (Arno, 05/11/2026) : poser le COMPTE du négociateur sur les lignes de commission et les
 * rétrocessions EXISTANTES (migration 458), pour qu'un collaborateur retrouve ses affaires même si un second compte homonyme apparaît.
 *
 * 🔴 ESSAI PAR DÉFAUT : par libellé, le nombre de lignes encore sans compte, et le compte SÛR (rattachement posé par Arno, ou libellé égal au
 *    « prénom nom », « nom prénom » ou à l'adresse d'UN SEUL compte) — ou la raison pour laquelle aucun compte n'est posé (prénom seul,
 *    homonyme, nom inconnu). Rapport dans `.captures/transaction-relier-comptes/` ; RIEN en base.
 * 🔴 ÉCRITURE seulement avec `--ecrire` : ne remplit QUE les cases vides (`compte_id IS NULL`), ne touche jamais au texte d'origine ; chaque
 *    ligne rattachée est journalisée (`transaction_journal`, action « compte »). Un cas douteux n'est JAMAIS deviné : il ne s'écrit que si Arno
 *    l'a tranché, passé explicitement par `--confirme="PIERRE=8,ARNAUD=2"` (libellé = identifiant du compte).
 *
 * Usage :
 *   npm run transaction:relier-comptes                      (essai)
 *   npm run transaction:relier-comptes -- --ecrire          (cas sûrs seulement)
 *   npm run transaction:relier-comptes -- --ecrire --confirme="PIERRE=8"
 *   option : --rapport=/chemin (fichier ou dossier)
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

const NOM_SCRIPT = 'transaction-relier-comptes';
const P = '[transaction:relier-comptes]';

/** `--confirme="PIERRE=8,ARNAUD=2"` → [{ libelle, compteId }] ; une entrée illisible est rendue à part. PUR. */
export function lireConfirmations(brut: string | null): { ok: { libelle: string; compteId: number }[]; illisibles: string[] } {
  const ok: { libelle: string; compteId: number }[] = [];
  const illisibles: string[] = [];
  for (const morceau of (brut ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '')) {
    const i = morceau.lastIndexOf('=');
    const libelle = i <= 0 ? '' : morceau.slice(0, i).trim();
    const id = i <= 0 ? NaN : Number(morceau.slice(i + 1).trim());
    if (libelle === '' || !Number.isSafeInteger(id) || id <= 0) illisibles.push(morceau); else ok.push({ libelle, compteId: id });
  }
  return { ok, illisibles };
}

export async function main(argv: readonly string[]): Promise<number> {
  const ecrire = argv.includes('--ecrire');
  const conf = lireConfirmations(optionLigne(argv, 'confirme'));
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const { negociateurCompteDisponible, planRattachementExistant } = await import('../lib/transaction/negociateurCompte');
  const l: string[] = [`${P} ${ecrire ? 'ÉCRITURE' : 'ESSAI (rien n’est écrit ; --ecrire pour écrire)'} — ${new Date().toISOString()}`];
  try {
    if (conf.illisibles.length > 0) { l.push(`⛔ --confirme illisible : ${conf.illisibles.join(' ; ')} (forme : LIBELLÉ=identifiant). Rien n’est écrit.`); return fin(l, argv, 1); }
    if (!(await negociateurCompteDisponible())) { l.push('⛔ Migration 458 non appliquée : rien à faire.'); return fin(l, argv, 1); }
    const comptes = (await query<{ id: string; nom: string }>(`SELECT id::text, concat_ws(' ', prenom, nom) AS nom FROM admin_utilisateur`)).rows;
    const nomDe = (id: number): string => comptes.find((c) => Number(c.id) === id)?.nom ?? `compte ${id} INCONNU`;
    for (const c of conf.ok) if (!comptes.some((x) => Number(x.id) === c.compteId)) { l.push(`⛔ --confirme : le compte ${c.compteId} n’existe pas. Rien n’est écrit.`); return fin(l, argv, 1); }
    const plan = (await planRattachementExistant()).map((x) => {
      const confirme = x.compteId === null ? conf.ok.find((c) => c.libelle === x.libelle) : undefined;
      return confirme === undefined ? x : { ...x, compteId: confirme.compteId, raison: `tranché par Arno (--confirme) ; avant : ${x.raison}` };
    });
    l.push('', 'TABLE | LIBELLÉ | LIGNES SANS COMPTE | COMPTE POSÉ | RAISON');
    for (const x of plan) l.push(`${x.table} | ${JSON.stringify(x.libelle)} | ${x.lignes} | ${x.compteId === null ? '— (aucun)' : `${x.compteId} ${nomDe(x.compteId)}`} | ${x.raison}`);
    const aPoser = plan.filter((x) => x.compteId !== null);
    l.push('', `À poser : ${aPoser.reduce((t, x) => t + x.lignes, 0)} ligne(s) ; laissées sans compte (à trancher) : ${plan.filter((x) => x.compteId === null).reduce((t, x) => t + x.lignes, 0)}.`);
    if (!ecrire) return fin(l, argv, 0);
    const n = await withTransaction(async (q) => {
      let total = 0;
      for (const x of aPoser) {
        const table = x.table === 'ligne' ? 'transaction_vente_ligne' : 'transaction_retrocession';
        const { rows } = await q<{ id: string }>(
          `UPDATE ${table} SET compte_id = $2 WHERE retire_le IS NULL AND compte_id IS NULL AND negociateur = $1 RETURNING id`, [x.libelle, x.compteId]);
        for (const r of rows) {
          await q(`INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_id, auteur_libelle)
                   VALUES ($1, $2, 'compte', $3::jsonb, $4::jsonb, $5, NULL, $6)`,
            [x.table === 'ligne' ? 'vente_ligne' : 'retrocession', Number(r.id), JSON.stringify({ compte_id: null }), JSON.stringify({ compte_id: x.compteId }),
              `Compte du négociateur « ${x.libelle} » posé (migration 458) — ${x.raison} ; le texte d’origine est gardé.`, NOM_SCRIPT]);
        }
        total += rows.length;
      }
      return total;
    });
    l.push(`✅ ${n} ligne(s) rattachée(s) à leur compte ; aucun texte modifié, aucune case remplie écrasée.`);
    return fin(l, argv, 0);
  } finally { await closePool(); }
}

function fin(l: string[], argv: readonly string[], code: number): number {
  const texte = l.join('\n');
  console.log(texte);
  const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
  writeFileSync(chemin, `${texte}\n`);
  console.log(`${P} rapport : ${chemin}`);
  return code;
}

if (estPointEntree(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
