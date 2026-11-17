import { query } from '../db/client';
import type { Auteur } from './gestes';
import { chargerConfigGestion } from './config';
import { conditionCoordonneeVivante } from './coordonneeVivante';
import { colonneExisteMemo } from '../location/sondeLocation';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { emailDeLAuteur } from '../location/mailPortefeuilleRepo';
import { envoyerSerie, locatairesAvis, signatureEcran, type DepsAvis } from '../location/mailsPreavisSortieRepo';
import { adressesUniques, prenomNom } from '../location/mailsPreavisSortie';
import { ficheCopropriete } from './coproprieteRepo';
import { gesteDigicodeCopro } from './coproprieteEcritureRepo';
import { adresseCleDuBien, batimentCleDuBien, chargerAnciens, digicodesDuBien, digicodesUnifiesDisponibles } from './digicodesRepo';
import { placeBatiment, validerChangements } from './digicodes';
import { bilanEnvoi, locataireSelectionne, mailGestion, mailLocataire, mailProprietaire, proprietairesRegroupes, regleDepart, type ApercuEnvoi, type IssueEnvoi, type LogementDest, type ModePrevenir, type PersonneDest } from './digicodesEnvoi';
import { cleImmeuble } from './syndics';

/**
 * ══ 🔴🔴 LE CHANGEMENT DE DIGICODE : L'ÉCRAN DES DESTINATAIRES, PUIS L'ENVOI (Arno, 16/11/2026, « Digicodes unifiés », lot 6). IMPUR. ════════════
 * `apercuChangement` (LECTURE SEULE) : les logements concernés de l'adresse, leurs locataires en place (préavis compris, règle des 7 jours) et
 * propriétaires, leurs codes à la date d'application. `planifierEtPrevenir` : le changement est ENREGISTRÉ (le même chemin que « Modifier » ; un
 * refus : rien n'est écrit, rien ne part), PUIS les mails partent, un par personne (envoi de la Location, garde de la recette), chacun enregistré
 * dans l'historique du bien, du locataire et du propriétaire. Rien ne part sans la 479 (le mail ne pourrait pas être enregistré).
 */

export async function mailsDigicodeDisponibles(): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT coalesce(bool_or(pg_get_constraintdef(oid) LIKE '%digicode_locataire%'), false) AS ok FROM pg_constraint WHERE conname = 'gestion_location_mail_avis_sorte_check'`)
    .catch(() => ({ rows: [{ ok: false }] }));
  return rows[0]?.ok === true;
}

type Issue<T> = { ok: true; data: T } | { ok: false; motif: string };

/** L'ÉCRAN DES DESTINATAIRES, pour un changement proposé (pas encore enregistré). LECTURE SEULE. */
/** La 484 est-elle posée (le mail à la Gestion entre au journal) ? */
export async function mailGestionDigicodeDisponible(): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT coalesce(bool_or(pg_get_constraintdef(oid) LIKE '%digicode_gestion%'), false) AS ok FROM pg_constraint WHERE conname = 'gestion_location_mail_avis_sorte_check'`)
    .catch(() => ({ rows: [{ ok: false }] }));
  return rows[0]?.ok === true;
}

export async function apercuChangement(brut: unknown): Promise<Issue<ApercuEnvoi>> {
  if (!(await digicodesUnifiesDisponibles())) return { ok: false, motif: 'La base unique des digicodes n’est pas encore installée (migration 478).' };
  const b = (brut ?? {}) as Record<string, unknown>;
  const v = validerChangements(b);
  if (!v.ok) return v;
  const fiche = await ficheCopropriete(typeof b.immeuble === 'string' ? b.immeuble : '');
  const adresseCle = cleImmeuble(typeof b.adresseCle === 'string' ? b.adresseCle : '');
  const adresse = fiche?.adresses.find((a) => a.cle === adresseCle);
  if (fiche === null || adresse === undefined) return { ok: false, motif: 'Cette adresse n’est pas (ou plus) une adresse de cette copropriété : rechargez la fiche.' };
  const { appliqueLe, changements } = v.saisie;
  const communNouveau = changements.find((c) => placeBatiment(c.batiment).cle === '') ?? null;
  const batimentsNouveaux = new Map(changements.filter((c) => placeBatiment(c.batiment).cle !== '').map((c) => [placeBatiment(c.batiment).cle, c]));
  // ① les logements concernés : à cette adresse, hors annexes (leurs locataires sont ceux du logement) ; tous si le commun change, sinon ceux des bâtiments qui changent
  const anciens = await chargerAnciens();
  const annexes = (await colonneExisteMemo('gestion_lot_annexe', 'annexe_id'))
    ? new Set((await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe')).rows.map((r) => Number(r.id))) : new Set<number>();
  const lots = anciens.lotsBruts.filter((l) => adresseCleDuBien(l) === adresseCle && !annexes.has(l.id)
    && (communNouveau !== null || batimentsNouveaux.has(batimentCleDuBien(l))));
  const ids = lots.map((l) => l.id);
  // ② les locataires EN PLACE (aujourd'hui), le départ prévu (sortie fixée, sinon fin du préavis en cours)
  const avecPreavis = await colonneExisteMemo('gestion_location_preavis', 'date_max');
  const { rows: occ } = ids.length === 0 ? { rows: [] as { id: string; lot: string; locataire: string; depart: string | null }[] } : await query<{ id: string; lot: string; locataire: string; depart: string | null }>(
    `SELECT o.id::text, o.lot_id::text AS lot, o.locataire_id::text AS locataire,
            coalesce(o.sortie${avecPreavis ? `, (SELECT p.date_max FROM gestion_location_preavis p WHERE p.occupation_id = o.id AND p.remplace_le IS NULL AND p.annule_le IS NULL ORDER BY p.id DESC LIMIT 1)` : ''})::text AS depart
       FROM gestion_annuaire_occupation o
      WHERE o.lot_id = ANY($1::bigint[]) AND o.entree <= ${SQL_AUJOURDHUI_PARIS} AND (o.sortie IS NULL OR o.sortie > ${SQL_AUJOURDHUI_PARIS})
      ORDER BY o.id`, [ids]);
  const locs = await locatairesAvis(occ.map((o) => Number(o.id)));
  // ③ les propriétaires (le principal et les co-propriétaires en cours), avec leurs e-mails en vigueur
  const vivante = await conditionCoordonneeVivante('c');
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'jusqu_a');
  const { rows: pro } = ids.length === 0 ? { rows: [] as { lot: string; id: string; nom: string; prenom: string | null; emails: string[] }[] } : await query<{ lot: string; id: string; nom: string; prenom: string | null; emails: string[] }>(
    `SELECT x.lot::text, p.id::text, coalesce(nullif(btrim(p.nom), ''), p.nom_complet) AS nom, p.prenom,
            array(SELECT coalesce(nullif(btrim(c.valeur_brute), ''), c.valeur) FROM gestion_annuaire_contact c
                   WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id AND c.sorte = 'email' AND c.absent_le IS NULL${vivante} ORDER BY c.rang NULLS LAST, c.id) AS emails
       FROM (SELECT id AS lot, proprietaire_id AS pid FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND proprietaire_id IS NOT NULL
             ${avecCo ? 'UNION SELECT lot_id, proprietaire_id FROM gestion_annuaire_lot_proprietaire WHERE lot_id = ANY($1::bigint[]) AND jusqu_a IS NULL' : ''}) x
       JOIN gestion_annuaire_proprietaire p ON p.id = x.pid AND p.supprime_le IS NULL
      ORDER BY p.id`, [ids]);
  // 🔴 (Arno, 17/11/2026) l'étage et la porte de chaque logement (l'en-tête de son bloc)
  const { rows: places } = ids.length === 0 ? { rows: [] as { id: string; etage: string | null; porte: string | null }[] } : await query<{ id: string; etage: string | null; porte: string | null }>(
    'SELECT id::text, etage::text, porte::text FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[])', [ids]);
  // ④ chaque logement : ses locataires, ses propriétaires, SES codes à la date d'application (le nouveau s'il change, sinon celui alors en vigueur)
  const logements: LogementDest[] = [];
  for (const l of lots) {
    const d = await digicodesDuBien(l.id, new Date(appliqueLe));
    const bCle = batimentCleDuBien(l);
    const bNouveau = bCle === '' ? undefined : batimentsNouveaux.get(bCle);
    const lu = (c: { valeur: { digicode: boolean | null; code: string | null } } | null | undefined) => (c ? c.valeur : null);
    logements.push({
      lotId: l.id, libelle: [l.adresse ?? '', l.numero && !l.numero.startsWith('app-') ? `lot ${l.numero}` : ''].filter(Boolean).join(' — ') || `Bien ${l.id}`,
      batiment: d?.batiment?.libelle ?? null,
      etage: places.find((x) => Number(x.id) === l.id)?.etage ?? null, porte: places.find((x) => Number(x.id) === l.id)?.porte ?? null,
      locataires: occ.filter((o) => Number(o.lot) === l.id).map((o) => {
        const x = locs.find((y) => y.occupationId === Number(o.id));
        const r = regleDepart(appliqueLe, o.depart);
        return { id: Number(o.locataire), occupationId: Number(o.id), nom: x?.nom ?? `Locataire ${o.locataire}`, prenom: x?.prenom ?? null, emails: x?.emails ?? [], depart: o.depart, ...r };
      }),
      proprietaires: pro.filter((p) => Number(p.lot) === l.id).map((p): PersonneDest => ({ id: Number(p.id), nom: p.nom, prenom: p.prenom, emails: (p.emails ?? []).filter((e) => typeof e === 'string') })),
      codes: { commun: communNouveau !== null ? { digicode: communNouveau.digicode, code: communNouveau.code } : lu(d?.commun),
        batiment: bNouveau !== undefined ? { digicode: bNouveau.digicode, code: bNouveau.code } : bCle === '' ? null : lu(d?.codeBatiment),
        communChange: communNouveau !== null, batimentChange: bNouveau !== undefined },
    });
  }
  return { ok: true, data: { adresse: adresse.libelle, adresseCle, appliqueLe, logements, adresseGestion: (await chargerConfigGestion()).adresseGestion } };
}


/**
 * ENREGISTRER LE CHANGEMENT, PUIS PRÉVENIR : rien ne part si le changement est refusé (rien n'est écrit non plus) ; ensuite UN MAIL PAR PERSONNE
 * (chacun à son seul nom), chacun enregistré dans l'historique du bien et du locataire (et du propriétaire). Ne lève pas : chaque échec est dit.
 * 🔴🔴 Arno (17/11/2026 : « chaque mail de changement de digicode a exactement UNE adresse en destinataire, sans copie ni copie cachée, et n'est jamais
 * regroupé ») : une personne qui a deux adresses reçoit DEUX mails, un par adresse ; chaque envoi passe le verrou `uneSeuleAdresse` d'`envoyerSerie`.
 */
export async function planifierEtPrevenir(brut: unknown, auteur: Auteur, deps: DepsAvis = {}): Promise<Issue<IssueEnvoi>> {
  if (!(await mailsDigicodeDisponibles())) return { ok: false, motif: 'L’envoi des mails de changement de digicode demande la mise à jour de la base (migration 479) : rien n’est enregistré ni envoyé.' };
  // 🔴🔴 (Arno, 17/11/2026 : « DEUX CHOIX, obligatoires, après la saisie […] Seuls les locataires cochés reçoivent un mail […]. Ensuite, un mail à la Gestion l'informe que les locataires listés ont été prévenus. Chaque mail reste rangé dans l'historique du bien et de la personne. ») — le mail à la Gestion doit entrer au journal (484) : sans elle, rien n'est enregistré ni envoyé
  if (!(await mailGestionDigicodeDisponible())) return { ok: false, motif: 'Le mail à la Gestion d’un changement de digicode demande la mise à jour de la base (migration 484) : rien n’est enregistré ni envoyé.' };
  const b0 = (brut ?? {}) as Record<string, unknown>;
  const mode: ModePrevenir = b0.mode === 'gestion' ? 'gestion' : 'locataires';
  const decoches = new Set((Array.isArray(b0.decoches) ? b0.decoches : []).map(Number).filter((x) => Number.isSafeInteger(x) && x > 0));
  const b = b0;
  const ap = await apercuChangement(b);
  if (!ap.ok) return ap;
  const enreg = await gesteDigicodeCopro(b, 'planification', auteur);
  if (!enreg.ok) return enreg;
  const a = ap.data;
  const proprietaires = mode === 'locataires' && b.proprietaires === true;
  const config = await chargerConfigGestion();
  const qui = await emailDeLAuteur(auteur);
  const sig = await signatureEcran(deps);
  const contexte = { expediteur: config.adresseGestion, qui, signature: sig.ecran };
  const envois: IssueEnvoi['envois'] = [];
  for (const l of mode === 'gestion' ? [] : a.logements) {
    for (const x of l.locataires) {
      // seuls les locataires COCHÉS (un locataire décoché ne reçoit rien)
      if (!locataireSelectionne(x, decoches)) continue;
      const m = mailLocataire(a, l, x, contexte);
      if (m === null) continue;
      for (const adresse of m.a) {
        const [r] = await envoyerSerie([{ ...m, a: [adresse], cc: [] }], sig.brute, { lotId: l.lotId, occupationIds: [x.occupationId], auteur, uneSeuleAdresse: true }, deps);
        envois.push({ pour: prenomNom(x), objet: r.objet, a: r.a, envoye: r.envoye, motif: r.motif });
      }
    }
  }
  if (proprietaires) {
    for (const p of proprietairesRegroupes(a)) {
      const m = mailProprietaire(a, p, contexte);
      if (m === null) continue;
      const [premier, ...autres] = p.logements;
      for (const adresse of m.a) {
        const [r] = await envoyerSerie([{ ...m, a: [adresse], cc: [] }], sig.brute, { lotId: premier.lotId, occupationIds: [], auteur, proprietaireIds: [p.personne.id],
          autres: autres.map((x) => ({ lotId: x.lotId, occupationIds: [] })), uneSeuleAdresse: true }, deps);
        envois.push({ pour: prenomNom(p.personne), objet: r.objet, a: r.a, envoye: r.envoye, motif: r.motif });
      }
    }
  }
  // le mail à la Gestion (A : à prévenir ; B : les locataires prévenus), rangé dans l'historique de chaque logement concerné
  let gestion: IssueEnvoi['gestion'] = null;
  const mg = mailGestion(a, contexte, { mode, decoches, proprietaires });
  const [premierLot, ...autresLots] = a.logements;
  if (mg !== null && premierLot !== undefined) {
    const [r] = await envoyerSerie([mg], sig.brute, { lotId: premierLot.lotId, occupationIds: [], auteur, autres: autresLots.map((x) => ({ lotId: x.lotId, occupationIds: [] })) }, deps);
    gestion = { pour: 'la Gestion', objet: r.objet, a: r.a, envoye: r.envoye, motif: r.motif };
  }
  const bilan = bilanEnvoi(a, proprietaires);
  // un locataire sans e-mail n'est pas oublié : il est dit, comme dans l'écran (« à prévenir autrement »)
  const nonCoches = mode === 'locataires' ? a.logements.flatMap((l) => l.locataires.filter((x) => x.inclus && x.emails.length > 0 && decoches.has(x.occupationId)).map((x) => prenomNom(x))) : [];
  return { ok: true, data: { enregistre: true, mode, envois, gestion, sansEmail: bilan.sansEmail, exclus: bilan.exclus, nonCoches } };
}

/** Les adresses d'un aperçu, pour les épreuves : aucune autre que celles des personnes concernées. PUR. */
export const adressesDeLApercu = (a: ApercuEnvoi): string[] => adressesUniques(a.logements.flatMap((l) => [...l.locataires.flatMap((x) => x.emails), ...l.proprietaires.flatMap((p) => p.emails)]));
