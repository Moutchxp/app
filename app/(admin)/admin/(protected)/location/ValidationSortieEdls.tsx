'use client';

import { ChampNombre } from './ChampNombre';
import { calculVingtPourcent, estMotifMontantVingt, montantFr, origineDite, verifierMontantVingt, vingtPourcentDuDepot, type MontantVingt } from '../../../../lib/location/vingtPourcent';
import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EtatLecture, envoyer, useLecture } from './commun';
import { CSS_MODALE_ISSUE } from './ModaleIssue';
import { BlocsEnvois, CSS_CONFIRMATION_ENVOIS } from './ConfirmationEnvois';
import { CSS_PARCOURS, TexteDuMail } from './ParcoursPreavisSortie';
import { CSS_PREVISITE } from './PrevisiteAccueil';
import { useContextePreavis } from './preavisSynchro';
import type { FinParcours } from './ParcoursPreavisSortie';
import { libelleMail, type MailParti } from '../../../../lib/location/confirmationEnvois';
import { dateFrPreavis, type LignePreavisAccueil } from '../../../../lib/location/preavis';
import { etapesPreavis } from '../../../../lib/location/frisePreavis';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';
import { tonDuGroupe } from '../../../../lib/gestion/historiqueBien';
import {
  ALERTE_COPROPRIETE_NON_RENSEIGNEE, AVERTISSEMENT_PIECES, AVERTISSEMENT_SANS_EDL_JOINT, cleLocataire, cleProprietaire, COMPTE_RENDU_MAX, etatRetenue, MOTIF_RETENUE_IMPOSSIBLE,
  PARAGRAPHE_RETENUE_LOCATAIRE, texteProprietaire, verifierValidation,
} from '../../../../lib/location/validationSortie';
import { CSS_PIECES_SORTIE, PiecesSortie, type PieceListee } from './PiecesSortie';
import { prenomNom } from '../../../../lib/location/mailsPreavisSortie';
import { LIBELLE_ARRETE_COMPTES, arreteEnLettres } from '../../../../lib/location/arreteComptes';
import { AgSortie, ARRETE_AUCUNE_COPROPRIETE, corpsAg, CSS_AG_SORTIE, luAgPropre, saisieAgInitiale, verdictAg, type LuAgSortie, type SaisieAgEcran } from './AgSortie';
import { avecMentionAgLocataire, moisAnnee, quandRestitution, sansMentionAg } from '../../../../lib/location/agCopropriete';

/**
 * ══ 🔴🔴 « VALIDER L'ÉTAT DES LIEUX DE SORTIE » — LA FENÊTRE (spec d'Arno du 11/11/2026, lot 4) ═══════════════════════════════════════════════
 * Ouverte DIRECTEMENT par « Valider la sortie » sur la ligne de préavis (le sélecteur « Sélectionner / Enregistrer un préavis / Faire sortir »
 * n'y est plus, sur accord d'Arno pour CET endroit seulement ; le lien « Écran de sortie » reste). Trois temps :
 *   1. la SAISIE — « L'état des lieux de sortie a été réalisé », la date de sortie effective (jamais dans le futur), les locataires concernés
 *      (tous cochés), le compte rendu, les destinataires cochés un par un par famille (LOCATAIRES, puis PROPRIÉTAIRES ; aucun : copie interne
 *      seule), et comme avant « Informer nos partenaires » (bien en gestion) ;
 *   2. le RÉCAPITULATIF — l'action, les destinataires par famille, le nombre de mails, le texte intégral de chacun ; « Revenir » / « Confirmer » ;
 *      🔴 si le compte rendu porte les coordonnées d'une autre partie : « Attention : ce texte contient les coordonnées de … » en rouge, et
 *      « Confirmer » reste fermé tant que le texte n'est pas corrigé ;
 *   3. le RÉSULTAT — d'après la réponse du serveur : la sortie, l'étape 4 « Sortie validée » au vert, chaque mail (échecs en rouge).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

type FamilleVue = 'locataire' | 'proprietaire';
interface PartieVue { cle: string; famille: FamilleVue; nom: string; email: boolean }
interface MailPrevu { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; cle: string | null; famille: FamilleVue | 'interne' | 'partenaires'; pieces?: string[]; libelle?: string }
/** 🔴 (16/11/2026, 475) les dates d'AG dites par le serveur (récapitulatif, résultat) */
interface ResumeAg { lignes: [string, string][]; copropriete: string | null; aRattacher: boolean; motif?: string | null }
interface Apercu { mails: MailPrevu[]; alertes: { cle: string; libelle: string; phrase: string }[]; sansEmail: string[]; vacant: boolean; enGestion: boolean; date: string; retenue?: boolean; montantVingt?: MontantVingt | null; ag?: ResumeAg }
interface Resultat { date: string; vacant: boolean; restants: string[]; reintegrations?: string[]; envois: (MailParti & { famille: MailPrevu['famille']; pieces?: string[] })[]; retenue?: boolean; montantVingt?: MontantVingt | null; ag?: ResumeAg }
/** 🔴 (Arno, 25/11/2026, 23h15) la date de sortie proposée n'est pas validée : le refus, sous le champ. */
export const MOTIF_DATE_SORTIE_A_VALIDER = 'Validez la date de sortie (bouton à droite) avant de continuer.';
/** 🔴 (Arno, 25/11/2026, 22h06) « 400,00 € (calculé : 20 % de 2 000,00 €) » / « 380,00 € (saisi à la main) ». PUR. */
const montantVingtDit = (m: MontantVingt): string => `${montantFr(m.montant)} (${origineDite(m)})`;

/** 🔴🔴 Arno (24/11/2026) — « ajouter la date de clôture des comptes en plus de la dernière AGO connue et de l'AGO projetée » : la valeur de la
 *  rubrique « Date d'arrêté des comptes » du récapitulatif, lue sur la copropriété (« 31/12 », « non renseignée », « aucune copropriété rattachée »). PUR. */
export const valeurArreteRecap = (lu: Pick<LuAgSortie, 'copropriete' | 'arrete'>): string => (lu.copropriete === null ? ARRETE_AUCUNE_COPROPRIETE : arreteEnLettres(lu.arrete));

/** Les lignes AG du récapitulatif et du résultat (avec la copropriété, ou « à rattacher »). `arrete` : la rubrique de l'arrêté des comptes, juste
 *  avant « Dernière AGO » (récapitulatif seulement). */
function LignesAg({ ag, arrete }: { ag: ResumeAg; arrete?: string }) {
  return <>
    {arrete !== undefined && <div data-resume-arrete><dt>{LIBELLE_ARRETE_COMPTES}</dt><dd>{arrete}</dd></div>}
    {ag.lignes.map(([k, v]) => <div key={k} data-resume-ag={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    <div data-resume-ag-copropriete><dt>Copropriété</dt><dd>{ag.copropriete ?? 'à rattacher à une copropriété'}</dd></div>
  </>;
}
type Etape = { etape: 'saisie' } | { etape: 'recap'; a: Apercu } | { etape: 'resultat'; r: Resultat };

const aujourdhuiParis = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const MOT_FAMILLE: Record<FamilleVue, string> = { locataire: 'Locataires', proprietaire: 'Propriétaires' };

/** Les parties à cocher, lues dans l'encart du logement (le même que la fiche d'intervention). PUR. */
export function partiesDeLEncart(e: EncartLogement): PartieVue[] {
  const c = e.coordonnees;
  const locs = (c?.locataires ?? []).map((l) => ({ cle: cleLocataire(l.occupationId), famille: 'locataire' as const, nom: prenomNom({ nom: l.nom, prenom: l.prenom ?? null }), email: l.emails.length > 0 }));
  const pros = (c?.proprietaires ?? (e.proprietaire ? [{ id: e.proprietaire.id, nom: e.proprietaire.nom, emails: c?.proprietaire?.emails ?? [] }] : []))
    .map((p) => ({ cle: cleProprietaire(p.id), famille: 'proprietaire' as const, nom: p.nom, email: p.emails.length > 0 }));
  return [...locs, ...pros];
}

/** 🔴 Arno (23/11/2026) — les titres des deux textes de la retenue (à qui ils sont destinés), et le bloc propriétaire sans mail. */
export const TITRE_TEXTE_LOCATAIRES = 'Texte ajouté au mail du (des) locataire(s) — modifiable';
export const TITRE_TEXTE_PROPRIETAIRES = 'Texte ajouté au mail du (des) propriétaire(s) — modifiable';
export const AUCUN_MAIL_PROPRIETAIRE = 'Aucun mail au propriétaire pour cette sortie';

/**
 * 🔴 Arno (23/11/2026) — la ligne unique du récapitulatif : « vers mai 2027 (AGO attendue vers avril 2027, date approximative) » ; « au plus tard le
 * 15/04/2028 (AGO prévue le 15/03/2028) » ; case non cochée (ou aucune AGO) : « sans date ». PUR.
 */
export const restitutionAnnoncee = (ago: { date: string; statut: 'officielle' | 'projetee' | null } | null): string => (ago === null ? 'sans date'
  : ago.statut === 'officielle' ? `${quandRestitution(ago.date, 'officielle')} (AGO prévue le ${dateFrPreavis(ago.date)})`
    : `${quandRestitution(ago.date, ago.statut)} (AGO attendue vers ${moisAnnee(ago.date)}, date approximative)`);
export const TITRE_SANS_PIECE = 'Aucun état des lieux joint';
export const TEXTE_SANS_PIECE = 'Pour la bonne clôture du dossier de sortie, le fichier d’état des lieux doit être joint à ce mail.';
/** Au moins un mail au locataire ou au propriétaire part, et AUCUN ne porte de pièce jointe. PUR. */
export const sansPieceJointe = (a: { mails: readonly { famille: string; pieces?: readonly string[] }[] }): boolean => {
  const vises = a.mails.filter((m) => m.famille === 'locataire' || m.famille === 'proprietaire');
  return vises.length > 0 && vises.every((m) => (m.pieces ?? []).length === 0);
};
export function ValidationSortieEdls({ l, onFermer }: { l: LignePreavisAccueil; onFermer: (fin: FinParcours | null) => void }) {
  // 🔴 Arno (11/11/2026) — la fenêtre bloque le défilement de la page, COMPTÉ (commun à toutes les fenêtres ; toujours rendu à la dernière fermée).
  useVerrouDefilement();
  const titreId = useId();
  const { base } = useContextePreavis();
  const encart = useLecture<EncartLogement>(`encartBail=${l.occupationId}`, base);
  const partenaires = useLecture<{ enGestion: boolean; liste: { adresse: string; libelle?: string | null }[] }>(`partenairesSortie=${l.occupationId}`, base);
  const jour = aujourdhuiParis();
  const [etape, setEtape] = useState<Etape>({ etape: 'saisie' });
  const [realise, setRealise] = useState(false);
  const [date, setDate] = useState(jour);
  /* 🔴🔴 Arno (25/11/2026, 23h15) — « la date de sortie qui s'autocomplète toute seule est la date du jour […] elle ne doit pas être validée par défaut,
     elle est juste proposée ; la validation doit être obligatoire ; il est bien évidemment possible de modifier la date à sa convenance » : proposée
     NON validée ; « Valider cette date » la valide ; toute modification fait tomber la validation */
  const [dateValidee, setDateValidee] = useState(false);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [sortants, setSortants] = useState<number[]>(l.locataires.map((x) => x.occupationId));
  const [compteRendu, setCompteRendu] = useState('');
  const [destinataires, setDestinataires] = useState<string[]>([]);
  const [informer, setInformer] = useState(true);
  // 🔴 Arno (24/11/2026) — les partenaires cochés un par un ; `null` : tous (cochés par défaut, comme avant)
  const [partenairesChoisis, setPartenairesChoisis] = useState<string[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  // 🔴 Arno (11/11/2026, 468) — les pièces jointes (Drive du bien, ordinateur) et la retenue de 20 % (selon la copropriété de la fiche du bien).
  const [pieces, setPieces] = useState<PieceListee[]>([]);
  const copro = useLecture<{ lotId: number; copropriete: boolean | null; depotCentimes?: number | null }>(`retenueSortie=${l.occupationId}`, base);
  const copropriete = copro.etat.etat === 'ok' ? copro.etat.data.copropriete : undefined;
  // 🔴🔴 Arno (25/11/2026, 22h06) — le MONTANT des 20 % : calculé sur le dépôt de garantie des conditions d'entrée s'il est connu (prérempli, modifiable),
  //    sinon saisi à la main (obligatoire) ; `null` = la valeur calculée, telle quelle
  const depotCentimes = copro.etat.etat === 'ok' ? copro.etat.data.depotCentimes ?? null : null;
  const [montantVingtSaisi, setMontantVingtSaisi] = useState<string | null>(null);
  // 🔴 (Arno, 25/11/2026, 23h12) un montant vide, nul, négatif ou illisible : le refus est dit SOUS le champ, qui défile à l'écran
  const [erreurMontant, setErreurMontant] = useState<string | null>(null);
  const montantVingtTexte = montantVingtSaisi ?? (depotCentimes !== null ? vingtPourcentDuDepot(depotCentimes).toFixed(2).replace('.', ',') : '');
  const etatCase = copropriete === undefined ? null : etatRetenue(copropriete);
  const [retenue, setRetenue] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (retenue === null && etatCase !== null) setRetenue(etatCase === 'possible'); }, [retenue, etatCase]);
  const retenueAppliquee = retenue === true && etatCase !== 'impossible';
  const [paragrapheRetenue, setParagrapheRetenue] = useState(PARAGRAPHE_RETENUE_LOCATAIRE);
  // 🔴 Arno (16/11/2026, 475) — case 20 % cochée : les dates d'AG de la copropriété (lues une fois, saisies ici).
  const luAg = useLecture<LuAgSortie>(`agSortie=${l.occupationId}`, base);
  const ag = luAg.etat.etat === 'ok' ? luAgPropre(luAg.etat.data) : null;
  const [saisieAg, setSaisieAg] = useState<SaisieAgEcran | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (saisieAg === null && ag !== null) setSaisieAg(saisieAgInitiale(ag)); }, [saisieAg, ag]);
  // 🔴 Arno (23/11/2026) — une copropriété vient d'être rattachée (fiche créée depuis la fenêtre, relue) : « Immeuble en copropriété » coché d'office
  const coproRattacheeId = ag?.copropriete?.id ?? null;
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (coproRattacheeId !== null) setSaisieAg((x) => (x === null || x.coproOui ? x : { ...x, coproOui: true })); }, [coproRattacheeId]);
  /** la saisie AG change : la mention de la prochaine AG suit dans le paragraphe des locataires (le reste du texte, modifié, est gardé) */
  const changerAg = (n: SaisieAgEcran): void => {
    setSaisieAg(n);
    // 🔴 Arno (23/11/2026) — l'AGO QUI COMPTE pour le locataire (et non la simple prochaine AGO) part dans son paragraphe
    setParagrapheRetenue((t) => (n.mention && n.ago ? avecMentionAgLocataire(t, n.ago.date, n.ago.statut, n.ago.cloture) : sansMentionAg(t)));
  };
  // 🔴 Arno (23/11/2026) — le propriétaire reçoit la MÊME date que le locataire : l'AGO qui compte (jamais deux dates différentes)
  const agoProprio = saisieAg !== null && saisieAg.mention && saisieAg.ago != null ? saisieAg.ago : null;
  // 🔴 Arno (23/11/2026) — trois paragraphes, plus synthétiques ; « vos locataires » s'ils sont plusieurs à sortir
  const phraseProprietaires = texteProprietaire({ jour: agoProprio?.date ?? null, statut: agoProprio?.statut ?? null, cloture: agoProprio?.cloture ?? null, pluriel: sortants.length > 1 });
  /* 🔴 Arno (23/11/2026) — « créer le même bloc de texte pour le texte qui sera envoyé au propriétaire, avec la même possibilité de le modifier » :
     `null` = le texte calculé (il suit la date en direct) ; modifié à la main, il est gardé tel quel et c'est lui qui part */
  const [phraseProprioSaisie, setPhraseProprioSaisie] = useState<string | null>(null);
  /* 🔴 Arno (23/11/2026) — « Confirmer et envoyer » sans aucune pièce jointe : la fenêtre plein écran « Aucun état des lieux joint » ; « Revenir ajouter
     l'état des lieux » ramène au bloc « Pièces jointes au compte rendu » */
  const [alerteSansPiece, setAlerteSansPiece] = useState(false);
  const [allerAuxPieces, setAllerAuxPieces] = useState(false);
  const phraseProprioTexte = phraseProprioSaisie ?? phraseProprietaires;
  const parties = useMemo(() => (encart.etat.etat === 'ok' ? partiesDeLEncart(encart.etat.data) : []), [encart.etat]);
  const mailProprietaire = parties.some((p) => p.famille === 'proprietaire' && p.email && destinataires.includes(p.cle));
  const enGestion = partenaires.etat.etat === 'ok' && partenaires.etat.data.enGestion && partenaires.etat.data.liste.length > 0;
  const listePartenaires = partenaires.etat.etat === 'ok' ? partenaires.etat.data.liste ?? [] : [];
  const partenairesCoches = informer ? partenairesChoisis ?? listePartenaires.map((x) => x.adresse) : [];
  const basculerPartenaire = (adresse: string): void => setPartenairesChoisis(partenairesCoches.includes(adresse)
    ? partenairesCoches.filter((x) => x !== adresse) : [...partenairesCoches, adresse]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || envoi) return;
      // la fenêtre « Aucun état des lieux joint » d'abord : Échap la referme seule (rien n'est envoyé)
      if (alerteSansPiece) { setAlerteSansPiece(false); return; }
      if (etape.etape !== 'resultat') onFermer(null);
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, etape, onFermer, alerteSansPiece]);
  // « Revenir ajouter l'état des lieux » : retour à la saisie, défilement jusqu'au bloc des pièces jointes
  useEffect(() => {
    if (!allerAuxPieces || etape.etape !== 'saisie') return;
    const bloc = document.querySelector('[data-fenetre-validation-sortie] [data-pieces-sortie]') as HTMLElement | null;
    bloc?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    setAllerAuxPieces(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [allerAuxPieces, etape.etape]);

  const verdictSaisie = verifierValidation({ realise, date, sortants, compteRendu }, jour);
  // 🔴 (16/11/2026, 475) case 20 % cochée : rien ne part sans la dernière AG, la prochaine ET son statut (l'historique installé)
  // (lecture en cours : on attend ; lecture impossible : le serveur décide, et dit pourquoi s'il refuse)
  const verdictAgSaisie = !retenueAppliquee || luAg.etat.etat === 'erreur' ? { ok: true as const }
    : luAg.etat.etat === 'charge' || saisieAg === null ? { ok: false as const, motif: 'Lecture des assemblées générales en cours…', champs: [] } : verdictAg(saisieAg, ag);
  const verdict = !verdictSaisie.ok ? verdictSaisie : verdictAgSaisie;
  const corps = { occupationId: l.occupationId, realise, date, sortants, compteRendu, destinataires, informerPartenaires: enGestion && informer,
    ...(enGestion && informer ? { partenaires: partenairesCoches } : {}),
    pieceIds: pieces.map((p) => p.id), retenue: retenueAppliquee, paragrapheRetenue, ...(retenueAppliquee && phraseProprioSaisie !== null ? { phraseProprietaire: phraseProprioSaisie } : {}),
    ...(retenueAppliquee ? { montantVingt: montantVingtTexte } : {}),
    ...(retenueAppliquee && saisieAg !== null ? corpsAg(saisieAg, ag) : {}) };
  const basculer = (cle: string): void => setDestinataires((d) => (d.includes(cle) ? d.filter((x) => x !== cle) : [...d, cle]));

  /** 🔴 (23h12) le refus du montant sous son champ, le champ amené à l'écran (et le curseur dedans) */
  const montrerErreurMontant = (motif: string): void => {
    setErreurMontant(motif);
    setTimeout(() => {
      const champ = document.querySelector('[data-fenetre-validation-sortie] [data-montant-vingt-champ]') as HTMLInputElement | null;
      champ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      champ?.focus({ preventScroll: true });
    }, 0);
  };
  /** la règle du montant, avant tout appel (le serveur la refait) ; `false` : refusé, dit sous le champ */
  const montantLisible = (): boolean => {
    if (!retenueAppliquee) return true;
    const v = verifierMontantVingt(montantVingtTexte);
    if (v.ok) return true;
    montrerErreurMontant(v.motif);
    return false;
  };
  /** 🔴 (23h15) la date de sortie doit être VALIDÉE (bouton à droite) avant d'avancer ; sinon le refus sous le champ, le champ amené à l'écran */
  const dateValideeOuDit = (): boolean => {
    if (dateValidee) return true;
    setErreurDate(MOTIF_DATE_SORTIE_A_VALIDER);
    setTimeout(() => {
      const champ = document.querySelector('[data-fenetre-validation-sortie] [data-date-sortie-effective]') as HTMLInputElement | null;
      champ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      champ?.focus({ preventScroll: true });
    }, 0);
    return false;
  };
  const voirRecap = async (): Promise<void> => {
    setRefus(null); setErreurMontant(null); setErreurDate(null);
    if (!dateValideeOuDit()) return;
    if (!montantLisible()) return;
    setEnvoi(true);
    const r = await envoyer({ action: 'apercu-validation-sortie', ...corps }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { if (estMotifMontantVingt(r.motif)) montrerErreurMontant(r.motif); else setRefus(r.motif); return; }
    setEtape({ etape: 'recap', a: r.data as Apercu });
  };
  const confirmer = async (): Promise<void> => {
    setRefus(null);
    if (!dateValidee) { setEtape({ etape: 'saisie' }); dateValideeOuDit(); return; }
    if (!montantLisible()) { setEtape({ etape: 'saisie' }); return; }
    setEnvoi(true);
    const r = await envoyer({ action: 'valider-sortie-edls', ...corps }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { if (estMotifMontantVingt(r.motif)) { setEtape({ etape: 'saisie' }); montrerErreurMontant(r.motif); } else setRefus(r.motif); return; }
    setEtape({ etape: 'resultat', r: r.data as Resultat });
  };
  const fermerResultat = (r: Resultat): void => {
    const partis = r.envois.filter((x) => x.envoye).length;
    onFermer({ geste: 'sortie', noms: l.locataires.filter((x) => sortants.includes(x.occupationId)).map((x) => x.nom), avecMails: r.envois.length > 0,
      phrase: `État des lieux de sortie validé le ${dateFrPreavis(r.date)} — ${r.vacant ? 'le logement est libre' : `le logement reste loué à ${r.restants.join(', ')}`} ; ${partis} mail${partis > 1 ? 's' : ''} envoyé${partis > 1 ? 's' : ''}.` });
  };

  const familles = (['locataire', 'proprietaire'] as const);
  let contenu: ReactNode;
  if (etape.etape === 'saisie') {
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>Valider l’état des lieux de sortie</h2>
      <p className="loc-muet pss-rien">{l.locataires.map((x) => x.nom).join(', ')} — {l.adresse ?? `Bien ${l.lotId}`}</p>
      <label className="pvv-case vse-realise"><input type="checkbox" checked={realise} onChange={(e) => { setRealise(e.target.checked); setRefus(null); }} data-edls-realise />
        <span>L’état des lieux de sortie a été réalisé *</span></label>
      {/* 🔴🔴 Arno (25/11/2026, 23h15) — la date du jour est PROPOSÉE (bord orange, « Date proposée — à valider ») ; « Valider cette date » à droite
          (sous le champ à 390 px) → « ✓ Date validée », bord vert ; une modification fait tomber la validation */}
      <div className={`vse-date-bloc vse-date-bloc--${dateValidee ? 'validee' : 'proposee'}`} data-date-sortie-etat={dateValidee ? 'validee' : 'proposee'}>
        <div className="vse-date-ligne">
          <label className="pvs-champ vse-date"><span className="pvs-libelle">{'Date de sortie effective *'}</span>
            <input type="date" value={date} max={jour} aria-invalid={erreurDate !== null} aria-describedby={`${titreId}-date-etat`}
              onChange={(e) => { setDate(e.target.value); setDateValidee(false); setRefus(null); setErreurDate(null); }} data-date-sortie-effective /></label>
          <button type="button" className={`svv-btn gst-btn vse-date-valider${dateValidee ? ' vse-date-valider--ok' : ' svv-btn-outline'}`} aria-pressed={dateValidee}
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => { setDateValidee(true); setErreurDate(null); setRefus(null); }} data-valider-date-sortie>
            {dateValidee ? '✓ Date validée' : 'Valider cette date'}</button>
        </div>
        {!dateValidee && <p id={`${titreId}-date-etat`} className="vse-date-mention" data-date-sortie-proposee>Date proposée — à valider</p>}
        {erreurDate !== null && <p className="cp-refus vse-erreur-champ" role="alert" data-date-sortie-erreur>{erreurDate}</p>}
      </div>
      <fieldset className="pvv-choix" data-locataires-concernes>
        <legend className="pvs-libelle">Locataires concernés *</legend>
        {l.locataires.map((x) => (
          <label key={x.occupationId} className="pvv-case">
            <input type="checkbox" checked={sortants.includes(x.occupationId)} data-sortant={x.occupationId}
              onChange={(e) => setSortants((s) => (e.target.checked ? [...s, x.occupationId] : s.filter((o) => o !== x.occupationId)))} />
            <span>{x.nom}</span>
          </label>))}
      </fieldset>
      <label className="pvs-champ"><span className="pvs-libelle">Compte rendu de l’état des lieux de sortie</span>
        <textarea value={compteRendu} maxLength={COMPTE_RENDU_MAX} onChange={(e) => { setCompteRendu(e.target.value); setRefus(null); }} rows={8} data-compte-rendu-edls /></label>
      {/* 🔴 Arno (11/11/2026) — la RETENUE DE 20 % du dépôt de garantie (article 22), selon la copropriété de la fiche du bien. */}
      <fieldset className="pvv-choix vse-retenue" data-retenue-sortie={etatCase ?? 'chargement'}>
        <label className="pvv-case">
          <input type="checkbox" checked={retenueAppliquee} disabled={etatCase === null || etatCase === 'impossible'} onChange={(e) => setRetenue(e.target.checked)} data-retenue-case />
          <span>Retenue de 20 % du dépôt de garantie</span>
        </label>
        {etatCase === 'impossible' && <p className="loc-muet" data-retenue-impossible>{MOTIF_RETENUE_IMPOSSIBLE}</p>}
        {/* 🔴 Arno (23/11/2026) — une copropriété RATTACHÉE au bien : plus de « copropriété non renseignée » (la case « Immeuble en copropriété »
            est cochée d'office et renseigne la fiche du bien à la confirmation) */}
        {/* 🔴🔴 Arno (24/11/2026) — RETIRÉ quand la case 20 % est cochée (accord d'Arno, doublon de « Copropriété : aucune copropriété rattachée — sans
            elle, le suivi des 20 % restera incomplet. » et du bouton de tête du bloc) ; case décochée, le bloc 20 % n'est pas affiché : rien d'autre ne
            le dit, le message reste (question posée à Arno) */}
        {etatCase === 'a_verifier' && coproRattacheeId === null && !retenueAppliquee && (
          <p className="vse-orange" role="status" data-retenue-a-verifier>{ALERTE_COPROPRIETE_NON_RENSEIGNEE}{' '}
            {copro.etat.etat === 'ok' && <a href={`/admin/location/bien/${copro.etat.data.lotId}`} target="_blank" rel="noopener" data-lien-copropriete>Renseigner la copropriété sur la fiche du bien</a>}</p>
        )}
        {/* 🔴🔴 Arno (25/11/2026, 22h06) — sous la case cochée : le MONTANT des 20 % retenus, calculé sur le dépôt connu (modifiable) ou saisi à la main */}
        {retenueAppliquee && (
          <div className="vse-montant-vingt" data-montant-vingt>
            <label className="pvs-champ"><span className="pvs-libelle">Montant des 20 % retenus (€) *</span>
              <ChampNombre value={montantVingtTexte} placeholder="ex. 400,00" onChange={(e) => { setMontantVingtSaisi(e.target.value); setRefus(null); setErreurMontant(null); }}
                aria-describedby={`${titreId}-calcul-vingt`} aria-invalid={erreurMontant !== null} data-montant-vingt-champ /></label>
            {erreurMontant !== null && <p className="cp-refus vse-erreur-champ" role="alert" data-montant-vingt-erreur>{erreurMontant}</p>}
            <p id={`${titreId}-calcul-vingt`} className="loc-muet" data-montant-vingt-calcul>
              {depotCentimes !== null ? `${calculVingtPourcent(depotCentimes)}${montantVingtSaisi !== null && montantVingtSaisi !== vingtPourcentDuDepot(depotCentimes).toFixed(2).replace('.', ',') ? ' — montant modifié à la main' : ''}`
                : 'Dépôt de garantie non renseigné dans les conditions d’entrée : saisissez le montant des 20 % retenus.'}</p>
          </div>)}
        {/* 🔴 Arno (16/11/2026, 475) — sous la case cochée : les dates d'AG de la copropriété */}
        {retenueAppliquee && (luAg.etat.etat !== 'ok' ? <EtatLecture etat={luAg.etat} />
          : ag !== null && saisieAg !== null && <AgSortie key={`copro-${ag.copropriete?.id ?? 'aucune'}`} lu={ag} s={saisieAg} onChange={changerAg} desactive={envoi} dateSortie={date} onRelire={() => { luAg.rafraichir(); copro.rafraichir(); }} />)}
        {retenueAppliquee && (
          // 🔴 Arno (23/11/2026) — la zone occupe TOUTE la largeur de la colonne (le bloc aligne ses enfants à gauche : elle s'y réduisait)
          // 🔴 Arno (23/11/2026, suite) — un titre qui dit à qui le texte est destiné (avant : « Paragraphe ajouté aux mails des locataires (modifiable) »)
          <label className="pvs-champ vse-paragraphe-retenue"><span className="pvs-libelle">{TITRE_TEXTE_LOCATAIRES}</span>
            <textarea value={paragrapheRetenue} onChange={(e) => setParagrapheRetenue(e.target.value)} rows={6} data-retenue-paragraphe /></label>
        )}
        {/* 🔴🔴 Arno (23/11/2026) — le texte des PROPRIÉTAIRES : la même zone, modifiable (avant : « Aux propriétaires : « … » », en lecture) ;
            préremplie par le texte calculé (même date que le locataire : l'AGO qui compte), qui suit en direct tant qu'on ne l'a pas modifié ;
            sans mail au propriétaire : grisée, et on le dit */}
        {retenueAppliquee && (
          <label className={`pvs-champ vse-paragraphe-retenue${mailProprietaire ? '' : ' vse-grise'}`} data-retenue-proprietaires>
            <span className="pvs-libelle">{TITRE_TEXTE_PROPRIETAIRES}</span>
            <textarea value={phraseProprioTexte} disabled={!mailProprietaire} onChange={(e) => setPhraseProprioSaisie(e.target.value)} rows={6} data-retenue-proprietaires-texte />
            {!mailProprietaire && <span className="loc-muet" data-retenue-sans-mail-proprietaire>{AUCUN_MAIL_PROPRIETAIRE}</span>}</label>
        )}
      </fieldset>
      <PiecesSortie occupationId={l.occupationId} lotId={copro.etat.etat === 'ok' ? copro.etat.data.lotId : null} pieces={pieces} onChange={setPieces} desactive={envoi} />
      <fieldset className="pvv-choix vse-destinataires" data-destinataires-sortie>
        <legend className="pvs-libelle">Destinataires du compte rendu</legend>
        {encart.etat.etat !== 'ok' ? <EtatLecture etat={encart.etat} /> : familles.map((f) => {
          const liste = parties.filter((p) => p.famille === f);
          return (
            <div key={f} className={`vse-famille vse-famille--${tonDuGroupe(f)}`} data-famille-destinataires={f}>
              <p className="vse-famille-titre"><span aria-hidden="true" className="vse-pastille" />{MOT_FAMILLE[f]}</p>
              {liste.length === 0 ? <p className="loc-muet">Aucun.</p> : liste.map((p) => (
                <label key={p.cle} className="pvv-case">
                  <input type="checkbox" checked={p.email && destinataires.includes(p.cle)} disabled={!p.email} onChange={() => basculer(p.cle)} data-destinataire-sortie={p.cle} />
                  <span>{p.nom}{p.email ? '' : ' (pas d’adresse e-mail)'}</span>
                </label>))}
            </div>
          );
        })}
        <p className="loc-muet" data-copie-interne>Chaque destinataire coché reçoit SON mail (seul destinataire, sans copie visible). Aucun coché : copie interne seule (gestion@ et vous).</p>
      </fieldset>
      {enGestion && (
        <div className="vse-partenaires" data-bloc-partenaires>
          {/* 🔴 Arno (24/11/2026) — décocher la case principale décoche et masque la liste ; la recocher recoche tous les partenaires */}
          <label className="pvv-case"><input type="checkbox" checked={informer} onChange={(e) => { setInformer(e.target.checked); setPartenairesChoisis(null); }} data-informer-partenaires />
            <span>Informer nos partenaires (bien en gestion)</span></label>
          {/* 🔴 Arno (24/11/2026) — « afficher en dessous les différents partenaires possibles à informer et pouvoir les sélectionner individuellement » */}
          {informer && (
            <fieldset className="vse-partenaires-liste" aria-label="Partenaires à informer" data-liste-partenaires>
              {listePartenaires.map((x) => (
                <label key={x.adresse} className="pvv-case">
                  <input type="checkbox" checked={partenairesCoches.includes(x.adresse)} onChange={() => basculerPartenaire(x.adresse)} data-partenaire-sortie={x.adresse} />
                  <span>{x.libelle ? <><strong>{x.libelle}</strong> — </> : null}{x.adresse}</span>
                </label>))}
              {partenairesCoches.length === 0 && <p className="loc-muet" data-aucun-partenaire>Aucun partenaire coché : aucun mail ne leur partira.</p>}
              <p className="loc-muet" data-partenaires-un-par-mail>Chaque partenaire coché reçoit SON mail : il en est le seul destinataire (gestion@ et vous en copie, comme avant).</p>
            </fieldset>)}
        </div>
      )}
      {!verdict.ok && (realise || compteRendu !== '' || !verdictAgSaisie.ok) && <p className="cp-refus" role="status" data-validation-message>{verdict.motif}</p>}
      {refus !== null && <p className="cev-alerte" role="alert" data-validation-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => onFermer(null)} disabled={envoi} data-annuler-validation>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { void voirRecap(); }} disabled={envoi || !verdict.ok} data-recap-validation>
          {envoi ? 'Préparation…' : 'Voir le récapitulatif'}</button>
      </div>
    </>;
  } else if (etape.etape === 'recap') {
    const a = etape.a;
    const groupes: [MailPrevu['famille'], string][] = [['locataire', 'Locataires'], ['proprietaire', 'Propriétaires'], ['interne', 'Copie interne (agence)'], ['partenaires', 'Nos partenaires']];
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>Récapitulatif — Valider l’état des lieux de sortie</h2>
      <p className="loc-muet pss-rien" data-rien-enregistre>Rien n’est encore enregistré ni envoyé : vérifiez, puis « Confirmer et envoyer ».</p>
      <dl className="mis-resume" data-resume-validation>
        <div><dt>Action</dt><dd>Sortie effective le {dateFrPreavis(a.date)} — {a.vacant ? 'le logement devient libre' : 'le logement reste loué'}</dd></div>
        <div><dt>Locataires concernés</dt><dd>{l.locataires.filter((x) => sortants.includes(x.occupationId)).map((x) => x.nom).join(', ')}</dd></div>
        {/* 🔴 (Arno, 25/11/2026, 22h06) le montant des 20 % retenus suit au récapitulatif */}
        {a.montantVingt != null && <div data-resume-montant-vingt><dt>Retenue de 20 %</dt><dd>{montantVingtDit(a.montantVingt)}</dd></div>}
        {a.ag !== undefined && <LignesAg ag={a.ag} arrete={ag !== null ? valeurArreteRecap(ag) : undefined} />}
        {/* 🔴🔴 Arno (23/11/2026) — RETIRÉ, accord d'Arno (« supprimer de la page le bloc d'information (AGO indiquée au(x) locataire(s), Texte ajouté au mail,
            Date indiquée au(x) propriétaire(s)) : il y a trop d'informations, il faut aller à l'essentiel ») : ces trois rubriques sont remplacées par UNE
            ligne — quand le solde sera restitué, et l'AGO qui le permet ; le texte exact reste dans « Afficher le texte » de chaque mail */}
        {a.ag !== undefined && saisieAg !== null && (
          <div data-resume-restitution><dt>Restitution des 20 % annoncée</dt><dd>{restitutionAnnoncee(saisieAg.mention ? saisieAg.ago ?? null : null)}</dd></div>)}
        {/* 🔴🔴 Arno (24/11/2026) — RETIRÉ, accord d'Arno : la rubrique « Texte ajouté au mail du (des) propriétaire(s) » (le texte reste lisible par
            « Afficher le texte du mail » sous le mail du propriétaire) */}
      </dl>
      {a.alertes.map((x) => <p key={x.cle} className="cev-alerte" role="alert" data-alerte-coordonnees={x.cle}>Mail à {x.libelle} — {x.phrase} Corrigez le compte rendu avant l’envoi.</p>)}
      {/* 🔴 Arno (23/11/2026) — sans pièce jointe, le mail du locataire n'annonce pas l'état des lieux : on le dit (aucun envoi bloqué) */}
      {/* (23/11/2026, suite) le mail du PROPRIÉTAIRE annonce aussi l'état des lieux joint : l'avertissement vaut pour les deux familles */}
      {sansPieceJointe(a) && (
        <p className="cev-alerte" role="status" data-avertissement-sans-edl>{AVERTISSEMENT_SANS_EDL_JOINT}</p>)}
      <p className="pss-sous-titre" data-nombre-mails>{a.mails.length === 1 ? '1 mail partira.' : `${a.mails.length} mails partiront.`}</p>
      {groupes.map(([f, mot]) => {
        const mails = a.mails.filter((m) => m.famille === f);
        if (mails.length === 0) return null;
        return (
          <div key={f} className={`vse-famille${f === 'locataire' || f === 'proprietaire' ? ` vse-famille--${tonDuGroupe(f)}` : ''}`} data-recap-famille={f}>
            <p className="vse-famille-titre"><span aria-hidden="true" className="vse-pastille" />{mot} ({mails.length})</p>
            <ul className="cev-mails">{mails.map((m, i) => (
              <li key={`${i}-${m.sorte}`} className="cev-mail" data-mail-prevu={m.sorte}>
                <p className="cev-mail-titre">{libelleMail(m)}{f === 'partenaires' && m.libelle ? <> — <span data-nom-partenaire>{m.libelle}</span></> : null}</p>
                <dl className="cev-dl"><dt>Objet</dt><dd data-objet>{m.objet}</dd><dt>Destinataire</dt><dd data-a>{m.a.join(', ')}</dd>
                  <dt>En copie</dt><dd data-cc>{m.cc.length > 0 ? m.cc.join(', ') : 'aucune'}</dd></dl>
                {(m.pieces ?? []).length > 0 && <>
                  <p className="vse-pieces-mail" data-pieces-mail>📎 Pièces jointes : {(m.pieces ?? []).join(', ')}</p>
                  {f !== 'interne' && <p className="vse-orange" data-avertissement-pieces>{AVERTISSEMENT_PIECES}</p>}
                </>}
                <TexteDuMail key={m.texte} texte={m.texte} ouvert={f !== 'interne'} />
              </li>))}</ul>
          </div>
        );
      })}
      {a.sansEmail.map((n) => <p key={n} className="mis-note" data-sans-email>⚠ {n} : pas d’adresse e-mail, ne recevra pas ce mail</p>)}
      {refus !== null && <p className="cev-alerte" role="alert" data-validation-refus>{refus}</p>}
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={() => setEtape({ etape: 'saisie' })} disabled={envoi} data-revenir-validation>Revenir</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => { if (sansPieceJointe(a)) setAlerteSansPiece(true); else void confirmer(); }} disabled={envoi || a.alertes.length > 0} data-confirmer-validation>
          {envoi ? 'Envoi…' : 'Confirmer et envoyer'}</button>
      </div>
    </>;
  } else {
    const r = etape.r;
    const etapes = etapesPreavis(l, jour, { sortieValidee: r.date, retenue: r.retenue === true });
    contenu = <>
      <h2 id={titreId} className="mis-titre" data-titre-validation-sortie>✓ Sortie validée</h2>
      <dl className="mis-resume" data-resume>
        <div><dt>Sortie effective</dt><dd>le {dateFrPreavis(r.date)}</dd></div>
        <div><dt>Le logement</dt><dd>{r.vacant ? 'libre' : `reste loué à ${r.restants.join(', ')}`}</dd></div>
        <div><dt>Retenue de 20 %</dt><dd data-resultat-retenue>{r.retenue ? `Retenue 20 % appliquée${r.montantVingt != null ? ` : ${montantVingtDit(r.montantVingt)}` : ''}` : 'non appliquée'}</dd></div>
        {r.ag !== undefined && <LignesAg ag={r.ag} />}
        {(r.reintegrations ?? []).map((x) => <div key={x}><dt>Regroupement</dt><dd>{x}</dd></div>)}
      </dl>
      {r.ag?.motif && <p className="cev-alerte" role="alert" data-resultat-ag-motif>{r.ag.motif}</p>}
      <ol className="frp vse-frise" data-frise-resultat>{etapes.map((e) => (
        <li key={e.cle} className={`frp-etape frp-etape--${e.statut}`} data-etape={e.cle} data-statut-etape={e.statut}>
          <div className="frp-tete"><span className="frp-numero" aria-hidden="true" data-pastille-etape>{e.statut === 'faite' ? '✓' : e.numero}</span><span className="frp-titre"><span className="frp-lu">Étape {e.numero} : </span>{e.titre}</span>{e.cle === 'sortie' && <span className="frp-statut" data-libelle-etape>{e.libelle}</span>}</div>
        </li>))}</ol>
      <BlocsEnvois issue={{ informer: false, mails: r.envois, motifGlobal: r.envois.length === 0 ? 'Aucun mail n’est parti pour cette opération.' : null }} sansPartenaires />
      <div className="mis-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" onClick={() => fermerResultat(r)} data-fermer-validation>Fermer</button>
      </div>
    </>;
  }
  const echec = etape.etape === 'resultat' && etape.r.envois.some((m) => !m.envoye);
  const boite = (
    <div className="mis-voile">
      <style>{CSS_PARCOURS + CSS_MODALE_ISSUE + CSS_CONFIRMATION_ENVOIS + CSS_PREVISITE + CSS_VALIDATION_SORTIE + CSS_PIECES_SORTIE + CSS_AG_SORTIE}</style>
      <div className={`mis-boite pss-boite ${etape.etape === 'resultat' ? (echec ? 'mis-boite--attention' : 'mis-boite--succes') : 'pss-boite-recap'}`} role="dialog" aria-modal="true"
        aria-labelledby={titreId} data-fenetre-validation-sortie={etape.etape}>
        {contenu}
      </div>
      {/* 🔴 Arno (23/11/2026) — « afficher une modale en plein écran qui lui signale l'absence de pièce jointe, et lui rappelle que pour la bonne clôture
          du dossier de sortie du locataire il faut joindre à ce mail le fichier d'état des lieux. Deux boutons : revenir en arrière pour ajouter la
          pièce jointe manquante, ou "Valider sans pièce jointe". » — « Valider sans pièce jointe » envoie EXACTEMENT comme avant */}
      {alerteSansPiece && etape.etape === 'recap' && (
        <div className="vse-plein" role="alertdialog" aria-modal="true" aria-labelledby="vse-plein-titre" data-alerte-sans-piece>
          <div className="vse-plein-boite">
            <h2 id="vse-plein-titre" className="vse-plein-titre">{TITRE_SANS_PIECE}</h2>
            <p className="vse-plein-texte">{TEXTE_SANS_PIECE}</p>
            <div className="vse-plein-actions">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" autoFocus
                onClick={() => { setAlerteSansPiece(false); setEtape({ etape: 'saisie' }); setAllerAuxPieces(true); }} data-sans-piece-revenir>Revenir ajouter l’état des lieux</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi}
                onClick={() => { setAlerteSansPiece(false); void confirmer(); }} data-sans-piece-valider>Valider sans pièce jointe</button>
            </div>
          </div>
        </div>)}
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme (couleurs de famille = celles du bloc PARTIES : locataire vert, proprietaire rouge). */
export const CSS_VALIDATION_SORTIE = `
.vse-plein{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:var(--color-svv-surface)}
.vse-plein-boite{width:100%;max-width:560px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:14px;border-top:6px solid var(--color-svv-urgence-orange);background:var(--color-svv-amber-soft);color:var(--color-svv-ink)}
.vse-plein-titre{margin:0;font-size:1.35rem;font-weight:800;overflow-wrap:anywhere}
.vse-plein-texte{margin:0;font-size:1.05rem;line-height:1.5;overflow-wrap:anywhere}
.vse-plein-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:10px}
.vse-plein-actions .gst-btn{min-height:48px;width:100%;margin:0;box-sizing:border-box}
.vse-realise{font-weight:800}
.vse-date input{min-height:44px}
/* 🔴 (Arno, 25/11/2026, 23h15) la date de sortie proposee (bord orange) / validee (bord vert) ; le bouton a droite, sous le champ a 390 px */
.vse-date-bloc{display:flex;flex-direction:column;gap:4px;min-width:0}
.vse-date-ligne{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;min-width:0}
.vse-date-ligne .vse-date{flex:1 1 14rem;min-width:0}
.vse-date-bloc--proposee .vse-date input{border-color:var(--color-svv-urgence-orange)}
.vse-date-bloc--validee .vse-date input{border-color:var(--color-svv-green)}
.vse-date-valider{flex:0 0 auto;min-height:48px;min-width:11rem;margin:0;width:auto;white-space:nowrap}
.vse-date-valider--ok{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border:2px solid var(--color-svv-green)}
.vse-date-mention{margin:0;font-size:.85rem;font-weight:700;color:var(--color-svv-urgence-orange-texte)}
@media (max-width:600px){.vse-date-ligne{flex-direction:column;align-items:stretch}.vse-date-ligne .vse-date{flex:0 0 auto}.vse-date-valider{width:100%}}
.vse-famille{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;border-left:4px solid var(--color-svv-line-strong);background:var(--color-svv-surface);min-width:0}
.vse-famille--vert{border-left-color:var(--color-svv-green)}
.vse-famille--rouge{border-left-color:var(--color-svv-red)}
.vse-famille-titre{margin:0;font-weight:900;font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px}
.vse-pastille{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-line-strong)}
.vse-famille--vert .vse-pastille{background:var(--color-svv-green)}
.vse-famille--rouge .vse-pastille{background:var(--color-svv-red)}
.vse-destinataires{display:flex;flex-direction:column;gap:8px}
.vse-partenaires{display:flex;flex-direction:column;gap:4px;min-width:0}
.vse-partenaires-liste{margin:0 0 0 30px;padding:0;border:0;display:flex;flex-direction:column;gap:2px;min-width:0}
.vse-partenaires-liste .pvv-case span{overflow-wrap:anywhere}
.vse-orange{margin:0;color:var(--color-svv-orange);font-weight:800}
.vse-orange a{color:var(--color-svv-orange);text-decoration:underline}
.vse-retenue{display:flex;flex-direction:column;gap:6px}
.vse-retenue .vse-paragraphe-retenue{align-self:stretch;box-sizing:border-box;width:100%;min-width:0}
.vse-retenue .vse-grise{opacity:.6}
/* 🔴 (Arno, 25/11/2026, 22h51) « le champ de saisie du montant des 20 % doit s'afficher sur toute la largeur de la colonne » (390 px compris) :
   le bloc s'etire, le champ perd la borne de 22rem du style commun des champs du preavis */
.vse-retenue .vse-montant-vingt{align-self:stretch;box-sizing:border-box;width:100%;min-width:0;display:flex;flex-direction:column;gap:4px}
.vse-montant-vingt .pvs-champ input{width:100%;max-width:none}
.vse-erreur-champ{margin:0;color:var(--color-svv-red);font-weight:700;overflow-wrap:anywhere}
.vse-pieces-mail{margin:0;font-weight:700;overflow-wrap:anywhere}
.vse-frise{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:600px){.vse-frise{grid-template-columns:1fr 1fr}}
`;
