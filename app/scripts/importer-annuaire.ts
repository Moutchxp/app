/**
 * CLI `gestion:annuaire:importer` — MODULE « GESTION », LOT ANNUAIRE-1.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : lit les trois exports WIPPIMMO (`Lots.xlsx`, `Bailleurs.xlsx`, `Locataires.xlsx`) dans le
 * dossier indiqué, et remplit l'annuaire. Elle ne touche à RIEN d'autre : ni `gestion_config`, ni la boîte mail, ni
 * le Drive, ni aucune table du courrier.
 *
 * DEUX MODES, UNE SEULE FRONTIÈRE D'ÉCRITURE :
 *   • DÉFAUT (sans `--appliquer`) = SIMULATION. Les fichiers sont lus, TOUT est calculé et comparé à ce qui est déjà
 *     en base, et RIEN n'est écrit. C'est le mode qui permet de regarder ce qui serait posé AVANT de le laisser
 *     poser. La passe elle-même est journalisée puis défaite avec le reste : la simulation ne laisse aucune trace ;
 *   • `--appliquer` = VRAIE PASSE, en UNE transaction (ou tout, ou rien).
 *
 * 🔴 IDEMPOTENTE. Chaque table porte l'identifiant WIPPIMMO en clé UNIQUE. Relancer l'import dix fois de suite
 * laisse exactement le même contenu, et le rapport le dit : tout en « inchangé ».
 *
 * 🔴 RIEN N'EST JAMAIS EFFACÉ. Ce qui disparaît d'un export suivant est MARQUÉ « absent du dernier export » ; la
 * ligne reste, avec son historique. Un export tronqué — exportation interrompue, filtre oublié — ne peut donc pas
 * vider l'annuaire en silence.
 *
 * 🔴 LES HOMONYMES SONT SIGNALÉS, JAMAIS FUSIONNÉS. Deux bailleurs de même nom laissent leurs lots sans propriétaire
 * rattaché, avec le texte d'origine conservé, et la commande le DIT en toutes lettres.
 *
 * OPTIONS :
 *   --dossier=<chemin>   où sont les trois .xlsx (défaut : ~/Downloads)
 *   --appliquer          écrit pour de bon (sans elle : simulation)
 *
 * EXEMPLES :
 *   npm run gestion:annuaire:importer -- --dossier=/Users/macbookprom4arnaud/Downloads
 *   npm run gestion:annuaire:importer -- --dossier=/Users/macbookprom4arnaud/Downloads --appliquer
 *
 * 🔒 LES FICHIERS SONT LUS, JAMAIS ÉCRITS NI DÉPLACÉS NI COPIÉS. Aucun chemin n'est mémorisé en base au-delà du
 * nom du dossier, qui sert au journal — et aucune donnée personnelle ne sort de cette commande.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { construirePlan, ErreurSource, resumerPlan, type PlanImport } from '../lib/gestion/annuaireImport';
import { appliquerPlan, type ComptesImport } from '../lib/gestion/annuaireRepo';
import { ErreurClasseur, lireClasseur, type FeuilleLue } from '../lib/gestion/xlsxLecture';

/** Les trois fichiers attendus, et le nom sous lequel on les cherche. */
export const FICHIERS = {
  bailleurs: 'Bailleurs.xlsx',
  lots: 'Lots.xlsx',
  locataires: 'Locataires.xlsx',
} as const;

export interface OptionsImport {
  dossier: string;
  appliquer: boolean;
}

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[], defautDossier: string): OptionsImport {
  const arg = argv.find((a) => a.startsWith('--dossier='));
  return {
    dossier: arg === undefined ? defautDossier : arg.slice('--dossier='.length),
    appliquer: argv.includes('--appliquer'),
  };
}

/** Le dossier par défaut : celui où le navigateur dépose les exports. */
export const dossierParDefaut = (): string => join(homedir(), 'Downloads');

/**
 * LIT LES TROIS CLASSEURS. Un fichier manquant arrête TOUT, avec son chemin — importer deux fichiers sur trois
 * marquerait « disparus » tous les lots et tous les baux, ce qui serait un désastre silencieux.
 */
export function lireSources(dossier: string, lire: (chemin: string) => Buffer = readFileSync): {
  bailleurs: FeuilleLue; lots: FeuilleLue; locataires: FeuilleLue;
} {
  const un = (nom: string): FeuilleLue => {
    const chemin = join(dossier, nom);
    let octets: Buffer;
    try {
      octets = lire(chemin);
    } catch {
      throw new ErreurSource(`Fichier introuvable ou illisible : ${chemin}`);
    }
    try {
      return lireClasseur(octets);
    } catch (e) {
      const motif = e instanceof ErreurClasseur ? e.message : String(e);
      throw new ErreurSource(`${nom} : ${motif}`);
    }
  };
  return { bailleurs: un(FICHIERS.bailleurs), lots: un(FICHIERS.lots), locataires: un(FICHIERS.locataires) };
}

/** Le compte rendu, en français, prêt à lire dans un terminal. PUR — donc éprouvable sans base. */
export function rendreRapport(plan: PlanImport, c: ComptesImport, o: OptionsImport): string[] {
  const l: string[] = [];
  l.push(o.appliquer ? '── IMPORT APPLIQUÉ ──' : '── SIMULATION (aucune écriture) ──');
  l.push(`dossier : ${o.dossier}`);
  l.push('');
  l.push('CE QUI A ÉTÉ LU');
  for (const ligne of resumerPlan(plan)) l.push(`  · ${ligne}`);
  l.push('');
  l.push(o.appliquer ? 'CE QUI A ÉTÉ ÉCRIT' : 'CE QUI SERAIT ÉCRIT');
  const bloc = (quoi: string, crees: number, majs: number, inchanges: number): string =>
    `  · ${quoi.padEnd(14)} ${String(crees).padStart(5)} créé(s)  ${String(majs).padStart(5)} mis à jour  `
    + `${String(inchanges).padStart(5)} inchangé(s)`;
  l.push(bloc('propriétaires', c.proprietairesCrees, c.proprietairesMajs, c.proprietairesInchanges));
  l.push(bloc('lots', c.lotsCrees, c.lotsMajs, c.lotsInchanges));
  l.push(bloc('locataires', c.locatairesCrees, c.locatairesMajs, c.locatairesInchanges));
  l.push(bloc('baux', c.occupationsCreees, c.occupationsMajs, c.occupationsInchangees));
  l.push(`  · contacts       ${String(c.contactsCrees).padStart(5)} ajouté(s)  `
    + `${String(c.contactsRetires).padStart(5)} marqué(s) « retiré de l’export »`);
  l.push('');
  l.push(`DISPARUS DU DERNIER EXPORT (marqués, JAMAIS effacés) : ${c.disparus}`);
  if (c.revenus > 0) l.push(`REVENUS dans l’export (la mention « absent » est levée) : ${c.revenus}`);

  if (plan.homonymes.length > 0) {
    l.push('');
    l.push('🔴 HOMONYMES DE PROPRIÉTAIRES — signalés, JAMAIS fusionnés :');
    for (const h of plan.homonymes) {
      l.push(`  · « ${h.nom} » porté par les identifiants WIPPIMMO ${h.wippimmoIds.join(', ')} `
        + `— ${h.lotsEnAttente} lot(s) restent sans propriétaire rattaché`);
    }
    l.push('  Pour les rattacher : distinguer les deux fiches dans WIPPIMMO (prénom, second prénom, raison');
    l.push('  sociale), puis relancer cet import. Aucun rapprochement n’est fait au jugé.');
  }

  if (plan.rejets.length > 0) {
    l.push('');
    l.push(`REJETS (${plan.rejets.length}) — chacun avec son motif :`);
    for (const r of plan.rejets.slice(0, 40)) l.push(`  · ${r.source} ligne ${r.ligne} — ${r.motif}`);
    if (plan.rejets.length > 40) l.push(`  · … et ${plan.rejets.length - 40} autre(s), tous dans le journal d’import.`);
  }

  if (!o.appliquer) {
    l.push('');
    l.push('Rien n’a été écrit. Pour appliquer : relancer la même commande avec --appliquer.');
  }
  return l;
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2), dossierParDefaut());
  let sources;
  try {
    sources = lireSources(o.dossier);
  } catch (e) {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    console.error(`Attendus dans ce dossier : ${Object.values(FICHIERS).join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  const plan = construirePlan(sources);
  const issue = await appliquerPlan(plan, { dossier: o.dossier, appliquer: o.appliquer });
  if (issue.etat === 'sans_schema') {
    console.error('\n❌ L’annuaire n’est pas installé : la migration 253 n’est pas appliquée.\n');
    console.error('   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E \'^DATABASE_URL=\' .env | xargs)');
    console.error('   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/253_gestion_annuaire.sql\n');
    process.exitCode = 1;
    return;
  }
  for (const ligne of rendreRapport(plan, issue.comptes, o)) console.log(ligne);
}

// Exécutée seulement quand on LANCE ce fichier — jamais quand un test l'importe pour éprouver ses fonctions pures.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(async () => {
    const { closePool } = await import('../lib/db/client');
    await closePool();
  });
}
