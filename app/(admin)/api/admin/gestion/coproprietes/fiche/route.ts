import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { query } from '../../../../../../lib/db/client';
import { colonneExisteMemo } from '../../../../../../lib/location/sondeLocation';
import { ficheCopropriete } from '../../../../../../lib/gestion/coproprieteRepo';
import { officielleDeLaCopropriete } from '../../../../../../lib/adresse/officielleCopro';
import { apercuChangement, planifierEtPrevenir } from '../../../../../../lib/gestion/digicodesEnvoiRepo';
import { enregistrerCopropriete, gesteDeLAction, gesteDigicodeCopro, preciserAdresseBatiment, propositionsParcelle, reponseGesteDigicode } from '../../../../../../lib/gestion/coproprieteEcritureRepo';
import { cleImmeuble } from '../../../../../../lib/gestion/syndics';
import { immeubleDuBien } from '../../../../../../lib/gestion/copropriete';
import { detacherContactSyndic, rattacherContactsSyndic, rechercherContactsDuSyndic } from '../../../../../../lib/gestion/contactsSyndicCoproRepo';

/**
 * /api/admin/gestion/coproprietes/fiche — LA FICHE COPROPRIÉTÉ (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 2). Au droit « Gestion ».
 *   GET  `?lotId=` (ou `?immeuble=`) : la fiche de la copropriété du bien (son « Immeuble », sinon son adresse), et la copropriété notée sur ce bien
 *        (461 : « Bien hors copropriété » dès le départ) — LECTURE SEULE ;
 *   POST `{ action: 'parcelle', adresses, cle }` : les adresses de la même parcelle (libres ou prises, avec leur syndic) — LECTURE SEULE ;
 *   POST `{ action: 'enregistrer', … }` : l'enregistrement (refus avant toute écriture) ;
 *   POST `{ action: 'digicode-corriger' | 'digicode-arbitrer', immeuble, adresseCle, batiment, digicode, code }` : 🔴 (« Digicodes unifiés », lot 3)
 *        « Corriger une erreur » / « Garder ce code », immédiats, par le chemin serveur unique (478) ;
 *   POST `{ action: 'digicode-planifier', immeuble, adresseCle, appliqueLe, changements }` / `{ action: 'digicode-annuler-changement', …, ligneId }` :
 *        (lot 5) « Modifier » daté, et l'annulation d'un changement encore à venir.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  try {
    // 🔴 (Arno, 20/11/2026) la recherche dans l'annuaire COMPLET du syndic en cours de la copropriété (contacts à rattacher) — LECTURE SEULE
    if (u.get('contactsSyndic') !== null) {
      return Response.json(await rechercherContactsDuSyndic((u.get('contactsSyndic') ?? '').slice(0, 300), (u.get('q') ?? '').slice(0, 120)), { headers: ENTETES });
    }
    let immeuble = (u.get('immeuble') ?? '').slice(0, 300);
    let coproprieteDuBien: boolean | null = null;
    const lot = Number(u.get('lotId'));
    if (Number.isSafeInteger(lot) && lot > 0) {
      const avec461 = await colonneExisteMemo('gestion_annuaire_lot', 'copropriete');
      const { rows } = await query<{ immeuble: string | null; adresse: string | null; copropriete: boolean | null }>(
        `SELECT immeuble, adresse, ${avec461 ? 'copropriete' : 'NULL::boolean AS copropriete'} FROM gestion_annuaire_lot WHERE id = $1`, [lot]);
      if (rows[0] === undefined) return Response.json({ etat: 'inconnu' }, { headers: ENTETES });
      coproprieteDuBien = rows[0].copropriete;
      if (immeuble === '') immeuble = immeubleDuBien(rows[0]);
    }
    if (cleImmeuble(immeuble) === '') return Response.json({ etat: 'ok', data: { fiche: null, coproprieteDuBien } }, { headers: ENTETES });
    const fiche = await ficheCopropriete(immeuble);
    // 🔴 (Arno, 20/11/2026, lot 4) l'adresse officielle (BAN), calculée en direct par le module unique — rien n'est écrit ; `null` : l'affichage d'avant
    const officielle = fiche === null ? null : await officielleDeLaCopropriete(fiche.adresses).catch((e: unknown) => { console.error('[gestion/coproprietes/fiche] adresse officielle', e); return null; });
    return Response.json({ etat: 'ok', data: { fiche, coproprieteDuBien, officielle } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/fiche] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try { corps = await request.json() as Record<string, unknown>; } catch { return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES }); }
  try {
    // 🔴 (Arno, 20/11/2026) rattacher des contacts du syndic à la copropriété / en détacher un (jamais supprimé de l'annuaire du syndic) — journalisés, aucun mail
    if (corps.action === 'rattacher-contacts-syndic' || corps.action === 'detacher-contact-syndic') {
      const immeuble = typeof corps.immeuble === 'string' ? corps.immeuble.slice(0, 300) : '';
      const auteur = await auteurDeLaRequete(request);
      const r = corps.action === 'rattacher-contacts-syndic' ? await rattacherContactsSyndic(immeuble, corps.contactIds, auteur)
        : await detacherContactSyndic(immeuble, corps.contactId, auteur);
      return Response.json(r, { headers: ENTETES });
    }
    if (corps.action === 'parcelle') {
      const t = (v: unknown, m: number): string => (typeof v === 'string' ? v.slice(0, m) : '');
      const adresses = (Array.isArray(corps.adresses) ? corps.adresses.slice(0, 30) : []).map((x) => (x ?? {}) as Record<string, unknown>)
        .map((a) => ({ libelle: t(a.libelle, 200), codePostal: t(a.codePostal, 10), commune: t(a.commune, 120) }));
      return Response.json({ etat: 'ok', data: await propositionsParcelle(adresses, cleImmeuble(t(corps.cle, 300))) }, { headers: ENTETES });
    }
    // 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété ») l'adresse d'un bâtiment « à préciser », choisie par Arno
    if (corps.action === 'batiment-adresse') {
      const r = await preciserAdresseBatiment(corps, await auteurDeLaRequete(request));
      return Response.json(r.ok ? { etat: 'ok', data: r.fiche } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
    }
    if (corps.action === 'enregistrer') {
      const r = await enregistrerCopropriete(corps, await auteurDeLaRequete(request));
      return Response.json(r.ok ? { etat: 'ok', data: r.fiche } : { etat: 'refus', motif: r.motif, ...(r.conflitsParcelle ? { conflitsParcelle: r.conflitsParcelle } : {}) }, { headers: ENTETES });
    }
    // 🔴 (« Digicodes unifiés », lot 3) « Corriger une erreur » et « Garder ce code » (à arbitrer) : immédiats, par le chemin serveur unique
    // 🔴 (« Digicodes unifiés », lot 6) l'écran des destinataires (lecture seule), puis « Enregistrer et envoyer »
    if (corps.action === 'digicode-apercu-envoi' || corps.action === 'digicode-planifier-envoyer') {
      const r = corps.action === 'digicode-apercu-envoi' ? await apercuChangement(corps) : await planifierEtPrevenir(corps, await auteurDeLaRequete(request));
      return Response.json(r.ok ? { etat: 'ok', data: r.data } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
    }
    const geste = gesteDeLAction(corps.action);
    if (geste !== null) {
      const r = await gesteDigicodeCopro(corps, geste, await auteurDeLaRequete(request));
      return Response.json(reponseGesteDigicode(r), { headers: ENTETES });
    }
    return Response.json({ etat: 'refus', motif: 'Action inconnue.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/fiche] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, { status: 503, headers: ENTETES });
  }
}
