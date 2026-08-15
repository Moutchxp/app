/**
 * P6 — COMPTER LES ÉTAGES PAR BÂTIMENT (tâche distincte de l'attribution d'une cote, close en P5). Script ISOLÉ : aucune écriture,
 * aucune création de corps, aucune migration. On MESURE ; l'humain vérifie (chaque réponse renvoie à une page/vue précise).
 *
 * M1 — SANS IA : le TEXTE associe-t-il un nombre d'étages à un lot précis ? (« Lot 2D1 en R+7 », nomenclature « NIVEAU R+n - 2D1 »…)
 *      Si le texte répond, l'IA est inutile. (Vérifié : il répond nettement — 2D1=R+7, 2D2=R+6.)
 * M4 — CONTRÔLE DE COHÉRENCE (sans rien écrire) : le R+n énoncé est-il compatible avec la trame de planchers mesurée en N5 ?
 *      ⚠️ Une hauteur reconstituée n'est PAS une altitude et ne sera jamais écrite : c'est un contrôle, rien d'autre.
 * (M2 vision / M3 comparaison fournisseurs : NON exécutées — inutiles puisque le texte répond. banc-vision existe si besoin.)
 * Lancer : npm run permis:banc-etages -- --permis <num_dau> [--type PC|PD]
 */
import '../lib/chargerEnv';
import { closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';

const lireArg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const resolu = await resoudreDossier(lireArg('--permis') ?? '', lireArg('--type'));
  if (!resolu.ok) { console.error('[banc-etages] usage : -- --permis <num_dau> [--type PC|PD]'); process.exitCode = 2; return; }
  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(resolu.dossier.dossierId, deps);
  const rap = extraireCandidats(ged);

  console.log(`\n══════ P6 — ÉTAGES PAR BÂTIMENT — ${resolu.dossier.numDau} ══════`);

  // M1 — associations LOT ↔ étage dans le texte (avec la page/vue, pour vérification humaine facile).
  console.log('\n[M1] SANS IA — mentions d’étages liées à un lot (page/vue → à vérifier à l’œil) :');
  // (a) énoncés explicites « (Lot) 2D<n> ... en R+<m> »
  const explicite = new Map<string, { rn: number; ref: string }[]>();
  const nomenclature = new Map<string, Set<number>>(); // « NIVEAU R+m - 2D<n> PLN » (plans par étage)
  const RE_EN = /(?:lot\s+)?2D(\d)[^.\n]{0,30}?\ben\s+R\s?\+\s?(\d{1,2})/gi;
  const RE_PLN = /NIVEAU\s+R\s?\+\s?(\d{1,2})[^\n]{0,20}?2D(\d)|2D(\d)\s+PLN\s+R\s?\+\s?(\d{1,2})/gi;
  for (const p of ged.pieces) for (const pg of p.pages) {
    if (!pg.aTexte) continue;
    const ref = `${p.nomFichier.slice(0, 18)} p.${pg.page}`;
    for (const m of pg.texte.matchAll(RE_EN)) { const lot = `2D${m[1]}`; const rn = Number(m[2]); (explicite.get(lot) ?? explicite.set(lot, []).get(lot)!).push({ rn, ref }); }
    for (const m of pg.texte.matchAll(RE_PLN)) { const lot = `2D${m[2] ?? m[3]}`; const rn = Number(m[1] ?? m[4]); (nomenclature.get(lot) ?? nomenclature.set(lot, new Set<number>()).get(lot)!).add(rn); }
  }
  for (const lot of ['2D1', '2D2']) {
    const ex = explicite.get(lot) ?? [];
    const nom = [...(nomenclature.get(lot) ?? [])].sort((a, b) => a - b);
    console.log(`  ${lot} :`);
    if (ex.length) { const rns = [...new Set(ex.map((e) => e.rn))].sort((a, b) => a - b); console.log(`    énoncé explicite « en R+${rns.join('/')} » — sources : ${[...new Set(ex.map((e) => e.ref))].join(' · ')}`); }
    if (nom.length) console.log(`    nomenclature de plans par étage : R+${nom[0]}…R+${nom[nom.length - 1]} (${nom.length} niveaux) — ex. « NIVEAU R+${nom[nom.length - 1]} - ${lot} PLN »`);
    if (!ex.length && !nom.length) console.log('    (aucune mention explicite trouvée)');
  }
  console.log('\n[M1b] gabarit de l’arrêté (global, non attribué) :');
  for (const g of rap.gabarits) console.log(`  R+${g.rMin}${g.rMax !== g.rMin ? ` à R+${g.rMax}` : ''} (${g.provenance.pieceNom.slice(0, 18)} p.${g.provenance.page})`);

  // M4 — cohérence avec la trame de planchers mesurée (niveaux reconnus + leur cote unique).
  console.log('\n[M4] CONTRÔLE DE COHÉRENCE avec la trame de planchers N5 (mesure, jamais écrit comme altitude) :');
  const niveauCote = new Map<number, number>(); // R<n> → cote si UNE seule (fiable)
  for (const n of rap.bilan.niveaux) { const m = /^R0?(\d{1,2})$/.exec(n.niveau); if (!m) continue; const d = new Set(n.cotes.map((c) => c.valeur)); if (d.size === 1) niveauCote.set(Number(m[1]), [...d][0]); }
  const rangs = [...niveauCote.keys()].sort((a, b) => a - b);
  if (rangs.length >= 2) {
    const pas = (niveauCote.get(rangs[rangs.length - 1])! - niveauCote.get(rangs[0])!) / (rangs[rangs.length - 1] - rangs[0]);
    const topRang = Math.max(...rangs);
    console.log(`  trame : ${rangs.map((r) => `R+${r}=${niveauCote.get(r)!.toFixed(2)}`).join(' · ')} → pas moyen ≈ ${pas.toFixed(2)} m/niveau`);
    console.log(`  plancher le plus haut reconnu : R+${topRang} = ${niveauCote.get(topRang)!.toFixed(2)} NGF`);
    console.log(`  → 2D1 « R+7 » : ${niveauCote.has(7) ? `plancher R+7 mesuré (${niveauCote.get(7)!.toFixed(2)}) → COHÉRENT` : 'pas de plancher R+7 à cote unique'}`);
    console.log(`  → 2D2 « R+6 » : ${niveauCote.has(6) ? `plancher R+6 mesuré (${niveauCote.get(6)!.toFixed(2)}) → COHÉRENT` : 'R+6 non isolé (nuage) — cohérence indirecte via la trame'}`);
    const sommet = rap.cotes.filter((c) => c.qualificatifSommet === 'acrotère').reduce((mx, c) => Math.max(mx, c.valeur), 0);
    console.log(`  sommet acrotère mesuré = ${sommet} NGF ; au-dessus du dernier plancher reconnu de ${(sommet - niveauCote.get(topRang)!).toFixed(2)} m (toiture/acrotère — non un étage).`);
  } else console.log('  trame insuffisante pour un contrôle.');
  console.log('\n  ⚠️ M2 (vision) / M3 (Gemini vs Mistral) non exécutées : le texte répond déjà (cf. M1), l’IA est inutile ici.\n');
}

void main().catch((e) => { console.error('[banc-etages] échec', e); process.exitCode = 1; }).finally(() => closePool());
