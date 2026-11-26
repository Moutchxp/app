'use client';

import { ContactsSyndicCopropriete } from './ContactsSyndicCopropriete';
import { useEffect, useId, useRef, useState } from 'react';
import type { ModeleOfficiel } from '../../../../lib/adresse/officielleCopro';
import { createPortal } from 'react-dom';
import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { AgCopropriete, AgFicheNouvelle } from './AgCopropriete';
import { ArreteComptes, ArreteComptesLocal } from './ArreteComptes';
import { dateFr, type SaisiePv } from '../../../../lib/location/agCopropriete';
import { arreteEnLettres } from '../../../../lib/location/arreteComptes';
import { trierAdresses } from '../../../../lib/gestion/ordreAdresses';
import { CSS_DIGICODES_COPRO, DigicodesCopropriete, digicodesModifies, motValeur, refusDigicodes, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import { FicheSyndic } from './FicheSyndic';
import { questionConflitParcelle } from '../../../../lib/gestion/conflitParcelle';
import type { ApercuEnvoi, IssueEnvoi } from '../../../../lib/gestion/digicodesEnvoi';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE, type ChoixAdresse } from './ChampAdresseBan';
import { lienCarte, type ExamenAdresse } from '../../../../lib/gestion/adresseCoproExamenModele';
import { LIBELLE_NON_DEPLACER, libelleOuiDeplacer, motifPrincipaleAilleurs, nomCopropriete, texteConflit, type ConflitAdresse } from '../../../../lib/gestion/adresseCoproExclusivite';
import { CONSEQUENCE_BIENS, LIBELLE_DEFINIR_PRINCIPALE, MOTIF_PRINCIPALE_NON_RETIRABLE, LIBELLE_OUI_RETIRER_ADRESSE, LIBELLE_RETIRER_ADRESSE, resumeAdresse } from '../../../../lib/gestion/adresseCoproGestes';
import {
  ALERTE_DESACCORD, adresseSansNumero, estHorsCopropriete, nomAffiche, texteSansNumero, titreFicheCopropriete, TITRE_SANS_NUMERO, type FicheCopropriete as Fiche,
} from '../../../../lib/gestion/copropriete';
import { adresseImmeuble, cleCoordonnee, cleImmeuble, cleNom, libelleCategorieImmeuble, lignesDoublonCoordonnee, nomAvecVille, quiPorte, type CategorieImmeuble, type CoordonneeConnue, type SyndicResume } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴🔴 LA FICHE COPROPRIÉTÉ — LA FENÊTRE (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 2) ═══════════════════════════════════════════
 * Ouverte par le bouton « Copropriété » (ou « Bien hors copropriété ») de la carte du bien, juste sous celui du syndic. Elle montre et modifie ce
 * qui appartient à la COPROPRIÉTÉ, jamais au syndic : son nom, « hors copropriété » (l'immeuble entier), toutes ses adresses (« + » : celles de la
 * même parcelle, ou une autre), les digicodes de chaque adresse, les AG (lecture), le syndic lié (lien vers sa fiche, ses gestionnaires en lecture
 * seule ; rattacher ou changer), les habitants (Copropriétaire, Conseil syndical, Personnaliser) et les gardiens. Hors copropriété : ni syndic ni
 * AG. Les coordonnées des habitants sont à USAGE INTERNE : jamais visibles d'un autre habitant ou client (garde-fou des envois).
 * La fiche syndic n'est pas modifiée avant le lot 6 (accord d'Arno). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
const API = '/api/admin/gestion/coproprietes/fiche';
const CATEGORIES: { cle: CategorieImmeuble; mot: string }[] = [
  { cle: 'gardien', mot: 'Gardien' }, { cle: 'coproprietaire', mot: 'Copropriétaire' }, { cle: 'conseil_syndical', mot: 'Conseil syndical' }, { cle: 'personnalise', mot: 'Personnaliser' }];
interface Coord { id: number | null; sorte: 'email' | 'telephone'; libelle: string; valeur: string }
interface ContactEdit { cle: string; id: number | null; categorie: CategorieImmeuble; libelle: string; civilite: 'M.' | 'Mme' | null; prenom: string; nom: string; note: string; coordonnees: Coord[] }
interface Adresse { libelle: string; codePostal: string; commune: string;
  /** 🔴 (lot 7d) l'identifiant BAN du choix dans la liste (une NOUVELLE adresse) : le serveur n'accepte qu'une adresse officielle */
  banId?: string }
interface Proposition { libelle: string; codePostal: string; commune: string; parcelle: string; etat: 'libre' | 'prise'; copropriete: string | null; syndic: { id: number; nom: string; ville: string | null } | null }
/* 🔴 (Arno, 20/11/2026, « Adresse officielle BAN », lot 4) l'adresse officielle, calculée par le serveur (lecture seule) ; absente ou `null` : l'affichage d'avant */
interface Lu { fiche: Fiche | null; coproprieteDuBien: boolean | null; officielle?: ModeleOfficiel | null }
let n = 0;
const cleLocale = (): string => `c${++n}`;

const versEdition = (f: Fiche): ContactEdit[] => f.contacts.map((c) => ({ cle: cleLocale(), id: c.id, categorie: c.categorie, libelle: c.libelle ?? '',
  civilite: c.civilite === 'M.' || c.civilite === 'Mme' ? c.civilite : null, prenom: c.prenom ?? '', nom: c.nom ?? '', note: c.note ?? '',
  coordonnees: c.coordonnees.map((k) => ({ id: k.id, sorte: k.sorte, libelle: k.libelle ?? '', valeur: k.valeur })) }));
/**
 * 🔴 Arno (23/11/2026) — « lorsque je rentre des dates d'AG et que je veux valider la fiche pour valider sa mise à jour, il ne se passe rien, comme si
 * rien n'avait été enregistré » : les messages verts de la fiche. « Valider » sans rien de changé enregistre comme avant, et le dit.
 */
export const MOT_FICHE_ENREGISTREE = 'Fiche copropriété enregistrée.';
/** 🔴 (Arno, 26/11/2026, 12h23) le bouton du rattachement en deux temps, et ses messages. */
export const libelleValiderRattachement = (n: number): string => `Valider le rattachement des adresses à cette copropriété (${n})`;
export const MOT_ADRESSES_EN_ATTENTE = 'en attente de validation';
/** 🔴🔴 (Arno, 26/11/2026, 14h06) l'état d'une ligne d'ADRESSES : une seule présentation pour toutes les adresses */
export const ETAT_ADRESSE = { principale: 'Adresse principale', verifiee: '✓ Vérifiée', aVerifier: 'À vérifier', nouvelle: `Nouvelle — ${MOT_ADRESSES_EN_ATTENTE}`,
  biens: 'Adresse de biens de la copropriété' } as const;
export type EtatAdresse = keyof typeof ETAT_ADRESSE;
export const LIBELLE_VERIFIER = 'Vérifier';
export const motAdressesValidees = (n: number): string => `${n} adresse${n > 1 ? 's' : ''} rattachée${n > 1 ? 's' : ''} à la copropriété : chacune a son bloc dans DIGICODES.`;
export const motFermerAvecAttente = (n: number): string => `${n} adresse${n > 1 ? 's' : ''} rattachée${n > 1 ? 's' : ''} non validée${n > 1 ? 's' : ''} ${n > 1 ? 'seront perdues' : 'sera perdue'}.`;
export const MOT_AUCUNE_MODIFICATION = 'Aucune modification à enregistrer — les dates d’AG sont enregistrées dès leur ajout.';
export const motDateAgEnregistree = (jour: string): string => `Date d’AG du ${dateFr(jour)} enregistrée.`;
export const motArreteEnregistre = (a: { jour: number; mois: number } | null): string => (a === null ? 'Date d’arrêté des comptes effacée.' : `Date d’arrêté des comptes enregistrée : ${arreteEnLettres(a)}.`);
/** Ce que « Valider » enregistre, figé pour savoir si quelque chose a changé depuis l'ouverture (la clé locale des contacts n'en fait pas partie). PUR. */
const signatureSaisie = (x: { nom: string; hors: boolean; adresses: readonly Adresse[]; contacts: readonly ContactEdit[]; syndic: number | null; retrait: boolean }): string =>
  JSON.stringify({ nom: x.nom.trim(), hors: x.hors, adresses: x.adresses, contacts: x.contacts.map(({ cle: _c, ...c }) => c), syndic: x.syndic, retrait: x.retrait });
const nomContact = (c: Pick<ContactEdit, 'civilite' | 'prenom' | 'nom'>): string => [c.civilite, c.prenom.trim(), c.nom.trim().toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');
/** Ce qui manque pour valider un contact (`null` : rien). PUR. */
export function refusContact(c: ContactEdit, autres: readonly ContactEdit[] = [], immeuble = ''): string | null {
  if (c.categorie === 'personnalise' && c.libelle.trim() === '') return 'Précisez le statut personnalisé (Locataire, Femme de ménage…).';
  if (c.prenom.trim() === '' && c.nom.trim() === '') return 'Donnez au moins un nom ou un prénom.';
  // 🔴 (lot 6, repris de la fiche syndic) même NOM dans CET immeuble seulement : bloquant
  const n = cleNom(c.prenom, c.nom);
  const meme = autres.find((a) => a.cle !== c.cle && cleNom(a.prenom, a.nom) === n);
  if (meme !== undefined) return `Un contact nommé ${[meme.prenom.trim(), meme.nom.trim().toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ')} existe déjà dans l’immeuble ${immeuble}.`;
  return null;
}

/**
 * 🔴 (lot 6, repris de la fiche syndic) — les e-mails et téléphones DÉJÀ UTILISÉS (dans cet immeuble, ou ailleurs : syndics et immeubles,
 * lus par la route des doublons) : un AVERTISSEMENT, jamais un blocage — « Valider quand même ». Le contact lui-même n'est jamais compté. PUR.
 */
export function avertissementsContact(c: ContactEdit, autres: readonly ContactEdit[], ailleurs: readonly CoordonneeConnue[], immeuble: string): string[] {
  const out: string[] = [];
  for (const k of c.coordonnees) {
    const cle = cleCoordonnee(k.sorte, k.valeur);
    if (cle === '') continue;
    const qui = [
      ...autres.filter((a) => a.cle !== c.cle && a.coordonnees.some((x) => x.sorte === k.sorte && cleCoordonnee(x.sorte, x.valeur) === cle))
        .map((a) => [nomContact(a), libelleCategorieImmeuble(a.categorie, a.libelle), immeuble].filter((x) => x.trim() !== '').join(' · ')),
      ...ailleurs.filter((x) => x.sorte === k.sorte && x.cle === cle && !(x.proprietaire.genre === 'immeuble' && c.id !== null && x.proprietaire.contactId === c.id)
        && !(x.proprietaire.genre === 'immeuble' && autres.some((a) => a.id !== null && a.id === x.proprietaire.contactId)))
        .map((x) => quiPorte(x.proprietaire)),
    ];
    const uniques = [...new Set(qui)];
    if (uniques.length > 0) out.push(...lignesDoublonCoordonnee(k.sorte, k.valeur, uniques));
  }
  return out;
}

/** La saisie des digicodes après un changement dans les blocs AFFICHÉS : les blocs cachés (autres écritures) restent tels quels, et les blocs affichés
 *  reprennent leur adresse enregistrée (le titre officiel n'est qu'un affichage : rien d'autre n'est envoyé). PUR. */
export function remettreDigicodes(etat: readonly DigicodesAdresseSaisis[], affiches: readonly DigicodesAdresseSaisis[]): DigicodesAdresseSaisis[] {
  return etat.map((x) => { const n = affiches.find((y) => y.cle === x.cle); return n === undefined ? x : { ...n, voie: x.voie, codePostal: x.codePostal, commune: x.commune }; });
}

/**
 * 🔴🔴 (Arno, 26/11/2026, 11h58, point 2) « Une fois les adresses rattachées, je dois pouvoir rattacher un digicode pour chacune des adresses de la
 * copropriété, avec la possibilité pour chaque adresse d'ajouter des bâtiments / cages d'escalier avec un digicode pour chacun. » UN BLOC PAR ADRESSE de
 * la saisie (la principale, puis les rattachées, dans l'ordre de la liste ADRESSES), y compris une adresse « à vérifier » et AVANT le premier « Valider » :
 * un bloc déjà là garde sa saisie ; une adresse sans bloc en reçoit un vide (avant : les blocs venaient de la seule fiche enregistrée — une adresse
 * rattachée n'en avait aucun) ; le bloc d'une adresse retirée de la saisie s'en va avec elle. PUR.
 */
export function digicodesDesAdresses(etat: readonly DigicodesAdresseSaisis[], toutes: readonly Adresse[]): DigicodesAdresseSaisis[] {
  const vus = new Set<string>();
  const out: DigicodesAdresseSaisis[] = [];
  for (const a of toutes) {
    const cle = cleImmeuble(a.libelle);
    if (cle === '' || vus.has(cle)) continue;
    vus.add(cle);
    out.push(etat.find((d) => d.cle === cle) ?? { cle, voie: a.libelle, codePostal: a.codePostal || null, commune: a.commune || null,
      commun: { code: '', aucun: false }, communInitial: { code: '', aucun: false }, batiments: [] });
  }
  return out;
}

export function FicheCopropriete({ lotId, immeuble, onFerme }: { lotId?: number | null; immeuble?: string | null; onFerme: () => void }) {
  useVerrouDefilement();
  const titreId = useId();
  const [lu, setLu] = useState<Lu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // la saisie
  const [nom, setNom] = useState('');
  const [hors, setHors] = useState(false);
  const [adresses, setAdresses] = useState<Adresse[]>([]);
  const [contacts, setContacts] = useState<ContactEdit[]>([]);
  const [syndicChoisi, setSyndicChoisi] = useState<SyndicResume | null>(null);
  /* 🔴 (Arno, 20/11/2026) « Retirer le syndic » : PRÉPARÉ (appliqué à « Valider ») ; la confirmation à trois boutons */
  const [retraitSyndic, setRetraitSyndic] = useState(false);
  const [confirmerRetrait, setConfirmerRetrait] = useState(false);
  const [digi, setDigi] = useState<DigicodesAdresseSaisis[]>([]);
  /* 🔴🔴 (Arno, 23/11/2026) fiche NOUVELLE : la date d'arrêté des comptes et les AG officielles, GARDÉES ici et envoyées avec le premier « Valider »
     (tout ou rien) ; fermer sans valider : rien n'est écrit */
  const [arreteNouvelle, setArreteNouvelle] = useState<{ jour: number; mois: number } | null>(null);
  const [agsNouvelle, setAgsNouvelle] = useState<SaisiePv[]>([]);
  /* 🔴 (Arno, 23/11/2026) la saisie telle qu'à l'ouverture (ou au dernier enregistrement) : « Valider » sans changement le dit, sans requête */
  const [initiale, setInitiale] = useState<string | null>(null);
  // l'interface
  const [ajoutAdresse, setAjoutAdresse] = useState(false);
  /* 🔴🔴 (Arno, 26/11/2026, 11h58, point 3) « Je dois aussi pouvoir refermer les adresses proposées une fois que j'ai choisi celles que je voulais, car ça
     prend beaucoup de place, avec la possibilité de rouvrir les propositions si j'en ai besoin. » : `null` = la règle par défaut (ouvert tant qu'aucune
     adresse n'est rattachée, replié dès qu'il y en a une) ; un clic la remplace */
  const [propositionsOuvertes, setPropositionsOuvertes] = useState<boolean | null>(null);
  /* 🔴 (16/11/2026) « Une autre adresse » : UNIQUEMENT par les suggestions de la Base Adresse Nationale (ChampAdresseBan, le champ commun) —
     la frappe, et l'adresse retenue dans la liste (seule elle peut être ajoutée) */
  const [autre, setAutre] = useState('');
  const [autreChoisie, setAutreChoisie] = useState<ChoixAdresse | null>(null);
  const [autreBan, setAutreBan] = useState<string | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const idAutre = useId();
  const idPropositions = useId();
  /* 🔴 (16/11/2026) une adresse SANS NUMÉRO : la fenêtre d'avertissement (même style que celle des noms de bâtiment) ; les clés confirmées partent
     avec « Valider » (le serveur refuse sans elles) */
  const [sansNumero, setSansNumero] = useState<Adresse | null>(null);
  const [confirmeesSansNumero, setConfirmeesSansNumero] = useState<string[]>([]);
  /* 🔴🔴 (Arno, 26/11/2026, 11h58, point 1) « Il y a écrit à vérifier, mais je ne peux rien vérifier (lien mort). » : « à vérifier » ouvre l'examen de
     l'adresse (adresse officielle, parcelle, position) avec « Confirmer cette adresse » et « Retirer de la copropriété » ; les confirmations partent
     avec « Valider » (comme le « × ») et entrent dans l'historique de la copropriété */
  const [confirmees, setConfirmees] = useState<string[]>([]);
  const [examen, setExamen] = useState<{ cle: string; lu: ExamenAdresse | 'lecture' | { refus: string } } | null>(null);
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [rattacheeIci, setRattacheeIci] = useState(false);
  const [edition, setEdition] = useState<ContactEdit | null>(null);
  const [choixSyndic, setChoixSyndic] = useState(false);
  const [ficheSyndic, setFicheSyndic] = useState<number | null>(null);
  const [etape, setEtape] = useState<null | 'alerte' | 'conflit' | 'meme'>(null);
  const [memeTraite, setMemeTraite] = useState(false);

  const appliquer = (l: Lu): void => {
    setLu(l);
    const f = l.fiche;
    if (f === null) return;
    // la case : celle de la fiche ; une fiche encore à créer part de ce que dit le bien (« pas en copropriété » : cochée)
    const h = f.declaree ? f.horsCopropriete : l.coproprieteDuBien === false;
    const adr = f.adresses.filter((a) => !a.principale).map((a) => ({ libelle: a.libelle, codePostal: a.codePostal ?? '', commune: a.commune ?? '' }));
    const cts = versEdition(f);
    setNom(f.nom ?? ''); setHors(h);
    setAdresses(adr); setConfirmees([]); setExamen(null); deplacementsRef.current = {}; setDeplacements({});
    setContacts(cts);
    setInitiale(signatureSaisie({ nom: f.nom ?? '', hors: h, adresses: adr, contacts: cts, syndic: null, retrait: false })); setSyndicChoisi(null); setRetraitSyndic(false); setConfirmerRetrait(false); setDigi(saisieDigicodesInitiale(f));
    if (f.declaree) { setArreteNouvelle(null); setAgsNouvelle([]); }
  };
  useEffect(() => {
    let vivant = true;
    const p = lotId ? `lotId=${lotId}` : `immeuble=${encodeURIComponent(immeuble ?? '')}`;
    fetch(`${API}?${p}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu; message?: string }>)
      .then((d) => { if (!vivant) return; if (d.etat === 'ok' && d.data) appliquer(d.data); else setErreur(d.message ?? 'Lecture impossible.'); })
      .catch(() => { if (vivant) setErreur('Lecture impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [lotId, immeuble]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = lu?.fiche ?? null;
  const toutes: Adresse[] = f === null ? [] : [{ libelle: f.libelle, codePostal: f.codePostal ?? '', commune: f.commune ?? '' }, ...adresses];
  const signature = JSON.stringify(toutes);
  /* 🔴🔴 (Arno, 26/11/2026, 12h23, point 1) LE RATTACHEMENT EN DEUX TEMPS : « je voudrais pouvoir rattacher autant d'adresses que je veux et, une fois
     toutes les adresses voulues rattachées, valider l'ensemble avec un bouton « Valider le rattachement des adresses à cette copropriété » ; une fois
     validé, chacune des adresses a son bloc configurable dans la partie DIGICODES. » Une adresse de la saisie qui n'est pas (encore) une adresse
     ENREGISTRÉE de la copropriété est « en attente de validation » : pas de bloc de digicodes (dd2aa115 adapté : le bloc vient à la validation). */
  const enregistrees = new Set((f?.adresses ?? []).filter((a) => !a.principale).map((a) => a.cle));
  const enAttente = adresses.filter((a) => !enregistrees.has(cleImmeuble(a.libelle)));
  const validees: Adresse[] = f === null ? [] : [toutes[0], ...adresses.filter((a) => enregistrees.has(cleImmeuble(a.libelle)))];
  const signatureValidees = JSON.stringify(validees);
  // 🔴🔴 (Arno, 26/11/2026) un bloc de digicodes par adresse VALIDÉE (la principale, puis les rattachées dans l'ordre ADRESSES)
  useEffect(() => { if (f?.saisieDigicodes) setDigi((d) => digicodesDesAdresses(d, validees)); }, [signatureValidees, f?.saisieDigicodes]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fermerAttente, setFermerAttente] = useState(false);
  /* 🔴 (12h23) fermer avec des adresses en attente : on le demande d'abord (« N adresses rattachées non validées seront perdues ») */
  const fermer = (): void => { if (enAttente.length > 0) { setFermerAttente(true); return; } onFerme(); };
  // 🔴 (12h23) Échap passe par la même porte que « Fermer » (la question des adresses en attente)
  const fermerRef = useRef<() => void>(onFerme);
  fermerRef.current = fermer;
  // 🔴 (12h50) une fenêtre « Retirer cette adresse » / « adresse principale » ouverte : Échap la ferme, elle seule (jamais la fiche)
  const fenetreAdresseOuverte = useRef(false);
  /* 🔴 (lot 4) l'adresse officielle : chaque adresse enregistrée garde sa place dans la saisie (elle part toujours avec « Valider ») ; à l'écran, une adresse
     dont l'adresse officielle est déjà montrée devient une « écriture d'origine » (repliée, avec son « × »), une adresse officielle DIFFÉRENTE garde sa
     ligne sous son libellé officiel, et une adresse non rapprochée s'affiche comme avant */
  const off = lu?.officielle ?? null;
  const rangees = (() => {
    const montrees = new Set<string>(off === null ? [] : [off.principale.banId]);
    return adresses.map((a) => {
      const g = off?.adresses.find((x) => x.cles.includes(cleImmeuble(a.libelle))) ?? null;
      if (g === null) return { a, mode: 'normale' as const, libelle: adresseImmeuble(a.libelle, a.codePostal, a.commune), banId: null };
      if (montrees.has(g.banId)) return { a, mode: 'ecriture' as const, libelle: adresseImmeuble(a.libelle, a.codePostal, a.commune), banId: g.banId };
      montrees.add(g.banId);
      return { a, mode: 'officielle' as const, libelle: g.libelle, banId: g.banId };
    });
  })();
  /* 🔴 (Arno, 20/11/2026, lot 5) DIGICODES : un seul bloc par adresse officielle — celui de la première écriture de l'adresse (l'adresse principale d'abord),
     titré au libellé officiel ; les autres écritures de la même adresse ne font plus de bloc (leur saisie reste dans l'état, inchangée). Leurs codes
     connus identiques sont fusionnés (rien à dire) ; différents, ils sont tous gardés et listés « à trancher », avec leur écriture. */
  const groupeDe = (cle: string) => off?.adresses.find((g) => g.cles.includes(cle)) ?? null;
  const representants = new Map<string, string>(); // banId → clé du bloc affiché
  for (const d of digi) { const g = groupeDe(d.cle); if (g !== null && !representants.has(g.banId)) representants.set(g.banId, d.cle); }
  // 🔴🔴 (Arno, 26/11/2026, 13h30) le même ordre que la liste ADRESSES : la principale en tête, puis par rue et numéro croissant (trierAdresses)
  const clePrincipaleDigi = f === null ? '' : cleImmeuble(f.libelle);
  const digiFiltres = digi.filter((d) => { const g = groupeDe(d.cle); return g === null || representants.get(g.banId) === d.cle; });
  const digiAffiches = [...digiFiltres.filter((d) => d.cle === clePrincipaleDigi), ...trierAdresses(digiFiltres.filter((d) => d.cle !== clePrincipaleDigi), (d) => groupeDe(d.cle)?.court ?? d.voie)]
    .map((d) => {
      const g = groupeDe(d.cle);
      if (g === null) return d;
      // les biens qui LISENT ce bloc : ceux de toutes les écritures de l'adresse officielle (le 54 : 76, et non le seul bien de cette écriture)
      const memes = digi.filter((x) => groupeDe(x.cle)?.banId === g.banId);
      const somme = (f: (x: DigicodesAdresseSaisis) => number | undefined) => (memes.some((x) => f(x) !== undefined) ? memes.reduce((n, x) => n + (f(x) ?? 0), 0) : undefined);
      const communNb = somme((x) => x.communNb);
      return { ...d, voie: g.court, codePostal: g.codePostal, commune: g.commune, ...(communNb !== undefined ? { communNb } : {}),
        batiments: d.batiments.map((b) => { const nb = somme((x) => x.batiments.find((y) => y.libelle === b.libelle)?.nb); return nb !== undefined ? { ...b, nb } : b; }) };
    });
  const valeurDe = (e: { connu: boolean; valeur: { digicode: boolean | null; code: string | null } | null } | undefined) => (e?.connu && e.valeur ? motValeur(e.valeur) : null);
  const digicodesATrancher = digi.flatMap((d) => {
    const g = groupeDe(d.cle);
    const rep = g === null ? undefined : digi.find((x) => x.cle === representants.get(g.banId));
    if (g === null || rep === undefined || rep.cle === d.cle) return [];
    const places = [{ place: 'digicode copropriété', v: valeurDe(d.communEtat), r: valeurDe(rep.communEtat) },
      ...d.batiments.map((b) => ({ place: `bâtiment / cage ${b.libelle}`, v: valeurDe(b.etat), r: valeurDe(rep.batiments.find((y) => y.k === b.k)?.etat) }))];
    return places.filter((x) => x.v !== null && x.v !== x.r).map((x) => ({ adresse: g.libelle, place: x.place, valeur: x.v as string, ecriture: d.voie }));
  });
  /* 🔴 (Arno, 26/11/2026, 11h58) une adresse confirmée (enregistrée, ou à l'écran avant « Valider ») ne porte plus « à vérifier » */
  const dejaConfirmees = new Set([...(f?.adressesConfirmees ?? []), ...confirmees]);
  const examiner = async (a: Adresse): Promise<void> => {
    const cle = cleImmeuble(a.libelle);
    if (examen?.cle === cle) { setExamen(null); return; }
    setExamen({ cle, lu: 'lecture' });
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adresse-examiner', adresse: { libelle: a.libelle, codePostal: a.codePostal, commune: a.commune, banId: a.banId ?? null } }) });
      const d = (await r.json()) as { etat?: string; data?: ExamenAdresse; motif?: string };
      setExamen((x) => (x?.cle !== cle ? x : { cle, lu: d.etat === 'ok' && d.data ? d.data : { refus: d.motif ?? 'Examen impossible.' } }));
    } catch { setExamen((x) => (x?.cle !== cle ? x : { cle, lu: { refus: 'Examen impossible : le serveur n’a pas répondu.' } })); }
  };
  const panneauExamen = (a: Adresse, sorte: 'adresse' | 'principale' | 'biens' = 'adresse') => {
    const cle = cleImmeuble(a.libelle);
    if (examen?.cle !== cle) return null;
    const x = examen.lu;
    return (
      <div className="fcp-etape fcp-examen" role="group" aria-label={`Vérifier l’adresse ${a.libelle}`} data-fcp-examen={cle}>
        {x === 'lecture' ? <p className="loc-muet fcp-sans-marge">Lecture…</p> : 'refus' in x ? <p className="fcp-alerte fcp-sans-marge" role="alert">{x.refus}</p> : <>
          <p className="fcp-sans-marge" data-fcp-examen-ecrite><strong>Adresse :</strong> {x.ecrite}</p>
          <p className="fcp-sans-marge" data-fcp-examen-officielle><strong>Adresse officielle :</strong> {x.officielle ?? 'aucune adresse officielle retrouvée'}
            {' '}<span className="loc-muet fcp-petit">— {x.motif}</span></p>
          <p className="fcp-sans-marge" data-fcp-examen-parcelle><strong>Parcelle :</strong> {x.parcelle ?? 'inconnue'}</p>
          <p className="fcp-sans-marge" data-fcp-examen-position><strong>Position :</strong>{' '}
            {x.position !== null ? <a className="fcp-lien" href={lienCarte(x.position)} target="_blank" rel="noopener noreferrer" data-fcp-examen-carte>Voir sur la carte</a>
              : <span className="loc-muet">inconnue</span>}</p>
        </>}
        <div className="fcp-examen-gestes">
          {sorte !== 'biens' && (
            <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-mini" disabled={x === 'lecture'}
              onClick={() => { setConfirmees((l) => (l.includes(cle) ? l : [...l, cle])); setExamen(null); setInfo(null); }} data-fcp-confirmer-adresse>Confirmer cette adresse</button>)}
          {sorte === 'adresse' && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini"
              onClick={() => { if (enregistrees.has(cle)) { setExamen(null); setRetraitAdresse(cle); return; }
                setAdresses((l) => l.filter((y) => cleImmeuble(y.libelle) !== cle)); setConfirmees((l) => l.filter((y) => y !== cle)); setExamen(null); }} data-fcp-retirer-adresse>Retirer de la copropriété</button>)}
          <button type="button" className="fcp-lien" onClick={() => setExamen(null)} data-fcp-examen-fermer>Fermer</button>
        </div>
        {sorte === 'principale' && <p className="loc-muet fcp-petit fcp-sans-marge" data-fcp-examen-principale>{MOTIF_PRINCIPALE_NON_RETIRABLE}</p>}
        {sorte !== 'biens'
          ? <p className="loc-muet fcp-petit fcp-sans-marge">Le choix s’applique à « Valider » et entre dans l’historique de la copropriété.</p>
          : <p className="loc-muet fcp-petit fcp-sans-marge">Adresse connue par les biens de la copropriété : en lecture seule.</p>}
      </div>);
  };
  /* 🔴🔴 (Arno, 26/11/2026, 14h06) le « × » : TOUJOURS le dernier élément de la ligne. Une adresse ENREGISTRÉE (elle a son bloc de digicodes) : la fenêtre
     « Retirer cette adresse » (12h50) ; une adresse EN ATTENTE : retrait immédiat (elle quitte la sélection, sa case se décoche) — avant : une petite
     question « Retirer cette adresse ? Oui / Non » au milieu de la ligne */
  const retirer = (a: Adresse) => (
    <button type="button" className="fcp-retrait" aria-label={`Retirer ${a.libelle}`} disabled={envoi}
      onClick={() => { const k = cleImmeuble(a.libelle); if (enregistrees.has(k)) setRetraitAdresse(k); else { if (examen?.cle === k) setExamen(null); decocher(k); } }} data-fcp-retirer>×</button>);
  // les adresses de la même parcelle (proposées au « + »)
  useEffect(() => {
    if (f === null) return;
    let vivant = true;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'parcelle', adresses: toutes, cle: f.cle }) })
      .then((r) => r.json() as Promise<{ etat?: string; data?: Proposition[] }>).then((d) => { if (vivant && d.etat === 'ok') setPropositions(d.data ?? []); }).catch(() => { /* aucune proposition */ });
    return () => { vivant = false; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi && ficheSyndic === null && !choixSyndic && sansNumero === null && !fenetreAdresseOuverte.current) fermerRef.current(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, ficheSyndic, onFerme, sansNumero]);

  const clesIci = new Set(toutes.map((a) => cleImmeuble(a.libelle)));
  const libres = propositions.filter((p) => p.etat === 'libre' && !clesIci.has(cleImmeuble(p.libelle)));
  const prises = propositions.filter((p) => p.etat === 'prise' && !clesIci.has(cleImmeuble(p.libelle)));
  /* 🔴🔴 (Arno, 26/11/2026, 13h27) « voir toutes les propositions les unes en dessous des autres, qu'on puisse en sélectionner plusieurs d'un coup » : la liste
     cochable — toutes les propositions sauf les adresses déjà rattachées et VALIDÉES (une adresse en attente y reste, cochée) */
  const principaleCle = f === null ? '' : cleImmeuble(f.libelle);
  // 🔴🔴 (13h30) par rue, puis numéro croissant (trierAdresses, la fonction de la liste ADRESSES et des blocs DIGICODES)
  const proposees = trierAdresses(propositions.filter((p) => { const k = cleImmeuble(p.libelle); return k !== principaleCle && !enregistrees.has(k); }), (p) => p.libelle);
  const decocher = (cle: string): void => {
    setAdresses((l) => l.filter((y) => cleImmeuble(y.libelle) !== cle)); setConfirmees((l) => l.filter((y) => y !== cle));
    if (deplacementsRef.current[cle] !== undefined) { const { [cle]: _x, ...reste } = deplacementsRef.current; deplacementsRef.current = reste; setDeplacements(reste); }
  };
  const ajouter = (a: Adresse, confirmeSansNumero = false): boolean => {
    if (cleImmeuble(a.libelle) === '' || clesIci.has(cleImmeuble(a.libelle))) return false;
    if (adresseSansNumero(a.libelle) && !confirmeSansNumero) { setSansNumero(a); return false; }
    if (confirmeSansNumero) setConfirmeesSansNumero((l) => [...l, cleImmeuble(a.libelle)]);
    setAdresses((x) => [...x, a]); setRattacheeIci(true); setInfo(null);
    return true;
  };
  /** 🔴🔴 (Arno, 26/11/2026, 12h50, point 2) le rattachement CONTRÔLÉ : une adresse déjà portée par une autre copropriété ouvre la fenêtre du conflit ;
   *  sinon, l'ajout d'avant (le serveur contrôle de nouveau à l'enregistrement). Le serveur muet : l'ajout d'avant, contrôlé à l'enregistrement. */
  const rattacherControle = async (a: Adresse, apres?: () => void): Promise<void> => {
    if (f === null) return;
    const cle = cleImmeuble(a.libelle);
    if (cle === '' || clesIci.has(cle)) return;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adresse-conflit', immeuble: f.cle, adresse: { libelle: a.libelle, codePostal: a.codePostal, banId: a.banId ?? null } }) });
      const d = (await r.json()) as { etat?: string; data?: ConflitAdresse | null };
      if (d.etat === 'ok' && d.data) { setConflit({ a, c: d.data, apres: apres ?? (() => {}) }); return; }
    } catch { /* contrôlé à l'enregistrement */ }
    if (ajouter(a)) apres?.();
  };
  // les conflits : la copropriété reçoit un syndic, et une adresse de la parcelle est la copropriété d'un AUTRE syndic
  const conflits = syndicChoisi === null ? [] : prises.filter((p) => p.syndic !== null && p.syndic.id !== syndicChoisi.id);
  // 🔴 (lot 6, déplacé de la fiche syndic) « Même syndic : regrouper ? » : une adresse de la parcelle est la copropriété du MÊME syndic ; proposé
  // à une copropriété sans données propres (le serveur refuse sinon, rien n'est déplacé)
  const syndicVise = syndicChoisi?.id ?? (retraitSyndic ? null : f?.syndic?.id ?? null);
  const memeSyndic = f === null || syndicVise === null || (f.declaree && (f.contacts.length > 0 || (f.nom ?? '') !== '')) ? []
    : prises.filter((p) => p.syndic !== null && p.syndic.id === syndicVise && p.copropriete !== null);

  const [tenteDigi, setTenteDigi] = useState(false);
  /**
   * 🔴🔴 (Arno, 26/11/2026, 12h23, point 1) « Valider le rattachement des adresses à cette copropriété (N) » : l'enregistrement IMMÉDIAT des adresses de la
   * liste (la fiche est créée si elle n'existe pas encore ; chaque ajout est journalisé par le serveur), SANS rien d'autre de la saisie en cours : le nom
   * enregistré, ni contacts ni digicodes ni syndic (ils restent à l'écran, pour le « Valider » du bas). Une fiche nouvelle part avec ce que sa création
   * emporte (nom, « hors copropriété », arrêté des comptes et AG saisis : tout ou rien, comme le premier « Valider »). Ensuite, chaque adresse validée a
   * son bloc DIGICODES, et les propositions de la parcelle se replient.
   */
  /** 🔴 (Arno, 26/11/2026) après un geste IMMÉDIAT (rattachement validé, adresse retirée, adresse principale) : la fiche enregistrée remplace l'ancienne ;
   *  la saisie en cours (nom, contacts, digicodes saisis, syndic choisi) est gardée, et les adresses sont celles de la base. */
  const fusionnerFiche = (nouvelle: Fiche, officielle?: ModeleOfficiel | null): void => {
    const adr = nouvelle.adresses.filter((a) => !a.principale).map((a) => ({ libelle: a.libelle, codePostal: a.codePostal ?? '', commune: a.commune ?? '' }));
    setLu((l) => (l === null ? l : { ...l, fiche: nouvelle, ...(officielle !== undefined ? { officielle } : {}) }));
    setAdresses(adr);
    // les digicodes : la saisie en cours est gardée ; une adresse validée reçoit le bloc relu (ses codes déjà connus, s'il y en a)
    setDigi((dd) => saisieDigicodesInitiale(nouvelle).map((x) => dd.find((y) => y.cle === x.cle) ?? x));
    setInitiale(signatureSaisie({ nom: nouvelle.nom ?? '', hors: nouvelle.horsCopropriete, adresses: adr, contacts: versEdition(nouvelle), syndic: null, retrait: false }));
    setConfirmees([]); setExamen(null); deplacementsRef.current = {}; setDeplacements({});
  };
  /* 🔴🔴 (Arno, 26/11/2026, 12h50, point 1) « Retirer cette adresse » (fenêtre de confirmation) et « Définir comme adresse principale » : IMMÉDIATS,
     journalisés par le serveur ; la fiche est ensuite relue en entier (adresse officielle comprise) */
  const [retraitAdresse, setRetraitAdresse] = useState<string | null>(null);
  const [principaleVisee, setPrincipaleVisee] = useState<string | null>(null);
  /* 🔴🔴 (Arno, 26/11/2026, 12h50, point 2) une adresse déjà portée par une AUTRE copropriété : la fenêtre du conflit (au rattachement, ou rendue par le
     serveur à l'enregistrement) ; « Oui » note le déplacement confirmé (il part avec l'enregistrement, contrôlé de nouveau par le serveur) */
  const [conflit, setConflit] = useState<{ a: Adresse | null; c: ConflitAdresse; apres: () => void } | null>(null);
  const deplacementsRef = useRef<Record<string, string>>({});
  const [deplacements, setDeplacements] = useState<Record<string, string>>({});
  const noterDeplacement = (cle: string, autre: string): void => { deplacementsRef.current = { ...deplacementsRef.current, [cle]: autre }; setDeplacements(deplacementsRef.current); };
  const deplacementsAEnvoyer = (): string[] => Object.keys(deplacementsRef.current).filter((k) => adresses.some((a) => cleImmeuble(a.libelle) === k));
  fenetreAdresseOuverte.current = retraitAdresse !== null || principaleVisee !== null || conflit !== null;
  const gesteAdresse = async (action: 'adresse-retirer' | 'adresse-principale', cle: string, message: string): Promise<void> => {
    if (f === null) return;
    setEnvoi(true); setErreur(null); setInfo(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, immeuble: f.cle, adresseCle: cle }) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string; message?: string };
      if (d.etat !== 'ok' || !d.data) { setErreur(d.motif ?? d.message ?? 'Refusé.'); return; }
      const relue = await fetch(`${API}?immeuble=${encodeURIComponent(d.data.cle)}`, { cache: 'no-store' }).then((x) => x.json() as Promise<{ etat?: string; data?: Lu }>).catch(() => null);
      if (relue?.etat === 'ok' && relue.data?.fiche) fusionnerFiche(relue.data.fiche, relue.data.officielle ?? null); else fusionnerFiche(d.data, null);
      setInfo(message);
    } catch { setErreur('Le serveur n’a pas répondu. Rien n’a été modifié.'); } finally { setEnvoi(false); }
  };
  const validerRattachement = async (): Promise<void> => {
    if (f === null || enAttente.length === 0) return;
    const n = enAttente.length;
    setEnvoi(true); setErreur(null); setInfo(null);
    try {
      const corps = { action: 'enregistrer', immeuble: f.cle, nom: f.declaree ? f.nom : (nom.trim() === '' ? null : nom),
        ...(f.avec476 ? { horsCopropriete: f.declaree ? f.horsCopropriete : hors } : {}),
        adresses, sansNumeroConfirmees: confirmeesSansNumero.filter((k) => adresses.some((a) => cleImmeuble(a.libelle) === k)),
        adressesConfirmees: confirmees.filter((k) => k === cleImmeuble(f.libelle) || adresses.some((a) => cleImmeuble(a.libelle) === k)), deplacementsConfirmes: deplacementsAEnvoyer(),
        syndicId: f.syndic?.id ?? null, retirerSyndic: false, alerteParcelleVue: false, conflitsParcelle: [],
        ...(!f.declaree && !hors ? { arrete: arreteNouvelle, ags: agsNouvelle } : {}) };
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string; message?: string; conflitAdresse?: ConflitAdresse };
      // 🔴 (12h50) le serveur a trouvé un conflit (ajouté entre-temps ailleurs) : la même fenêtre ; « Oui » relance le rattachement
      if (d.conflitAdresse) { const c = d.conflitAdresse; setConflit({ a: null, c, apres: () => { void validerRattachement(); } }); setErreur(d.motif ?? null); return; }
      if (d.etat !== 'ok' || !d.data) { setErreur(d.motif ?? d.message ?? 'Rattachement refusé.'); return; }
      fusionnerFiche(d.data);
      if (!f.declaree) { setArreteNouvelle(null); setAgsNouvelle([]); }
      setRattacheeIci(false); // 🔴 (13h27) les propositions ne se replient plus seules
      setInfo(motAdressesValidees(n));
    } catch { setErreur('Rattachement impossible : le serveur n’a pas répondu. Rien n’a été modifié.'); } finally { setEnvoi(false); }
  };
  const valider = async (passe: { alerte?: boolean; conflit?: boolean; meme?: boolean; regrouperAvec?: string; syndicId?: number } = {}): Promise<void> => {
    if (f === null) return;
    if (edition !== null) { setErreur('Validez ou annulez d’abord le contact en cours de modification.'); return; }
    // 🔴 Arno (18/11/2026) — plusieurs adresses, bâtiments rangés par adresse : chaque adresse se numérote pour elle
    const refusDigi = f.saisieDigicodes ? refusDigicodes(digi, f.nomenclatureEffective, f.batimentsConnus, f.batimentsParAdresse === true && digi.length > 1) : null;
    // 🔴 (Arno, 17/11/2026) la tentative fait apparaître le message SOUS la ligne concernée
    if (refusDigi !== null) { setTenteDigi(true); setErreur(refusDigi); return; }
    if (!passe.conflit && conflits.length > 0) { setEtape('conflit'); return; }
    if (!passe.meme && !memeTraite && memeSyndic.length > 0) { setEtape('meme'); return; }
    const alerteDue = !passe.alerte && libres.length > 0 && !rattacheeIci && !f.declaree;
    if (alerteDue) { setEtape('alerte'); return; }
    // 🔴 Arno (23/11/2026) — une fiche déjà enregistrée, rien de changé depuis l'ouverture : « Valider » fait sa requête COMME AVANT (elle peut
    // compléter la fiche côté serveur), mais le message le dit : les dates d'AG et l'arrêté sont enregistrés dès leur saisie
    const inchangee = f.declaree && !passe.regrouperAvec && passe.syndicId === undefined && digicodesModifies(digi).length === 0 && confirmees.length === 0
      && initiale === signatureSaisie({ nom, hors, adresses, contacts, syndic: syndicChoisi?.id ?? null, retrait: retraitSyndic });
    setEtape(null); setEnvoi(true); setErreur(null);
    try {
      const corps = { action: 'enregistrer', immeuble: f.cle, nom: nom.trim() === '' ? null : nom, ...(f.avec476 ? { horsCopropriete: hors } : {}),
        adresses, sansNumeroConfirmees: confirmeesSansNumero.filter((k) => adresses.some((a) => cleImmeuble(a.libelle) === k)),
        adressesConfirmees: confirmees.filter((k) => k === cleImmeuble(f.libelle) || adresses.some((a) => cleImmeuble(a.libelle) === k)), deplacementsConfirmes: deplacementsAEnvoyer(), syndicId: passe.syndicId ?? syndicChoisi?.id ?? null, retirerSyndic: retraitSyndic, alerteParcelleVue: passe.alerte === true, ...(passe.regrouperAvec ? { regrouperAvec: passe.regrouperAvec } : {}), ...(f.saisieDigicodes ? { digicodes: digicodesModifies(digi) } : {}),
        conflitsParcelle: passe.conflit ? conflits.map((k) => ({ autre: k.libelle, parcelle: k.parcelle })) : [],
        ...(!f.declaree && !hors ? { arrete: arreteNouvelle, ags: agsNouvelle } : {}),
        contacts: contacts.map((c) => ({ id: c.id, categorie: c.categorie, libelle: c.libelle, civilite: c.civilite, prenom: c.prenom, nom: c.nom, note: c.note,
          coordonnees: c.coordonnees.filter((k) => k.valeur.trim() !== '').map((k) => ({ id: k.id, sorte: k.sorte, libelle: k.libelle, valeur: k.valeur })) })) };
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string; message?: string; conflitAdresse?: ConflitAdresse };
      if (d.conflitAdresse) { const c = d.conflitAdresse; setConflit({ a: null, c, apres: () => { void valider(passe); } }); setErreur(d.motif ?? null); return; }
      if (d.etat !== 'ok' || !d.data) { setErreur(d.motif ?? d.message ?? 'Enregistrement refusé.'); return; }
      appliquer({ fiche: d.data, coproprieteDuBien: lu?.coproprieteDuBien ?? null }); setRattacheeIci(false); setMemeTraite(false);
      setInfo(passe.regrouperAvec ? `Copropriété regroupée avec « ${passe.regrouperAvec} ».` : inchangee ? MOT_AUCUNE_MODIFICATION : MOT_FICHE_ENREGISTREE);
    } catch { setErreur('Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.'); } finally { setEnvoi(false); }
  };

  /**
   * 🔴 (« Digicodes unifiés », lot 3) « Corriger une erreur » / « Garder ce code » : IMMÉDIATS (confirmés dans le composant), par le chemin serveur
   * unique ; seuls les digicodes de la fiche sont relus (le reste de la saisie en cours n'est pas touché). Des digicodes saisis et pas encore
   * validés : on le dit d'abord (ils seraient perdus).
   */
  /** 🔴 (« Digicodes unifiés », lot 6) l'écran des destinataires et l'envoi : la réponse telle quelle (ou le refus) ; ensuite les digicodes se relisent. */
  const echangeEnvoi = async <T,>(corpsGeste: Record<string, unknown>): Promise<T | string> => {
    if (f === null) return 'Fiche non chargée.';
    if (digicodesModifies(digi).length > 0) return 'Validez (ou retirez) d’abord les digicodes en cours de saisie : rien n’est enregistré.';
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpsGeste, immeuble: f.cle }) });
      const d = (await r.json()) as { etat?: string; data?: T; motif?: string; message?: string };
      return d.etat === 'ok' && d.data !== undefined ? d.data : (d.motif ?? d.message ?? 'Refusé.');
    } catch { return 'Le serveur n’a pas répondu. Rien n’a été modifié.'; }
  };
  const relireDigicodes = async (): Promise<void> => {
    if (f === null) return;
    try {
      const r = await fetch(`${API}?immeuble=${encodeURIComponent(f.cle)}`, { cache: 'no-store' });
      const d = (await r.json()) as { etat?: string; data?: { fiche: Fiche | null } };
      const nouvelle = d.data?.fiche;
      if (d.etat !== 'ok' || !nouvelle) return;
      setLu((l) => (l === null || l.fiche === null ? l : { ...l, fiche: { ...l.fiche, digicodes: nouvelle.digicodes, batimentsConnus: nouvelle.batimentsConnus, nomenclatureEffective: nouvelle.nomenclatureEffective,
        batimentsParAdresse: nouvelle.batimentsParAdresse, batimentsAPreciser: nouvelle.batimentsAPreciser } }));
      setDigi(saisieDigicodesInitiale(nouvelle));
    } catch { /* la fiche se relira à la prochaine ouverture */ }
  };
  /** 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété ») le choix de l'adresse d'un bâtiment « à préciser » */
  const [aPreciser, setAPreciser] = useState<Record<number, string>>({});
  const preciserAdresse = async (batimentId: number): Promise<void> => {
    if (f === null) return;
    setErreur(null); setInfo(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batiment-adresse', immeuble: f.cle, batimentId, adresseCle: aPreciser[batimentId] ?? '' }) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string };
      if (d.etat !== 'ok' || !d.data) { setErreur(d.motif ?? 'Enregistrement refusé.'); return; }
      const nouvelle = d.data;
      setLu((l) => (l === null || l.fiche === null ? l : { ...l, fiche: { ...l.fiche, digicodes: nouvelle.digicodes, batimentsConnus: nouvelle.batimentsConnus,
        nomenclatureEffective: nouvelle.nomenclatureEffective, batimentsParAdresse: nouvelle.batimentsParAdresse, batimentsAPreciser: nouvelle.batimentsAPreciser } }));
      setDigi(saisieDigicodesInitiale(nouvelle));
      setInfo('Adresse du bâtiment enregistrée.');
    } catch { setErreur('Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.'); }
  };
  const gesteDigicode = (action: 'digicode-corriger' | 'digicode-arbitrer', adresseCle: string, batiment: string | null, v: { digicode: boolean; code: string | null }): Promise<string | null> =>
    appelDigicode({ action, adresseCle, batiment, digicode: v.digicode, code: v.code });
  const appelDigicode = async (corpsGeste: Record<string, unknown> & { action: string }): Promise<string | null> => {
    const action = corpsGeste.action;
    if (f === null) return 'Fiche non chargée.';
    if (digicodesModifies(digi).length > 0) return 'Validez (ou retirez) d’abord les digicodes en cours de saisie : rien n’est enregistré.';
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpsGeste, immeuble: f.cle }) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string; message?: string };
      if (d.etat !== 'ok' || !d.data) return d.motif ?? d.message ?? 'Enregistrement refusé.';
      const nouvelle = d.data;
      setLu((l) => (l === null || l.fiche === null ? l : { ...l, fiche: { ...l.fiche, digicodes: nouvelle.digicodes, batimentsConnus: nouvelle.batimentsConnus, nomenclatureEffective: nouvelle.nomenclatureEffective,
        batimentsParAdresse: nouvelle.batimentsParAdresse, batimentsAPreciser: nouvelle.batimentsAPreciser } }));
      setDigi(saisieDigicodesInitiale(nouvelle));
      setInfo(action === 'digicode-corriger' ? 'Digicode corrigé.' : action === 'digicode-arbitrer' ? 'Digicode choisi.' : action === 'digicode-planifier' ? 'Changement de digicode enregistré.' : 'Changement annulé.');
      return null;
    } catch { return 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été modifié.'; }
  };

  // le titre : « Bien hors copropriété » dès que la fiche le dit, ou que le bien d'où l'on vient est noté « pas en copropriété »
  const horsAffiche = estHorsCopropriete({ horsCopropriete: hors }, lu?.coproprieteDuBien);
  const titre = titreFicheCopropriete(horsAffiche);
  let corps: React.ReactNode;
  if (lu === null) corps = <p className="loc-muet">{erreur ?? 'Lecture…'}</p>;
  else if (f === null) corps = <p className="loc-muet" data-fcp-vide>Ce bien n’a ni immeuble ni adresse : aucune fiche copropriété possible.</p>;
  else corps = <>
    {f.desaccord && <p className="fcp-alerte" role="status" data-fcp-desaccord>{ALERTE_DESACCORD}</p>}
    {!f.declaree && <p className="loc-muet" data-fcp-nouvelle>Cette fiche n’existe pas encore : elle sera créée au premier « Valider ».</p>}
    {/* 🔴 (Arno, 24/11/2026) « inverser l'ordre entre le bloc Adresses et le bloc Identité » : Adresses d'abord, puis Identité, puis le reste inchangé */}
    <section className="fcp-bloc" data-fcp-adresses>
      <h3 className="fcp-titre">Adresses
        <button type="button" className="fcp-plus" aria-expanded={ajoutAdresse} aria-label="Ajouter une adresse à cette copropriété" title="Ajouter une adresse"
          onClick={() => setAjoutAdresse((o) => !o)} data-fcp-plus-adresse>+</button></h3>
      {/* 🔴🔴 (Arno, 26/11/2026, 14h06) « pourquoi chaque ligne est faite différemment ? » : UNE présentation pour TOUTES les adresses, en colonnes alignées —
          [adresse] [état] [actions] [×]. État : « Adresse principale », « ✓ Vérifiée » (vert), « À vérifier » (orange), « Nouvelle — en attente de
          validation » (le texte de l'adresse en bleu). « Vérifier » sur toutes les lignes ; « Définir comme adresse principale » sur les validées ; le « × »
          toujours en dernier, aligné à droite (la principale garde l'emplacement vide). 390 px : l'adresse, puis état et actions dessous, « × » en haut à droite. */}
      <ul className="fcp-liste fcp-adresses-liste">
        {(() => {
          const ligne = (o: { cle: string; a: Adresse; libelle: string; etat: EtatAdresse; sorte: 'principale' | 'secondaire' | 'officielle-des-biens'; attrs?: Record<string, string>;
            avecRetrait: boolean; avecDefinir: boolean; extra?: React.ReactNode }) => (
            <li key={o.cle} className={`fcp-adr${o.etat === 'nouvelle' ? ' fcp-adr-nouvelle' : ''}`} data-fcp-adresse={o.sorte} data-fcp-etat-ligne={o.etat} {...(o.attrs ?? {})}>
              <div className="fcp-adr-ligne">
                <span className="fcp-adr-texte" data-fcp-adresse-texte>{o.libelle}</span>
                <span className="fcp-adr-etat">
                  <span className={`fcp-etat fcp-etat-${o.etat}`} data-fcp-etat={o.etat} {...(o.etat === 'nouvelle' ? { 'data-fcp-en-attente': '' } : {})}>{ETAT_ADRESSE[o.etat]}</span>
                  {o.extra}
                  {confirmees.includes(o.cle) && <span className="fcp-en-attente" data-fcp-confirmation-a-enregistrer> — confirmée, enregistrée avec « Valider »</span>}
                </span>
                <span className="fcp-adr-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini fcp-adr-bouton" aria-expanded={examen?.cle === o.cle}
                    title="Vérifier cette adresse : adresse officielle, parcelle, position" onClick={() => { void examiner(o.a); }}
                    data-fcp-verifier={o.cle} {...(o.etat === 'aVerifier' ? { 'data-fcp-adresse-a-verifier': '' } : {})}>{LIBELLE_VERIFIER}</button>
                  {/* 🔴 (Arno, 26/11/2026, 12h50) « Définir comme adresse principale » : une adresse ENREGISTRÉE (pas une écriture d'origine) */}
                  {o.avecDefinir && (
                    <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini fcp-adr-bouton fcp-definir-principale" onClick={() => setPrincipaleVisee(o.cle)} disabled={envoi}
                      data-fcp-definir-principale={o.cle}>{LIBELLE_DEFINIR_PRINCIPALE}</button>)}
                </span>
                <span className="fcp-adr-retrait">{o.avecRetrait ? retirer(o.a) : null}</span>
              </div>
              {panneauExamen(o.a, o.sorte === 'principale' ? 'principale' : o.sorte === 'officielle-des-biens' ? 'biens' : 'adresse')}
            </li>);
          const principale: Adresse = { libelle: f.libelle, codePostal: f.codePostal ?? '', commune: f.commune ?? '', ...(off !== null ? { banId: off.principale.banId } : {}) };
          /* 🔴🔴 (Arno, 26/11/2026, 13h30) la principale en tête ; puis les adresses validées, puis celles en attente (juste au-dessus du bouton), chacune
             par rue puis numéro croissant (trierAdresses, la même fonction que les blocs DIGICODES et les propositions). L'ordre de la SAISIE ne change pas.
             🔴 (Arno, 20/11/2026, lot 5) une écriture d'origine n'est JAMAIS une adresse : elle ne vit que dans « Écritures d'origine ». */
          const l = rangees.filter((x) => x.mode !== 'ecriture'); const enreg = (x: (typeof l)[number]) => enregistrees.has(cleImmeuble(x.a.libelle));
          const secondaires = [...trierAdresses(l.filter(enreg), (x) => x.libelle), ...trierAdresses(l.filter((x) => !enreg(x)), (x) => x.libelle)];
          return [
            ligne({ cle: cleImmeuble(f.libelle), a: principale, libelle: off !== null ? off.principale.libelle : adresseImmeuble(f.libelle, f.codePostal, f.commune), etat: 'principale',
              sorte: 'principale', attrs: off !== null ? { 'data-fcp-officielle': off.principale.banId } : {}, avecRetrait: false, avecDefinir: false }),
            ...secondaires.map(({ a, mode, libelle }) => {
              const k = cleImmeuble(a.libelle);
              // « À vérifier » : la règle d'avant (une adresse que rien n'a rapprochée de l'adresse officielle, pas encore confirmée)
              const etat: EtatAdresse = !enregistrees.has(k) ? 'nouvelle' : off !== null && mode === 'normale' && !dejaConfirmees.has(k) ? 'aVerifier' : 'verifiee';
              return ligne({ cle: k, a, libelle, etat, sorte: 'secondaire', attrs: mode === 'officielle' ? { 'data-fcp-officielle': '' } : {}, avecRetrait: true,
                avecDefinir: f.declaree && enregistrees.has(k),
                extra: deplacements[k] !== undefined ? <span className="fcp-en-attente" data-fcp-deplacee> — sera retirée de {deplacements[k]}</span> : undefined });
            }),
          ];
        })()}
        {/* 🔴🔴 (Arno, 26/11/2026, 13h27) le bouton qui valide toute la sélection, DANS la liste ADRESSES, juste sous les adresses en attente */}
        {enAttente.length > 0 && (
          <li className="fcp-ligne-valider-rattachement" data-fcp-valider-rattachement-ligne>
            <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-valider-rattachement" disabled={envoi} onClick={() => { void validerRattachement(); }}
              data-fcp-valider-rattachement>{envoi ? 'Enregistrement…' : libelleValiderRattachement(enAttente.length)}</button></li>)}
        {/* une autre adresse officielle de l'immeuble, connue par ses biens mais qui n'est pas (encore) une adresse enregistrée : en lecture seule — la même ligne */}
        {(off?.adresses ?? []).filter((g) => g.banId !== off?.principale.banId && !rangees.some((x) => x.banId === g.banId)).map((g) => {
          const a: Adresse = { libelle: g.court, codePostal: g.codePostal ?? '', commune: g.commune ?? '', banId: g.banId };
          return (
            <li key={g.banId} className="fcp-adr" data-fcp-adresse="officielle-des-biens" data-fcp-etat-ligne="biens">
              <div className="fcp-adr-ligne">
                <span className="fcp-adr-texte" data-fcp-adresse-texte>{g.libelle}</span>
                <span className="fcp-adr-etat"><span className="fcp-etat fcp-etat-biens" data-fcp-etat="biens">{ETAT_ADRESSE.biens}</span></span>
                <span className="fcp-adr-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini fcp-adr-bouton" aria-expanded={examen?.cle === cleImmeuble(a.libelle)}
                    onClick={() => { void examiner(a); }} data-fcp-verifier={cleImmeuble(a.libelle)}>{LIBELLE_VERIFIER}</button></span>
                <span className="fcp-adr-retrait" />
              </div>
              {panneauExamen(a, 'biens')}
            </li>);
        })}
      </ul>
      {off !== null && (
        <details className="fcp-histo" data-fcp-ecritures>
          <summary>Écritures d’origine ({off.ecritures.length})</summary>
          <ul className="fcp-liste">{off.ecritures.map((e, i) => (
            <li key={i} data-fcp-ecriture={e.statut}>« {e.ecriture} » <span className="loc-muet">— {e.biens} bien{e.biens > 1 ? 's' : ''}</span>
              {e.statut !== 'certain' && <span className="fcp-a-verifier" data-fcp-ecriture-a-verifier> · à vérifier</span>}</li>))}</ul>
        </details>)}
      {/* 🔴 (Arno, 26/11/2026, 11h58) l'historique des adresses : ajout, confirmation, retrait (journal de la copropriété), en lecture seule */}
      {(f.historiqueAdresses ?? []).length > 0 && (
        <details className="fcp-histo" data-fcp-historique-adresses>
          <summary>Historique des adresses ({(f.historiqueAdresses ?? []).length})</summary>
          <ul className="fcp-liste">{(f.historiqueAdresses ?? []).map((e, i) => (
            <li key={i}><span className="loc-muet fcp-petit">{e.le} — {e.par}</span><br />{e.texte}</li>))}</ul>
        </details>)}
      {ajoutAdresse && (
        <div className="fcp-ajout" data-fcp-ajout-adresse>
          {/* 🔴 (Arno, 26/11/2026, point 3) « Sur la même parcelle » devient repliable : « Adresses proposées sur la même parcelle (N) ▸ / ▾ » —
              ouvert tant qu'aucune adresse n'est rattachée, replié dès qu'il y en a une, et ouvrable ou refermable d'un clic ; rien n'est retiré */}
          {/* 🔴🔴 (Arno, 26/11/2026, 13h27) OUVERT par défaut, une adresse par ligne, une case à cocher par ligne (toute la ligne cliquable) : cocher = l'adresse
              entre aussitôt dans ADRESSES « en attente de validation » (la règle d'exclusivité joue dès la coche) ; décocher = elle en sort. Le repli reste d'un clic. */}
          {proposees.length > 0 && (() => {
            const ouvert = propositionsOuvertes ?? true;
            return (
              <div data-fcp-propositions={ouvert ? 'ouvert' : 'replie'}>
                <button type="button" className="fcp-sous-titre fcp-propositions-tete" aria-expanded={ouvert} aria-controls={idPropositions}
                  onClick={() => setPropositionsOuvertes(!ouvert)} data-fcp-propositions-basculer>
                  Adresses proposées sur la même parcelle ({proposees.length}) <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span></button>
                <ul className="fcp-liste fcp-propositions-liste" id={idPropositions} hidden={!ouvert}>
                  {proposees.map((p) => {
                    const k = cleImmeuble(p.libelle);
                    const coche = clesIci.has(k);
                    return (
                      <li key={p.libelle} className={p.etat === 'prise' ? 'loc-muet' : undefined} {...(p.etat === 'prise' ? { 'data-fcp-prise': '' } : {})}>
                        {/* 🔴 (12h50) une adresse déjà rattachée à une autre copropriété : la coche ouvre la fenêtre du conflit */}
                        <label className="fcp-case fcp-proposition" data-fcp-proposition={k}>
                          <input type="checkbox" checked={coche} disabled={envoi}
                            onChange={() => { if (coche) decocher(k); else void rattacherControle(p); }}
                            {...(p.etat === 'prise' ? { 'data-fcp-rattacher-prise': '' } : { 'data-fcp-rattacher-parcelle': '' })} />
                          <span>{adresseImmeuble(p.libelle, p.codePostal, p.commune)}
                            {p.etat === 'prise' && <> — déjà rattachée à une autre copropriété{p.syndic ? ` — ${nomAvecVille(p.syndic.nom, p.syndic.ville)}` : ''}</>}</span>
                        </label></li>);
                  })}
                </ul>
              </div>);
          })()}
          <p className="fcp-sous-titre">Une autre adresse</p>
          {/* 🔴 (16/11/2026, demande expresse d'Arno) CE QU'IL Y AVAIT : trois champs libres Rue / Code postal / Ville. Ils ont disparu de cet encart
              (doublons d'adresses : accents, abréviations) : une autre adresse se choisit UNIQUEMENT dans les suggestions, et le serveur la vérifie. */}
          <label className="fcp-champ" htmlFor={idAutre}><span>Rechercher l’adresse, puis la choisir dans la liste</span></label>
          <div data-fcp-autre-adresse>
            <ChampAdresseBan id={idAutre} valeur={autre} verifiee={autreChoisie !== null} exemple="ex. 12 rue de la République, 92800 Puteaux"
              onChange={(v) => { setAutre(v); setAutreChoisie(null); setAutreBan(null); setIntrouvable(false); }}
              onChoisir={(a, officielle) => { setAutre(adresseImmeuble(a.voie, a.codePostal || null, a.commune || null)); setAutreChoisie(a); setAutreBan(officielle.banId); setIntrouvable(false); }} />
          </div>
          {introuvable && <p className="fcp-alerte" role="alert" data-fcp-adresse-introuvable>Adresse introuvable dans les suggestions : choisissez-la dans la liste proposée (Base Adresse Nationale). Rien n’est ajouté.</p>}
          <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" disabled={autre.trim() === ''}
            onClick={() => {
              if (autreChoisie === null) { setIntrouvable(true); return; }
              void rattacherControle({ libelle: autreChoisie.voie, codePostal: autreChoisie.codePostal, commune: autreChoisie.commune, ...(autreBan !== null ? { banId: autreBan } : {}) },
                () => { setAutre(''); setAutreChoisie(null); setAutreBan(null); });
            }} data-fcp-ajouter-adresse>Ajouter</button>
        </div>
      )}
    </section>

    <section className="fcp-bloc" data-fcp-identite>
      <h3 className="fcp-titre">Identité</h3>
      <label className="fcp-champ"><span>Nom de la copropriété (facultatif)</span>
        <input value={nom} disabled={!f.avec476 || envoi} placeholder={off?.principale.libelle ?? f.libelle} onChange={(e) => setNom(e.target.value)} data-fcp-nom /></label>
      {f.avec476 && <label className="fcp-case"><input type="checkbox" checked={hors} disabled={envoi} onChange={(e) => setHors(e.target.checked)} data-fcp-hors />
        <span>Immeuble hors copropriété (tout l’immeuble) : ni syndic ni AG</span></label>}
      {horsAffiche && !hors && <p className="fcp-alerte" data-fcp-bien-hors>Ce bien est noté « pas en copropriété » sur sa fiche : cochez la case pour tout l’immeuble (rien n’est changé sans « Valider »).</p>}
      <p className="loc-muet fcp-sans-marge" data-fcp-biens>{f.biens.length} bien{f.biens.length > 1 ? 's' : ''} du portefeuille dans cet immeuble</p>
    </section>

    <section className="fcp-bloc" data-fcp-digicodes>
      <h3 className="fcp-titre">Digicodes</h3>
      {/* 🔴🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété » : « Bâtiment dont l'adresse n'est pas déductible → « adresse à préciser » sur la
          fiche Copropriété, choix par Arno ; jamais deviné. ») */}
      {(f.batimentsAPreciser ?? []).length > 0 && (
        <div className="fcp-etape" role="group" aria-label="Bâtiments dont l’adresse est à préciser" data-fcp-a-preciser>
          <p className="fcp-sans-marge"><strong>Adresse à préciser</strong> — choisissez l’adresse de chaque bâtiment (rien n’est deviné).</p>
          <ul className="fcp-liste">{(f.batimentsAPreciser ?? []).map((x) => (
            <li key={x.id} className="fcp-a-preciser" data-fcp-a-preciser-batiment={x.libelle}>
              <span>Bâtiment <strong>{x.libelle}</strong></span>
              <label className="fcp-champ fcp-a-preciser-choix"><span className="fcp-sr">Adresse du bâtiment {x.libelle}</span>
                <select value={aPreciser[x.id] ?? ''} onChange={(e) => setAPreciser((m) => ({ ...m, [x.id]: e.target.value }))} disabled={envoi} data-fcp-a-preciser-adresse>
                  <option value="">— choisir l’adresse —</option>
                  {f.adresses.map((a) => <option key={a.cle} value={a.cle}>{adresseImmeuble(a.libelle, a.codePostal, a.commune)}</option>)}
                </select></label>
              <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" disabled={envoi || (aPreciser[x.id] ?? '') === ''}
                onClick={() => { void preciserAdresse(x.id); }} data-fcp-a-preciser-valider>Rattacher à cette adresse</button>
            </li>))}</ul>
        </div>)}
      {/* 🔴 (lot 3) la nouvelle saisie : digicode commun, « + » pour un bâtiment ou une cage, menu des bâtiments de toute la copropriété ;
          sans la 477, l'ancienne saisie par adresse reste (rien n'est perdu) */}
      {f.saisieDigicodes
        ? <><DigicodesCopropriete parAdresse={f.batimentsParAdresse === true} s={digiAffiches}
          {...(f.declaree ? { onRetirerAdresse: (c: string) => setRetraitAdresse(c), principaleCle: f.cle } : {})} onChange={(nv) => setDigi((d) => remettreDigicodes(d, nv))} connus={f.batimentsConnus} nomenclature={f.nomenclatureEffective} desactive={envoi} tente={tenteDigi}
          {...(f.digicodesUnifies ? { onCorriger: (a: string, b: string | null, v: { digicode: boolean; code: string | null }) => gesteDigicode('digicode-corriger', a, b, v),
            onArbitrer: (a: string, b: string | null, v: { digicode: boolean; code: string | null }) => gesteDigicode('digicode-arbitrer', a, b, v),
            onPlanifier: (a: string, appliqueLe: string, changements: unknown[]) => appelDigicode({ action: 'digicode-planifier', adresseCle: a, appliqueLe, changements }),
            onAnnulerChangement: (a: string, ligneId: number) => appelDigicode({ action: 'digicode-annuler-changement', adresseCle: a, ligneId }),
            // 🔴 (Arno, 17/11/2026, 487) le « − » d'un code de bâtiment enregistré : retiré (jamais effacé)
            onRetirer: (a: string, batiment: string) => appelDigicode({ action: 'digicode-retirer', adresseCle: a, batiment }),
            // 🔴 (Arno, 17/11/2026, 488) le « − » d'un bâtiment sans code : retiré de la copropriété
            onRetirerBatiment: (a: string, batiment: string) => appelDigicode({ action: 'digicode-retirer-batiment', adresseCle: a, batiment }),
            onApercu: (a: string, appliqueLe: string, changements: unknown[]) => echangeEnvoi<ApercuEnvoi>({ action: 'digicode-apercu-envoi', adresseCle: a, appliqueLe, changements }),
            onEnvoyer: async (a: string, appliqueLe: string, changements: unknown[], proprietaires: boolean, options?: { mode: string; decoches: number[] }) => {
              const r = await echangeEnvoi<IssueEnvoi>({ action: 'digicode-planifier-envoyer', adresseCle: a, appliqueLe, changements, proprietaires, ...(options ?? {}) });
              if (typeof r !== 'string') void relireDigicodes();
              return r;
            } } : {})} />
          {digicodesATrancher.length > 0 && (
            <div className="fcp-alerte" data-fcp-digicodes-a-trancher>
              <p className="fcp-sans-marge"><strong>Digicodes à trancher</strong> — la même adresse officielle porte des codes différents sous d’autres écritures (aucun n’est supprimé) :</p>
              <ul className="fcp-liste">{digicodesATrancher.map((x, i) => (
                <li key={i}>{x.adresse} — {x.place} : <strong>{x.valeur}</strong> <span className="loc-muet fcp-petit">(écriture « {x.ecriture} »)</span></li>))}</ul>
            </div>)}</>
        /* 🔴 (« Digicodes unifiés », lot 4, accord d'Arno) CE QU'IL Y AVAIT : l'ancienne saisie par adresse (DigicodeImmeuble), en repli sans la 477 —
           RETIRÉE : le composant unique couvre tout ce qu'elle faisait (code commun, code de chaque bâtiment, ajout d'un bâtiment, « commun aux N
           biens », message après enregistrement). Sans la mise à jour de la base, on le dit ; rien n'est saisi. */
        : <p className="loc-muet fcp-sans-marge" data-fcp-digicodes-attente>La saisie des digicodes attend la mise à jour de la base (migrations 477 et 478) : rien ne peut être saisi ici pour l’instant.</p>}
    </section>

    {/* 🔴 (16/11/2026, point 3) l'ordre : Identité, Adresses, Digicodes, AG, Habitants et gardiens, puis le Syndic EN DERNIER ; chaque partie est une
        carte (titre net, fond et bordure distincts). Rien n'est retiré, masqué ni conditionné : AG et Syndic gardent leur condition d'avant
        (absents d'un immeuble « hors copropriété »). */}
    {!horsAffiche && <section className="fcp-bloc" data-fcp-ag>
      {/* 🔴🔴 (Arno, 23/11/2026) « je ne vois pas où saisir la date d'arrêté des comptes pour la copropriété. Je ne vois pas non plus où ajouter une ou
          des dates d'AG » : le bloc « AG et arrêté des comptes », AUSSI pour une fiche nouvelle (avant : « AG de la copropriété : aucune encore (fiche
          à créer). ») — ses saisies partent alors avec le « Valider » ; une fiche enregistrée les écrit tout de suite, comme avant. */}
      <h3 className="fcp-titre">AG et arrêté des comptes</h3>
      {/* 🔴 (Arno, 17/11/2026) « + Ajouter un PV d'AG » (devenu « + Ajouter une AG », 23/11) et « Corriger » : dans cette fiche seulement */}
      {/* 🔴 (Arno, 23/11/2026, 512) la date d'arrêté des comptes, à côté des dates d'AGO (facultative) — le même composant que la fenêtre de la sortie */}
      {f.declaree && f.id !== null && <ArreteComptes coproprieteId={f.id} onChange={(x) => { setErreur(null); setInfo(motArreteEnregistre(x.arrete)); }} />}
      {!f.declaree && <ArreteComptesLocal valeur={arreteNouvelle} onChange={setArreteNouvelle} desactive={envoi} />}
      {f.declaree ? <AgCopropriete immeuble={f.cle} edition onEnregistre={(jour) => { setErreur(null); setInfo(motDateAgEnregistree(jour)); }} /> : <AgFicheNouvelle enAttente={agsNouvelle} onEnAttente={setAgsNouvelle} desactive={envoi} />}</section>}

    <section className="fcp-bloc" data-fcp-contacts>
      <h3 className="fcp-titre">Habitants et gardiens</h3>
      <p className="loc-muet fcp-sans-marge" data-fcp-usage-interne>Usage interne : ces coordonnées ne sont jamais communiquées à un autre client, et un habitant ne voit jamais les autres destinataires d’un envoi.</p>
      {contacts.length === 0 && edition === null && <p className="loc-muet fcp-sans-marge">Aucun habitant ni gardien.</p>}
      <ul className="fcp-liste">{contacts.map((c) => (
        <li key={c.cle} className="fcp-contact" data-fcp-contact={c.categorie}>
          <span className="fcp-pastille" data-fcp-statut>{c.categorie === 'personnalise' ? c.libelle : libelleCategorieImmeuble(c.categorie, null)}</span>{' '}
          <strong>{nomContact(c) || '—'}</strong>{c.coordonnees.map((k, i) => <span key={i} className="fcp-coord"> · {k.valeur}</span>)}{' '}
          <button type="button" className="fcp-lien" onClick={() => setEdition({ ...c, coordonnees: c.coordonnees.map((k) => ({ ...k })) })} data-fcp-modifier-contact>Modifier</button>
        </li>))}</ul>
      {edition !== null ? (
        <EditionContact c={edition} onChange={setEdition} onAnnuler={() => setEdition(null)} autres={contacts} immeuble={f.libelle} syndicId={f.syndic?.id ?? null}
          onRetirer={edition.id === null && !contacts.some((x) => x.cle === edition.cle) ? null : () => { setContacts((l) => l.filter((x) => x.cle !== edition.cle)); setEdition(null); }}
          onValider={() => { setContacts((l) => (l.some((x) => x.cle === edition.cle) ? l.map((x) => (x.cle === edition.cle ? edition : x)) : [...l, edition])); setEdition(null); }} />
      ) : <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => setEdition({ cle: cleLocale(), id: null, categorie: 'coproprietaire', libelle: '', civilite: null, prenom: '', nom: '', note: '', coordonnees: [] })} data-fcp-ajouter-contact>+ Ajouter un habitant ou un gardien</button>}
    </section>

    {!horsAffiche && <>
      <section className="fcp-bloc" data-fcp-syndic>
        <h3 className="fcp-titre">Syndic</h3>
        {f.syndic !== null ? <p className="fcp-sans-marge">
          <button type="button" className="fcp-lien fcp-fort" onClick={() => setFicheSyndic(f.syndic!.id)} data-fcp-ouvrir-syndic>{nomAvecVille(f.syndic.nom, f.syndic.ville)}</button>
          <span className="loc-muet"> — ouvrir sa fiche</span></p> : <p className="loc-muet fcp-sans-marge" data-fcp-sans-syndic>Aucun syndic lié.</p>}
        {/* 🔴 (Arno, 20/11/2026) les contacts du syndic de CETTE copropriété : rattacher depuis l'annuaire complet du syndic, détacher (« − »,
            jamais supprimé de l'annuaire) — « (lecture seule) » laisse place à « + Rattacher un contact du syndic » */}
        {f.syndic !== null && (
          <ContactsSyndicCopropriete immeuble={f.cle} syndicNom={nomAvecVille(f.syndic.nom, f.syndic.ville)} gestionnaires={f.gestionnaires}
            onChange={(g) => setLu((l) => (l === null || l.fiche === null ? l : { ...l, fiche: { ...l.fiche, gestionnaires: g } }))} />)}
        {syndicChoisi !== null && <p className="fcp-info" data-fcp-syndic-choisi>Sera rattachée à {nomAvecVille(syndicChoisi.nom, syndicChoisi.ville)} à la validation
          {f.syndic !== null ? ` (le lien avec ${f.syndic.nom} passera en historique)` : ''}. <button type="button" className="fcp-lien" onClick={() => { setSyndicChoisi(null); setRetraitSyndic(false); }}>Annuler ce choix</button></p>}
        {/* 🔴 (Arno, 20/11/2026) le retrait SEUL, préparé : rien n'est écrit avant « Valider » */}
        {retraitSyndic && syndicChoisi === null && f.syndic !== null && <p className="fcp-info" data-fcp-syndic-retire>{nomAvecVille(f.syndic.nom, f.syndic.ville)} sera retiré
          à la validation : ses contacts seront détachés de la copropriété mais resteront dans l’annuaire du syndic.{' '}
          <button type="button" className="fcp-lien" onClick={() => setRetraitSyndic(false)} data-fcp-annuler-retrait>Annuler ce choix</button></p>}
        {/* 🔴 (Arno, 20/11/2026) « même méthode qu'en copie 1 » : les deux boutons ouvrent LA fenêtre « Syndic de la copropriété » de la carte d'un
            bien (FicheSyndic, variante « copropriete ») — recherche, « Ajouter un syndic », création depuis les résultats avec la garde anti-doublon.
            Le syndic choisi ou créé est PRÉPARÉ ici (« Sera rattachée à … à la validation ») : il ne s'applique qu'à « Valider ». */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => setChoixSyndic(true)} aria-expanded={choixSyndic} data-fcp-choisir-syndic>
          {f.syndic === null ? 'Choisir / créer le syndic' : 'Changer de syndic'}</button>
        {/* 🔴 (Arno, 20/11/2026) « Retirer le syndic », à côté de « Changer de syndic » : confirmation, puis retrait seul ou suivi d'un autre syndic (préparé) */}
        {f.syndic !== null && !retraitSyndic && (
          <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => setConfirmerRetrait(true)} data-fcp-retirer-syndic>Retirer le syndic</button>)}
        {confirmerRetrait && f.syndic !== null && (
          <div className="fcp-confirmer-retrait" role="alertdialog" aria-labelledby="fcp-retrait-titre" data-fcp-confirmer-retrait>
            <p id="fcp-retrait-titre" className="fcp-sans-marge">Retirer {nomAvecVille(f.syndic.nom, f.syndic.ville)} de cette copropriété ? Ses contacts seront détachés de la
              copropriété mais resteront dans l’annuaire du syndic.</p>
            <div className="fcp-boutons-retrait">
              <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => setConfirmerRetrait(false)} data-fcp-retrait-annuler>Annuler</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => { setRetraitSyndic(true); setSyndicChoisi(null); setConfirmerRetrait(false); }}
                data-fcp-retrait-seul>Retirer seulement</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-mini" onClick={() => { setRetraitSyndic(true); setConfirmerRetrait(false); setChoixSyndic(true); }}
                data-fcp-retrait-et-choisir>Retirer et choisir / créer un autre syndic</button>
            </div>
          </div>)}
        {/* 🔴 (Arno, 20/11/2026, journal des syndics) qui a rattaché ou retiré chaque syndic, quand, et depuis quel écran — lecture seule */}
        {(f.historiqueSyndic ?? []).length > 0 && (
          <details className="fcp-histo" data-fcp-historique-syndic>
            <summary>Historique du syndic ({(f.historiqueSyndic ?? []).length})</summary>
            <ul className="fcp-liste">{(f.historiqueSyndic ?? []).map((e, i) => (
              <li key={i} data-fcp-histo-syndic={e.source}>{e.texte}<span className="loc-muet"> — par {e.par}, le {e.le}{e.source === 'registre' ? ' (registre des liens)' : ''}</span></li>))}</ul>
          </details>)}
      </section>
    </>}
    {horsAffiche && f.syndic !== null && <p className="fcp-alerte" data-fcp-hors-avec-syndic>Un syndic est encore lié à cet immeuble ({nomAvecVille(f.syndic.nom, f.syndic.ville)}) : rien n’est retiré tout seul.</p>}
  </>;

  const boite = (
    <div className="fcp-voile">
      <style>{CSS_FICHE_COPROPRIETE}</style>
      <style>{CSS_CHAMP_ADRESSE}</style>
      <div className="fcp-boite" role="dialog" aria-modal="true" aria-labelledby={titreId} data-fiche-copropriete={horsAffiche ? 'hors' : 'copropriete'}>
        <div className="fcp-tete">
          <h2 id={titreId} className="fcp-h2" data-fcp-titre>{titre}{f !== null ? <span className="fcp-nom"> · {nomAffiche({ nom: nom || null, libelle: off?.principale.court ?? f.libelle })}</span> : null}</h2>
          <button type="button" className="fcp-fermer" aria-label="Fermer" onClick={fermer} disabled={envoi}>×</button>
        </div>
        <div className="fcp-corps">{corps}</div>
        {retraitAdresse !== null && f !== null && (() => {
          const a = f.adresses.find((x) => x.cle === retraitAdresse);
          const d = (f.digicodes ?? []).find((x) => x.cle === retraitAdresse);
          const r = resumeAdresse(d === undefined ? null : { commun: d.commun, batiments: d.batiments }, (f.biens ?? []).filter((x) => x.cle === retraitAdresse));
          const saisis = digicodesModifies(digi).some((x) => x.cle === retraitAdresse);
          return (
            <div className="dcp-voile" data-fcp-retrait-adresse={retraitAdresse}>
              <style>{CSS_DIGICODES_COPRO}</style>
              <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="fcp-retrait-titre"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setRetraitAdresse(null); } }}>
                <p className="dcp-alerte-titre" id="fcp-retrait-titre">{LIBELLE_RETIRER_ADRESSE} ?</p>
                <p className="dcp-alerte-texte" data-fcp-retrait-libelle><strong>{a === undefined ? retraitAdresse : adresseImmeuble(a.libelle, a.codePostal, a.commune)}</strong></p>
                <p className="dcp-alerte-texte">Ses digicodes, bâtiments et cages partent avec elle :</p>
                <ul className="fcp-liste" data-fcp-retrait-digicodes>{r.digicodes.length === 0 ? <li className="loc-muet">aucun digicode ni bâtiment</li> : r.digicodes.map((x) => <li key={x}>{x}</li>)}</ul>
                {saisis && <p className="dcp-alerte-texte fcp-alerte">Les digicodes saisis à cette adresse et pas encore validés seront perdus.</p>}
                <p className="dcp-alerte-texte">Biens du portefeuille à cette adresse :</p>
                <ul className="fcp-liste" data-fcp-retrait-biens>{r.biens.length === 0 ? <li className="loc-muet">aucun</li> : r.biens.map((x) => <li key={x}>{x}</li>)}</ul>
                {r.biens.length > 0 && <p className="dcp-alerte-texte loc-muet">{CONSEQUENCE_BIENS}</p>}
                <p className="dcp-alerte-texte loc-muet">Le retrait entre dans l’historique de la copropriété ; rien n’est effacé.</p>
                <div className="dcp-alerte-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" autoFocus onClick={() => setRetraitAdresse(null)} data-fcp-retrait-annuler>Annuler</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-fcp-retrait-oui
                    onClick={() => { const c = retraitAdresse; setRetraitAdresse(null); void gesteAdresse('adresse-retirer', c, 'Adresse retirée de la copropriété.'); }}>{LIBELLE_OUI_RETIRER_ADRESSE}</button>
                </div>
              </div>
            </div>);
        })()}
        {conflit !== null && (() => {
          const { c, a } = conflit;
          const pour = a !== null ? cleImmeuble(a.libelle) : c.pour ?? c.cle;
          return (
            <div className="dcp-voile" data-fcp-conflit={c.cle}>
              <style>{CSS_DIGICODES_COPRO}</style>
              <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="fcp-conflit-titre"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConflit(null); } }}>
                <p className="dcp-alerte-titre" id="fcp-conflit-titre">{c.ecrite}</p>
                {c.principale ? <p className="dcp-alerte-texte" data-fcp-conflit-principale><strong>{motifPrincipaleAilleurs(c)}</strong></p> : <>
                  <p className="dcp-alerte-texte" data-fcp-conflit-texte><strong>{texteConflit(c)}</strong></p>
                  <p className="dcp-alerte-texte">La rattacher ici l’effacera de {nomCopropriete(c.copropriete)} (l’historique des deux copropriétés le gardera).</p>
                  <p className="dcp-alerte-texte">Biens du portefeuille à cette adresse :</p>
                  <ul className="fcp-liste" data-fcp-conflit-biens>{c.biens.length === 0 ? <li className="loc-muet">aucun</li> : c.biens.map((x) => <li key={x}>{x}</li>)}</ul>
                  <p className="dcp-alerte-texte">Ce qui partira de l’autre fiche :</p>
                  <ul className="fcp-liste" data-fcp-conflit-digicodes>{c.digicodes.length === 0 ? <li className="loc-muet">aucun digicode ni bâtiment</li> : c.digicodes.map((x) => <li key={x}>{x}</li>)}</ul>
                </>}
                <div className="dcp-alerte-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" autoFocus onClick={() => setConflit(null)} data-fcp-conflit-non>{c.principale ? 'Fermer' : LIBELLE_NON_DEPLACER}</button>
                  {!c.principale && (
                    <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-fcp-conflit-oui onClick={() => {
                      setConflit(null); noterDeplacement(pour, nomCopropriete(c.copropriete)); setErreur(null);
                      if (a !== null) { if (ajouter(a)) conflit.apres(); } else conflit.apres();
                    }}>{libelleOuiDeplacer(c)}</button>)}
                </div>
              </div>
            </div>);
        })()}
        {principaleVisee !== null && f !== null && (() => {
          const a = f.adresses.find((x) => x.cle === principaleVisee);
          return (
            <div className="dcp-voile" data-fcp-principale={principaleVisee}>
              <style>{CSS_DIGICODES_COPRO}</style>
              <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="fcp-principale-titre"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setPrincipaleVisee(null); } }}>
                <p className="dcp-alerte-titre" id="fcp-principale-titre">{LIBELLE_DEFINIR_PRINCIPALE} ?</p>
                <p className="dcp-alerte-texte"><strong>{a === undefined ? principaleVisee : adresseImmeuble(a.libelle, a.codePostal, a.commune)}</strong> devient l’adresse principale de la copropriété ;
                  {' '}{adresseImmeuble(f.libelle, f.codePostal, f.commune)} reste une adresse de la copropriété.</p>
                <p className="dcp-alerte-texte loc-muet">Rien d’autre ne change : digicodes, bâtiments, biens, syndic, AG et arrêté des comptes restent tels quels. Le changement entre dans l’historique.</p>
                <div className="dcp-alerte-actions">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" autoFocus onClick={() => setPrincipaleVisee(null)} data-fcp-principale-annuler>Annuler</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-fcp-principale-oui
                    onClick={() => { const c = principaleVisee; setPrincipaleVisee(null); void gesteAdresse('adresse-principale', c, 'Adresse principale changée.'); }}>Oui, en faire l’adresse principale</button>
                </div>
              </div>
            </div>);
        })()}
        {sansNumero !== null && (
          <div className="dcp-voile" data-fcp-sans-numero>
            <style>{CSS_DIGICODES_COPRO}</style>
            <div className="dcp-alerte" role="alertdialog" aria-modal="true" aria-labelledby="fcp-sans-numero-titre" aria-describedby="fcp-sans-numero-texte"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.currentTarget.querySelector('[data-fcp-sans-numero-corriger]') as HTMLButtonElement | null)?.click(); } }}>
              <p className="dcp-alerte-titre" id="fcp-sans-numero-titre">{TITRE_SANS_NUMERO}</p>
              <div id="fcp-sans-numero-texte">{texteSansNumero(adresseImmeuble(sansNumero.libelle, sansNumero.codePostal || null, sansNumero.commune || null)).map((t) => <p key={t} className="dcp-alerte-texte">{t}</p>)}</div>
              <div className="dcp-alerte-actions">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" autoFocus data-fcp-sans-numero-corriger onClick={() => {
                  // « Corriger » : rien n'est ajouté, la main revient au champ des suggestions
                  setSansNumero(null); setAutre(''); setAutreChoisie(null);
                  setTimeout(() => (document.getElementById(idAutre) as HTMLInputElement | null)?.focus(), 0);
                }}>Corriger</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" data-fcp-sans-numero-confirmer onClick={() => {
                  const a = sansNumero; setSansNumero(null);
                  if (ajouter(a, true)) { setAutre(''); setAutreChoisie(null); }
                }}>Confirmer</button>
              </div>
            </div>
          </div>)}
        {etape === 'conflit' && (
          <div className="fcp-etape" role="alert" data-fcp-conflit>
            <p className="fcp-sans-marge">{questionConflitParcelle(conflits)}</p>
            <div className="fcp-actions">
              {/* 🔴 (lot 6, déplacé de la fiche syndic) « Rattacher à X » : cette copropriété REJOINT celle de la parcelle, avec son syndic (regroupement) */}
              {[...new Map(conflits.filter((k) => k.copropriete !== null).map((k) => [k.syndic!.id, k])).values()].map((k) => (
                <button key={k.syndic!.id} type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} data-fcp-rattacher-a={k.syndic!.id}
                  onClick={() => { void valider({ conflit: true, meme: true, alerte: true, regrouperAvec: k.copropriete as string, syndicId: k.syndic!.id }); }}>Rattacher à {k.syndic!.nom}</button>))}
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtape(null)}>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void valider({ conflit: true }); }} data-fcp-conflit-oui>Oui, je confirme</button></div>
          </div>)}
        {etape === 'meme' && memeSyndic[0] !== undefined && (
          <div className="fcp-etape" role="alert" data-fcp-meme-syndic>
            <p className="fcp-sans-marge">Sur la même parcelle, {adresseImmeuble(memeSyndic[0].libelle, memeSyndic[0].codePostal, memeSyndic[0].commune)} est la copropriété « {memeSyndic[0].copropriete} », gérée par le même syndic.
              La regrouper avec elle (ses adresses deviennent celles de « {memeSyndic[0].copropriete} ») ?</p>
            <div className="fcp-actions"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setMemeTraite(true); void valider({ conflit: true, meme: true }); }} data-fcp-meme-non>Non, copropriété distincte</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setMemeTraite(true); void valider({ conflit: true, meme: true, alerte: true, regrouperAvec: memeSyndic[0].copropriete as string }); }} data-fcp-meme-oui>Oui, regrouper</button></div>
          </div>)}
        {etape === 'alerte' && (
          <div className="fcp-etape" role="status" data-fcp-alerte-parcelle>
            <p className="fcp-sans-marge">{libres.length} autre{libres.length > 1 ? 's' : ''} adresse{libres.length > 1 ? 's' : ''} postale{libres.length > 1 ? 's' : ''} sur la même parcelle : {libres.map((p) => p.libelle).join(', ')}.</p>
            <div className="fcp-actions"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setEtape(null); setAjoutAdresse(true); }} data-fcp-voir-adresses>Voir les adresses</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void valider({ alerte: true, conflit: conflits.length > 0 ? true : undefined }); }} data-fcp-valider-quand-meme>Valider quand même</button></div>
          </div>)}
        {erreur !== null && lu !== null && <p className="cp-refus fcp-pied-msg" role="alert" data-fcp-erreur>{erreur}</p>}
        {/* 🔴 Arno (23/11/2026) — un message vert bien visible (avant : un petit texte gris) ; le pied de la fiche reste toujours à l'écran */}
        {info !== null && <p className="fcp-confirmation fcp-pied-msg" role="status" data-fcp-info>{info}</p>}
        {fermerAttente && (
          <div className="fcp-etape" role="alertdialog" aria-label="Adresses non validées" data-fcp-fermer-attente>
            <p className="fcp-sans-marge"><strong>{motFermerAvecAttente(enAttente.length)}</strong></p>
            <div className="fcp-examen-gestes">
              <button type="button" className="svv-btn svv-btn-primary gst-btn fcp-mini" onClick={() => { setFermerAttente(false); void validerRattachement(); }} data-fcp-fermer-attente-valider>Valider le rattachement</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => { setFermerAttente(false); onFerme(); }} data-fcp-fermer-attente-oui>Fermer quand même</button>
              <button type="button" className="fcp-lien" onClick={() => setFermerAttente(false)} data-fcp-fermer-attente-non>Revenir</button>
            </div>
          </div>)}
        <div className="fcp-actions fcp-pied">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} disabled={envoi} data-fcp-annuler>Fermer</button>
          {f !== null && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void valider(); }} disabled={envoi || etape !== null} data-fcp-valider>{envoi ? 'Enregistrement…' : 'Valider'}</button>}
        </div>
      </div>
      {choixSyndic && f !== null && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={null} variante="copropriete"
          contexteCopropriete={{ libelle: f.nom?.trim() ? f.nom : adresseImmeuble(f.libelle, f.codePostal, f.commune), syndicActuel: f.syndic === null ? null : nomAvecVille(f.syndic.nom, f.syndic.ville) }}
          onFerme={() => setChoixSyndic(false)}
          onChoisi={(s) => {
            // le syndic ACTUEL choisi à nouveau : rien ne change (un retrait préparé est annulé)
            if (s.id === f.syndic?.id) { setSyndicChoisi(null); setRetraitSyndic(false); return; }
            setSyndicChoisi({ id: s.id, nom: s.nom, ville: s.ville, email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: '' });
          }} />,
        document.querySelector('.svv-adm-root') ?? document.body)}
      {ficheSyndic !== null && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={ficheSyndic} lotDepart={lotId ?? null} onFerme={() => setFicheSyndic(null)} />, document.querySelector('.svv-adm-root') ?? document.body)}
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

function EditionContact({ c, onChange, onAnnuler, onValider, onRetirer, autres = [], immeuble = '', syndicId = null }: { c: ContactEdit; onChange: (c: ContactEdit) => void; onAnnuler: () => void; onValider: () => void; onRetirer: (() => void) | null;
  autres?: readonly ContactEdit[]; immeuble?: string; syndicId?: number | null }) {
  const refus = refusContact(c, autres, immeuble);
  const [avert, setAvert] = useState<{ signature: string; lignes: string[] } | null>(null);
  const signature = JSON.stringify(c.coordonnees.map((k) => [k.sorte, k.valeur]));
  const averti = avert !== null && avert.signature === signature && avert.lignes.length > 0;
  /** « Valider le contact » : les coordonnées déjà utilisées sont dites d'abord (orange, non bloquant) ; « Valider quand même » valide. */
  const validerContact = async (): Promise<void> => {
    if (averti) { onValider(); return; }
    const emails = c.coordonnees.filter((k) => k.sorte === 'email' && k.valeur.trim() !== '').map((k) => k.valeur.trim());
    const tels = c.coordonnees.filter((k) => k.sorte === 'telephone' && k.valeur.trim() !== '').map((k) => k.valeur.trim());
    let ailleurs: CoordonneeConnue[] = [];
    if (emails.length + tels.length > 0) {
      try {
        const u = `/api/admin/gestion/syndics/doublons?syndic=${syndicId ?? ''}&prenom=&nom=&emails=${encodeURIComponent(emails.join(','))}&telephones=${encodeURIComponent(tels.join(','))}`;
        const j = (await (await fetch(u, { cache: 'no-store' })).json()) as { coordonnees?: CoordonneeConnue[] };
        ailleurs = j.coordonnees ?? [];
      } catch { /* le contrôle local seul : rien n'est bloqué */ }
    }
    const lignes = avertissementsContact(c, autres, ailleurs, immeuble);
    if (lignes.length === 0) { onValider(); return; }
    setAvert({ signature, lignes });
  };
  const coord = (i: number, k: Partial<Coord>): void => onChange({ ...c, coordonnees: c.coordonnees.map((x, j) => (j === i ? { ...x, ...k } : x)) });
  return (
    <div className="fcp-ajout" data-fcp-edition-contact>
      <div className="fcp-pilules" role="group" aria-label="Statut">
        {CATEGORIES.map((k) => <button key={k.cle} type="button" className="fcp-pilule" aria-pressed={c.categorie === k.cle} onClick={() => onChange({ ...c, categorie: k.cle })} data-fcp-statut-choix={k.cle}>{k.mot}</button>)}
      </div>
      {c.categorie === 'personnalise' && <label className="fcp-champ"><span>Statut (texte libre) *</span><input value={c.libelle} onChange={(e) => onChange({ ...c, libelle: e.target.value })} placeholder="Locataire, Femme de ménage…" data-fcp-statut-libre /></label>}
      <div className="fcp-pilules" role="group" aria-label="Civilité">
        {(['M.', 'Mme'] as const).map((x) => <button key={x} type="button" className="fcp-pilule" aria-pressed={c.civilite === x} onClick={() => onChange({ ...c, civilite: c.civilite === x ? null : x })}>{x}</button>)}
      </div>
      <div className="fcp-grille">
        <label className="fcp-champ"><span>Prénom</span><input value={c.prenom} onChange={(e) => onChange({ ...c, prenom: e.target.value })} data-fcp-prenom /></label>
        <label className="fcp-champ"><span>Nom</span><input value={c.nom} onChange={(e) => onChange({ ...c, nom: e.target.value })} data-fcp-nom-contact /></label>
      </div>
      {c.coordonnees.map((k, i) => (
        <div key={i} className="fcp-ligne-coord">
          <label className="fcp-champ"><span>{k.sorte === 'email' ? 'E-mail' : 'Téléphone'}</span>
            <input value={k.valeur} type={k.sorte === 'email' ? 'email' : 'tel'} onChange={(e) => coord(i, { valeur: e.target.value })} data-fcp-coord={k.sorte} /></label>
          <button type="button" className="fcp-lien" aria-label="Retirer cette coordonnée" onClick={() => onChange({ ...c, coordonnees: c.coordonnees.filter((_, j) => j !== i) })}>×</button>
        </div>))}
      <div className="fcp-actions fcp-gauche">
        <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => onChange({ ...c, coordonnees: [...c.coordonnees, { id: null, sorte: 'telephone', libelle: '', valeur: '' }] })} data-fcp-plus-tel>+ téléphone</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => onChange({ ...c, coordonnees: [...c.coordonnees, { id: null, sorte: 'email', libelle: '', valeur: '' }] })} data-fcp-plus-email>+ e-mail</button>
      </div>
      <label className="fcp-champ"><span>Note (interne)</span><input value={c.note} onChange={(e) => onChange({ ...c, note: e.target.value })} data-fcp-note /></label>
      {refus !== null && <p className="cp-refus fcp-sans-marge" data-fcp-refus-contact>{refus}</p>}
      {averti && <p className="fcp-avert-coord fcp-sans-marge" role="alert" data-fcp-avert-coord>{avert.lignes.map((l, i) => <span key={i}>{l}</span>)}</p>}
      <div className="fcp-actions fcp-gauche">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler}>Annuler</button>
        {onRetirer !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetirer} data-fcp-retirer-contact>Retirer de l’immeuble</button>}
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={refus !== null} onClick={() => { void validerContact(); }} data-fcp-valider-contact>{averti ? 'Valider quand même' : 'Valider le contact'}</button>
      </div>
    </div>
  );
}

/** Le bouton de la carte du bien, juste sous celui du syndic : « Copropriété », ou « Bien hors copropriété » dès le départ. */
export function BoutonCopropriete({ lotId, dansLaFiche = false }: { lotId: number | null | undefined; dansLaFiche?: boolean }) {
  const [hors, setHors] = useState<boolean | null>(null);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!lotId) return;
    let vivant = true;
    fetch(`${API}?lotId=${lotId}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>)
      .then((d) => { if (vivant && d.etat === 'ok' && d.data) setHors(estHorsCopropriete(d.data.fiche, d.data.coproprieteDuBien)); }).catch(() => { /* le bouton reste « Copropriété » */ });
    return () => { vivant = false; };
  }, [lotId, ouvert]);
  if (!lotId) return null;
  return (
    <span className={`bsy-ligne${dansLaFiche ? ' bsy-ligne--fiche' : ''}`} data-bouton-copropriete={hors ? 'hors' : 'copropriete'}>
      <button type="button" className="svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large bcp" onClick={() => setOuvert(true)}>
        <span className="bsy-mot">{titreFicheCopropriete(hors === true)}</span></button>
      {ouvert && <FicheCopropriete lotId={lotId} onFerme={() => setOuvert(false)} />}
    </span>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; telephone : une colonne, cibles de 44 px. */
export const CSS_FICHE_COPROPRIETE = `
/* (Arno, 20/11/2026) les fenêtres syndic ouvertes DEPUIS la copropriété (« Choisir / créer le syndic », « Changer de syndic », « ouvrir sa fiche ») passent AU-DESSUS de son voile */
:root .fsy-voile{z-index:95}
.fcp-confirmer-retrait{margin:8px 0;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-field);display:flex;flex-direction:column;gap:8px}
.fcp-boutons-retrait{display:flex;flex-wrap:wrap;gap:8px}
.fcp-voile{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.fcp-boite{width:min(760px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;padding:0;overflow:hidden;box-sizing:border-box;
  background:var(--color-svv-surface);color:var(--color-svv-ink);border:1px solid var(--color-svv-line);border-radius:16px;box-shadow:0 18px 48px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.fcp-champ input{border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);padding:8px 10px;font:inherit;font-weight:400}
.fcp-champ input:disabled{opacity:.6}
.fcp-pilule{min-height:44px;padding:8px 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;cursor:pointer}
.fcp-pilule[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface);border-color:var(--color-svv-red);font-weight:700}
.fcp-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--color-svv-line)}
.fcp-h2{margin:0;font-size:1.15rem;font-weight:900;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fcp-nom{font-weight:700;color:var(--color-svv-muted)}
.fcp-fermer{min-width:44px;min-height:44px;border:0;background:transparent;color:var(--color-svv-ink);font-size:1.4rem;cursor:pointer}
.fcp-corps{overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px;min-width:0;background:var(--color-svv-field)}
.fcp-bloc{display:flex;flex-direction:column;gap:8px;padding:12px 14px 14px;border:1px solid var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface);
  box-shadow:0 1px 3px color-mix(in srgb, var(--color-svv-ink) 10%, transparent);min-width:0}
.fcp-titre{margin:0 0 2px;padding:0 0 8px;display:flex;align-items:center;gap:8px;min-height:36px;border-bottom:1px solid var(--color-svv-line);
  font-size:.86rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:var(--color-svv-ink)}
.fcp-sous-titre{margin:4px 0 0;font-weight:800;font-size:.9rem;color:var(--color-svv-ink)}
.fcp-plus{min-width:36px;min-height:36px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-weight:900;font-size:1.1rem;cursor:pointer}
.fcp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;overflow-wrap:anywhere}
.fcp-histo{margin-top:6px}
.fcp-a-verifier{color:var(--color-svv-orange);font-weight:800}
/* 🔴 (26/11/2026) « à vérifier » est un BOUTON (il ouvre l'examen de l'adresse) : souligné, cible de 44 px au doigt */
.fcp-a-verifier-bouton{background:none;border:0;padding:0 2px;font:inherit;font-weight:800;color:var(--color-svv-orange);text-decoration:underline;cursor:pointer;min-height:44px}
.fcp-examen{display:flex;flex-direction:column;gap:6px;margin-top:6px}
/* 🔴 (26/11/2026, point 3) l'en-tête repliable des adresses proposées : un bouton qui a l'allure du sous-titre, cible de 44 px */
.fcp-definir-principale{font-size:.85rem;min-height:44px;margin-left:6px}
.fcp-en-attente{color:var(--color-svv-muted);font-style:italic;font-size:.85rem}
.fcp-valider-rattachement{width:100%;min-height:44px;margin:8px 0 4px;white-space:normal}
.fcp-ligne-valider-rattachement{list-style:none}
[data-fcp-adresses]{container-type:inline-size}
.fcp-adresses-liste{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(7rem,9.5rem) max-content 44px;column-gap:10px;row-gap:2px}
.fcp-adresses-liste > li{grid-column:1/-1}
.fcp-adr{display:grid;grid-template-columns:subgrid;border-bottom:1px solid var(--color-svv-line);padding:4px 0}
.fcp-adr:last-of-type{border-bottom:0}
.fcp-adr-ligne{grid-column:1/-1;display:grid;grid-template-columns:subgrid;align-items:center;min-height:44px}
.fcp-adr-ligne > *{min-width:0}
.fcp-adr-texte{color:var(--color-svv-ink);overflow-wrap:anywhere}
.fcp-adr-nouvelle .fcp-adr-texte{color:var(--color-svv-blue);font-weight:700}
.fcp-adr-etat{font-size:.85rem}
.fcp-etat{font-weight:700;white-space:nowrap}
.fcp-etat-principale,.fcp-etat-biens{color:var(--color-svv-muted)}
.fcp-etat-verifiee{color:var(--color-svv-green-ink)}
.fcp-etat-aVerifier{color:var(--color-svv-orange)}
.fcp-etat-nouvelle{color:var(--color-svv-blue);white-space:normal}
.fcp-adr-actions{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:4px 0}
.fcp-adr-actions .fcp-adr-bouton{min-height:36px;white-space:nowrap;margin:0;width:100%;font-size:.85rem}
.fcp-adr-retrait{display:flex;justify-content:flex-end}
.fcp-retrait{background:none;border:0;font:inherit;font-size:1.25rem;line-height:1;color:var(--color-svv-ink);cursor:pointer;width:44px;height:44px;border-radius:8px}
.fcp-retrait:hover{background:var(--color-svv-field)}
.fcp-retrait:disabled{opacity:.5;cursor:default}
.fcp-adr > .fcp-examen{grid-column:1/-1}
@container (max-width: 620px){
  .fcp-adresses-liste{display:flex;flex-direction:column}
  .fcp-adr{display:block}
  .fcp-adr-ligne{display:grid;grid-template-columns:minmax(0,1fr) 44px;grid-template-areas:"adr x" "etat etat" "act act";row-gap:4px;align-items:start}
  .fcp-adr-texte{grid-area:adr;padding-top:10px}
  .fcp-adr-etat{grid-area:etat}
  .fcp-adr-actions{grid-area:act;flex-direction:row;flex-wrap:wrap}
  .fcp-adr-actions .fcp-adr-bouton{width:auto}
  .fcp-adr-retrait{grid-area:x}
  .fcp-etat{white-space:normal}
}
.fcp-propositions-liste > li{list-style:none}
.fcp-proposition{display:flex;align-items:center;gap:10px;min-height:44px;width:100%;cursor:pointer}
.fcp-proposition input{width:20px;height:20px;flex:0 0 auto}
.fcp-propositions-tete{display:flex;align-items:center;gap:6px;width:100%;min-height:44px;background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer;color:inherit}
.fcp-examen-gestes{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.fcp-petit{font-size:.82rem}
.fcp-histo summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:6px;font-weight:700;color:var(--color-svv-ink);list-style:none}
.fcp-histo summary::-webkit-details-marker{display:none}
.fcp-histo summary::before{content:'\\25B8';display:inline-block;min-width:1em;color:var(--color-svv-muted)}
.fcp-histo[open] > summary::before{content:'\\25BE'}
.fcp-a-preciser{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:6px 0}
.fcp-a-preciser-choix{flex:1 1 220px}
.fcp-a-preciser-choix select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;padding:6px 10px}
.fcp-sr{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.fcp-ajout{display:flex;flex-direction:column;gap:8px;padding:8px 10px;border-radius:10px;background:var(--color-svv-field)}
.fcp-avert-coord{display:flex;flex-direction:column;gap:2px;padding:6px 10px;border-radius:8px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink);font-size:.88rem;overflow-wrap:anywhere}
.fcp-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:8px}
.fcp-champ{display:flex;flex-direction:column;gap:3px;font-size:.88rem;font-weight:700;color:var(--color-svv-ink);min-width:0}
.fcp-champ input{min-height:44px;box-sizing:border-box;width:100%;max-width:100%}
.fcp-case{display:flex;align-items:center;gap:8px;min-height:44px;font-weight:700;color:var(--color-svv-ink)}
.fcp-case input{width:22px;height:22px}
.fcp-lien{border:0;background:transparent;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;padding:4px;min-height:32px;font:inherit}
.fcp-fort{font-weight:800}
.fcp-mini{min-height:40px;align-self:flex-start}
.fcp-pilules{display:flex;flex-wrap:wrap;gap:6px}
.fcp-pastille{display:inline-block;padding:1px 8px;border-radius:999px;font-size:.78rem;font-weight:800;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink)}
.fcp-contact{padding:4px 0}
.fcp-coord{color:var(--color-svv-muted)}
.fcp-ligne-coord{display:flex;align-items:flex-end;gap:6px}
.fcp-ligne-coord .fcp-champ{flex:1 1 auto}
.fcp-alerte{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-orange-soft);color:var(--color-svv-orange);font-weight:800}
.fcp-info{margin:0;font-weight:700;color:var(--color-svv-ink)}
.fcp-confirmer{font-weight:700}
.fcp-etape{margin:0 16px;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);display:flex;flex-direction:column;gap:8px}
.fcp-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.fcp-gauche{justify-content:flex-start}
.fcp-pied{padding:12px 16px;border-top:1px solid var(--color-svv-line)}
/* 🔴 (Arno, 25/11/2026) « agrandir les deux boutons du bas de la modale pour qu'ils occupent toute la largeur de la colonne » : Fermer et Valider côte à
   côte, 50 % chacun, même hauteur ; à 390 px, empilés pleine largeur, Valider au-dessus */
.fcp-pied{flex-wrap:nowrap}
.fcp-pied > .svv-btn{flex:1 1 0;width:auto;min-width:0;margin:0;min-height:44px;justify-content:center}
.fcp-pied-msg{margin:6px 16px 0}
.fcp-confirmation{padding:10px 12px;border-radius:10px;border-left:4px solid var(--color-svv-green);background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);font-weight:800;overflow-wrap:anywhere}
.fcp-sans-marge{margin:0}
@media (max-width:600px){.fcp-pied{flex-direction:column-reverse} .fcp-pied > .svv-btn{flex:0 0 auto;width:100%}}
`;
