/**
 * ══ 🔴 TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) — LA SOCIÉTÉ DES COMPTES EXISTANTS, DÉDUITE DES FICHIERS IMPORTÉS ══════════
 *
 * Un onglet des fichiers CRITERIMMO ⇒ CRITERIMMO ; MACJ ⇒ MACJ (les lignes écrites par `transaction:importer`). Un onglet se rattache à
 * un compte par son prénom (ou « prénom nom ») quand UN SEUL compte correspond. Une personne présente dans les deux sociétés n'est PAS
 * tranchée : elle est listée « à trancher » (la question est posée à Arno). Les comptes sans onglet restent « à renseigner ».
 *
 * 🔴 À BLANC PAR DÉFAUT : lit, déduit, écrit son rapport ; aucune écriture en base. `--appliquer` pose, pour chaque compte déduit qui n'a
 * pas encore de société, une période « déduite des fichiers importés » à compter du 01/01/2000 (elle vaut pour tout le passé ; un
 * changement ultérieur s'ajoute par la page Comptes) — signée, retirable (`retire_le`), jamais une suppression. Rejouer ne réécrit rien.
 * Exige les migrations 433 et 434. Le rapport va dans `.captures/transaction-societes/` (jamais sur le Bureau).
 *
 *   npm run transaction:societes -- [--appliquer] [--rapport=/chemin]
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { deduireSocietes, ongletsDesDeuxSocietes, type OngletImporte } from '../lib/transaction/societeNegociateur';
import { LIBELLE_SOCIETE, type Societe } from '../lib/transaction/modele';

const P = '[transaction:societes]';
export const DEPUIS_DEDUCTION = '2000-01-01';
export const MOTIF_DEDUCTION = 'déduite des fichiers importés (onglets des tableaux de bord)';

async function main(argv: readonly string[]): Promise<number> {
  const appliquer = argv.includes('--appliquer');
  const { query, closePool } = await import('../lib/db/client');
  const { repartitionDisponible } = await import('../lib/admin/schemaDroits');
  const { definirSocieteCompte } = await import('../lib/admin/societeCompte');
  const l: string[] = [`${P} ${appliquer ? 'APPLIQUER' : 'À BLANC (rien n’est écrit ; --appliquer pour écrire)'} — ${new Date().toISOString()}`];
  try {
    if (!(await repartitionDisponible())) { l.push('Migration 434 non appliquée : rien à faire.'); return fin(l, argv, 1); }
    const { rows: comptes } = await query<{ id: string; prenom: string; nom: string; identifiant: string; actif: boolean }>(
      'SELECT id, prenom, nom, identifiant, actif FROM admin_utilisateur ORDER BY id');
    const { rows: occ } = await query<{ onglet: string; societe: Societe; lignes: string }>(
      `SELECT negociateur AS onglet, societe, sum(n)::text AS lignes FROM (
         SELECT l.negociateur, v.societe, count(*) AS n FROM transaction_vente_ligne l JOIN transaction_vente v ON v.id = l.vente_id
          WHERE l.origine = 'import' AND l.retire_le IS NULL AND v.retire_le IS NULL GROUP BY 1, 2
         UNION ALL
         SELECT negociateur, societe, count(*) FROM transaction_retrocession WHERE origine = 'import' AND retire_le IS NULL GROUP BY 1, 2) x
        GROUP BY 1, 2 ORDER BY 1, 2`);
    const onglets: OngletImporte[] = occ.map((o) => ({ onglet: o.onglet, societe: o.societe, lignes: Number(o.lignes) }));
    const { rows: deja } = await query<{ compte_id: string }>('SELECT DISTINCT compte_id FROM transaction_societe_compte WHERE retire_le IS NULL');
    const avecSociete = new Set(deja.map((r) => Number(r.compte_id)));
    const r = deduireSocietes(comptes.map((c) => ({ id: Number(c.id), prenom: c.prenom, nom: c.nom })), onglets);
    const decrire = (os: OngletImporte[]): string => os.map((o) => `« ${o.onglet} » ${LIBELLE_SOCIETE[o.societe]} (${o.lignes} ligne(s))`).join(', ');
    const ident = (id: number): string => { const c = comptes.find((x) => Number(x.id) === id)!; return `${c.prenom} ${c.nom} <${c.identifiant}>${c.actif ? '' : ' (désactivé)'}`; };
    l.push('', 'ONGLETS IMPORTÉS :', ...onglets.map((o) => `  ${o.onglet.padEnd(16)} ${LIBELLE_SOCIETE[o.societe].padEnd(11)} ${o.lignes} ligne(s)`));
    l.push('', 'COMPTES :');
    let ecrits = 0;
    for (const d of r.deductions) {
      if (d.sorte === 'deduite') {
        const etat = avecSociete.has(d.compte.id) ? 'déjà renseignée : non touchée' : appliquer ? 'ÉCRITE' : 'à écrire (--appliquer)';
        l.push(`  ✔ ${ident(d.compte.id)} → ${LIBELLE_SOCIETE[d.societe]} — ${decrire(d.onglets)} — ${etat}`);
        if (appliquer && !avecSociete.has(d.compte.id)) {
          const e = await definirSocieteCompte(d.compte.id, d.societe, DEPUIS_DEDUCTION, { id: null, libelle: 'transaction:societes' }, 'deduction', MOTIF_DEDUCTION);
          if (e.ok) ecrits += 1; else l.push(`      ⛔ ${e.motif}`);
        }
      } else if (d.sorte === 'a_trancher') l.push(`  ? ${ident(d.compte.id)} → À TRANCHER (présent dans les deux sociétés) — ${decrire(d.onglets)}`);
      else l.push(`  · ${ident(d.compte.id)} → aucun onglet : société à renseigner dans Comptes`);
    }
    const deux = ongletsDesDeuxSocietes(onglets);
    l.push('', `PRÉSENTS DANS LES DEUX SOCIÉTÉS (à trancher par Arno) : ${deux.length === 0 ? 'aucun' : deux.join(', ')}`);
    if (r.ambigus.length > 0) l.push('', 'ONGLETS AMBIGUS (plusieurs comptes possibles, non rattachés) :', ...r.ambigus.map((a) => `  « ${a.onglet.onglet} » : ${a.comptes.map((c) => ident(c.id)).join(' / ')}`));
    l.push('', `ONGLETS SANS COMPTE : ${r.sansCompte.length === 0 ? 'aucun' : [...new Set(r.sansCompte.map((o) => o.onglet))].join(', ')}`);
    l.push('', appliquer ? `${ecrits} société(s) écrite(s).` : 'À blanc : rien n’a été écrit.');
    return fin(l, argv, 0);
  } finally {
    await closePool();
  }
}

function fin(l: string[], argv: readonly string[], code: number): number {
  const chemin = cheminRapport({ nomScript: 'transaction-societes', demande: optionLigne(argv, 'rapport') });
  const texte = l.join('\n');
  writeFileSync(chemin, texte, 'utf8');
  console.log(texte);
  console.log(`${P} rapport : ${chemin}`);
  return code;
}

if (estPointEntree(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(P, e); process.exit(1); });
}
