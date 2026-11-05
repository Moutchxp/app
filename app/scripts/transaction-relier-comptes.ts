/**
 * CLI `transaction:relier-comptes` — 🔴 MON ESPACE (Arno, 05/11/2026) : poser le COMPTE du négociateur sur les lignes de commission et les
 * rétrocessions EXISTANTES (migration 458), pour qu'un collaborateur retrouve ses affaires même si un second compte homonyme apparaît.
 *
 * 🔴 ESSAI PAR DÉFAUT : par libellé, le nombre de lignes encore sans compte, et le compte SÛR (rattachement posé par Arno, ou libellé égal au
 *    « prénom nom », « nom prénom » ou à l'adresse d'UN SEUL compte) — ou la raison pour laquelle aucun compte n'est posé (prénom seul,
 *    homonyme, nom inconnu). Rapport dans `.captures/transaction-relier-comptes/` ; RIEN en base.
 * 🔴 ÉCRITURE seulement avec `--ecrire` : ne remplit QUE les cases vides (`compte_id IS NULL`), ne touche jamais au texte d'origine ; chaque
 *    ligne rattachée est journalisée (`transaction_journal`, action « compte »). Un cas douteux n'est JAMAIS deviné : il ne s'écrit que si Arno
 *    l'a tranché, passé explicitement par `--confirme="PIERRE=p.thevenin@sansvisavis.com,ARNAUD=2"` : libellé = ADRESSE E-MAIL du compte
 *    (Arno, 05/11/2026 — les numéros diffèrent d'une base à l'autre) ou son numéro. Une adresse inconnue, ou portée par deux comptes : REFUS,
 *    rien n'est écrit. L'essai montre, pour chaque libellé, le compte trouvé et le nombre de lignes qui lui seraient reliées.
 *
 * Usage :
 *   npm run transaction:relier-comptes                      (essai)
 *   npm run transaction:relier-comptes -- --ecrire          (cas sûrs seulement)
 *   npm run transaction:relier-comptes -- --confirme="PIERRE=p.thevenin@sansvisavis.com"   (essai : compte trouvé, lignes reliées)
 *   npm run transaction:relier-comptes -- --ecrire --confirme="PIERRE=p.thevenin@sansvisavis.com"
 *   option : --rapport=/chemin (fichier ou dossier) ; --sans-rapport : aucun fichier écrit, tout à l'écran (sur le serveur)
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';

const NOM_SCRIPT = 'transaction-relier-comptes';
const P = '[transaction:relier-comptes]';

/** `--confirme="PIERRE=p.thevenin@x.fr,ARNAUD=2"` → [{ libelle, compte }] (compte = adresse e-mail ou numéro) ; une entrée illisible à part. PUR. */
export function lireConfirmations(brut: string | null): { ok: { libelle: string; compte: string }[]; illisibles: string[] } {
  const ok: { libelle: string; compte: string }[] = [];
  const illisibles: string[] = [];
  for (const morceau of (brut ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '')) {
    const i = morceau.lastIndexOf('=');
    const libelle = i <= 0 ? '' : morceau.slice(0, i).trim();
    const compte = i <= 0 ? '' : morceau.slice(i + 1).trim();
    const lisible = /^[1-9]\d{0,15}$/.test(compte) || /^[^\s@,;<>=]+@[^\s@,;<>=]+\.[^\s@,;<>=]+$/.test(compte);
    if (libelle === '' || !lisible) illisibles.push(morceau); else ok.push({ libelle, compte });
  }
  return { ok, illisibles };
}

/**
 * Chaque confirmation → SON compte : par adresse e-mail (casse et espaces ignorés) ou par numéro. Une adresse inconnue, ou portée par
 * PLUSIEURS comptes, un numéro inconnu : REFUS (avec la raison) — rien n'est deviné. PUR.
 */
export function resoudreConfirmations(conf: readonly { libelle: string; compte: string }[], comptes: readonly { id: number; identifiant: string; nom: string }[]):
  { ok: { libelle: string; compteId: number; nom: string; identifiant: string }[]; refus: string[] } {
  const ok: { libelle: string; compteId: number; nom: string; identifiant: string }[] = [];
  const refus: string[] = [];
  for (const c of conf) {
    const parNumero = /^\d+$/.test(c.compte);
    const trouves = parNumero ? comptes.filter((x) => x.id === Number(c.compte))
      : comptes.filter((x) => x.identifiant.trim().toLowerCase() === c.compte.trim().toLowerCase());
    if (trouves.length === 0) refus.push(`« ${c.libelle} » : ${parNumero ? `le compte n° ${c.compte}` : `l’adresse ${c.compte}`} n’existe pas.`);
    else if (trouves.length > 1) refus.push(`« ${c.libelle} » : l’adresse ${c.compte} est portée par ${trouves.length} comptes (${trouves.map((x) => x.id).join(', ')}) — rien n’est deviné.`);
    else ok.push({ libelle: c.libelle, compteId: trouves[0].id, nom: trouves[0].nom, identifiant: trouves[0].identifiant });
  }
  return { ok, refus };
}

export async function main(argv: readonly string[]): Promise<number> {
  const ecrire = argv.includes('--ecrire');
  const conf = lireConfirmations(optionLigne(argv, 'confirme'));
  const { query, withTransaction, closePool } = await import('../lib/db/client');
  const { negociateurCompteDisponible, planRattachementExistant } = await import('../lib/transaction/negociateurCompte');
  const l: string[] = [`${P} ${ecrire ? 'ÉCRITURE' : 'ESSAI (rien n’est écrit ; --ecrire pour écrire)'} — ${new Date().toISOString()}`];
  try {
    if (conf.illisibles.length > 0) { l.push(`⛔ --confirme illisible : ${conf.illisibles.join(' ; ')} (forme : LIBELLÉ=adresse e-mail ou LIBELLÉ=numéro). Rien n’est écrit.`); return fin(l, argv, 1); }
    const avec458 = await negociateurCompteDisponible();
    if (!avec458 && ecrire) { l.push('⛔ Migration 458 non appliquée : --ecrire refusé (l’essai, lui, fonctionne). Rien n’est écrit.'); return fin(l, argv, 1); }
    if (!avec458) l.push('ℹ️ Migration 458 non appliquée : ESSAI seulement — lignes comptées par libellé, rien ne peut être écrit avant la mise à jour de la base.');
    const comptes = (await query<{ id: string; identifiant: string; nom: string }>(
      `SELECT id::text, identifiant, concat_ws(' ', prenom, nom) AS nom FROM admin_utilisateur`)).rows.map((c) => ({ ...c, id: Number(c.id) }));
    const nomDe = (id: number): string => { const c = comptes.find((x) => x.id === id); return c === undefined ? `compte ${id} INCONNU` : `${c.nom} <${c.identifiant}>`; };
    const resolues = resoudreConfirmations(conf.ok, comptes);
    if (resolues.refus.length > 0) { l.push('⛔ --confirme refusé — rien n’est écrit :', ...resolues.refus.map((x) => `   · ${x}`)); return fin(l, argv, 1); }
    const lu = avec458 ? await planRattachementExistant() : await planSans458(query);
    if (resolues.ok.length > 0) {
      l.push('', 'CONFIRMATIONS D’ARNO (--confirme) : LIBELLÉ → COMPTE TROUVÉ → CE QUI SERAIT RELIÉ (lignes et rétrocessions sans compte aujourd’hui)');
      for (const c of resolues.ok) {
        const compte = (table: 'ligne' | 'retrocession'): number => lu.filter((x) => x.table === table && x.libelle === c.libelle && x.compteId === null).reduce((t, x) => t + x.lignes, 0);
        const [lignes, retros] = [compte('ligne'), compte('retrocession')];
        l.push(`   « ${c.libelle} » → compte ${c.compteId} ${c.nom} <${c.identifiant}> → ${lignes} ligne(s) de commission, ${retros} rétrocession(s)`
          + `${lignes + retros === 0 ? ' (rien à relier à ce libellé : vérifiez l’orthographe exacte, ou déjà rattaché)' : ''}`);
      }
    }
    const plan = lu.map((x) => {
      const confirme = x.compteId === null ? resolues.ok.find((c) => c.libelle === x.libelle) : undefined;
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

/** Sans la 458 : le même plan, toutes les lignes comptées par libellé (aucune n'a encore de compte). LECTURE SEULE. */
async function planSans458(query: typeof import('../lib/db/client').query): Promise<{ table: 'ligne' | 'retrocession'; libelle: string; lignes: number; compteId: number | null; raison: string }[]> {
  const { rattacherLibelle } = await import('../lib/location/suivi/negociateurIdentite');
  const { lireAliasNegociateurs, lireComptesNegociateurs } = await import('../lib/location/suivi/negociateurIdentiteRepo');
  const [comptes, alias] = await Promise.all([lireComptesNegociateurs(), lireAliasNegociateurs().catch(() => [])]);
  const lus = await Promise.all([
    query<{ libelle: string; n: string }>(`SELECT negociateur AS libelle, count(*)::text AS n FROM transaction_vente_ligne WHERE retire_le IS NULL GROUP BY 1 ORDER BY 1`),
    query<{ libelle: string; n: string }>(`SELECT negociateur AS libelle, count(*)::text AS n FROM transaction_retrocession WHERE retire_le IS NULL GROUP BY 1 ORDER BY 1`),
  ]);
  return (['ligne', 'retrocession'] as const).flatMap((table, i) => lus[i].rows.map((r) => {
    const x = rattacherLibelle(r.libelle, comptes, alias);
    const compteId = x.sorte === 'compte' || x.sorte === 'alias' || x.sorte === 'auto' ? x.compteId : null;
    return { table, libelle: r.libelle, lignes: Number(r.n), compteId,
      raison: compteId !== null ? 'nom exact ou adresse d’un seul compte' : x.sorte === 'ambigu' ? `ambigu : comptes ${x.candidats.join(', ')}` : 'aucun compte sûr (prénom seul, nom inconnu ou sans compte)' };
  }));
}

function fin(l: string[], argv: readonly string[], code: number): number {
  const texte = l.join('\n');
  console.log(texte);
  // Sur le serveur : `--sans-rapport` — tout est à l'écran, AUCUN fichier n'est écrit.
  if (argv.includes('--sans-rapport')) return code;
  const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
  writeFileSync(chemin, `${texte}\n`);
  console.log(`${P} rapport : ${chemin}`);
  return code;
}

if (estPointEntree(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1); });
}
