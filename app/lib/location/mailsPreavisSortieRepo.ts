import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { fabriquerMessageId } from '../gestion/envoiGmail';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { htmlVersTexte } from '../gestion/htmlMail';
import { adressesSignature, corpsPourEnvoi, signaturePourEcran, type ImageSignature } from '../gestion/signatureImages';
import { imagesSignaturePourEnvoi, signatureHtmlDeGestion } from '../gestion/signatureImagesReel';
import { sqlStatutBien } from '../gestion/statutBienRepo';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { lireDestinatairesDefaut } from './mailNouvelleLocationRepo';
import type { Destinataire } from './mailNouvelleLocation';
import { mailAdhocSortie, mailsDuPreavis, type DonneesPreavisMails, type LocataireAvis, type MailAvis, type Signature } from './mailsPreavisSortie';
import { verifierPreavis, type ModePreavis } from './preavis';
import { enregistrerPreavis, type IssuePreavis } from './preavisRepo';
import { colonneExisteMemo } from './sondeLocation';
import { donneesMailSortie, lireBail, type SortieFaite } from './sortieLocatairesRepo';

/**
 * ══ 🔴🔴 LOCATION — LES MAILS AUTOMATIQUES DU PRÉAVIS ET DE LA SORTIE (Arno, 05/11/2026). IMPUR (base + envoi). ═══════════
 *
 * Règles et textes : `mailsPreavisSortie.ts`. Ici : tirer les données à la source (logement, propriétaire, statut du bien,
 * locataires choisis et leurs adresses EN VIGUEUR, personne qui valide, signature Gmail de gestion@), construire l'APERÇU
 * (lecture seule, rien ne part), puis ENVOYER après l'enregistrement du geste — jamais avant, jamais bloquant.
 * LE CANAL : celui des mails de la Location (`transportParDefaut` : factice sous les tests ; en RECETTE, le verrou réseau
 * intercepte l'envoi et le dépose dans la boîte de test — aucun mail ne part, aucune écriture dans Gmail). En réel, le mail
 * part par l'API Gmail de gestion@ : il est donc dans ses « Envoyés », et la relève le range comme tout envoi de la boîte.
 * 🔴 CHAQUE MAIL EST JOURNALISÉ (`gestion_location_mail_avis`, migration 457, ajout seul) : sorte, logement, occupations,
 *    destinataires, objet, texte et HTML tels qu'ils sont partis, statut, erreur, personne qui a validé, heure ; et une ligne au
 *    journal du bien (`gestion_journal`). Sans la 457, AUCUN de ces mails ne part (le journal est une condition de l'envoi).
 */

export const mailsAvisDisponibles = (): Promise<boolean> => colonneExisteMemo('gestion_location_mail_avis', 'sorte');

/** Le motif dit à l'écran quand la 457 manque : le préavis s'enregistre, les mails ne partent pas. */
export const MOTIF_SANS_457 = 'Les mails automatiques demandent la mise à jour de la base (migration 457) : aucun mail n’est parti.';

export interface DepsAvis {
  transport?: TransportDemande;
  /** La signature HTML BRUTE de gestion@ (adresses Google) ; par défaut, celle que la Gestion lit dans Gmail. */
  signatureBrute?: () => Promise<string>;
  /** Les images de la signature, prêtes à partir ; par défaut, celles que la Gestion va chercher. */
  imagesSignature?: (rangs: readonly number[], domaine: string, alea: string) => Promise<{ images: ImageSignature[] }>;
}

/** La signature telle que l'ÉCRAN la montre (images par notre relais) ; `''` sans connexion Google. Ne lève jamais. */
async function signatureEcran(deps: DepsAvis): Promise<{ brute: string; ecran: Signature }> {
  const brute = await (deps.signatureBrute ?? signatureHtmlDeGestion)().catch(() => '');
  if (brute.trim() === '') return { brute: '', ecran: { html: '', texte: '' } };
  return { brute, ecran: { html: signaturePourEcran(brute), texte: htmlVersTexte(brute) } };
}

/** Le logement d'une occupation : adresse complète, propriétaire, « en gestion ». `null` : occupation inconnue. */
async function logementDe(occupationId: number): Promise<{ lotId: number; adresse: string; proprietaire: string | null; enGestion: boolean } | null> {
  const bail = await lireBail(occupationId);
  if (bail === null) return null;
  const { rows } = await query<{ s: string }>(`SELECT ${await sqlStatutBien('lo')} AS s FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [bail.lotId]);
  return { lotId: bail.lotId, adresse: bail.adresse ?? `Bien ${bail.lotId}`, proprietaire: bail.proprietaire, enGestion: rows[0]?.s === 'en_gestion' };
}

/** Les locataires de ces occupations, avec leur prénom éventuel et leurs adresses e-mail EN VIGUEUR. */
async function locatairesAvis(occupationIds: readonly number[]): Promise<(LocataireAvis & { entree: string | null; sortie: string | null })[]> {
  const vivante = await conditionCoordonneeVivante('c');
  const { rows } = await query<{ occupation_id: string; nom: string; prenom: string | null; entree: string | null; sortie: string | null; emails: string[] }>(
    `SELECT o.id::text AS occupation_id, l.nom, l.prenom, o.entree::text, o.sortie::text,
            array(SELECT coalesce(nullif(btrim(c.valeur_brute), ''), c.valeur) FROM gestion_annuaire_contact c
                   WHERE c.sujet = 'locataire' AND c.sujet_id = l.id AND c.sorte = 'email' AND c.absent_le IS NULL${vivante}
                   ORDER BY c.rang NULLS LAST, c.id) AS emails
       FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE o.id = ANY($1::bigint[]) ORDER BY l.nom_normalise, o.id`, [[...occupationIds]]);
  return rows.map((r) => ({ occupationId: Number(r.occupation_id), nom: r.nom, prenom: r.prenom, entree: r.entree, sortie: r.sortie,
    emails: (r.emails ?? []).filter((e): e is string => typeof e === 'string') }));
}

export type IssueApercuPreavis =
  | { etat: 'ok'; data: { mails: MailAvis[]; sansEmail: string[]; enGestion: boolean; dateFin: string; envoiPossible: boolean;
    /** 🔴 Arno (05/11/2026) — les partenaires de la liste « Préavis » (la case « Informer nos partenaires ») ; vide : pas de case. */
    partenaires: Destinataire[] } }
  | { etat: 'refus'; motif: string }
  | { etat: 'inconnu' };

async function donneesPreavis(
  d: { occupationIds: readonly number[]; recuLe: unknown; choix: ModePreavis | null }, auteur: Auteur, deps: DepsAvis, informerPartenaires = true,
): Promise<{ etat: 'ok'; donnees: DonneesPreavisMails; lotId: number; brute: string; dateFin: string; partenaires: Destinataire[] } | { etat: 'refus'; motif: string } | { etat: 'inconnu' }> {
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Cochez au moins un locataire.' };
  const logement = await logementDe(ids[0]);
  if (logement === null) return { etat: 'inconnu' };
  const locs = await locatairesAvis(ids);
  if (locs.length !== ids.length) return { etat: 'inconnu' };
  if (locs.some((l) => l.sortie !== null)) return { etat: 'refus', motif: 'Un des locataires cochés est déjà sorti du logement.' };
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  const v = verifierPreavis({ recuLe: d.recuLe, choix: d.choix, entrees: locs.map((l) => l.entree) }, rows[0].j);
  if (!v.ok) return { etat: 'refus', motif: v.motif };
  const config = await chargerConfigGestion();
  const valideur = await emailDeLAuteur(auteur);
  const sig = await signatureEcran(deps);
  // 🔴 Arno (05/11/2026, 460) — les partenaires : la liste « Préavis » de « Paramètres Location » (bien hors gestion : aucun) ; case décochée : aucun.
  const partenaires = logement.enGestion ? await lireDestinatairesDefaut('preavis') : [];
  return {
    etat: 'ok', lotId: logement.lotId, brute: sig.brute, dateFin: v.dateMax, partenaires,
    donnees: {
      adresse: logement.adresse, proprietaire: logement.proprietaire, enGestion: logement.enGestion,
      partenaires: informerPartenaires ? partenaires.map((x) => x.adresse) : [],
      locataires: locs.map(({ occupationId, nom, prenom, emails }) => ({ occupationId, nom, prenom, emails })),
      recuLe: d.recuLe as string, choix: d.choix as ModePreavis, expediteur: config.adresseGestion, valideur, signature: sig.ecran,
    },
  };
}

/** L'APERÇU des mails du préavis, en lecture : rien n'est écrit, rien ne part. */
export async function apercuMailsPreavis(
  d: { occupationIds: readonly number[]; recuLe: unknown; choix: ModePreavis | null }, auteur: Auteur, deps: DepsAvis = {},
): Promise<IssueApercuPreavis> {
  const lu = await donneesPreavis(d, auteur, deps);
  if (lu.etat !== 'ok') return lu;
  const { mails, sansEmail } = mailsDuPreavis(lu.donnees);
  return { etat: 'ok', data: { mails, sansEmail, enGestion: lu.donnees.enGestion, dateFin: lu.dateFin, envoiPossible: await mailsAvisDisponibles(), partenaires: lu.partenaires } };
}

/** Ce que l'écran dit de chaque mail, après l'envoi. */
export interface EnvoiAvis { sorte: MailAvis['sorte']; objet: string; a: string[]; cc: string[]; envoye: boolean; motif: string | null }

async function journaliserAvis(m: MailAvis, o: { lotId: number; occupationIds: readonly number[]; auteur: Auteur; statut: 'envoye' | 'echec'; erreur: string | null; messageId: string | null }): Promise<void> {
  try {
    await query(
      `INSERT INTO gestion_location_mail_avis (sorte, lot_id, occupation_ids, expediteur, destinataires, copies, objet, texte, html, statut, erreur, message_id, auteur_id, auteur_libelle)
       VALUES ($1, $2, $3::bigint[], $4, $5::text[], $6::text[], $7, $8, $9, $10, $11, $12, $13, $14)`,
      [m.sorte, o.lotId, [...o.occupationIds], m.de, m.a, m.cc, m.objet, m.texte, m.html, o.statut, o.erreur, o.messageId, o.auteur.id, o.auteur.libelle]);
  } catch (e) {
    console.error('[location] journal du mail « %s » impossible', m.sorte, (e as Error)?.message);
  }
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6)`,
      [o.lotId, `location_mail_${m.sorte}`, o.statut,
        `${m.objet} — à : ${m.a.join(', ')}${m.cc.length > 0 ? ` — cc : ${m.cc.join(', ')}` : ''}${o.erreur ? ` — non envoyé : ${o.erreur}` : ''}`,
        o.auteur.id, o.auteur.libelle]);
  } catch (e) {
    console.error('[location] journal du bien (mail « %s ») impossible', m.sorte, (e as Error)?.message);
  }
}

/**
 * ENVOIE une série de mails, dans l'ordre, chacun une seule fois ; chaque issue est journalisée. Ne lève jamais. La signature
 * part avec ses images INCORPORÉES (`cid:`) ; une image introuvable est retirée, jamais un carré barré.
 */
async function envoyerSerie(mails: readonly MailAvis[], brute: string, o: { lotId: number; occupationIds: readonly number[]; auteur: Auteur }, deps: DepsAvis): Promise<EnvoiAvis[]> {
  const issues: EnvoiAvis[] = [];
  for (const m of mails) {
    const base = { sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc };
    try {
      const domaine = m.de.split('@')[1] ?? 'criterimmo.fr';
      const alea = randomBytes(12).toString('hex');
      const messageId = fabriquerMessageId(domaine, alea, new Date());
      const rangs = adressesSignature(brute).map((_, i) => i);
      const images = rangs.length === 0 ? [] : (await (deps.imagesSignature ?? imagesSignaturePourEnvoi)(rangs, domaine, alea).catch(() => ({ images: [] }))).images;
      const html = corpsPourEnvoi(m.html, images).html;
      const r = await (deps.transport ?? transportParDefaut()).envoyer({
        de: m.de, deNom: 'Gestion', a: m.a, cc: m.cc, cci: [], objet: m.objet, corps: m.texte, corpsHtml: html, messageId,
        ...(images.length > 0 ? { imagesIntegrees: images.map(({ cid, nom, typeMime, octets }) => ({ cid, nom, typeMime, octets })) } : {}),
      });
      await journaliserAvis({ ...m, html }, { ...o, statut: r.ok ? 'envoye' : 'echec', erreur: r.ok ? null : r.motif, messageId: r.ok ? messageId : null });
      issues.push({ ...base, envoye: r.ok, motif: r.ok ? null : r.motif });
    } catch (e) {
      const motif = (e as Error)?.message || 'erreur inattendue';
      await journaliserAvis(m, { ...o, statut: 'echec', erreur: motif, messageId: null });
      issues.push({ ...base, envoye: false, motif });
    }
  }
  return issues;
}

export type IssueMailsAvis = { etat: 'ok'; envois: EnvoiAvis[] } | { etat: 'sans_schema'; motif: string } | { etat: 'echec'; motif: string };

/**
 * LES MAILS DU PRÉAVIS, APRÈS son enregistrement (l'appelant ne nous appelle que si le préavis est écrit). Mêmes données
 * que l'aperçu : ce qui part est ce qui a été montré. Ne lève jamais.
 */
export async function envoyerMailsPreavis(
  d: { occupationIds: readonly number[]; recuLe: unknown; choix: ModePreavis | null }, auteur: Auteur, deps: DepsAvis = {}, informerPartenaires = true,
): Promise<IssueMailsAvis> {
  try {
    if (!(await mailsAvisDisponibles())) return { etat: 'sans_schema', motif: MOTIF_SANS_457 };
    const lu = await donneesPreavis(d, auteur, deps, informerPartenaires);
    if (lu.etat !== 'ok') return { etat: 'echec', motif: lu.etat === 'refus' ? lu.motif : 'Logement introuvable : aucun mail n’est parti.' };
    const { mails } = mailsDuPreavis(lu.donnees);
    return { etat: 'ok', envois: await envoyerSerie(mails, lu.brute, { lotId: lu.lotId, occupationIds: d.occupationIds, auteur }, deps) };
  } catch (e) {
    return { etat: 'echec', motif: (e as Error)?.message || 'erreur inattendue' };
  }
}

/**
 * LE MAIL D'INFORMATION DE LA SORTIE À ADHOC, APRÈS l'écriture de la sortie (et après le compte rendu déjà en place, qui ne
 * change pas). Bien hors gestion : rien. Ne lève jamais.
 */
export async function envoyerMailSortieAdhoc(f: SortieFaite, auteur: Auteur, deps: DepsAvis & { maintenant?: Date } = {}, informerPartenaires = true): Promise<IssueMailsAvis> {
  try {
    if (!informerPartenaires) return { etat: 'ok', envois: [] }; // 🔴 Arno (05/11/2026) — case « Informer nos partenaires » décochée
    if (!(await mailsAvisDisponibles())) return { etat: 'sans_schema', motif: MOTIF_SANS_457 };
    const { rows } = await query<{ s: string }>(`SELECT ${await sqlStatutBien('lo')} AS s FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [f.bail.lotId]);
    const enGestion = rows[0]?.s === 'en_gestion';
    if (!enGestion) return { etat: 'ok', envois: [] };
    const qui = await emailDeLAuteur(auteur);
    const config = await chargerConfigGestion();
    const sig = await signatureEcran(deps);
    // 🔴 Arno (05/11/2026, 460) — À : la liste « Sorties » de « Paramètres Location », dans l'ordre ; vide : aucun mail.
    const partenaires = (await lireDestinatairesDefaut('sortie')).map((x) => x.adresse);
    const m = mailAdhocSortie({ ...donneesMailSortie(f, qui, (deps.maintenant ?? new Date()).toISOString()), enGestion, expediteur: config.adresseGestion, signature: sig.ecran, partenaires });
    if (m === null) return { etat: 'ok', envois: [] };
    return { etat: 'ok', envois: await envoyerSerie([m], sig.brute, { lotId: f.bail.lotId, occupationIds: f.occupationIds, auteur }, deps) };
  } catch (e) {
    return { etat: 'echec', motif: (e as Error)?.message || 'erreur inattendue' };
  }
}

/**
 * ══ 🔴 Arno (05/11/2026) — UNE SEULE PORTE POUR TOUTES LES ENTRÉES QUI ENREGISTRENT UN PRÉAVIS ═══════════════════════════════
 * La tuile Location (écran de sortie) et la fiche commune de la Gestion appellent CETTE fonction, et elle seule : le préavis
 * d'abord (`enregistrerPreavis`, inchangé), PUIS — si l'écran a montré l'aperçu et que l'on a cliqué « Valider et envoyer »
 * (`envoyerMails`) — les mails, par `envoyerMailsPreavis`. Un préavis refusé n'envoie rien ; un mail en échec ne défait rien.
 */
export async function enregistrerPreavisAvecMails(
  d: { occupationIds: readonly number[]; recuLe: unknown; choix: ModePreavis | null; motif?: unknown }, auteur: Auteur,
  envoyerMails: boolean, deps: DepsAvis = {}, informerPartenaires = true,
): Promise<IssuePreavis<{ dateMax: string; preavis: number }> & { mails?: { etat: 'ok'; envois: EnvoiAvis[] } | { etat: 'sans_schema' | 'echec'; motif: string } }> {
  const r = await enregistrerPreavis(d, auteur);
  if (r.etat !== 'ok' || !envoyerMails) return r;
  const m = await envoyerMailsPreavis({ occupationIds: d.occupationIds, recuLe: d.recuLe, choix: d.choix }, auteur, deps, informerPartenaires);
  return { ...r, mails: m.etat === 'ok' ? { etat: 'ok', envois: m.envois } : { etat: m.etat, motif: m.motif } };
}

/**
 * 🔴 Arno (05/11/2026) — LE PICTO « i » à côté du choix « informer nos partenaires » : les adresses configurées dans « Paramètres
 * Location > Destinataires mails » pour CE type d'action, lues au moment de l'affichage — « Destinataires » (la liste, dans l'ordre)
 * et « En copie » (préavis, sortie : gestion@ + la personne connectée ; nouvelle location : sa copie personnelle). Lecture seule.
 */
export async function destinatairesPourInfo(sorte: 'nouvelle_location' | 'preavis' | 'sortie', auteur: Auteur): Promise<{ destinataires: Destinataire[]; copies: Destinataire[] }> {
  const destinataires = await lireDestinatairesDefaut(sorte);
  const qui = await emailDeLAuteur(auteur);
  const vous = qui.email === null ? [] : [{ adresse: qui.email, libelle: sorte === 'nouvelle_location' ? `Vous (${qui.nom}) · copie personnelle` : `Vous (${qui.nom})` }];
  const copies = sorte === 'nouvelle_location' ? vous : [{ adresse: (await chargerConfigGestion()).adresseGestion, libelle: 'Service gestion' }, ...vous];
  const vues = new Set<string>();
  return { destinataires, copies: copies.filter((c) => { const k = c.adresse.toLowerCase(); if (vues.has(k)) return false; vues.add(k); return true; }) };
}

/**
 * 🔴 Arno (05/11/2026, 460) — LES PARTENAIRES À INFORMER pour la sortie d'un logement (la case « Informer nos partenaires » de l'écran de sortie) :
 * la liste « Sorties » de « Paramètres Location » si le bien est EN GESTION ; hors gestion : aucun (la case n'apparaît pas). Lecture seule.
 */
export async function partenairesDeSortie(occupationId: number): Promise<{ enGestion: boolean; liste: Destinataire[] } | null> {
  const logement = await logementDe(occupationId);
  if (logement === null) return null;
  return { enGestion: logement.enGestion, liste: logement.enGestion ? await lireDestinatairesDefaut('sortie') : [] };
}

/** Un mail de préavis ou de sortie, tel que l'Historique du bien le montre. */
export interface MailAvisDuBien {
  id: number; sorte: MailAvis['sorte']; quand: string; par: string; a: string[]; cc: string[]; objet: string; texte: string; statut: 'envoye' | 'echec';
}

/**
 * ══ 🔴 Arno (05/11/2026) — LES MAILS DE PRÉAVIS ET DE SORTIE D'UN BIEN, POUR SON HISTORIQUE ═════════════════════════════════
 * Lus dans LEUR journal (migration 457), PAR LE BIEN (`lot_id`, posé à l'envoi) — JAMAIS par une adresse : l'adresse d'ADHOC
 * (gestion.criterimmo@gmail.com) reste un contact tiers, rattaché à AUCUN bien (règle d'Arno du 26/10/2026) ; aucun contact,
 * aucun rattachement n'est écrit pour elle. Du plus récent au plus ancien. Sans la 457 : aucun. Lecture seule.
 */
export async function mailsAvisDuBien(lotId: number): Promise<MailAvisDuBien[]> {
  if (!Number.isSafeInteger(lotId) || lotId <= 0 || !(await mailsAvisDisponibles())) return [];
  const { rows } = await query<{ id: string; sorte: MailAvis['sorte']; quand: string; par: string; a: string[]; cc: string[]; objet: string; texte: string; statut: 'envoye' | 'echec' }>(
    `SELECT id::text, sorte, envoye_le::text AS quand, auteur_libelle AS par, destinataires AS a, copies AS cc, objet, texte, statut
       FROM gestion_location_mail_avis WHERE lot_id = $1 ORDER BY envoye_le DESC, id DESC LIMIT 200`, [lotId]);
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
