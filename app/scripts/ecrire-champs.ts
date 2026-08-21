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
import { decisionCerfa, type ChampCerfa, type AdresseTerrainSitadel } from '../lib/permis/decisionCerfa';
import { ecrireCerfa } from '../lib/permis/ecritureCerfa';
import { decisionDesignation, type PagePermis } from '../lib/permis/decisionDesignation';
import { ecrireDesignation } from '../lib/permis/ecritureDesignation';
import { extraireGabaritDossier, ecrireGabaritPlu } from '../lib/permis/ecritureGabaritPlu';

const MAJ_PAR = 'extraction:champs';
const MAJ_PAR_CERFA = 'extraction:cerfa';
const MAJ_PAR_DESIGNATION = 'extraction:designation';
const MAJ_PAR_GABARIT = 'extraction:gabarit-plu';

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

/** Adresse terrain de Sitadel en 3 colonnes (numéro / voie / localité) — pour recouper champ par champ. */
async function lireAdresseTerrainSitadel(dossierId: number): Promise<AdresseTerrainSitadel | null> {
  const { rows } = await query<{ numero: string | null; voie: string | null; localite: string | null }>(
    `SELECT adr_num_ter AS numero, adr_libvoie_ter AS voie, adr_localite_ter AS localite FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  return rows[0] ?? null;
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
  const adresseSitadel = await lireAdresseTerrainSitadel(dossierId);
  const decisionC = decisionCerfa(champsCerfa, surfCreee, adresseSitadel);
  const rc = await ecrireCerfa(dossierId, decisionC, MAJ_PAR_CERFA);

  const adrSitLabel = adresseSitadel ? [adresseSitadel.numero, adresseSitadel.voie, adresseSitadel.localite].filter(Boolean).join(' ') : '—';
  console.log(`\n── SOURCE : cerfa (champs AcroForm, niveau permis) — surf_creee Sitadel : ${surfCreee ?? '—'} · adresse Sitadel : ${adrSitLabel} :`);
  for (const d of decisionC.champs) {
    if (d.statut === 'ecrit') {
      console.log(`  √ ${d.colonne} = ${d.valeur} — confiance ${d.confiance}${d.reserve ? `  ⚠ ${d.reserve}` : ''}  [${d.provenance?.pieceNom} « ${d.provenance?.champNom} »]`);
    } else {
      console.log(`  ✗ ${d.colonne} — ${d.motif}`);
    }
  }
  console.log(`  → écrits : ${rc.champsEcrits.length ? rc.champsEcrits.join(', ') : 'aucun'}${rc.champsIgnoresSaisie.length ? ` · non écrasés (saisie) : ${rc.champsIgnoresSaisie.join(', ')}` : ''}.`);

  // ── N10-H — SOURCE énoncé : DÉSIGNATION de l'opération (ligne libellée du corpus, niveau permis) ──
  const pages: PagePermis[] = ged.pieces.flatMap((p) => p.pages.filter((pg) => pg.aTexte).map((pg) => ({ piece: p.nomFichier, page: pg.page, texte: pg.texte })));
  const decisionD = decisionDesignation(pages);
  const rd = await ecrireDesignation(dossierId, decisionD, MAJ_PAR_DESIGNATION);
  console.log(`\n── SOURCE : énoncé (désignation de l'opération, niveau permis) :`);
  if (decisionD.statut === 'retenue') {
    console.log(`  √ designation = « ${decisionD.valeur} »  [${decisionD.piece} p.${decisionD.page}]${rd.ignoreSaisie ? '  (non écrasée : une saisie occupe le champ)' : ''}`);
  } else {
    console.log(`  ✗ designation — ${decisionD.motif}`);
  }

  // ── N10-I — SOURCE plan : HAUTEUR MAXIMALE PLU lue par POSITION sur les planches (niveau corps) ──
  const candidatsGabarit = await extraireGabaritDossier(dossierId, deps);
  const rg = await ecrireGabaritPlu(dossierId, candidatsGabarit, MAJ_PAR_GABARIT);
  console.log(`\n── SOURCE : plan (hauteur max PLU par position, ${rg.nbCorps} corps) :`);
  if (rg.agg.statut === 'aucune') {
    console.log(`  ✗ aucune planche ne porte « hauteur maximale PLU » à portée d'une cote NGF`);
  } else if (rg.agg.statut === 'concordante') {
    console.log(`  √ concordant : ${rg.agg.valeur} m NGF sur ${rg.nbCandidats} planche(s) — ${rg.ecrit ? 'écrit (extraite)' : rg.nbCorps === 1 ? 'non écrit (saisie prioritaire)' : `non écrit (${rg.nbCorps} corps → proposé, pas réparti)`}`);
  } else {
    console.log(`  ⚠ DIVERGENT (le gabarit NGF varie selon le plateau de nivellement) — rien d'écrit, chaque valeur journalisée :`);
    for (const g of rg.agg.groupes) console.log(`      ${g.valeur} m NGF — ${g.sources.map((s) => `${s.planche} p.${s.page}`).join(', ')}`);
  }
  console.log('');
}

void main()
  .catch((e) => { console.error('[permis:ecrire-champs] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
