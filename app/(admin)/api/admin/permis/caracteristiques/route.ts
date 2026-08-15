import 'server-only';
import { query } from '../../../../../lib/db/client';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { parserBornesCheck, type BornesParColonne } from '../../../../../lib/sitadel/reglagesVeille';
import { libelleNatureProjet } from '../../../../../lib/sitadel/priorite';
import { lirePermisCaracteristiques, ecrireGlobal, ecrireCorps, creerCorps, supprimerCorps, definirRepere, type ValeursCorps } from '../../../../../lib/permis/caracteristiquesRepo';
import { lireJournalRetenu, type JournalRetenuParCorps } from '../../../../../lib/permis/journalLecture';
import { MESURES, construireGlobal } from '../../../../admin/(protected)/permis/caracteristiquesForm';

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
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    // N5-D — le JOURNAL (confiance/réserve/provenance des valeurs extraites) est lu dans le MÊME aller-retour, pas par champ.
    // TOLÉRANT : si la migration 104 n'est pas encore appliquée (table absente), on dégrade en journal vide + log — sans jamais
    // casser le reste du bloc (faits/global/corps/bornes). Un enrichissement d'affichage ne doit pas faire tomber l'éditeur.
    const journalSur = lireJournalRetenu(dossierId).catch((e): JournalRetenuParCorps => {
      console.warn('[permis/caracteristiques] journal indisponible (migration 104 non appliquée ?)', e instanceof Error ? e.message : String(e));
      return {};
    });
    const [faits, etat, bornes, journal] = await Promise.all([lireFaits(dossierId), lirePermisCaracteristiques(dossierId), lireBornes(), journalSur]);
    if (faits === null) return Response.json({ erreur: 'permis inconnu' }, { status: 404 });
    return Response.json({ faits, global: etat.global, corps: etat.corps, bornes, journal });
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
      const r = await ecrireCorps(body.corpsId, valeurs, 'saisie', auteur);
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
