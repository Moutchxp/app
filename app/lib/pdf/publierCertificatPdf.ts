/**
 * CÂBLAGE du PDF du certificat (Lot 6b) — miroir de `publierCarteOrientation`. Assemble les données, génère le PDF
 * (générateur PUR `certificatPdf.ts`, non modifié), le dépose, et renseigne l'acheminement.
 *
 * Appelé à l'émission APRÈS le COMMIT (jamais dedans). BEST-EFFORT, ne throw JAMAIS. Sur échec :
 * `statut='echec'` + `derniere_erreur` (le NOM de l'erreur, jamais un message pouvant contenir une donnée), et le
 * certificat existe déjà. Log `console.error('[certificat-pdf] …')` (même convention que `[carte-orientation]`).
 *
 * ⚠️ Le JETON n'apparaît dans AUCUN log ni AUCUNE erreur : il n'entre que dans le PDF (QR + code en clair).
 *
 * ⚠️ SITE_URL absente → PDF NON généré (un QR vers une URL fausse est pire qu'un document absent ; le PDF est
 * re-fabricable une fois la variable posée). Voir .env.example.
 *
 * Partage de la CARTE : on RELIT le PNG déjà déposé (via `certificat_acheminement.carte_orientation_cle`) plutôt
 * que de régénérer (49 tuiles, ~1,6 s de réseau IGN). Idem la PHOTO (via `certificat.photo_cle`). Décision signalée.
 */
import { query } from '../db/client';
import { deposer, recuperer, stockageConfigure } from '../stockage';
import { genererCertificatPdf, type DonneesCertificatPdf, type LigneKv } from './certificatPdf';
// Constantes MOTEUR (imports EN LECTURE SEULE ; config.ts n'est PAS modifié). Le certificat AFFICHE ce que le moteur
// a analysé — champ et portée DÉRIVÉS, jamais retapés. Même source que le tracé de la carte (publierCarteOrientation).
import { ANALYSIS_RANGE_M, AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } from '../svv/config';

const CHAMP_DEG = (AMPLITUDE_BEAM_COUNT - 1) * AMPLITUDE_BEAM_STEP_DEG; // balayage réel : 61 faisceaux × 3° = 180°
const PORTEE_M = ANALYSIS_RANGE_M; // portée d'analyse effective (const du moteur, cf. geo.ts / faisceaux.ts)
const PORTEE_ANALYSE = `${PORTEE_M} m`;
const CHAMP = `${CHAMP_DEG}° horizontal`;
const CARTE_LEGENDE = `Plan IGN · portée ${PORTEE_M} m`;
const SCORE_NOTE = 'Le label de qualité s’affiche à partir de 60/100. Il n’affecte pas le verdict.';
const PIED = 'Certificat délivré par le système d’analyse géométrique Sans Vis-à-Vis®.';

/** Base absolue du site (serveur only). Null si absente/mal formée → PDF non généré (QR faux évité). */
function siteUrl(): string | null {
  const u = (process.env.SITE_URL ?? '').trim();
  return /^https?:\/\/.+/.test(u) ? u.replace(/\/+$/, '') : null;
}

/** Ligne jointe (certificat + internaute_projet + internaute + acheminement). numeric → chaînes (driver pg). */
interface LigneJointe {
  numero: string;
  reference: string;
  emis_le: Date;
  verdict: string;
  score: string | null;
  distance_obstacle_m: string | null;
  profondeur_moyenne_m: string | null;
  lat: string | null;
  lon: string | null;
  azimut_deg: string | null;
  etage: number | null;
  dernier_etage: boolean | null;
  hauteur_sous_plafond_m: string | null;
  hauteur_vision_m: string | null;
  adresse: string | null;
  type_bien: string | null;
  surface_m2: string | null;
  nb_pieces: number | null;
  annee_batiment: number | null;
  altitude_terrain_m: string | null;
  altitude_sol_m: string | null;
  reference_cadastrale: string | null;
  jeton_verification: string;
  photo_cle: string | null;
  // internaute_projet
  residence_principale: boolean | null;
  mode_origine: string | null;
  payload: Record<string, unknown> | null;
  // internaute (LEFT JOIN — peut être null après effacement RGPD)
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  // acheminement
  carte_orientation_cle: string | null;
}

const REQUETE = `
  SELECT c.numero, c.reference, c.emis_le, c.verdict, c.score, c.distance_obstacle_m, c.profondeur_moyenne_m,
         c.lat, c.lon, c.azimut_deg, c.etage, c.dernier_etage, c.hauteur_sous_plafond_m, c.hauteur_vision_m,
         c.adresse, c.type_bien, c.surface_m2, c.nb_pieces, c.annee_batiment, c.altitude_terrain_m,
         c.altitude_sol_m, c.reference_cadastrale, c.jeton_verification, c.photo_cle,
         ip.residence_principale, ip.mode_origine, ip.payload,
         i.prenom, i.nom, i.email, i.telephone,
         a.carte_orientation_cle
    FROM certificat c
    JOIN internaute_projet ip ON ip.id = c.projet_id
    LEFT JOIN internaute i ON i.id = ip.internaute_id
    LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
   WHERE c.id = $1
`;

// ── Formatage (affichage FR ; aucun impact calcul → arrondis d'affichage autorisés) ──
function nombre(v: string | number | null, dec: number): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(dec).replace('.', ',') : null;
}
function coord(v: string | null): string | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(6) : null; // point décimal (coordonnées)
}
function etageLabel(n: number | null): string | null {
  if (n === null) return null;
  return n === 0 ? 'Rez-de-chaussée' : `${n}ᵉ étage`;
}
function dateHeureFr(d: Date): string {
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
  return `${jour} à ${heure}`;
}
function dateFr(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
}
function exterieur(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  if (payload.balcon === true) return 'Balcon';
  if (payload.terrasse === true) return 'Terrasse';
  if (payload.jardin === true) return 'Jardin';
  return 'Aucun';
}
function modeLabel(m: string | null): string | null {
  return m === 'semi_auto' ? 'snapping façade' : m === 'manuel' ? 'GPS libre' : null;
}
/** Ajoute la ligne [k, v] SEULEMENT si v n'est pas null (pas de « — », pas de ligne vide). */
function ligne(rows: LigneKv[], k: string, v: string | null): void {
  if (v !== null) rows.push([k, v]);
}

/** Assemble les données du PDF. `cartePng` NON null (la carte est un prérequis : le générateur l'affiche toujours). */
export function assembler(r: LigneJointe, base: string, cartePng: Buffer, photoJpeg: Buffer | null): DonneesCertificatPdf {
  const host = base.replace(/^https?:\/\//, '');

  const coordonnees: LigneKv[] = [];
  ligne(coordonnees, 'Latitude', coord(r.lat));
  ligne(coordonnees, 'Longitude', coord(r.lon));
  ligne(coordonnees, 'Alt. terrain (NGF)', nombre(r.altitude_terrain_m, 1) ? `${nombre(r.altitude_terrain_m, 1)} m` : null);
  ligne(coordonnees, 'Alt. sol (BD TOPO)', nombre(r.altitude_sol_m, 1) ? `${nombre(r.altitude_sol_m, 1)} m` : null);

  const position: LigneKv[] = [];
  ligne(position, 'Étage', etageLabel(r.etage));
  ligne(position, 'Dernier étage', r.dernier_etage === null ? null : r.dernier_etage ? 'Oui' : 'Non');
  ligne(position, 'Sous-plafond déclaré', nombre(r.hauteur_sous_plafond_m, 2) ? `${nombre(r.hauteur_sous_plafond_m, 2)} m` : null);
  ligne(position, 'Hauteur de vision', nombre(r.hauteur_vision_m, 2) ? `${nombre(r.hauteur_vision_m, 2)} m` : null); // MOTEUR, jamais recalculée
  position.push(['Champ analysé', `${CHAMP_DEG}°`]);

  const caracteristiques: LigneKv[] = [];
  ligne(caracteristiques, 'Surface', nombre(r.surface_m2, 2) ? `${nombre(r.surface_m2, 2)} m²` : null);
  ligne(caracteristiques, 'Pièces', r.nb_pieces === null ? null : String(r.nb_pieces));
  ligne(caracteristiques, 'Année', r.annee_batiment === null ? null : String(r.annee_batiment));
  ligne(caracteristiques, 'Extérieur', exterieur(r.payload));

  // Obstacle face : sous la portée → valeur ; sinon (null ou ≥ portée) → « > <portée> m ». Même portée MOTEUR (dérivée).
  const dist = r.distance_obstacle_m === null ? null : Number(r.distance_obstacle_m);
  const obstacle = dist !== null && Number.isFinite(dist) && dist < PORTEE_M ? `${nombre(r.distance_obstacle_m, 1)} m` : `> ${PORTEE_M} m`;
  const analyseResultat: LigneKv[] = [['Obstacle face détecté', obstacle]];
  ligne(analyseResultat, 'Moyenne faisceaux', nombre(r.profondeur_moyenne_m, 1) ? `${nombre(r.profondeur_moyenne_m, 1)} m` : null);

  const nomComplet = [r.prenom, r.nom].filter(Boolean).join(' ');
  const demandeur =
    nomComplet || r.email || r.telephone ? { nom: nomComplet || null, email: r.email, telephone: r.telephone } : null;

  const usage = r.residence_principale === null ? null : r.residence_principale ? 'Habitation principale' : 'Habitation secondaire';

  return {
    numero: r.numero,
    reference: r.reference,
    emission: dateHeureFr(r.emis_le),
    dateAnalyse: dateFr(r.emis_le),
    porteeAnalyse: PORTEE_ANALYSE,
    champAnalyseDeg: `${CHAMP_DEG}°`, // dérivé moteur, pour la ligne « Source » du générateur (jamais retapé)
    siteWeb: host,
    urlVerification: `${host}/verifier`,
    verdictCertifie: r.verdict === 'SANS_VIS_A_VIS',
    score: { valeur: r.score === null ? 0 : Math.round(Number(r.score)), note: SCORE_NOTE },
    demandeur,
    bien: { adresse: r.adresse, cadastre: r.reference_cadastrale, type: r.type_bien, usage },
    photo: { azimut: nombre(r.azimut_deg, 1) ? `${nombre(r.azimut_deg, 1)}°` : null, mode: modeLabel(r.mode_origine), champ: CHAMP },
    empreinteCoordonnees: coordonnees,
    empreintePosition: position,
    empreinteCaracteristiques: caracteristiques,
    analyseResultat,
    carteLegende: CARTE_LEGENDE,
    pied: PIED,
    emisLe: r.emis_le,
    jeton: r.jeton_verification,
    urlBase: base,
    cartePng,
    photoJpeg,
  };
}

/** Récupère un objet best-effort (clé null ou lecture en échec → null). */
async function recupererSans(cle: string | null): Promise<Buffer | null> {
  if (!cle) return null;
  try {
    return await recuperer(cle);
  } catch {
    return null;
  }
}

export async function publierCertificatPdf(internauteId: string, certificatId: number): Promise<void> {
  try {
    if (!stockageConfigure()) return; // silencieux (comme le dépôt carte/photo)
    const base = siteUrl();
    if (!base) {
      console.error('[certificat-pdf] SITE_URL absente ou mal formée → PDF non généré (QR faux évité)');
      return;
    }

    const r = await query<LigneJointe>(REQUETE, [certificatId]);
    const row = r.rows[0];
    if (!row) {
      console.error('[certificat-pdf] certificat introuvable', certificatId);
      return;
    }

    const cartePng = await recupererSans(row.carte_orientation_cle); // RELECTURE (pas de régénération IGN)
    if (!cartePng) {
      // La carte est un prérequis du document (le générateur l'affiche toujours). Absente/illisible → on ne génère
      // PAS le PDF ; carte ET PDF sont re-fabricables. On laisse le statut en l'état (pas un « echec » définitif).
      console.error('[certificat-pdf] carte indisponible → PDF différé', certificatId);
      return;
    }
    const photoJpeg = await recupererSans(row.photo_cle);

    const donnees = assembler(row, base, cartePng, photoJpeg);
    const pdf = await genererCertificatPdf(donnees);
    const { cle } = await deposer(pdf, 'application/pdf', { internauteId }); // catégorie « certificats »
    await query(
      `UPDATE certificat_acheminement SET pdf_cle = $1, statut = 'genere', genere_le = now(), maj_a = now() WHERE certificat_id = $2`,
      [cle, certificatId],
    );
  } catch (e) {
    // Best-effort : on marque l'échec (sans jamais logguer le jeton — seul le NOM de l'erreur est conservé).
    const nom = (e as Error)?.name ?? 'Erreur';
    console.error('[certificat-pdf] génération/dépôt indisponible', nom);
    try {
      await query(
        `UPDATE certificat_acheminement SET statut = 'echec', derniere_erreur = $1, maj_a = now() WHERE certificat_id = $2`,
        [nom, certificatId],
      );
    } catch {
      /* best-effort : même l'écriture de l'échec ne doit jamais throw */
    }
  }
}
