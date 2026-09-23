/**
 * CLI `gestion:sonder` — MODULE « GESTION », LOT 0 : SONDE du dossier IMAP porté par le libellé GESTION.
 *
 * 🔒 LECTURE STRICTE, TOTALE ET VÉRIFIABLE :
 *   · la boîte est ouverte en `readOnly` (EXAMINE) — aucun flag posé, rien de déplacé, rien de supprimé ;
 *   · AUCUNE écriture en base : ce fichier n'importe NI `db/client`, NI aucun dépôt — il n'y a donc aucun chemin d'écriture
 *     atteignable, ce n'est pas une promesse mais une propriété du graphe d'imports ;
 *   · AUCUNE écriture sur le stockage objet : les pièces ne sont ni déposées ni même conservées en mémoire (seuls leur type
 *     et leur poids sont retenus, cf. `versSonde`) ;
 *   · AUCUN envoi : le graphe n'atteint ni nodemailer ni aucun module d'émission.
 *
 * ⚠️ `app/lib/email/imap.ts` N'EST PAS MODIFIÉ par ce lot : on n'appelle que `creerClientApprofondi`, qui sait DÉJÀ lister les
 * dossiers et en ouvrir un par son chemin en lecture seule (imap.ts:250-287). La règle « un seul fichier importe imapflow »
 * reste donc intacte, et le module Permis n'est touché d'aucune façon.
 *
 * Compte utilisé : le compte PAR DÉFAUT (`lireCompteImap('')`), c'est-à-dire la boîte déjà relevée par la veille des permis —
 * celle qui porte le libellé GESTION. Aucun nouvel identifiant, aucun OAuth. Compte absent → message clair et sortie 0
 * (ce n'est pas une erreur — même convention que `demandes:relever`).
 *
 * Usage :
 *   npm run gestion:sonder                          # dossier GESTION, 90 jours, échantillon de 150 messages
 *   npm run gestion:sonder -- --lister-dossiers     # ne fait QUE lister les dossiers IMAP, puis sort
 *   npm run gestion:sonder -- --dossier="GESTION" --jours=90 --echantillon=0   # 0 = TOUT analyser (long)
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import type { ClientApprofondi } from '../lib/veille/releveApprofondie'; // TYPE SEUL (effacé à la compilation) — aucun couplage d'exécution
import type { MessageBoite } from '../lib/veille/releveReponses';        // TYPE SEUL
import {
  choisirDossier, echantillonner, formaterRapport, lireEntier, lireTexte, synthetiser,
  type ContexteSonde, type MessageSonde,
} from '../lib/gestion/sonde';

const DOSSIER_DEFAUT = 'GESTION';
const ADRESSE_SORTANTE_DEFAUT = 'gestion@criterimmo.fr';
const JOURS_DEFAUT = 90;
const ECHANTILLON_DEFAUT = 150; // borne de confort : ~150 messages se lisent en quelques minutes ; `--echantillon=0` = tout

/**
 * Projette un message lu en la vue MINIMALE que la sonde mesure. ⚠️ Le CONTENU des pièces jointes est ABANDONNÉ ICI (seuls le
 * type MIME et la taille sont retenus) : la mémoire reste bornée quel que soit le nombre de messages, et aucun octet de pièce
 * ne survit à cette fonction. PUR.
 */
export function versSonde(mb: MessageBoite): MessageSonde {
  return {
    uid: mb.uid,
    messageId: mb.message.messageId ?? '',
    inReplyTo: mb.message.inReplyTo ?? null,
    references: mb.message.references ?? [],
    deAdresse: mb.message.deAdresse,
    objet: mb.message.objet ?? null,
    corpsTexte: mb.message.corpsTexte ?? null,
    entetes: mb.message.entetes ?? {},
    pieces: mb.pieces.map((p) => ({ typeMime: p.typeMime, tailleOctets: p.tailleOctets })),
  };
}

/** Début de la fenêtre : aujourd'hui − `jours`. PUR (l'instant est injecté → testable). */
export function debutFenetre(maintenant: Date, jours: number): Date {
  return new Date(maintenant.getTime() - jours * 86_400_000);
}

/** Dépendances de la sonde, injectées → le cœur ci-dessous se teste sans aucune connexion. */
export interface DepsSonde {
  creerClient(): ClientApprofondi | null; // null = aucun compte IMAP configuré (pas une erreur)
  maintenant(): Date;
  log(s: string): void;
}

/**
 * Cœur de la sonde. Renvoie le code de sortie du CLI. Ne JETTE pas pour un cas prévisible (compte absent, dossier introuvable) :
 * il dit ce qu'il a trouvé et sort. La boîte est TOUJOURS refermée (`finally`).
 */
export async function executerSonde(argv: readonly string[], deps: DepsSonde): Promise<number> {
  const dossierDemande = lireTexte(argv, 'dossier', DOSSIER_DEFAUT);
  const adresseSortante = lireTexte(argv, 'adresse-sortante', ADRESSE_SORTANTE_DEFAUT);
  const jours = lireEntier(argv, 'jours', JOURS_DEFAUT);
  const echantillonMax = lireEntier(argv, 'echantillon', ECHANTILLON_DEFAUT, true);
  const listerSeulement = argv.includes('--lister-dossiers');

  const client = deps.creerClient();
  if (client === null) {
    deps.log('[gestion:sonder] aucun compte IMAP configuré (variables SMTP_* absentes du .env) — rien à sonder. Ce n’est pas une erreur.');
    return 0;
  }

  deps.log('[gestion:sonder] LECTURE STRICTE — aucune écriture (ni base, ni stockage, ni boîte). Connexion…');
  await client.ouvrir();
  try {
    const boites = await client.listerBoites();
    if (listerSeulement) {
      deps.log(`\n[gestion:sonder] ${boites.length} dossier(s) IMAP :`);
      for (const b of boites) deps.log(`    ${b}`);
      deps.log('');
      return 0;
    }

    const dossier = choisirDossier(boites, dossierDemande);
    if (dossier === null) {
      deps.log(`\n[gestion:sonder] ⚠ aucun dossier ne correspond à « ${dossierDemande} ». Voici les ${boites.length} dossiers réels :`);
      for (const b of boites) deps.log(`    ${b}`);
      deps.log(`\n  → relancer avec le chemin exact, ex. : npm run gestion:sonder -- --dossier="<chemin ci-dessus>"\n`);
      return 1;
    }

    const depuis = debutFenetre(deps.maintenant(), jours);
    await client.ouvrirBoite(dossier); // readOnly (EXAMINE) — imposé par imap.ts, jamais un choix d'ici
    deps.log(`[gestion:sonder] dossier « ${dossier} » ouvert en lecture seule ; fenêtre de ${jours} jours.`);

    // Deux recherches CÔTÉ SERVEUR : le total de la fenêtre, et — mesure (a) — les messages émis par gestion@ (exhaustif, gratuit).
    const uids = await client.chercher({ depuis });
    const uidsSortants = await client.chercher({ depuis, from: adresseSortante });
    deps.log(`[gestion:sonder] ${uids.length} message(s) dans la fenêtre ; ${uidsSortants.length} émis par ${adresseSortante}.`);

    const aLire = echantillonner(uids, echantillonMax);
    if (aLire.length < uids.length) deps.log(`[gestion:sonder] échantillon à pas constant : ${aLire.length} message(s) sur ${uids.length} (--echantillon=0 pour tout lire).`);

    const messages: MessageSonde[] = [];
    let echecs = 0;
    for (const [i, uid] of aLire.entries()) {
      try {
        messages.push(versSonde(await client.telechargerMessage(uid)));
      } catch (e) {
        // ISOLATION : un message illisible (MIME cassé, disparu entre la recherche et la lecture) ne fait pas échouer la sonde.
        echecs += 1;
        deps.log(`[gestion:sonder] message uid ${uid} illisible, ignoré : ${e instanceof Error ? e.message : String(e)}`);
      }
      if ((i + 1) % 25 === 0) deps.log(`[gestion:sonder] … ${i + 1}/${aLire.length} lus`);
    }

    const contexte: ContexteSonde = {
      dossier, jours, depuis, totalFenetre: uids.length,
      sortantsGestion: uidsSortants.length, adresseSortante, echecsTelechargement: echecs,
    };
    for (const ligne of formaterRapport(synthetiser(contexte, messages))) deps.log(ligne);
    return 0;
  } finally {
    await client.fermer();
  }
}

/** Câblage RÉEL (imports dynamiques : gardent imapflow HORS du graphe importé par les tests). */
async function main(): Promise<void> {
  const { lireCompteImap } = await import('../lib/email');
  const { creerClientApprofondi } = await import('../lib/email/imap');
  const compte = lireCompteImap(''); // compte PAR DÉFAUT = la boîte qui porte le libellé GESTION
  process.exitCode = await executerSonde(process.argv, {
    creerClient: () => (compte === null ? null : creerClientApprofondi(compte)),
    maintenant: () => new Date(),
    log: (s) => console.log(s),
  });
}

// Point d'entrée : n'exécute `main()` que si le fichier est lancé DIRECTEMENT, jamais à l'import par un test.
const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main().catch((e) => { console.error('[gestion:sonder] échec', e); process.exitCode = 1; });
}
