import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { lireDestinatairesDefaut } from './mailNouvelleLocationRepo';
import { adressesUniques, mailAdhocSortie, type MailAvis } from './mailsPreavisSortie';
import {
  envoyerSerie, logementDe, mailsAvisDisponibles, MOTIF_SANS_457, proprietairesDuMailDisponible, signatureEcran, type DepsAvis, type EnvoiAvis,
} from './mailsPreavisSortieRepo';
import { donneesMailSortie, encartDuBail, enregistrerSortie, lireBail, sortiePrevue } from './sortieLocatairesRepo';
import { verifierSortie } from './sortieLocataires';
import {
  alertesDuCompteRendu, cleLocataire, cleProprietaire, mailsValidationSortie, verifierValidation, type PartieSortie,
} from './validationSortie';

/**
 * ══ 🔴🔴 « VALIDER L'ÉTAT DES LIEUX DE SORTIE » — LE SERVEUR (spec d'Arno du 11/11/2026, lot 4). IMPUR (base + envoi). ═══════════════════════
 *
 * Règles et textes : `validationSortie.ts`. Ici : les parties du bail et leurs coordonnées (l'encart du logement, comme l'écran), le contrôle
 * de la saisie (`verifierValidation` puis les bornes du bail, `verifierSortie`), l'APERÇU (lecture seule, rien n'est écrit, rien ne part),
 * puis la VALIDATION : 🔴 un compte rendu qui porte les coordonnées d'une autre partie est REFUSÉ avant toute écriture ; sinon la sortie
 * (`enregistrerSortie`, inchangée : le logement devient libre si tous les locataires partent), PUIS les mails — un par destinataire coché,
 * puis la copie interne (gestion@ et la personne qui valide — elle tient lieu du récapitulatif interne de la sortie), et, comme avant,
 * l'information à nos partenaires (bien en gestion, case « Informer nos partenaires » cochée).
 * Chaque mail est journalisé (457) avec son bien, ses locataires et ses propriétaires (467) : il entre dans leurs historiques.
 * Sans la 467 : REFUS, rien n'est enregistré (l'écran de sortie reste disponible).
 */

export const MOTIF_SANS_467 = 'La validation de la sortie avec compte rendu demande la mise à jour de la base (migration 467) : rien n’est enregistré. L’écran de sortie reste disponible.';

export interface DemandeValidation {
  occupationId: number;
  realise: unknown;
  date: unknown;
  sortants: readonly number[];
  compteRendu: unknown;
  /** Les clés des parties cochées (`loc-<occupation>`, `pro-<propriétaire>`). */
  destinataires: readonly string[];
  informerPartenaires: boolean;
}

/** Les parties du bail (locataires en place, puis propriétaires), avec LEURS coordonnées. `null` : bail inconnu. */
export async function partiesDuBail(occupationId: number): Promise<PartieSortie[] | null> {
  const e = await encartDuBail(occupationId);
  if (e === null) return null;
  const c = e.coordonnees;
  const locataires: PartieSortie[] = (c?.locataires ?? []).map((l) => ({
    cle: cleLocataire(l.occupationId), famille: 'locataire', nom: l.nom, prenom: l.prenom ?? null, emails: l.emails, telephones: l.telephones, occupationId: l.occupationId,
  }));
  const proprietaires: PartieSortie[] = (c?.proprietaires ?? (e.proprietaire ? [{ id: e.proprietaire.id, nom: e.proprietaire.nom, telephones: c?.proprietaire?.telephones ?? [], emails: c?.proprietaire?.emails ?? [] }] : []))
    .map((p) => ({ cle: cleProprietaire(p.id), famille: 'proprietaire', nom: p.nom, prenom: null, emails: p.emails, telephones: p.telephones, proprietaireId: p.id }));
  return [...locataires, ...proprietaires];
}

/** Un mail prévu, tel que le récapitulatif le montre (texte intégral) — et à qui il est destiné. */
export interface MailPrevuSortie { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; cle: string | null; famille: 'locataire' | 'proprietaire' | 'interne' | 'partenaires' }

type Preparation = {
  etat: 'ok';
  mails: { mail: MailAvis; prevu: MailPrevuSortie; occupationIds: number[]; proprietaireIds: number[] }[];
  alertes: ReturnType<typeof alertesDuCompteRendu>;
  sansEmail: string[];
  vacant: boolean;
  restants: string[];
  enGestion: boolean;
  lotId: number;
  brute: string;
  date: string;
  sortants: number[];
};

async function preparer(d: DemandeValidation, auteur: Auteur, deps: DepsAvis): Promise<Preparation | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' }> {
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_457 };
  if (!(await proprietairesDuMailDisponible())) return { etat: 'refus', motif: MOTIF_SANS_467 };
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  const jour = rows[0].j;
  const sortants = [...new Set(d.sortants)];
  const v = verifierValidation({ realise: d.realise, date: d.date, sortants, compteRendu: d.compteRendu }, jour);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const bail = await lireBail(d.occupationId);
  const logement = bail === null ? null : await logementDe(d.occupationId);
  const parties = bail === null ? null : await partiesDuBail(d.occupationId);
  if (bail === null || logement === null || parties === null) return { etat: 'inconnu' };
  const vs = verifierSortie(bail, sortants, d.date, jour);
  if (!vs.ok) return { etat: 'refus', motif: vs.motif, champ: 'date' };
  const date = d.date as string;
  const compteRendu = typeof d.compteRendu === 'string' ? d.compteRendu.trim() : '';
  // Seules les parties DU BAIL peuvent être cochées : une clé inconnue est ignorée (jamais une adresse venue de la requête).
  const choisies = parties.filter((p) => d.destinataires.includes(p.cle));
  const prevue = sortiePrevue(bail, sortants, date);
  const qui = await emailDeLAuteur(auteur);
  const config = await chargerConfigGestion();
  const sig = await signatureEcran(deps);
  const internes = adressesUniques([config.adresseGestion, qui.email]);
  const parQui = new Map(parties.map((p) => [p.cle, p]));
  const sortantsP = sortants.map((o) => parQui.get(cleLocataire(o))).filter((p): p is PartieSortie => p !== undefined);
  const m = mailsValidationSortie({ adresse: logement.adresse, date, compteRendu, vacant: prevue.vacant, copropriete: logement.copropriete, destinataires: choisies,
    sortants: sortantsP.length > 0 ? sortantsP : prevue.sortants.map((l) => ({ nom: l.nom, prenom: null })), expediteur: config.adresseGestion, qui, signature: sig.ecran, internes });
  const tousProprios = parties.flatMap((p) => (p.proprietaireId !== undefined ? [p.proprietaireId] : []));
  const prevus: Preparation['mails'] = m.parties.map(({ partie, mail }) => ({
    mail, prevu: { sorte: mail.sorte, objet: mail.objet, a: mail.a, cc: mail.cc, texte: mail.texte, cle: partie.cle, famille: partie.famille },
    // L'historique de CE destinataire (et du bien) : un locataire par son occupation, un propriétaire par son identifiant.
    occupationIds: partie.occupationId !== undefined ? [partie.occupationId] : [], proprietaireIds: partie.proprietaireId !== undefined ? [partie.proprietaireId] : [],
  }));
  if (m.interne !== null) {
    prevus.push({ mail: m.interne, prevu: { sorte: m.interne.sorte, objet: m.interne.objet, a: m.interne.a, cc: [], texte: m.interne.texte, cle: null, famille: 'interne' },
      occupationIds: prevue.occupationIds, proprietaireIds: tousProprios });
  }
  // Comme avant (« Valider la sortie ») : l'information à nos partenaires, bien en gestion, case cochée — sans copie d'aucun mail de départ.
  if (d.informerPartenaires && logement.enGestion) {
    const partenaires = (await lireDestinatairesDefaut('sortie')).map((x) => x.adresse);
    const adhoc = mailAdhocSortie({ ...donneesMailSortie(prevue, qui, new Date().toISOString()), enGestion: true, expediteur: config.adresseGestion, signature: sig.ecran, partenaires });
    if (adhoc !== null) {
      prevus.push({ mail: adhoc, prevu: { sorte: adhoc.sorte, objet: adhoc.objet, a: adhoc.a, cc: adhoc.cc, texte: adhoc.texte, cle: null, famille: 'partenaires' },
        occupationIds: prevue.occupationIds, proprietaireIds: [] });
    }
  }
  return { etat: 'ok', mails: prevus, alertes: alertesDuCompteRendu(compteRendu, choisies, parties), sansEmail: m.sansEmail, vacant: prevue.vacant,
    restants: prevue.restants, enGestion: logement.enGestion, lotId: logement.lotId, brute: sig.brute, date, sortants };
}

export type IssueApercuValidation =
  | { etat: 'ok'; data: { mails: MailPrevuSortie[]; alertes: { cle: string; libelle: string; phrase: string }[]; sansEmail: string[]; vacant: boolean; enGestion: boolean; date: string } }
  | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' };

/** L'APERÇU, pour le récapitulatif : rien n'est écrit, rien ne part. */
export async function apercuValidationSortie(d: DemandeValidation, auteur: Auteur, deps: DepsAvis = {}): Promise<IssueApercuValidation> {
  const p = await preparer(d, auteur, deps);
  if (p.etat !== 'ok') return p;
  return { etat: 'ok', data: { mails: p.mails.map((x) => x.prevu), alertes: p.alertes.map(({ cle, libelle, phrase }) => ({ cle, libelle, phrase })), sansEmail: p.sansEmail,
    vacant: p.vacant, enGestion: p.enGestion, date: p.date } };
}

export type IssueValidation =
  | { etat: 'ok'; data: { date: string; vacant: boolean; restants: string[]; reintegrations?: string[]; envois: (EnvoiAvis & { famille: MailPrevuSortie['famille'] })[];
 } }
  | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' };

/**
 * LA VALIDATION. 🔴 Coordonnées d'un tiers dans le compte rendu : REFUS, rien n'est écrit. Puis la sortie ; puis chaque mail (un par
 * destinataire, chacun journalisé pour SON historique), la copie interne ; un mail en échec ne défait rien et est rendu tel quel.
 */
export async function validerSortieEdls(d: DemandeValidation, auteur: Auteur, deps: DepsAvis = {}): Promise<IssueValidation> {
  const p = await preparer(d, auteur, deps);
  if (p.etat !== 'ok') return p;
  if (p.alertes.length > 0) {
    return { etat: 'refus', motif: `${p.alertes.map((a) => `Mail à ${a.libelle} — ${a.phrase}`).join(' ')} Corrigez le compte rendu : rien n’est enregistré ni envoyé.`, champ: 'compteRendu' };
  }
  const r = await enregistrerSortie({ occupationId: d.occupationId, sortants: p.sortants, date: p.date }, auteur);
  if (r.etat !== 'ok') return r.etat === 'refus' ? { etat: 'refus', motif: r.motif } : { etat: 'inconnu' };
  const envois: (EnvoiAvis & { famille: MailPrevuSortie['famille'] })[] = [];
  for (const x of p.mails) {
    const [e] = await envoyerSerie([x.mail], p.brute, { lotId: p.lotId, occupationIds: x.occupationIds, auteur, proprietaireIds: x.proprietaireIds }, deps);
    envois.push({ ...e, famille: x.prevu.famille });
  }
  // Le compte rendu de l'état des lieux, au journal du bien (auditable, même sans mail).
  const cr = typeof d.compteRendu === 'string' ? d.compteRendu.trim() : '';
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'location_edls_realise', $2, $3, $4, $5)`,
    [p.lotId, p.date, `état des lieux de sortie réalisé le ${p.date} — ${cr === '' ? 'aucun compte rendu saisi' : `compte rendu : ${cr}`}`, auteur.id, auteur.libelle],
  ).catch((e: unknown) => console.error('[location] journal de l’état des lieux réalisé impossible', (e as Error)?.message));
  return { etat: 'ok', data: { date: r.data.date, vacant: r.data.vacant, restants: r.data.restants,
    ...((r.data.reintegrations ?? []).length > 0 ? { reintegrations: r.data.reintegrations } : {}), envois } };
}
