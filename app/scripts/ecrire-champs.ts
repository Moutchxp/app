/**
 * N5-E — CLI d'ÉCRITURE généralisée : mesure TOUS les champs depuis le texte de la GED (décision N5-E) puis les ÉCRIT (dépôt
 * encadré, migrations 104/105 requises). Écrit en base : permis_corps_batiment (valeurs, origine 'extraite') +
 * permis_extraction_journal (retenue / candidat / ecartee AVEC MOTIF). Imprime, champ par champ, ce qui est écrit et ce qui ne
 * l'est pas AVEC son motif. Rien n'attend personne : la confiance et le motif vivent dans le journal.
 * Lancer : npm run permis:ecrire-champs -- --permis <num_dau> [--type PC|PD]. `chargerEnv` EN PREMIER (avant tout db/client).
 */
import '../lib/chargerEnv';
import { closePool, query } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionChamps } from '../lib/permis/decisionChamps';
import { ecrireChamps } from '../lib/permis/ecritureChamps';
import { lireChampsFormulaire } from '../lib/permis/champsFormulaire';
import { decisionCerfa, type ChampCerfa } from '../lib/permis/decisionCerfa';
import { ecrireCerfa } from '../lib/permis/ecritureCerfa';

const MAJ_PAR = 'extraction:champs';
const MAJ_PAR_CERFA = 'extraction:cerfa';

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

/** surf_creee de Sitadel pour ce dossier (m²), ou null. Sert au recoupement de la surface de plancher. */
async function lireSurfCreee(dossierId: number): Promise<number | null> {
  const { rows } = await query<{ surf: string | number | null }>(`SELECT surf_creee AS surf FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const v = rows[0]?.surf;
  return v === null || v === undefined ? null : Number(v);
}

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-champs -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const type = lireArg('--type');

  const resolu = await resoudreDossier(numDau, type);
  if (!resolu.ok) {
    if (resolu.raison === 'inconnu') console.error(`[permis:ecrire-champs] permis inconnu : « ${numDau} »${type ? ` (type ${type})` : ''}.`);
    else { console.error(`[permis:ecrire-champs] num_dau « ${numDau} » AMBIGU — précise --type parmi :`); for (const c of resolu.candidats) console.error(`    --type ${c.type}   (INSEE ${c.codeInsee})`); }
    process.exitCode = 2;
    return;
  }

  const dossierId = resolu.dossier.dossierId;
  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(dossierId, deps);
  const decision = decisionChamps(extraireCandidats(ged));
  const r = await ecrireChamps(dossierId, decision, MAJ_PAR);

  console.log(`\n══════ ÉCRITURE CHAMPS — permis ${resolu.dossier.numDau} (${resolu.dossier.type}) ══════`);
  console.log('── SOURCE : motifs (texte de la GED, niveau corps) — √ écrit · ✗ non écrit + motif :');
  for (const d of decision.champs) {
    if (d.statut === 'ecrit') {
      const u = d.unite ? ` ${d.unite}` : '';
      console.log(`  √ ${d.champ} = ${d.valeur}${u} — confiance ${d.confiance}${d.reserve ? `  ⚠ ${d.reserve}` : ''}`);
    } else {
      console.log(`  ✗ ${d.champ} — ${d.motif}`);
    }
  }
  if (r.statut === 'ambigu_plusieurs_corps') {
    console.log(`  ⚠ ALERTE : ${r.nbCorps} corps existants → attribution ambiguë, AUCUNE valeur écrite. Tout est journalisé (ecartee). Saisie humaine requise.`);
  } else {
    console.log(`  → corps #${r.corpsId ?? '—'}${r.corpsCree ? ' (créé)' : ''} — écrits : ${r.champsEcrits.length ? r.champsEcrits.join(', ') : 'aucun'}${r.champsIgnoresSaisie.length ? ` · non écrasés (saisie) : ${r.champsIgnoresSaisie.join(', ')}` : ''}.`);
  }

  // ── N7-D — SOURCE cerfa : champs AcroForm → colonnes déclarées (niveau permis, migration 106/107) ──
  const metas = await deps.listerPieces(dossierId);
  const champsCerfa: ChampCerfa[] = [];
  for (const m of metas) {
    let buf: Buffer;
    try { buf = await deps.lireObjet(m.cleStockage); } catch { continue; }
    for (const c of await lireChampsFormulaire(buf)) champsCerfa.push({ nom: c.nom, valeur: c.valeur, page: c.page, pieceNom: m.nomFichier });
  }
  const surfCreee = await lireSurfCreee(dossierId);
  const decisionC = decisionCerfa(champsCerfa, surfCreee);
  const rc = await ecrireCerfa(dossierId, decisionC, MAJ_PAR_CERFA);

  console.log(`\n── SOURCE : cerfa (champs AcroForm, niveau permis) — surf_creee Sitadel : ${surfCreee ?? '—'} :`);
  for (const d of decisionC.champs) {
    if (d.statut === 'ecrit') {
      console.log(`  √ ${d.colonne} = ${d.valeur} — confiance ${d.confiance}${d.reserve ? `  ⚠ ${d.reserve}` : ''}  [${d.provenance?.pieceNom} « ${d.provenance?.champNom} »]`);
    } else {
      console.log(`  ✗ ${d.colonne} — ${d.motif}`);
    }
  }
  console.log(`  → écrits : ${rc.champsEcrits.length ? rc.champsEcrits.join(', ') : 'aucun'}${rc.champsIgnoresSaisie.length ? ` · non écrasés (saisie) : ${rc.champsIgnoresSaisie.join(', ')}` : ''}.`);
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:ecrire-champs] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
