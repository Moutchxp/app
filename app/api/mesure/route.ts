import { after } from 'next/server';
import { incrementerCompteur } from '../../lib/analytics/writer';
import { majSession, ETAPES_ORDONNEES, type EtapeTunnel } from '../../lib/analytics/session';
import { queryAnalytics } from '../../lib/analytics/pool';
import { deviceType, navigateurFamille, refererHote, bucketUtm, communeInsee, estBot } from '../../lib/analytics/contexte';

/**
 * M2 — LOT 2. BEACON d'émission des événements CLIENT du tunnel. La majorité des paliers du tunnel sont
 * 100 % client (SPA sans routeur, cf. recon) → aucun aller serveur naturel : ce endpoint reçoit ces
 * événements. Il vit dans la couche ROUTE (autorisé à importer le writer ; la garde anti-couplage
 * n'interdit l'import que depuis le MOTEUR).
 *
 * SÛRETÉ / VIE PRIVÉE :
 *  - Répond **204 immédiatement** ; TOUT le travail base (lecture du motif bots + écritures) est différé
 *    en `after()` (post-réponse) → latence nulle côté client, jamais bloquant.
 *  - RÉDUCTION à l'émission : `User-Agent`/`Referer` sont lus côté serveur et immédiatement réduits en
 *    device/famille/host (jamais stockés bruts) ; UTM bucketés (allowlist source/medium/campagne, le
 *    reste — term/content/gclid/fbclid… — est IGNORÉ) ; commune validée 5 car ; jamais de lat/lon/IP.
 *  - FILTRE BOTS : règle 1 (un bot sans JS n'émet jamais ce beacon) + règle 2 (motif UA en config).
 *  - `incrementerCompteur` / `majSession` ne throw JAMAIS ; le handler est de toute façon try/catch → 204.
 */

export const runtime = 'nodejs'; // `after()` requiert le runtime Node (pas Edge).

/** Événements que le CLIENT a le droit d'émettre. `resultat` est SERVEUR-only (route /api/analyse) ;
 * `session_fin` est synthétisé à la compaction ; les `admin_*` sont internes. */
const NOMS_CLIENT = new Set([
  'session_debut',
  'etape_atteinte',
  'adresse_saisie',
  'point_origine_place',
  'point_origine_refuse',
  'photo_prise',
  'analyse_lancee',
  'clic_certificat',
  'clic_estimation',
]);

const RAISONS = new Set(['hors_emprise', 'non_deplace', 'hors_lidar']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Repli codé du motif bots si la table 020 n'est pas (encore) appliquée (aligné sur le seed de 020).
const MOTIF_BOTS_DEFAUT =
  'bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|bingbot|googlebot|gptbot|bytespider|applebot|semrush|ahrefs|petalbot|yandex|duckduckbot|ia_archiver|headlesschrome|phantom|python-requests|curl|wget|monitor|uptime|pingdom';

let cacheMotif: { valeur: string; expire: number } | null = null;
/** Lit le motif bots (config 020) avec cache TTL 60 s + repli sûr. Appelé en `after()` (hors latence). */
async function lireMotifBots(): Promise<string> {
  const maintenant = Date.now();
  if (cacheMotif && cacheMotif.expire > maintenant) return cacheMotif.valeur;
  try {
    const r = await queryAnalytics<{ valeur: string }>(
      `SELECT valeur FROM analytics_config WHERE cle = 'bots_ua_motif'`,
      [],
    );
    const v = r.rows[0]?.valeur ?? MOTIF_BOTS_DEFAUT;
    cacheMotif = { valeur: v, expire: maintenant + 60_000 };
    return v;
  } catch {
    // Table 020 absente / lecture en échec → on MET EN CACHE le repli (TTL court) pour ne pas relancer un
    // SELECT voué à échouer à CHAQUE beacon ; réessai après 60 s (au cas où 020 serait appliquée entre-temps).
    cacheMotif = { valeur: MOTIF_BOTS_DEFAUT, expire: maintenant + 60_000 };
    return MOTIF_BOTS_DEFAUT;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const nom = typeof body?.nom === 'string' ? body.nom : '';
    if (!body || !NOMS_CLIENT.has(nom)) return new Response(null, { status: 204 });

    // Captures SYNCHRONES (aucune DB) — figées pour l'usage post-réponse.
    // ⚠️ Le referer de PROVENANCE (d'où vient la visite) = `document.referrer` passé par le client, PAS
    // l'en-tête `Referer` de CETTE requête (qui serait notre propre page → toujours auto-référence). L'UA,
    // lui, est fiable sur la requête beacon (le navigateur l'envoie).
    const ua = req.headers.get('user-agent');
    const refererClient = typeof body.referer === 'string' ? body.referer : null;
    const hoteSoi = req.headers.get('host')?.split(':')[0] ?? null;
    const sid = typeof body.sid === 'string' && UUID_V4.test(body.sid) ? body.sid : null;
    const etapeBrute = typeof body.etape === 'string' ? body.etape : '';
    const etape = (ETAPES_ORDONNEES as readonly string[]).includes(etapeBrute) ? (etapeBrute as EtapeTunnel) : null;
    const raison = typeof body.raison === 'string' && RAISONS.has(body.raison) ? body.raison : null;
    const commune = communeInsee(typeof body.commune === 'string' ? body.commune : null);
    const utmSource = bucketUtm(typeof body.source === 'string' ? body.source : null);
    const utmMedium = bucketUtm(typeof body.medium === 'string' ? body.medium : null);
    const utmCampagne = bucketUtm(typeof body.campagne === 'string' ? body.campagne : null);

    // TOUT le travail base est différé APRÈS la réponse. Un throw ici ne remonte jamais à l'appelant.
    after(async () => {
      try {
        if (estBot(ua, await lireMotifBots())) return; // bot → jamais compté (règle 2)

        switch (nom) {
          case 'session_debut':
            if (sid) {
              await majSession(sid, 'intro', {
                source: utmSource,
                medium: utmMedium,
                campagne: utmCampagne,
                refererHote: refererHote(refererClient, hoteSoi),
                deviceType: deviceType(ua),
                navigateurFamille: navigateurFamille(ua),
              });
            }
            break;
          case 'etape_atteinte':
            if (etape) {
              if (sid) await majSession(sid, etape); // fait monter etape_max (jamais en arrière)
              await incrementerCompteur({ nom, etape }); // volume d'entrées par écran
            }
            break;
          case 'point_origine_place':
            await incrementerCompteur({ nom, communeInsee: commune }); // géo seule, jamais lat/lon
            break;
          case 'point_origine_refuse':
            await incrementerCompteur({ nom, raison });
            break;
          // Événements de complétion / conversion sans dimension.
          case 'adresse_saisie':
          case 'photo_prise':
          case 'analyse_lancee':
          case 'clic_certificat':
          case 'clic_estimation':
            await incrementerCompteur({ nom });
            break;
        }
      } catch (e) {
        console.error('[analytics] beacon /api/mesure : écriture abandonnée', e);
      }
    });
  } catch (e) {
    // Le beacon ne 500 JAMAIS (le client ne l'attend pas ; un échec analytique est sans conséquence).
    console.error('[analytics] beacon /api/mesure : requête ignorée', e);
  }
  return new Response(null, { status: 204 });
}
