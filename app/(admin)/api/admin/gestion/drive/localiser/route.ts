import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { chaineDuDossierMemo, metadonneesMemo } from '../../../../../../lib/gestion/driveMemoire';
import {
  fermetureCopies, OCCURRENCES_MAX, type LienCopie, type Occurrence,
} from '../../../../../../lib/gestion/localisationDrive';
import { copiesDuDocument, fichiersDriveDeLaPiece } from '../../../../../../lib/gestion/driveMouvementRepo';
import { journalMouvementDriveDisponible } from '../../../../../../lib/gestion/schema';
import { mapConcurrenceBornee } from '../../../../../../lib/concurrence';

/**
 * /api/admin/gestion/drive/localiser — LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE : « OÙ EST CE DOCUMENT ? »
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 LECTURE SEULE, ET C'EST UNE PROPRIÉTÉ DU FICHIER, PAS UNE INTENTION. Elle n'importe AUCUN module d'écriture
 * Drive : ni `driveMouvement`, ni `driveCorbeilleReel`, ni `driveEcriture`. Un test statique le vérifie, et liste
 * les verbes HTTP qu'elle a le droit d'émettre : aucun. Les seuls appels Google partent de `metadonneesMemo` et
 * `chaineDuDossierMemo`, qui ne font que des `files.get`.
 *
 * ═══ 🔴🔴 CE QUE « MÊME DOCUMENT » VEUT DIRE ICI ════════════════════════════════════════════════════════════════
 *
 *   ① LE REGISTRE DE L'APPLI. `gestion_drive_mouvement` garde, pour chaque copie faite par cette application, la
 *      SOURCE et la COPIE. On en tire la fermeture (copies, copies de copies, et l'original) — en BASE, sans un
 *      seul appel Google. C'est exact : on ne devine pas, on relit ce qu'on a fait.
 *
 *   ② L'EMPREINTE DE CONTENU (`md5Checksum`). L'API Drive NE SAIT PAS chercher par empreinte : `files.list`
 *      n'accepte pas ce terme. Cette route rend donc l'empreinte de la source, et c'est l'ÉCRAN qui la compare
 *      aux fichiers qu'il a DÉJÀ listés — zéro appel de plus, et aucun balayage du Drive. La limite est dite à
 *      l'écran, à côté du compteur (`phraseMethode`).
 *
 * 🔴🔴 LES ANCÊTRES DE « Documents clients scannés » PEUVENT ÊTRE LUS, ET SEULEMENT LUS. Remonter une chaîne de
 * parents ne lit que des noms et des identifiants — c'est déjà ce que fait le fil d'Ariane de la fenêtre, et
 * c'est ce qui permet de DIRE qu'un document est dans l'archive sans jamais en ouvrir le contenu. Aucune écriture
 * n'est possible d'ici, pour personne.
 *
 * ⚠️ SANS LE JOURNAL (migration 274), le registre est muet : on rend alors la seule source, et l'écran le dit.
 * Ce n'est pas une panne — c'est « je ne connais aucune copie », ce qui est vrai.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

/** Au plus dix chaînes de parents remontées en parallèle : c'est la borne du module de déplacement. */
const CHAINES_SIMULTANEES = 5;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const params = new URL(request.url).searchParams;
  const source = (params.get('source') ?? '').trim();
  /**
   * ══ 🔴 DEUX PORTES D'ENTRÉE, PARCE QU'IL Y A DEUX SORTES DE VIGNETTES ═══════════════════════════════════════
   *
   * Arno : « sur chaque vignette de la colonne de gauche (pièce jointe OU vignette dupliquée) ». Une vignette
   * dupliquée EST un fichier du Drive — elle arrive par `?source=`. Une pièce jointe de mail, elle, n'a aucun
   * identifiant Drive tant qu'on ne l'a pas rangée : elle arrive par `?piece=`, et c'est le registre des dépôts
   * (`gestion_piece_drive`) qui donne ses emplacements de départ.
   *
   * ⚠️ UNE PIÈCE JAMAIS RANGÉE N'A AUCUN EMPLACEMENT, et ce n'est pas une panne : elle n'est nulle part dans le
   * Drive. La route rend une liste vide, et l'écran dit « Aucun emplacement connu ».
   */
  /**
   * ⚠️ `> 0`, ET PAS SEULEMENT « UN ENTIER » : `Number('')` vaut 0, qui EST un entier sûr. Sans cette borne, un
   * appel sans aucun paramètre serait passé pour une demande sur la pièce n° 0 — et aurait répondu « aucun
   * emplacement » au lieu de dire que la demande est vide. Attrapé par son test.
   */
  const piece = Number(params.get('piece') ?? '');
  if (source === '' && !(Number.isSafeInteger(piece) && piece > 0)) {
    return json({ etat: 'refus', message: 'Aucun document désigné.' }, 422);
  }
  /**
   * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — `?compte=1` : LE NOMBRE SEUL, SANS UN SEUL APPEL GOOGLE ═══════════════
   *
   * Le COMPTEUR VERT de chaque vignette (« Rangé N fois dans le Drive ») est demandé pour TOUTES les vignettes de
   * la colonne, dès qu'elles paraissent. Lui faire payer ce que paie la loupe — un `files.get` et une remontée de
   * parents PAR EMPLACEMENT — ferait partir des dizaines d'appels pour afficher un chiffre.
   *
   * Ce mode ne lit donc que le REGISTRE, en base : combien d'emplacements cette application connaît-elle pour ce
   * document ? C'est exact (on relit ce qu'on a fait), c'est instantané, et c'est ce que la bulle annonce.
   *
   * ⚠️ IL NE VÉRIFIE PAS QUE CHAQUE EMPLACEMENT EXISTE ENCORE, et c'est la différence avec la loupe — qui, elle,
   * écarte les copies disparues. Le compteur peut donc annoncer un emplacement de plus que la loupe le jour où
   * quelqu'un a supprimé une copie dans Google Drive. C'est le prix d'un chiffre instantané, et la loupe reste là
   * pour dire la vérité du moment.
   */
  const compteSeul = params.get('compte') === '1';

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  try {
    /* ── ① LE REGISTRE, EN BASE ET SANS UN APPEL GOOGLE ────────────────────────────────────────────────────── */
    /**
     * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 1 — LES DÉPARTS VIENNENT DE DEUX VOIES ════════════
     *
     * `fichiersDriveDeLaPiece` rend, depuis ce lot, les copies de cette pièce ET celles de MÊME CONTENU (même
     * `md5`). Une pièce revenue renommée — le cas d'Arno — n'a aucune copie à son nom : ses départs viennent
     * tous de l'empreinte, et c'est exactement ce qui la rend reconnaissable.
     *
     * 🔴 LA VOIE DE CHAQUE DÉPART EST CONSERVÉE, parce que l'écran la DIT (`phraseMethode`) : « par le registre »
     * est une certitude sur ce que nous avons fait, « par empreinte » une certitude sur le contenu. Les deux sont
     * exactes, elles ne disent pas la même chose, et les confondre ferait mentir la phrase.
     */
    const parPiece = source !== '' ? [] : await fichiersDriveDeLaPiece(piece);
    const departs: { id: string; voie: 'registre' | 'empreinte' }[] = source !== ''
      ? [{ id: source, voie: 'registre' }]
      : parPiece.map((x) => ({ id: x.driveFileId, voie: x.parEmpreinte ? 'empreinte' as const : 'registre' as const }));
    if (departs.length === 0) {
      return json({
        etat: 'ok', source: source === '' ? String(piece) : source,
        md5: null, occurrences: [], parRegistre: 0, nombre: 0,
      });
    }
    const avecJournal = await journalMouvementDriveDisponible();
    const liens: LienCopie[] = avecJournal
      ? (await Promise.all(departs.map((d) => copiesDuDocument(d.id)))).flat()
      : [];
    /**
     * ⚠️ LA VOIE SE PROPAGE AUX COPIES D'UN DÉPART, et c'est juste : la copie d'un fichier trouvé par le registre
     * est connue par le registre. Un identifiant atteint par les deux voies garde la plus forte — `registre` —
     * parce que `set` n'écrase pas une entrée déjà posée et que les départs du registre viennent en premier.
     */
    const voieDe = new Map<string, 'registre' | 'empreinte'>();
    for (const d of [...departs].sort((a, b) => (a.voie === 'registre' ? -1 : 1) - (b.voie === 'registre' ? -1 : 1))) {
      for (const id of fermetureCopies(d.id, liens)) if (!voieDe.has(id)) voieDe.set(id, d.voie);
    }
    const ids = [...voieDe.keys()].slice(0, OCCURRENCES_MAX);

    /* ── `?compte=1` : on s'arrête ici. Rien n'est demandé à Google (sauf l'empreinte, et seulement si la base ne
          l'a pas déjà). C'est ce qui rend le compteur vert gratuit sur une colonne de dix vignettes. ───────── */
    if (compteSeul) {
      const md5Base = source === ''
        ? parPiece.map((x) => x.md5).find((x) => (x ?? '') !== '') ?? null
        : null;
      const md5 = md5Base ?? (source === ''
        ? null
        : await (async () => {
          const m = await metadonneesMemo(jeton.compteGoogle, jeton.jeton, source, { fetch });
          return m.ok ? m.valeur.md5 ?? null : null;
        })());
      return json({
        etat: 'ok', source: source === '' ? String(piece) : source,
        md5, occurrences: [], parRegistre: ids.length, nombre: ids.length,
      });
    }

    /* ── ② CHAQUE OCCURRENCE : EXISTE-T-ELLE ENCORE, ET OÙ ? ───────────────────────────────────────────────── */
    const occurrences: Occurrence[] = [];
    let md5Source: string | null = null;
    const lues = await mapConcurrenceBornee(ids, CHAINES_SIMULTANEES, async (id) => ({
      id, meta: await metadonneesMemo(jeton.compteGoogle, jeton.jeton, id, { fetch }),
    }));
    for (const l of lues) {
      /**
       * ⚠️ UNE OCCURRENCE QU'ON NE SAIT PLUS LIRE EST ÉCARTÉE, PAS DEVINÉE. Le journal garde la trace d'une copie
       * qui a pu être supprimée depuis, ou dont les droits ont changé : la compter ferait annoncer un emplacement
       * où l'on n'irait rien trouver.
       */
      if (!l.meta.ok) continue;
      /* ⚠️ L'EMPREINTE EST CELLE DU PREMIER EMPLACEMENT LISIBLE : toutes les copies d'un document ont la même,
         par construction. Prendre « celle de la source » aurait rendu `null` quand on ouvre la loupe sur une
         pièce (qui n'EST aucun de ces fichiers, elle les a produits). */
      if (md5Source === null) md5Source = l.meta.valeur.md5 ?? null;
      const parent = l.meta.valeur.parents[0] ?? null;
      const chaine = parent === null
        ? []
        : await chaineDuDossierMemo(jeton.compteGoogle, jeton.jeton, parent, { fetch });
      occurrences.push({
        id: l.id,
        nom: l.meta.valeur.nom,
        chemin: chaine.map((m) => ({ id: m.id, nom: m.nom })),
        /* 🔴 LA VOIE EST CELLE PAR LAQUELLE ON A TROUVÉ CE FICHIER, pas un défaut : l'écran en fait une phrase. */
        voie: voieDe.get(l.id) ?? 'registre',
      });
    }

    return json({
      etat: 'ok',
      source: source === '' ? String(piece) : source,
      /**
       * 🔴 L'EMPREINTE PART VERS L'ÉCRAN, ET C'EST LUI QUI COMPARE. L'API Drive ne sait pas chercher par
       * empreinte ; la seule comparaison possible sans balayage porte sur ce que la fenêtre a déjà lu — et elle
       * l'a lu dans le MÊME appel que la liste, donc gratuitement. `null` = document Google natif (pas
       * d'empreinte), et l'écran le dit.
       */
      md5: md5Source,
      occurrences,
      /**
       * ⚠️ Rendu pour que l'écran puisse dire « par le registre » : c'est une certitude, pas une ressemblance.
       *
       * 🔴 DEPUIS LE NIVEAU 1, ON NE COMPTE PLUS TOUTES LES OCCURRENCES ICI : celles trouvées par l'empreinte du
       * contenu se comptent à part, et l'écran les annonce autrement. Garder `occurrences.length` aurait fait
       * dire « par le registre des copies de l'application » d'un fichier que l'application n'a jamais touché.
       */
      parRegistre: occurrences.filter((o) => o.voie === 'registre').length,
    });
  } catch (e) {
    console.error('[api/admin/gestion/drive/localiser] échec', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}
