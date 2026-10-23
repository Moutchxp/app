/**
 * CLI `location:importer-suivi-2026` — L'IMPORT DU SUIVI MENSUEL D'ARNO (CA_JBP_2026.xlsx) DANS « OUTILS DE SUIVI » (Arno, 22/10/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Chaque ligne du fichier devient une ligne d'activité (migration 406) : rapprochée de son bail quand le score de confiance le
 * permet (≥ 0,80), sinon importée « historique non rattaché » (une douteuse garde le bail proposé en commentaire). Rien n'est
 * perdu, rien n'est doublé : clé d'import par ligne (rejouable), un bail déjà suivi dans l'outil n'est pas recompté. Les
 * avenants entrent comme « avenant ». Les apporteurs nommés dans le fichier rejoignent le référentiel ; la rétrocession d'août
 * aussi. Puis le CONTRÔLE : chaque mois recalculé par le tableau de bord face aux totaux du fichier, au centime.
 *
 * 🔴 L'HISTORIQUE 2019 → 2025 (Arno, 23/10/2026) — le même script, alias `location:importer-suivi` :
 *   · `--fichier=…` (l'année se lit dans le nom : CA_JBP_2020.xlsx, « 2025 (3) »… ; `--annee=` la force) ou `--tous` (tous les
 *     CA_JBP_<année>*.xlsx de .captures/suivi-location/, rapprochés ENSEMBLE : un bail ne sert qu'une fois) ;
 *   · clé d'import « CA_JBP_<année du fichier>#AAAA-MM#ligne » ; les lignes 2026 déjà importées ne bougent pas ;
 *   · les variantes d'un même apporteur (« Tarisse » / « Tarrisse ») deviennent UN apporteur de l'annuaire ; les nouveaux sont
 *     créés « à rattacher » ; les règles de commission datées des fichiers (12,5 % puis 15 %) sont ajoutées si leur date manque ;
 *   · un onglet qui n'est pas un mois, un second négociateur, une « gestion perdue » : SIGNALÉS dans le rapport, jamais écrits.
 *
 * 🔴 À BLANC PAR DÉFAUT : il LIT et écrit son rapport ; aucune écriture en base. `--reel` écrit (une transaction, ajout seul),
 *    puis relit la base pour refaire le contrôle sur ce qui y est vraiment. 🔴 Un mois qui ne tombe pas au centime : code 2, et
 *    RIEN n'est écrit, même avec `--reel`.
 * 🔴 Le rapport va dans `.captures/importer-suivi-location-2026/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:importer-suivi-2026                                   (à blanc, fichier .captures/suivi-location/CA_JBP_2026.xlsx)
 *   npm run location:importer-suivi-2026 -- --reel                         (écrit)
 *   npm run location:importer-suivi -- --tous                              (à blanc, tous les fichiers 2020 → 2026)
 *   … -- --fichier=/chemin/CA_JBP_2023.xlsx [--annee=2023] · --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import ExcelJS from 'exceljs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';
import { depuisExcelJs } from '../lib/location/suivi/classeurExcelJs';
import { lireClasseurDetaille, type FeuilleIgnoree, type MoisExcel } from '../lib/location/suivi/lectureExcel';
import { rapprocher } from '../lib/location/suivi/rapprochementImport';
import { canoniserApporteurs, type ApporteurLu } from '../lib/location/suivi/repriseExcel';
import { anneeDuFichier, controler, planifier, reglesDesFichiers, retrocessionsDuMois, sourceDe, tableauControle, texteRapportImport, versActivite, type ControleMois, type LignePlan } from '../lib/location/suivi/planImport';
import type { ActiviteCalcul } from '../lib/location/suivi/tableauBord';

const P = '[location:importer-suivi-2026]';
const NOM_SCRIPT = 'importer-suivi-location-2026';
const ANNEE = 2026;
const DOSSIER = join(RACINE_PROJET, '.captures/suivi-location');
/** Les collègues nommés dans le fichier (Arno, 23/10/2026) — en plus des comptes actifs. */
export const COLLEGUES_CONNUS = ['Arnaud Jorel', 'Jean-Baptiste Pons', 'Cédric Jullien'];
/** Les fichiers « JBP » : le négociateur des lignes est Jean-Baptiste, même quand l'onglet ne le nomme pas (2020 → 2022). */
const PRENOM_PAR_DEFAUT = 'Jean-Baptiste';
const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;
export { anneeDuFichier, reglesDesFichiers, retrocessionsDuMois };

/** Le taux le plus fréquent de chaque apporteur dans le fichier (`=E8*10%`) : son barème au 1er janvier. PUR. */
export function tauxParApporteur(plan: readonly LignePlan[]): Map<string, number> {
  const comptes = new Map<string, Map<number, number>>();
  for (const p of plan) {
    if (p.apporteur === null || p.ligne.tauxCommission === null) continue;
    const cle = p.apporteur.nom.trim().toLowerCase();
    const m = comptes.get(cle) ?? new Map<number, number>();
    m.set(p.ligne.tauxCommission, (m.get(p.ligne.tauxCommission) ?? 0) + 1);
    comptes.set(cle, m);
  }
  return new Map([...comptes].map(([cle, m]) => [cle, [...m].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]]));
}

interface Fichier { chemin: string; annee: number; source: string; mois: MoisExcel[]; ignorees: FeuilleIgnoree[]; doublons: string[] }

async function lireFichier(chemin: string, annee: number): Promise<Fichier> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(chemin);
  const d = lireClasseurDetaille(depuisExcelJs(wb as never), annee);
  return { chemin, annee, source: sourceDe(annee), ...d };
}

/** Le script (exporté pour l'épreuve `--reel` en transaction annulée sur la base d'essai). */
export async function principal(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const reel = argv.includes('--reel');
  const tous = argv.includes('--tous');
  const anneeForcee = optionLigne(argv, 'annee');
  const unFichier = optionLigne(argv, 'fichier');
  const chemins = tous
    ? readdirSync(DOSSIER).filter((f) => /^CA_JBP_20\d{2}.*\.xlsx$/i.test(f)).map((f) => join(DOSSIER, f)).sort()
    : [unFichier ?? join(DOSSIER, 'CA_JBP_2026.xlsx')];
  const { closePool } = await import('../lib/db/client');
  const repo = await import('../lib/location/suivi/importSuiviRepo');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const fichiers: Fichier[] = [];
    for (const c of chemins) {
      const a = anneeForcee !== null && !tous ? Number(anneeForcee) : anneeDuFichier(c) ?? ANNEE;
      fichiers.push(await lireFichier(c, a));
    }
    const tousMois = fichiers.flatMap((f) => f.mois);
    const vus = new Map<string, string>();
    for (const f of fichiers) for (const m of f.mois) {
      if (vus.has(m.mois)) throw new Error(`le mois ${m.mois} est dans deux fichiers (${vus.get(m.mois)} et ${basename(f.chemin)}) : rien n'est fait.`);
      vus.set(m.mois, basename(f.chemin));
    }
    const disponible = await repo.importDisponible();
    if (reel && !disponible) throw new Error('migration 406 absente : rien ne peut être écrit (lancer à blanc pour voir le plan et le contrôle).');
    const [candidats, comptes, existants] = await Promise.all([repo.lireCandidats(), repo.lireComptes(), repo.lireExistants()]);
    // Le négociateur : l'en-tête de l'onglet (« Jean-Baptiste ») → le compte actif de même prénom, s'il est unique.
    const entete = tousMois.find((m) => m.negociateur !== '')?.negociateur ?? PRENOM_PAR_DEFAUT;
    const memePrenom = comptes.filter((c) => norm(c.prenom) === norm(entete));
    const negociateur = memePrenom.length === 1 ? { id: memePrenom[0].id, libelle: memePrenom[0].libelle } : { id: null, libelle: entete };
    // UN rapprochement pour tous les fichiers : un bail ne sert qu'une fois, et jamais un bail déjà rattaché en base.
    const libres = candidats.filter((c) => !existants.bauxPris.has(c.bailId));
    // Les lignes déjà importées (2026) ne concourent pas : elles ne prennent jamais un bail à une ligne de l'historique.
    const sourceDuMois = new Map(fichiers.flatMap((f) => f.mois.map((m) => [m.mois, f.source] as [string, string])));
    const aRapprocher = tousMois.flatMap((m) => m.lignes).filter((l) => !existants.dejaImportees.has(`${sourceDuMois.get(l.mois)}#${l.cle}`));
    const rapprochements = rapprocher(aRapprocher, libres);
    const collaborateurs = [...new Set([...comptes.map((c) => c.libelle), ...COLLEGUES_CONNUS])];
    let plan: LignePlan[] = fichiers.flatMap((f) => planifier(f.mois, rapprochements,
      { collaborateurs, comptes, dejaImportees: existants.dejaImportees, bauxSuivis: existants.bauxSuivis, source: f.source }));
    // Les variantes d'un même apporteur → UN nom (celui de l'annuaire, sinon le plus fréquent).
    const can = canoniserApporteurs(plan.filter((p) => p.apporteur !== null).map((p) => p.apporteur!.nom), existants.noms);
    const renomme = (a: ApporteurLu | null): ApporteurLu | null => (a === null ? null : { ...a, nom: can.retenu.get(a.nom.trim()) ?? a.nom });
    plan = plan.map((p) => ({ ...p, apporteur: renomme(p.apporteur), origine: { ...p.origine, apporteur: renomme(p.origine.apporteur) } }));
    const retrocessions = tousMois.flatMap((m) => retrocessionsDuMois(m, negociateur));
    const apporteursACreer = [...new Map(plan.filter((p) => p.apporteur !== null && !existants.apporteurs.has(p.apporteur.nom.trim().toLowerCase()))
      .map((p) => [p.apporteur!.nom.trim().toLowerCase(), p.apporteur!] as [string, ApporteurLu])).values()];
    const depuisApporteurs = new Map<string, string>();
    for (const p of [...plan].sort((a, b) => a.ligne.mois.localeCompare(b.ligne.mois))) {
      if (p.apporteur !== null && !depuisApporteurs.has(p.apporteur.nom.trim().toLowerCase())) depuisApporteurs.set(p.apporteur.nom.trim().toLowerCase(), `${p.ligne.mois.slice(0, 4)}-01-01`);
    }
    const reglesFichiers = reglesDesFichiers(tousMois);
    const reglesAAjouter = reglesFichiers.filter((r) => !existants.regles.some((x) => x.depuis === r.depuis));
    const reglesControle = [...existants.regles.filter((x) => !reglesFichiers.some((r) => r.depuis === x.depuis)), ...reglesFichiers].sort((a, b) => a.depuis.localeCompare(b.depuis));
    const enDesaccord = reglesFichiers.filter((r) => existants.regles.some((x) => x.depuis === r.depuis && Math.abs(x.tauxNegociateur - r.tauxNegociateur) > 1e-9));
    // Le contrôle porte sur ce qui sera EN BASE : les lignes importées (ou déjà importées), pas celles d'un bail déjà suivi.
    const activitesDu = (pl: readonly LignePlan[]): ActiviteCalcul[] => pl.filter((p) => p.etat !== 'deja_suivie').map((p) => versActivite(p, negociateur));
    let activites = activitesDu(plan);
    const controleDe = (acts: readonly ActiviteCalcul[]): Map<string, ControleMois[]> =>
      new Map(fichiers.map((f) => [f.source, controler(f.mois, acts, reglesControle, retrocessions)]));
    let controles = controleDe(activites);
    const juste = (): boolean => [...controles.values()].flat().every((c) => c.auCentime);
    let bilan = '';
    if (reel && !juste()) {
      bilan = '⚠ UN MOIS AU MOINS NE TOMBE PAS AU CENTIME : RIEN N’A ÉTÉ ÉCRIT (--reel refusé).';
    } else if (reel) {
      const b = await repo.ecrireImport({ plan, annee: ANNEE, negociateur, tauxApporteurs: tauxParApporteur(plan), retrocessions, auteur: `import ${NOM_SCRIPT}`,
        depuisApporteurs, regles: reglesAAjouter });
      bilan = `ÉCRIT : ${b.activites} ligne(s) d'activité, ${b.apporteurs} apporteur(s), ${b.retrocessions} rétrocession(s), ${b.regles} règle(s) de commission. Contrôle refait sur la base relue.`;
      const relu = await repo.relireImport(fichiers.map((f) => f.source));
      const parCle = new Map(plan.map((p) => [p.importCle, p]));
      activites = relu.filter((r) => parCle.has(r.cle)).map((r) => ({ ...versActivite(parCle.get(r.cle)!, negociateur), type: r.type as ActiviteCalcul['type'], dateSignature: r.date,
        honoProprietaireHt: r.hp, honoLocataireHt: r.hl, primeSaisie: r.prime, commissionSaisie: r.commission, avecGestion: r.avec, apporteurTaux: r.taux,
        primeMode: (r.primeMode as ActiviteCalcul['primeMode']) ?? null }));
      controles = controleDe(activites);
    }
    const sections = fichiers.map((f) => (plan.filter((p) => p.importCle.startsWith(`${f.source}#`)).every((p) => p.etat === 'deja_importee')
      ? `${basename(f.chemin)} : DÉJÀ IMPORTÉ (${plan.filter((p) => p.importCle.startsWith(`${f.source}#`)).length} lignes) — rien n'est réécrit ni modifié ; contrôle :\n${tableauControle(controles.get(f.source) ?? [])}`
      : texteRapportImport({
      reel, base, fichier: f.chemin, plan: plan.filter((p) => p.importCle.startsWith(`${f.source}#`)), mois: f.mois, controle: controles.get(f.source) ?? [], negociateur,
      apporteursACreer: apporteursACreer.filter((a) => plan.some((p) => p.importCle.startsWith(`${f.source}#`) && p.apporteur?.nom === a.nom)),
      retrocessions: retrocessions.filter((r) => f.mois.some((m) => `${m.mois}-01` === r.mois)), disponible,
      titre: `IMPORT DU SUIVI LOCATION — ${basename(f.chemin)} (${f.mois.length ? `${f.mois[0].mois} → ${f.mois.at(-1)!.mois}` : 'aucun mois'})`,
    })));
    const valeursG = new Map<string, { n: number; origine: string }>();
    for (const p of plan) if (p.ligne.apporteurTexte !== null) {
      const k = p.ligne.apporteurTexte.replace(/\s+/g, ' ').trim();
      valeursG.set(k, { n: (valeursG.get(k)?.n ?? 0) + 1, origine: p.origine.aArbitrer ? 'à arbitrer' : p.origine.origine ?? '—' });
    }
    const synthese = [
      `IMPORT DU SUIVI LOCATION — ${fichiers.length} FICHIER(S) — ${reel ? 'RÉEL' : 'À BLANC (aucune écriture)'} — base ${base}`,
      `négociateur des lignes : ${negociateur.libelle}${negociateur.id === null ? ' (aucun compte trouvé : nom seul)' : ` (compte ${negociateur.id})`}`,
      '',
      'CONTRÔLE PAR ANNÉE (fichier / outil, au centime) :',
      ...[...new Set(tousMois.map((m) => m.mois.slice(0, 4)))].sort().map((a) => {
        const lignes = [...controles.values()].flat().filter((c) => c.mois.startsWith(a));
        const s = (k: keyof ControleMois) => lignes.reduce((t, x) => t + ((x[k] as number) ?? 0), 0);
        return `  ${a} : ${lignes.length} mois · ${s('lignesFichier')} lignes · CA ${euros(s('caFichier'))} / ${euros(s('caOutil'))} · apporteurs ${euros(s('apporteursFichier'))} / ${euros(s('apporteursOutil'))} · primes ${euros(s('primesFichier'))} / ${euros(s('primesOutil'))} · commission ${euros(s('commissionFichier'))} / ${euros(s('commissionOutil'))} · ${lignes.every((x) => x.auCentime) ? '✓' : `✗ (${lignes.filter((x) => !x.auCentime).map((x) => x.mois).join(', ')})`}`;
      }),
      '',
      'TOUS LES MOIS :',
      tableauControle([...controles.values()].flat().sort((a, b) => a.mois.localeCompare(b.mois))),
      '',
      `RÈGLES DE COMMISSION DES FICHIERS : ${reglesFichiers.map((r) => `${r.depuis} → ${(r.tauxNegociateur * 100).toLocaleString('fr-FR')} %`).join(' · ')}`,
      `  à ajouter en base (date absente) : ${reglesAAjouter.map((r) => r.depuis).join(', ') || 'aucune'}${enDesaccord.length ? ` · ⚠ EN DÉSACCORD avec la base : ${enDesaccord.map((r) => r.depuis).join(', ')}` : ''}`,
      '',
      `APPORTEURS — variantes regroupées (${can.regroupements.length}) : ${can.regroupements.map((g) => `« ${g.variantes.join(' », « ')} » → ${g.retenu}`).join(' · ') || 'aucune'}`,
      `APPORTEURS À CRÉER « À RATTACHER » (${apporteursACreer.length}) : ${apporteursACreer.map((a) => a.nom).join(', ') || 'aucun'}`,
      `COLONNE « APPORTEURS » (valeurs distinctes → origine) : ${[...valeursG].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} (${v.n}) → ${v.origine}`).join(' · ')}`,
      '',
      'ONGLETS QUI NE SONT PAS UN MOIS (jamais rattachés) :',
      ...(fichiers.some((f) => f.ignorees.length) ? fichiers.flatMap((f) => f.ignorees.map((g) => `  · ${basename(f.chemin)} « ${g.nom} » : ${g.lignes === 0 ? 'vide — ignoré' : `${g.lignes} ligne(s), CA ${euros(g.caHt)} — À ARBITRER PAR ARNO (${g.apercu.join(' ; ')}${g.lignes > 3 ? ' ; …' : ''})`}`)) : ['  (aucun)']),
      '',
      'SECOND NÉGOCIATEUR DANS UN ONGLET (lu, NON importé) :',
      ...(tousMois.some((m) => m.autreBloc) ? tousMois.filter((m) => m.autreBloc).map((m) => `  · ${m.mois} « ${m.autreBloc!.negociateur} » : ${m.autreBloc!.lignes.map((l) => `${l.proprietaire} / ${l.locataire} ${euros(l.caFichier)}`).join(' ; ')} — CA ${euros(m.autreBloc!.caHt)}, commission ${euros(m.autreBloc!.commissionBrute)}${m.autreBloc!.tauxNegociateur === null ? '' : ` (${(m.autreBloc!.tauxNegociateur * 100).toLocaleString('fr-FR')} %)`}`) : ['  (aucun)']),
      '',
      'GESTIONS PERDUES NOTÉES DANS LE FICHIER (« GESTION PERDU » / « Loyers cc » — NON écrites : pas de place pour elles dans l’outil) :',
      ...(tousMois.some((m) => (m.gestionsPerdues ?? []).length) ? tousMois.flatMap((m) => (m.gestionsPerdues ?? []).map((g) => `  · ${g.mois} ligne ${g.rang} : ${g.proprietaire}${g.loyersCc === null ? '' : ` — loyers ${euros(g.loyersCc)} cc`}${g.commentaire ? ` — « ${g.commentaire} »` : ''}`)) : ['  (aucune)']),
      '',
      bilan,
    ].join('\n');
    const texte = [synthese, ...sections].join('\n\n════════════════════════════════════════════════════════════════════════════\n\n');
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(fichiers.length > 1 ? synthese : texte);
    console.log(`${P} rapport : ${chemin}`);
    if (!juste()) process.exitCode = 2;
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exit(1); });
}
