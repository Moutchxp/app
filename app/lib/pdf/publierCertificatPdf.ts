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
import { deriverExterieur } from '../certificat/descriptif';
// Constantes MOTEUR (imports EN LECTURE SEULE ; config.ts n'est PAS modifié). Le certificat AFFICHE ce que le moteur
// a analysé — champ et portée DÉRIVÉS, jamais retapés. Même source que le tracé de la carte (publierCarteOrientation).
import { ANALYSIS_RANGE_M, AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } from '../svv/config';
// Découpage d'AFFICHAGE de la carte (le cône central « 90° » de la légende = 2 × demi-ouverture). Nommé « affichage »,
// ce n'est PAS une grandeur moteur (le champ analysé reste 180°). Single source : la carte et la légende disent le même.
import { DECOUPE_AFFICHAGE_DEG } from '../carte/orientationCarte';

const CHAMP_DEG = (AMPLITUDE_BEAM_COUNT - 1) * AMPLITUDE_BEAM_STEP_DEG; // balayage réel : 61 faisceaux × 3° = 180°
const PORTEE_M = ANALYSIS_RANGE_M; // portée d'analyse effective (const du moteur, cf. geo.ts / faisceaux.ts)
const PORTEE_ANALYSE = `${PORTEE_M} m`;
const CHAMP = `${CHAMP_DEG}° horizontal`;
const CARTE_LEGENDE = `Plan IGN · portée ${PORTEE_M} m`;
const SCORE_NOTE = 'Le label de qualité s’affiche à partir de 60/100. Il n’affecte pas le verdict.';
const PIED = 'Certificat délivré par le système d’analyse géométrique Sans Vis-à-Vis®.';
const TIRET = '—'; // valeur affichée quand AUCUNE source moteur/base n'existe (convention du modèle : jamais inventer)
const TOLERANCE_MESURE = '± 2 m'; // marge de mesure DÉCLARÉE (constante de la méthode, modèle), pas issue d'un calcul

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
  a_un_compte: boolean; // EXISTS(internaute_auth) → gabarit authentifiable (true) vs one-shot (false)
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
         EXISTS (SELECT 1 FROM internaute_auth ia WHERE ia.internaute_id = ip.internaute_id) AS a_un_compte,
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
  // « e » simple (pas l'exposant U+1D49 : absent des 4 polices embarquées → rendrait un tofu).
  return n === 0 ? 'Rez-de-chaussée' : `${n}e étage`;
}
function dateHeureFr(d: Date): string {
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
  return `${jour} à ${heure}`;
}
function dateFr(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
}
// Extérieur : dérivation PARTAGÉE avec l'émission (app/lib/certificat/descriptif.ts) — logique unique, non dupliquée.
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
  coordonnees.push(['Tolérance de mesure', TOLERANCE_MESURE]); // marge DÉCLARÉE de la méthode (constante), modèle

  const position: LigneKv[] = [];
  ligne(position, 'Étage', etageLabel(r.etage));
  ligne(position, 'Dernier étage', r.dernier_etage === null ? null : r.dernier_etage ? 'Oui' : 'Non');
  ligne(position, 'Sous-plafond déclaré', nombre(r.hauteur_sous_plafond_m, 2) ? `${nombre(r.hauteur_sous_plafond_m, 2)} m` : null);
  ligne(position, 'Hauteur de vision', nombre(r.hauteur_vision_m, 2) ? `${nombre(r.hauteur_vision_m, 2)} m` : null); // MOTEUR, jamais recalculée
  position.push(['Champ analysé', `${CHAMP_DEG}°`]);

  const caracteristiques: LigneKv[] = [];
  ligne(caracteristiques, 'Surface', nombre(r.surface_m2, 2) ? `${nombre(r.surface_m2, 2)} m²` : null);
  ligne(caracteristiques, 'Pièces', r.nb_pieces === null ? null : String(r.nb_pieces));
  caracteristiques.push(['Chambres', TIRET]); // pas de source (le certificat n'a que nb_pieces) → « — », jamais inventé
  ligne(caracteristiques, 'Année', r.annee_batiment === null ? null : String(r.annee_batiment));
  ligne(caracteristiques, 'Extérieur', deriverExterieur(r.payload));

  // Obstacle face : sous la portée → valeur ; sinon (null ou ≥ portée) → « > <portée> m ». Même portée MOTEUR (dérivée).
  const dist = r.distance_obstacle_m === null ? null : Number(r.distance_obstacle_m);
  const obstacle = dist !== null && Number.isFinite(dist) && dist < PORTEE_M ? `${nombre(r.distance_obstacle_m, 1)} m` : `> ${PORTEE_M} m`;
  const analyseResultat: LigneKv[] = [['Obstacle face détecté', obstacle]];
  ligne(analyseResultat, 'Moyenne faisceaux', nombre(r.profondeur_moyenne_m, 1) ? `${nombre(r.profondeur_moyenne_m, 1)} m` : null);
  analyseResultat.push(['Analyses LiDAR', TIRET]); // placeholder du modèle, pas de source moteur exposée → « — »

  // Qualité de vue & Nuisances : AUCUNE source moteur/base à l'émission (photo-IA NULL + non déterministe) → « — »
  // partout, convention du modèle (qualiteVue). Rien d'inventé, rien de supprimé.
  const qualiteVue: LigneKv[] = [['Dégagement', TIRET], ['Ouverture', TIRET], ['Végétation', TIRET], ['Patrimoine', TIRET], ['Ciel', TIRET]];
  const nuisances: LigneKv[] = [['Ligne haute tension', TIRET], ['Site industriel (ICPE)', TIRET], ['Antenne / Relais', TIRET], ['Axe routier majeur', TIRET], ["Source d'eau", TIRET]];

  const nomComplet = [r.prenom, r.nom].filter(Boolean).join(' ');
  // Modèle : bloc demandeur = nom · ADRESSE (celle du bien, seule dispo : `internaute` n'a pas d'adresse postale).
  const demandeur =
    nomComplet || r.email || r.telephone ? { nom: nomComplet || null, adresse: r.adresse, email: r.email, telephone: r.telephone } : null;

  const usage = r.residence_principale === null ? null : r.residence_principale ? 'Habitation principale' : 'Habitation secondaire';

  return {
    numero: r.numero,
    reference: r.reference,
    emission: dateHeureFr(r.emis_le),
    dateAnalyse: dateFr(r.emis_le),
    porteeAnalyse: PORTEE_ANALYSE,
    champAnalyseDeg: `${CHAMP_DEG}°`, // dérivé moteur (180°) pour la légende de la carte (jamais retapé)
    coneCentralDeg: `${2 * DECOUPE_AFFICHAGE_DEG}°`, // 90° = découpage d'AFFICHAGE (2 × 45°), single source avec la carte
    siteWeb: host,
    urlVerification: `${host}/verifier`,
    verdictCertifie: r.verdict === 'SANS_VIS_A_VIS',
    aUnCompte: r.a_un_compte === true, // gabarit authentifiable si l'internaute a un compte ; sinon one-shot

    score: { valeur: r.score === null ? 0 : Math.round(Number(r.score)), note: SCORE_NOTE },
    demandeur,
    bien: { adresse: r.adresse, cadastre: r.reference_cadastrale, type: r.type_bien, usage },
    photo: { azimut: nombre(r.azimut_deg, 1) ? `${nombre(r.azimut_deg, 1)}°` : null, mode: modeLabel(r.mode_origine), champ: CHAMP },
    empreinteCoordonnees: coordonnees,
    empreintePosition: position,
    empreinteCaracteristiques: caracteristiques,
    analyseResultat,
    qualiteVue,
    nuisances,
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

/**
 * Génère le PDF d'un certificat et RETOURNE le buffer, SANS rien déposer en stockage (≠ `publierCertificatPdf`). Réutilise
 * la MÊME chaîne (REQUETE snapshot + relecture carte/photo + `assembler` + `genererCertificatPdf`) → aucune duplication.
 * Sert à produire à la volée des variantes (ex. anonymisé) pour l'e-mail d'émission. `null` si SITE_URL absente, certificat
 * introuvable, ou carte indisponible (prérequis du document). `anonymise`/`typeDocument` surchargent la variante voulue —
 * `anonymise` reste sans effet sur un one-shot (`aUnCompte===false`, cf. `certificatPdf.ts`). N'écrit RIEN (pas de dépôt,
 * pas d'UPDATE) → le chemin nominatif existant est INCHANGÉ.
 */
export async function genererBufferCertificat(
  certificatId: number,
  options?: { anonymise?: boolean; typeDocument?: DonneesCertificatPdf['typeDocument'] },
): Promise<Buffer | null> {
  const base = siteUrl();
  if (!base) return null; // QR faux évité (même garde que le dépôt nominatif)
  const r = await query<LigneJointe>(REQUETE, [certificatId]);
  const row = r.rows[0];
  if (!row) return null;
  const cartePng = await recupererSans(row.carte_orientation_cle); // RELECTURE (pas de régénération IGN)
  if (!cartePng) return null; // carte = prérequis du document (comme publierCertificatPdf)
  const photoJpeg = await recupererSans(row.photo_cle);
  const donnees = assembler(row, base, cartePng, photoJpeg);
  return genererCertificatPdf({ ...donnees, anonymise: options?.anonymise, typeDocument: options?.typeDocument });
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
