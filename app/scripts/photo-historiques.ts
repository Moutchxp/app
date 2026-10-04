/**
 * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — LA PHOTOGRAPHIE D'INVISIBILITÉ. LECTURE SEULE ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONDITION ABSOLUE D'ARNO (04/10/2026) : « Arno est d'accord pour réunir la règle en un seul code […] À CONDITION
 * qu'il ne voie STRICTEMENT AUCUN changement, ni fonctionnel ni graphique, sur tout ce qui est déjà validé. »
 *
 * Et : « AVANT : photographie la sortie actuelle […] APRÈS l'unification : refais la même photographie. Les deux
 * doivent être IDENTIQUES à l'octet près (compare les empreintes et donne-les). »
 *
 * ═══ 🔴🔴 POURQUOI CETTE PHOTOGRAPHIE PROUVE QUELQUE CHOSE, ET COMMENT ELLE POURRAIT N'EN RIEN PROUVER ════════════
 *
 * Elle appelle les **VRAIES FONCTIONS DE PRODUCTION**, celles que les routes appellent :
 *   · `ficheRattachementDuFil()` + le module pur `biensDuMail()` — exactement ce que fait la fenêtre
 *     « Visualiser / Modifier » (la fenêtre charge la fiche UNE fois, puis réduit au mail affiché) ;
 *   · `etendreCible()` + `pageHistorique()` + `enteteHistorique()` — exactement ce que fait la route
 *     `/api/admin/gestion/historique`, page par page, dans l'ordre.
 *
 * 🔴 SI ELLE RÉÉCRIVAIT LES REQUÊTES À SA FAÇON, elle ne prouverait RIEN : on comparerait deux fois sa propre
 * version, pendant que la production dériverait à côté. C'est tout le piège d'un test de non-régression écrit en
 * parallèle du code qu'il surveille, et c'est pour cela qu'aucune ligne de SQL n'est écrite ici.
 *
 * ⚠️ AUCUN DES DÉPÔTS APPELÉS N'EST `server-only` : vérifié avant d'écrire ce script. Le garde
 * `serverOnly.guard.test.ts` interdit à un script d'atteindre un module `server-only` — s'il le devenait, cette
 * photographie devrait passer par les routes HTTP, et non par les fonctions.
 *
 * ═══ 🔒 LECTURE SEULE ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Aucun verbe d'écriture SQL, aucun appel réseau. Il n'écrit qu'un fichier sur le Bureau, dont le nom est donné en
 * argument. Un garde statique relit son propre source et refuse de démarrer sinon.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/photo-historiques.ts avant
 *   npx tsx --env-file=.env app/scripts/photo-historiques.ts apres
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { query } from '../lib/db/client';
import { ficheRattachementDuFil } from '../lib/gestion/ficheRattachementRepo';
import { liensDuFil } from '../lib/gestion/rattachementRepo';
import { biensDuMail } from '../lib/gestion/ficheRattachement';
import { enteteHistorique, etendreCible, pageHistorique } from '../lib/gestion/historiqueRepo';
import { FILTRES_VIDES } from '../lib/gestion/historique';
import { cibleLot, cibleProprietaire } from '../lib/gestion/rattachement';

const VERBES = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

/**
 * 🔒 LE GARDE INSPECTE LE CODE, PAS LA PROSE. Leçon du script d'audit, qui s'était dénoncé sur sa propre
 * documentation : celle qui NOMME les verbes interdits pour expliquer qu'elle les interdit.
 */
function gardeLectureSeule(): void {
  const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .filter((l) => !l.includes('VERBES'))
    .join('\n').toUpperCase();
  const trouves = VERBES.filter((v) => code.includes(v));
  if (trouves.length > 0) {
    console.error(`🔴 ARRÊT : verbe d'écriture dans ce script (${trouves.join(', ')}). Rien n'a été fait.`);
    process.exit(1);
  }
}

/**
 * 🔴🔴 LA SÉRIALISATION EST **STABLE**, ET C'EST TOUT CE QUI FAIT TENIR LA COMPARAISON « À L'OCTET PRÈS ».
 *
 * `JSON.stringify` suit l'ordre d'insertion des clés. Deux objets égaux mais construits dans un ordre différent
 * donneraient donc deux empreintes différentes — et l'on crierait à la régression pour un accident d'écriture.
 * On trie donc les clés, récursivement, à chaque niveau.
 *
 * ⚠️ LES TABLEAUX NE SONT **JAMAIS** TRIÉS : leur ordre EST l'information qu'Arno demande de surveiller
 * (« la liste exacte et l'ordre des mails »). Les trier effacerait précisément ce qu'on vient vérifier.
 */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = stable(o[k]);
    return out;
  }
  return v;
}

function ligne(etiquette: string, valeur: unknown): string {
  return `${etiquette}\t${JSON.stringify(stable(valeur))}`;
}

async function main(): Promise<void> {
  gardeLectureSeule();
  const nom = (process.argv[2] ?? '').trim();
  if (nom === '') {
    console.error('Usage : photo-historiques.ts <avant|apres|…>');
    process.exit(1);
  }
  const chemin = join(homedir(), 'Desktop', `photo-historiques-${nom}.txt`);
  const debut = Date.now();
  const sorties: string[] = [];
  const temps: Record<string, number> = {};

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     ① LA FENÊTRE « VISUALISER / MODIFIER », MAIL PAR MAIL
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     🔴 ON SUIT LE CHEMIN DE L'ÉCRAN, PAS UN RACCOURCI. La fenêtre charge la fiche de l'ÉCHANGE une fois
     (`ficheRattachementDuFil`), lit les liens bruts une fois (`liensDuFil`), puis réduit au mail affiché avec le
     module PUR `biensDuMail`. On fait exactement cela : une paire d'appels par échange, puis la réduction par
     mail. Appeler la fiche une fois par mail donnerait le même résultat en dix fois plus de temps. */
  const t1 = Date.now();
  const { rows: fils } = await query<{ fil_id: string }>(
    `SELECT DISTINCT m.fil_id::text AS fil_id
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut IN ('propose', 'confirme') AND r.cible_sorte = 'lot'
      ORDER BY 1`);

  let mailsVus = 0;
  for (const f of fils) {
    const filId = Number(f.fil_id);
    const fiche = await ficheRattachementDuFil(filId, null);
    const liens = await liensDuFil(filId);
    const bruts = liens.etat === 'ok' ? liens.data : [];
    /* Les mails de l'échange qui portent au moins un lien de lot : ce sont les seuls que la fenêtre peut montrer. */
    const mails = [...new Set(bruts.filter((l) => l.cible.sorte === 'lot').map((l) => l.messageId))]
      .sort((a, b) => a - b);
    for (const messageId of mails) {
      const biens = biensDuMail(fiche.biens, bruts, messageId);
      mailsVus += 1;
      /**
       * ⚠️ ON PHOTOGRAPHIE CE QUE L'ŒIL VOIT, DANS L'ORDRE OÙ IL LE VOIT : la clé du bien, son libellé complet,
       * son statut, la marque « ponctuel », le nombre de mails annoncé, les personnes avec leurs rôles et leurs
       * coordonnées. C'est la demande d'Arno, mot pour mot : « la liste exacte des biens, statuts, libellés et
       * ordre affichés par la fenêtre ».
       */
      sorties.push(ligne(`fenetre\tfil=${filId}\tmail=${messageId}`, biens.map((b) => ({
        cle: b.cle,
        adresseComplete: b.adresseComplete,
        numeroLot: b.numeroLot,
        nature: b.nature,
        typeBien: b.typeBien,
        statut: b.statut,
        ponctuel: b.ponctuel,
        nbMails: b.nbMails,
        lienIds: b.lienIds,
        personnes: b.personnes,
        dossierDriveId: b.dossierDriveId,
      }))));
    }
    /* L'EN-TÊTE DE LA FENÊTRE : l'objet, le nombre de mails, « hors gestion », le mail le plus récent. */
    sorties.push(ligne(`fenetre-fiche\tfil=${filId}`, {
      objet: fiche.objet, nbMailsDuFil: fiche.nbMailsDuFil, horsGestion: fiche.horsGestion,
      messageRecentId: fiche.messageRecentId, disponible: fiche.disponible,
      biens: fiche.biens.map((b) => ({ cle: b.cle, statut: b.statut, nbMails: b.nbMails, lienIds: b.lienIds })),
    }));
  }
  temps.fenetre = Date.now() - t1;

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     ② LES HISTORIQUES — CHAQUE BIEN, PUIS CHAQUE PROPRIÉTAIRE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

     🔴 PAGE PAR PAGE, DANS L'ORDRE, comme la route. On ne demande pas « tout d'un coup » : la pagination fait
     partie de ce qu'on surveille (le `suite` et la coupure entre deux pages). */
  const t2 = Date.now();
  const photographierCible = async (etiquette: string, cible: Parameters<typeof etendreCible>[0]): Promise<void> => {
    const etendue = await etendreCible(cible, FILTRES_VIDES);
    if (etendue.etat !== 'ok') { sorties.push(ligne(etiquette, { etat: etendue.etat })); return; }
    const entete = await enteteHistorique(etendue.data, FILTRES_VIDES);
    sorties.push(ligne(`${etiquette}\tentete`, {
      titre: etendue.data.titre, sousTitre: etendue.data.sousTitre,
      lots: etendue.data.lots, proprietaires: etendue.data.proprietaires,
      libelles: [...etendue.data.libelles.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      proprietaireDuLot: etendue.data.proprietaireDuLot,
      logementsDuProprietaire: etendue.data.logementsDuProprietaire,
      filtre: entete.filtre, total: entete.total,
    }));
    for (let p = 0; p < 200; p += 1) {
      const page = await pageHistorique(etendue.data, { ...FILTRES_VIDES, page: p });
      sorties.push(ligne(`${etiquette}\tpage=${p}`, {
        suite: page.suite,
        lignes: page.lignes.map((l) => ({
          messageId: l.messageId, filId: l.filId, recuLe: l.recuLe, sens: l.sens,
          de: l.de, deNom: l.deNom, destinataires: l.destinataires,
          objet: l.objet, extrait: l.extrait,
          pieces: l.pieces, parCible: l.parCible, cibleLibelle: l.cibleLibelle, source: l.source,
          evenements: l.evenements, statut: l.statut, statutDetail: l.statutDetail,
          interventions: l.interventions ?? [],
        })),
      }));
      if (!page.suite) break;
    }
  };

  const { rows: lots } = await query<{ cle: string }>(
    'SELECT wippimmo_id AS cle FROM gestion_annuaire_lot ORDER BY 1');
  for (const l of lots) await photographierCible(`historique-bien\t${l.cle}`, cibleLot(l.cle));
  temps.historiquesBiens = Date.now() - t2;

  const t3 = Date.now();
  const { rows: props } = await query<{ cle: string }>(
    'SELECT wippimmo_id AS cle FROM gestion_annuaire_proprietaire ORDER BY 1');
  for (const p of props) await photographierCible(`historique-proprio\t${p.cle}`, cibleProprietaire(p.cle));
  temps.historiquesProprietaires = Date.now() - t3;

  /**
   * ⚠️ LES LIGNES SONT TRIÉES AVANT L'EMPREINTE, et seulement elles : chaque ligne porte sa propre clé
   * (`fenetre fil=… mail=…`), et son CONTENU garde l'ordre d'affichage. Trier les lignes entre elles rend
   * l'empreinte indépendante de l'ordre dans lequel on a parcouru la base — ce qui n'est pas ce qu'on surveille.
   */
  sorties.sort();
  const corps = `${sorties.join('\n')}\n`;
  writeFileSync(chemin, corps, 'utf8');
  const empreinte = createHash('sha256').update(corps).digest('hex');

  console.log(`photographie « ${nom} »`);
  console.log(`  échanges photographiés ............ ${fils.length}`);
  console.log(`  mails dans la fenêtre ............. ${mailsVus}`);
  console.log(`  biens ............................. ${lots.length}`);
  console.log(`  propriétaires ..................... ${props.length}`);
  console.log(`  lignes de photographie ............ ${sorties.length}`);
  console.log(`  octets ............................ ${Buffer.byteLength(corps)}`);
  console.log(`  SHA-256 ........................... ${empreinte}`);
  console.log('  temps (ms) ........................ '
    + `fenêtre ${temps.fenetre} · biens ${temps.historiquesBiens} · propriétaires ${temps.historiquesProprietaires}`
    + ` · total ${Date.now() - debut}`);
  console.log(`  fichier ........................... ${chemin}`);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
