/**
 * N3-E — CLI : extrait et écrit les PARCELLES cadastrales d'un permis. Le Cerfa (bloc T2) fait foi, Sitadel corrobore ; l'IDU est
 * calculé via la commune cadastrale (arrondissement dérivé du numéro). Écrit dans `permis_parcelle` (origine 'extraite',
 * invariant saisie). Requiert migration 112 appliquée. NON lancé automatiquement — Arno le lance.
 * Lancer : npm run permis:ecrire-parcelles -- --permis <num_dau> [--type PC|PD].
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { resoudreDossier, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { lireChampsFormulaire } from '../lib/permis/champsFormulaire';
import { decisionParcelles, type ParcelleSitadel } from '../lib/permis/decisionParcelles';
import { ecrireParcelles, figerEmpreinte, figerBatiSnapshot } from '../lib/permis/parcellesRepo';
import type { ChampCerfa } from '../lib/permis/decisionCerfa';

const MAJ_PAR = 'cerfa:parcelles';
const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const numDau = lireArg('--permis');
  if (!numDau) { console.error('usage : npm run permis:ecrire-parcelles -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, lireArg('--type'));
  if (!resolu.ok) { console.error(`[permis:ecrire-parcelles] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const { dossierId, numDau: dau, codeInsee } = resolu.dossier;

  // Champs AcroForm du Cerfa (bloc T2).
  const deps = depsReellesLectureGed();
  const champsCerfa: ChampCerfa[] = [];
  for (const m of await deps.listerPieces(dossierId)) {
    let buf: Buffer; try { buf = await deps.lireObjet(m.cleStockage); } catch { continue; }
    for (const c of await lireChampsFormulaire(buf)) champsCerfa.push({ nom: c.nom, valeur: c.valeur, page: c.page, pieceNom: m.nomFichier });
  }
  // Parcelles Sitadel (sec/num_cadastre1..3).
  const { rows } = await query<{ s1: string | null; n1: string | null; s2: string | null; n2: string | null; s3: string | null; n3: string | null }>(
    `SELECT sec_cadastre1 AS s1, num_cadastre1 AS n1, sec_cadastre2 AS s2, num_cadastre2 AS n2, sec_cadastre3 AS s3, num_cadastre3 AS n3 FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const r = rows[0] ?? {};
  const sitadel: ParcelleSitadel[] = [[r.s1, r.n1], [r.s2, r.n2], [r.s3, r.n3]]
    .filter(([s, n]) => s && n).map(([s, n]) => ({ section: s as string, numero: n as string }));

  const decision = decisionParcelles(champsCerfa, sitadel, dau, codeInsee);

  console.log(`\n══════ PARCELLES — ${dau} (INSEE Sitadel ${codeInsee}) ══════`);
  for (const p of decision.parcelles) {
    console.log(`  ${p.section} ${p.numero}${p.superficieDeclareeM2 !== null ? ` — ${p.superficieDeclareeM2} m²` : ''} · IDU ${p.idu ?? '— (commune indéterminée)'} · ${p.confiance}${p.reserve ? `  ⚠ ${p.reserve}` : ''}  [${p.provenance}]`);
  }
  for (const e of decision.ecarts) console.log(`  ⚠ écart : ${e}`);
  if (decision.motif) console.log(`  ✗ ${decision.motif}`);

  const res = await ecrireParcelles(dossierId, decision.parcelles, MAJ_PAR);
  console.log(`\nÉcrit : ${res.ecrites} parcelle(s) ; ${res.ignorees} ignorée(s) (saisie prioritaire).`);

  // FUS-1 — fige le snapshot géométrique d'origine + calcule l'empreinte attendue (union). EMPREINTE ATTENDUE, pas prédiction.
  const emp = await figerEmpreinte(dossierId, MAJ_PAR);
  if (emp.complete) {
    console.log(`Empreinte attendue : ${emp.surfaceM2 !== null ? `${Math.round((emp.surfaceM2 + Number.EPSILON) * 10) / 10} m²` : '—'} (union de ${emp.nbParcelles} parcelle(s)${emp.millesime ? `, millésime ${emp.millesime}` : ''}).`);
  } else {
    console.log(`Empreinte attendue : incomplète — ${emp.motif}`);
  }

  // FUS-1b — photographie le bâti présent dans l'empreinte (footprint + cleabs). Ne fait QUE photographier : ni détection, ni alerte.
  const bati = await figerBatiSnapshot(dossierId, MAJ_PAR);
  if (!bati.capture) {
    console.log(`Bâti au moment de l'analyse : non figé — ${bati.motif}`);
  } else if ((bati.nbBatiments ?? 0) === 0) {
    console.log(`Bâti au moment de l'analyse : terrain nu — 0 bâtiment dans l'empreinte${bati.sourceMillesime ? ` (couche bâti au ${bati.sourceMillesime})` : ''}.`);
  } else {
    console.log(`Bâti au moment de l'analyse : ${bati.nbBatiments} bâtiment(s)${bati.sourceMillesime ? ` (couche bâti au ${bati.sourceMillesime})` : ''}.`);
    for (const b of bati.batiments) {
      const det = [b.nombreEtages !== null ? `${b.nombreEtages} étage(s)` : null, b.altitudeMaxToit !== null ? `toit ${b.altitudeMaxToit} m NGF` : null].filter(Boolean).join(', ');
      console.log(`  · ${b.cleabs ?? '(cleabs inconnu)'}${det ? ` — ${det}` : ' — étages/altitude non renseignés'}`);
    }
  }
  console.log('');
}

void main().catch((e) => { console.error('[permis:ecrire-parcelles] échec', e); process.exitCode = 1; }).finally(() => closePool());
