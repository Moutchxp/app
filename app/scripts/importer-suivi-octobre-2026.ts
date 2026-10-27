/**
 * CLI `location:importer-octobre-2026` — LES LIGNES D'OCTOBRE 2026 DU FICHIER D'ARNO DANS LE SUIVI DE LA LOCATION (Arno, 27/10/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Onglet « Oct » SEULEMENT. Les lignes déjà saisies en base (même mois + même locataire ou propriétaire + même montant) ne sont pas
 * touchées ; les autres sont ajoutées avec la logique EXACTE de la reprise du suivi mensuel (`importer-suivi-location-2026`) :
 * lecture `lireClasseurDetaille`, apporteurs écartés `ecarterApporteurs`, plan `planifier`, ligne `versActivite`, écriture
 * `ecrireImport` (clé « CA_JBP_2026#2026-10#<ligne> », origine « import », ON CONFLICT : rejouable).
 *
 * Ce que ce script fait EN PLUS, sur décision d'Arno — et rien d'autre :
 *   · le rattachement aux fiches existantes seulement « sans ambiguïté », numéro de lot du fichier lu (« NGO 421 ») ; sinon
 *     « à rattacher », candidats au rapport ; AUCUNE fiche (client, bien, bail, apporteur) n'est créée ;
 *   · la marque « import fichier octobre 2026 du JJ/MM » sur chaque ligne ajoutée, une trace au journal par ligne, et `--annuler` ;
 *   · l'empreinte de chaque mois de 2026 avant / après (lignes, montant, somme de contrôle) : seul octobre peut changer ;
 *   · le garde « attendu » : 12 lignes, 9 749,24 € HT à ajouter — sinon `--appliquer` n'écrit rien (code 2).
 *   · ni règle de commission, ni rétrocession, ni gestion perdue, ni note d'écart ne sont écrites (la reprise les écrivait) : elles
 *     sont seulement dites au rapport. Octobre n'en porte d'ailleurs aucune de neuve.
 *
 * 🔴 À BLANC PAR DÉFAUT : lit, calcule, écrit son rapport ; aucune écriture en base. `--appliquer` écrit. `--annuler` montre (à blanc)
 *    puis, avec `--appliquer`, désactive les lignes de cet import (jamais de suppression).
 * 🔴 Le rapport va dans `.captures/importer-suivi-octobre-2026/` (jamais sur le Bureau).
 *
 * Usage :
 *   npm run location:importer-octobre-2026 -- [--fichier=/chemin/CA_JBP_2026_octobre.xlsx]            (à blanc)
 *   npm run location:importer-octobre-2026 -- --fichier=… --appliquer                                   (écrit)
 *   npm run location:importer-octobre-2026 -- --annuler [--appliquer]                                   (désactive ce que cet import a ajouté)
 *   … --rapport=/chemin/fichier-ou-dossier
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne, RACINE_PROJET } from '../lib/ops/rapportScript';
import { depuisExcelJs } from '../lib/location/suivi/classeurExcelJs';
import { lireClasseurDetaille, type MoisExcel } from '../lib/location/suivi/lectureExcel';
import { canoniserApporteurs, type ApporteurLu } from '../lib/location/suivi/repriseExcel';
import { controler, planifier, retrocessionsDuMois, sourceDe, tableauControle, versActivite, type LignePlan } from '../lib/location/suivi/planImport';
import { ecarterApporteurs, FUSIONNER_SECOND_BLOC, ONGLETS_MOIS } from '../lib/location/suivi/decisionsHistorique';
import {
  ATTENDU, caDe, eurosOctobre as euros, marqueDuJour, MOIS_OCTOBRE, moisModifies, ONGLET_OCTOBRE, PREFIXE_CLE, rattacherOctobre,
  reconnaitreDejaSaisies, tableauEmpreintes, type EmpreinteMois,
} from '../lib/location/suivi/importOctobre';
import { COLLEGUES_CONNUS } from './importer-suivi-location-2026';

const P = '[location:importer-octobre-2026]';
const NOM_SCRIPT = 'importer-suivi-octobre-2026';
const ANNEE = 2026;
const FICHIER_DEFAUT = join(RACINE_PROJET, '.captures/import-octobre/CA_JBP_2026_octobre.xlsx');
const PRENOM_PAR_DEFAUT = 'Jean-Baptiste';
const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const jourJJMM = (): string => new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

/** L'onglet « Oct » du fichier, lu comme la reprise le lit (mêmes décisions d'Arno). Aucun autre onglet n'est retenu. */
export async function lireOctobre(chemin: string): Promise<MoisExcel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(chemin);
  const d = lireClasseurDetaille(depuisExcelJs(wb as never), ANNEE, { ongletsMois: ONGLETS_MOIS[sourceDe(ANNEE)], fusionnerSecondBloc: FUSIONNER_SECOND_BLOC });
  const e = ecarterApporteurs(d.mois);
  const oct = e.mois.filter((m) => m.mois === MOIS_OCTOBRE && m.nomFeuille.trim() === ONGLET_OCTOBRE);
  if (oct.length !== 1) throw new Error(`onglet « ${ONGLET_OCTOBRE} » (octobre 2026) introuvable ou en double dans ${chemin} : rien n'est fait.`);
  return oct[0];
}

export async function principal(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const appliquer = argv.includes('--appliquer');
  const annuler = argv.includes('--annuler');
  const fichier = optionLigne(argv, 'fichier') ?? FICHIER_DEFAUT;
  const { closePool } = await import('../lib/db/client');
  const repo = await import('../lib/location/suivi/importSuiviRepo');
  const oct = await import('../lib/location/suivi/importOctobreRepo');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  const marque = marqueDuJour(jourJJMM());
  const sortie: string[] = [];
  const dire = (...l: string[]): void => { sortie.push(...l); };
  try {
    const avant = await oct.empreintes2026();
    if (annuler) {
      const lignes = (await oct.lignesDeCetImport()).filter((x) => !x.annule);
      dire(`ANNULER L'IMPORT D'OCTOBRE 2026 — ${appliquer ? 'RÉEL' : 'À BLANC (aucune écriture)'} — base ${base}`,
        `lignes de cet import encore actives : ${lignes.length}${lignes.length ? ` (${lignes.map((x) => `n° ${x.id}`).join(', ')})` : ''}`);
      if (appliquer && lignes.length > 0) {
        const faites = await oct.annulerCetImport(`annulation ${marque.replace(/ du .*/, '')} du ${jourJJMM()}`);
        dire(`DÉSACTIVÉES : ${faites.length} ligne(s) — annule_le posé, une trace au journal par ligne, rien n'est supprimé.`);
      }
      const apres = appliquer ? await oct.empreintes2026() : null;
      dire('', 'EMPREINTE DES MOIS DE 2026 (avant → après) :', tableauEmpreintes(avant, apres));
      if (apres !== null && moisModifies(avant, apres).length > 0) { dire(`⚠ MOIS MODIFIÉS HORS OCTOBRE : ${moisModifies(avant, apres).join(', ')}`); process.exitCode = 3; }
      return;
    }

    if (!existsSync(fichier)) throw new Error(`fichier introuvable : ${fichier} (option --fichier=…).`);
    if (!(await repo.importDisponible())) throw new Error('migration 406 absente : rien ne peut être fait.');
    const mois = await lireOctobre(fichier);
    const [candidats, comptes, existants, enBase, numeros] = await Promise.all([repo.lireCandidats(), repo.lireComptes(), repo.lireExistants(),
      oct.lireLignesOctobre(), oct.lireNumerosDesLots()]);

    // Décision 2 — les lignes déjà en base (hors celles de cet import, qui sont « déjà importées » par leur clé).
    const saisies = enBase.filter((x) => !(x.importCle ?? '').startsWith(PREFIXE_CLE));
    const dejaSaisies = reconnaitreDejaSaisies(mois.lignes, saisies);
    const aTraiter = mois.lignes.filter((l) => !dejaSaisies.has(l.cle));

    // La reprise : négociateur de l'onglet, rapprochement (ici : sans ambiguïté, numéro de lot lu), plan, apporteurs canonisés.
    const entete = mois.negociateur !== '' ? mois.negociateur : PRENOM_PAR_DEFAUT;
    const memePrenom = comptes.filter((c) => norm(c.prenom) === norm(entete));
    const negociateur = memePrenom.length === 1 ? { id: memePrenom[0].id, libelle: memePrenom[0].libelle } : { id: null, libelle: entete };
    const libres = candidats.filter((c) => !existants.bauxPris.has(c.bailId));
    const rattachements = rattacherOctobre(aTraiter.filter((l) => !existants.dejaImportees.has(`${sourceDe(ANNEE)}#${l.cle}`)), libres, numeros);
    const collaborateurs = [...new Set([...comptes.map((c) => c.libelle), ...COLLEGUES_CONNUS])];
    const moisATraiter: MoisExcel = { ...mois, lignes: aTraiter };
    let plan: LignePlan[] = planifier([moisATraiter], [...rattachements.values()].map((r) => r.rapprochement),
      { collaborateurs, comptes, dejaImportees: existants.dejaImportees, bauxSuivis: existants.bauxSuivis, source: sourceDe(ANNEE) });
    const can = canoniserApporteurs(plan.filter((p) => p.apporteur !== null).map((p) => p.apporteur!.nom), existants.noms);
    const renomme = (a: ApporteurLu | null): ApporteurLu | null => (a === null ? null : { ...a, nom: can.retenu.get(a.nom.trim()) ?? a.nom });
    plan = plan.map((p) => ({ ...p, apporteur: renomme(p.apporteur), origine: { ...p.origine, apporteur: renomme(p.origine.apporteur) } }));
    const apporteursInconnus = [...new Set(plan.filter((p) => p.apporteur !== null && !existants.apporteurs.has(p.apporteur.nom.trim().toLowerCase())).map((p) => p.apporteur!.nom))];

    // Le contrôle de LECTURE : les 16 lignes du fichier, recalculées par le tableau de bord, face aux totaux de l'onglet.
    const toutes = planifier([mois], [], { collaborateurs, comptes, dejaImportees: new Set(), bauxSuivis: new Set(), source: sourceDe(ANNEE) });
    const controle = controler([mois], toutes.map((p) => versActivite(p, negociateur)), existants.regles, retrocessionsDuMois(mois, negociateur));

    const aImporter = plan.filter((p) => p.etat === 'a_importer');
    // Une ligne de cet import désactivée par --annuler garde sa clé : elle n'est PAS réimportée (ni réactivée) — c'est dit.
    const annulees = new Set((await oct.lignesDeCetImport()).filter((x) => x.annule).map((x) => x.cle));
    const dejaImportees = plan.filter((p) => p.etat === 'deja_importee' && !annulees.has(p.importCle));
    const ajoutees = [...aImporter, ...dejaImportees];
    const total = ajoutees.reduce((s, p) => s + caDe(p.ligne), 0);
    const conforme = ajoutees.length === ATTENDU.lignes && Math.round(total * 100) === Math.round(ATTENDU.totalHt * 100)
      && plan.every((p) => p.etat !== 'deja_suivie');

    let bilan = '';
    let apres: EmpreinteMois[] | null = null;
    if (appliquer && !conforme) {
      bilan = `⚠ LE PLAN NE CORRESPOND PAS À L'ATTENDU (${ATTENDU.lignes} lignes, ${euros(ATTENDU.totalHt)}) : RIEN N'EST ÉCRIT.`;
      process.exitCode = 2;
    } else if (appliquer && apporteursInconnus.length > 0) {
      bilan = `⚠ APPORTEUR(S) ABSENT(S) DE L'ANNUAIRE (${apporteursInconnus.join(', ')}) : aucun n'est créé par ce script — RIEN N'EST ÉCRIT.`;
      process.exitCode = 2;
    } else if (appliquer) {
      // L'écriture de la reprise, telle quelle : seulement les lignes « à importer » ; ni règle, ni rétrocession, ni perte, ni note.
      const b = await repo.ecrireImport({ plan, annee: ANNEE, negociateur, tauxApporteurs: new Map(), retrocessions: [], auteur: marque });
      const traces = await oct.journaliserAjouts(marque);
      apres = await oct.empreintes2026();
      const touches = moisModifies(avant, apres);
      bilan = `ÉCRIT : ${b.activites} ligne(s) ajoutée(s) (marque « ${marque} »), ${traces} trace(s) au journal.`
        + (touches.length ? ` ⚠ MOIS MODIFIÉS HORS OCTOBRE : ${touches.join(', ')}` : ' Aucun autre mois n’a changé.');
      if (touches.length) process.exitCode = 3;
    } else {
      bilan = conforme ? 'À BLANC : rien n’est écrit. Relancer avec --appliquer pour écrire.' : `⚠ À BLANC — le plan ne correspond pas à l'attendu (${ATTENDU.lignes} lignes, ${euros(ATTENDU.totalHt)}) : --appliquer refuserait.`;
    }

    const rattache = (p: LignePlan): string => {
      const r = rattachements.get(p.ligne.cle);
      if (p.bailId !== null && p.rapprochement.candidat !== null) {
        const c = p.rapprochement.candidat;
        return `rattachée → bail ${c.bailId}, bien ${c.lotId}, propriétaire ${c.proprietaireId ?? '—'} (${c.proprietaire}), locataire ${c.locataireId ?? '—'} (${c.locataires}) — score ${p.rapprochement.score.toFixed(2)}`;
      }
      const cands = (r?.candidats ?? []).map((x) => `bail ${x.c.bailId} / bien ${x.c.lotId} — ${x.c.proprietaire} / ${x.c.locataires || '—'} (entrée ${x.c.entree ?? '?'}, score ${x.score.toFixed(2)})`);
      return `À RATTACHER${r?.ambigu ? ' (ambigu : plusieurs baux au-dessus du seuil)' : ''} — candidats : ${cands.join(' ; ') || 'aucun'}`;
    };
    const desc = (l: { rang: number; proprietaire: string; locataire: string; honoProprietaireHt: number; honoLocataireHt: number }): string =>
      `ligne ${l.rang} — ${l.proprietaire} / ${l.locataire || '(locataire vide dans le fichier)'} — ${euros(caDe(l))} HT`;

    dire(
      `IMPORT DES LIGNES D'OCTOBRE 2026 — ${appliquer ? 'RÉEL' : 'À BLANC (aucune écriture)'} — base ${base}`,
      `fichier : ${fichier} · onglet « ${mois.nomFeuille.trim()} » · ${mois.lignes.length} ligne(s) de transaction lues (les lignes de synthèse ne sont jamais lues comme des transactions)`,
      `négociateur des lignes : ${negociateur.libelle}${negociateur.id === null ? ' (aucun compte trouvé : nom seul)' : ` (compte ${negociateur.id})`}`,
      '',
      `DÉJÀ SAISIES, NON MODIFIÉES (${dejaSaisies.size}) :`,
      ...(dejaSaisies.size ? mois.lignes.filter((l) => dejaSaisies.has(l.cle)).map((l) => {
        const e = dejaSaisies.get(l.cle)!;
        return `  · ${desc(l)} = ligne de suivi n° ${e.id} (${e.proprietaire} / ${e.locataire}, ${euros(e.hp + e.hl)}, ${e.source})`;
      }) : ['  (aucune)']),
      '',
      `À AJOUTER (${aImporter.length})${dejaImportees.length ? ` · DÉJÀ AJOUTÉES PAR CET IMPORT (${dejaImportees.length})` : ''} :`,
      ...plan.map((p) => `  · ${desc(p.ligne)}${p.apporteur ? ` — apporteur ${p.apporteur.nom}${existants.apporteurs.has(p.apporteur.nom.trim().toLowerCase()) ? ` (fiche ${existants.apporteurs.get(p.apporteur.nom.trim().toLowerCase())})` : ' (ABSENT de l’annuaire)'}, commission ${euros(p.ligne.commission)}` : ''}`
        + ` — ${p.etat === 'deja_importee' && annulees.has(p.importCle) ? 'ANNULÉE PAR --annuler (non réimportée, non réactivée)' : p.etat === 'deja_importee' ? 'DÉJÀ AJOUTÉE (rien ne change)' : p.etat === 'deja_suivie' ? 'BAIL DÉJÀ SUIVI : non ajoutée' : rattache(p)}`
        + `${p.type !== 'bail' ? ` — ${p.type}` : ''}${p.gestionSource !== 'fichier' ? ` — avec gestion : ${p.avecGestion ? 'oui' : 'non'} (${p.gestionSource === 'bien' ? 'statut du bien' : 'absent du fichier, compté « sans »'})` : ''}`),
      `  TOTAL AJOUTÉ : ${ajoutees.length} ligne(s), ${euros(total)} HT — attendu ${ATTENDU.lignes} ligne(s), ${euros(ATTENDU.totalHt)} HT : ${conforme ? 'CONFORME' : 'NON CONFORME'}`,
      '',
      'CONTRÔLE DE LECTURE (les 16 lignes de l’onglet recalculées face aux totaux du fichier) :',
      tableauControle(controle),
      ...mois.anomalies.map((a) => `  · ${a}`),
      ...(mois.gestionsPerdues?.length ? [`  · gestions perdues dans l’onglet : ${mois.gestionsPerdues.length} — NON écrites par ce script`] : []),
      '',
      `EMPREINTE DES MOIS DE 2026 (avant${apres ? ' → après' : ''}) — lignes non annulées · montant HT · somme de contrôle :`,
      tableauEmpreintes(avant, apres),
      ...(apres === null ? [`  (à blanc : octobre passerait à ${(avant.find((e) => e.mois === MOIS_OCTOBRE)?.lignes ?? 0) + aImporter.length} ligne(s), `
        + `${euros((avant.find((e) => e.mois === MOIS_OCTOBRE)?.montantHt ?? 0) + aImporter.reduce((s, p) => s + caDe(p.ligne), 0))} ; les autres mois ne sont pas touchés)`] : []),
      '',
      bilan,
    );
  } finally {
    const texte = sortie.join('\n');
    if (texte !== '') {
      const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
      writeFileSync(chemin, texte, 'utf8');
      console.log(texte);
      console.log(`${P} rapport : ${chemin}`);
    }
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e) => { console.error(`${P} échec :`, e instanceof Error ? e.message : e); process.exit(1); });
}
