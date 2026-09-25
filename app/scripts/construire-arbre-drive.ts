/**
 * CLI `gestion:drive:construire` — MODULE « GESTION », LOT DRIVE-1.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : crée, dans le Drive partagé « GESTION LOCATIVE », un dossier NEUF « Base de données locative »
 * et l'arborescence qu'il contient, à partir de l'annuaire (migration 253). Elle ne fait rien d'autre.
 *
 * 🔴 ELLE NE TOUCHE À RIEN DE PRÉEXISTANT. Chaque écriture passe par le double garde-fou (`driveGardeFou`) : le
 * parent doit être sous la racine ET être un dossier que ce programme a lui-même créé. Un refus est journalisé et
 * fait échouer la commande proprement. La SEULE écriture hors de la racine est la création de la racine elle-même.
 *
 * 🔴 SI « Base de données locative » EXISTE DÉJÀ dans « GESTION LOCATIVE », la commande S'ARRÊTE et demande à Arno.
 * Elle ne le réutilise pas : adopter un dossier dont on ignore l'origine le ferait entrer d'un coup dans la liste
 * blanche, et tout ce lot repose sur le fait que cette liste ne contient que ce que nous avons fait.
 *
 * DEUX MODES :
 *   • DÉFAUT = À BLANC. Rien n'est écrit, ni dans Drive ni en base. La commande dit ce qui serait créé, et combien ;
 *   • --appliquer = création réelle, au rythme bridé, reprenable : ce qui est déjà mémorisé n'est jamais recréé.
 *
 * OPTIONS :
 *   --compte=adresse   au nom de qui écrire (défaut : gestion@criterimmo.fr)
 *   --essai            ne crée QUE : la racine, les trois dossiers de tête, le PREMIER propriétaire par ordre
 *                      alphabétique et UN de ses biens, avec leurs sous-dossiers. Pour la vérification visuelle.
 *   --appliquer        écrit pour de bon
 *
 * EXEMPLES :
 *   npm run gestion:drive:construire
 *   npm run gestion:drive:construire -- --essai --appliquer
 *   npm run gestion:drive:construire -- --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import {
  construirePlanArbre, resumerPlanArbre, CLE_RACINE, type NoeudPlan, type Plan,
} from '../lib/gestion/driveArbre';
import { DRIVE_NOM, indexer, RACINE_NOM, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { creerDossier, creerRaccourci, creerRacine, respirer, type DepsDrive } from '../lib/gestion/driveEcriture';
import {
  compterRefus, enregistrerNoeud, lireArbre, lireClesMemorisees, lireSourcesArbre, noterDossierProprietaire,
} from '../lib/gestion/driveArbreRepo';

const P = '[gestion:drive:construire]';
export const COMPTE_DEFAUT = 'gestion@criterimmo.fr';

export interface OptionsConstruction {
  compte: string;
  appliquer: boolean;
  essai: boolean;
}

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[]): OptionsConstruction {
  const c = argv.find((a) => a.startsWith('--compte='));
  return {
    compte: c === undefined ? COMPTE_DEFAUT : c.slice('--compte='.length),
    appliquer: argv.includes('--appliquer'),
    essai: argv.includes('--essai'),
  };
}

/**
 * RESTREINT LE PLAN À L'ESSAI : la racine, les trois dossiers de tête, le PREMIER propriétaire (ordre alphabétique,
 * l'ordre du plan) et UN de ses biens, avec tout ce qui pend dessous. PUR — donc éprouvable sans réseau.
 *
 * ⚠️ SI LE PREMIER PROPRIÉTAIRE N'A AUCUN BIEN, on prend le premier bien du plan : l'essai doit montrer un bien
 * complet avec ses quatre rubriques, sinon il ne prouve rien.
 */
export function restreindreAEssai(plan: Plan): Plan {
  const tete = plan.noeuds.filter((n) => n.parent === null || n.parent.cle === CLE_RACINE);
  const premierProp = plan.noeuds.find((n) => n.sorte === 'proprietaire');
  const garde = new Set<string>(tete.map((n) => `${n.sorte}|${n.cle}`));

  let bienCle: string | null = null;
  if (premierProp !== undefined) {
    garde.add(`proprietaire|${premierProp.cle}`);
    const raccourci = plan.noeuds.find((n) => n.sorte === 'raccourci' && n.parent?.cle === premierProp.cle);
    bienCle = raccourci?.cible?.cle ?? null;
  }
  if (bienCle === null) bienCle = plan.noeuds.find((n) => n.sorte === 'bien')?.cle ?? null;

  const retenu = (n: NoeudPlan): boolean => {
    if (garde.has(`${n.sorte}|${n.cle}`)) return true;
    if (premierProp !== undefined && n.parent?.sorte === 'proprietaire' && n.parent.cle === premierProp.cle) {
      // Le « En attente » du propriétaire, et le seul raccourci qui vise le bien de l'essai.
      return n.sorte !== 'raccourci' || n.cible?.cle === bienCle;
    }
    if (bienCle === null) return false;
    if (n.sorte === 'bien' && n.cle === bienCle) return true;
    if (n.parent?.sorte === 'bien' && n.parent.cle === bienCle) return true;
    // Les baux du bien de l'essai, sous « 1 Locataires ».
    if (n.sorte === 'occupation' && n.parent?.sorte === 'rubrique' && n.parent.cle.startsWith(`${bienCle}|`)) return true;
    return false;
  };

  const noeuds = plan.noeuds.filter(retenu);
  const comptes: Record<string, number> = {};
  for (const n of noeuds) comptes[n.sorte] = (comptes[n.sorte] ?? 0) + 1;
  comptes.total = noeuds.length;
  return { noeuds, comptes };
}

/** Le Drive partagé « GESTION LOCATIVE », lu chez Google. On ne code JAMAIS son identifiant en dur. */
async function trouverDrive(jeton: string): Promise<{ id: string; nom: string } | null> {
  const r = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)',
    { headers: { Authorization: `Bearer ${jeton}` } });
  if (!r.ok) return null;
  const j = (await r.json()) as { drives?: { id: string; name: string }[] };
  const d = (j.drives ?? []).find((x) => x.name.trim().toUpperCase() === DRIVE_NOM);
  return d === undefined ? null : { id: d.id, nom: d.name };
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  console.log('');
  console.log(`${P} ${o.appliquer ? '── CONSTRUCTION RÉELLE ──' : '── À BLANC (aucune écriture) ──'}`);
  console.log(`${P} compte : ${o.compte}${o.essai ? ' · mode ESSAI (racine + 1 propriétaire + 1 bien)' : ''}`);

  // ── LES SOURCES ET LE PLAN ──────────────────────────────────────────────────────────────────────────────────
  const sources = await lireSourcesArbre();
  if (sources.etat === 'sans_schema') {
    console.error(`\n${P} ❌ La migration 254 n’est pas appliquée : l’arborescence n’a pas de mémoire.`);
    console.error(`${P}    cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/254_gestion_drive_arbre.sql\n`);
    process.exitCode = 1;
    return;
  }
  const planComplet = construirePlanArbre(sources.data);
  const plan = o.essai ? restreindreAEssai(planComplet) : planComplet;

  console.log('');
  console.log(`${P} CE QUE L’ANNUAIRE DEMANDE :`);
  for (const l of resumerPlanArbre(planComplet)) console.log(`${P}   · ${l}`);
  if (o.essai) {
    console.log(`${P}   → mode ESSAI : ${plan.comptes.total} éléments seulement`);
  }

  // ── CE QUI EXISTE DÉJÀ ──────────────────────────────────────────────────────────────────────────────────────
  const memoire = await lireClesMemorisees();
  const arbre = await lireArbre();
  if (memoire.etat === 'sans_schema' || arbre.etat === 'sans_schema') { process.exitCode = 1; return; }
  const dejaLa = memoire.data;
  const aCreer = plan.noeuds.filter((n) => !dejaLa.has(`${n.sorte}|${n.cle}`));

  console.log('');
  console.log(`${P} DÉJÀ MÉMORISÉS : ${dejaLa.size} · À CRÉER : ${aCreer.length}`);
  if (!o.appliquer) {
    for (const n of aCreer.slice(0, 40)) console.log(`${P}   + ${n.sorte.padEnd(14)} ${n.chemin}`);
    if (aCreer.length > 40) console.log(`${P}   … et ${aCreer.length - 40} autres`);
    console.log('');
    console.log(`${P} Rien n’a été écrit. Pour créer : relancer avec --appliquer.`);
    return;
  }

  // ── LE JETON ────────────────────────────────────────────────────────────────────────────────────────────────
  const jeton = await jetonPourSubject(o.compte, { fetch });
  if (!jeton.ok) {
    console.error(`\n${P} ❌ ${jeton.motif}\n`);
    process.exitCode = 1;
    return;
  }
  const drive = await trouverDrive(jeton.jeton);
  if (drive === null) {
    console.error(`\n${P} ❌ Le Drive partagé « ${DRIVE_NOM} » n’est pas visible par ${o.compte}.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`${P} Drive « ${drive.nom} » : ${drive.id}`);

  const deps: DepsDrive = { fetch };
  const noeuds: NoeudArbre[] = [...arbre.data];
  const parCle = new Map(dejaLa);
  let crees = 0;
  const refusAvant = await compterRefus();

  for (const n of aCreer) {
    const index = indexer(noeuds);

    // ── LA RACINE : le seul cas qui écrit hors de l'arborescence. ──────────────────────────────────────────
    if (n.sorte === 'racine') {
      const r = await creerRacine({ driveId: drive.id, nom: n.nom }, index, jeton.jeton, deps);
      if (!r.ok) {
        console.error(`\n${P} ${r.refuse ? '🔴 REFUSÉ' : '❌ ÉCHEC'} — ${r.motif}\n`);
        process.exitCode = 1;
        return;
      }
      await enregistrerNoeud({ driveId: r.id, parentDriveId: null, sorte: n.sorte, cle: n.cle, nom: r.nom, chemin: n.chemin });
      noeuds.push({ driveId: r.id, parentDriveId: null, sorte: n.sorte, nom: r.nom, chemin: n.chemin });
      parCle.set(`${n.sorte}|${n.cle}`, r.id);
      crees += 1;
      console.log(`${P}   ✅ ${n.sorte.padEnd(14)} ${r.nom}  [${r.id}]`);
      await respirer(deps);
      continue;
    }

    const parentId = n.parent === null ? null : parCle.get(`${n.parent.sorte}|${n.parent.cle}`) ?? null;
    if (parentId === null) {
      console.error(`\n${P} ❌ Parent introuvable pour ${n.chemin} — construction interrompue, rien n’est bâti à l’aveugle.\n`);
      process.exitCode = 1;
      return;
    }

    const r = n.sorte === 'raccourci'
      ? await creerRaccourci(
        { parentDriveId: parentId, cibleDriveId: parCle.get(`${n.cible?.sorte}|${n.cible?.cle}`) ?? '', nom: n.nom },
        index, jeton.jeton, deps)
      : await creerDossier({ parentDriveId: parentId, nom: n.nom }, index, jeton.jeton, deps);

    if (!r.ok) {
      console.error(`\n${P} ${r.refuse ? '🔴 REFUSÉ PAR LE GARDE-FOU' : '❌ ÉCHEC'} — ${n.chemin}`);
      console.error(`${P}    ${r.motif}\n`);
      process.exitCode = 1;
      return;
    }
    await enregistrerNoeud({
      driveId: r.id, parentDriveId: parentId, sorte: n.sorte, cle: n.cle, nom: r.nom, chemin: n.chemin,
    });
    noeuds.push({ driveId: r.id, parentDriveId: parentId, sorte: n.sorte, nom: r.nom, chemin: n.chemin });
    parCle.set(`${n.sorte}|${n.cle}`, r.id);
    if (n.sorte === 'proprietaire') await noterDossierProprietaire(n.cle, r.id);
    crees += 1;
    if (crees % 50 === 0 || plan.comptes.total < 60) {
      console.log(`${P}   ✅ ${n.sorte.padEnd(14)} ${r.nom}  [${r.id}]`);
    }
    await respirer(deps);
  }

  const refusApres = await compterRefus();
  console.log('');
  console.log(`${P} ── TERMINÉ ── ${crees} élément(s) créé(s) · refus du garde-fou pendant cette passe : ${refusApres - refusAvant}`);
  console.log(`${P} Racine : https://drive.google.com/drive/folders/${parCle.get(`racine|${CLE_RACINE}`) ?? '?'}`);
  if (!o.essai && aCreer.length > crees) {
    console.log(`${P} Il reste ${aCreer.length - crees} éléments : relancer la même commande, elle reprend où elle s’est arrêtée.`);
  }
  console.log(`${P} Racine attendue : « ${RACINE_NOM} » dans « ${DRIVE_NOM} ».`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(async () => {
    const { closePool } = await import('../lib/db/client');
    await closePool();
  });
}
