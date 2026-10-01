/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — RANGER LES DOCUMENTS AUTOMATIQUES DANS LEUR FICHE ═════════════════════
 *
 *   npm run gestion:documents:ranger                → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:documents:ranger -- --appliquer  → elle écrit (et exige la migration 291)
 *
 * 🔴 SANS LA MIGRATION 291, L'APPLICATION NE FAIT RIEN et le dit. La simulation, elle, tourne toujours : c'est
 * elle qui donne les chiffres à Arno avant qu'il décide d'appliquer quoi que ce soit.
 */
import { rangerLesDocuments } from '../lib/gestion/documentsAutoRepo';
import { documentsAutoDisponible } from '../lib/gestion/schema';
import { query, closePool } from '../lib/db/client';

const P = '  ';

async function confirmesSurBiens(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_rattachement
      WHERE statut = 'confirme' AND cible_sorte = 'lot' AND piece_id IS NULL`);
  return rows[0]?.n ?? 0;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const prete = await documentsAutoDisponible();
  console.log(`\nmigration 291 : ${prete ? 'APPLIQUÉE' : 'non appliquée'}`);
  if (appliquer && !prete) {
    console.error('\n🔴 La migration 291 n’est pas appliquée : rien ne sera rangé.');
    console.error('   Elle est livrée dans db/migrations/291_gestion_document_auto_par_fiche.sql.');
    console.error('   Elle ne s’applique que sur accord explicite d’Arno.');
    process.exit(1);
  }

  const biensAvant = await confirmesSurBiens();
  const c = await rangerLesDocuments({ appliquer });

  console.log(`\n${appliquer ? 'APPLICATION' : 'SIMULATION'} — ${c.examines} documents examinés`);
  const pc = (n: number) => `${Math.round((n / Math.max(c.examines, 1)) * 100)} %`;
  const certaines = c.locataire + c.proprietaireMono + c.proprietaireMulti;
  console.log(`${P}FICHE CERTAINE                       ${String(certaines).padStart(6)}  ${pc(certaines)}`);
  console.log(`${P}  · locataire                        ${String(c.locataire).padStart(6)}  ${pc(c.locataire)}`);
  console.log(`${P}  · propriétaire mono-bien           ${String(c.proprietaireMono).padStart(6)}  ${pc(c.proprietaireMono)}`);
  console.log(`${P}  · propriétaire multi-biens         ${String(c.proprietaireMulti).padStart(6)}  ${pc(c.proprietaireMulti)}`);
  console.log(`${P}NON ATTRIBUÉS`);
  for (const [m, n] of Object.entries(c.nonAttribues)) {
    console.log(`${P}  · ${m.padEnd(32)} ${String(n).padStart(6)}  ${pc(n)}`);
  }
  console.log(`${P}PAR QUELLE VOIE LA FICHE A ÉTÉ RECONNUE`);
  console.log(`${P}  · l’adresse du destinataire        ${String(c.parVoie.adresse).padStart(6)}`);
  console.log(`${P}  · le NOM lu dans l’objet           ${String(c.parVoie.nom).padStart(6)}   (décision d’Arno)`);
  for (const [m, n] of Object.entries(c.gagnesParNomSelonCause)) {
    if (n > 0) console.log(`${P}      dont l’adresse échouait en ${m.padEnd(20)} ${String(n).padStart(5)}`);
  }
  console.log(`${P}DOCUMENTS DE GARANT                  ${String(c.garants.total).padStart(6)}`
    + `   dont rangés dans une fiche : ${c.garants.ranges}`);
  const vontEnReception = Object.values(c.nonAttribues).reduce((a, b) => a + b, 0);
  console.log(`${P}VONT DANS LA RÉCEPTION               ${String(vontEnReception).padStart(6)}  ${pc(vontEnReception)}`);
  if (appliquer) {
    console.log(`${P}liens écrits                         ${String(c.ecrits).padStart(6)}`);
    console.log(`${P}rendus visibles (→ Réception)        ${String(c.rendusVisibles).padStart(6)}`);
    console.log(`${P}remis en « Courrier automatique »    ${String(c.remisEnAutomatique).padStart(6)}`);
  }

  console.log(`\n${c.exemples.length} EXEMPLES À VÉRIFIER (message, ce qu’on a lu, ce qu’on en conclut)`);
  for (const e of c.exemples) {
    console.log(`${P}#${String(e.messageId).padEnd(6)} « ${e.objet.slice(0, 54).padEnd(54)} »`);
    console.log(`${P}        → ${e.issue}${e.garant ? ' · envoyé au garant' : ''} : ${e.vers}`);
  }

  const biensApres = await confirmesSurBiens();
  console.log(`\n${P}rattachements confirmés AUX BIENS : ${biensAvant} avant, ${biensApres} après`);
  console.log(`${biensAvant === biensApres
    ? '✅ identiques — aucun rattachement à un bien n’a été touché'
    : '🔴 ATTENTION : l’écart doit être nul'}`);
  if (!appliquer) console.log('\n🔵 SIMULATION — rien n’a été écrit.');
  await closePool();
  if (biensAvant !== biensApres) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
