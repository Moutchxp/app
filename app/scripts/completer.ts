/**
 * N10-Q — UNE commande qui complète UN permis : enchaîne niveaux → champs → parcelles → cerfa-scan et rend UN compte rendu champ
 * par champ. Idempotente (chaque étape l'est). Orchestre l'EXISTANT (aucune nouvelle extraction). UN permis par appel : aucune passe
 * sur le stock, aucun ordonnanceur.
 *   ORDRE : niveaux AVANT champs — par CONVENTION (N10-S a scopé les purges 'enonce' par champ ; l'ordre n'est plus une contrainte de correction).
 * Options : --dry-run (aucune écriture ; l'étape cerfa-scan lit quand même l'API pour montrer ce qu'elle produirait) · --sauter <a,b>.
 * Lancer : npm run permis:completer -- --permis <num_dau> [--type PC|PD] [--dry-run] [--sauter niveaux,cerfa-scan].
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { resoudreDossier, lireGedPermis, depsReellesLectureGed } from '../lib/permis/lectureGed';
import { extraireCandidats } from '../lib/permis/extractionCaracteristiques';
import { decisionLots } from '../lib/permis/decisionLots';
import { decisionNiveaux } from '../lib/permis/decisionNiveaux';
import { ecrireNiveaux } from '../lib/permis/ecritureNiveaux';
import { decisionChamps } from '../lib/permis/decisionChamps';
import { ecrireChamps } from '../lib/permis/ecritureChamps';
import { lireChampsFormulaire } from '../lib/permis/champsFormulaire';
import { decisionCerfa, type ChampCerfa, type AdresseTerrainSitadel } from '../lib/permis/decisionCerfa';
import { ecrireCerfa } from '../lib/permis/ecritureCerfa';
import { decisionDesignation, type PagePermis } from '../lib/permis/decisionDesignation';
import { ecrireDesignation } from '../lib/permis/ecritureDesignation';
import { extrairePlanchesDossier, ecrireGabaritPlu, abstentionsGabarit } from '../lib/permis/ecritureGabaritPlu';
import { decisionParcelles, type ParcelleSitadel } from '../lib/permis/decisionParcelles';
import { ecrireParcelles, figerEmpreinte, figerBatiSnapshot } from '../lib/permis/parcellesRepo';
import { lireCerfaScan, lecteurMistral, coutUsd, type UsageMistral } from '../lib/permis/lireCerfaScan';
import { ecrireCerfaScan } from '../lib/permis/ecritureCerfaScan';
import { lirePermisCaracteristiques } from '../lib/permis/caracteristiquesRepo';
import { lireJournalChamps } from '../lib/permis/journalLecture';
import { executerEtapes, construireRapport, compterSansMotif, type Etape, type PrevisionAbstention } from '../lib/permis/completerPermis';

const MAJ = 'completer';
const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const numDau = arg('--permis');
  if (!numDau) { console.error('usage : npm run permis:completer -- --permis <num_dau> [--type PC|PD] [--dry-run] [--sauter a,b]'); process.exitCode = 2; return; }
  const resolu = await resoudreDossier(numDau, arg('--type'));
  if (!resolu.ok) { console.error(`[completer] permis non résolu : ${numDau}`); process.exitCode = 2; return; }
  const { dossierId, numDau: dau, codeInsee } = resolu.dossier;
  const dry = process.argv.includes('--dry-run');
  const sauter = (arg('--sauter') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const usage: UsageMistral = { ocrPages: 0, promptTokens: 0, completionTokens: 0 };

  // ── Entrées PARTAGÉES (une seule lecture GED + AcroForm + Sitadel) ──
  const deps = depsReellesLectureGed();
  const ged = await lireGedPermis(dossierId, deps);
  const champsCerfa: ChampCerfa[] = [];
  for (const m of await deps.listerPieces(dossierId)) { let buf: Buffer; try { buf = await deps.lireObjet(m.cleStockage); } catch { continue; } for (const c of await lireChampsFormulaire(buf)) champsCerfa.push({ nom: c.nom, valeur: c.valeur, page: c.page, pieceNom: m.nomFichier }); }
  const { rows: sd } = await query<{ surf: string | number | null; num: string | null; voie: string | null; loc: string | null; s1: string | null; n1: string | null; s2: string | null; n2: string | null; s3: string | null; n3: string | null }>(
    `SELECT surf_creee AS surf, adr_num_ter AS num, adr_libvoie_ter AS voie, adr_localite_ter AS loc, sec_cadastre1 AS s1, num_cadastre1 AS n1, sec_cadastre2 AS s2, num_cadastre2 AS n2, sec_cadastre3 AS s3, num_cadastre3 AS n3 FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const surfCreee = sd[0]?.surf == null ? null : Number(sd[0].surf);
  const adresseSitadel: AdresseTerrainSitadel | null = sd[0] ? { numero: sd[0].num, voie: sd[0].voie, localite: sd[0].loc } : null;
  const sitadelParcelles: ParcelleSitadel[] = [[sd[0]?.s1, sd[0]?.n1], [sd[0]?.s2, sd[0]?.n2], [sd[0]?.s3, sd[0]?.n3]].filter(([s, n]) => s && n).map(([s, n]) => ({ section: s as string, numero: n as string }));

  // ── Les 4 ÉTAPES (mêmes fonctions que les CLI dédiées ; l'écriture est SAUTÉE en --dry-run) ──
  const etapes: Etape[] = [
    { nom: 'niveaux', executer: async () => {
      const lots = decisionLots(ged, extraireCandidats(ged));
      const fc: Record<string, { valeur: number; piece: string }> = {};
      for (const l of lots.lots) if (l.nbEtages) fc[l.repere] = { valeur: l.nbEtages.valeur, piece: l.nbEtages.sources[0]?.piece ?? '?' };
      const d = decisionNiveaux(ged, fc);
      if (!dry) await ecrireNiveaux(dossierId, d, MAJ);
      return { resume: `${d.corps.length} corps${d.nonAttribue ? ` · non attribué : ${d.nonAttribue}` : ''}` };
    } },
    { nom: 'champs', executer: async () => {
      const dc = decisionChamps(extraireCandidats(ged));
      if (!dry) await ecrireChamps(dossierId, dc, MAJ);
      const cerfa = decisionCerfa(champsCerfa, surfCreee, adresseSitadel);
      if (!dry) await ecrireCerfa(dossierId, cerfa, 'extraction:cerfa');
      const pages: PagePermis[] = ged.pieces.flatMap((p) => p.pages.filter((pg) => pg.aTexte).map((pg) => ({ piece: p.nomFichier, page: pg.page, texte: pg.texte })));
      const desig = decisionDesignation(pages);
      if (!dry) await ecrireDesignation(dossierId, desig, 'extraction:designation');
      const brutes = await extrairePlanchesDossier(dossierId, deps);
      if (!dry) await ecrireGabaritPlu(dossierId, brutes, 'extraction:gabarit-plu');
      // N10-R — prévoir les abstentions de corpus muet (désignation + gabarit/plateau par corps) pour que le compte rendu
      //   n'affiche AUCUN vide muet, y compris en --dry-run (où rien n'est journalisé). Mêmes conditions que les écritures.
      const { rows: cr } = await query<{ id: number }>(`SELECT id::int AS id FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
      const cibles: (number | null)[] = cr.length > 0 ? cr.map((r) => r.id) : [null];
      const abstentions: PrevisionAbstention[] = [
        ...(desig.statut === 'abstenue' ? [{ champ: 'designation', corpsId: null, motif: desig.motif }] : []),
        ...abstentionsGabarit(brutes, cibles),
      ];
      return { resume: `motifs+cerfa (${cerfa.champs.filter((c) => c.statut === 'ecrit').length} écrits) · désignation ${desig.statut} · gabarit ${brutes.length} planche(s)`, abstentions };
    } },
    { nom: 'parcelles', executer: async () => {
      const d = decisionParcelles(champsCerfa, sitadelParcelles, dau, codeInsee);
      if (!dry) { await ecrireParcelles(dossierId, d.parcelles, MAJ); await figerEmpreinte(dossierId, MAJ); await figerBatiSnapshot(dossierId, MAJ); }
      return { resume: `${d.parcelles.length} parcelle(s)${d.ecarts.length ? ` · ${d.ecarts.length} écart(s)` : ''}` };
    } },
    { nom: 'cerfa-scan', executer: async () => {
      const { rows } = await query<{ nom_fichier: string; cle_stockage: string }>(`SELECT nom_fichier, cle_stockage FROM dossier_document WHERE dossier_id = $1 AND nom_fichier ~* 'cerfa[_ ]?13409' ORDER BY length(nom_fichier) LIMIT 1`, [dossierId]);
      if (!rows.length) return { resume: 'aucun Cerfa 13409 — étape sans objet' };
      const pdf = await deps.lireObjet(rows[0].cle_stockage);
      const lectures = await lireCerfaScan(pdf, lecteurMistral(usage));
      const res = await ecrireCerfaScan(dossierId, rows[0].nom_fichier, lectures, 'extraction:cerfa-scan', dry);
      return { resume: `écrits : ${res.ecrits.join(', ') || 'aucun'} · abstentions : ${res.abstentions.join(', ') || '—'} · désaccords : ${res.desaccords.join(', ') || '—'}`, coutApiUsd: coutUsd(usage) };
    } },
  ];

  const t0 = Date.now();
  console.log(`\n══════ COMPLÉTER — ${dau} (${resolu.dossier.type})${dry ? ' · DRY-RUN (aucune écriture)' : ''} ══════`);
  const { etapes: res, coutApiUsd, overlay } = await executerEtapes(etapes, sauter);
  const ms = Date.now() - t0;

  console.log('\n── étapes :');
  for (const e of res) console.log(`  ${e.statut === 'ok' ? '√' : e.statut === 'ignoree' ? '·' : '✗'} ${e.nom.padEnd(11)} — ${e.resume}`);

  // ── COMPTE RENDU champ par champ (lu de l'état : colonnes + journal ; overlay = abstentions prévues, pour ne pas afficher de vide muet en dry-run) ──
  const { global, corps } = await lirePermisCaracteristiques(dossierId);
  const journal = await lireJournalChamps(dossierId);
  const rapport = construireRapport(global, corps, journal, overlay);
  console.log(`\n── compte rendu champ par champ${dry ? ' (état ACTUEL — le dry-run n’a rien écrit ; voir les résumés d’étape pour ce qui SERAIT posé)' : ''} :`);
  for (const r of rapport) {
    if (r.valeur !== null) console.log(`  ${r.niveau.padEnd(16)} ${r.champ.padEnd(28)} = ${r.valeur}  · ${r.origine ?? '?'}/${r.methode ?? '?'}`);
    else console.log(`  ${r.niveau.padEnd(16)} ${r.champ.padEnd(28)} — VIDE · ${r.permanent ? '🔒 SANS EXTRACTEUR' : 'motif'} : ${r.motif}${r.sansMotif ? '  ⚠ SANS MOTIF JOURNALISÉ' : ''}`);
  }
  const sans = compterSansMotif(rapport);
  console.log(`\n→ ${res.filter((e) => e.statut === 'echec').length} étape(s) en échec · ${sans} champ(s) vide(s) sans motif journalisé${sans && !dry ? '  ⚠ À CORRIGER (doctrine : jamais un vide muet)' : ''}`);
  console.log(`→ coût API cumulé : $${coutApiUsd.toFixed(4)} (OCR ${usage.ocrPages} pages · vision ${usage.promptTokens}/${usage.completionTokens} tok) · temps total : ${(ms / 1000).toFixed(1)} s\n`);
}

void main().catch((e) => { console.error('[completer] échec', e); process.exitCode = 1; }).finally(() => closePool());
