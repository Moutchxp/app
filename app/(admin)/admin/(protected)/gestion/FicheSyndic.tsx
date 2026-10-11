'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  lotsDuPortefeuille,
  cleEmail, doublonsLocaux, emailsDe, motDoublon, type ContactAilleurs,
  detacher, nomAvecVille, filtrerCatalogue, trierParNom,
  affecter, motBiens, motContacts, suiviParDefaut, suitImmeuble,
  casserNom, casserPrenom, MINIMUM_ADRESSE,
  appliquerBrouillon, contactModifie, copieContact, nomAffiche, telephoneComplet, type EditionContact as EtatEdition,
  adresseImmeuble, adresseManquante, apercuPropagation, MOTIF_ADRESSE_INCOMPLETE, prenomNom, prenomNomCivil, CIVILITES, trierParVoie,
  marquerParti, reintegrer, departEnLignes, boutonDepart, type AncienContact, alerteCoordonnees, coordonneesManquantes,
  CATEGORIES_IMMEUBLE, refusContactImmeuble, versFormulaireImmeuble, type ContactImmeubleLu,
  avertissementsCoordonnees, cleTelephone, coordonneesDuFormulaire, phraseManque, type CoordonneeConnue,
  conflitAdresse, type AdresseSaisie, resumeFermeture, type ChampAdresse, cleImmeuble, contactNomme, contactVide, coordonneeVide, coproprietesRetirees,
  emailPlausible, formaterTelephone, formulaireModifie, formulaireVide, immeublesQuiRepondent, libellesDe,
  lienTelephone, MINIMUM_AUTOCOMPLETION, motBiensEnGestion, nomDuContact, PERSONNALISE, saisieTelephone,
  TITRES_CONTACT, valeurDuChoix, versFormulaire, versSaisie,
  type AdresseBan, type ContactForm, type CoordonneeForm, type FicheSyndic as Fiche, type ImmeubleConnu,
  type ImmeubleSaisi, type SorteCoordonnee, type SyndicForm, type SyndicResume,
} from '../../../../lib/gestion/syndics';
import { rafraichirImmeubles, useImmeublesSyndics } from './useImmeublesSyndics';
import { chercherAdresses } from './adressesSyndic';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';
import { BoutonPilule, CSS_BOUTON_PILULE } from './BoutonPilule';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — LA FICHE SYNDIC (UN SEUL COMPOSANT, RÉUTILISABLE TEL QUEL) ═══════════
 *
 * Elle s'ouvre de trois façons, et c'est toujours elle :
 *   · depuis la carte d'un bien dont l'immeuble a un syndic   → `syndicId` connu : la fiche, pré-remplie ;
 *   · depuis la carte d'un bien sans syndic                   → `syndicId` nul + `immeubleDepart` : RECHERCHE d'un
 *     syndic existant (« Rattacher cet immeuble à ce syndic »), sinon « Créer un nouveau syndic » ;
 *   · depuis l'écran « Syndics »                              → l'un ou l'autre, sans immeuble de départ.
 *
 * ══ 🔴🔴 LOT FICHE-SYNDIC-FINITIONS — CE QU'ARNO A DEMANDÉ, ET OÙ C'EST ══════════════════════════════════════════
 *
 *   ① COMPACTE. Les grands vides venaient de `flex:1 1 12rem` posé sur CHAQUE champ : dans une colonne flex, cette
 *     base devient une HAUTEUR de 12rem. La base ne vit plus que dans les rangées (`.fsy-duo`).
 *   ② LE PIED EST TOUJOURS VISIBLE : la fenêtre est une colonne (en-tête / corps qui défile / pied), et le pied est
 *     HORS de la zone qui défile. « Annuler » ferme sans enregistrer (confirmation si quelque chose a bougé) ;
 *     « Valider » enregistre PUIS ferme. La croix, Échap et le clic sur le voile = Annuler.
 *   ③ « Valider ce contact » replie le contact en une ligne (titre · prénom nom · e-mails · téléphones) ; « Modifier »
 *     le rouvre ; « + Ajouter un contact » ouvre un bloc déplié. Les contacts existants arrivent repliés.
 *   ④ DEUX STANDARDS AU PLUS (« + »), chacun retirable ; tous les numéros s'affichent et se tapent par paires.
 *   ⑤ ADRESSE = rue + code postal + ville ; les copropriétés se lisent « 25 rue Edith Cavell, 92400 Courbevoie ».
 *   ⑥ AUTO-COMPLÉTION dès 2 caractères : le PORTEFEUILLE d'abord (« N bien(s) en gestion à cette adresse »), puis
 *     la BAN LOCALE (« aucun bien en gestion à cette adresse »). Une copropriété d'un autre syndic est signalée et ne
 *     se prend qu'après confirmation (l'ancien lien passe en historique).
 *   ⑦ « Supprimer ce syndic », discret, en bas : confirmation qui liste les biens qui le perdront.
 *
 * 🔴 RIEN NE S'ENREGISTRE SANS QUE LA LISTE DES BIENS SOIT SOUS LES YEUX : « Biens qui recevront ce syndic » est
 * affichée en permanence sous les copropriétés, avec les changements de syndic et les retraits — c'est elle qui
 * tient la règle « afficher la liste des biens AVANT validation », sans étape de plus.
 *
 * MOBILE : plein écran sous 640 px, champs à 16 px (iOS ne zoome pas), cibles ≥ 44 px.
 */
type Mode = 'chargement' | 'recherche' | 'edition' | 'erreur';

export function FicheSyndic({ syndicId: idInitial, immeubleDepart = null, onFerme, onEcrire, lotDepart = null,
  onRetireDeLaResidence, ancienSyndicId = null, adresseBien = null }: {
  /** LOT COPRO-PLUSIEURS-ADRESSES — l'adresse PROPRE du bien quand elle est une adresse SECONDAIRE de la copropriété
   *  (`immeubleDepart` est alors l'adresse principale) : c'est elle que le bloc 1 affiche. */
  adresseBien?: ImmeubleSaisi | null;
  /** `null` = aucun syndic encore : on commence par chercher un syndic existant. */
  syndicId: number | null;
  /** L'immeuble du bien depuis lequel on vient : pré-rempli comme copropriété. */
  immeubleDepart?: ImmeubleSaisi | null;
  onFerme: () => void;
  /** Écrire depuis gestion@ par le composeur existant. Absent ⇒ le lien `mailto:` suffit. */
  onEcrire?: (email: string) => void;
  /** LOT SYNDIC-NOTE-PAR-BIEN — le lot depuis lequel la fiche est ouverte : sa note (couple lot, syndic). */
  lotDepart?: number | null;
  /** LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — après le retrait, l'écran hôte enchaîne (choix d'un autre syndic). Absent :
   *  la fiche se ferme simplement. */
  onRetireDeLaResidence?: (ancienSyndicId: number) => void;
  /** LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — le syndic qu'on vient de retirer : jamais proposé en tête de la recherche. */
  ancienSyndicId?: number | null;
}) {
  const [syndicId, setSyndicId] = useState<number | null>(idInitial);
  const [mode, setMode] = useState<Mode>(idInitial === null ? 'recherche' : 'chargement');
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [form, setForm] = useState<SyndicForm>(() => formulaireVide(immeubleDepart, lotDepart));
  /** Le formulaire tel qu'il était à l'ouverture : ce qui permet de dire « des modifications sont en cours ». */
  const [initial, setInitial] = useState<SyndicForm>(() => formulaireVide(null));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [abandon, setAbandon] = useState(false);
  /** LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE — 0 : rien ; 1 : première confirmation ; 2 : seconde. */
  const [suppression, setSuppression] = useState<0 | 1 | 2>(0);
  /** « Supprimer ce syndic pour cause de fermeture définitive » : des modifications en cours ⇒ le bandeau le dit d'abord. */
  const demanderSuppression = (): void => {
    if (modifie) { setErreur('Validez ou abandonnez vos modifications avant de supprimer ce syndic'); return; }
    setErreur(null); setSuppression(1);
  };
  /** LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — la confirmation « Retirer … de la copropriété … ? » est affichée. */
  const [retrait, setRetrait] = useState(false);
  /** Un « Valider » a été refusé pour une adresse incomplète : les champs vides se cerclent de rouge. */
  const [tente, setTente] = useState(false);
  /**
   * 🔴 LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — l'état des contacts vit ICI, et non dans la section : le PIED doit
   * savoir qu'un contact est en cours de modification (« Valider aussi les modifications du contact … ? »), et
   * « Annuler » doit le compter comme une modification en cours.
   */
  const [ouverts, setOuverts] = useState<string[]>([]);
  const [edition, setEdition] = useState<EtatEdition | null>(null);
  const [questionContact, setQuestionContact] = useState(false);
  const boite = useRef<HTMLDivElement | null>(null);
  const immeubles = useImmeublesSyndics();

  const charger = useCallback(async (id: number): Promise<Fiche | null> => {
    setMode('chargement');
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${id}${lotDepart !== null ? `?lot=${lotDepart}` : ''}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; fiche?: Fiche; message?: string };
      if (!r.ok || j.etat !== 'ok' || !j.fiche) { setErreur(j.message ?? 'Lecture impossible.'); setMode('erreur'); return null; }
      setFiche(j.fiche);
      const f = versFormulaire(j.fiche, lotDepart);
      setForm(f); setInitial(f);
      setMode('edition');
      return j.fiche;
    } catch {
      setErreur('Lecture impossible : le serveur n’a pas répondu.'); setMode('erreur'); return null;
    }
  }, []);

  useEffect(() => { if (idInitial !== null) void charger(idInitial); }, [idInitial, charger]);

  const origineEdition = edition === null ? null
    : edition.nouveau ? (edition.depart ?? null)
      : ((edition.immeuble === true ? (form.immeubleContacts?.contacts ?? []) : form.contacts).find((c) => c.cle === edition.cle) ?? null);
  /** LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — l'immeuble du bien depuis lequel on a ouvert la fiche (sinon `null`). */
  const cleDepart = immeubleDepart !== null && immeubleDepart.libelle.trim() !== '' ? cleImmeuble(immeubleDepart.libelle) : null;
  /**
   * ══ LOT COPRO-CONTACTS-IMMEUBLE — LE CARNET DE L'IMMEUBLE DU BIEN, LU À PART ══ (il ne dépend pas du syndic). Une
   * fois lu, il entre dans le formulaire ET dans son état initial (il n'est donc pas « une modification »), et voyage
   * avec la saisie. Non lu (erreur) : rien n'est envoyé — jamais une liste vide qui retirerait tout.
   */
  const libelleDepart = immeubleDepart?.libelle.trim() ?? '';
  const carnetLu = form.immeubleContacts != null;
  useEffect(() => {
    if (mode !== 'edition' || libelleDepart === '' || carnetLu) return;
    let vivant = true;
    void fetch(`/api/admin/gestion/coproprietes/contacts?immeuble=${encodeURIComponent(libelleDepart)}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ etat?: string; contacts?: ContactImmeubleLu[] }>)
      .then((j) => {
        if (!vivant || j.etat !== 'ok' || !Array.isArray(j.contacts)) return;
        const carnet = { libelle: libelleDepart, contacts: versFormulaireImmeuble(j.contacts) };
        setForm((f) => (f.immeubleContacts ? f : { ...f, immeubleContacts: carnet }));
        setInitial((f) => (f.immeubleContacts ? f : { ...f, immeubleContacts: carnet }));
      })
      .catch(() => { /* le carnet n'est simplement pas proposé */ });
    return () => { vivant = false; };
  }, [mode, libelleDepart, carnetLu]);
  const contactEnCours = edition !== null && contactModifie(origineEdition, edition.brouillon);
  const modifie = mode === 'edition' && (formulaireModifie(initial, form) || contactEnCours);

  /** ANNULER — la croix, Échap et le voile y mènent aussi. Des modifications en cours ⇒ on demande d'abord. */
  const annuler = useCallback((): void => {
    if (modifie && !abandon) { setAbandon(true); return; }
    onFerme();
  }, [modifie, abandon, onFerme]);

  useEffect(() => {
    const auClavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE — Échap DANS une tuile dépliée du catalogue la replie (son propre
      // gestionnaire), SANS fermer la fiche : on la laisse passer.
      if ((e.target as Element | null)?.closest?.('[data-echap-local]')) return;
      e.stopPropagation();
      // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — Échap referme d'abord le bandeau « Enregistrer … ? »,
      // sans rien faire d'autre.
      if (questionContact) { setQuestionContact(false); return; }
      annuler();
    };
    document.addEventListener('keydown', auClavier, true);
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [annuler, questionContact]);
  /** Un clic (appui) HORS du bandeau « Enregistrer … ? » le referme sans rien faire. `pointerdown`/`mousedown` et non
   *  `click` : le clic qui a OUVERT le bandeau ne peut pas le refermer aussitôt. */
  const bandeau = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!questionContact) return;
    const dehors = (e: Event): void => {
      if (bandeau.current !== null && !bandeau.current.contains(e.target as Node)) setQuestionContact(false);
    };
    document.addEventListener('mousedown', dehors, true);
    document.addEventListener('touchstart', dehors, true);
    return () => { document.removeEventListener('mousedown', dehors, true); document.removeEventListener('touchstart', dehors, true); };
  }, [questionContact]);
  useEffect(() => { boite.current?.focus(); }, []);

  /** « Rattacher cet immeuble à ce syndic » : SA fiche s'ouvre, l'immeuble déjà ajouté (et donc à valider). */
  const rattacherA = async (id: number): Promise<void> => {
    setSyndicId(id);
    const f = await charger(id);
    if (f === null || immeubleDepart === null || immeubleDepart.libelle.trim() === '') return;
    const base = versFormulaire(f, lotDepart);
    if (!base.immeubles.some((x) => cleImmeuble(x.libelle) === cleImmeuble(immeubleDepart.libelle))) {
      setForm({ ...base, immeubles: [...base.immeubles, immeubleDepart] });
    }
  };

  /**
   * VALIDER — enregistre puis ferme. Rien n'a bougé ⇒ on ferme simplement.
   * 🔴 Un contact en cours de modification NON validé ⇒ on demande d'abord « Valider aussi les modifications du
   * contact … ? » (`questionContact`), puis `validerAvec` reprend avec ou sans lui.
   */
  /**
   * LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — des adresses de la même parcelle restent PROPOSABLES et aucune n'a été
   * rattachée pendant cette session : le pied le dit d'abord (jamais bloquant) — « Voir les adresses » / « Valider
   * quand même ».
   */
  const [parcelle, setParcelle] = useState<RapportParcelle>(RAPPORT_VIDE);
  const [alerteParcelle, setAlerteParcelle] = useState(false);
  const [voirParcelle, setVoirParcelle] = useState(0);
  /*
   * ══ LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — LES ÉTAPES DU VALIDER ═══════════════════════════════════
   *   ① conflit possible (une autre adresse de la parcelle est à un AUTRE syndic) : « Rattacher à … » / « Annuler » /
   *     « Continuer avec un autre syndic », puis « Confirmez-vous … ? » — seul « Oui, je confirme » enregistre (et le
   *     conflit est noté). Jamais interdit.
   *   ② même syndic : « la rattacher à cette copropriété ? » Oui (regroupe) / Non (copropriété distincte).
   *   ③ l'alerte « autres adresses postales », UNE seule fois par copropriété (marquée à l'enregistrement).
   */
  const [etapeParcelle, setEtapeParcelle] = useState<null | 'conflit' | 'conflit2' | 'meme'>(null);
  const [conflitConfirme, setConflitConfirme] = useState(false);
  const [memeTraite, setMemeTraite] = useState(false);
  const [alerteVue, setAlerteVue] = useState(false);
  const valider = async (passe: { parcelle?: boolean; conflit?: boolean; meme?: boolean } = {}, f: SyndicForm = form): Promise<void> => {
    setAlerteParcelle(false);
    if (!passe.conflit && !conflitConfirme && parcelle.conflits.length > 0) { setEtapeParcelle('conflit'); return; }
    if (!passe.meme && !memeTraite && parcelle.memeSyndic.length > 0) { setEtapeParcelle('meme'); return; }
    setEtapeParcelle(null);
    if (!passe.parcelle && !alerteVue && parcelle.alerteDue && parcelle.proposables > 0 && !parcelle.rattachee) {
      setAlerteParcelle(true); setAlerteVue(true); return;
    }
    if (contactEnCours) { setQuestionContact(true); return; }
    await validerAvec(f, false, { conflit: passe.conflit === true || conflitConfirme });
  };
  /** « Rattacher à SYNDIC » : l'adresse du bien devient une adresse SECONDAIRE de la copropriété existante de ce
   *  syndic (son « Valider », par la même porte) ; la fiche en cours n'enregistre rien et se ferme. */
  const rattacherAuSyndic = async (c: ConflitPossible): Promise<void> => {
    if (parcelle.bien === null) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${c.syndic.id}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; fiche?: Fiche };
      if (!r.ok || j.etat !== 'ok' || !j.fiche) { setErreur('Lecture du syndic impossible.'); return; }
      const f = versFormulaire(j.fiche);
      const b = parcelle.bien;
      const g = { ...f, immeubles: f.immeubles.map((im) => (cleImmeuble(im.libelle) === c.coproCle
        ? { ...im, adresses: [...(im.adresses ?? []), { libelle: b.libelle, codePostal: b.codePostal, commune: b.commune }] } : im)) };
      const w = await fetch(`/api/admin/gestion/syndics/${c.syndic.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(versSaisie(g)) });
      const k = (await w.json()) as { ok?: boolean; erreur?: string };
      if (!w.ok || k.ok !== true) { setErreur(k.erreur ?? 'Rattachement impossible.'); return; }
      await rafraichirImmeubles();
      onFerme();
    } catch {
      setErreur('Rattachement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  /** Même syndic, « Oui » : la copropriété du bien rejoint l'autre (ses adresses deviennent secondaires, ses contacts
   *  la suivent), puis l'enregistrement continue. */
  const regrouper = (): void => {
    const cible = parcelle.memeSyndic[0];
    const bienCle = parcelle.coproCle;
    const bienIm = form.immeubles.find((im) => cleImmeuble(im.libelle) === bienCle);
    if (cible === undefined || bienCle === null || bienIm === undefined) return;
    const cleCible = cleImmeuble(cible.coproLibelle);
    const g: SyndicForm = {
      ...form,
      immeubles: form.immeubles.filter((im) => im !== bienIm).map((im) => (cleImmeuble(im.libelle) === cleCible
        ? { ...im, adresses: [...(im.adresses ?? []), { libelle: bienIm.libelle, codePostal: bienIm.codePostal, commune: bienIm.commune }, ...(bienIm.adresses ?? [])] } : im)),
      contacts: form.contacts.map((c) => (c.immeubles.includes(bienCle)
        ? { ...c, immeubles: [...new Set(c.immeubles.map((k) => (k === bienCle ? cleCible : k)))] } : c)),
    };
    setForm(g); setMemeTraite(true);
    void valider({ meme: true }, g);
  };

  /** LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — le serveur a renvoyé des coordonnées déjà utilisées, NON confirmées
   *  (un chemin qui n'est pas passé par le « Valider » d'un contact) : on les montre, et on confirme ou on revient. */
  const [avertServeur, setAvertServeur] = useState<{ lignes: string[]; f: SyndicForm; conflit?: boolean } | null>(null);
  const validerAvec = async (f: SyndicForm, confirme = false, ctx: { conflit?: boolean } = {}): Promise<void> => {
    setAvertServeur(null);
    setQuestionContact(false);
    setEdition(null);
    // Rien n'a bougé sur un syndic existant ⇒ on ferme : un syndic ancien sans adresse complète reste CONSULTABLE.
    if (syndicId !== null && !formulaireModifie(initial, f)) { onFerme(); return; }
    if (f !== form) setForm(f);
    if (f.nom.trim() === '') { setTente(true); setErreur('Le nom du cabinet est obligatoire.'); return; }
    // 🔴 LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — rue, code postal (5 chiffres) et ville obligatoires.
    if (adresseManquante(f).length > 0) { setTente(true); setErreur(MOTIF_ADRESSE_INCOMPLETE); return; }
    const sansNom = f.contacts.find((c) => !contactNomme({ titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom })
      && c.coordonnees.some((k) => k.valeur.trim() !== ''));
    if (sansNom) { setErreur('Chaque contact doit avoir au moins un nom ou un titre.'); return; }
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(syndicId === null ? '/api/admin/gestion/syndics' : `/api/admin/gestion/syndics/${syndicId}`, {
        method: syndicId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...versSaisie(f), ...(confirme ? { confirmeDoublons: true } : {}),
          // LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — l'alerte montrée (plus jamais pour cette copropriété) ;
          // les conflits confirmés (la pastille des deux cartes).
          ...(alerteVue && parcelle.coproCle !== null ? { alerteParcelle: [parcelle.coproCle] } : {}),
          ...((ctx.conflit === true || conflitConfirme) && parcelle.coproCle !== null && parcelle.bien !== null
            ? { conflitsParcelle: parcelle.conflits.map((k) => ({ immeuble: (f.immeubles.find((im) => cleImmeuble(im.libelle) === parcelle.coproCle)?.libelle ?? parcelle.bien?.libelle ?? ''), autre: k.autre, parcelle: k.parcelle })) }
            : {}),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; id?: number; erreur?: string; avertissement?: string[] };
      if (Array.isArray(j.avertissement) && j.avertissement.length > 0 && !confirme) { setAvertServeur({ lignes: j.avertissement, f, conflit: ctx.conflit === true }); return; }
      if (!r.ok || j.ok !== true) { setErreur(j.erreur ?? 'Enregistrement impossible.'); return; }
      await rafraichirImmeubles();
      onFerme();
    } catch {
      setErreur('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (): Promise<void> => {
    if (syndicId === null) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${syndicId}`, { method: 'DELETE' });
      const j = (await r.json()) as { ok?: boolean; erreur?: string };
      if (!r.ok || j.ok !== true) { setErreur(j.erreur ?? 'Suppression impossible.'); return; }
      await rafraichirImmeubles();
      onFerme();
    } catch {
      setErreur('Suppression impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * ══ 🔴 LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — « SUPPRIMER CE SYNDIC DE CETTE RÉSIDENCE » ═══════════════════════════
   * DEPUIS UN BIEN seulement, et seulement si sa copropriété est ENREGISTRÉE chez ce syndic (une copropriété encore
   * « en attente de validation » n'a pas de lien à fermer). Des modifications en cours ⇒ le bandeau le dit d'abord ;
   * sinon une confirmation, puis le retrait est enregistré AUSSITÔT (fermé, historisé, rien d'effacé), et l'écran hôte
   * enchaîne sur le choix d'un autre syndic pour ce bien.
   */
  const coproDuBien = mode === 'edition' && syndicId !== null && fiche !== null && cleDepart !== null
    ? (fiche.coproprietes.find((c) => c.cle === cleDepart) ?? null) : null;
  const demanderRetrait = (): void => {
    if (modifie) { setErreur('Validez ou abandonnez vos modifications avant de retirer ce syndic'); return; }
    setErreur(null); setRetrait(true);
  };
  const retirer = async (): Promise<void> => {
    if (syndicId === null || coproDuBien === null) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(`/api/admin/gestion/syndics/${syndicId}/retirer-copropriete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ immeuble: coproDuBien.libelle }),
      });
      const j = (await r.json()) as { ok?: boolean; erreur?: string };
      if (!r.ok || j.ok !== true) { setErreur(j.erreur ?? 'Retrait impossible.'); return; }
      await rafraichirImmeubles();
      if (onRetireDeLaResidence) onRetireDeLaResidence(syndicId); else onFerme();
    } catch {
      setErreur('Retrait impossible : le serveur n’a pas répondu.');
    } finally {
      setEnvoi(false);
    }
  };
  const blocRetrait = coproDuBien === null || fiche === null ? null : retrait ? (
    <div className="fsy-retrait-confirmer" role="group" aria-label="Confirmer le retrait du syndic de cette résidence">
      {/* LOT SYNDIC-RETRAIT-RESIDENCE-MESSAGE-SIMPLE — CE QU'IL Y AVAIT : « Retirer X de la copropriété A ? Lots
          concernés : lot …. Le syndic, ses autres copropriétés et son catalogue de contacts sont conservés. » Trois lignes
          plus simples ; « Lots concernés » retiré du message (accord d'Arno) — le comportement, lui, est inchangé : TOUS
          les lots du portefeuille de cette copropriété perdent ce syndic. */}
      <p className="fsy-retrait-question"><strong>Détacher {nomAvecVille(fiche.nom, fiche.ville)} de cette copropriété ?</strong></p>
      <p className="fsy-retrait-adresse">{adresseImmeuble(coproDuBien.libelle, coproDuBien.codePostal, coproDuBien.commune)}</p>
      <p className="fsy-retrait-note fsy-discret">Le syndic et ses contacts restent enregistrés dans la base des syndics.</p>
      <div className="fsy-boutons">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRetrait(false)} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void retirer()} disabled={envoi}>Oui, retirer de cette résidence</button>
      </div>
    </div>
  ) : (
    /* LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE — CE QU'IL Y AVAIT : « Supprimer ce syndic de cette résidence ». */
    <button type="button" className="fsy-retrait" onClick={demanderRetrait}>Détacher / remplacer le syndic de cette résidence</button>
  );

  /** « Créer un nouveau syndic » : le formulaire vide (l'immeuble du bien pré-rempli). */
  const creer = (): void => { setForm(formulaireVide(immeubleDepart, lotDepart)); setInitial(formulaireVide(null, lotDepart)); setMode('edition'); };

  // LOT SYNDIC-TITRE-APRES-RETRAIT — juste après « Supprimer ce syndic de cette résidence » (l'hôte passe l'ancien
  // syndic), la recherche s'intitule « Rattacher un nouveau syndic de copropriété » ; par tout autre chemin, inchangé.
  const titre = mode === 'recherche' ? (ancienSyndicId !== null ? 'Rattacher un nouveau syndic de copropriété' : 'Syndic de la copropriété')
    // LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — « NOM / Ville » : le nom affiché, calculé ; jamais réécrit en base.
    : syndicId === null ? 'Créer un syndic' : (fiche !== null ? nomAvecVille(fiche.nom, fiche.ville) : 'Syndic');

  return (
    <div className="fsy-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) annuler(); }}>
      <style>{CSS_FICHE_SYNDIC}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <div className="fsy" role="dialog" aria-modal="true" aria-labelledby="fsy-titre" tabIndex={-1} ref={boite}>
        <div className="fsy-tete">
          <h2 className="fsy-titre" id="fsy-titre">{titre}</h2>
          {/* 🔴 LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT (accord d'Arno pour ce déplacement) — CE QU'IL Y AVAIT :
              « Créer un nouveau syndic » sous la liste des résultats (hors de vue d'une longue liste). Il est dans la
              ligne de TITRE, fixe, juste à gauche de la croix ; seule la liste défile. Comportement inchangé. */}
          <span className="fsy-tete-actions">
            {mode === 'recherche' && (
              <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-creer-tete" onClick={creer}>Créer un nouveau syndic</button>
            )}
            <button type="button" className="fsy-croix" aria-label="Annuler et fermer" onClick={annuler}>×</button>
          </span>
        </div>

        <div className="fsy-corps">
          {immeubles !== null && !immeubles.disponible && (
            <p className="fsy-alerte">L’annuaire des syndics n’est pas encore installé (migrations 324-325).</p>
          )}
          {mode === 'chargement' && <p className="fsy-discret">Chargement…</p>}
          {mode === 'recherche' && (
            <Recherche immeubleDepart={immeubleDepart} onRattacher={(id) => void rattacherA(id)} ancienSyndicId={ancienSyndicId} />
          )}
          {mode === 'edition' && (
            <Edition form={form} setForm={setForm} fiche={fiche} syndicId={syndicId} onEcrire={onEcrire}
              connus={immeubles?.immeubles ?? []} suppression={suppression} setSuppression={setSuppression} demanderSuppression={demanderSuppression}
              envoi={envoi} onSupprimer={() => void supprimer()} tente={tente}
              ouverts={ouverts} setOuverts={setOuverts} edition={edition} setEdition={setEdition} cleDepart={cleDepart} adresseBien={adresseBien}
              onParcelle={setParcelle} voirParcelle={voirParcelle}
              retrait={blocRetrait} />
          )}
        </div>

        {/* ══ LE PIED, TOUJOURS VISIBLE — hors de la zone qui défile ══ */}
        <div className="fsy-pied">
          {erreur !== null && <p className="fsy-alerte fsy-pied-alerte" role="alert">{erreur}</p>}
          {alerteParcelle ? (
            <div className="fsy-boutons fsy-alerte-parcelle" role="group" aria-label="Adresses de la parcelle non associées">
              <span className="fsy-question">
                Cette copropriété possède peut-être d’autres adresses postales : {parcelle.proposables === 1
                  ? '1 adresse sur la même parcelle cadastrale n’a pas été associée.'
                  : `${parcelle.proposables} adresses sur la même parcelle cadastrale n’ont pas été associées.`}
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setAlerteParcelle(false); setVoirParcelle((n) => n + 1); }}>Voir les adresses</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void valider({ parcelle: true, conflit: conflitConfirme, meme: memeTraite })}>Valider quand même</button>
            </div>
          ) : etapeParcelle === 'conflit' && parcelle.bien !== null ? (
            <div className="fsy-boutons fsy-conflit-parcelle" role="group" aria-label="Conflit possible sur la parcelle">
              <span className="fsy-question">
                Attention : l’adresse {parcelle.bien.affichee} semble appartenir à la même parcelle que{' '}
                {parcelle.conflits.map((k, i) => `${i > 0 ? (i === parcelle.conflits.length - 1 ? ' et que ' : ', que ') : ''}${k.autre}, déjà rattachée au syndic ${nomAvecVille(k.syndic.nom, k.syndic.ville)}`).join('')}.
                {' '}Vérifiez qu’il ne s’agit pas d’une erreur d’adresse ou de la même copropriété.
              </span>
              {[...new Map(parcelle.conflits.map((k) => [k.syndic.id, k])).values()].map((k) => (
                <button key={k.syndic.id} type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi}
                  onClick={() => void rattacherAuSyndic(k)}>Rattacher à {k.syndic.nom}</button>
              ))}
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtapeParcelle(null)}>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEtapeParcelle('conflit2')}>Continuer avec un autre syndic</button>
            </div>
          ) : etapeParcelle === 'conflit2' && parcelle.bien !== null ? (
            <div className="fsy-boutons fsy-conflit-parcelle" role="group" aria-label="Confirmer une copropriété distincte">
              <span className="fsy-question">Confirmez-vous que {parcelle.bien.libelle} est une copropriété distincte, avec un syndic différent ?</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtapeParcelle('conflit')}>Non, revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setConflitConfirme(true); void valider({ conflit: true }); }}>Oui, je confirme</button>
            </div>
          ) : etapeParcelle === 'meme' && parcelle.memeSyndic.length > 0 ? (
            <div className="fsy-boutons fsy-meme-syndic" role="group" aria-label="Même parcelle qu’une copropriété de ce syndic">
              <span className="fsy-question">
                Cette adresse est sur la même parcelle qu’une copropriété de ce syndic : la rattacher à cette copropriété ?
                <span className="fsy-discret"> ({parcelle.memeSyndic[0].coproLibelle})</span>
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setMemeTraite(true); void valider({ meme: true, conflit: conflitConfirme }); }}>Non</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={regrouper}>Oui</button>
            </div>
          ) : avertServeur !== null ? (
            <div className="fsy-boutons fsy-avert-serveur" role="group" aria-label="Coordonnées déjà utilisées">
              <span className="fsy-question fsy-alerte-coord-texte">
                {avertServeur.lignes.map((l, i) => <span key={i}>{l}</span>)}
                <span>Enregistrer quand même ?</span>
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAvertServeur(null)}>Revenir</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void validerAvec(avertServeur.f, true, { conflit: avertServeur.conflit })}>Enregistrer quand même</button>
            </div>
          ) : questionContact && edition !== null ? (
            <div className="fsy-boutons" role="group" aria-label="Enregistrer les modifications de ce contact ?" ref={bandeau}>
              {/* 🔴 LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS (accord d'Arno) — CE QU'IL Y AVAIT :
                  « Valider aussi les modifications de … ? » et trois boutons (Revenir / Non, sans ce contact / Oui,
                  valider aussi). Désormais un oui ou un non : « Non » abandonne CE contact et enregistre le reste ;
                  « Oui » enregistre tout. « Revenir » n'existe plus : Échap ou un clic hors du bandeau le referme. */}
              <span className="fsy-question">{questionDuContact(edition)}</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void validerAvec(form)}>Non</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
                const b = edition.brouillon;
                if (!contactNomme({ titre: valeurDuChoix(b.titreChoix, b.titreLibre), prenom: b.prenom, nom: b.nom })) {
                  setQuestionContact(false); setErreur('Le contact en cours n’a ni prénom, ni nom, ni titre : complétez-le ou annulez-le.'); return;
                }
                void validerAvec(appliquerBrouillon(form, edition));
              }}>Oui</button>
            </div>
          ) : abandon ? (
            <div className="fsy-boutons" role="group" aria-label="Abandonner les modifications ?">
              <span className="fsy-question">Abandonner les modifications ?</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAbandon(false)}>Non, continuer</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFerme}>Oui, abandonner</button>
            </div>
          ) : (
            <div className="fsy-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={annuler} disabled={envoi}>Annuler</button>
              {mode === 'edition' && (
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => void valider()} disabled={envoi}>
                  {envoi ? 'Enregistrement…' : 'Valider'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — la question du bandeau : « Enregistrer les modifications
 * de Augustin JOREL ? » pour un contact existant, « Enregistrer le nouveau contact Prénom NOM ? » pour un nouveau.
 */
function questionDuContact(e: EtatEdition): string {
  const nom = prenomNom(e.brouillon.prenom, e.brouillon.nom);
  if (e.nouveau) return nom !== '' ? `Enregistrer le nouveau contact ${nom} ?` : 'Enregistrer le nouveau contact ?';
  return `Enregistrer les modifications de ${nom !== '' ? nom : 'ce contact'} ?`;
}

/** LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — une autre adresse de la parcelle, à un AUTRE syndic. */
interface ConflitPossible { autre: string; affichee: string; syndic: { id: number; nom: string; ville: string | null }; coproCle: string; parcelle: string }
/** Ce que l'écran sait de la parcelle de la copropriété du bien, pour les étapes du Valider. */
interface RapportParcelle {
  proposables: number; rattachee: boolean; alerteDue: boolean; coproCle: string | null;
  conflits: ConflitPossible[]; memeSyndic: Array<{ coproLibelle: string; affichee: string }>;
  bien: { libelle: string; codePostal: string; commune: string; affichee: string } | null;
}
const RAPPORT_VIDE: RapportParcelle = { proposables: 0, rattachee: false, alerteDue: false, coproCle: null, conflits: [], memeSyndic: [], bien: null };

// ══ ÉTAPE 1 — CHERCHER UN SYNDIC EXISTANT ═══════════════════════════════════════════════════════════════════════

function Recherche({ immeubleDepart, onRattacher, ancienSyndicId = null }: {
  immeubleDepart: ImmeubleSaisi | null; onRattacher: (id: number) => void;
  /** LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — le syndic qu'on vient de retirer de cette copropriété : sans recherche, il
   *  passe en FIN de liste (jamais proposé en tête) ; une recherche le trouve comme les autres. */
  ancienSyndicId?: number | null;
}) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<SyndicResume[] | null>(null);
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`/api/admin/gestion/syndics?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ syndics?: SyndicResume[] }>)
        .then((j) => { if (vivant) setListe(j.syndics ?? []); })
        .catch(() => { if (vivant) setListe([]); });
    }, 200);
    return () => { vivant = false; clearTimeout(t); };
  }, [q]);
  const i = immeubleDepart?.libelle.trim() ?? '';
  return (
    <div className="fsy-bloc">
      {i !== '' && immeubleDepart !== null ? (
        <p className="fsy-discret">
          Immeuble : <strong>{adresseImmeuble(i, immeubleDepart.codePostal, immeubleDepart.commune)}</strong> — aucun syndic connu.
        </p>
      ) : immeubleDepart !== null && (
        <p className="fsy-discret">Ce bien n’a pas d’« Immeuble » dans l’export WIPPIMMO : il ne recevra un syndic que par son immeuble.</p>
      )}
      <label className="fsy-champ">
        <span>Chercher un syndic existant (nom, e-mail, domaine)</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. Citya, foncia.com…" autoFocus />
      </label>
      {liste === null ? <p className="fsy-discret">Recherche…</p> : liste.length === 0 ? (
        <p className="fsy-discret">Aucun syndic {q.trim() === '' ? 'enregistré pour l’instant' : 'ne répond à cette recherche'}.</p>
      ) : (
        <ul className="fsy-liste">
          {(ancienSyndicId !== null && q.trim() === ''
            ? [...liste.filter((s) => s.id !== ancienSyndicId), ...liste.filter((s) => s.id === ancienSyndicId)] : liste).map((s) => (
            <li key={s.id} className="fsy-resultat">
              <span className="fsy-resultat-nom">
                <strong>{nomAvecVille(s.nom, s.ville)}</strong>
                <span className="fsy-discret">{s.nbCoproprietes} copropriété{s.nbCoproprietes > 1 ? 's' : ''} · {s.nbBiens} bien{s.nbBiens > 1 ? 's' : ''}{s.email ? ` · ${s.email}` : ''}</span>
              </span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onRattacher(s.id)}>
                {i !== '' ? 'Rattacher cet immeuble à ce syndic' : 'Ouvrir'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ══ LES LIENS : e-mail (mailto + composeur), téléphone (tel) ══════════════════════════════════════════════════════

function LienTel({ tel }: { tel: string }) {
  return <a href={lienTelephone(tel)}>{formaterTelephone(tel)}</a>;
}

/**
 * 🔴 LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — LES LIENS D'ACTION, À DROITE, SUR LA MÊME LIGNE.
 * « Écrire depuis gestion@ » n'apparaît que pour un e-mail valide ; sans composeur disponible, c'est un `mailto:`.
 * « Copier » (qui a remplacé « Appeler ») n'apparaît que pour un numéro complet (10 chiffres au moins).
 */
function ActionEcrire({ email, onEcrire }: { email: string; onEcrire?: (email: string) => void }) {
  const e = email.trim();
  if (!emailPlausible(e)) return null;
  return onEcrire
    ? <button type="button" className="fsy-lien-bouton fsy-action" onClick={() => onEcrire(e)}
        title="Écrire depuis gestion@ avec le composeur de l’application">Écrire depuis gestion@</button>
    : <a className="fsy-action" href={`mailto:${e}`}>Écrire</a>;
}

/**
 * 🔴 LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS — « COPIER » REMPLACE « APPELER » (accord d'Arno). Il copie le numéro
 * AU FORMAT PAR PAIRES et dit « Copié » ; c'est le bouton du module (`BoutonCopier`), avec son repli quand le
 * presse-papiers refuse. Seulement pour un numéro complet. Le numéro lui-même reste cliquable (tel:) en lecture.
 */
function ActionCopier({ tel }: { tel: string }) {
  if (!telephoneComplet(tel)) return null;
  return <span className="fsy-action"><BoutonCopier valeur={formaterTelephone(tel)} quoi={`le numéro ${formaterTelephone(tel)}`} /></span>;
}

/**
 * LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE — le GROS triangle jaune (48 px) au point d'exclamation rouge, en SVG inline.
 * Le jaune est le seul ton figé (aucun jeton jaune dans le dépôt) : il se lit sur fond Clair comme Sombre ; le contour
 * et le point d'exclamation suivent les jetons du thème.
 */
function TriangleAlerte() {
  return (
    <svg className="fsy-triangle" width="96" height="96" viewBox="0 0 48 48" role="img" aria-label="Attention">
      <path d="M24 4 L45 42 H3 Z" className="fsy-triangle-fond" strokeLinejoin="round" />
      <rect x="21.5" y="15" width="5" height="16" rx="2" className="fsy-triangle-signe" />
      <circle cx="24" cy="36.5" r="2.8" className="fsy-triangle-signe" />
    </svg>
  );
}

/**
 * ══ LOT COPRO-PLUSIEURS-ADRESSES — LA PETITE LIGNE « AUTRE ADRESSE » ══ l'autocomplétion existante (API Adresse, puis
 * BAN locale en repli — `chercherAdresses`), « Ajouter » / « Annuler ». Un refus (adresse déjà prise) se dit dessous.
 */
function ChampAdresseCopro({ saisie, onSaisie, onAjouter, onAnnuler, refus }: {
  saisie: AdresseSaisie; onSaisie: (a: AdresseSaisie) => void; onAjouter: () => void; onAnnuler: () => void; refus: string | null;
}) {
  const [propositions, setPropositions] = useState<AdresseBan[]>([]);
  const [ouvert, setOuvert] = useState(true);
  useEffect(() => {
    if (!ouvert || saisie.libelle.trim().length < MINIMUM_ADRESSE) { setPropositions([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void chercherAdresses(saisie.libelle, ctrl.signal)
        .then((r) => setPropositions(r.adresses))
        .catch(() => { if (!ctrl.signal.aborted) setPropositions([]); });
    }, 250);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [saisie.libelle, ouvert]);
  return (
    <div className="fsy-ajout-adresse" role="group" aria-label="Ajouter une autre adresse à cette copropriété">
      <div className="fsy-ligne-champ">
        <input type="text" value={saisie.libelle} autoFocus autoComplete="off" aria-label="Autre adresse de la copropriété"
          placeholder="ex. 3 avenue Y" onChange={(e) => { setOuvert(true); onSaisie({ libelle: e.target.value, codePostal: '', commune: '' }); }} />
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" disabled={saisie.libelle.trim() === ''} onClick={onAjouter}>Ajouter</button>
      </div>
      {ouvert && propositions.length > 0 && (
        <ul className="fsy-liste" aria-label="Adresses proposées">
          {propositions.map((b, i) => (
            <li key={`${i}-${b.cle}-${b.commune}`}>
              <button type="button" className="fsy-proposition" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSaisie({ libelle: b.libelle, codePostal: b.codePostal ?? '', commune: b.commune }); setOuvert(false); }}>
                {adresseImmeuble(b.libelle, b.codePostal, b.commune)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {refus !== null && <p className="fsy-alerte" role="alert">{refus}</p>}
    </div>
  );
}

/**
 * ══ 🔴 LA RUE DU SYNDIC — un choix remplit rue, code postal ET ville ═══════════════════════════════════════════════
 *
 * LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS. La CAUSE de « aucune suggestion pour 8 Rue Denfert Rochereau » :
 * la rue d'un syndic déjà enregistré arrive PRÉ-REMPLIE, et l'ancien champ ne cherchait qu'APRÈS une frappe
 * (`ouvert` à faux au montage, et l'effet sortait aussitôt). Rien n'était demandé — le journal du serveur ne porte
 * aucune requête d'adresse. Le champ cherche donc aussi DÈS QU'ON Y ENTRE, s'il porte déjà 3 caractères.
 *
 * La source : l'API Adresse (la même que les fiches de l'annuaire), puis la BAN locale en repli (`chercherAdresses`).
 * Les trois champs restent modifiables à la main.
 */
function ChampRue({ form, setForm, manque }: { form: SyndicForm; setForm: (f: SyndicForm) => void; manque: boolean }) {
  const [propositions, setPropositions] = useState<AdresseBan[]>([]);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert || form.adresse.trim().length < MINIMUM_ADRESSE) { setPropositions([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void chercherAdresses(form.adresse, ctrl.signal)
        .then((r) => setPropositions(r.adresses))
        .catch(() => { if (!ctrl.signal.aborted) setPropositions([]); });
    }, 250);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [form.adresse, ouvert]);
  return (
    <div className="fsy-bloc fsy-bloc--serre"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOuvert(false); }}>
      <label className={`fsy-champ${manque ? ' fsy-champ--manque' : ''}`}>
        <span>Adresse (rue) *</span>
        <input type="text" value={form.adresse} aria-invalid={manque} autoComplete="off"
          onFocus={() => setOuvert(true)}
          onChange={(e) => { setOuvert(true); setForm({ ...form, adresse: e.target.value }); }} />
      </label>
      {ouvert && propositions.length > 0 && (
        <ul className="fsy-liste" aria-label="Adresses proposées">
          {propositions.map((b, i) => (
            <li key={`${i}-${b.cle}-${b.commune}`}>
              <button type="button" className="fsy-proposition" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                setForm({ ...form, adresse: b.libelle, codePostal: b.codePostal ?? form.codePostal, ville: b.commune });
                setOuvert(false); setPropositions([]);
              }}>
                <span className="fsy-proposition-adresse">{adresseImmeuble(b.libelle, b.codePostal, b.commune)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Le CODE POSTAL (5 chiffres) et la VILLE ; le code postal propose la ou les villes connues de l'application. */
function ChampsCpVille({ form, setForm, manques }: { form: SyndicForm; setForm: (f: SyndicForm) => void; manques: ChampAdresse[] }) {
  const [villes, setVilles] = useState<string[]>([]);
  useEffect(() => {
    if (!/^\d{5}$/.test(form.codePostal)) { setVilles([]); return; }
    let vivant = true;
    void fetch(`/api/admin/gestion/syndics/communes?cp=${form.codePostal}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ communes?: string[] }>)
      .then((j) => { if (vivant) setVilles(j.communes ?? []); })
      .catch(() => { if (vivant) setVilles([]); });
    return () => { vivant = false; };
  }, [form.codePostal]);
  const propositions = villes.filter((v) => v !== form.ville.trim());
  return (
    <>
      <div className="fsy-duo">
        <label className={`fsy-champ fsy-champ--cp${manques.includes('codePostal') ? ' fsy-champ--manque' : ''}`}>
          <span>Code postal *</span>
          <input type="text" inputMode="numeric" maxLength={5} value={form.codePostal} aria-invalid={manques.includes('codePostal')}
            onChange={(e) => setForm({ ...form, codePostal: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
        </label>
        <label className={`fsy-champ${manques.includes('ville') ? ' fsy-champ--manque' : ''}`}>
          <span>Ville *</span>
          <input type="text" value={form.ville} aria-invalid={manques.includes('ville')}
            onChange={(e) => setForm({ ...form, ville: e.target.value })} />
        </label>
      </div>
      {propositions.length > 0 && (
        <p className="fsy-villes">
          <span className="fsy-discret">Ville pour {form.codePostal} :</span>
          {propositions.map((v) => (
            <button key={v} type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn"
              onClick={() => setForm({ ...form, ville: v })}>{v}</button>
          ))}
        </p>
      )}
    </>
  );
}

// ══ LA FICHE ═════════════════════════════════════════════════════════════════════════════════════════════════════

function Edition({ form, setForm, fiche, syndicId, onEcrire, connus, suppression, setSuppression, demanderSuppression, envoi, onSupprimer, tente,
  ouverts, setOuverts, edition, setEdition, cleDepart, retrait = null, adresseBien = null, onParcelle, voirParcelle = 0 }: {
  /** LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — l'état des propositions de la parcelle, pour l'alerte du Valider. */
  onParcelle?: (e: RapportParcelle) => void;
  /** Incrémenté par « Voir les adresses » : déplie la liste des propositions et y fait défiler. */
  voirParcelle?: number;
  /** LOT COPRO-PLUSIEURS-ADRESSES — l'adresse propre du bien, si c'est une adresse secondaire de sa copropriété. */
  adresseBien?: ImmeubleSaisi | null;
  form: SyndicForm; setForm: (f: SyndicForm) => void; fiche: Fiche | null; syndicId: number | null;
  /** LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — le gros bouton (ou sa confirmation), sous le bloc 2, depuis un bien. */
  retrait?: React.ReactNode;
  onEcrire?: (email: string) => void; connus: ImmeubleConnu[];
  suppression: 0 | 1 | 2; setSuppression: (v: 0 | 1 | 2) => void; demanderSuppression: () => void; envoi: boolean; onSupprimer: () => void;
  /** Vrai après un « Valider » refusé : les champs d'adresse vides se cerclent de rouge. */
  tente: boolean;
  ouverts: string[]; setOuverts: (o: string[]) => void;
  edition: EtatEdition | null; setEdition: (e: EtatEdition | null) => void;
  cleDepart: string | null;
}) {
  /** Les copropriétés de la fiche, avec leur adresse complète : pour « Immeubles suivis » et les cases à cocher. */
  const adresses = form.immeubles.map((im) => {
    const c = connus.find((x) => x.cle === cleImmeuble(im.libelle));
    return { cle: cleImmeuble(im.libelle), adresse: adresseImmeuble(im.libelle, c?.codePostal ?? im.codePostal, c?.commune ?? im.commune) };
  });
  const origineEdition = edition === null ? null
    : edition.nouveau ? (edition.depart ?? null)
      : ((edition.immeuble === true ? (form.immeubleContacts?.contacts ?? []) : form.contacts).find((c) => c.cle === edition.cle) ?? null);
  const contactEnCours = edition !== null && contactModifie(origineEdition, edition.brouillon) ? nomAffiche(edition.brouillon) : null;
  /** « Créer un nouveau contact » depuis une copropriété : il naît dans le catalogue, affecté à CET immeuble. */
  const creerContactPour = (cle: string): string | null => {
    if (contactEnCours !== null) return contactEnCours;
    const c = contactVide({ tousImmeubles: false, immeubles: [cle] });
    setEdition({ cle: c.cle, brouillon: c, nouveau: true, depart: copieContact(c) });
    return null;
  };
  const manques = tente ? adresseManquante(form) : [];
  const [noteOuverte, setNoteOuverte] = useState(false);
  /** LOT SYNDIC-MODALE-DEUX-BLOCS — depuis un bien dont l'immeuble est une copropriété de la fiche ? Et laquelle. */
  const adresseDuBien = cleDepart !== null ? (adresses.find((x) => x.cle === cleDepart)?.adresse ?? null) : null;
  /*
   * ══ LOT COPRO-PLUSIEURS-ADRESSES — LES ADRESSES DE LA COPROPRIÉTÉ DU BIEN ══ seule celle du bien s'affiche ; les
   * autres (la principale si le bien est à une adresse secondaire, puis les secondaires) se déplient sous la mention
   * grise. Ajouts et retraits vont dans le formulaire : enregistrés au « Valider ».
   */
  const coproDuBien = adresseDuBien !== null ? (form.immeubles.find((x) => cleImmeuble(x.libelle) === cleDepart) ?? null) : null;
  const cleBien = adresseBien !== null && adresseBien.libelle.trim() !== '' ? cleImmeuble(adresseBien.libelle) : cleDepart;
  const lotsDe = (cle: string): string[] => (connus.find((x) => x.cle === cle)?.lots ?? []).map((l) => l.numero);
  const toutesAdresses = coproDuBien === null ? [] : [
    { cle: cleImmeuble(coproDuBien.libelle), affichee: adresseDuBien as string, secondaire: false, lots: lotsDe(cleImmeuble(coproDuBien.libelle)) },
    ...(coproDuBien.adresses ?? []).map((a) => {
      const k = cleImmeuble(a.libelle);
      const c = connus.find((x) => x.cle === k);
      return { cle: k, affichee: adresseImmeuble(a.libelle, c?.codePostal ?? a.codePostal, c?.commune ?? a.commune), secondaire: true, lots: lotsDe(k) };
    }),
  ];
  const adresseAffichee = toutesAdresses.find((a) => a.cle === cleBien)?.affichee ?? null;
  const autresAdresses = toutesAdresses.filter((a) => a.cle !== cleBien);
  const [ajoutAdresse, setAjoutAdresse] = useState(false);
  const [saisieAdresse, setSaisieAdresse] = useState<AdresseSaisie>({ libelle: '', codePostal: '', commune: '' });
  const [refusAdresse, setRefusAdresse] = useState<string | null>(null);
  const [adressesOuvertes, setAdressesOuvertes] = useState(false);
  const [aRetirerAdresse, setARetirerAdresse] = useState<string | null>(null);
  /*
   * ══ LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE — LES AUTRES ADRESSES DE LA MÊME PARCELLE ══ lues à part (BAN et
   * cadastre LOCAUX), pour TOUTES les adresses de la copropriété (plusieurs parcelles si elle en couvre plusieurs).
   * Ce ne sont que des propositions : « Rattacher » ajoute l'adresse comme un « + » ; une adresse prise ailleurs est
   * grisée, avec la raison. Relu dès que les adresses de la copropriété changent (une adresse retirée redevient proposable).
   */
  /*
   * LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — les adresses de la copropriété TELLES QU'À L'ÉCRAN (enregistrées ou
   * non) : la principale, puis chaque secondaire. Une adresse saisie librement (sans code postal ni ville) prend ceux de
   * la principale — sinon le serveur ne pouvait pas la situer, et elle n'apportait sa parcelle qu'après réouverture.
   */
  const lieuDe = (libelle: string, cp: string, commune: string): { codePostal: string; commune: string } => {
    const c = connus.find((x) => x.cle === cleImmeuble(libelle));
    return { codePostal: c?.codePostal ?? cp ?? '', commune: c?.commune ?? commune ?? '' };
  };
  const lieuPrincipal = coproDuBien === null ? { codePostal: '', commune: '' } : lieuDe(coproDuBien.libelle, coproDuBien.codePostal, coproDuBien.commune);
  const adressesCopro: AdresseSaisie[] = coproDuBien === null ? [] : [
    { libelle: coproDuBien.libelle, ...lieuPrincipal },
    ...(coproDuBien.adresses ?? []).map((a) => {
      const l = lieuDe(a.libelle, a.codePostal, a.commune);
      return { libelle: a.libelle, ...(l.codePostal === '' && l.commune === '' ? lieuPrincipal : l) };
    }),
  ];
  const signatureCopro = JSON.stringify(adressesCopro);
  const [surParcelle, setSurParcelle] = useState<AdresseSaisie[]>([]);
  const [parcelleOuverte, setParcelleOuverte] = useState(false);
  useEffect(() => {
    if (adressesCopro.length === 0) { setSurParcelle([]); return; }
    // Une seule demande vivante : la réponse d'un état DÉPASSÉ des adresses n'écrase jamais celle de l'état courant.
    const ctrl = new AbortController();
    void fetch(`/api/admin/gestion/coproprietes/parcelle?a=${encodeURIComponent(signatureCopro)}`, { cache: 'no-store', signal: ctrl.signal })
      .then((r) => r.json() as Promise<{ etat?: string; adresses?: AdresseSaisie[] }>)
      .then((j) => { if (!ctrl.signal.aborted && j.etat === 'ok') setSurParcelle(j.adresses ?? []); })
      .catch(() => { /* aucune proposition : rien ne change */ });
    return () => { ctrl.abort(); };
  }, [signatureCopro]); // eslint-disable-line react-hooks/exhaustive-deps
  const clesCopro = new Set(adressesCopro.map((a) => cleImmeuble(a.libelle)));
  /**
   * LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — une adresse déjà prise reste dans la liste, grisée, sans bouton, avec
   * « déjà rattachée à une autre copropriété — SYNDIC / Ville » ; elle ne compte ni dans le N ni dans l'alerte du Valider.
   */
  const raisonPrise = (a: AdresseSaisie): string | null => {
    if (coproDuBien === null || conflitAdresse(a, cleImmeuble(coproDuBien.libelle), form.immeubles, connus) === null) return null;
    const k = cleImmeuble(a.libelle);
    const c = connus.find((x) => x.cle === k);
    const ici = form.immeubles.some((im) => cleImmeuble(im.libelle) === k || (im.adresses ?? []).some((x) => cleImmeuble(x.libelle) === k));
    const syndic = ici ? nomAvecVille(form.nom, form.ville) : c?.syndic ? nomAvecVille(c.syndic.nom, c.syndic.ville) : null;
    return `déjà rattachée à une autre copropriété${syndic ? ` — ${syndic}` : ''}`;
  };
  const propositions = coproDuBien === null ? [] : surParcelle.filter((a) => !clesCopro.has(cleImmeuble(a.libelle))).map((a) => ({
    a, affichee: adresseImmeuble(a.libelle, a.codePostal, a.commune), raison: raisonPrise(a) }));
  const proposables = propositions.filter((p) => p.raison === null);
  const prisesAilleurs = propositions.length - proposables.length;
  /** Une adresse rattachée PENDANT cette session de la fiche (par « Rattacher » ou par le « + ») : pas d'alerte au Valider. */
  const [rattacheeIci, setRattacheeIci] = useState(false);
  const rattacher = (a: AdresseSaisie): void => {
    if (coproDuBien === null) return;
    setRattacheeIci(true);
    setForm({ ...form, immeubles: form.immeubles.map((x) => (x === coproDuBien ? { ...x, adresses: [...(x.adresses ?? []), { libelle: a.libelle, codePostal: a.codePostal, commune: a.commune }] } : x)) });
  };
  /*
   * LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — LE « + » PULSE tant qu'il y a des propositions NON VUES : deux
   * pulsations amples, puis une douce et lente ; vues dès que la liste est dépliée ou le « + » cliqué. Une proposition
   * NOUVELLE (une adresse ajoutée apporte sa parcelle) relance la pulsation.
   */
  const [vues, setVues] = useState<ReadonlySet<string>>(new Set());
  const pulse = proposables.some((p) => !vues.has(cleImmeuble(p.a.libelle)));
  const marquerVues = (): void => setVues(new Set([...vues, ...proposables.map((p) => cleImmeuble(p.a.libelle))]));
  /*
   * LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — ce que le pied doit savoir au Valider :
   *   · l'alerte « autres adresses » n'est DUE qu'au premier rattachement de la copropriété du bien à un syndic, et si
   *     elle n'a jamais été montrée pour elle ;
   *   · les adresses de la parcelle tenues par une copropriété d'un AUTRE syndic ⇒ conflit possible ;
   *   · celles d'une autre copropriété de CE syndic ⇒ simple proposition de regroupement.
   */
  const nouvelleCopro = coproDuBien !== null && !(fiche?.coproprietes ?? []).some((c) => c.cle === cleImmeuble(coproDuBien.libelle));
  const dejaAlertee = coproDuBien !== null && connus.find((x) => x.cle === cleImmeuble(coproDuBien.libelle))?.alerteParcelle === true;
  const conflitsParcelle: ConflitPossible[] = [];
  const memeSyndic: Array<{ coproLibelle: string; affichee: string }> = [];
  for (const p of propositions) {
    if (p.raison === null || coproDuBien === null) continue;
    const k = cleImmeuble(p.a.libelle);
    const ici = form.immeubles.find((im) => im !== coproDuBien && (cleImmeuble(im.libelle) === k || (im.adresses ?? []).some((x) => cleImmeuble(x.libelle) === k)));
    if (ici !== undefined) { memeSyndic.push({ coproLibelle: ici.libelle, affichee: p.affichee }); continue; }
    const c = connus.find((x) => x.cle === k);
    if (c?.syndic && c.syndic.id !== syndicId) {
      conflitsParcelle.push({ autre: p.a.libelle, affichee: p.affichee, syndic: { id: c.syndic.id, nom: c.syndic.nom, ville: c.syndic.ville ?? null },
        coproCle: c.principale?.cle ?? c.cle, parcelle: (p.a as AdresseSaisie & { parcelle?: string }).parcelle ?? '' });
    }
  }
  const bienLibelle = adresseBien !== null && adresseBien.libelle.trim() !== '' ? adresseBien : coproDuBien;
  const rapport: RapportParcelle = {
    proposables: proposables.length, rattachee: rattacheeIci, alerteDue: nouvelleCopro && !dejaAlertee,
    coproCle: coproDuBien === null ? null : cleImmeuble(coproDuBien.libelle),
    conflits: nouvelleCopro ? conflitsParcelle : [], memeSyndic: nouvelleCopro ? memeSyndic : [],
    bien: bienLibelle === null ? null : { libelle: bienLibelle.libelle, codePostal: lieuDe(bienLibelle.libelle, bienLibelle.codePostal, bienLibelle.commune).codePostal,
      commune: lieuDe(bienLibelle.libelle, bienLibelle.codePostal, bienLibelle.commune).commune, affichee: adresseAffichee ?? adresseDuBien ?? '' },
  };
  const signatureRapport = JSON.stringify(rapport);
  // Le pied (alertes au Valider) connaît tout cela ; « Voir les adresses » déplie et fait défiler.
  useEffect(() => { onParcelle?.(rapport); }, [signatureRapport]); // eslint-disable-line react-hooks/exhaustive-deps
  const listeParcelle = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (voirParcelle === 0) return;
    setParcelleOuverte(true);
    marquerVues();
    setTimeout(() => listeParcelle.current?.scrollIntoView?.({ block: 'nearest' }), 0);
  }, [voirParcelle]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lotsOuverts, setLotsOuverts] = useState(false);
  const groupes = lotsDuPortefeuille(form.immeubles, connus, adresseDuBien !== null ? cleDepart : null,
    new Set((fiche?.coproprietes ?? []).flatMap((c) => [c.cle, ...(c.adresses ?? []).map((a) => a.cle)])));
  const lots = groupes.flatMap((g) => g.lots);
  const contacts = useContacts({ form, setForm, onEcrire, ouverts, setOuverts, edition, setEdition, cleDepart, adresses, syndicId });
  const majTel = (i: number, v: string): void =>
    setForm({ ...form, telephones: form.telephones.map((t, j) => (j === i ? saisieTelephone(t, v) : t)) });
  const retirerTel = (i: number): void => {
    const reste = form.telephones.filter((_, j) => j !== i);
    setForm({ ...form, telephones: reste.length === 0 ? [''] : reste });
  };
  const a = apercuPropagation(form.immeubles, connus, syndicId);
  const retirees = coproprietesRetirees(fiche === null ? [] : versFormulaire(fiche).immeubles, form.immeubles);
  const biensPerdus = fiche?.coproprietes.flatMap((c) => c.lots.map((l) => ({ ...l, immeuble: adresseImmeuble(c.libelle, c.codePostal, c.commune) }))) ?? [];

  return (
    <div className="fsy-bloc fsy-deux-blocs">
      {/* ══ 🔴🔴 LOT SYNDIC-MODALE-DEUX-BLOCS — DEUX BLOCS ENCADRÉS, L'UN SOUS L'AUTRE, SANS RIEN RETIRER ══════════════
          ARNO : « la fiche syndic est peu claire ». BLOC 1 = ce qui est déjà validé pour cet immeuble (coordonnées du
          cabinet + ses contacts) ; BLOC 2 = « Gérer ce syndic » (ajouter un contact, copropriétés, propagation).
          L'historique, la trace et « Supprimer ce syndic » restent en dessous, comme avant. */}
      <section className="fsy-cadre" aria-labelledby="fsy-bloc-1">
      <h3 className="fsy-sous-titre fsy-cadre-titre" id="fsy-bloc-1">
        {adresseDuBien !== null ? `Syndic de l’immeuble · ${adresseAffichee ?? adresseDuBien}` : 'Coordonnées et contacts du cabinet'}
        {/* LOT COPRO-PLUSIEURS-ADRESSES — le « + » discret, et la mention grise des autres adresses. */}
        {coproDuBien !== null && (
          <>
            <button type="button" className={`fsy-plus-adresse${pulse ? ' fsy-plus-adresse--pulse' : ''}`} title="Ajouter une autre adresse à cette copropriété"
              aria-label="Ajouter une autre adresse à cette copropriété" onClick={() => { marquerVues(); setAjoutAdresse(true); setSaisieAdresse({ libelle: '', codePostal: '', commune: '' }); setRefusAdresse(null); }}>+</button>
            {autresAdresses.length > 0 && (
              <button type="button" className="fsy-autres-adresses" aria-expanded={adressesOuvertes} onClick={() => setAdressesOuvertes(!adressesOuvertes)}>
                · {autresAdresses.length === 1 ? '1 autre adresse' : `${autresAdresses.length} autres adresses`} {adressesOuvertes ? '▾' : '▸'}
              </button>
            )}
            {/* LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE — la mention grise des propositions de la parcelle. */}
            {propositions.length > 0 && (
              /* LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — N = les adresses PROPOSABLES ; les prises ailleurs en gris. */
              <button type="button" className="fsy-autres-adresses fsy-parcelle-mention" aria-expanded={parcelleOuverte}
                onClick={() => { if (!parcelleOuverte) marquerVues(); setParcelleOuverte(!parcelleOuverte); }}>
                · {proposables.length > 0
                  ? `${proposables.length === 1 ? '1 adresse' : `${proposables.length} adresses`} sur la même parcelle`
                  : `${prisesAilleurs === 1 ? '1 adresse' : `${prisesAilleurs} adresses`} de la parcelle déjà rattachée${prisesAilleurs > 1 ? 's' : ''} ailleurs`}
                {proposables.length > 0 && prisesAilleurs > 0 && <span className="fsy-prises-ailleurs"> (+ {prisesAilleurs} déjà rattachée{prisesAilleurs > 1 ? 's' : ''} ailleurs)</span>}
                {' '}{parcelleOuverte ? '▾' : '▸'}
              </button>
            )}
          </>
        )}
      </h3>
      {coproDuBien !== null && ajoutAdresse && (
        <ChampAdresseCopro saisie={saisieAdresse} onSaisie={(a) => { setSaisieAdresse(a); setRefusAdresse(null); }} refus={refusAdresse}
          onAnnuler={() => { setAjoutAdresse(false); setRefusAdresse(null); }}
          onAjouter={() => {
            const m = conflitAdresse(saisieAdresse, cleImmeuble(coproDuBien.libelle), form.immeubles, connus);
            if (m !== null) { setRefusAdresse(m); return; }
            setForm({ ...form, immeubles: form.immeubles.map((x) => (x === coproDuBien
              ? { ...x, adresses: [...(x.adresses ?? []), { libelle: saisieAdresse.libelle.trim(), codePostal: saisieAdresse.codePostal, commune: saisieAdresse.commune }] } : x)) });
            setRattacheeIci(true);
            setAjoutAdresse(false);
          }} />
      )}
      {coproDuBien !== null && parcelleOuverte && propositions.length > 0 && (
        <ul className="fsy-suivis-liste fsy-parcelle-liste" aria-label="Adresses sur la même parcelle" ref={listeParcelle}>
          {propositions.map((p) => (
            <li key={cleImmeuble(p.a.libelle)} className={`fsy-adresse-copro${p.raison !== null ? ' fsy-adresse-prise' : ''}`}>
              <span>{p.affichee}{p.raison !== null && <span className="fsy-discret"> — {p.raison}</span>}</span>
              {p.raison === null && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => rattacher(p.a)}>Rattacher</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {coproDuBien !== null && adressesOuvertes && autresAdresses.length > 0 && (
        <ul className="fsy-suivis-liste fsy-adresses-copro" aria-label="Autres adresses de cette copropriété">
          {autresAdresses.map((a) => (
            <li key={a.cle} className="fsy-adresse-copro">
              {aRetirerAdresse === a.cle ? (
                <span className="fsy-confirmer" role="group" aria-label="Confirmer le retrait de l’adresse">
                  <span>Retirer cette adresse de la copropriété ?{a.lots.length > 0 ? ` ${a.lots.map((l) => `lot ${l}`).join(', ')} ${a.lots.length > 1 ? 'perdront' : 'perdra'} ce syndic.` : ''}</span>
                  <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setARetirerAdresse(null)}>Non</button>
                  <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => {
                    setForm({ ...form, immeubles: form.immeubles.map((x) => (x === coproDuBien
                      ? { ...x, adresses: (x.adresses ?? []).filter((y) => cleImmeuble(y.libelle) !== a.cle) } : x)) });
                    setARetirerAdresse(null);
                  }}>Oui</button>
                </span>
              ) : (
                <>
                  <span>{a.affichee}</span>
                  {a.secondaire && (
                    <button type="button" className="fsy-mini fsy-retirer-adresse" aria-label={`Retirer ${a.affichee} de la copropriété`}
                      onClick={() => setARetirerAdresse(a.cle)}>×</button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* 🔴 UN SYNDIC EXISTANT SANS ADRESSE COMPLÈTE reste consultable ; l'obligation vaut à la prochaine modification. */}
      {fiche !== null && adresseManquante(fiche).length > 0 && (
        <p className="fsy-alerte">Complétez code postal et ville{fiche.adresse ? '' : ', et la rue'} : ils sont obligatoires pour enregistrer une modification.</p>
      )}
      <label className={`fsy-champ${tente && form.nom.trim() === '' ? ' fsy-champ--manque' : ''}`}>
        <span>Nom du cabinet *</span>
        <input type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
      </label>
      <ChampRue form={form} setForm={setForm} manque={manques.includes('adresse')} />
      <ChampsCpVille form={form} setForm={setForm} manques={manques} />

      <div className="fsy-champ fsy-champ--groupe">
        <span>Téléphone standard</span>
        {form.telephones.map((t, i) => (
          <span key={i} className="fsy-ligne-tel">
            <input type="tel" inputMode="tel" aria-label={i === 0 ? 'Téléphone standard' : 'Second téléphone standard'}
              value={t} onChange={(e) => majTel(i, e.target.value)} placeholder="01 23 45 67 89" />
            {(form.telephones.length > 1 || t.trim() !== '') && (
              <button type="button" className="fsy-mini" aria-label={`Retirer ce numéro${t ? ` (${t})` : ''}`} onClick={() => retirerTel(i)}>×</button>
            )}
            {i === 0 && form.telephones.length < 2 && (
              <button type="button" className="fsy-mini" aria-label="Ajouter un second numéro de standard" title="Ajouter un second numéro"
                onClick={() => setForm({ ...form, telephones: [...form.telephones, ''] })}>+</button>
            )}
            <ActionCopier tel={t} />
          </span>
        ))}
      </div>
      {/* 🔴 LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — LA LIGNE EN DOUBLON (numéros et e-mail répétés sous ce champ)
          EST RETIRÉE, avec l'accord d'Arno pour CE doublon : « Copier » est au bout de chaque numéro, et « Écrire
          depuis gestion@ » au bout du champ, sur la même ligne. */}
      <div className="fsy-champ">
        <span id="fsy-email-generique">E-mail générique</span>
        <span className="fsy-ligne-champ">
          <input type="email" aria-labelledby="fsy-email-generique" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <ActionEcrire email={form.email} onEcrire={onEcrire} />
        </span>
      </div>
      {/* 🔴 LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — UNE NOTE VIDE NE S'AFFICHE PAS (accord d'Arno pour ce masquage) : à sa
          place, « + note », au style de « + téléphone ». Un clic ouvre le champ vide, le curseur dedans. Une note
          vidée puis validée disparaît à la réouverture (on relit `form.note` à l'ouverture). */}
      {/* ══ 🔴 LOT SYNDIC-NOTE-PAR-BIEN — DEPUIS UN BIEN, la note est CELLE DE CE BIEN (couple lot, syndic) : « Note pour ce
          bien », vide par défaut, enregistrée au « Valider ». La note générale du cabinet ne s'y édite pas : elle est
          montrée en LECTURE SEULE sous « Note du cabinet », si elle n'est pas vide, et reste éditable depuis l'écran
          « Syndics ». Sans bien : « Note », la note du cabinet, comme avant. */}
      {form.lotNote !== null && form.note.trim() !== '' && (
        <div className="fsy-champ">
          <span>Note du cabinet</span>
          <p className="fsy-note-cabinet">{form.note}</p>
        </div>
      )}
      {form.lotNote !== null ? (noteOuverte || form.noteBien.trim() !== '' ? (
        <label className="fsy-champ">
          <span>Note pour ce bien</span>
          <textarea rows={2} value={form.noteBien} autoFocus={noteOuverte && form.noteBien === ''}
            onChange={(e) => { setNoteOuverte(true); setForm({ ...form, noteBien: e.target.value }); }} />
        </label>
      ) : (
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-ajout" onClick={() => setNoteOuverte(true)}>+ note</button>
      )) : noteOuverte || form.note.trim() !== '' ? (
        <label className="fsy-champ">
          <span>Note</span>
          <textarea rows={2} value={form.note} autoFocus={noteOuverte && form.note === ''}
            /* ⚠️ Une note qu'on EFFACE reste à l'écran le temps de la saisie (sinon le champ disparaîtrait sous le
               curseur) ; elle ne se masque qu'à la réouverture de la fiche. */
            onChange={(e) => { setNoteOuverte(true); setForm({ ...form, note: e.target.value }); }} />
        </label>
      ) : (
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-ajout" onClick={() => setNoteOuverte(true)}>+ note</button>
      )}

      {/* 🔴 LOT SYNDIC-MODALE-DEUX-BLOCS — « Contacts de cet immeuble » (depuis un bien) ou « Contacts du cabinet » (au
          lieu de « AUTRES CONTACTS ») ; mêmes tuiles, mêmes trois états. Un contact ajouté dans le bloc 2 apparaît ICI. */}
      {/* LOT SYNDIC-TITRES-COPROPRIETE — « Contacts de cet immeuble » devient « Contacts de cette copropriété ». */}
      {/* LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — « Contacts de cette copropriété » devient : */}
      <h4 className="fsy-sous-titre">{adresseDuBien !== null ? 'Contact(s) syndic de cette copropriété' : 'Contacts du cabinet'}</h4>
      {contacts.liste}
      {/* LOT COPRO-CONTACTS-IMMEUBLE — la liste séparée du carnet de l'immeuble (absente s'il est vide). */}
      {contacts.listeImmeuble}
      {contacts.bouton}
      </section>

      {/* ══ 🔴🔴 LOT SYNDIC-BLOC-AJOUT-CONTACT — LE BLOC D'AJOUT, SON PROPRE CADRE, entre le bloc 1 et « Gérer ce syndic »,
          et SEULEMENT pendant un ajout. « × Fermer » le ferme sans rien rattacher ni créer. Après « Ajouter à cette
          copropriété » ou « Valider » du nouveau contact, il se ferme et le contact apparaît dans la liste du bloc 1. */}
      {contacts.ajout !== null && (
        <section className="fsy-cadre fsy-cadre--ajout" aria-labelledby="fsy-bloc-ajout">
          <div className="fsy-cadre-tete">
            <h3 className="fsy-sous-titre fsy-cadre-titre" id="fsy-bloc-ajout">
              {/* LOT SYNDIC-TITRES-COPROPRIETE — « Ajouter un contact à cet immeuble » devient : */}
              {adresseDuBien !== null ? 'Ajouter un contact syndic à cette copropriété' : 'Ajouter un contact au cabinet'}
            </h3>
            <button type="button" className="fsy-lien-bouton fsy-fermer-ajout" onClick={() => setEdition(null)}
              aria-label="Fermer l’ajout de contact sans rien rattacher ni créer">× Fermer</button>
          </div>
          {contacts.ajout}
        </section>
      )}
      {/* LOT COPRO-CONTACTS-IMMEUBLE — le bloc « Ajouter un contact de l'immeuble » : même cadre, même « × Fermer »,
          PAS de catalogue. */}
      {contacts.ajoutImmeuble !== null && (
        <section className="fsy-cadre fsy-cadre--ajout fsy-cadre--ajout-immeuble" aria-labelledby="fsy-bloc-ajout-immeuble">
          <div className="fsy-cadre-tete">
            <h3 className="fsy-sous-titre fsy-cadre-titre" id="fsy-bloc-ajout-immeuble">Ajouter un contact de l’immeuble</h3>
            <button type="button" className="fsy-lien-bouton fsy-fermer-ajout" onClick={() => setEdition(null)}
              aria-label="Fermer l’ajout de contact de l’immeuble sans rien créer">× Fermer</button>
          </div>
          {contacts.ajoutImmeuble}
        </section>
      )}

      <section className="fsy-cadre" aria-labelledby="fsy-bloc-2">
      {/* LOT SYNDIC-BLOC-PORTEFEUILLE — « Gérer ce syndic » devient « Syndic & portefeuille de gestion ». */}
      <h3 className="fsy-sous-titre fsy-cadre-titre" id="fsy-bloc-2">Syndic &amp; portefeuille de gestion</h3>

      <EditionCopros immeubles={form.immeubles} connus={connus} syndicId={syndicId}
        /* LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — une copropriété retirée sort aussi des contacts qui la suivaient. */
        onChange={(l) => {
          const restent = new Set(l.map((i) => cleImmeuble(i.libelle)));
          setForm({ ...form, immeubles: l, contacts: form.contacts.map((c) => ({ ...c, immeubles: c.immeubles.filter((k) => restent.has(k)) })) });
        }}
        contacts={form.contacts} onContacts={(cs) => setForm({ ...form, contacts: cs })}
        enModification={edition?.nouveau === false ? edition.cle : null}
        onCreerContact={creerContactPour} />

      {/* ══ 🔴 LOT SYNDIC-BLOC-PORTEFEUILLE — « LOTS DU PORTEFEUILLE LIÉS À CE SYNDIC (N) », au format de la ligne des
          copropriétés, repliée par défaut. Elle remplace « Biens qui recevront ce syndic » et en garde l'information :
          un lot qui ne recevra ce syndic qu'au « Valider » porte la pastille orange « en attente de validation » (LOT
          SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE ; avant : la mention grise « au Valider », incomprise). Groupés par immeuble
          (la copropriété du bien d'abord, puis par nom de voie et numéro) ; dans un groupe, par premier propriétaire. */}
      {lots.length === 0 ? (
        <div className="fsy-copros-ligne fsy-copros-ligne--vide fsy-lots-ligne">
          <strong>Lots du portefeuille liés à ce syndic (0)</strong>
        </div>
      ) : (
        <button type="button" className="fsy-copros-ligne fsy-lots-ligne" aria-expanded={lotsOuverts} onClick={() => setLotsOuverts(!lotsOuverts)}>
          <strong>Lots du portefeuille liés à ce syndic ({lots.length})</strong>
          <span className="fsy-fleche" aria-hidden="true">{lotsOuverts ? '▾' : '▸'}</span>
        </button>
      )}
      {lotsOuverts && lots.length > 0 && (
        <div className="fsy-lots">
          {/* 🔴 LOT SYNDIC-NOTE-PAR-BIEN-ET-GROUPES-COPROS — chaque copropriété est un SOUS-CADRE : en-tête (adresse en gras
              foncé, nombre de lots à droite, pastille « copropriété de ce bien » pour la première depuis un bien), un
              trait fin, puis les lignes de lots, inchangées. */}
          {groupes.map((g) => (
            <div key={g.cle} className="fsy-lots-groupe">
              <div className="fsy-lots-tete">
                <span className="fsy-lots-adresse">{g.adresse}</span>
                {adresseDuBien !== null && g.cle === cleDepart && <span className="fsy-pastille">copropriété de ce bien</span>}
                <span className="fsy-lots-nombre">{g.lots.length === 1 ? '1 lot' : `${g.lots.length} lots`}</span>
              </div>
              <ul className="fsy-liste fsy-liste--serree">
                {/* LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — DEUX LIGNES par lot : ① « lot N » — adresse, pastille éventuelle ;
                    ② dessous, à gauche, les propriétaires tels qu'en base (aucune réécriture), petit et gris. Retour à la
                    ligne naturel : jamais de « … », jamais de colonne de droite (un long nom cassait la ligne du lot 406). */}
                {g.lots.map((l) => {
                  const proprios = l.proprietaires ?? [];
                  return (
                    <li key={l.id} className="fsy-lot">
                      <span className="fsy-lot-ligne1">
                        <strong>lot {l.numero}</strong> — {[l.adresse, l.commune].filter((x) => x).join(', ')}
                        {l.aValider && (
                          <> <span className="fsy-pastille-attente" title="Ce lot recevra ce syndic quand vous cliquerez sur Valider">en attente de validation</span></>
                        )}
                      </span>
                      <span className="fsy-lot-proprios">
                        {proprios.length === 0 ? 'Propriétaire non renseigné'
                          : `${proprios.length > 1 ? 'Propriétaires' : 'Propriétaire'} : ${proprios.join(' · ')}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {a.changements.length > 0 && (
        <div className="fsy-alerte">
          Changement de syndic à la validation :
          <ul>{a.changements.map((x) => <li key={x.immeuble}>{x.immeuble} — aujourd’hui {x.ancien} (le lien passera en historique)</li>)}</ul>
        </div>
      )}
      {retirees.length > 0 && (
        <div className="fsy-alerte">
          Copropriétés retirées à la validation (le lien passe en historique, rien n’est effacé) :
          <ul>{retirees.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      </section>

      {/* LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — sous « Syndic & portefeuille de gestion », au-dessus de « Créé le … ». */}
      {retrait}

      {fiche !== null && fiche.historique.length > 0 && (
        <details className="fsy-historique">
          <summary>Historique des copropriétés ({fiche.historique.length})</summary>
          <ul>
            {fiche.historique.map((h, i) => (
              <li key={i}>{h.libelle} — du {jour(h.debut)} au {jour(h.fin)}{h.motif ? ` (${h.motif})` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {fiche !== null && (
        <p className="fsy-discret fsy-trace">
          Créé le {jour(fiche.creeLe)} par {fiche.creeParLibelle}
          {fiche.majLe ? ` · modifié le ${jour(fiche.majLe)} par ${fiche.majParLibelle ?? '—'}` : ''}
        </p>
      )}

      {/* ══ 🔴 « SUPPRIMER CE SYNDIC » — discret, en bas, avec la liste des biens qui le perdront ══ */}
      {/* 🔴 LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE — CE QU'IL Y AVAIT : le lien « Supprimer ce syndic » et UNE
          confirmation qui listait les biens. Désormais « … pour cause de fermeture définitive » et DEUX confirmations,
          dans un encadré d'alerte au GROS triangle jaune : les vrais chiffres, puis « Confirmez-vous … ? ». */}
      {/* LOT SYNDIC-FERMETURE-ALERTE-MISE-EN-FORME — CE QU'IL Y AVAIT : triangle de 48 px et trois phrases aux seuls
          chiffres. Désormais triangle de 96 px, titre, une ligne par copropriété (avec ses lots) et par contact, listes qui
          défilent seules au-delà de 6 lignes, boutons en bas à droite de l'encadré. */}
      {fiche !== null && syndicId !== null && (suppression !== 0 ? (
        <div className="fsy-fermeture" role="group" aria-label="Confirmer la suppression définitive du syndic">
          <TriangleAlerte />
          <div className="fsy-fermeture-texte">
            {suppression === 1 ? (() => {
              const r = resumeFermeture(fiche);
              return (
                <>
                  <p className="fsy-fermeture-titre">{r.titre}</p>
                  <p>Cette action va :</p>
                  <section className="fsy-fermeture-partie" aria-label="Copropriétés détachées">
                    <p className="fsy-fermeture-sous-titre">Copropriétés détachées ({r.coproprietes.length})</p>
                    {r.coproprietes.length === 0 ? <p className="fsy-fermeture-vide">Aucune copropriété rattachée</p> : (
                      <ul className="fsy-fermeture-liste">
                        {r.coproprietes.map((c, i) => (
                          <li key={i}>{c.adresse} — {c.lots}{c.secondaires !== null && <span className="fsy-fermeture-gris"> {c.secondaires}</span>}</li>
                        ))}
                      </ul>
                    )}
                    <p>{r.phraseLots}</p>
                  </section>
                  <section className="fsy-fermeture-partie" aria-label="Contacts supprimés">
                    <p className="fsy-fermeture-sous-titre">Contacts supprimés ({r.contacts.length})</p>
                    {r.contacts.length === 0 ? <p className="fsy-fermeture-vide">Aucun contact</p> : (
                      <>
                        <ul className="fsy-fermeture-liste">
                          {r.contacts.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                        <p>Ces contacts seront également effacés de l’application.</p>
                      </>
                    )}
                  </section>
                  <p className="fsy-fermeture-gris">Le gardien et les habitants des immeubles (carnet de l’immeuble) ne sont pas touchés.</p>
                </>
              );
            })() : (
              <p><strong>Confirmez-vous la fermeture définitive de {nomAvecVille(fiche.nom, fiche.ville)} ?</strong> Cette action ne peut pas être annulée depuis l’application.</p>
            )}
          </div>
          <div className="fsy-boutons fsy-fermeture-boutons">
            {suppression === 1 ? (
              <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setSuppression(0)} disabled={envoi}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setSuppression(2)} disabled={envoi}>Continuer</button>
              </>
            ) : (
              <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setSuppression(1)} disabled={envoi}>Non, revenir</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onSupprimer} disabled={envoi}>Oui, supprimer définitivement</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button type="button" className="fsy-lien-bouton fsy-supprimer-lien" onClick={demanderSuppression}>Supprimer ce syndic pour cause de fermeture définitive</button>
      ))}
    </div>
  );
}

function jour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

/**
 * ══ 🔴 LE CATALOGUE — LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT, réorganisé au lot SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT
 *
 * Un BLOC à part, AU-DESSUS de « Nouveau contact », OUVERT d'office : « Catalogue (N) », une recherche sur toute la
 * largeur (vide au départ ; filtre à chaque lettre — prénom, nom, titre, téléphone, e-mail ; sans accents ni casse),
 * puis TOUTES les tuiles, par ordre alphabétique du nom puis du prénom (`trierParNom`). La liste montre 5 tuiles au
 * plus et défile EN ELLE-MÊME au-delà (`.fsy-catalogue-liste`), pas la fiche. Une tuile dépliée : coordonnées en
 * lecture seule (libellés, Copier), « Déjà rattaché à : », « Ajouter à cette copropriété » (lot
 * SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — c'était « Sélectionner pour cet immeuble » ; comportement inchangé).
 *
 * ⚠️ « NOTE » : un contact de syndic n'a pas de champ note (seul le cabinet en a une) — rien à afficher.
 */
function Catalogue({ contacts, adresses, onSelectionner, aDeplier = null }: {
  contacts: ContactForm[]; adresses: Array<{ cle: string; adresse: string }>; onSelectionner: (cle: string) => void;
  /** LOT SYNDIC-CONTACTS-ANTI-DOUBLON — « Voir dans le catalogue » : la tuile à déplier (et à faire défiler). */
  aDeplier?: { cle: string; n: number } | null;
}) {
  const [q, setQ] = useState('');
  /** Une seule tuile dépliée à la fois : en déplier une autre replie la précédente. */
  const [deplie, setDeplie] = useState<string | null>(null);
  const resultats = filtrerCatalogue(contacts, q);
  const liste = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (aDeplier === null) return;
    setQ(''); setDeplie(aDeplier.cle);
    setTimeout(() => {
      const el = liste.current?.querySelector(`[data-cle-ouverte="${aDeplier.cle}"]`) as HTMLElement | null;
      el?.scrollIntoView?.({ block: 'nearest' });
    }, 0);
  }, [aDeplier]);
  /**
   * LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE — « Annuler », ▾ et Échap REPLIENT la tuile : rien n'est rattaché, rien
   * n'est écrit, la recherche reste telle quelle. Le focus revient sur la tuile repliée (sinon il tomberait sur la page).
   */
  const replier = (cle: string): void => {
    setDeplie(null);
    setTimeout(() => (liste.current?.querySelector(`[data-cle="${cle}"]`) as HTMLElement | null)?.focus(), 0);
  };
  const libelle = (k: CoordonneeForm): string => valeurDuChoix(k.choix, k.libre);
  return (
    <section className="fsy-catalogue" aria-label="Catalogue des contacts du syndic">
      {/* LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE — « Catalogue (N) » devient « Catalogue des contacts du syndic (N) ». */}
      <p className="fsy-catalogue-titre">Catalogue des contacts du syndic <span className="fsy-discret">({contacts.length})</span></p>
      <input type="search" className="fsy-catalogue-recherche" aria-label="Rechercher dans le catalogue" value={q}
        onChange={(ev) => setQ(ev.target.value)} placeholder="Rechercher : nom, titre, téléphone, e-mail…" />
      <div className="fsy-catalogue-liste" ref={liste}>
        {resultats.length === 0 && <p className="fsy-discret fsy-sans-marge">Aucun contact</p>}
        {resultats.map((c) => (deplie === c.cle ? (
          <div key={c.cle} className="fsy-contact-ouvert fsy-tuile-catalogue" data-echap-local="" data-cle-ouverte={c.cle}
            onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.preventDefault(); replier(c.cle); } }}>
            <button type="button" className="fsy-contact-tete-btn" aria-expanded={true} onClick={() => replier(c.cle)}>
              <EnteteContact c={c} />
              <span className="fsy-fleche" aria-hidden="true">▾</span>
            </button>
            {c.coordonnees.filter((k) => k.valeur.trim() !== '').map((k) => (
              <div key={k.cle} className="fsy-contact-coord">
                <span className="fsy-coord-gauche">
                  {libelle(k) !== '' && <span className="fsy-discret">{libelle(k)} : </span>}
                  <span>{k.sorte === 'telephone' ? formaterTelephone(k.valeur) : k.valeur.trim()}</span>
                </span>
                <span className="fsy-action">
                  <BoutonCopier valeur={k.sorte === 'telephone' ? formaterTelephone(k.valeur) : k.valeur.trim()}
                    quoi={k.sorte === 'telephone' ? 'le numéro' : 'l’adresse e-mail'} />
                </span>
              </div>
            ))}
            {c.coordonnees.every((k) => k.valeur.trim() === '') && <p className="fsy-discret fsy-sans-marge">Aucun téléphone ni e-mail.</p>}
            <p className="fsy-suivis"><span className="fsy-discret">Déjà rattaché à :</span> {motImmeublesSuivis(c, adresses)}</p>
            <div className="fsy-boutons fsy-boutons--contact">
              <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => replier(c.cle)}>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => onSelectionner(c.cle)}>
                Ajouter à cette copropriété
              </button>
            </div>
          </div>
        ) : (
          <button key={c.cle} type="button" className="fsy-contact-replie fsy-tuile-catalogue" aria-expanded={false} data-cle={c.cle} onClick={() => setDeplie(c.cle)}>
            <EnteteContact c={c} />
            <span className="fsy-fleche" aria-hidden="true">▸</span>
          </button>
        )))}
      </div>
    </section>
  );
}

function SelectChoix({ libelle, choix, libre, options, onChange }: {
  libelle: string; choix: string; libre: string; options: readonly string[];
  onChange: (choix: string, libre: string) => void;
}) {
  return (
    <>
      <label className="fsy-champ">
        <span>{libelle}</span>
        <select value={choix} onChange={(e) => onChange(e.target.value, libre)}>
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value={PERSONNALISE}>{PERSONNALISE}…</option>
        </select>
      </label>
      {choix === PERSONNALISE && (
        <label className="fsy-champ">
          <span>{libelle} personnalisé</span>
          <input type="text" value={libre} onChange={(e) => onChange(choix, e.target.value)} />
        </label>
      )}
    </>
  );
}

/**
 * ══ 🔴🔴 LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — LES « AUTRES CONTACTS » ═══════════════════════════════════════════
 *
 * ARNO : « On ne peut pas ouvrir un contact replié ; le bloc “Nouveau contact” a un lien “Retirer ce contact” au lieu
 * de vrais boutons. Chaque contact a TROIS ÉTATS. »
 *
 *   ① REPLIÉ — une ligne « Prénom NOM · Titre » ; un clic n'importe où (ou sur ▸) l'OUVRE.
 *   ② OUVERT EN LECTURE — une ligne par téléphone (« Copier » à droite) et par e-mail (« Écrire depuis gestion@ »
 *      au bout) ; « Modifier », « Supprimer ce contact » (confirmé), « Fermer » ; un clic sur l'en-tête le FERME.
 *   ③ EN MODIFICATION — des champs ; « Annuler » (« Abandonner les modifications ? » si quelque chose a bougé) ;
 *      « Modifier » devient « Valider » (plein, rouge) dès qu'un champ change ; « Supprimer ce contact » reste.
 *
 * NOUVEAU CONTACT : directement EN MODIFICATION ; « Annuler » le retire sans rien créer ; « Valider » l'ajoute,
 * REPLIÉ. Le lien « Retirer ce contact » a disparu (accord d'Arno). « Valider » refuse sans prénom, nom ni titre.
 *
 * 🔴 UN SEUL CONTACT EN MODIFICATION À LA FOIS : en ouvrir un autre pendant une modification non enregistrée demande
 * « Abandonner les modifications ? ».
 *
 * ⚠️ « VALIDER » D'UN CONTACT LE REPORTE DANS LA FICHE ; c'est « Valider » du pied qui enregistre en base, comme pour
 * tout le reste de la fiche. Sans quoi « Annuler » la fenêtre ne pourrait plus défaire un contact déjà écrit.
 */
type Action = { genre: 'ouvrir' | 'modifier'; cle: string; immeuble?: boolean } | { genre: 'ajouter' } | { genre: 'ajouterImmeuble' };

/**
 * ══ 🔴 « AUTRES CONTACTS » — LOT SYNDIC-CONTACTS-PAR-COPROPRIETE, corrigé au lot SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT
 *
 * Les mêmes trois états, et « Immeubles suivis ». ARNO (correction) : le titre redevient « AUTRES CONTACTS » ;
 * ouverte DEPUIS UN BIEN, la section n'affiche QUE les contacts de la copropriété de ce bien (affectés à cet immeuble +
 * « Tous les immeubles ») ; les autres contacts du syndic passent dans le « Catalogue », en haut du formulaire
 * « Nouveau contact ». Ouverte sans bien (écran « Syndics ») : tous les contacts, comme avant.
 * Un contact créé depuis un bien suit par défaut l'immeuble de ce bien ; créé sans bien, « Tous les immeubles ».
 */
/**
 * ══ 🔴 LOT SYNDIC-MODALE-DEUX-BLOCS — LES CONTACTS EN DEUX MORCEAUX ═════════════════════════════════════════════════
 * La LISTE (« Contacts de cet immeuble » / « Contacts du cabinet ») vit dans le BLOC 1 ; l'AJOUT (« + Ajouter un
 * contact », Catalogue, Nouveau contact) dans le BLOC 2. Les deux partagent le MÊME état (contact en cours, abandon,
 * sélection) : c'est un crochet qui les rend tous deux, et non deux composants qui se contrediraient.
 */
function useContacts({ form, setForm, onEcrire, ouverts, setOuverts, edition, setEdition, cleDepart, adresses, syndicId }: {
  form: SyndicForm; setForm: (f: SyndicForm) => void; onEcrire?: (email: string) => void;
  ouverts: string[]; setOuverts: (o: string[]) => void;
  edition: EtatEdition | null; setEdition: (e: EtatEdition | null) => void;
  cleDepart: string | null; adresses: Array<{ cle: string; adresse: string }>;
  /** LOT SYNDIC-CONTACTS-ANTI-DOUBLON — pour chercher les doublons dans les AUTRES syndics. */
  syndicId: number | null;
}): { liste: React.ReactNode; bouton: React.ReactNode; ajout: React.ReactNode | null; listeImmeuble: React.ReactNode | null; ajoutImmeuble: React.ReactNode | null } {
  /** Une action demandée pendant qu'un AUTRE contact a des modifications non enregistrées. */
  const [enAttente, setEnAttente] = useState<Action | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  /** LOT COPRO-CONTACTS-IMMEUBLE — le choix ① / ② affiché à la place de « + Ajouter un contact ». */
  const [choixAjout, setChoixAjout] = useState(false);
  /**
   * ══ 🔴 LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — L'ARRIVÉE D'UN CONTACT ══════════════════════════════
   * ARNO : un contact qui vient d'entrer dans « Contacts de cette copropriété » (« Ajouter à cette copropriété » du
   * catalogue, ou « Valider » d'un nouveau contact) y apparaît sur le fond ROSE des tuiles du catalogue, puis passe
   * PROGRESSIVEMENT au gris normal en 3 s. Ce n'est qu'un ÉTAT D'ÉCRAN : il naît au geste et meurt avec la fiche —
   * il ne se rejoue donc ni à la réouverture, ni au « Valider » de la fiche (qui la ferme).
   * La classe vit 3 s (le temps du fondu CSS), puis le minuteur la retire. Moins d'animations demandées : pas de
   * fondu, le rose tient 3 s puis le retrait de la classe rend le gris d'un coup (règle @media de la feuille).
   */
  const [arrives, setArrives] = useState<string[]>([]);
  const [derniereArrivee, setDerniereArrivee] = useState<{ cle: string; n: number } | null>(null);
  const minuteurs = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { minuteurs.current.forEach(clearTimeout); }, []);
  const marquerArrivee = (cle: string): void => {
    setArrives((l) => (l.includes(cle) ? l : [...l, cle]));
    setDerniereArrivee((d) => ({ cle, n: (d?.n ?? 0) + 1 }));
    minuteurs.current.push(setTimeout(() => setArrives((l) => l.filter((x) => x !== cle)), DUREE_ARRIVEE_MS));
  };
  // La liste défile, s'il le faut, pour que la tuile arrivée soit visible AU DÉBUT du fondu.
  useEffect(() => {
    if (derniereArrivee === null || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-cle-arrivee="${derniereArrivee.cle}"]`) as HTMLElement | null;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [derniereArrivee]);
  /** LOT COPRO-CONTACTS-IMMEUBLE — le carnet de l'immeuble du bien (vide tant qu'il n'est pas lu). */
  const carnet = form.immeubleContacts?.contacts ?? [];
  const origine = (e: EtatEdition): ContactForm | null => (e.nouveau ? (e.depart ?? null)
    : ((e.immeuble === true ? carnet : form.contacts).find((c) => c.cle === e.cle) ?? null));
  const enCours = edition !== null && contactModifie(origine(edition), edition.brouillon);

  const executer = (a: Action): void => {
    setASupprimer(null);
    if (a.genre === 'ajouter') {
      const c = contactVide(suiviParDefaut(cleDepart, form.immeubles));
      setEdition({ cle: c.cle, brouillon: c, nouveau: true, depart: copieContact(c) });
      return;
    }
    if (a.genre === 'ajouterImmeuble') {
      const c = contactVide();
      setEdition({ cle: c.cle, brouillon: c, nouveau: true, depart: copieContact(c), immeuble: true });
      return;
    }
    const c = (a.immeuble === true ? carnet : form.contacts).find((x) => x.cle === a.cle);
    if (c === undefined) return;
    if (!ouverts.includes(a.cle)) setOuverts([...ouverts, a.cle]);
    setEdition(a.genre === 'modifier' ? { cle: a.cle, brouillon: copieContact(c), nouveau: false, ...(a.immeuble === true ? { immeuble: true } : {}) }
      : (edition?.cle === a.cle ? edition : null));
  };
  /** Toute action passe par ici : une modification non enregistrée d'un AUTRE contact demande confirmation. */
  const demander = (a: Action): void => {
    const autre = edition !== null && (a.genre === 'ajouter' || a.genre === 'ajouterImmeuble' || edition.cle !== a.cle);
    if (autre && enCours) { setEnAttente(a); return; }
    executer(a);
  };
  const fermer = (cle: string): void => setOuverts(ouverts.filter((x) => x !== cle));
  /**
   * LOT SYNDIC-DETACHER-DE-LA-COPROPRIETE — « Détacher de la copropriété » : seule l'affectation à l'immeuble du bien
   * est retirée (`detacher`) ; le contact quitte « Contacts de cette copropriété » et redevient sélectionnable dans le
   * Catalogue. « Valider » de la fiche enregistre (affectation historisée, jamais effacée), « Annuler » défait tout.
   */
  const detacherDeLaCopro = (cle: string): void => {
    if (cleDepart === null) return;
    const toutes = adresses.map((a) => a.cle);
    setForm({ ...form, contacts: form.contacts.map((c) => (c.cle === cle ? detacher(c, cleDepart, toutes) : c)) });
    setOuverts(ouverts.filter((x) => x !== cle));
    if (edition?.cle === cle) setEdition(null);
  };
  /** LOT SYNDIC-CONTACT-PARTI — « Oui, il ne travaille plus ici » : le contact quitte le catalogue de la saisie
   *  (et donc toutes les listes) ; enregistré au « Valider » de la fiche, défait par son « Annuler ». */
  const partir = (cle: string): void => {
    setForm(marquerParti(form, cle));
    setOuverts(ouverts.filter((x) => x !== cle));
    if (edition?.cle === cle) setEdition(null);
  };
  const supprimer = (cle: string): void => {
    setForm({ ...form, contacts: form.contacts.filter((c) => c.cle !== cle) });
    setOuverts(ouverts.filter((x) => x !== cle));
    if (edition?.cle === cle) setEdition(null);
    setASupprimer(null);
  };
  const valider = (e: EtatEdition): void => {
    setForm(appliquerBrouillon(form, e));
    if (e.nouveau && parImmeuble && (e.immeuble === true || suitImmeuble(e.brouillon, cleDepart as string))) marquerArrivee(e.cle);
    // Un contact existant revient OUVERT EN LECTURE ; un nouveau s'affiche REPLIÉ.
    if (!e.nouveau && !ouverts.includes(e.cle)) setOuverts([...ouverts, e.cle]);
    setEdition(null);
  };

  const confirmerSuppression = (c: ContactForm) => (aSupprimer === c.cle ? (
    <div className="fsy-confirmer fsy-confirmer--contact" role="group" aria-label="Confirmer la suppression du contact">
      <span>Supprimer {nomAffiche(c)} ?</span>
      <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setASupprimer(null)}>Non</button>
      <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => supprimer(c.cle)}>Oui, supprimer</button>
    </div>
  ) : null);

  const rendre = (c: ContactForm) => (edition !== null && edition.cle === c.cle ? (
    <ContactEnModification key={c.cle} e={edition} origine={c} onEcrire={onEcrire} adresses={adresses}
      onChange={(b) => setEdition({ ...edition, brouillon: b })}
      onAnnuler={() => setEdition(null)} onValider={(p) => valider(p ? { ...edition, brouillon: { ...edition.brouillon, ...p } } : edition)} verifier={verifierContact}
      onSupprimer={() => setASupprimer(c.cle)} confirmation={confirmerSuppression(c)} />
  ) : ouverts.includes(c.cle) ? (
    <ContactOuvert key={c.cle} c={c} onEcrire={onEcrire} adresses={adresses} onFermer={() => fermer(c.cle)}
      arrivee={arrives.includes(c.cle)} copropriteDuBien={parImmeuble ? cleDepart : null}
      onParti={c.id !== null ? () => partir(c.cle) : undefined}
      questionParti={departEnLignes(c, nomAvecVille(form.nom, form.ville), adresses)} ouiParti={boutonDepart(c)}
      onModifier={() => demander({ genre: 'modifier', cle: c.cle })} onSupprimer={() => setASupprimer(c.cle)}
      onDetacher={parImmeuble ? () => detacherDeLaCopro(c.cle) : undefined}
      confirmation={confirmerSuppression(c)} />
  ) : (
    <button key={c.cle} type="button" className={`fsy-contact-replie${arrives.includes(c.cle) ? ' fsy-arrivee' : ''}`} aria-expanded={false}
      data-cle-arrivee={c.cle} onClick={() => demander({ genre: 'ouvrir', cle: c.cle })}>
      <EnteteContact c={c} />
      <span className="fsy-fleche" aria-hidden="true">▸</span>
    </button>
  ));

  // Depuis un BIEN dont l'immeuble est une copropriété de la fiche : SEULS ses contacts ici ; les autres → Catalogue.
  const parImmeuble = cleDepart !== null && adresses.some((a) => a.cle === cleDepart);
  const affiches = parImmeuble ? form.contacts.filter((c) => suitImmeuble(c, cleDepart as string)) : form.contacts;
  const catalogue = parImmeuble ? trierParNom(form.contacts.filter((c) => !suitImmeuble(c, cleDepart as string))) : [];
  /** « Sélectionner pour cet immeuble » : affecté à l'immeuble du bien EN PLUS de ses affectations ; le formulaire
   *  « Nouveau contact » se referme. Enregistré par « Valider » de la fiche, annulé par son « Annuler ». */
  const selectionner = (cle: string): void => {
    if (!parImmeuble) return;
    setForm({ ...form, contacts: form.contacts.map((c) => (c.cle === cle ? affecter(c, cleDepart as string, true) : c)) });
    setEdition(null);
    marquerArrivee(cle);
  };

  const avecCatalogue = edition !== null && edition.nouveau && parImmeuble && catalogue.length > 0
    && suitSeulement(edition.depart, cleDepart as string);

  /**
   * ══ 🔴 LOT SYNDIC-CONTACTS-ANTI-DOUBLON — LA VÉRIFICATION D'UN CONTACT EN SAISIE ════════════════════════════════
   * Dans CE syndic, c'est le FORMULAIRE qui fait foi (contacts pas encore enregistrés compris) : même e-mail ou même
   * Prénom + NOM ⇒ bloquant. Dans les AUTRES syndics, le serveur répond : même e-mail ⇒ bloquant ; même nom ⇒
   * avertissement orange (le contact a pu changer de cabinet). Un doublon du même syndic encore au Catalogue offre
   * « Voir dans le catalogue » ; un doublon déjà dans « Contacts de cette copropriété » le dit.
   */
  const [aDeplier, setADeplier] = useState<{ cle: string; n: number } | null>(null);
  /**
   * ══ LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — QUI PORTE DÉJÀ CES E-MAILS / TÉLÉPHONES ══ dans LES DEUX carnets
   * (tous les syndics, tous les immeubles). Le serveur répond pour ce qui est enregistré ; pour CE syndic et CET
   * immeuble, c'est le FORMULAIRE qui fait foi (contacts pas encore enregistrés, coordonnées modifiées).
   */
  const interroger = async (b: ContactForm, avecNom: boolean): Promise<{ noms: ContactAilleurs[]; coordonnees: CoordonneeConnue[] }> => {
    const mes = emailsDe(b);
    const tels = b.coordonnees.filter((k) => k.sorte === 'telephone').map((k) => cleTelephone(k.valeur)).filter((t) => t !== '');
    if (mes.length + tels.length === 0 && (!avecNom || (b.nom.trim() === '' && b.prenom.trim() === ''))) return { noms: [], coordonnees: [] };
    try {
      const u = `/api/admin/gestion/syndics/doublons?syndic=${syndicId ?? ''}&prenom=${encodeURIComponent(avecNom ? b.prenom : '')}`
        + `&nom=${encodeURIComponent(avecNom ? b.nom : '')}&emails=${encodeURIComponent(mes.join(','))}&telephones=${encodeURIComponent(tels.join(','))}`;
      const j = (await (await fetch(u, { cache: 'no-store' })).json()) as { noms?: ContactAilleurs[]; coordonnees?: CoordonneeConnue[] };
      return { noms: j.noms ?? [], coordonnees: j.coordonnees ?? [] };
    } catch { return { noms: [], coordonnees: [] }; } // le serveur contrôle de nouveau à l'enregistrement
  };
  const adresseDuBienIci = adresses.find((a) => a.cle === cleDepart)?.adresse ?? '';
  const doublonsCoordonnees = (b: ContactForm, serveur: readonly CoordonneeConnue[]): Array<{ cleCoord: string; lignes: string[] }> => {
    const exterieures = serveur.filter((k) => !(k.proprietaire.genre === 'syndic' && syndicId !== null && k.proprietaire.syndicId === syndicId)
      && !(k.proprietaire.genre === 'immeuble' && form.immeubleContacts != null && k.proprietaire.immeubleCle === cleDepart));
    const locales = [
      ...coordonneesDuFormulaire(form.contacts, { genre: 'syndic', syndicId, syndicNom: form.nom, syndicVille: form.ville }),
      ...(cleDepart !== null ? coordonneesDuFormulaire(carnet, { genre: 'immeuble', immeubleCle: cleDepart, immeubleAdresse: adresseDuBienIci }) : []),
    ];
    return avertissementsCoordonnees(b, [...exterieures, ...locales], parImmeuble ? cleDepart : null);
  };
  const verifierContact = async (b: ContactForm): Promise<VerifDoublon> => {
    const loc = doublonsLocaux(b, form.contacts.filter((x) => x.cle !== b.cle));
    const syndicAffiche = nomAvecVille(form.nom, form.ville);
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL Y AVAIT : « Ce contact existe déjà : … » (+ « — déjà
    // rattaché à cette copropriété »). Le nom en double reste BLOQUANT ; le texte dit précisément où.
    const dire = (d: ContactForm): DoublonTrouve => ({
      message: `Un contact nommé ${prenomNom(d.prenom, d.nom)} existe déjà chez ${syndicAffiche}.`,
      voirCle: parImmeuble && avecCatalogue && !suitImmeuble(d, cleDepart as string) ? d.cle : undefined,
      emails: emailsDe(d),
    });
    const ailleurs = await interroger(b, true);
    const autreNom = ailleurs.noms[0];
    return {
      email: null,
      nom: loc.nom !== null ? dire(loc.nom) : null,
      avertissement: loc.nom === null && autreNom !== undefined
        ? `Un contact du même nom existe chez ${nomAvecVille(autreNom.syndicNom, autreNom.syndicVille)}` : null,
      coordonnees: doublonsCoordonnees(b, ailleurs.coordonnees),
    };
  };
  const voir = (cle: string): void => setADeplier({ cle, n: (aDeplier?.n ?? 0) + 1 });

  const liste = (
    <>
      {enAttente !== null && edition !== null && (
        <div className="fsy-alerte fsy-confirmer" role="group" aria-label="Abandonner les modifications du contact ?">
          <span>Abandonner les modifications ({nomAffiche(edition.brouillon)}) ?</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setEnAttente(null)}>Non</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => {
            const a = enAttente; setEnAttente(null); setEdition(null); executer(a);
          }}>Oui, abandonner</button>
        </div>
      )}
      {affiches.length === 0 && (
        <p className="fsy-discret">{parImmeuble ? 'Aucun contact pour cet immeuble.' : 'Aucun contact.'}</p>
      )}
      {affiches.map(rendre)}
      {/* LOT SYNDIC-CONTACT-PARTI — écran « Syndics » : les anciens contacts, repliés, en bas de la liste (N = 0 : rien). */}
      {!parImmeuble && (form.anciens ?? []).length > 0 && (
        <AnciensContacts anciens={form.anciens ?? []} onReintegrer={(id) => setForm(reintegrer(form, id))} />
      )}
    </>
  );
  /**
   * LE CONTENU DU BLOC D'AJOUT (lot SYNDIC-BLOC-AJOUT-CONTACT) — `null` hors ajout : le bloc n'existe pas alors.
   * ① « Catalogue des contacts du syndic (N) », en sous-cadre, s'il a quelque chose à proposer ;
   * ② « Nouveau contact », en sous-cadre : la création complète, inchangée (lot SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT :
   *    depuis un bien, rattaché QU'À l'immeuble du bien, « Sera rattaché à : … » à la place des cases).
   */
  const ajout = edition !== null && edition.nouveau && edition.immeuble !== true ? (
    <>
      {avecCatalogue && (
        <div className="fsy-sous-cadre">
          <Catalogue contacts={catalogue} adresses={adresses} onSelectionner={selectionner} aDeplier={aDeplier} />
        </div>
      )}
      <div className="fsy-sous-cadre">
        <ContactEnModification e={edition} origine={edition.depart ?? null} onEcrire={onEcrire} adresses={adresses}
          onChange={(b) => setEdition({ ...edition, brouillon: b })}
          onAnnuler={() => setEdition(null)} onValider={(p) => valider(p ? { ...edition, brouillon: { ...edition.brouillon, ...p } } : edition)}
          verifier={verifierContact} onVoir={voir}
          rattacheA={parImmeuble ? adresses.filter((a) => edition.brouillon.immeubles.includes(a.cle)).map((a) => a.adresse).join(' · ') : undefined} />
      </div>
    </>
  ) : null;
  /* 🔴 LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — UN SEUL CONTACT EN CRÉATION À LA FOIS (accord d'Arno pour ce
     masquage) : tant que le bloc d'ajout est ouvert, pas de « + Ajouter un contact ». Il revient dès que le bloc se
     ferme : × Fermer, Annuler, Valider, ou « Ajouter à cette copropriété ».
     LOT SYNDIC-BLOC-AJOUT-CONTACT : le bouton est DÉPLACÉ en bas du bloc 1, sous la liste des contacts. */
  /*
   * ══ 🔴 LOT COPRO-CONTACTS-IMMEUBLE — LE CHOIX PRÉALABLE (fiche ouverte DEPUIS UN BIEN) ══════════════════════════
   * « + Ajouter un contact » laisse place à deux gros boutons : ① « Contact du syndic de copropriété » — EXACTEMENT
   * l'ajout d'aujourd'hui ; ② « Habitant / gardien de l'immeuble » — le carnet de l'immeuble. « Annuler » remet le
   * bouton. Depuis l'écran « Syndics » : pas de choix, comportement inchangé.
   */
  const bouton = edition?.nouveau !== true ? (
    /* LOT SYNDIC-BOUTON-AJOUT-CENTRE — centré sur sa ligne ; taille, style et comportement inchangés. */
    parImmeuble && choixAjout ? (
      <div className="fsy-choix-ajout" role="group" aria-label="Quel contact ajouter ?">
        <div className="fsy-choix-ajout-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-choix" onClick={() => { setChoixAjout(false); demander({ genre: 'ajouter' }); }}>
            Contact du syndic de copropriété
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-choix" disabled={form.immeubleContacts == null}
            title={form.immeubleContacts == null ? 'Les contacts de l’immeuble n’ont pas pu être lus' : undefined}
            onClick={() => { setChoixAjout(false); demander({ genre: 'ajouterImmeuble' }); }}>
            Habitant / gardien de l’immeuble
          </button>
        </div>
        <button type="button" className="fsy-lien-bouton fsy-choix-annuler" onClick={() => setChoixAjout(false)}>Annuler</button>
      </div>
    ) : (
      <div className="fsy-ajout-centre">
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-ajout"
          onClick={() => (parImmeuble ? setChoixAjout(true) : demander({ genre: 'ajouter' }))}>
          + Ajouter un contact
        </button>
      </div>
    )
  ) : null;

  /*
   * ══ LOT COPRO-CONTACTS-IMMEUBLE — « HABITANTS ET GARDIEN DE L'IMMEUBLE » ══ une liste séparée, sous les contacts de
   * la copropriété, visible seulement si elle a au moins un contact. Mêmes tuiles, mêmes trois états ; dans la tuile
   * dépliée : « Retirer de l'immeuble » (et ni « Détacher », ni « Ne travaille plus ici » : actions du syndic).
   */
  const retirerDeLImmeuble = (cle: string): void => {
    if (!form.immeubleContacts) return;
    setForm({ ...form, immeubleContacts: { ...form.immeubleContacts, contacts: carnet.filter((c) => c.cle !== cle) } });
    setOuverts(ouverts.filter((x) => x !== cle));
    if (edition?.cle === cle) setEdition(null);
  };
  /** L'anti-doublon de l'immeuble : même NOM + prénom DANS CET IMMEUBLE seulement (bloquant) ; e-mails et téléphones
   *  déjà utilisés, dans les deux carnets : avertissement (LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT). */
  const verifierImmeuble = async (b: ContactForm): Promise<VerifDoublon> => {
    const loc = doublonsLocaux(b, carnet.filter((x) => x.cle !== b.cle));
    const ailleurs = await interroger(b, false);
    return {
      email: null, avertissement: null,
      nom: loc.nom !== null ? { message: `Un contact nommé ${prenomNom(loc.nom.prenom, loc.nom.nom)} existe déjà dans l’immeuble ${adresseDuBienIci}.`, emails: [] } : null,
      coordonnees: doublonsCoordonnees(b, ailleurs.coordonnees),
    };
  };
  const adresseImmeubleDuBien = adresses.find((a) => a.cle === cleDepart)?.adresse ?? '';
  const rendreImmeuble = (c: ContactForm) => (edition !== null && edition.cle === c.cle ? (
    <ContactEnModification key={c.cle} e={edition} origine={c} onEcrire={onEcrire} adresses={adresses}
      onChange={(b) => setEdition({ ...edition, brouillon: b })} immeuble={adresseImmeubleDuBien}
      onAnnuler={() => setEdition(null)} onValider={(p) => valider(p ? { ...edition, brouillon: { ...edition.brouillon, ...p } } : edition)} verifier={verifierImmeuble} />
  ) : ouverts.includes(c.cle) ? (
    <ContactOuvert key={c.cle} c={c} onEcrire={onEcrire} adresses={adresses} onFermer={() => fermer(c.cle)}
      arrivee={arrives.includes(c.cle)} onRetirerImmeuble={() => retirerDeLImmeuble(c.cle)}
      onModifier={() => demander({ genre: 'modifier', cle: c.cle, immeuble: true })} onSupprimer={() => undefined}
      confirmation={null} />
  ) : (
    <button key={c.cle} type="button" className={`fsy-contact-replie fsy-contact-immeuble${arrives.includes(c.cle) ? ' fsy-arrivee' : ''}`}
      aria-expanded={false} data-cle-arrivee={c.cle} onClick={() => demander({ genre: 'ouvrir', cle: c.cle, immeuble: true })}>
      <EnteteContact c={c} />
      <span className="fsy-fleche" aria-hidden="true">▸</span>
    </button>
  ));
  const listeImmeuble = parImmeuble && carnet.length > 0 ? (
    <>
      <h4 className="fsy-sous-titre fsy-sous-titre--immeuble">Habitants et gardien de l’immeuble</h4>
      {carnet.map(rendreImmeuble)}
    </>
  ) : null;
  const ajoutImmeuble = edition !== null && edition.nouveau && edition.immeuble === true ? (
    <div className="fsy-sous-cadre">
      <ContactEnModification e={edition} origine={edition.depart ?? null} onEcrire={onEcrire} adresses={adresses}
        onChange={(b) => setEdition({ ...edition, brouillon: b })} immeuble={adresseImmeubleDuBien}
        onAnnuler={() => setEdition(null)} onValider={(p) => valider(p ? { ...edition, brouillon: { ...edition.brouillon, ...p } } : edition)} verifier={verifierImmeuble} />
    </div>
  ) : null;
  return { liste, bouton, ajout, listeImmeuble, ajoutImmeuble };
}

/** LOT SYNDIC-CONTACTS-ANTI-DOUBLON — un doublon trouvé, et ce que l'écran en dit. */
interface DoublonTrouve { message: string; voirCle?: string; emails: string[] }
interface VerifDoublon {
  email: DoublonTrouve | null; nom: DoublonTrouve | null; avertissement: string | null;
  /** LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — chaque e-mail / téléphone DÉJÀ UTILISÉ : les lignes de l'avertissement
   *  (orange, NON bloquant), rattachées à la coordonnée (clé d'écran). */
  coordonnees?: Array<{ cleCoord: string; lignes: string[] }>;
}

/** Ce contact (nouveau) ne suit-il QUE cet immeuble ? C'est le cas d'un ajout depuis le bien — et non depuis une
 *  autre copropriété, où le Catalogue du bien n'aurait rien à faire. */
function suitSeulement(c: ContactForm | undefined, cle: string): boolean {
  return c !== undefined && !c.tousImmeubles && c.immeubles.length === 1 && c.immeubles[0] === cle;
}

/**
 * LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — « IMMEUBLES SUIVIS (N) » EN MODIFICATION D'UN CONTACT.
 * Les lignes : les copropriétés que le contact suivait en ouvrant la modification (et celles cochées depuis), et
 * elles seules — une décochée RESTE affichée, pour pouvoir la recocher. N = celles cochées à l'instant. Aucune ligne ⇒
 * « Aucun immeuble suivi », non dépliable. Repliée par défaut.
 */
function ImmeublesSuivisEdit({ c, origine, adresses, onChange }: {
  c: ContactForm; origine: ContactForm | null; adresses: Array<{ cle: string; adresse: string }>; onChange: (c: ContactForm) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const lignes = trierParVoie(adresses.filter((a) => c.immeubles.includes(a.cle) || (origine?.immeubles ?? []).includes(a.cle)));
  if (lignes.length === 0) return <p className="fsy-suivis fsy-discret">Aucun immeuble suivi</p>;
  const n = lignes.filter((a) => c.immeubles.includes(a.cle)).length;
  return (
    <div className="fsy-suivis-repli fsy-suivis-edit-repli">
      <button type="button" className="fsy-suivis-tete" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <span>Immeubles suivis ({n})</span>
        <span className="fsy-fleche" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
      </button>
      {ouvert && (
        <div className="fsy-suivis-liste" role="group" aria-label="Immeubles suivis">
          {lignes.map((a) => (
            <label key={a.cle} className="fsy-case">
              <input type="checkbox" checked={c.immeubles.includes(a.cle)}
                onChange={(ev) => onChange(affecter(c, a.cle, ev.target.checked))} />
              <span>{a.adresse}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * LOT SYNDIC-CONTACT-PARTI — « ANCIENS CONTACTS (N) » (écran « Syndics »), replié par défaut. Déplié : nom, titre et
 * « parti le … », en lecture seule, et « Réintégrer au catalogue » (sans copropriété ; enregistré au Valider).
 */
function AnciensContacts({ anciens, onReintegrer }: { anciens: AncienContact[]; onReintegrer: (id: number) => void }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="fsy-suivis-repli fsy-anciens">
      <button type="button" className="fsy-suivis-tete" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <span>Anciens contacts ({anciens.length})</span>
        <span className="fsy-fleche" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
      </button>
      {ouvert && (
        <ul className="fsy-suivis-liste">
          {anciens.map((a) => (
            <li key={a.id} className="fsy-ancien">
              <span>
                <strong>{prenomNomCivil(a.civilite, a.prenom, a.nom) || (a.titre ?? '').trim() || 'Contact'}</strong>
                {(a.titre ?? '').trim() !== '' && prenomNom(a.prenom, a.nom) !== '' && <span className="fsy-discret"> · {(a.titre ?? '').trim()}</span>}
                <span className="fsy-discret"> · parti le {jour(a.partiLe)}</span>
              </span>
              <button type="button" className="fsy-lien-bouton fsy-action" onClick={() => onReintegrer(a.id)}>Réintégrer au catalogue</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — durée du fondu rose → gris d'un contact arrivé. */
const DUREE_ARRIVEE_MS = 3000;

/**
 * LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — LES COPROPRIÉTÉS SUIVIES, REPLIÉES (tuile dépliée en lecture).
 * Depuis un bien : « Autres copropriétés du portefeuille suivies (N) », SANS celle du bien ouvert ; depuis l'écran
 * Syndics : « Copropriétés suivies (N) ». Repliée par défaut ; dépliée : une copropriété par ligne, par nom de voie.
 * N = 0 : une phrase, non dépliable.
 */
function CoprosSuivies({ c, adresses, copropriteDuBien }: {
  c: ContactForm; adresses: Array<{ cle: string; adresse: string }>; copropriteDuBien: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const l = trierParVoie(adresses.filter((a) => c.immeubles.includes(a.cle) && a.cle !== copropriteDuBien));
  if (l.length === 0) {
    return <p className="fsy-suivis fsy-discret">{copropriteDuBien !== null ? 'Aucune autre copropriété suivie' : 'Aucune copropriété suivie'}</p>;
  }
  const mot = copropriteDuBien !== null ? 'Autres copropriétés du portefeuille suivies' : 'Copropriétés suivies';
  return (
    <div className="fsy-suivis-repli">
      <button type="button" className="fsy-suivis-tete" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <span>{mot} ({l.length})</span>
        <span className="fsy-fleche" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
      </button>
      {ouvert && (
        <ul className="fsy-suivis-liste">
          {l.map((a) => <li key={a.cle}>{a.adresse}</li>)}
        </ul>
      )}
    </div>
  );
}

/** « Tous les immeubles », ou la liste des copropriétés suivies (adresse complète). */
function motImmeublesSuivis(c: ContactForm, adresses: Array<{ cle: string; adresse: string }>): string {
  const l = adresses.filter((a) => c.immeubles.includes(a.cle)).map((a) => a.adresse);
  return l.length === 0 ? 'aucun immeuble' : l.join(' · ');
}

/**
 * « Prénom NOM » en gras, À GAUCHE ; le TITRE en gris, À DROITE, juste avant la flèche (lot
 * FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS). Sans nom, le titre seul, en gras, à gauche.
 */
function EnteteContact({ c }: { c: ContactForm }) {
  // LOT SYNDIC-CONTACT-CIVILITE — « M. Mathis BERCIER » quand la civilité est renseignée, sinon comme avant.
  const nom = prenomNomCivil(c.civilite, c.prenom, c.nom);
  const titre = valeurDuChoix(c.titreChoix, c.titreLibre);
  return (
    <span className="fsy-contact-ligne">
      <strong className="fsy-contact-nom">{nom !== '' ? nom : titre}</strong>
      {nom !== '' && titre !== '' && <span className="fsy-contact-titre">{titre}</span>}
    </span>
  );
}

/** ② OUVERT EN LECTURE — aucune saisie ; une ligne par téléphone et par e-mail, l'action au bout. */
function ContactOuvert({ c, onEcrire, onFermer, onModifier, onSupprimer, confirmation, adresses, onDetacher, arrivee = false, copropriteDuBien = null,
  onParti, questionParti = { question: '', annonce: '', coproprietes: [] }, ouiParti = '', onRetirerImmeuble }: {
  /** LOT COPRO-CONTACTS-IMMEUBLE — un contact de l'IMMEUBLE : « Retirer de l'immeuble » remplace les actions du syndic. */
  onRetirerImmeuble?: () => void;
  /** LOT SYNDIC-CONTACT-PARTI — « Ne travaille plus ici » (absent pour un contact jamais enregistré), sa question et
   *  son bouton de confirmation. */
  onParti?: () => void; questionParti?: { question: string; annonce: string; coproprietes: string[] }; ouiParti?: string;
  c: ContactForm; onEcrire?: (email: string) => void; onFermer: () => void; onModifier: () => void; onSupprimer: () => void;
  confirmation: React.ReactNode; adresses: Array<{ cle: string; adresse: string }>;
  /** LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — vient d'arriver dans la liste : fond rose qui s'efface. */
  arrivee?: boolean;
  /** Fiche ouverte DEPUIS UN BIEN de cette copropriété : elle est retirée de « Autres copropriétés … suivies ». */
  copropriteDuBien?: string | null;
  /** Fiche ouverte DEPUIS UN BIEN : « Détacher de la copropriété » remplace « Supprimer ce contact » (accord d'Arno). */
  onDetacher?: () => void;
}) {
  const libelle = (k: CoordonneeForm): string => valeurDuChoix(k.choix, k.libre);
  const tels = c.coordonnees.filter((k) => k.sorte === 'telephone' && k.valeur.trim() !== '');
  const emails = c.coordonnees.filter((k) => k.sorte === 'email' && k.valeur.trim() !== '');
  const [depart, setDepart] = useState(false);
  const [retrait, setRetrait] = useState(false);
  if (onRetirerImmeuble) {
    const qui = prenomNom(c.prenom, c.nom) || valeurDuChoix(c.titreChoix, c.titreLibre) || 'ce contact';
    return (
      <div className={`fsy-contact-ouvert fsy-contact-immeuble${arrivee ? ' fsy-arrivee' : ''}`} data-cle-arrivee={c.cle}>
        <button type="button" className="fsy-contact-tete-btn" aria-expanded={true} onClick={onFermer} title="Fermer">
          <EnteteContact c={c} />
          <span className="fsy-fleche" aria-hidden="true">▾</span>
        </button>
        {tels.length === 0 && emails.length === 0 && <p className="fsy-discret fsy-sans-marge">Aucun téléphone ni e-mail.</p>}
        {tels.map((k) => (
          <div key={k.cle} className="fsy-contact-coord">
            <span className="fsy-coord-gauche">
              {libelle(k) !== '' && <span className="fsy-discret">{libelle(k)} : </span>}
              {telephoneComplet(k.valeur) ? <a href={lienTelephone(k.valeur)}>{formaterTelephone(k.valeur)}</a> : <span>{formaterTelephone(k.valeur)}</span>}
            </span>
            <ActionCopier tel={k.valeur} />
          </div>
        ))}
        {emails.map((k) => (
          <div key={k.cle} className="fsy-contact-coord">
            <span className="fsy-coord-gauche">
              {libelle(k) !== '' && <span className="fsy-discret">{libelle(k)} : </span>}
              <span>{k.valeur.trim()}</span>
            </span>
            <ActionEcrire email={k.valeur} onEcrire={onEcrire} />
          </div>
        ))}
        {(c.note ?? '').trim() !== '' && <p className="fsy-suivis fsy-note-contact"><span className="fsy-discret">Note :</span> {(c.note ?? '').trim()}</p>}
        {retrait ? (
          <div className="fsy-confirmer fsy-confirmer--contact" role="group" aria-label="Confirmer le retrait de l’immeuble">
            <span>Retirer {qui} de l’immeuble ?</span>
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setRetrait(false)}>Non</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => { setRetrait(false); onRetirerImmeuble(); }}>Oui</button>
          </div>
        ) : (
          <div className="fsy-boutons fsy-boutons--contact">
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-detacher fsy-pousse-gauche" onClick={() => setRetrait(true)}>
              Retirer de l’immeuble
            </button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onFermer}>Fermer</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onModifier}>Modifier</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`fsy-contact-ouvert${arrivee ? ' fsy-arrivee' : ''}`} data-cle-arrivee={c.cle}>
      <button type="button" className="fsy-contact-tete-btn" aria-expanded={true} onClick={onFermer} title="Fermer">
        <EnteteContact c={c} />
        <span className="fsy-fleche" aria-hidden="true">▾</span>
      </button>
      {tels.length === 0 && emails.length === 0 && <p className="fsy-discret fsy-sans-marge">Aucun téléphone ni e-mail.</p>}
      {tels.map((k) => (
        <div key={k.cle} className="fsy-contact-coord">
          <span className="fsy-coord-gauche">
            {libelle(k) !== '' && <span className="fsy-discret">{libelle(k)} : </span>}
            {telephoneComplet(k.valeur) ? <a href={lienTelephone(k.valeur)}>{formaterTelephone(k.valeur)}</a> : <span>{formaterTelephone(k.valeur)}</span>}
          </span>
          <ActionCopier tel={k.valeur} />
        </div>
      ))}
      {emails.map((k) => (
        <div key={k.cle} className="fsy-contact-coord">
          <span className="fsy-coord-gauche">
            {libelle(k) !== '' && <span className="fsy-discret">{libelle(k)} : </span>}
            <span>{k.valeur.trim()}</span>
          </span>
          <ActionEcrire email={k.valeur} onEcrire={onEcrire} />
        </div>
      ))}
      {/* LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES (accord d'Arno pour ce repli) — CE QU'IL Y AVAIT : la
          ligne « Immeubles suivis : A · B · C ». Elle devient une petite ligne REPLIÉE, une copropriété par ligne une
          fois dépliée. */}
      <CoprosSuivies c={c} adresses={adresses} copropriteDuBien={copropriteDuBien} />
      {confirmation ?? (depart && onParti ? (
        /* LOT SYNDIC-CONTACT-PARTI — la confirmation, DANS la tuile. */
        <div className="fsy-parti-confirmer" role="group" aria-label="Confirmer le départ du contact">
          {/* LOT SYNDIC-CONFIRMATION-DEPART-UNE-COPRO-PAR-LIGNE — la question, l'annonce, puis UNE copropriété par ligne. */}
          <p className="fsy-parti-question">{questionParti.question}</p>
          <p className="fsy-parti-annonce">{questionParti.annonce}</p>
          {questionParti.coproprietes.length > 0 && (
            <ul className="fsy-parti-copros">{questionParti.coproprietes.map((a) => <li key={a}>{a}</li>)}</ul>
          )}
          <div className="fsy-confirmer fsy-confirmer--contact">
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setDepart(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => { setDepart(false); onParti(); }}>{ouiParti}</button>
          </div>
        </div>
      ) : (
        <div className="fsy-boutons fsy-boutons--contact">
          {/* LOT SYNDIC-DETACHER-DE-LA-COPROPRIETE — depuis un bien, un BOUTON « Détacher de la copropriété », même place,
              même gabarit que « Fermer » / « Modifier », texte rouge de la marque. Depuis l'écran « Syndics », la
              suppression d'un contact du cabinet reste « Supprimer ce contact », inchangée. */}
          {onDetacher ? (
            <button type="button" className={`svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-detacher${onParti ? '' : ' fsy-pousse-gauche'}`} onClick={onDetacher}>
              Détacher de la copropriété
            </button>
          ) : (
            <button type="button" className={`fsy-lien-bouton${onParti ? '' : ' fsy-pousse-gauche'}`} onClick={onSupprimer}>Supprimer ce contact</button>
          )}
          {/* LOT SYNDIC-CONTACT-PARTI — « Ne travaille plus ici » : petit bouton blanc, texte gris foncé, À CÔTÉ. */}
          {onParti && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-parti fsy-pousse-gauche" onClick={() => setDepart(true)}>
              Ne travaille plus ici
            </button>
          )}
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onFermer}>Fermer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onModifier}>Modifier</button>
        </div>
      ))}
    </div>
  );
}

/** ③ EN MODIFICATION — des champs ; « Modifier » devient « Valider » dès qu'un champ change. */
function ContactEnModification({ e, origine, onChange, onAnnuler, onValider, onSupprimer, confirmation, onEcrire, adresses,
  rattacheA, verifier, onVoir, immeuble }: {
  /** LOT COPRO-CONTACTS-IMMEUBLE — un contact de l'IMMEUBLE (l'adresse de la copropriété) : catégorie en pilules,
   *  note, « Sera rattaché à : … » ; ni titre, ni « Immeubles suivis ». */
  immeuble?: string;
  e: EtatEdition; origine: ContactForm | null; onChange: (c: ContactForm) => void;
  onAnnuler: () => void; onSupprimer?: () => void; confirmation?: React.ReactNode;
  /** Valide le brouillon ; `patch` s'y applique d'abord (LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT : doublons confirmés). */
  onValider: (patch?: Partial<ContactForm>) => void;
  onEcrire?: (email: string) => void; adresses: Array<{ cle: string; adresse: string }>;
  /** LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — création DEPUIS UN BIEN : l'immeuble imposé, dit en lecture à la
   *  place des cases « Immeubles suivis ». Absent ⇒ les cases, comme avant. */
  rattacheA?: string;
  /** LOT SYNDIC-CONTACTS-ANTI-DOUBLON — la vérification (en quittant Prénom, Nom ou un E-mail, et au Valider). */
  verifier?: (c: ContactForm) => Promise<VerifDoublon>;
  /** « Voir dans le catalogue » : déplie la tuile du doublon dans le Catalogue. */
  onVoir?: (cle: string) => void;
}) {
  const c = e.brouillon;
  const [verif, setVerif] = useState<VerifDoublon | null>(null);
  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — seul un NOM en double bloque encore « Valider » (plus un e-mail).
  const bloque = verif !== null && verif.nom !== null;
  const lancer = async (cc: ContactForm): Promise<VerifDoublon | null> => {
    if (!verifier) return null;
    const v = await verifier(cc);
    setVerif(v);
    return v;
  };
  const Doublon = ({ d }: { d: DoublonTrouve }) => (
    <p className="fsy-doublon" role="alert">
      {d.message}
      {d.voirCle !== undefined && onVoir && (
        <> · <button type="button" className="fsy-lien-bouton" onClick={() => onVoir(d.voirCle as string)}>Voir dans le catalogue</button></>
      )}
    </p>
  );
  /** Les champs RETOUCHÉS : seuls ceux-là reçoivent la casse en quittant le champ (un nom existant qu'on ne fait que
   *  traverser au clavier n'est pas réécrit). */
  const touches = useRef(new Set<'prenom' | 'nom'>());
  const [refus, setRefus] = useState<string | null>(null);
  const [abandon, setAbandon] = useState(false);
  const change = contactModifie(origine, c);
  const majCoord = (cle: string, k: CoordonneeForm): void =>
    onChange({ ...c, coordonnees: c.coordonnees.map((x) => (x.cle === cle ? k : x)) });
  const ajouter = (sorte: SorteCoordonnee): void => onChange({ ...c, coordonnees: [...c.coordonnees, coordonneeVide(sorte)] });
  /**
   * ══ LOT SYNDIC-CONTACT-ALERTE-COORDONNEES-MANQUANTES ══ au « Valider » du contact, APRÈS l'anti-doublon : sans
   * téléphone et/ou sans e-mail RÉELLEMENT remplis, un avertissement orange (jamais bloquant) — « Compléter » met le
   * curseur dans le champ manquant (en ouvrant sa ligne s'il n'y en a pas), « Valider quand même » valide.
   */
  /**
   * L'encadré orange du « Valider » : les lignes (doublons de coordonnées, puis manque), et la coordonnée à « Corriger »
   * (LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT) — sans doublon, « Compléter » comme avant.
   */
  const [alerte, setAlerte] = useState<{ lignes: string[]; corriger: string | null; doublons: boolean } | null>(null);
  const [aCompleter, setACompleter] = useState<SorteCoordonnee | null>(null);
  const bloc = useRef<HTMLFieldSetElement | null>(null);
  useEffect(() => {
    if (aCompleter === null) return;
    const vides = [...(bloc.current?.querySelectorAll<HTMLInputElement>(
      `input[aria-label="${aCompleter === 'email' ? 'E-mail du contact' : 'Téléphone du contact'}"]`) ?? [])]
      .filter((i) => i.value.trim() === '');
    if (vides.length > 0) { vides[0].focus(); setACompleter(null); }
  }, [aCompleter, c.coordonnees]);
  /** « Corriger » : le curseur dans le champ de la coordonnée en double. */
  const corriger = (cleCoord: string): void => {
    setAlerte(null);
    bloc.current?.querySelector<HTMLInputElement>(`[data-cle-coord="${cleCoord}"] input[aria-label$="du contact"]`)?.focus();
  };
  const completer = (): void => {
    const m = coordonneesManquantes(c);
    const sorte: SorteCoordonnee = m.telephone ? 'telephone' : 'email';
    setAlerte(null);
    const vide = c.coordonnees.some((k) => k.sorte === sorte && k.valeur.trim() === '');
    if (!vide) ajouter(sorte);
    setACompleter(sorte);
  };
  const valider = async (malgreManque = false): Promise<void> => {
    const refusImmeuble = immeuble !== undefined ? refusContactImmeuble(c) : null;
    if (refusImmeuble !== null) { setRefus(refusImmeuble); return; }
    if (!contactNomme({ titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom })) {
      setRefus('Indiquez au moins un prénom, un nom ou un titre.'); return;
    }
    setRefus(null);
    // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — vérifié de nouveau au Valider : un NOM en double arrête ici (et les
    // avertissements n'apparaissent pas).
    const v = await lancer(c);
    if (v !== null && v.nom !== null) { setAlerte(null); return; }
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — un e-mail / téléphone déjà utilisé : un AVERTISSEMENT, regroupé
    // avec celui des coordonnées manquantes ; « Valider quand même » confirme (le serveur en exige la preuve).
    const doublons = v?.coordonnees ?? [];
    if (malgreManque) { setAlerte(null); onValider(doublons.length > 0 || alerte?.doublons === true ? { doublonsConfirmes: true } : undefined); return; }
    const manque = alerteCoordonnees(c);
    if (doublons.length > 0) {
      const m = phraseManque(c);
      setAlerte({ lignes: [...doublons.flatMap((d) => d.lignes), ...(m !== null ? [m] : []), 'Valider quand même ?'], corriger: doublons[0].cleCoord, doublons: true });
      return;
    }
    if (manque !== null) { setAlerte({ lignes: [manque], corriger: null, doublons: false }); return; }
    setAlerte(null);
    onValider();
  };
  const annuler = (): void => { if (change) { setAbandon(true); return; } onAnnuler(); };
  return (
    <fieldset className="fsy-contact-edit" ref={bloc}>
      <legend>{e.nouveau ? (immeuble !== undefined ? 'Nouveau contact de l’immeuble' : 'Nouveau contact') : nomAffiche(origine ?? c)}</legend>
      {immeuble !== undefined ? (
        /* LOT COPRO-CONTACTS-IMMEUBLE — la CATÉGORIE : trois pilules ; « Personnalisé » ouvre un libellé libre obligatoire. */
        <div className="fsy-duo">
          <div className="fsy-champ fsy-champ--civilite" role="group" aria-label="Catégorie">
            <style>{CSS_BOUTON_PILULE}</style>
            <span>Catégorie *</span>
            <span className="fsy-civilites">
              {CATEGORIES_IMMEUBLE.map((v) => (
                <BoutonPilule key={v} mot={v} actif={c.titreChoix === v}
                  onClick={() => onChange({ ...c, titreChoix: v, titreLibre: v === PERSONNALISE ? c.titreLibre : '' })} />
              ))}
            </span>
          </div>
          {c.titreChoix === PERSONNALISE && (
            <label className="fsy-champ"><span>Libellé personnalisé *</span>
              <input type="text" value={c.titreLibre} placeholder="Habitant, Femme de ménage…"
                onChange={(ev) => onChange({ ...c, titreLibre: ev.target.value })} /></label>
          )}
        </div>
      ) : (
      <div className="fsy-duo">
        <SelectChoix libelle="Titre" choix={c.titreChoix} libre={c.titreLibre} options={TITRES_CONTACT}
          onChange={(choix, libre) => onChange({ ...c, titreChoix: choix, titreLibre: libre })} />
      </div>
      )}
      <div className="fsy-duo fsy-duo--civilite">
        {/* LOT SYNDIC-CONTACT-CIVILITE — à GAUCHE de Prénom et Nom, sur leur ligne : deux bascules « M. » / « Mme ».
            Un clic choisit, un clic sur l'actif revient à vide. Jamais obligatoire. Les pilules de l'app (actif rouge). */}
        <div className="fsy-champ fsy-champ--civilite" role="group" aria-label="Civilité">
          <style>{CSS_BOUTON_PILULE}</style>
          <span>Civilité</span>
          <span className="fsy-civilites">
            {CIVILITES.map((v) => (
              <BoutonPilule key={v} mot={v} actif={c.civilite === v}
                onClick={() => onChange({ ...c, civilite: c.civilite === v ? null : v })} />
            ))}
          </span>
        </div>
        {/* 🔴 LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — la casse se met EN QUITTANT le champ, jamais pendant la
            frappe : « jean-pierre » → « Jean-Pierre », « lefèvre » → « LEFÈVRE ». Rien n'est réécrit en base hors d'une
            modification : un contact existant garde sa casse tant qu'on ne touche pas à son champ. */}
        <label className="fsy-champ"><span>Prénom</span>
          <input type="text" value={c.prenom} onChange={(ev) => { touches.current.add('prenom'); onChange({ ...c, prenom: ev.target.value }); }}
            onBlur={() => {
              const v = casserPrenom(c.prenom);
              const cc = touches.current.has('prenom') && v !== c.prenom ? { ...c, prenom: v } : c;
              if (cc !== c) onChange(cc);
              void lancer(cc);
            }} /></label>
        <label className="fsy-champ"><span>Nom</span>
          <input type="text" value={c.nom} onChange={(ev) => { touches.current.add('nom'); onChange({ ...c, nom: ev.target.value }); }}
            onBlur={() => {
              const v = casserNom(c.nom);
              const cc = touches.current.has('nom') && v !== c.nom ? { ...c, nom: v } : c;
              if (cc !== c) onChange(cc);
              void lancer(cc);
            }} /></label>
      </div>
      {/* LOT SYNDIC-CONTACTS-ANTI-DOUBLON — sous le nom : le doublon bloquant (rouge) ou l'avertissement (orange). */}
      {verif?.nom && <Doublon d={verif.nom} />}
      {verif?.avertissement && <p className="fsy-alerte fsy-avertissement">{verif.avertissement}</p>}
      {c.coordonnees.map((k) => (
        <div key={k.cle} className="fsy-duo fsy-coord-edit" data-cle-coord={k.cle}>
          <SelectChoix libelle="Libellé" choix={k.choix} libre={k.libre} options={libellesDe(k.sorte)}
            onChange={(choix, libre) => majCoord(k.cle, { ...k, choix, libre })} />
          <div className="fsy-champ fsy-champ--large">
            <span>{k.sorte === 'email' ? 'E-mail' : 'Téléphone'}</span>
            <span className="fsy-ligne-champ">
              <input type={k.sorte === 'email' ? 'email' : 'tel'} value={k.valeur}
                aria-label={k.sorte === 'email' ? 'E-mail du contact' : 'Téléphone du contact'}
                onChange={(ev) => majCoord(k.cle, { ...k, valeur: k.sorte === 'telephone' ? saisieTelephone(k.valeur, ev.target.value) : ev.target.value })}
                onBlur={() => { void lancer(c); }} />
              {k.sorte === 'email' ? <ActionEcrire email={k.valeur} onEcrire={onEcrire} /> : <ActionCopier tel={k.valeur} />}
            </span>
          </div>
          <button type="button" className="fsy-mini" aria-label="Retirer cette coordonnée"
            onClick={() => onChange({ ...c, coordonnees: c.coordonnees.filter((x) => x.cle !== k.cle) })}>×</button>
          {/* LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL Y AVAIT : sous un e-mail en double, un message
              ROUGE et bloquant. Désormais, sous l'e-mail OU le téléphone déjà utilisé, un avertissement ORANGE précis
              (un porteur par ligne s'ils sont plusieurs), dès qu'on quitte le champ. */}
          {(verif?.coordonnees ?? []).filter((d) => d.cleCoord === k.cle).map((d) => (
            <p key={d.cleCoord} className="fsy-alerte fsy-avertissement fsy-doublon-coord">
              {d.lignes.map((l, i) => <span key={i}>{l}</span>)}
            </p>
          ))}
        </div>
      ))}
      <div className="fsy-ligne-ajouts">
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => ajouter('telephone')}>+ téléphone</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => ajouter('email')}>+ e-mail</button>
      </div>
      {/* 🔴 LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS (accord d'Arno) — CE QU'IL Y AVAIT : un cadre de
          cases, « Tous les immeubles » + TOUTES les copropriétés du syndic. Désormais une ligne REPLIÉE « Immeubles
          suivis (N) ▸ » ; dépliée, SEULEMENT les copropriétés que ce contact suit, cochées : décocher le détache (au
          Valider, historisé). On rattache à un autre immeuble par le Catalogue, depuis le bien concerné. */}
      {immeuble !== undefined ? (
        <>
          {/* LOT COPRO-CONTACTS-IMMEUBLE — la note du contact, puis l'immeuble auquel il est (ou sera) rattaché. */}
          <label className="fsy-champ"><span>Note</span>
            <textarea rows={2} value={c.note ?? ''} onChange={(ev) => onChange({ ...c, note: ev.target.value })} /></label>
          <p className="fsy-suivis"><span className="fsy-discret">{e.nouveau ? 'Sera rattaché à :' : 'Rattaché à :'}</span> {immeuble}</p>
        </>
      ) : rattacheA !== undefined && e.nouveau ? (
        <p className="fsy-suivis"><span className="fsy-discret">Sera rattaché à :</span> {rattacheA}</p>
      ) : (
        <ImmeublesSuivisEdit c={c} origine={origine} adresses={adresses} onChange={onChange} />
      )}
      {refus !== null && <p className="fsy-alerte" role="alert">{refus}</p>}
      {alerte !== null && (
        <div className="fsy-alerte-coord" role="alert">
          <span className="fsy-alerte-coord-texte">{alerte.lignes.map((l, i) => <span key={i}>{l}</span>)}</span>
          <span className="fsy-alerte-coord-boutons">
            {alerte.corriger !== null
              ? <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => corriger(alerte.corriger as string)}>Corriger</button>
              : <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={completer}>Compléter</button>}
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => void valider(true)}>Valider quand même</button>
          </span>
        </div>
      )}
      {confirmation ?? (abandon ? (
        <div className="fsy-confirmer fsy-confirmer--contact" role="group" aria-label="Abandonner les modifications ?">
          <span>Abandonner les modifications ?</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setAbandon(false)}>Non</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => { setAbandon(false); onAnnuler(); }}>Oui, abandonner</button>
        </div>
      ) : (
        <div className="fsy-boutons fsy-boutons--contact">
          {onSupprimer && <button type="button" className="fsy-lien-bouton fsy-pousse-gauche" onClick={onSupprimer}>Supprimer ce contact</button>}
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={annuler}>Annuler</button>
          {e.nouveau || change ? (
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => void valider()} disabled={bloque}
              title={bloque ? 'Ce contact existe déjà : corrigez le nom ou l’e-mail' : undefined}>Valider</button>
          ) : (
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" disabled aria-disabled="true"
              title="Changez un champ : le bouton devient « Valider »">Modifier</button>
          )}
        </div>
      ))}
    </fieldset>
  );
}

// ══ LES COPROPRIÉTÉS — liste, auto-complétion (portefeuille puis BAN locale), confirmation de reprise ══════════════


function EditionCopros({ immeubles, connus, syndicId, onChange, contacts, onContacts, enModification, onCreerContact }: {
  immeubles: ImmeubleSaisi[]; connus: ImmeubleConnu[]; syndicId: number | null; onChange: (l: ImmeubleSaisi[]) => void;
  /** LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — le catalogue, pour afficher et modifier les affectations par immeuble. */
  contacts: ContactForm[]; onContacts: (c: ContactForm[]) => void;
  /** Le contact EXISTANT en cours de modification (ses affectations se règlent dans son bloc, pas ici). */
  enModification: string | null;
  /** Crée un contact affecté à cet immeuble ; rend le nom du contact qui bloque, s'il y en a un. */
  onCreerContact: (cle: string) => string | null;
}) {
  const [deplie, setDeplie] = useState<string | null>(null);
  /** La liste des copropriétés déjà rattachées : repliée à l'ouverture de la fiche. */
  const [listeOuverte, setListeOuverte] = useState(false);
  const [aCocher, setACocher] = useState<string[] | null>(null);
  const [bloque, setBloque] = useState<string | null>(null);
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const parCle = useMemo(() => new Map(connus.map((i) => [i.cle, i])), [connus]);


  return (
    <div className="fsy-bloc">
      {/* 🔴 LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — LA LISTE DES COPROPRIÉTÉS DÉJÀ RATTACHÉES TIENT EN UNE LIGNE,
          repliée à l'ouverture de la fiche, au format des lignes repliées (fond gris clair, ▸ à droite). Un clic la
          déplie juste dessous, telle qu'avant ; un nouveau clic la replie. Aucune copropriété : « (0) », non dépliable. */}
      {immeubles.length === 0 ? (
        <div className="fsy-copros-ligne fsy-copros-ligne--vide">
          <strong>Copropriétés déjà rattachées à ce syndic (0)</strong>
        </div>
      ) : (
        <button type="button" className="fsy-copros-ligne" aria-expanded={listeOuverte}
          onClick={() => setListeOuverte(!listeOuverte)}>
          <strong>Copropriétés déjà rattachées à ce syndic ({immeubles.length})</strong>
          <span className="fsy-fleche" aria-hidden="true">{listeOuverte ? '▾' : '▸'}</span>
        </button>
      )}
      {immeubles.length > 0 && listeOuverte && (
        <ul className="fsy-liste">
          {immeubles.map((im) => {
            const c = parCle.get(cleImmeuble(im.libelle));
            const affiche = adresseImmeuble(im.libelle, c?.codePostal ?? im.codePostal, c?.commune ?? im.commune);
            const cle = cleImmeuble(im.libelle);
            const suivent = contacts.filter((x) => suitImmeuble(x, cle));
            const ouvert = deplie === cle;
            const libres = contacts.filter((x) => !suitImmeuble(x, cle) && x.cle !== enModification);
            return (
              <li key={cle} className="fsy-copro">
                {/* « 25 rue Edith Cavell, 92400 Courbevoie · 2 contacts · 1 bien en gestion » ; un clic la déplie. */}
                <button type="button" className="fsy-copro-tete" aria-expanded={ouvert}
                  onClick={() => { setDeplie(ouvert ? null : cle); setACocher(null); setBloque(null); }}>
                  <span className="fsy-copro-adresse">
                    <span>{affiche}{(im.adresses ?? []).length > 0 && (
                      /* LOT COPRO-PLUSIEURS-ADRESSES — ses autres adresses, en gris. */
                      <span className="fsy-discret fsy-plus-adresses"> + {(im.adresses ?? []).length === 1 ? '1 adresse' : `${(im.adresses ?? []).length} adresses`}</span>
                    )}</span>
                    <span className="fsy-discret">{motContacts(suivent.length)} · {motBiens((c?.lots.length ?? 0)
                      + (im.adresses ?? []).reduce((n, a) => n + (parCle.get(cleImmeuble(a.libelle))?.lots.length ?? 0), 0))}</span>
                  </span>
                  <span className="fsy-fleche" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
                </button>
                {aRetirer === im.libelle ? (
                  <span className="fsy-confirmer" role="group" aria-label="Confirmer le retrait">
                    <span>Retirer ? Le lien passe en historique.</span>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn"
                      onClick={() => { onChange(immeubles.filter((x) => x.libelle !== im.libelle)); setARetirer(null); }}>Oui, retirer</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setARetirer(null)}>Non</button>
                  </span>
                ) : (
                  <button type="button" className="fsy-lien-bouton" onClick={() => setARetirer(im.libelle)}>Retirer</button>
                )}
                {ouvert && (
                  <div className="fsy-copro-contacts">
                    {suivent.length === 0 && <p className="fsy-discret fsy-sans-marge">Aucun contact pour cet immeuble.</p>}
                    {suivent.map((x) => (
                      <div key={x.cle} className="fsy-contact-coord">
                        <span className="fsy-coord-gauche">
                          <strong>{prenomNomCivil(x.civilite, x.prenom, x.nom) || nomAffiche(x)}</strong>
                          {valeurDuChoix(x.titreChoix, x.titreLibre) !== '' && prenomNom(x.prenom, x.nom) !== '' && (
                            <span className="fsy-discret"> · {valeurDuChoix(x.titreChoix, x.titreLibre)}</span>
                          )}
                        </span>
                        {/* LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — plus de contact « commun » : chaque contact affiché ici l'est
                            par SON affectation, et se retire de la même façon. */}
                        {x.cle === enModification
                          ? <span className="fsy-discret">en modification</span>
                          : <button type="button" className="fsy-lien-bouton fsy-action"
                              aria-label={`Retirer l’affectation de ${nomAffiche(x)}`}
                              onClick={() => onContacts(contacts.map((y) => (y.cle === x.cle ? affecter(y, cle, false) : y)))}>Retirer</button>}
                      </div>
                    ))}
                    {aCocher !== null ? (
                      <div className="fsy-affecter" role="group" aria-label="Affecter des contacts du catalogue">
                        {libres.length === 0 && <p className="fsy-discret fsy-sans-marge">Tous les contacts du catalogue suivent déjà cet immeuble.</p>}
                        {libres.map((x) => (
                          <label key={x.cle} className="fsy-case">
                            <input type="checkbox" checked={aCocher.includes(x.cle)}
                              onChange={(ev) => setACocher(ev.target.checked ? [...aCocher, x.cle] : aCocher.filter((k) => k !== x.cle))} />
                            <span>{prenomNomCivil(x.civilite, x.prenom, x.nom) || nomAffiche(x)}{valeurDuChoix(x.titreChoix, x.titreLibre) && prenomNom(x.prenom, x.nom) ? ` · ${valeurDuChoix(x.titreChoix, x.titreLibre)}` : ''}</span>
                          </label>
                        ))}
                        <div className="fsy-boutons fsy-boutons--contact">
                          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setACocher(null)}>Annuler</button>
                          <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" disabled={aCocher.length === 0}
                            onClick={() => { onContacts(contacts.map((y) => (aCocher.includes(y.cle) ? affecter(y, cle, true) : y))); setACocher(null); }}>
                            Affecter
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="fsy-ligne-ajouts">
                        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setACocher([])}>+ Affecter un contact</button>
                        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn"
                          onClick={() => setBloque(onCreerContact(cle))}>Créer un nouveau contact</button>
                      </div>
                    )}
                    {bloque !== null && (
                      <p className="fsy-alerte" role="alert">Terminez d’abord la modification en cours du contact {bloque} (Valider ou Annuler).</p>
                    )}
                  </div>
                )}
              </li>

            );
          })}
        </ul>
      )}
      {/* 🔴 LOT SYNDIC-BLOC-PORTEFEUILLE — « + Ajouter une copropriété (immeuble) » est RETIRÉ de la fiche (accord d'Arno),
          avec ses propositions et la confirmation de reprise. Une copropriété se rattache toujours quand on choisit ce
          syndic sur un bien (« Rattacher cet immeuble à ce syndic », immeuble du bien pré-rempli) ; le serveur
          (`enregistrerSyndic`) est inchangé. */}
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL : il le fermerait. Jetons --color-svv-* uniquement.
   🔴 COMPACTE : un seul pas d'espacement (.45rem) entre tous les blocs ; AUCUNE base flex sur un champ hors d'une
   rangee .fsy-duo — dans une colonne, une base devient une hauteur (c'etait le grand vide constate par Arno). */
export const CSS_FICHE_SYNDIC = `
.fsy-voile{position:fixed;inset:0;z-index:72;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(17,19,24,.45);text-align:left}
.fsy{width:min(44rem,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;
  border-radius:12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);color:var(--color-svv-ink);
  box-shadow:0 12px 40px rgba(17,19,24,.25)}
.fsy:focus{outline:none}
.fsy-tete{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:8px 8px 6px 16px;
  border-bottom:1px solid var(--color-svv-line)}
.fsy-titre{margin:0;font-size:1.05rem;font-weight:700;min-width:0;overflow-wrap:anywhere}
/* LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT — « Creer un nouveau syndic » + la croix : un bloc qui ne se
   comprime pas ; le titre, lui, passe a la ligne. Jamais de chevauchement (flex, aucun positionnement absolu). */
.fsy-tete-actions{flex:0 0 auto;display:flex;align-items:center;gap:.35rem;margin-left:auto}
/* Sur un ecran etroit, la ligne de titre se replie : le titre garde au moins 10rem, sinon les boutons passent dessous,
   a droite. */
.fsy-tete{flex-wrap:wrap}
.fsy-tete > .fsy-titre{flex:1 1 10rem}
.fsy-creer-tete{min-height:34px;padding:.25rem .7rem;font-size:.82rem;white-space:nowrap}
.fsy-croix{flex:0 0 auto;min-width:44px;min-height:44px;border:0;background:transparent;font-size:1.4rem;color:var(--color-svv-muted);cursor:pointer}
.fsy-corps{flex:1 1 auto;min-height:0;overflow-y:auto;padding:10px 16px 12px}
.fsy-pied{flex:0 0 auto;display:flex;flex-direction:column;gap:.4rem;padding:10px 16px;border-top:1px solid var(--color-svv-line);
  background:var(--color-svv-surface)}
.fsy-bloc{display:flex;flex-direction:column;gap:.45rem}
.fsy-sous-titre{margin:.35rem 0 0;font-size:.78rem;font-weight:700;color:var(--color-svv-muted);text-transform:uppercase;letter-spacing:.03em}
.fsy-discret{color:var(--color-svv-muted);font-size:.8rem}
.fsy-alerte{margin:0;padding:6px 10px;border-radius:8px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);font-size:.84rem}
.fsy-alerte ul{margin:.25rem 0 0;padding-left:1.1rem}
.fsy-sans-marge{margin:0}
.fsy-champ{display:flex;flex-direction:column;gap:.15rem;font-size:.78rem;color:var(--color-svv-muted);min-width:0}
.fsy-champ input,.fsy-champ select,.fsy-champ textarea{min-height:36px;padding:5px 9px;border-radius:8px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.92rem;box-sizing:border-box;width:100%}
.fsy-champ textarea{min-height:0;resize:vertical}
.fsy-duo{display:flex;flex-wrap:wrap;gap:.45rem}
.fsy-duo > .fsy-champ{flex:1 1 11rem}
/* LOT SYNDIC-CONTACT-CIVILITE — le petit champ a gauche de Prenom/Nom : sa largeur, pas celle d'un champ texte. */
.fsy-duo > .fsy-champ.fsy-champ--civilite{flex:0 0 auto}
.fsy-civilites{display:flex;gap:.3rem;align-items:center;min-height:36px}
.fsy-duo > .fsy-champ--cp{flex:0 0 7rem}
.fsy-duo > .fsy-champ--large{flex:2 1 13rem}
.fsy-champ--groupe{gap:.3rem}
.fsy-ligne-tel{display:flex;align-items:center;gap:.35rem}
.fsy-ligne-tel input{flex:0 1 14rem;min-width:0}
.fsy-mini{flex:0 0 auto;min-width:36px;min-height:36px;border-radius:8px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.05rem;line-height:1;cursor:pointer;align-self:flex-end}
.fsy-mini:hover,.fsy-mini:focus-visible{background:var(--color-svv-field)}
.fsy-mini-btn{min-height:34px;padding:.25rem .65rem;font-size:.82rem}
.fsy-ligne-champ{display:flex;align-items:center;gap:.6rem;min-width:0}
.fsy-ligne-champ input{flex:0 1 20rem;min-width:0}
.fsy-action{flex:0 0 auto;margin-left:auto;font-size:.82rem;white-space:nowrap}
.fsy-bloc--serre{gap:.3rem}
.fsy-champ--manque input{border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red)}
.fsy-champ--manque > span:first-child{color:var(--color-svv-red)}
.fsy-villes{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem}
.fsy-contact-tete{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.fsy-contact-coord{display:flex;align-items:center;justify-content:space-between;gap:.5rem;font-size:.86rem;padding-left:.2rem;min-height:32px}
.fsy-coord-gauche{min-width:0;overflow-wrap:anywhere}
.fsy-contact-ligne{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:.6rem}
.fsy-contact-nom{min-width:0;overflow-wrap:anywhere}
.fsy-contact-titre{margin-left:auto;text-align:right;color:var(--color-svv-muted);font-size:.84rem}
.fsy-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.fsy-liste--serree{gap:.1rem;font-size:.86rem}
.fsy-coord{display:inline-flex;flex-wrap:wrap;gap:.4rem;align-items:baseline}
.fsy-lien-bouton{border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-size:.82rem;text-decoration:underline;cursor:pointer;min-height:32px;padding:0 .2rem}
.fsy-resultat{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.45rem;padding:6px 10px;border-radius:8px;background:var(--color-svv-field)}
.fsy-resultat-nom{display:flex;flex-direction:column;min-width:0}
.fsy-contact-replie,.fsy-contact-tete-btn,.fsy-copros-ligne{width:100%;min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:.5rem;
  padding:6px 10px;border-radius:8px;border:1px solid transparent;background:var(--color-svv-field);color:var(--color-svv-ink);
  font:inherit;font-size:.88rem;text-align:left;cursor:pointer}
.fsy-contact-replie:hover,.fsy-contact-replie:focus-visible,.fsy-contact-tete-btn:hover,.fsy-contact-tete-btn:focus-visible,
button.fsy-copros-ligne:hover,button.fsy-copros-ligne:focus-visible{
  border-color:var(--color-svv-line-strong)}
.fsy-contact-tete-btn{background:transparent;padding:2px 0;min-height:32px}
.fsy-contact-ouvert{display:flex;flex-direction:column;gap:.25rem;padding:6px 10px 8px;border-radius:8px;background:var(--color-svv-field)}
.fsy-fleche{flex:0 0 auto;color:var(--color-svv-muted)}
.fsy-boutons--contact{gap:6px;margin-top:.2rem}
.fsy-pousse-gauche{margin-right:auto}
/* LOT SYNDIC-CONTACT-PARTI — « Ne travaille plus ici » : petit bouton blanc, texte gris fonce. */
.fsy-parti,.fsy-parti:hover{background:var(--color-svv-surface);color:var(--color-svv-gray)}
.fsy-parti-confirmer{display:flex;flex-direction:column;gap:.15rem;font-size:.84rem;margin-top:.2rem}
.fsy-parti-confirmer p{margin:0;overflow-wrap:anywhere}
/* LOT SYNDIC-CONFIRMATION-DEPART-UNE-COPRO-PAR-LIGNE — une copropriete par ligne : puces discretes, en retrait. */
.fsy-parti-copros{margin:.05rem 0 .2rem;padding-left:1.4rem;list-style:disc;overflow-wrap:anywhere}
.fsy-parti-copros li::marker{color:var(--color-svv-muted)}
.fsy-alerte-coord{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.35rem .6rem;padding:6px 10px;
  border-radius:8px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink);font-size:.84rem}
.fsy-alerte-coord-boutons{display:flex;gap:6px;margin-left:auto}
/* LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — une ligne par phrase (et par porteur d'une meme coordonnee). */
.fsy-alerte-coord-texte{display:flex;flex-direction:column;gap:.1rem;min-width:0;overflow-wrap:anywhere}
.fsy-doublon-coord{display:flex;flex-direction:column;gap:.1rem;overflow-wrap:anywhere;background:var(--color-svv-orange-soft);color:var(--color-svv-orange)}
.fsy-coord-edit > .fsy-doublon-coord{flex:1 1 100%}
.fsy-choix-ajout{display:flex;flex-direction:column;align-items:center;gap:.3rem}
/* LOT COPRO-CONTACTS-IMMEUBLE — le choix : deux GROS boutons cote a cote (l'un sous l'autre sur un ecran etroit). */
.fsy-choix-ajout-boutons{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;width:100%}
.fsy-choix{flex:1 1 13rem;min-height:52px;font-weight:700}
.fsy-sous-titre--immeuble{margin-top:.6rem}
.fsy-plus-adresse{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin-left:.4rem;padding:0;
  vertical-align:middle;border-radius:50%;border:1px solid var(--color-svv-red);background:var(--color-svv-surface);color:var(--color-svv-red);
  font:inherit;font-size:.95rem;font-weight:700;line-height:1;cursor:pointer;position:relative}
/* la cible tactile du §15, invisible */
.fsy-plus-adresse::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}
.fsy-plus-adresse:hover,.fsy-plus-adresse:focus-visible{background:var(--color-svv-red-soft)}
/* LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — le « + » PULSE quand des propositions attendent : un halo rouge
   transparent en SURIMPRESSION (::before, position absolue : rien ne bouge autour), deux pulsations amples (~2,5 fois
   le bouton, 0,8 s chacune), puis une douce et lente toutes les 2 s. Moins d'animations : pas de halo, un « + » rempli. */
@keyframes fsy-pulse-ample{from{transform:scale(1);opacity:.55}to{transform:scale(2.5);opacity:0}}
@keyframes fsy-pulse-douce{0%{transform:scale(1);opacity:0}30%{opacity:.28}100%{transform:scale(1.7);opacity:0}}
.fsy-plus-adresse--pulse::before{content:"";position:absolute;inset:-1px;border-radius:50%;pointer-events:none;
  background:color-mix(in srgb, var(--color-svv-red) 45%, transparent);
  animation:fsy-pulse-ample .8s ease-out 0s 2, fsy-pulse-douce 2s ease-in-out 1.6s infinite}
@media (prefers-reduced-motion: reduce){
  .fsy-plus-adresse--pulse::before{animation:none;display:none}
  .fsy-plus-adresse--pulse{background:var(--color-svv-red);color:var(--color-svv-surface)}}
.fsy-prises-ailleurs{color:var(--color-svv-muted)}
/* LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — le conflit possible : un encadre ORANGE dans le pied. */
.fsy-conflit-parcelle{padding:6px 10px;border-radius:8px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft);color:var(--color-svv-ink)}
.fsy-autres-adresses{margin-left:.35rem;padding:0;border:0;background:transparent;color:var(--color-svv-muted);font:inherit;font-size:.8rem;
  font-weight:400;text-transform:none;letter-spacing:normal;cursor:pointer}
.fsy-autres-adresses:hover,.fsy-autres-adresses:focus-visible{color:var(--color-svv-ink);text-decoration:underline}
.fsy-adresse-copro{display:flex;align-items:center;justify-content:space-between;gap:.4rem}
/* LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE — une adresse deja prise ailleurs : grisee, sans bouton, avec sa raison. */
.fsy-adresse-prise{color:var(--color-svv-muted)}
.fsy-ajout-adresse{display:flex;flex-direction:column;gap:.3rem;margin:.1rem 0 .3rem}
.fsy-ajout-adresse input{flex:1 1 12rem;min-width:0;min-height:36px;padding:5px 9px;border-radius:8px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.fsy-ancien{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:.2rem .6rem}
.gst-btn.fsy-detacher{color:var(--color-svv-red)}
/* LOT SYNDIC-CONTACTS-ANTI-DOUBLON — doublon bloquant en rouge, avertissement en orange (paire d'alerte existante). */
.fsy-doublon{flex:1 1 100%;margin:0;font-size:.84rem;color:var(--color-svv-red)}
.fsy-avertissement{font-size:.82rem}
.fsy-confirmer--contact{justify-content:flex-end;margin-top:.2rem}
.fsy-contact-ligne{min-width:0;overflow-wrap:anywhere}
.fsy-point{color:var(--color-svv-muted)}
.fsy-contact-edit{border:1px solid var(--color-svv-line);border-radius:10px;padding:6px 10px 8px;display:flex;flex-direction:column;gap:.45rem;margin:0}
.fsy-contact-edit legend{font-weight:700;font-size:.84rem;padding:0 .3rem}
.fsy-coord-edit{align-items:flex-end}
.fsy-ligne-ajouts{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
.fsy-pousse{margin-left:auto}
.fsy-copro{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.45rem;padding:5px 10px;border-radius:8px;background:var(--color-svv-field)}
.fsy-copros-ligne{margin-top:.35rem}
/* LOT SYNDIC-BLOC-PORTEFEUILLE — les lots du portefeuille : une adresse en tete de groupe.
   LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — chaque lot sur DEUX lignes (le lot, puis ses proprietaires dessous, a
   gauche, petit et gris) ; passage a la ligne naturel, jamais de troncature, jamais de colonne de droite. */
.fsy-lots{display:flex;flex-direction:column;gap:.6rem}
/* LOT SYNDIC-NOTE-PAR-BIEN-ET-GROUPES-COPROS — une copropriete = un sous-cadre blanc, borde, arrondi. */
.fsy-lots-groupe{display:flex;flex-direction:column;gap:.3rem;padding:6px 10px 8px;border:1px solid var(--color-svv-line);border-radius:10px;
  background:var(--color-svv-surface)}
.fsy-lots-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;padding-bottom:.3rem;border-bottom:1px solid var(--color-svv-line)}
.fsy-lots-adresse{font-size:.88rem;font-weight:700;color:var(--color-svv-ink);min-width:0;overflow-wrap:anywhere}
.fsy-lots-nombre{margin-left:auto;font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.fsy-pastille{padding:0 .45rem;border-radius:999px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);
  font-size:.72rem;color:var(--color-svv-muted);white-space:nowrap}
.fsy-note-cabinet{margin:0;padding:6px 9px;border-radius:8px;background:var(--color-svv-field);color:var(--color-svv-ink);
  font-size:.92rem;white-space:pre-wrap}
.fsy-lot{display:flex;flex-direction:column;align-items:flex-start;gap:.05rem;min-width:0}
.fsy-lot + .fsy-lot{margin-top:.3rem}
.fsy-lot-ligne1{min-width:0;max-width:100%;overflow-wrap:anywhere}
.fsy-lot-proprios{min-width:0;max-width:100%;overflow-wrap:anywhere;white-space:normal;text-align:left;font-size:.8rem;color:var(--color-svv-muted)}
.fsy-pastille-attente{display:inline-block;padding:0 .45rem;border-radius:999px;background:var(--color-svv-orange-soft);
  color:var(--color-svv-orange);border:1px solid var(--color-svv-orange);font-size:.72rem;font-weight:600;white-space:nowrap;cursor:help}
/* LOT SYNDIC-MODALE-DEUX-BLOCS — deux cadres arrondis, un fond à peine différent de la modale, un espace net entre eux. */
.fsy-deux-blocs{gap:1rem}
.fsy-cadre{display:flex;flex-direction:column;gap:.45rem;padding:10px 12px 12px;border:1px solid var(--color-svv-line);border-radius:12px;
  background:color-mix(in srgb, var(--color-svv-field) 45%, var(--color-svv-surface))}
.fsy-cadre-titre{margin:0 0 .1rem}
/* LOT SYNDIC-BLOC-AJOUT-CONTACT — le titre du bloc d'ajout et son « × Fermer » sur une ligne ; deux sous-cadres. */
.fsy-cadre-tete{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.fsy-fermer-ajout{flex:0 0 auto;color:var(--color-svv-muted);text-decoration:none}
.fsy-sous-cadre{display:flex;flex-direction:column;gap:.35rem;padding:8px 10px;border-radius:10px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-surface)}
.fsy-sous-cadre > .fsy-catalogue{border:0;padding:0}
.fsy-sous-cadre > .fsy-contact-edit{border:0;padding:0}
.fsy-sous-cadre > .fsy-contact-edit > legend{padding:0;margin-bottom:.2rem;font-size:.82rem;font-weight:700}
.fsy-copros-ligne--vide{cursor:default}
.fsy-copro-tete{flex:1 1 16rem;min-width:0;min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:.5rem;
  border:0;background:transparent;color:var(--color-svv-ink);font:inherit;text-align:left;cursor:pointer;padding:0}
.fsy-copro-contacts{flex:1 1 100%;display:flex;flex-direction:column;gap:.3rem;padding:.3rem 0 .2rem;border-top:1px solid var(--color-svv-line)}
.fsy-affecter{display:flex;flex-direction:column;gap:.25rem}
.fsy-case{display:flex;align-items:center;gap:.45rem;min-height:32px;font-size:.88rem;cursor:pointer}
.fsy-case input{width:18px;height:18px}
.fsy-suivis{margin:.1rem 0 0;font-size:.86rem;padding-left:.2rem}
.fsy-suivis-edit{border:1px dashed var(--color-svv-line);border-radius:8px;padding:4px 10px 6px;margin:0;display:flex;flex-direction:column;gap:.1rem}
.fsy-suivis-edit legend{font-size:.78rem;color:var(--color-svv-muted);padding:0 .3rem}
.fsy-catalogue{display:flex;flex-direction:column;gap:.35rem;padding:6px 10px 8px;border:1px solid var(--color-svv-line);border-radius:10px}
.fsy-catalogue-titre{margin:0;font-size:.86rem;font-weight:700}
.fsy-catalogue-recherche{display:block;width:100%;box-sizing:border-box;min-height:36px;padding:4px 9px;border-radius:8px;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:.88rem}
/* 5 TUILES AU PLUS (40 px chacune + 4 intervalles de .3rem) ; au-delà, la LISTE défile, pas la fiche. */
.fsy-catalogue-liste{display:flex;flex-direction:column;gap:.3rem;max-height:calc(5 * 40px + 4 * .3rem);overflow-y:auto;overscroll-behavior:contain}
.fsy-catalogue-liste > .fsy-contact-replie{flex:0 0 40px;min-height:40px;max-height:40px}
/* LOT SYNDIC-CATALOGUE-TUILES-ROSES — les tuiles du CATALOGUE (« a ajouter ») sur le rose des boutons syndic, a faible
   opacite (le jeton --color-svv-syndic-texte a sa variante Sombre : le texte --color-svv-ink reste contraste) ; un peu
   plus fonce au survol. Les tuiles deja rattachees restent grises. */
.fsy-catalogue-liste .fsy-tuile-catalogue{background:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)}
/* LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — un contact ARRIVE dans « Contacts de cette copropriete » : le
   rose des tuiles du catalogue (meme jeton, 10 %), puis le gris normal en 3 s, en douceur. Le theme Sombre suit par
   les jetons. Moins d'animations : aucun fondu, le rose tient jusqu'au retrait de la classe (3 s), puis le gris. */
@keyframes fsy-arrivee{
  from{background-color:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)}
  to{background-color:var(--color-svv-field)}}
.fsy-contact-replie.fsy-arrivee,.fsy-contact-ouvert.fsy-arrivee{animation:fsy-arrivee 3s ease-out forwards}
@media (prefers-reduced-motion: reduce){
  .fsy-contact-replie.fsy-arrivee,.fsy-contact-ouvert.fsy-arrivee{animation:none;
    background-color:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)}}
/* LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — « Copropriétes suivies (N) » : une petite ligne depliable. */
.fsy-suivis-repli{display:flex;flex-direction:column;gap:.1rem;padding-left:.2rem}
.fsy-suivis-tete{position:relative;display:inline-flex;align-items:center;gap:.35rem;align-self:flex-start;min-height:32px;padding:0;border:0;
  background:transparent;color:var(--color-svv-muted);font:inherit;font-size:.86rem;cursor:pointer;text-align:left}
.fsy-suivis-tete:hover,.fsy-suivis-tete:focus-visible{color:var(--color-svv-ink);text-decoration:underline}
/* la cible tactile du §15 : 44 px qu'on touche, 32 px qu'on voit (comme les pilules). */
.fsy-suivis-tete::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
/* LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — le contenu deplie sur FOND BLANC, dans un petit cadre
   arrondi a bord fin, en retrait : il se detache nettement des tuiles grises autour (lecture et modification). */
.fsy-suivis-liste{list-style:none;margin:.15rem 0 .1rem .6rem;padding:5px 9px;display:flex;flex-direction:column;gap:.15rem;
  font-size:.86rem;overflow-wrap:anywhere;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:8px}
.fsy-catalogue-liste .fsy-tuile-catalogue:hover{background:color-mix(in srgb, var(--color-svv-syndic-texte) 16%, transparent)}
.fsy-copro-adresse{display:flex;flex-direction:column;min-width:0;font-size:.9rem}
.fsy-confirmer{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;font-size:.84rem}
.fsy-proposition{width:100%;min-height:40px;display:flex;flex-direction:column;align-items:flex-start;gap:.05rem;text-align:left;
  border:1px solid var(--color-svv-line);border-radius:8px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;padding:5px 10px;cursor:pointer}
.fsy-proposition:hover,.fsy-proposition:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.fsy-proposition-adresse{font-size:.9rem}
.fsy-ajout{align-self:flex-start}
.fsy-ajout-centre{display:flex;justify-content:center}
.fsy-biens summary,.fsy-historique summary{cursor:pointer;font-size:.84rem;font-weight:700;color:var(--color-svv-muted);min-height:28px}
.fsy-historique ul{margin:.25rem 0 0;padding-left:1.1rem;font-size:.84rem}
.fsy-trace{margin:0}
.fsy-supprimer-lien{align-self:flex-start;color:var(--color-svv-muted)}
/* LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE — l'encadre d'alerte de la fermeture : le triangle a gauche, le texte a droite. */
.fsy-fermeture{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:start;column-gap:1.1rem;row-gap:1rem;padding:16px 18px;border-radius:12px;border:1px solid var(--color-svv-red);background:var(--color-svv-red-soft);color:var(--color-svv-ink);font-size:.88rem}
.fsy-fermeture p{margin:0}
.fsy-fermeture-texte{display:flex;flex-direction:column;gap:.7rem;min-width:0}
.fsy-fermeture-titre{font-weight:700;font-size:1.05rem;line-height:1.3}
.fsy-fermeture-partie{display:flex;flex-direction:column;gap:.35rem}
.fsy-fermeture-sous-titre{font-variant-caps:all-small-caps;letter-spacing:.06em;font-weight:600;font-size:.95rem;color:var(--color-svv-muted)}
.fsy-fermeture-liste{margin:0;padding-left:1.1rem;list-style:disc;line-height:1.5;max-height:calc(6 * 1.5em);overflow-y:auto;overscroll-behavior:contain}
.fsy-fermeture-liste li::marker{color:var(--color-svv-muted)}
.fsy-fermeture-gris,.fsy-fermeture-vide{color:var(--color-svv-muted)}
.fsy-fermeture-vide{font-style:italic}
.fsy-fermeture-boutons{grid-column:1 / -1}
.fsy-triangle{width:96px;height:96px}
@media (max-width:420px){.fsy-fermeture{grid-template-columns:minmax(0,1fr)}}
.fsy-triangle-fond{fill:#f5c400;stroke:var(--color-svv-ink);stroke-width:1.5}
.fsy-triangle-signe{fill:var(--color-svv-red)}
/* LOT SYNDIC-RETIRER-DE-LA-RESIDENCE — le GROS bouton : pleine largeur, fond blanc, bord et texte rouge de la marque. */
.fsy-retrait{width:100%;min-height:52px;padding:10px 14px;border-radius:10px;border:2px solid var(--color-svv-red);
  background:var(--color-svv-surface);color:var(--color-svv-red);font:inherit;font-size:.95rem;font-weight:700;cursor:pointer;text-align:center}
.fsy-retrait:hover:not(:disabled),.fsy-retrait:not(:disabled):focus-visible{background:var(--color-svv-red-soft)}
.fsy-retrait:not(:disabled):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.fsy-retrait-confirmer{display:flex;flex-direction:column;gap:.3rem;padding:10px 12px;border-radius:10px;
  border:2px solid var(--color-svv-red);background:var(--color-svv-surface);font-size:.9rem}
.fsy-retrait-confirmer p{margin:0;overflow-wrap:anywhere}
.fsy-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px}
.fsy-question{margin-right:auto;font-weight:700;font-size:.9rem}
.fsy-pied-alerte{font-size:.84rem}
@media (max-width:640px){
  .fsy-voile{padding:0}
  .fsy{width:100%;max-height:none;height:100%;border-radius:0}
  .fsy-champ input,.fsy-champ select,.fsy-champ textarea{font-size:16px;min-height:44px}
  .fsy-boutons .gst-btn{flex:1 1 auto;min-height:44px}
  .fsy-mini{min-width:44px;min-height:44px}
  .fsy-catalogue-recherche{font-size:16px;min-height:44px}
}
`;
