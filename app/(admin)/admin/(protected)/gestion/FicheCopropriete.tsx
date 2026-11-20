'use client';

import { ContactsSyndicCopropriete } from './ContactsSyndicCopropriete';
import { useEffect, useId, useState } from 'react';
import type { ModeleOfficiel } from '../../../../lib/adresse/officielleCopro';
import { createPortal } from 'react-dom';
import { useVerrouDefilement } from '../_composants/verrouDefilement';
import { AgCopropriete } from './AgCopropriete';
import { CSS_DIGICODES_COPRO, DigicodesCopropriete, digicodesModifies, motValeur, refusDigicodes, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import { FicheSyndic } from './FicheSyndic';
import { questionConflitParcelle } from '../../../../lib/gestion/conflitParcelle';
import type { ApercuEnvoi, IssueEnvoi } from '../../../../lib/gestion/digicodesEnvoi';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE, type ChoixAdresse } from './ChampAdresseBan';
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
  // l'interface
  const [ajoutAdresse, setAjoutAdresse] = useState(false);
  /* 🔴 (16/11/2026) « Une autre adresse » : UNIQUEMENT par les suggestions de la Base Adresse Nationale (ChampAdresseBan, le champ commun) —
     la frappe, et l'adresse retenue dans la liste (seule elle peut être ajoutée) */
  const [autre, setAutre] = useState('');
  const [autreChoisie, setAutreChoisie] = useState<ChoixAdresse | null>(null);
  const [autreBan, setAutreBan] = useState<string | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const idAutre = useId();
  /* 🔴 (16/11/2026) une adresse SANS NUMÉRO : la fenêtre d'avertissement (même style que celle des noms de bâtiment) ; les clés confirmées partent
     avec « Valider » (le serveur refuse sans elles) */
  const [sansNumero, setSansNumero] = useState<Adresse | null>(null);
  const [confirmeesSansNumero, setConfirmeesSansNumero] = useState<string[]>([]);
  const [aRetirer, setARetirer] = useState<string | null>(null);
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
    setNom(f.nom ?? ''); setHors(f.declaree ? f.horsCopropriete : l.coproprieteDuBien === false);
    setAdresses(f.adresses.filter((a) => !a.principale).map((a) => ({ libelle: a.libelle, codePostal: a.codePostal ?? '', commune: a.commune ?? '' })));
    setContacts(versEdition(f)); setSyndicChoisi(null); setRetraitSyndic(false); setConfirmerRetrait(false); setDigi(saisieDigicodesInitiale(f));
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
  const digiAffiches = digi.filter((d) => { const g = groupeDe(d.cle); return g === null || representants.get(g.banId) === d.cle; })
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
  const retirer = (a: Adresse) => (aRetirer === cleImmeuble(a.libelle)
    ? <span className="fcp-confirmer">Retirer cette adresse ? <button type="button" className="fcp-lien" onClick={() => { setAdresses((x) => x.filter((y) => y !== a)); setARetirer(null); }} data-fcp-retirer-oui>Oui</button>{' '}
      <button type="button" className="fcp-lien" onClick={() => setARetirer(null)}>Non</button></span>
    : <button type="button" className="fcp-lien" aria-label={`Retirer ${a.libelle}`} onClick={() => setARetirer(cleImmeuble(a.libelle))} data-fcp-retirer>×</button>);
  // les adresses de la même parcelle (proposées au « + »)
  useEffect(() => {
    if (f === null) return;
    let vivant = true;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'parcelle', adresses: toutes, cle: f.cle }) })
      .then((r) => r.json() as Promise<{ etat?: string; data?: Proposition[] }>).then((d) => { if (vivant && d.etat === 'ok') setPropositions(d.data ?? []); }).catch(() => { /* aucune proposition */ });
    return () => { vivant = false; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi && ficheSyndic === null && !choixSyndic && sansNumero === null) onFerme(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [envoi, ficheSyndic, onFerme, sansNumero]);

  const clesIci = new Set(toutes.map((a) => cleImmeuble(a.libelle)));
  const libres = propositions.filter((p) => p.etat === 'libre' && !clesIci.has(cleImmeuble(p.libelle)));
  const prises = propositions.filter((p) => p.etat === 'prise' && !clesIci.has(cleImmeuble(p.libelle)));
  const ajouter = (a: Adresse, confirmeSansNumero = false): boolean => {
    if (cleImmeuble(a.libelle) === '' || clesIci.has(cleImmeuble(a.libelle))) return false;
    if (adresseSansNumero(a.libelle) && !confirmeSansNumero) { setSansNumero(a); return false; }
    if (confirmeSansNumero) setConfirmeesSansNumero((l) => [...l, cleImmeuble(a.libelle)]);
    setAdresses((x) => [...x, a]); setRattacheeIci(true); setInfo(null);
    return true;
  };
  // les conflits : la copropriété reçoit un syndic, et une adresse de la parcelle est la copropriété d'un AUTRE syndic
  const conflits = syndicChoisi === null ? [] : prises.filter((p) => p.syndic !== null && p.syndic.id !== syndicChoisi.id);
  // 🔴 (lot 6, déplacé de la fiche syndic) « Même syndic : regrouper ? » : une adresse de la parcelle est la copropriété du MÊME syndic ; proposé
  // à une copropriété sans données propres (le serveur refuse sinon, rien n'est déplacé)
  const syndicVise = syndicChoisi?.id ?? (retraitSyndic ? null : f?.syndic?.id ?? null);
  const memeSyndic = f === null || syndicVise === null || (f.declaree && (f.contacts.length > 0 || (f.nom ?? '') !== '')) ? []
    : prises.filter((p) => p.syndic !== null && p.syndic.id === syndicVise && p.copropriete !== null);

  const [tenteDigi, setTenteDigi] = useState(false);
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
    setEtape(null); setEnvoi(true); setErreur(null);
    try {
      const corps = { action: 'enregistrer', immeuble: f.cle, nom: nom.trim() === '' ? null : nom, ...(f.avec476 ? { horsCopropriete: hors } : {}),
        adresses, sansNumeroConfirmees: confirmeesSansNumero.filter((k) => adresses.some((a) => cleImmeuble(a.libelle) === k)), syndicId: passe.syndicId ?? syndicChoisi?.id ?? null, retirerSyndic: retraitSyndic, alerteParcelleVue: passe.alerte === true, ...(passe.regrouperAvec ? { regrouperAvec: passe.regrouperAvec } : {}), ...(f.saisieDigicodes ? { digicodes: digicodesModifies(digi) } : {}),
        conflitsParcelle: passe.conflit ? conflits.map((k) => ({ autre: k.libelle, parcelle: k.parcelle })) : [],
        contacts: contacts.map((c) => ({ id: c.id, categorie: c.categorie, libelle: c.libelle, civilite: c.civilite, prenom: c.prenom, nom: c.nom, note: c.note,
          coordonnees: c.coordonnees.filter((k) => k.valeur.trim() !== '').map((k) => ({ id: k.id, sorte: k.sorte, libelle: k.libelle, valeur: k.valeur })) })) };
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const d = (await r.json()) as { etat?: string; data?: Fiche; motif?: string; message?: string };
      if (d.etat !== 'ok' || !d.data) { setErreur(d.motif ?? d.message ?? 'Enregistrement refusé.'); return; }
      appliquer({ fiche: d.data, coproprieteDuBien: lu?.coproprieteDuBien ?? null }); setRattacheeIci(false); setMemeTraite(false);
      setInfo(passe.regrouperAvec ? `Copropriété regroupée avec « ${passe.regrouperAvec} ».` : 'Fiche copropriété enregistrée.');
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
    <section className="fcp-bloc" data-fcp-identite>
      <h3 className="fcp-titre">Identité</h3>
      <label className="fcp-champ"><span>Nom de la copropriété (facultatif)</span>
        <input value={nom} disabled={!f.avec476 || envoi} placeholder={off?.principale.libelle ?? f.libelle} onChange={(e) => setNom(e.target.value)} data-fcp-nom /></label>
      {f.avec476 && <label className="fcp-case"><input type="checkbox" checked={hors} disabled={envoi} onChange={(e) => setHors(e.target.checked)} data-fcp-hors />
        <span>Immeuble hors copropriété (tout l’immeuble) : ni syndic ni AG</span></label>}
      {horsAffiche && !hors && <p className="fcp-alerte" data-fcp-bien-hors>Ce bien est noté « pas en copropriété » sur sa fiche : cochez la case pour tout l’immeuble (rien n’est changé sans « Valider »).</p>}
      <p className="loc-muet fcp-sans-marge" data-fcp-biens>{f.biens.length} bien{f.biens.length > 1 ? 's' : ''} du portefeuille dans cet immeuble</p>
    </section>

    <section className="fcp-bloc" data-fcp-adresses>
      <h3 className="fcp-titre">Adresses
        <button type="button" className="fcp-plus" aria-expanded={ajoutAdresse} aria-label="Ajouter une adresse à cette copropriété" title="Ajouter une adresse"
          onClick={() => setAjoutAdresse((o) => !o)} data-fcp-plus-adresse>+</button></h3>
      <ul className="fcp-liste">
        <li data-fcp-adresse="principale" {...(off !== null ? { 'data-fcp-officielle': off.principale.banId } : {})}>
          <strong>{off !== null ? off.principale.libelle : adresseImmeuble(f.libelle, f.codePostal, f.commune)}</strong> <span className="loc-muet">— adresse principale</span></li>
        {/* 🔴 (Arno, 20/11/2026, lot 5) une écriture d'origine n'est JAMAIS une adresse : elle ne vit que dans « Écritures d'origine » (elle reste dans la
            saisie, et part avec « Valider ») ; une adresse que rien n'a encore rapprochée garde sa ligne, marquée « à vérifier » */}
        {rangees.filter((x) => x.mode !== 'ecriture').map(({ a, mode, libelle }) => (
          <li key={cleImmeuble(a.libelle)} data-fcp-adresse="secondaire" {...(mode === 'officielle' ? { 'data-fcp-officielle': '' } : {})}>{libelle}{' '}
            {off !== null && mode === 'normale' && <span className="fcp-a-verifier" data-fcp-adresse-a-verifier>à vérifier </span>}{retirer(a)}</li>))}
        {/* une autre adresse officielle de l'immeuble, connue par ses biens mais qui n'est pas (encore) une adresse enregistrée : en lecture seule */}
        {(off?.adresses ?? []).filter((g) => g.banId !== off?.principale.banId && !rangees.some((x) => x.banId === g.banId)).map((g) => (
          <li key={g.banId} data-fcp-adresse="officielle-des-biens">{g.libelle} <span className="loc-muet">— adresse de biens de la copropriété</span></li>))}
      </ul>
      {off !== null && (
        <details className="fcp-histo" data-fcp-ecritures>
          <summary>Écritures d’origine ({off.ecritures.length})</summary>
          <ul className="fcp-liste">{off.ecritures.map((e, i) => (
            <li key={i} data-fcp-ecriture={e.statut}>« {e.ecriture} » <span className="loc-muet">— {e.biens} bien{e.biens > 1 ? 's' : ''}</span>
              {e.statut !== 'certain' && <span className="fcp-a-verifier" data-fcp-ecriture-a-verifier> · à vérifier</span>}</li>))}</ul>
        </details>)}
      {ajoutAdresse && (
        <div className="fcp-ajout" data-fcp-ajout-adresse>
          {libres.length + prises.length > 0 && <p className="fcp-sous-titre">Sur la même parcelle</p>}
          <ul className="fcp-liste">
            {libres.map((p) => <li key={p.libelle}>{adresseImmeuble(p.libelle, p.codePostal, p.commune)}{' '}
              <button type="button" className="svv-btn svv-btn-outline gst-btn fcp-mini" onClick={() => ajouter(p)} data-fcp-rattacher-parcelle>Rattacher</button></li>)}
            {prises.map((p) => <li key={p.libelle} className="loc-muet" data-fcp-prise>{adresseImmeuble(p.libelle, p.codePostal, p.commune)} — déjà rattachée à une autre copropriété
              {p.syndic ? ` — ${nomAvecVille(p.syndic.nom, p.syndic.ville)}` : ''}</li>)}
          </ul>
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
              if (!ajouter({ libelle: autreChoisie.voie, codePostal: autreChoisie.codePostal, commune: autreChoisie.commune, ...(autreBan !== null ? { banId: autreBan } : {}) })) return;
              setAutre(''); setAutreChoisie(null); setAutreBan(null);
            }} data-fcp-ajouter-adresse>Ajouter</button>
        </div>
      )}
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
        ? <><DigicodesCopropriete parAdresse={f.batimentsParAdresse === true} s={digiAffiches} onChange={(nv) => setDigi((d) => remettreDigicodes(d, nv))} connus={f.batimentsConnus} nomenclature={f.nomenclatureEffective} desactive={envoi} tente={tenteDigi}
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
      <h3 className="fcp-titre">AG</h3>
      {/* 🔴 (Arno, 17/11/2026) « + Ajouter un PV d'AG » et « Corriger » : dans cette fiche seulement */}
      {f.declaree ? <AgCopropriete immeuble={f.cle} edition /> : <p className="loc-muet fcp-sans-marge">AG de la copropriété : aucune encore (fiche à créer).</p>}</section>}

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
          <button type="button" className="fcp-fermer" aria-label="Fermer" onClick={onFerme} disabled={envoi}>×</button>
        </div>
        <div className="fcp-corps">{corps}</div>
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
        {info !== null && <p className="gst-info fcp-pied-msg" role="status" data-fcp-info>{info}</p>}
        <div className="fcp-actions fcp-pied">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme} disabled={envoi} data-fcp-annuler>Fermer</button>
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
.fcp-pied-msg{margin:6px 16px 0}
.fcp-sans-marge{margin:0}
@media (max-width:600px){.fcp-pied .svv-btn{flex:1 1 100%}}
`;
