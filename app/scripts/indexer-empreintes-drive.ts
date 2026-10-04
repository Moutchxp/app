/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — LE BALAYAGE QUI REMPLIT L'INDEX ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « balayage de fond des drives partagés et de “Mon Drive” (files.list paginé, champs
 * minimaux, AUCUNE écriture Drive), puis changes.list. AVANT de lancer le balayage complet : compte les fichiers
 * par drive (estimation), la durée et le quota estimés. Arrête-toi et demande à Arno avec ces chiffres. »
 *
 * 🔒🔒 SANS `--appliquer`, CE SCRIPT NE FAIT QUE COMPTER. C'est le mode par défaut, et c'est délibéré : le geste
 * qu'Arno doit autoriser est l'indexation, pas le comptage — et le comptage est précisément ce qui lui permet de
 * décider. Il ne lit que des métadonnées, n'écrit rien en base et rien dans le Drive.
 *
 * 🔒🔒 IL N'ÉCRIT JAMAIS DANS LE DRIVE, ET IL NE SAIT PAS LE FAIRE : il n'émet que `files.list`,
 * `changes.getStartPageToken` et `changes.list` — trois lectures. Aucun module d'écriture Drive n'est importé, et
 * un garde statique le vérifie.
 *
 * 🔴🔴 « Documents clients scannés » EST INDEXÉ EN MÉTADONNÉES, ET SEULEMENT EN MÉTADONNÉES : un nom, un parent,
 * une empreinte, une date. C'est tout ce qu'il faut pour DIRE qu'un document y est déjà rangé, sans jamais en
 * ouvrir le contenu ni y toucher. Le garde d'écriture de l'archive n'est pas effleuré par ce lot.
 *
 * ═══ 🔴🔴 LES CHIFFRES MESURÉS LE 03/10/2026 — PASSE RÉELLE, AVEC LES CHAMPS DE L'INDEX ═════════════════════════
 *
 * 🔴 CE NE SONT PAS DES ESTIMATIONS. Ce script a tourné en entier dans son mode par défaut : les corpus ont été
 * ÉNUMÉRÉS pour de vrai, avec exactement les champs que l'indexation demande, et rien n'a été écrit.
 *
 *     drive                        fichiers  dossiers  empreintes  pages      durée
 *     Catherine                          21         9          21      1      507 ms
 *     COMPTABILITE                      420        93         419      2     1719 ms
 *     Direction                       23659      3124       23659     59    69575 ms
 *     GESTION LOCATIVE                74799      9162       74429    183   240455 ms
 *     Hélène                              1         0           1      1      366 ms
 *     IA                                  1         1           1      1      406 ms
 *     Mot de passe                       15         1          15      1      455 ms
 *     SANSVISAVIS                     48040      6058       48034    118   145746 ms
 *     Test                               30         4          30      1      462 ms
 *     TRAVELNKEYS                      6201       619        6201     15    17997 ms
 *     Mon Drive (a.jorel)             27814      1926       23320     65    70018 ms
 *     TOTAL                          181001     20997      176130    447   546386 ms  (9 min 8 s)
 *
 * ⚠️ 447 PAGES, ET NON 209 : une page porte mille entrées AU PLUS, mais Google plafonne aussi la TAILLE de la
 * réponse. Avec les champs de l'index (nom, empreinte, parents, dates) les pages se remplissent moins qu'avec
 * `files(id,mimeType)` seul — d'où un peu plus d'appels, et neuf minutes au lieu de six. Le chiffre qui compte
 * est celui-ci, parce que c'est celui du balayage qu'on lancerait vraiment.
 *
 * ⚠️ ET LE DÉBIT EST DE 49 APPELS PAR MINUTE. Le quota Drive se compte en requêtes par minute : 49, là où un
 * appel par fichier en aurait demandé 181 001. C'est l'écart qui répond à « est-ce que ça passe ? ».
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/indexer-empreintes-drive.ts                 # compte et chiffre, n'écrit rien
 *   npx tsx --env-file=.env app/scripts/indexer-empreintes-drive.ts --appliquer
 *   npx tsx --env-file=.env app/scripts/indexer-empreintes-drive.ts --appliquer --drive=Test
 *   npx tsx --env-file=.env app/scripts/indexer-empreintes-drive.ts --changements    # l'incrément, après un balayage
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { NOM_GENERIQUE_RACINE_DRIVE } from '../lib/gestion/drive';
import { indexEmpreintesDriveDisponible } from '../lib/gestion/schema';
import {
  chiffrageBalayage, ligneIndexable, motChiffrage, motDuree, TAILLE_PAGE_INDEX,
  type EntreeDriveBrute, type LigneIndex, type MesureCorpus,
} from '../lib/gestion/indexEmpreintesDrive';
import {
  etatDeLIndex, etatsDesCorpus, noterBalayage, noterFichiersDisparus, noterFichiersVus, noterIncrement,
} from '../lib/gestion/empreinteDriveRepo';
/**
 * 🔴🔴 LOT FANTOMES-APRES-INDEXATION — le nettoyage des entrées fantômes du registre, lancé APRÈS la passe.
 *
 * 🔒 CE MODULE N'ÉMET AUCUN `fetch` : il reçoit la porte de ce fichier par injection (`portePourFantomes`). Les
 * gardes statiques de ce balayage — un seul `fetch`, aucun module d'écriture Drive — ne sont pas effleurés.
 */
import {
  journaliserFantomes, nettoyerFantomes, phraseBilanFantomes, type DepsFantomes,
} from '../lib/gestion/fantomesEmplacements';

/** 🔒 Le compte qui LIT. Celui de la maison, avec la délégation qui existe déjà — il voit les 10 drives partagés. */
const SUJET = 'a.jorel@sansvisavis.com';
const API = 'https://www.googleapis.com/drive/v3';
/** 🔒 Les champs demandés, et pas un de plus. Aucun ne porte de contenu. */
const CHAMPS = 'nextPageToken,files(id,name,md5Checksum,parents,driveId,mimeType,size,modifiedTime,trashed)';
/** La clé du corpus « Mon Drive » : une clé primaire ne peut pas être nulle, et un corpus sans clé ne se reprend pas. */
const CORPUS_MOI = 'moi';
/** Garde-fou : 400 pages, soit 400 000 entrées par corpus. Au-delà, c'est une anomalie, pas un drive. */
const PAGES_MAX = 400;

let appels = 0;

interface Corpus { cle: string; nom: string; driveId: string | null }

/**
 * ⚠️ LOT FANTOMES-APRES-INDEXATION — L'ERREUR PORTE SON CODE HTTP, en plus de son message.
 *
 * 🔴 POURQUOI C'EST NÉCESSAIRE : le nettoyage des fantômes ne conclut « cette copie a disparu » que sur DEUX
 * codes nommés (404, 403 — `estDisparition`). Un 429 ou un 503 ne conclut rien. Lire le code dans la CHAÎNE du
 * message aurait voulu dire l'extraire par une expression régulière — c'est-à-dire décider d'un geste
 * irréversible sur un `slice` de texte.
 *
 * ⚠️ ET SURTOUT : ON NE ROUVRE PAS UNE SECONDE PORTE. Ce fichier n'a qu'UN SEUL `fetch`, et trois gardes
 * statiques le vérifient (`indexEmpreintesDrive.test.ts`) — c'est la preuve qu'il ne sait pas écrire dans le
 * Drive. Le nettoyage reçoit donc CETTE porte par injection, au lieu d'en ouvrir une à lui.
 */
class ErreurDrive extends Error {
  constructor(public readonly statut: number, message: string) { super(message); this.name = 'ErreurDrive'; }
}

async function lire(h: HeadersInit, chemin: string): Promise<Record<string, unknown>> {
  appels += 1;
  const r = await fetch(`${API}/${chemin}`, { headers: h });
  if (!r.ok) throw new ErreurDrive(r.status, `HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Record<string, unknown>;
}

/**
 * ══ 🔴🔴 LA PORTE DU BALAYAGE, PRÊTÉE AU NETTOYAGE DES FANTÔMES ═════════════════════════════════════════════════
 *
 * DÉCISION D'ARNO (03/10/2026) : « relance automatiquement la détection et la correction des entrées fantômes du
 * registre juste après chaque passe d'indexation (changes.list), et pas en continu. […] Lecture seule sur le
 * Drive. »
 *
 * 🔴 LES DEUX LECTURES PASSENT PAR `lire`, donc par le `fetch` UNIQUE de ce fichier, sans option de méthode : la
 * propriété « ce chemin ne sait que lire » n'est pas affaiblie d'un pouce, et les gardes statiques tiennent.
 *
 * ⚠️ LE NOM DES DOSSIERS EST MÉMORISÉ : plusieurs fantômes peuvent partager le même dossier d'arrivée.
 */
function portePourFantomes(h: HeadersInit): DepsFantomes {
  const noms = new Map<string, string>();
  return {
    lireFichier: async (id) => {
      try {
        const j = await lire(h, `files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,parents,trashed`);
        return {
          ok: true,
          valeur: {
            nom: String(j.name ?? ''),
            parents: (j.parents as string[] | undefined) ?? [],
            trashed: j.trashed === true,
          },
        };
      } catch (e) {
        /* ⚠️ UN CODE INCONNU VAUT 0, ET 0 NE CONCLUT RIEN : `estDisparition` ne rend `true` que sur 404 et 403.
           Une panne réseau (pas de réponse HTTP du tout) ne doit pas faire marquer une copie disparue. */
        return { ok: false, statut: e instanceof ErreurDrive ? e.statut : 0 };
      }
    },
    nomDossier: async (id) => {
      const deja = noms.get(id);
      if (deja !== undefined) return deja;
      try {
        const j = await lire(h, `files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`);
        let nom = String(j.name ?? '').trim();
        /* 🔴🔴 MÊME RATTRAPAGE QUE DANS LA LIGNE DE COMMANDE, et pour la même raison : ce nom est ÉCRIT EN BASE,
           et « Drive » s'afficherait dans le menu des emplacements d'une pièce. Voir `NOM_GENERIQUE_RACINE_DRIVE`. */
        if (nom === NOM_GENERIQUE_RACINE_DRIVE) {
          try {
            const d = await lire(h, `drives/${encodeURIComponent(id)}?fields=id,name`);
            nom = String(d.name ?? '').trim() || nom;
          } catch { /* le vrai nom reste inconnu : « Drive » vaut mieux qu'un nom vide */ }
        }
        if (nom !== '') noms.set(id, nom);
        return nom === '' ? null : nom;
      } catch { return null; }
    },
  };
}

async function corpusVisibles(h: HeadersInit): Promise<Corpus[]> {
  const j = await lire(h, 'drives?pageSize=100&fields=drives(id,name)');
  const drives = (j.drives as { id: string; name: string }[] | undefined) ?? [];
  const filtre = (process.argv.find((x) => x.startsWith('--drive=')) ?? '').slice(8).trim();
  const tous: Corpus[] = [
    ...drives.map((d) => ({ cle: d.id, nom: d.name, driveId: d.id })),
    { cle: CORPUS_MOI, nom: `Mon Drive (${SUJET})`, driveId: null },
  ];
  if (filtre === '') return tous;
  return tous.filter((c) => c.cle === filtre || c.nom.toLowerCase().includes(filtre.toLowerCase()));
}

const parametresDeListe = (c: Corpus, suite: string | null): string =>
  (c.driveId === null
    ? 'corpora=user&includeItemsFromAllDrives=false&supportsAllDrives=true'
    : `corpora=drive&driveId=${c.driveId}&includeItemsFromAllDrives=true&supportsAllDrives=true`)
  + `&q=${encodeURIComponent('trashed=false')}&pageSize=${TAILLE_PAGE_INDEX}&fields=${encodeURIComponent(CHAMPS)}`
  + (suite === null ? '' : `&pageToken=${suite}`);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE JETON DE REPRISE — OBTENU AVANT LE BALAYAGE, SINON IL NE SERT À RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴🔴 IL SE PREND AVANT, ET L'ORDRE EST TOUT. Un jeton pris APRÈS le balayage manquerait les modifications
 * survenues PENDANT — six minutes pendant lesquelles quelqu'un range des fichiers. Pris avant, il les rejouera :
 * `changes.list` rendra deux fois ce qu'on a déjà vu, ce qui ne coûte qu'une mise à jour inutile. Dans un sens on
 * perd des fichiers sans le savoir, dans l'autre on en revoit : le choix n'est pas difficile.
 */
async function jetonDeReprise(h: HeadersInit, c: Corpus): Promise<string | null> {
  try {
    const j = await lire(h, 'changes/startPageToken?supportsAllDrives=true'
      + (c.driveId === null ? '' : `&driveId=${c.driveId}`));
    const t = j.startPageToken;
    return typeof t === 'string' && t !== '' ? t : null;
  } catch (e) {
    console.log(`  ⚠️ jeton de reprise indisponible pour « ${c.nom} » : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② BALAYER UN CORPUS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function balayer(
  h: HeadersInit, c: Corpus, ecrire: boolean,
): Promise<MesureCorpus & { avecEmpreinte: number; ranges: number; plafonne: boolean }> {
  const t0 = Date.now();
  let suite: string | null = null;
  let fichiers = 0; let dossiers = 0; let pages = 0; let avecEmpreinte = 0; let ranges = 0;
  do {
    const j = await lire(h, `files?${parametresDeListe(c, suite)}`);
    const brutes = (j.files as EntreeDriveBrute[] | undefined) ?? [];
    pages += 1;
    const lignes: LigneIndex[] = [];
    for (const f of brutes) {
      const l = ligneIndexable(f, c.driveId);
      if (l === null) continue;
      if (l.estDossier) dossiers += 1; else fichiers += 1;
      if (l.md5 !== null) avecEmpreinte += 1;
      lignes.push(l);
    }
    /* 🔒 L'ÉCRITURE EST EN BASE, PAGE PAR PAGE — une seule requête pour mille entrées. Rien ne part vers Google. */
    if (ecrire && lignes.length > 0) ranges += await noterFichiersVus(lignes);
    suite = typeof j.nextPageToken === 'string' ? j.nextPageToken : null;
  } while (suite !== null && pages < PAGES_MAX);
  return {
    nom: c.nom, fichiers, dossiers, pages, dureeMs: Date.now() - t0,
    avecEmpreinte, ranges, plafonne: suite !== null,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'INCRÉMENT — CE QUI A CHANGÉ DEPUIS LE DERNIER RELEVÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function incrementer(h: HeadersInit, c: Corpus, depart: string, ecrire: boolean): Promise<void> {
  let suite: string | null = depart;
  let vus = 0; let disparus = 0; let pages = 0; let nouveauJeton: string | null = null;
  const CHAMPS_CHANGES = 'nextPageToken,newStartPageToken,changes(fileId,removed,'
    + 'file(id,name,md5Checksum,parents,driveId,mimeType,size,modifiedTime,trashed))';
  while (suite !== null && pages < PAGES_MAX) {
    const j = await lire(h, `changes?pageToken=${suite}&pageSize=${TAILLE_PAGE_INDEX}`
      + '&includeItemsFromAllDrives=true&supportsAllDrives=true&includeRemoved=true'
      + (c.driveId === null ? '' : `&driveId=${c.driveId}&corpora=drive`)
      + `&fields=${encodeURIComponent(CHAMPS_CHANGES)}`);
    pages += 1;
    const changements = (j.changes as { fileId?: string; removed?: boolean; file?: EntreeDriveBrute }[] | undefined) ?? [];
    const aRanger: LigneIndex[] = [];
    const aMarquer: string[] = [];
    for (const ch of changements) {
      /**
       * 🔴 TROIS CAS, ET ILS NE SE CONFONDENT PAS : retiré (droits perdus, suppression définitive), mis à la
       * corbeille (`trashed`), ou modifié. Les deux premiers DATENT la ligne ; le troisième la met à jour.
       */
      if (ch.removed === true || ch.file?.trashed === true) {
        if ((ch.fileId ?? '') !== '') aMarquer.push(ch.fileId as string);
        continue;
      }
      const l = ch.file === undefined ? null : ligneIndexable(ch.file, c.driveId);
      if (l !== null) aRanger.push(l);
    }
    if (ecrire) {
      vus += await noterFichiersVus(aRanger);
      disparus += await noterFichiersDisparus(aMarquer);
    } else { vus += aRanger.length; disparus += aMarquer.length; }
    const nouveau = j.newStartPageToken;
    if (typeof nouveau === 'string' && nouveau !== '') nouveauJeton = nouveau;
    suite = typeof j.nextPageToken === 'string' ? j.nextPageToken : null;
  }
  console.log(`  · « ${c.nom} » : ${vus} à jour, ${disparus} disparu(s), ${pages} page(s)`);
  if (ecrire && nouveauJeton !== null) await noterIncrement(c.cle, nouveauJeton);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE PROGRAMME
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const changements = process.argv.includes('--changements');

  const j = await jetonPourSubject(SUJET, { fetch });
  if (!j.ok) { console.log(`jeton Drive refusé — ${j.motif}`); return; }
  const h = { Authorization: `Bearer ${j.jeton}` };

  const avecIndex = await indexEmpreintesDriveDisponible();
  console.log(avecIndex
    ? '✅ migration 299 appliquée : l’index existe.'
    : '⚠️ migration 299 NON appliquée : `gestion_drive_empreinte` n’existe pas. Rien ne sera rangé.');
  if (appliquer && !avecIndex) {
    console.log('🔴 `--appliquer` sans la table : on s’arrête. Appliquer la migration 299 d’abord.');
    return;
  }

  const corpus = await corpusVisibles(h);
  console.log(`\ncorpus visibles par ${SUJET} : ${corpus.length}`);

  /* ── L'INCRÉMENT ─────────────────────────────────────────────────────────────────────────────────────────── */
  if (changements) {
    console.log(`\n══ L'INCRÉMENT (changes.list) ${appliquer ? '' : '— SIMULATION'} ══════════════════════════`);
    const etats = new Map((await etatsDesCorpus()).map((e) => [e.corpus, e]));
    for (const c of corpus) {
      const depart = etats.get(c.cle)?.pageToken ?? null;
      if (depart === null) {
        console.log(`  · « ${c.nom} » : jamais balayé — aucun jeton de reprise, donc aucun incrément possible.`);
        continue;
      }
      try { await incrementer(h, c, depart, appliquer); } catch (e) {
        console.log(`  ! « ${c.nom} » : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(`\nappels Drive émis : ${appels}`);
    /**
     * ══ 🔴🔴 ET LE NETTOYAGE DES FANTÔMES, JUSTE APRÈS — décision d'Arno ═══════════════════════════════════════
     *
     * 🔴 C'EST LE SEUL MOMENT OÙ IL PEUT APPRENDRE QUELQUE CHOSE. La détection compare le registre des dépôts à
     * l'INDEX, et l'index est précisément ce que `changes.list` vient de rafraîchir. En continu, il relirait un
     * index inchangé ; après la passe, il voit exactement ce qui a bougé.
     *
     * ⚠️ IL SUIT LE MÊME MODE QUE LA PASSE : en simulation (`--changements` seul), il compte sans écrire.
     * ⚠️ ET IL NE PEUT PAS FAIRE ÉCHOUER L'INCRÉMENT : la passe est faite, son jeton de reprise est consigné.
     *    Un nettoyage qui tombe laisse l'index à jour — et la passe suivante le relancera.
     */
    try {
      const bilan = await nettoyerFantomes(portePourFantomes(h), {
        appliquer, dire: (l) => console.log(l),
      });
      console.log(`\n${phraseBilanFantomes(bilan, appliquer)}`);
      if (appliquer) await journaliserFantomes(bilan, true);
    } catch (e) {
      console.log(`! nettoyage des fantômes impossible — ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }

  /* ── LE CHIFFRAGE, PUIS — SEULEMENT SI ON LE DEMANDE — LE BALAYAGE ──────────────────────────────────────── */
  console.log(appliquer
    ? '\n══ LE BALAYAGE ════════════════════════════════════════════════════════════════'
    : '\n══ LE CHIFFRAGE (🔒 rien n’est écrit, ni en base ni dans le Drive) ════════════');
  console.log('drive                        fichiers  dossiers  empreintes  pages      durée');
  const mesures: MesureCorpus[] = [];
  let ranges = 0; let avecEmpreinte = 0;
  for (const c of corpus) {
    try {
      /* 🔴 LE JETON DE REPRISE SE PREND AVANT LE BALAYAGE. Voir l'encadré de `jetonDeReprise`. */
      const reprise = appliquer ? await jetonDeReprise(h, c) : null;
      const m = await balayer(h, c, appliquer);
      mesures.push(m);
      ranges += m.ranges; avecEmpreinte += m.avecEmpreinte;
      console.log(`${c.nom.slice(0, 28).padEnd(28)} ${String(m.fichiers).padStart(8)}`
        + `  ${String(m.dossiers).padStart(8)}  ${String(m.avecEmpreinte).padStart(10)}`
        + `  ${String(m.pages).padStart(5)}  ${String(m.dureeMs).padStart(7)} ms`
        + `${m.plafonne ? '  ⚠️ PLAFONNÉ' : ''}`);
      if (appliquer) {
        await noterBalayage({
          corpus: c.cle, nom: c.nom, pageToken: reprise,
          fichiers: m.fichiers, dossiers: m.dossiers, pages: m.pages, dureeMs: m.dureeMs,
        });
      }
    } catch (e) {
      console.log(`${c.nom.slice(0, 28).padEnd(28)}  ! ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const c = chiffrageBalayage(mesures);
  console.log(`\n${motChiffrage(c)}`);
  console.log(`dont porteuses d’une empreinte md5 : ${avecEmpreinte.toLocaleString('fr-FR')}`);
  console.log(`appels Drive émis par cette passe : ${appels} (durée cumulée ${motDuree(c.dureeMs)})`);
  /**
   * ⚠️ LE QUOTA SE COMPTE EN REQUÊTES PAR MINUTE, PAS EN FICHIERS, et c'est tout l'intérêt des pages de mille :
   * quelques centaines d'appels étalés sur plusieurs minutes, là où un appel par fichier en aurait demandé
   * 181 001. On rend le nombre d'appels et le débit observé plutôt qu'un pourcentage d'un plafond qu'on ne nous
   * annonce pas : c'est ce qu'on sait, et c'est vérifiable.
   */
  console.log(`débit observé : ${(appels / Math.max(1, c.dureeMs / 60000)).toFixed(0)} appels par minute`);

  if (appliquer) {
    const e = await etatDeLIndex();
    console.log(`\n✅ ${ranges} ligne(s) rangée(s). L’index connaît maintenant`
      + ` ${e.fichiers.toLocaleString('fr-FR')} empreinte(s).`);
  } else {
    console.log('\n🔒 RIEN N’A ÉTÉ ÉCRIT. Ces chiffres sont ceux à soumettre à Arno :');
    console.log('   relancer avec --appliquer, APRÈS son accord, pour remplir l’index.');
  }
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
