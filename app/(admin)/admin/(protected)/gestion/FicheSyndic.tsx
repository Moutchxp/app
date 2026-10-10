'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  nomAvecVille, filtrerCatalogue, trierParNom,
  affecter, motBiens, motContacts, suiviParDefaut, suitImmeuble,
  casserNom, casserPrenom, MINIMUM_ADRESSE,
  appliquerBrouillon, contactModifie, copieContact, nomAffiche, telephoneComplet, type EditionContact as EtatEdition,
  adresseImmeuble, adresseManquante, apercuPropagation, MOTIF_ADRESSE_INCOMPLETE, prenomNom, type ChampAdresse, cleImmeuble, contactNomme, contactVide, coordonneeVide, coproprietesRetirees,
  emailPlausible, formaterTelephone, formulaireModifie, formulaireVide, immeublesQuiRepondent, libellesDe,
  lienTelephone, MINIMUM_AUTOCOMPLETION, motBiensEnGestion, nomDuContact, PERSONNALISE, saisieTelephone,
  TITRES_CONTACT, valeurDuChoix, versFormulaire, versSaisie,
  type AdresseBan, type ContactForm, type CoordonneeForm, type FicheSyndic as Fiche, type ImmeubleConnu,
  type ImmeubleSaisi, type SorteCoordonnee, type SyndicForm, type SyndicResume,
} from '../../../../lib/gestion/syndics';
import { rafraichirImmeubles, useImmeublesSyndics } from './useImmeublesSyndics';
import { chercherAdresses } from './adressesSyndic';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';

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

export function FicheSyndic({ syndicId: idInitial, immeubleDepart = null, onFerme, onEcrire }: {
  /** `null` = aucun syndic encore : on commence par chercher un syndic existant. */
  syndicId: number | null;
  /** L'immeuble du bien depuis lequel on vient : pré-rempli comme copropriété. */
  immeubleDepart?: ImmeubleSaisi | null;
  onFerme: () => void;
  /** Écrire depuis gestion@ par le composeur existant. Absent ⇒ le lien `mailto:` suffit. */
  onEcrire?: (email: string) => void;
}) {
  const [syndicId, setSyndicId] = useState<number | null>(idInitial);
  const [mode, setMode] = useState<Mode>(idInitial === null ? 'recherche' : 'chargement');
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [form, setForm] = useState<SyndicForm>(() => formulaireVide(immeubleDepart));
  /** Le formulaire tel qu'il était à l'ouverture : ce qui permet de dire « des modifications sont en cours ». */
  const [initial, setInitial] = useState<SyndicForm>(() => formulaireVide(null));
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [abandon, setAbandon] = useState(false);
  const [suppression, setSuppression] = useState(false);
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
      const r = await fetch(`/api/admin/gestion/syndics/${id}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; fiche?: Fiche; message?: string };
      if (!r.ok || j.etat !== 'ok' || !j.fiche) { setErreur(j.message ?? 'Lecture impossible.'); setMode('erreur'); return null; }
      setFiche(j.fiche);
      const f = versFormulaire(j.fiche);
      setForm(f); setInitial(f);
      setMode('edition');
      return j.fiche;
    } catch {
      setErreur('Lecture impossible : le serveur n’a pas répondu.'); setMode('erreur'); return null;
    }
  }, []);

  useEffect(() => { if (idInitial !== null) void charger(idInitial); }, [idInitial, charger]);

  const origineEdition = edition === null ? null
    : edition.nouveau ? (edition.depart ?? null) : (form.contacts.find((c) => c.cle === edition.cle) ?? null);
  /** LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — l'immeuble du bien depuis lequel on a ouvert la fiche (sinon `null`). */
  const cleDepart = immeubleDepart !== null && immeubleDepart.libelle.trim() !== '' ? cleImmeuble(immeubleDepart.libelle) : null;
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
      e.stopPropagation(); annuler();
    };
    document.addEventListener('keydown', auClavier, true);
    return () => document.removeEventListener('keydown', auClavier, true);
  }, [annuler]);
  useEffect(() => { boite.current?.focus(); }, []);

  /** « Rattacher cet immeuble à ce syndic » : SA fiche s'ouvre, l'immeuble déjà ajouté (et donc à valider). */
  const rattacherA = async (id: number): Promise<void> => {
    setSyndicId(id);
    const f = await charger(id);
    if (f === null || immeubleDepart === null || immeubleDepart.libelle.trim() === '') return;
    const base = versFormulaire(f);
    if (!base.immeubles.some((x) => cleImmeuble(x.libelle) === cleImmeuble(immeubleDepart.libelle))) {
      setForm({ ...base, immeubles: [...base.immeubles, immeubleDepart] });
    }
  };

  /**
   * VALIDER — enregistre puis ferme. Rien n'a bougé ⇒ on ferme simplement.
   * 🔴 Un contact en cours de modification NON validé ⇒ on demande d'abord « Valider aussi les modifications du
   * contact … ? » (`questionContact`), puis `validerAvec` reprend avec ou sans lui.
   */
  const valider = async (): Promise<void> => {
    if (contactEnCours) { setQuestionContact(true); return; }
    await validerAvec(form);
  };

  const validerAvec = async (f: SyndicForm): Promise<void> => {
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
        body: JSON.stringify(versSaisie(f)),
      });
      const j = (await r.json()) as { ok?: boolean; id?: number; erreur?: string };
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

  const titre = mode === 'recherche' ? 'Syndic de la copropriété'
    // LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — « NOM / Ville » : le nom affiché, calculé ; jamais réécrit en base.
    : syndicId === null ? 'Créer un syndic' : (fiche !== null ? nomAvecVille(fiche.nom, fiche.ville) : 'Syndic');

  return (
    <div className="fsy-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) annuler(); }}>
      <style>{CSS_FICHE_SYNDIC}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <div className="fsy" role="dialog" aria-modal="true" aria-labelledby="fsy-titre" tabIndex={-1} ref={boite}>
        <div className="fsy-tete">
          <h2 className="fsy-titre" id="fsy-titre">{titre}</h2>
          <button type="button" className="fsy-croix" aria-label="Annuler et fermer" onClick={annuler}>×</button>
        </div>

        <div className="fsy-corps">
          {immeubles !== null && !immeubles.disponible && (
            <p className="fsy-alerte">L’annuaire des syndics n’est pas encore installé (migrations 324-325).</p>
          )}
          {mode === 'chargement' && <p className="fsy-discret">Chargement…</p>}
          {mode === 'recherche' && (
            <Recherche immeubleDepart={immeubleDepart} onRattacher={(id) => void rattacherA(id)}
              onCreer={() => { setForm(formulaireVide(immeubleDepart)); setInitial(formulaireVide(null)); setMode('edition'); }} />
          )}
          {mode === 'edition' && (
            <Edition form={form} setForm={setForm} fiche={fiche} syndicId={syndicId} onEcrire={onEcrire}
              connus={immeubles?.immeubles ?? []} suppression={suppression} setSuppression={setSuppression}
              envoi={envoi} onSupprimer={() => void supprimer()} tente={tente}
              ouverts={ouverts} setOuverts={setOuverts} edition={edition} setEdition={setEdition} cleDepart={cleDepart} />
          )}
        </div>

        {/* ══ LE PIED, TOUJOURS VISIBLE — hors de la zone qui défile ══ */}
        <div className="fsy-pied">
          {erreur !== null && <p className="fsy-alerte fsy-pied-alerte" role="alert">{erreur}</p>}
          {questionContact && edition !== null ? (
            <div className="fsy-boutons" role="group" aria-label="Valider aussi les modifications du contact ?">
              <span className="fsy-question">Valider aussi les modifications du contact {nomAffiche(edition.brouillon)} ?</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setQuestionContact(false)}>Revenir</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void validerAvec(form)}>Non, sans ce contact</button>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
                const b = edition.brouillon;
                if (!contactNomme({ titre: valeurDuChoix(b.titreChoix, b.titreLibre), prenom: b.prenom, nom: b.nom })) {
                  setQuestionContact(false); setErreur('Le contact en cours n’a ni prénom, ni nom, ni titre : complétez-le ou annulez-le.'); return;
                }
                void validerAvec(appliquerBrouillon(form, edition));
              }}>Oui, valider aussi</button>
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

// ══ ÉTAPE 1 — CHERCHER UN SYNDIC EXISTANT ═══════════════════════════════════════════════════════════════════════

function Recherche({ immeubleDepart, onRattacher, onCreer }: {
  immeubleDepart: ImmeubleSaisi | null; onRattacher: (id: number) => void; onCreer: () => void;
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
          {liste.map((s) => (
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
      <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-ajout" onClick={onCreer}>Créer un nouveau syndic</button>
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

function Edition({ form, setForm, fiche, syndicId, onEcrire, connus, suppression, setSuppression, envoi, onSupprimer, tente,
  ouverts, setOuverts, edition, setEdition, cleDepart }: {
  form: SyndicForm; setForm: (f: SyndicForm) => void; fiche: Fiche | null; syndicId: number | null;
  onEcrire?: (email: string) => void; connus: ImmeubleConnu[];
  suppression: boolean; setSuppression: (v: boolean) => void; envoi: boolean; onSupprimer: () => void;
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
    : edition.nouveau ? (edition.depart ?? null) : (form.contacts.find((c) => c.cle === edition.cle) ?? null);
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
  const contacts = useContacts({ form, setForm, onEcrire, ouverts, setOuverts, edition, setEdition, cleDepart, adresses });
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
        {adresseDuBien !== null ? `Syndic de l’immeuble · ${adresseDuBien}` : 'Coordonnées et contacts du cabinet'}
      </h3>
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
      {noteOuverte || form.note.trim() !== '' ? (
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
      <h4 className="fsy-sous-titre">{adresseDuBien !== null ? 'Contacts de cet immeuble' : 'Contacts du cabinet'}</h4>
      {contacts.liste}
      </section>

      <section className="fsy-cadre" aria-labelledby="fsy-bloc-2">
      <h3 className="fsy-sous-titre fsy-cadre-titre" id="fsy-bloc-2">Gérer ce syndic</h3>
      {contacts.ajout}

      <EditionCopros immeubles={form.immeubles} connus={connus} syndicId={syndicId}
        /* LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — une copropriété retirée sort aussi des contacts qui la suivaient. */
        onChange={(l) => {
          const restent = new Set(l.map((i) => cleImmeuble(i.libelle)));
          setForm({ ...form, immeubles: l, contacts: form.contacts.map((c) => ({ ...c, immeubles: c.immeubles.filter((k) => restent.has(k)) })) });
        }}
        contacts={form.contacts} onContacts={(cs) => setForm({ ...form, contacts: cs })}
        enModification={edition?.nouveau === false ? edition.cle : null}
        onCreerContact={creerContactPour} />

      {/* 🔴 LA LISTE DES BIENS, SOUS LES YEUX AVANT DE VALIDER. */}
      <details className="fsy-biens" open={a.lots.length <= 12}>
        <summary>Biens qui recevront ce syndic ({a.lots.length})</summary>
        {a.lots.length === 0 ? <p className="fsy-discret">Aucun bien en gestion dans ces immeubles.</p> : (
          <ul className="fsy-liste fsy-liste--serree">
            {a.lots.map((l) => (
              <li key={l.id}><strong>lot {l.numero}</strong> — {[l.adresse, l.commune].filter((x) => x).join(', ') || l.immeuble}</li>
            ))}
          </ul>
        )}
      </details>
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
      {fiche !== null && syndicId !== null && (suppression ? (
        <div className="fsy-supprimer" role="group" aria-label="Confirmer la suppression du syndic">
          <p><strong>Supprimer « {nomAvecVille(fiche.nom, fiche.ville)} » ?</strong> Ses contacts et ses liens de copropriété sont retirés ;
            {biensPerdus.length === 0 ? ' aucun bien ne le perd.' : biensPerdus.length === 1 ? ' 1 bien perdra ce syndic :' : ` ${biensPerdus.length} biens perdront ce syndic :`}</p>
          {biensPerdus.length > 0 && (
            <ul className="fsy-liste fsy-liste--serree">
              {biensPerdus.map((l) => <li key={l.id}><strong>lot {l.numero}</strong> — {l.immeuble}</li>)}
            </ul>
          )}
          <div className="fsy-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setSuppression(false)} disabled={envoi}>Non, garder</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onSupprimer} disabled={envoi}>Oui, supprimer ce syndic</button>
          </div>
        </div>
      ) : (
        <button type="button" className="fsy-lien-bouton fsy-supprimer-lien" onClick={() => setSuppression(true)}>Supprimer ce syndic</button>
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
function Catalogue({ contacts, adresses, onSelectionner }: {
  contacts: ContactForm[]; adresses: Array<{ cle: string; adresse: string }>; onSelectionner: (cle: string) => void;
}) {
  const [q, setQ] = useState('');
  /** Une seule tuile dépliée à la fois : en déplier une autre replie la précédente. */
  const [deplie, setDeplie] = useState<string | null>(null);
  const resultats = filtrerCatalogue(contacts, q);
  const liste = useRef<HTMLDivElement | null>(null);
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
          <div key={c.cle} className="fsy-contact-ouvert" data-echap-local=""
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
          <button key={c.cle} type="button" className="fsy-contact-replie" aria-expanded={false} data-cle={c.cle} onClick={() => setDeplie(c.cle)}>
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
type Action = { genre: 'ouvrir' | 'modifier'; cle: string } | { genre: 'ajouter' };

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
function useContacts({ form, setForm, onEcrire, ouverts, setOuverts, edition, setEdition, cleDepart, adresses }: {
  form: SyndicForm; setForm: (f: SyndicForm) => void; onEcrire?: (email: string) => void;
  ouverts: string[]; setOuverts: (o: string[]) => void;
  edition: EtatEdition | null; setEdition: (e: EtatEdition | null) => void;
  cleDepart: string | null; adresses: Array<{ cle: string; adresse: string }>;
}): { liste: React.ReactNode; ajout: React.ReactNode } {
  /** Une action demandée pendant qu'un AUTRE contact a des modifications non enregistrées. */
  const [enAttente, setEnAttente] = useState<Action | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const origine = (e: EtatEdition): ContactForm | null => (e.nouveau ? (e.depart ?? null) : (form.contacts.find((c) => c.cle === e.cle) ?? null));
  const enCours = edition !== null && contactModifie(origine(edition), edition.brouillon);

  const executer = (a: Action): void => {
    setASupprimer(null);
    if (a.genre === 'ajouter') {
      const c = contactVide(suiviParDefaut(cleDepart, form.immeubles));
      setEdition({ cle: c.cle, brouillon: c, nouveau: true, depart: copieContact(c) });
      return;
    }
    const c = form.contacts.find((x) => x.cle === a.cle);
    if (c === undefined) return;
    if (!ouverts.includes(a.cle)) setOuverts([...ouverts, a.cle]);
    setEdition(a.genre === 'modifier' ? { cle: a.cle, brouillon: copieContact(c), nouveau: false } : (edition?.cle === a.cle ? edition : null));
  };
  /** Toute action passe par ici : une modification non enregistrée d'un AUTRE contact demande confirmation. */
  const demander = (a: Action): void => {
    const autre = edition !== null && (a.genre === 'ajouter' || edition.cle !== a.cle);
    if (autre && enCours) { setEnAttente(a); return; }
    executer(a);
  };
  const fermer = (cle: string): void => setOuverts(ouverts.filter((x) => x !== cle));
  const supprimer = (cle: string): void => {
    setForm({ ...form, contacts: form.contacts.filter((c) => c.cle !== cle) });
    setOuverts(ouverts.filter((x) => x !== cle));
    if (edition?.cle === cle) setEdition(null);
    setASupprimer(null);
  };
  const valider = (e: EtatEdition): void => {
    setForm(appliquerBrouillon(form, e));
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
      onAnnuler={() => setEdition(null)} onValider={() => valider(edition)}
      onSupprimer={() => setASupprimer(c.cle)} confirmation={confirmerSuppression(c)} />
  ) : ouverts.includes(c.cle) ? (
    <ContactOuvert key={c.cle} c={c} onEcrire={onEcrire} adresses={adresses} onFermer={() => fermer(c.cle)}
      onModifier={() => demander({ genre: 'modifier', cle: c.cle })} onSupprimer={() => setASupprimer(c.cle)}
      confirmation={confirmerSuppression(c)} />
  ) : (
    <button key={c.cle} type="button" className="fsy-contact-replie" aria-expanded={false}
      onClick={() => demander({ genre: 'ouvrir', cle: c.cle })}>
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
  };

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
    </>
  );
  const ajout = (
    <>
      {/* ══ 🔴 LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — DEUX BLOCS L'UN SOUS L'AUTRE, depuis un bien :
          « Catalogue (N) » OUVERT d'office (s'il a quelque chose à proposer), puis « Nouveau contact ». Le nouveau
          contact n'est rattaché QU'À l'immeuble du bien : ses cases « Immeubles suivis » cèdent la place à
          « Sera rattaché à : … » (accord d'Arno pour CE formulaire ; elles restent en modification d'un contact). */}
      {edition !== null && edition.nouveau && (
        <>
          {parImmeuble && catalogue.length > 0 && suitSeulement(edition.depart, cleDepart as string) && (
            <Catalogue contacts={catalogue} adresses={adresses} onSelectionner={selectionner} />
          )}
          <ContactEnModification e={edition} origine={edition.depart ?? null} onEcrire={onEcrire} adresses={adresses}
            onChange={(b) => setEdition({ ...edition, brouillon: b })}
            onAnnuler={() => setEdition(null)} onValider={() => valider(edition)}
            rattacheA={parImmeuble ? adresses.filter((a) => edition.brouillon.immeubles.includes(a.cle)).map((a) => a.adresse).join(' · ') : undefined} />
        </>
      )}
      {/* 🔴 LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — UN SEUL CONTACT EN CRÉATION À LA FOIS (accord d'Arno pour
          ce masquage) : tant que le bloc d'ajout est ouvert (Catalogue et/ou Nouveau contact), pas de « + Ajouter un
          contact ». Il revient dès que le bloc se ferme : Annuler, Valider, ou « Ajouter à cette copropriété ». */}
      {edition?.nouveau !== true && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-ajout" onClick={() => demander({ genre: 'ajouter' })}>
          + Ajouter un contact
        </button>
      )}
    </>
  );
  return { liste, ajout };
}

/** Ce contact (nouveau) ne suit-il QUE cet immeuble ? C'est le cas d'un ajout depuis le bien — et non depuis une
 *  autre copropriété, où le Catalogue du bien n'aurait rien à faire. */
function suitSeulement(c: ContactForm | undefined, cle: string): boolean {
  return c !== undefined && !c.tousImmeubles && c.immeubles.length === 1 && c.immeubles[0] === cle;
}

/** « Tous les immeubles », ou la liste des copropriétés suivies (adresse complète). */
function motImmeublesSuivis(c: ContactForm, adresses: Array<{ cle: string; adresse: string }>): string {
  if (c.tousImmeubles) return 'Tous les immeubles';
  const l = adresses.filter((a) => c.immeubles.includes(a.cle)).map((a) => a.adresse);
  return l.length === 0 ? 'aucun immeuble' : l.join(' · ');
}

/**
 * « Prénom NOM » en gras, À GAUCHE ; le TITRE en gris, À DROITE, juste avant la flèche (lot
 * FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS). Sans nom, le titre seul, en gras, à gauche.
 */
function EnteteContact({ c }: { c: ContactForm }) {
  const nom = prenomNom(c.prenom, c.nom);
  const titre = valeurDuChoix(c.titreChoix, c.titreLibre);
  return (
    <span className="fsy-contact-ligne">
      <strong className="fsy-contact-nom">{nom !== '' ? nom : titre}</strong>
      {nom !== '' && titre !== '' && <span className="fsy-contact-titre">{titre}</span>}
    </span>
  );
}

/** ② OUVERT EN LECTURE — aucune saisie ; une ligne par téléphone et par e-mail, l'action au bout. */
function ContactOuvert({ c, onEcrire, onFermer, onModifier, onSupprimer, confirmation, adresses }: {
  c: ContactForm; onEcrire?: (email: string) => void; onFermer: () => void; onModifier: () => void; onSupprimer: () => void;
  confirmation: React.ReactNode; adresses: Array<{ cle: string; adresse: string }>;
}) {
  const libelle = (k: CoordonneeForm): string => valeurDuChoix(k.choix, k.libre);
  const tels = c.coordonnees.filter((k) => k.sorte === 'telephone' && k.valeur.trim() !== '');
  const emails = c.coordonnees.filter((k) => k.sorte === 'email' && k.valeur.trim() !== '');
  return (
    <div className="fsy-contact-ouvert">
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
      <p className="fsy-suivis"><span className="fsy-discret">Immeubles suivis :</span> {motImmeublesSuivis(c, adresses)}</p>
      {confirmation ?? (
        <div className="fsy-boutons fsy-boutons--contact">
          <button type="button" className="fsy-lien-bouton fsy-pousse-gauche" onClick={onSupprimer}>Supprimer ce contact</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onFermer}>Fermer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={onModifier}>Modifier</button>
        </div>
      )}
    </div>
  );
}

/** ③ EN MODIFICATION — des champs ; « Modifier » devient « Valider » dès qu'un champ change. */
function ContactEnModification({ e, origine, onChange, onAnnuler, onValider, onSupprimer, confirmation, onEcrire, adresses,
  rattacheA }: {
  e: EtatEdition; origine: ContactForm | null; onChange: (c: ContactForm) => void;
  onAnnuler: () => void; onValider: () => void; onSupprimer?: () => void; confirmation?: React.ReactNode;
  onEcrire?: (email: string) => void; adresses: Array<{ cle: string; adresse: string }>;
  /** LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — création DEPUIS UN BIEN : l'immeuble imposé, dit en lecture à la
   *  place des cases « Immeubles suivis ». Absent ⇒ les cases, comme avant. */
  rattacheA?: string;
}) {
  const c = e.brouillon;
  /** Les champs RETOUCHÉS : seuls ceux-là reçoivent la casse en quittant le champ (un nom existant qu'on ne fait que
   *  traverser au clavier n'est pas réécrit). */
  const touches = useRef(new Set<'prenom' | 'nom'>());
  const [refus, setRefus] = useState<string | null>(null);
  const [abandon, setAbandon] = useState(false);
  const change = contactModifie(origine, c);
  const majCoord = (cle: string, k: CoordonneeForm): void =>
    onChange({ ...c, coordonnees: c.coordonnees.map((x) => (x.cle === cle ? k : x)) });
  const ajouter = (sorte: SorteCoordonnee): void => onChange({ ...c, coordonnees: [...c.coordonnees, coordonneeVide(sorte)] });
  const valider = (): void => {
    if (!contactNomme({ titre: valeurDuChoix(c.titreChoix, c.titreLibre), prenom: c.prenom, nom: c.nom })) {
      setRefus('Indiquez au moins un prénom, un nom ou un titre.'); return;
    }
    setRefus(null);
    onValider();
  };
  const annuler = (): void => { if (change) { setAbandon(true); return; } onAnnuler(); };
  return (
    <fieldset className="fsy-contact-edit">
      <legend>{e.nouveau ? 'Nouveau contact' : nomAffiche(origine ?? c)}</legend>
      <div className="fsy-duo">
        <SelectChoix libelle="Titre" choix={c.titreChoix} libre={c.titreLibre} options={TITRES_CONTACT}
          onChange={(choix, libre) => onChange({ ...c, titreChoix: choix, titreLibre: libre })} />
      </div>
      <div className="fsy-duo">
        {/* 🔴 LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — la casse se met EN QUITTANT le champ, jamais pendant la
            frappe : « jean-pierre » → « Jean-Pierre », « lefèvre » → « LEFÈVRE ». Rien n'est réécrit en base hors d'une
            modification : un contact existant garde sa casse tant qu'on ne touche pas à son champ. */}
        <label className="fsy-champ"><span>Prénom</span>
          <input type="text" value={c.prenom} onChange={(ev) => { touches.current.add('prenom'); onChange({ ...c, prenom: ev.target.value }); }}
            onBlur={() => { const v = casserPrenom(c.prenom); if (touches.current.has('prenom') && v !== c.prenom) onChange({ ...c, prenom: v }); }} /></label>
        <label className="fsy-champ"><span>Nom</span>
          <input type="text" value={c.nom} onChange={(ev) => { touches.current.add('nom'); onChange({ ...c, nom: ev.target.value }); }}
            onBlur={() => { const v = casserNom(c.nom); if (touches.current.has('nom') && v !== c.nom) onChange({ ...c, nom: v }); }} /></label>
      </div>
      {c.coordonnees.map((k) => (
        <div key={k.cle} className="fsy-duo fsy-coord-edit">
          <SelectChoix libelle="Libellé" choix={k.choix} libre={k.libre} options={libellesDe(k.sorte)}
            onChange={(choix, libre) => majCoord(k.cle, { ...k, choix, libre })} />
          <div className="fsy-champ fsy-champ--large">
            <span>{k.sorte === 'email' ? 'E-mail' : 'Téléphone'}</span>
            <span className="fsy-ligne-champ">
              <input type={k.sorte === 'email' ? 'email' : 'tel'} value={k.valeur}
                aria-label={k.sorte === 'email' ? 'E-mail du contact' : 'Téléphone du contact'}
                onChange={(ev) => majCoord(k.cle, { ...k, valeur: k.sorte === 'telephone' ? saisieTelephone(k.valeur, ev.target.value) : ev.target.value })} />
              {k.sorte === 'email' ? <ActionEcrire email={k.valeur} onEcrire={onEcrire} /> : <ActionCopier tel={k.valeur} />}
            </span>
          </div>
          <button type="button" className="fsy-mini" aria-label="Retirer cette coordonnée"
            onClick={() => onChange({ ...c, coordonnees: c.coordonnees.filter((x) => x.cle !== k.cle) })}>×</button>
        </div>
      ))}
      <div className="fsy-ligne-ajouts">
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => ajouter('telephone')}>+ téléphone</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => ajouter('email')}>+ e-mail</button>
      </div>
      {/* 🔴 LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — « Immeubles suivis » : « Tous les immeubles », ou les copropriétés
          cochées une à une (celles du syndic). */}
      {rattacheA !== undefined && e.nouveau ? (
        <p className="fsy-suivis"><span className="fsy-discret">Sera rattaché à :</span> {rattacheA}</p>
      ) : (
      <fieldset className="fsy-suivis-edit">
        <legend>Immeubles suivis</legend>
        <label className="fsy-case">
          <input type="checkbox" checked={c.tousImmeubles}
            onChange={(ev) => onChange({ ...c, tousImmeubles: ev.target.checked, immeubles: ev.target.checked ? [] : c.immeubles })} />
          <span>Tous les immeubles</span>
        </label>
        {adresses.map((a) => (
          <label key={a.cle} className="fsy-case">
            <input type="checkbox" disabled={c.tousImmeubles} checked={c.tousImmeubles || c.immeubles.includes(a.cle)}
              onChange={(ev) => onChange(affecter(c, a.cle, ev.target.checked))} />
            <span>{a.adresse}</span>
          </label>
        ))}
        {adresses.length === 0 && <p className="fsy-discret fsy-sans-marge">Ajoutez une copropriété pour affecter ce contact à un immeuble.</p>}
      </fieldset>
      )}
      {refus !== null && <p className="fsy-alerte" role="alert">{refus}</p>}
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
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={valider}>Valider</button>
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

interface Suggestion { cle: string; libelle: string; codePostal: string; commune: string; nbBiens: number; syndic: { id: number; nom: string; ville?: string | null } | null }

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
  const [saisie, setSaisie] = useState('');
  const [ban, setBan] = useState<AdresseBan[]>([]);
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const [aPrendre, setAPrendre] = useState<Suggestion | null>(null);
  const parCle = useMemo(() => new Map(connus.map((i) => [i.cle, i])), [connus]);
  const dejaLa = useMemo(() => new Set(immeubles.map((i) => cleImmeuble(i.libelle))), [immeubles]);

  // 🔴 LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — hors portefeuille : l'API Adresse (la même que les fiches),
  // la BAN locale en repli. Les immeubles du PORTEFEUILLE restent proposés en premier (`suggestions`, plus bas).
  useEffect(() => {
    if (saisie.trim().length < MINIMUM_ADRESSE) { setBan([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void chercherAdresses(saisie, ctrl.signal)
        .then((r) => setBan(r.adresses))
        .catch(() => { if (!ctrl.signal.aborted) setBan([]); });
    }, 250);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [saisie]);

  const suggestions: Suggestion[] = useMemo(() => {
    const out: Suggestion[] = immeublesQuiRepondent(saisie, connus).map((i) => ({
      cle: i.cle, libelle: i.libelle, codePostal: i.codePostal ?? '', commune: i.commune ?? '', nbBiens: i.lots.length, syndic: i.syndic,
    }));
    const vues = new Set(out.map((s) => s.cle));
    for (const b of ban) {
      // Une adresse du portefeuille déjà proposée n'est pas répétée ; deux villes pour la même rue, si.
      const connu0 = parCle.get(b.cle);
      if (connu0 !== undefined && connu0.lots.length > 0 ? vues.has(b.cle) : vues.has(`${b.cle}|${b.commune}`)) continue;
      vues.add(`${b.cle}|${b.commune}`);
      const connu = parCle.get(b.cle);
      out.push({
        cle: b.cle, libelle: connu?.libelle ?? b.libelle, codePostal: connu?.codePostal ?? b.codePostal ?? '',
        commune: connu?.commune ?? b.commune, nbBiens: connu?.lots.length ?? 0, syndic: connu?.syndic ?? null,
      });
    }
    return out.filter((s) => !dejaLa.has(s.cle));
  }, [saisie, connus, ban, parCle, dejaLa]);

  const ajouter = (s: Suggestion): void => {
    onChange([...immeubles, { libelle: s.libelle, codePostal: s.codePostal, commune: s.commune }]);
    setSaisie(''); setBan([]); setAPrendre(null);
  };
  /** Une copropriété d'un AUTRE syndic ne se prend qu'après confirmation. */
  const choisir = (s: Suggestion): void => {
    if (s.syndic !== null && s.syndic.id !== syndicId) { setAPrendre(s); return; }
    ajouter(s);
  };

  return (
    <div className="fsy-bloc">
      {/* 🔴 LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — LA LISTE DES COPROPRIÉTÉS DÉJÀ RATTACHÉES TIENT EN UNE LIGNE,
          repliée à l'ouverture de la fiche, au format des lignes repliées (fond gris clair, ▸ à droite). Un clic la
          déplie juste dessous, telle qu'avant ; un nouveau clic la replie. Aucune copropriété : « (0) », non dépliable.
          ⚠️ « + Ajouter une copropriété » reste visible SOUS la ligne : il n'est pas une copropriété « déjà rattachée »,
          et son masquage n'a pas été demandé. */}
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
                    <span>{affiche}</span>
                    <span className="fsy-discret">{motContacts(suivent.length)} · {motBiens(c?.lots.length ?? 0)}</span>
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
                          <strong>{nomAffiche(x)}</strong>
                          {valeurDuChoix(x.titreChoix, x.titreLibre) !== '' && prenomNom(x.prenom, x.nom) !== '' && (
                            <span className="fsy-discret"> · {valeurDuChoix(x.titreChoix, x.titreLibre)}</span>
                          )}
                        </span>
                        {x.tousImmeubles
                          ? <span className="fsy-commun" title="Ce contact suit tous les immeubles du syndic">commun</span>
                          : x.cle === enModification
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
                            <span>{nomAffiche(x)}{valeurDuChoix(x.titreChoix, x.titreLibre) && prenomNom(x.prenom, x.nom) ? ` · ${valeurDuChoix(x.titreChoix, x.titreLibre)}` : ''}</span>
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
      <label className="fsy-champ">
        <span>+ Ajouter une copropriété (immeuble)</span>
        <input type="text" value={saisie} onChange={(e) => { setSaisie(e.target.value); setAPrendre(null); }}
          placeholder="ex. 25 rue Edith Cavell" autoComplete="off" />
      </label>
      {aPrendre !== null && (
        <div className="fsy-alerte" role="group" aria-label="Confirmer la reprise de la copropriété">
          <p className="fsy-sans-marge">
            <strong>{adresseImmeuble(aPrendre.libelle, aPrendre.codePostal, aPrendre.commune)}</strong> est déjà rattachée à
            {' '}<strong>{aPrendre.syndic !== null ? nomAvecVille(aPrendre.syndic.nom, aPrendre.syndic.ville) : ''}</strong>. La prendre ? L’ancien lien passera en historique.
          </p>
          <div className="fsy-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn fsy-mini-btn" onClick={() => setAPrendre(null)}>Non</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn fsy-mini-btn" onClick={() => ajouter(aPrendre)}>Oui, la prendre</button>
          </div>
        </div>
      )}
      {aPrendre === null && suggestions.length > 0 && (
        <ul className="fsy-liste" aria-label="Adresses proposées">
          {suggestions.map((s, i) => (
            <li key={`${i}-${s.cle}-${s.commune}`}>
              <button type="button" className="fsy-proposition" onClick={() => choisir(s)}>
                <span className="fsy-proposition-adresse">{adresseImmeuble(s.libelle, s.codePostal, s.commune)}</span>
                <span className="fsy-discret">
                  {motBiensEnGestion(s.nbBiens)}
                  {s.syndic !== null && s.syndic.id !== syndicId && <> · <strong>déjà rattachée à {nomAvecVille(s.syndic.nom, s.syndic.ville)}</strong></>}
                  {s.syndic !== null && s.syndic.id === syndicId && ' · déjà rattachée à ce syndic'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {aPrendre === null && saisie.trim() !== '' && !dejaLa.has(cleImmeuble(saisie)) && (
        <button type="button" className="fsy-lien-bouton fsy-ajout"
          onClick={() => choisir({ cle: cleImmeuble(saisie), libelle: saisie.trim(), codePostal: '', commune: '', nbBiens: 0, syndic: parCle.get(cleImmeuble(saisie))?.syndic ?? null })}>
          Ajouter « {saisie.trim()} » tel quel
        </button>
      )}
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
/* LOT SYNDIC-MODALE-DEUX-BLOCS — deux cadres arrondis, un fond à peine différent de la modale, un espace net entre eux. */
.fsy-deux-blocs{gap:1rem}
.fsy-cadre{display:flex;flex-direction:column;gap:.45rem;padding:10px 12px 12px;border:1px solid var(--color-svv-line);border-radius:12px;
  background:color-mix(in srgb, var(--color-svv-field) 45%, var(--color-svv-surface))}
.fsy-cadre-titre{margin:0 0 .1rem}
.fsy-copros-ligne--vide{cursor:default}
.fsy-copro-tete{flex:1 1 16rem;min-width:0;min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:.5rem;
  border:0;background:transparent;color:var(--color-svv-ink);font:inherit;text-align:left;cursor:pointer;padding:0}
.fsy-copro-contacts{flex:1 1 100%;display:flex;flex-direction:column;gap:.3rem;padding:.3rem 0 .2rem;border-top:1px solid var(--color-svv-line)}
.fsy-commun{margin-left:auto;padding:0 .45rem;border-radius:999px;border:1px solid var(--color-svv-line-strong);font-size:.72rem;color:var(--color-svv-muted)}
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
.fsy-copro-adresse{display:flex;flex-direction:column;min-width:0;font-size:.9rem}
.fsy-confirmer{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;font-size:.84rem}
.fsy-proposition{width:100%;min-height:40px;display:flex;flex-direction:column;align-items:flex-start;gap:.05rem;text-align:left;
  border:1px solid var(--color-svv-line);border-radius:8px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;padding:5px 10px;cursor:pointer}
.fsy-proposition:hover,.fsy-proposition:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.fsy-proposition-adresse{font-size:.9rem}
.fsy-ajout{align-self:flex-start}
.fsy-biens summary,.fsy-historique summary{cursor:pointer;font-size:.84rem;font-weight:700;color:var(--color-svv-muted);min-height:28px}
.fsy-historique ul{margin:.25rem 0 0;padding-left:1.1rem;font-size:.84rem}
.fsy-trace{margin:0}
.fsy-supprimer{display:flex;flex-direction:column;gap:.4rem;padding:8px 10px;border-radius:8px;border:1px solid var(--color-svv-red);font-size:.86rem}
.fsy-supprimer p{margin:0}
.fsy-supprimer-lien{align-self:flex-start;color:var(--color-svv-muted)}
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
