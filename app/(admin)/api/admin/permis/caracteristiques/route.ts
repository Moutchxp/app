import 'server-only';
import { query } from '../../../../../lib/db/client';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { parserBornesCheck, parserListeCheck, parserListeArrayCheck, type BornesParColonne } from '../../../../../lib/sitadel/reglagesVeille';
import { libelleNatureProjet } from '../../../../../lib/sitadel/priorite';
import { lirePermisCaracteristiques, ecrireGlobal, ecrireCorps, ecrireCaracteristiquesGlobales, ecrireDestinations, creerCorps, supprimerCorps, definirRepere, definirAdresseCorps, validerSommetCorps, type ValeursCorps } from '../../../../../lib/permis/caracteristiquesRepo';
import { lireJournalChamps, type JournalPermis } from '../../../../../lib/permis/journalLecture';
import { lireParcellesPermis, geojsonParcellesPermis, lireEmpreintePermis, geojsonEmpreintePermis, lireBatiSnapshotPermis, type ParcelleLigne, type EmpreinteLigne, type BatiSnapshotResume } from '../../../../../lib/permis/parcellesRepo';
import { MESURES, construireGlobal, construirePermis, type EditionPermis } from '../../../../admin/(protected)/permis/caracteristiquesForm';

/** N7-E — liste FERMÉE de nature_projet, lue du CHECK de permis_caracteristique (jamais recopiée). */
async function lireNaturesPossibles(): Promise<string[]> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'permis_caracteristique'::regclass AND contype = 'c'`);
  return parserListeCheck(rows.map((r) => r.def), 'nature_projet');
}

/** N13 — liste FERMÉE des sous-destinations, LUE du CHECK `destinations <@ ARRAY[…]` (jamais recopiée). [] si migration 110 non appliquée. */
async function lireDestinationsPossibles(): Promise<string[]> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'permis_caracteristique'::regclass AND contype = 'c'`);
  return parserListeArrayCheck(rows.map((r) => r.def), 'destinations');
}

/**
 * /api/admin/permis/caracteristiques (chantier N3-C) — édition des caractéristiques physiques d'UN permis. GET = état complet
 * (faits lecture seule du permis + global + corps + BORNES lues des CHECK). POST = écritures, TOUJOURS en mode 'saisie' (l'écran
 * n'écrit JAMAIS 'extraite') : global, corps (repère + mesures), création/suppression d'un corps. RÉSERVÉ ADMINISTRATEUR. Pas de
 * catch muet : chaque échec renvoie un motif distinguable. Runtime Node (pg).
 */
export const runtime = 'nodejs';

const estEntier = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const auteurDe = (g: { auteurId: number | null }): string => (g.auteurId != null ? String(g.auteurId) : 'admin');

async function lireBornes(): Promise<BornesParColonne> {
  const { rows } = await query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'permis_corps_batiment'::regclass AND contype = 'c'`);
  return parserBornesCheck(rows.map((r) => r.def));
}

/** N10 — nom de fichier → id `dossier_document` du dossier (nom UNIQUE par dossier → résolution SÛRE ; en cas de doublon on garde le
 *  plus récent, prudent). Sert à rendre CLIQUABLE une provenance du journal. Tolérant : migration 089 absente → map vide. */
async function lirePiecesParNom(dossierId: number): Promise<Record<string, number>> {
  const { rows } = await query<{ id: number; nom_fichier: string }>(
    `SELECT id::int AS id, nom_fichier FROM dossier_document WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.nom_fichier] = r.id; // ORDER BY id → la dernière écriture (id le plus grand) gagne
  return map;
}

/** Faits LECTURE SEULE du permis (Sitadel) — jamais recopiés en base. `null` si le dossier n'existe pas. */
async function lireFaits(dossierId: number) {
  const { rows } = await query<{ num_dau: string; type: string; commune_nom: string | null; code_insee: string; adresse: string | null; nature: string | null; date_autorisation: string | null; surf: string | number | null }>(
    `SELECT s.num_dau, s.type, c.nom AS commune_nom, s.code_insee,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            s.nature_projet_completee AS nature, s.date_reelle_autorisation::text AS date_autorisation, s.surf_creee AS surf
       FROM sitadel_dossier s LEFT JOIN commune c ON c.code_insee = s.code_insee WHERE s.id = $1`, [dossierId]);
  const r = rows[0];
  if (!r) return null;
  return {
    numDau: r.num_dau, type: r.type, communeNom: r.commune_nom, codeInsee: r.code_insee, adresse: r.adresse,
    natureTravaux: r.nature === null ? null : libelleNatureProjet(r.nature),
    dateAutorisation: r.date_autorisation, surfaceCreee: r.surf === null ? null : String(r.surf),
  };
}

/** Défense en profondeur : refuse une valeur de corps hors des bornes de la base (message citant les bornes). `null` = OK. */
function horsBornes(valeurs: ValeursCorps, bornes: BornesParColonne): string | null {
  for (const m of MESURES) {
    const v = valeurs[m.cle];
    if (typeof v !== 'number') continue;
    const b = bornes[m.colonne];
    if (b && (v < b.min || v > b.max)) return `${m.libelle} : valeur attendue entre ${b.min} et ${b.max}${m.unite ? ` ${m.unite}` : ''}`;
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const urlReq = new URL(request.url);
  const dossierId = Number(urlReq.searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  // N3-E / FUS-1 — export GeoJSON (téléchargement ; les contours ne sont jamais déversés dans l'écran).
  //   geojson=empreinte → l'empreinte attendue (union) ; sinon → les parcelles rattachées.
  const geojson = urlReq.searchParams.get('geojson');
  if (geojson) {
    const empreinte = geojson === 'empreinte';
    const fc = await (empreinte ? geojsonEmpreintePermis(dossierId) : geojsonParcellesPermis(dossierId)).catch(() => ({ type: 'FeatureCollection', features: [] }));
    const nom = empreinte ? `empreinte-${dossierId}.geojson` : `parcelles-${dossierId}.geojson`;
    return new Response(JSON.stringify(fc), { headers: { 'Content-Type': 'application/geo+json', 'Content-Disposition': `attachment; filename="${nom}"` } });
  }
  try {
    // N5-D/E/N7-E — le JOURNAL (confiance/réserve/provenance + MOTIF), séparé par niveau (parCorps / permis), lu dans le MÊME
    // aller-retour. TOLÉRANT : si les migrations ne sont pas appliquées, on dégrade en journal vide + log — sans casser l'éditeur.
    const journalSur = lireJournalChamps(dossierId).catch((e): JournalPermis => {
      console.warn('[permis/caracteristiques] journal indisponible (migrations 104-107 non appliquées ?)', e instanceof Error ? e.message : String(e));
      return { parCorps: {}, permis: {} };
    });
    // N7-E — la liste fermée de nature_projet (du CHECK 106) ; tolérante si 106 non appliquée (→ []).
    const naturesSur = lireNaturesPossibles().catch(() => [] as string[]);
    // N10 — carte nom → id de pièce, pour rendre les provenances cliquables ; tolérante si 089 non appliquée (→ {}).
    const piecesSur = lirePiecesParNom(dossierId).catch(() => ({} as Record<string, number>));
    // N13 — liste fermée des sous-destinations (du CHECK 110) ; tolérante si 110 non appliquée (→ []).
    const destSur = lireDestinationsPossibles().catch(() => [] as string[]);
    // N3-E — parcelles cadastrales rattachées à leur géométrie ; tolérante si 112 non appliquée (→ []).
    const parcSur = lireParcellesPermis(dossierId).catch(() => [] as ParcelleLigne[]);
    // FUS-1 — empreinte attendue de la future parcelle fusionnée ; tolérante si 113 non appliquée (→ null).
    const empSur = lireEmpreintePermis(dossierId).catch(() => null as EmpreinteLigne | null);
    // FUS-1b — photo du bâti d'origine dans l'empreinte ; tolérante si 114 non appliquée (→ null).
    const batiSur = lireBatiSnapshotPermis(dossierId).catch(() => null as BatiSnapshotResume | null);
    const [faits, etat, bornes, journal, naturesPossibles, piecesParNom, destinationsPossibles, parcelles, empreinte, bati] = await Promise.all([lireFaits(dossierId), lirePermisCaracteristiques(dossierId), lireBornes(), journalSur, naturesSur, piecesSur, destSur, parcSur, empSur, batiSur]);
    if (faits === null) return Response.json({ erreur: 'permis inconnu' }, { status: 404 });
    return Response.json({ faits, global: etat.global, corps: etat.corps, bornes, journal, naturesPossibles, piecesParNom, destinationsPossibles, parcelles, empreinte, bati });
  } catch (e) {
    console.error('[permis/caracteristiques] GET indisponible', e);
    return Response.json({ erreur: 'caractéristiques indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = auteurDe(garde);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'corps JSON invalide' }, { status: 422 }); }
  const action = body.action;

  try {
    if (action === 'global') {
      if (!estEntier(body.dossierId)) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
      const ed: { parking?: '' | 'oui' | 'non'; commentaire?: string } = {};
      if (body.parking === '' || body.parking === 'oui' || body.parking === 'non') ed.parking = body.parking;
      if (typeof body.commentaire === 'string') ed.commentaire = body.commentaire;
      const r = await ecrireGlobal(body.dossierId, construireGlobal(ed), 'saisie', auteur);
      return Response.json({ ok: true, ...r });
    }

    if (action === 'corps') {
      if (!estEntier(body.corpsId)) return Response.json({ erreur: 'corpsId invalide' }, { status: 400 });
      const valeurs = (typeof body.valeurs === 'object' && body.valeurs !== null ? body.valeurs : {}) as ValeursCorps;
      const bornes = await lireBornes();
      const motif = horsBornes(valeurs, bornes);
      if (motif) return Response.json({ erreur: motif }, { status: 422 });
      if ('repere' in body) await definirRepere(body.corpsId, typeof body.repere === 'string' && body.repere.trim() !== '' ? body.repere.trim() : null, auteur);
      if ('adresse' in body) await definirAdresseCorps(body.corpsId, typeof body.adresse === 'string' ? body.adresse : null, auteur); // N7-E
      const r = await ecrireCorps(body.corpsId, valeurs, 'saisie', auteur);
      return Response.json({ ok: true, ...r });
    }

    // N10-D — VALIDER la hauteur de sommet : on écrit LA VALEUR DU CHAMP (fournie par le client), bornée comme une écriture de corps,
    //   en 'saisie' + trace nominative. C'est une décision humaine ; le recompute ne la réécrit jamais (invariant). Champ vide → efface.
    if (action === 'valider_sommet') {
      if (!estEntier(body.corpsId)) return Response.json({ erreur: 'corpsId invalide' }, { status: 400 });
      const brut = typeof body.valeur === 'number' ? String(body.valeur) : (typeof body.valeur === 'string' ? body.valeur.trim() : '');
      const valeur = brut === '' ? null : Number(brut);
      if (valeur !== null && !Number.isFinite(valeur)) return Response.json({ erreur: 'valeur de sommet invalide' }, { status: 422 });
      if (valeur !== null) {
        const motif = horsBornes({ altitudeSommetNgf: valeur }, await lireBornes());
        if (motif) return Response.json({ erreur: motif }, { status: 422 });
      }
      await validerSommetCorps(body.corpsId, valeur, auteur);
      return Response.json({ ok: true });
    }

    // N7-E — édition des caractéristiques DÉCLARÉES au niveau PERMIS (colonnes 106), TOUJOURS en 'saisie' (l'écran n'écrit jamais 'extraite').
    if (action === 'declare') {
      if (!estEntier(body.dossierId)) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
      const src = (typeof body.edition === 'object' && body.edition !== null ? body.edition : {}) as Record<string, unknown>;
      const chaine = (v: unknown): string => (typeof v === 'string' ? v : '');
      const ed: EditionPermis = {
        natureProjet: chaine(src.natureProjet), surfacePlancherM2: chaine(src.surfacePlancherM2), nbLogements: chaine(src.nbLogements),
        nbPlacesStationnement: chaine(src.nbPlacesStationnement), adresseTerrain: chaine(src.adresseTerrain),
        designation: chaine(src.designation), // N10-H — désignation de l'opération (texte libre verbatim, 132), TOUJOURS 'saisie' ici
        altitudeSommetNgf: chaine(src.altitudeSommetNgf), // N8-C — sommet du permis (108), borné par le CHECK lu en base
      };
      const [natures, bornes] = await Promise.all([lireNaturesPossibles(), lireBornes()]);
      const { valeurs, erreurs, valide } = construirePermis(ed, natures, bornes);
      if (!valide) return Response.json({ erreur: 'valeur(s) invalide(s)', erreurs }, { status: 422 });
      const r = await ecrireCaracteristiquesGlobales(body.dossierId, valeurs, 'saisie', auteur);
      return Response.json({ ok: true, ...r });
    }

    // N13 — édition du TABLEAU des destinations (cases à cocher), TOUJOURS en 'saisie'. Chaque valeur DOIT appartenir à la liste
    //   fermée LUE du CHECK (défense en profondeur avant le CHECK de la base) ; sinon 422 avec la valeur fautive.
    if (action === 'destinations') {
      if (!estEntier(body.dossierId)) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
      const brut = Array.isArray(body.destinations) ? body.destinations.filter((v): v is string => typeof v === 'string') : [];
      const possibles = await lireDestinationsPossibles();
      const hors = brut.find((v) => !possibles.includes(v));
      if (hors !== undefined) return Response.json({ erreur: `destination hors liste : « ${hors} »` }, { status: 422 });
      const uniques = [...new Set(brut)];
      const r = await ecrireDestinations(body.dossierId, uniques.length ? uniques : null, 'saisie', auteur);
      return Response.json({ ok: true, ...r });
    }

    if (action === 'creer') {
      if (!estEntier(body.dossierId)) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
      const repere = typeof body.repere === 'string' && body.repere.trim() !== '' ? body.repere.trim() : null;
      const id = await creerCorps(body.dossierId, repere, auteur);
      return Response.json({ ok: true, id });
    }

    if (action === 'supprimer') {
      if (!estEntier(body.corpsId)) return Response.json({ erreur: 'corpsId invalide' }, { status: 400 });
      const ok = await supprimerCorps(body.corpsId);
      return Response.json({ ok, supprime: ok });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    // Pas de catch muet : on journalise et on renvoie un motif distinguable (ex. valeur refusée par un CHECK de la base).
    console.error('[permis/caracteristiques] écriture en échec', { action, message: e instanceof Error ? e.message : String(e) });
    return Response.json({ erreur: 'écriture refusée (valeur invalide ou base indisponible)' }, { status: 422 });
  }
}
