import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { ouvrirFluxExportPdf, ouvrirFluxFichier, ouvrirFluxVignette } from '../../../../../../lib/gestion/drive';
import { verdictJoindreFichier } from '../../../../../../lib/gestion/driveVerdict';
import {
  APERCU_TAILLE_MAX, lireIntervalle, messageSansApercu, motifTropGros, passeParExport, sorteApercu, typeServi,
} from '../../../../../../lib/gestion/apercuDrive';
import { cleOctets, memoriserOctets, octetsMemo } from '../../../../../../lib/gestion/driveMemoire';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';

/**
 * /api/admin/gestion/drive/apercu — LOT DRIVE-VISUALISER-ET-DOSSIERS : VOIR UN FICHIER DU DRIVE SANS LE JOINDRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 UN APERÇU EST UNE LECTURE DE CONTENU — DONC LA MÊME RÈGLE QUE « JOINDRE », AU MOT PRÈS. Voir un avis
 * d'imposition à l'écran, c'est le lire ; l'interdit de « Documents clients scannés » porte sur la LECTURE du
 * contenu, pas sur son acheminement. Les trois réponses de cette route passent donc par le MÊME verdict, qui
 * remonte toute la chaîne des parents, à n'importe quelle profondeur.
 *
 * 🔴🔴 LE TYPE SERVI EST LE NÔTRE, JAMAIS CELUI DU FICHIER. Le contenu sort sur NOTRE origine, dans un cadre de
 * NOTRE page : un `.html` rangé dans le Drive s'exécuterait avec nos cookies de session. On sert donc UNIQUEMENT
 * les types d'une liste blanche (`apercuDrive.typeServi`) — PDF, images matricielles, texte brut — et l'en-tête
 * `Content-Type` porte la valeur de la LISTE, pas celle que le fichier prétend avoir. SVG en est absent : c'est le
 * seul format « image » qui peut contenir du code.
 *
 * ═══ 🔴 LOT APERCU-RAPIDE — TROIS RÉPONSES LÀ OÙ IL N'Y EN AVAIT QU'UNE, ET POURQUOI ═════════════════════════════
 *   · `?fichier=X&info=1`      JSON : le verdict, le nom, le type, la taille, l'existence d'une vignette. COURT.
 *   · `?fichier=X&vignette=1`  la VIGNETTE de la 1re page, en image — visible presque tout de suite.
 *   · `?fichier=X`             les OCTETS, EN FLUX — le document s'affiche au fur et à mesure qu'il arrive.
 *
 * 🔴 POURQUOI SÉPARER `info` DES OCTETS. L'écran doit pouvoir dire « Aperçu indisponible » ou « ce fichier est dans
 * Documents clients scannés » EN FRANÇAIS. Tant que le cadre pointait sur une route qui rend tantôt du JSON tantôt
 * un PDF, il fallait tout télécharger en mémoire de la page pour lire le refus — c'est-à-dire attendre le fichier
 * entier avant de savoir qu'on n'y avait pas droit. Désormais l'écran demande d'abord `info`, court et bavard,
 * puis pointe le cadre sur le flux. Le refus arrive en un tiers de seconde ; le document s'affiche pendant qu'il
 * se charge.
 *
 * 🔒 LECTURE SEULE, ET AUCUNE COPIE NULLE PART. `files.get`, `alt=media`, `files.export` pour les documents Google
 * (un GET qui calcule un PDF à la volée, sans rien créer dans le Drive), et l'adresse signée de la vignette. Pas un
 * `files.create`, pas un `files.update`, pas un `permissions.create`. Les octets TRAVERSENT le serveur sans y être
 * accumulés : rien ne reste en mémoire, rien n'est écrit sur le disque.
 *
 * ⚠️ `no-store` ET `X-Content-Type-Options: nosniff` : le document d'un client ne doit pas rester dans le cache du
 * navigateur, et le navigateur ne doit pas deviner un type que nous n'avons pas écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

/**
 * ══ 🔴 LA POLITIQUE DE SÉCURITÉ DU CONTENU SERVI, ET POURQUOI LE PDF EN A UNE AUTRE ══════════════════════════════
 *
 * 🔴 LE DÉFAUT CONSTATÉ À L'ÉCRAN LE 29/09/2026 : le cadre du PDF restait NOIR. Les octets étaient bons (3,3 Mo,
 * en-têtes justes, `%PDF-1.6` en tête), mais `default-src 'none'` s'applique au document servi — et le lecteur PDF
 * de Chrome, qui est une visionneuse à part entière, ne peut alors plus charger ses propres ressources.
 *
 * ⚠️ IL NE SE VOYAIT PAS AVANT, ET C'EST INSTRUCTIF : jusqu'à ce lot l'aperçu passait par un `blob:`, qui ne porte
 * AUCUN en-tête. La politique n'était donc jamais appliquée au document — on croyait l'avoir, on ne l'avait pas.
 *
 * 🔴 CE QU'ON GARDE, ET CE QU'ON PERD. `frame-ancestors 'self'` reste partout : personne d'autre que nos pages ne
 * peut encadrer ce contenu. Pour un PDF, on renonce à `default-src 'none'` — et cela ne coûte rien de réel :
 *   · le type servi vient de NOTRE liste blanche, jamais du fichier, et `nosniff` l'impose au navigateur : un
 *     `.html` déguisé en PDF sera rendu comme un PDF cassé, jamais exécuté ;
 *   · la visionneuse PDF de Chrome s'exécute dans son propre bac à sable, pas dans notre origine.
 * Les IMAGES et le TEXTE, eux, gardent la politique stricte : rien n'a besoin d'être chargé pour les afficher.
 */
function entetesContenu(
  type: string, longueur?: number,
  /**
   * 🔴 LOT APERCU-PAGE1 — CE QUI DIT AU NAVIGATEUR QU'IL PEUT DEMANDER DES TRANCHES.
   *
   * `tranches: false` pour un export Google, qui est CALCULÉ à la volée et n'accepte aucun `Range` : l'annoncer
   * ferait demander à PDF.js des morceaux que Google refuserait, et l'aperçu échouerait au lieu d'être lent.
   * `intervalle` porte le `Content-Range` d'une réponse 206, retransmis tel quel.
   */
  o: { tranches?: boolean; intervalle?: string | null } = {},
): Record<string, string> {
  const estPdf = type.startsWith('application/pdf');
  return {
    'Content-Type': type,
    ...(longueur === undefined ? {} : { 'Content-Length': String(longueur) }),
    'Accept-Ranges': o.tranches === false ? 'none' : 'bytes',
    ...(o.intervalle ? { 'Content-Range': o.intervalle } : {}),
    /**
     * ⚠️ `inline` SANS NOM DE FICHIER. Le nom d'un document de client (« Bail DUPONT.pdf ») n'a pas à voyager dans
     * un en-tête que le navigateur peut consigner : l'écran l'affiche déjà, il le connaît.
     */
    'Content-Disposition': 'inline',
    'Cache-Control': SANS_CACHE,
    'X-Content-Type-Options': 'nosniff',
    // Le cadre de l'aperçu est dans NOTRE page, et nulle part ailleurs — quel que soit le type.
    'Content-Security-Policy': estPdf
      ? "frame-ancestors 'self'"
      : "default-src 'none'; img-src data: blob: 'self'; frame-ancestors 'self'",
  };
}

/**
 * LIT UN FLUX EN ENTIER, pour en garder une copie. `null` dès qu'il dépasse ce que la mémoire accepte : on cesse
 * alors d'accumuler au lieu de charger douze mégaoctets pour les jeter ensuite.
 */
async function accumuler(flux: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > APERCU_TAILLE_MAX) { await lecteur.cancel().catch(() => {}); return null; }
      morceaux.push(value);
    }
  } catch { return null; } finally { lecteur.releaseLock(); }
  const tout = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) { tout.set(m, i); i += m.byteLength; }
  return tout;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  const url = new URL(request.url);
  const fichier = (url.searchParams.get('fichier') ?? '').trim();
  const veutInfo = url.searchParams.get('info') === '1';
  const veutVignette = url.searchParams.get('vignette') === '1';
  if (fichier === '') return json({ etat: 'refus', message: 'Aucun fichier demandé.' }, 400);

  try {
    /**
     * ── ① 🔴🔴 LA RÈGLE, AVANT TOUTE LECTURE DE CONTENU. Elle n'est pas discutable et elle n'est pas dupliquée. ──
     *
     * ⚠️ LOT APERCU-RAPIDE — le verdict rend AUSSI les métadonnées, parce qu'il vient de les lire pour connaître le
     * parent du fichier. Les redemander coûtait un `files.get` de plus (270 à 440 ms mesurés) pour apprendre ce
     * qu'on savait déjà.
     */
    const { verdict: v, meta } = await verdictJoindreFichier(jeton.compteGoogle, jeton.jeton, fichier);
    if (!v.joindre) {
      return json({ etat: 'refus', message: v.motif ?? 'Le contenu de ce fichier ne peut pas être affiché.' }, 403);
    }
    if (!meta.ok) return json({ etat: 'indisponible', message: meta.motif }, 200);

    const sorte = sorteApercu(meta.valeur.typeMime);
    const type = typeServi(meta.valeur.typeMime);
    const taille = meta.valeur.tailleOctets ?? 0;
    const tropGros = taille > APERCU_TAILLE_MAX;

    // ── ② LA CARTE D'IDENTITÉ, COURTE : c'est elle que l'écran demande en premier, et au survol. ────────────────
    if (veutInfo) {
      if (type === null || sorte === 'aucun') {
        return json({ etat: 'sans_apercu', message: messageSansApercu(meta.valeur.typeMime) }, 200);
      }
      if (tropGros) return json({ etat: 'sans_apercu', message: motifTropGros(taille) }, 200);
      return json({
        etat: 'ok',
        nom: meta.valeur.nom,
        sorte,
        typeMime: meta.valeur.typeMime,
        tailleOctets: meta.valeur.tailleOctets,
        /**
         * ⚠️ ON DIT SEULEMENT QU'ELLE EXISTE, jamais SON ADRESSE. `thumbnailLink` est une adresse signée qui ouvre
         * le contenu sans passer par nous : la livrer au navigateur donnerait une clé d'accès hors de la règle.
         */
        vignette: meta.valeur.vignette !== null,
      });
    }

    // Les deux réponses de CONTENU partagent les mêmes refus, écrits une fois.
    if (type === null || sorte === 'aucun') {
      return json({ etat: 'sans_apercu', message: messageSansApercu(meta.valeur.typeMime) }, 415);
    }
    if (tropGros) return json({ etat: 'sans_apercu', message: motifTropGros(taille) }, 413);

    /**
     * ── ③ LA VIGNETTE DE LA 1re PAGE ────────────────────────────────────────────────────────────────────────────
     * 🔴 C'EST DU CONTENU, donc le verdict ① l'a déjà autorisée : une vignette est la première page RENDUE, et
     * elle se lit aussi bien qu'un PDF. Sous « Documents clients scannés », elle est refusée comme le reste.
     */
    if (veutVignette) {
      if (meta.valeur.vignette === null) {
        return json({ etat: 'sans_apercu', message: 'Aucune vignette pour ce fichier.' }, 404);
      }
      const vign = await ouvrirFluxVignette(meta.valeur.vignette, { fetch });
      if (!vign.ok || vign.valeur.corps === null) {
        return json({ etat: 'sans_apercu', message: vign.ok ? 'Vignette vide.' : vign.motif }, 404);
      }
      // ⚠️ Le type vient de Google (une image), mais on le BORNE à l'image : jamais un type qu'on n'attend pas.
      const typeVignette = (vign.valeur.typeMime ?? '').startsWith('image/') ? vign.valeur.typeMime : 'image/jpeg';
      return new Response(vign.valeur.corps, { status: 200, headers: entetesContenu(typeVignette as string) });
    }

    /**
     * ── ④ LES OCTETS, EN FLUX ───────────────────────────────────────────────────────────────────────────────────
     *
     * 🔴🔴 ON NE LES ACCUMULE PLUS. Mesuré le 29/09/2026 : attendre le fichier ENTIER coûtait 873 ms pour 0,14 Mo
     * et 8 976 ms pour 2,84 Mo, alors que le PREMIER MORCEAU arrive en 678 à 896 ms quelle que soit la taille. Le
     * lecteur PDF du navigateur affiche les premières pages bien avant d'avoir tout reçu : on lui donne le robinet.
     *
     * ⚠️ `Content-Length` N'EST POSÉ QUE POUR UN FICHIER ORDINAIRE. Un document Google exporté n'a pas de taille
     * connue d'avance — annoncer un chiffre faux couperait le flux au mauvais endroit.
     */
    const estExport = passeParExport(meta.valeur.typeMime);
    /**
     * 🔴🔴 LA TRANCHE DEMANDÉE PAR LE NAVIGATEUR, TRANSMISE TELLE QUELLE À GOOGLE.
     *
     * C'est ce qui permet à PDF.js de n'aller chercher que les quelques dizaines de kilo-octets nécessaires à la
     * page 1 au lieu des 3,2 Mo du document. On ne réinterprète rien : Drive sait découper, et refabriquer la
     * tranche chez nous obligerait à lire tout le fichier pour en couper un morceau — exactement ce qu'on évite.
     *
     * ⚠️ JAMAIS POUR UN EXPORT : un document Google est calculé à la volée, sans taille connue d'avance.
     */
    const demande = estExport ? null : request.headers.get('range');

    /**
     * ══ 🔴🔴 LA MÉMOIRE COURTE DES OCTETS — LE VRAI GAIN DE CE LOT ═════════════════════════════════════════════
     *
     * MESURÉ LE 29/09/2026, depuis la page, sur le vrai Drive : la page 1 se TRAME en 46 à 155 ms ; l'ouverture du
     * document en coûte 1 050 à 1 400, quelle que soit la taille du fichier. C'est de la LATENCE Google, pas du
     * débit — et on la repayait en entier à chaque réouverture et à chaque retour par « Précédent ».
     *
     * 🔴 LE VERDICT A DÉJÀ ÉTÉ PRONONCÉ, dix lignes plus haut, et il ne passe jamais par la mémoire : celle-ci ne
     * rend des octets qu'à quelqu'un qui vient d'obtenir le droit de les lire. Elle épargne le TRANSPORT, jamais
     * la règle. Un fichier déplacé sous « Documents clients scannés » est refusé à la requête suivante, mémoire
     * pleine ou non.
     *
     * ⚠️ ET C'EST AUSSI CE QUI REND LES TRANCHES UTILES. Servies depuis le Drive, elles coûtaient chacune un
     * aller-retour : vingt tranches de 128 Kio mettaient 13,6 SECONDES à ouvrir l'acte de 3,3 Mo, contre 1,1 s en
     * une seule lecture. Servies depuis la mémoire, elles ne coûtent plus rien.
     */
    const cle = cleOctets(jeton.compteGoogle, fichier, meta.valeur.tailleOctets ?? null);
    const retenus = estExport ? null : octetsMemo(cle);
    if (retenus !== null) {
      const tranche = lireIntervalle(demande, retenus.byteLength);
      if (tranche === null) {
        return new Response(new Uint8Array(retenus), {
          status: 200,
          headers: entetesContenu(type, retenus.byteLength, { tranches: true }),
        });
      }
      const morceau = retenus.subarray(tranche.debut, tranche.fin + 1);
      return new Response(new Uint8Array(morceau), {
        status: 206,
        headers: entetesContenu(type, morceau.byteLength, {
          tranches: true,
          intervalle: `bytes ${tranche.debut}-${tranche.fin}/${retenus.byteLength}`,
        }),
      });
    }

    const flux = estExport
      ? await ouvrirFluxExportPdf(jeton.jeton, fichier, { fetch })
      : await ouvrirFluxFichier(jeton.jeton, fichier, { fetch }, demande);
    if (!flux.ok) return json({ etat: 'sans_apercu', message: flux.motif }, 415);
    if (flux.valeur.corps === null) {
      return json({ etat: 'sans_apercu', message: 'Ce fichier est vide.' }, 415);
    }
    const partielle = flux.valeur.statut === 206 && flux.valeur.intervalle !== null;

    /**
     * 🔴 ON GARDE UNE COPIE AU PASSAGE, et SEULEMENT d'une lecture ENTIÈRE : une tranche ne dit rien du reste du
     * fichier, et l'assembler à partir de morceaux demanderait de savoir lesquels manquent. `tee()` double le flux
     * sans rien retarder pour le navigateur — la copie se remplit derrière, à son rythme.
     *
     * ⚠️ AU MIEUX-EFFORT, TOUJOURS : si la copie échoue (flux coupé, fichier trop gros), l'aperçu n'en sait rien et
     * ne s'en porte pas plus mal. La mémoire est une commodité, jamais une dépendance.
     */
    let corpsPourClient = flux.valeur.corps;
    if (!estExport && !partielle) {
      const [pourClient, pourMemoire] = flux.valeur.corps.tee();
      corpsPourClient = pourClient;
      void accumuler(pourMemoire).then((o) => { if (o !== null) memoriserOctets(cle, o); }).catch(() => {});
    }

    return new Response(corpsPourClient, {
      status: partielle ? 206 : 200,
      headers: entetesContenu(
        type,
        // La longueur de CE morceau quand c'est une tranche ; celle du fichier entier sinon.
        partielle ? (flux.valeur.longueur ?? undefined)
          : estExport ? undefined : (meta.valeur.tailleOctets ?? undefined),
        { tranches: !estExport, intervalle: partielle ? flux.valeur.intervalle : null },
      ),
    });
  } catch (e) {
    console.error('[api/admin/gestion/drive/apercu] lecture impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}
