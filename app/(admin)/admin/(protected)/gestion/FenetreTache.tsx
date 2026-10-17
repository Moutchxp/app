'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cleRappel, echeanceLisible, horodatageLisible, iconeType, MENTION_SANS_ACCES_GESTION, verifierSaisie, type ChampTache, jourParisDe, motRappel, phraseTrace, rappelsParDefaut, rappelsProposes,
  type Rappel,
} from '../../../../lib/gestion/taches';
import { blocContacts, type ContactSource } from '../../../../lib/gestion/contactsTache';
import {
  agirSurTache, creerTache, lireCollaborateurs, lireContactsDuBien, lireDetailTache, lireEvenementsDuBien,
  lireEvenementsProposes, type CollaborateurEcran, type DetailTache, type EvenementPropose, type GesteTache, type SaisieEcran,
} from './tachesClient';
import { CSS_TACHES } from './LigneTache';
import { BADGE_ACCEPTATION, mentionMail, type AcceptationTache } from '../../../../lib/gestion/acceptationTache';
/* 🔴 LOT GESTION-INVITATIONS-TACHES — plusieurs invités par tâche : la même liste que la carte. */
import { CSS_INVITES_TACHE, InvitesTache } from './InvitesTache';
import { ChoixContacts, ContactsAffiches, CSS_CONTACTS_TACHE, type ContactPropose } from './ContactsTache';
/* 🔴 LOT TACHES-PIECES-DRIVE — le sélecteur Drive en LECTURE SEULE des tâches. */
import { SelecteurDriveTache, type FichierChoisi } from './SelecteurDriveTache';
/* 🔴 LOT TACHES-AGENDA — la durée d'un rendez-vous (1 h par défaut) et l'état « Agenda » du détail. */
import { DUREE_DEFAUT_MINUTES, DUREES_PROPOSEES, motDuree } from '../../../../lib/gestion/agendaTache';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LA FENÊTRE D'UNE TÂCHE : CRÉER, ET LE DÉTAIL (MODIFIER, ANNULER, ROUVRIR) ═══════════════
 *
 * Arno : « Le bouton ouvre une fenêtre de création : objet, date, heure facultative, personne à qui elle est
 * confiée (moi par défaut), note libre, événement du bien lié (facultatif), rappels. » et « Modifier et Annuler
 * restent accessibles dans le détail de la tâche. »
 *
 * 🔴 UNE SEULE FENÊTRE POUR LES DEUX : le formulaire de création EST celui de la modification. Deux formulaires
 * finiraient par ne plus proposer les mêmes champs.
 *
 * 🔴 RAPPELS PAR DÉFAUT D'ARNO : rendez-vous (avec heure) = la veille + 1 h avant ; repère (sans heure) = le jour
 * même à 9 h. Ajouter ou retirer l'heure remet les rappels par défaut de la nouvelle nature — un « 1 h avant » n'a
 * pas de sens sur un repère de la journée.
 *
 * 🔴 ANNULER DEMANDE UNE CONFIRMATION, DANS LA FENÊTRE (pas de boîte du navigateur) ; une tâche annulée reste en
 * base, grisée, avec sa trace — et « Rouvrir » la remet à faire.
 *
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS DU BIEN DANS LA TÂCHE ═══════════════════════════════════════════════════
 * Section « Contacts de la tâche » entre « Événement du bien lié » et « Rappels » (aucun coché par défaut). Sous la
 * note, l'aperçu du bloc « Contacts » GÉNÉRÉ : il se refait à chaque case, et la note n'est jamais touchée. Dans le
 * détail, les contacts copiés avec leurs liens (tel:, Nouveau message) et « Mettre à jour » quand la fiche a changé.
 * Sans la migration 347 (contacts illisibles), rien de tout cela ne s'affiche : la fenêtre est celle du lot 1.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export type ModeFenetre =
  | { sorte: 'creer'; lotId: number; lotCle: string; adresse: string }
  | { sorte: 'detail'; id: number };

export function FenetreTache({ mode, onFermer, onEcrire, onCree }: {
  mode: ModeFenetre;
  onFermer: () => void;
  /** Ouvre le composeur « Nouveau message » avec l'adresse pré-remplie. Rien n'est envoyé. Absent ⇒ adresse en texte. */
  onEcrire?: (email: string) => void;
  /** 🔴 Une tâche vient d'être CRÉÉE : la fenêtre se ferme, et l'appelant AFFICHE la confirmation (jamais en silence). */
  onCree?: (confirmation: string) => void;
}) {
  /** `invites` : la migration 365 est là — la fenêtre propose « Inviter aussi » (plusieurs invités par tâche). */
  const [collab, setCollab] = useState<{ liste: CollaborateurEcran[]; moi: number | null; invites?: boolean } | null>(null);
  const [detail, setDetail] = useState<DetailTache | null>(null);
  /** 🔴 LOT TACHES-1-BIS — les contacts du bien (fiche d'aujourd'hui) ; `null` ⇒ section absente. */
  const [sources, setSources] = useState<ContactSource[] | null>(null);
  const [choisis, setChoisis] = useState<string[]>([]);
  /** 🔴 LOT TACHES-PIECES-DRIVE — à la création : les fichiers choisis (envoyés avec la tâche) ; le sélecteur. */
  const [piecesChoisies, setPiecesChoisies] = useState<FichierChoisi[]>([]);
  const [selecteurDrive, setSelecteurDrive] = useState(false);
  const [evenements, setEvenements] = useState<{ id: number; reference: string; objet: string; ouvert: boolean }[]>([]);
  /** 🔴 LOT GESTION-TACHES-EVENEMENTS — `null` = pas de sélecteur (migration 366 absente, ou lecture impossible). */
  const [evProposes, setEvProposes] = useState<EvenementPropose[] | null>(null);
  const [saisie, setSaisie] = useState<SaisieEcran>(() => ({
    objet: '', jour: jourParisDe(new Date()), heure: null, note: '', confieeA: null, evenementId: null,
    rappels: rappelsParDefaut(false), dureeMinutes: null,
  }));
  const [occupe, setOccupe] = useState(false);
  /**
   * 🔴🔴 RÈGLE D'ARNO (13/10/2026) — « un refus, qu'il vienne du formulaire ou du serveur, affiche TOUJOURS un message
   * clair en français, à côté du champ concerné ET en haut de la fenêtre. Jamais de clic sans effet visible. »
   * `champ` désigne le champ fautif (`null` = la tâche entière) ; le message s'affiche en haut (bandeau, lu par les
   * lecteurs d'écran) ET sous ce champ, et la fenêtre remonte jusqu'au bandeau.
   */
  const [message, setMessage] = useState<{ ok: boolean; texte: string; champ?: ChampTache | null } | null>(null);
  const alerte = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message !== null && !message.ok) alerte.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);
  /** Le message sous un champ, quand le refus le concerne. */
  const erreurDe = (champ: ChampTache) => (message !== null && !message.ok && message.champ === champ
    ? <span className="tchf-erreur" role="alert">{message.texte}</span> : null);
  const invalide = (champ: ChampTache) => message !== null && !message.ok && message.champ === champ;
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [version, setVersion] = useState(0);
  const premier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const c = await lireCollaborateurs();
      if (annule) return;
      setCollab(c === null ? { liste: [], moi: null } : { liste: c.collaborateurs, moi: c.moi, invites: c.invites === true });
      if (mode.sorte === 'creer' && c !== null) {
        // MOI PAR DÉFAUT — si j'ai un compte avec l'accès Gestion ; sinon le premier de la liste.
        const moi = c.collaborateurs.find((x) => x.id === c.moi)?.id ?? c.collaborateurs[0]?.id ?? null;
        setSaisie((s) => ({ ...s, confieeA: s.confieeA ?? moi }));
      }
    })();
    return () => { annule = true; };
  }, [mode.sorte]);

  useEffect(() => {
    if (mode.sorte !== 'detail') return;
    let annule = false;
    void (async () => {
      const d = await lireDetailTache(mode.id);
      if (annule) return;
      setDetail(d);
      if (d !== null && version === 0) {
        const t = d.tache;
        setSaisie({
          objet: t.objet, jour: t.jour, heure: t.heure, note: t.note ?? '', confieeA: t.confieeA,
          evenementId: t.evenement?.id ?? null, rappels: t.rappels,
          ...(t.dureeMinutes !== undefined ? { dureeMinutes: t.dureeMinutes } : {}),
          ...(t.invites !== undefined
            ? { invites: t.invites.filter((i) => !i.principal && i.collaborateurId !== null).map((i) => Number(i.collaborateurId)) } : {}),
          ...(t.evenements !== undefined ? { evenements: t.evenements.map((e) => e.id) } : {}),
        });
        setChoisis(d.contacts.map((c) => c.cle));
      }
    })();
    return () => { annule = true; };
    // `version` relit le détail (trace comprise) après un geste, sans écraser une saisie en cours.
  }, [mode, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const lotCle = mode.sorte === 'creer' ? mode.lotCle : detail?.tache.lotCle ?? null;
  useEffect(() => {
    if (lotCle === null) return;
    let annule = false;
    void lireEvenementsDuBien(lotCle).then((e) => { if (!annule) setEvenements(e); });
    /* 🔴 LOT GESTION-TACHES-EVENEMENTS — les événements en cours qu'on peut rattacher (ceux du bien d'abord). */
    void lireEvenementsProposes(lotCle).then((e) => { if (!annule) setEvProposes(e); });
    return () => { annule = true; };
  }, [lotCle]);

  const lotId = mode.sorte === 'creer' ? mode.lotId : detail?.tache.lotId ?? null;
  useEffect(() => {
    if (lotId === null) return;
    let annule = false;
    void lireContactsDuBien(lotId).then((c) => { if (!annule) setSources(c); });
    return () => { annule = true; };
  }, [lotId, version]);

  useEffect(() => { premier.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFermer]);

  const tache = detail?.tache ?? null;
  const terminee = tache !== null && tache.etat !== 'a_faire';
  const lectureSeule = mode.sorte === 'detail' && (tache === null || terminee);

  const changerHeure = (h: string) => setSaisie((s) => {
    const heure = h === '' ? null : h;
    // Changer de NATURE (journée ↔ rendez-vous) remet les rappels par défaut de la nouvelle nature.
    const rappels = (heure === null) !== (s.heure === null) ? rappelsParDefaut(heure !== null) : s.rappels;
    return { ...s, heure, rappels, ...(heure === null && s.dureeMinutes !== undefined ? { dureeMinutes: null } : {}) };
  });

  const basculerRappel = (r: Rappel) => setSaisie((s) => {
    const k = cleRappel(r);
    const deja = s.rappels.some((x) => cleRappel(x) === k);
    return { ...s, rappels: deja ? s.rappels.filter((x) => cleRappel(x) !== k) : [...s.rappels, r] };
  });

  /* 🔴 LOT TACHES-1-BIS — ce qu'on propose à la case : la fiche d'aujourd'hui, PLUS les contacts déjà copiés qui n'y
     sont plus (syndic changé, locataire sorti) — leur copie reste lisible et décochable, rien ne s'efface. */
  const copies = detail?.contacts ?? [];
  const proposes: ContactPropose[] = sources === null ? [] : [
    ...sources,
    ...copies.filter((c) => !sources.some((x) => x.cle === c.cle)).map((c) => ({ ...c, plusLie: true })),
  ];
  /* Le bloc « Contacts » tel qu'il sera écrit : la COPIE pour un contact déjà dans la tâche, la fiche sinon. */
  const pourLeBloc = choisis
    .map((cle) => copies.find((c) => c.cle === cle) ?? sources?.find((c) => c.cle === cle))
    .filter((c): c is ContactSource => c !== undefined);
  const basculerContact = (cle: string) =>
    setChoisis((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]));

  const enregistrer = async () => {
    const refus = verifierSaisie(saisie);
    if (refus !== null) { setMessage({ ok: false, texte: refus.message, champ: refus.champ }); return; }
    setOccupe(true);
    setMessage(null);
    // Les contacts ne voyagent que si la section existe : sans elle, ils ne sont pas touchés.
    const avecContacts0: SaisieEcran = sources === null ? saisie : { ...saisie, contacts: choisis };
    /* 🔴 LOT GESTION-INVITATIONS-TACHES — les autres invités ne voyagent que si le serveur sait les recevoir (365). */
    const avecContacts1: SaisieEcran = collab?.invites === true
      ? { ...avecContacts0, invites: (avecContacts0.invites ?? []).filter((id) => id !== avecContacts0.confieeA) }
      : Object.fromEntries(Object.entries(avecContacts0).filter(([k]) => k !== 'invites')) as SaisieEcran;
    /* 🔴 LOT GESTION-TACHES-EVENEMENTS — les événements ne voyagent que si le sélecteur est là (migration 366). */
    const avecContacts: SaisieEcran = evProposes !== null
      ? { ...avecContacts1, evenements: avecContacts1.evenements ?? [] }
      : Object.fromEntries(Object.entries(avecContacts1).filter(([k]) => k !== 'evenements')) as SaisieEcran;
    const envoi: SaisieEcran = mode.sorte === 'creer' && piecesChoisies.length > 0
      ? { ...avecContacts, pieces: piecesChoisies.map((p) => p.id) } : avecContacts;
    const r = mode.sorte === 'creer'
      ? await creerTache(mode.lotId, envoi)
      : await agirSurTache(mode.id, { geste: 'modifier', ...envoi });
    setOccupe(false);
    if (!r.ok) { setMessage({ ok: false, texte: r.message, champ: r.champ ?? null }); return; }
    if (mode.sorte === 'creer') {
      /* 🔴 LOT TACHES-ACCEPTATION — confiée à un collègue : la confirmation dit aussi « en attente d'acceptation » et l'état
         du mail (« mail non envoyé (envoi désactivé) » tant que le réglage est coupé). */
      const suite = r.message.startsWith('Tâche créée, ') ? ` — ${r.message.slice('Tâche créée, '.length).replace(/\.$/, '')}` : '';
      onCree?.(`Tâche créée : « ${saisie.objet.trim()} » — ${echeanceLisible(saisie.jour, saisie.heure)}${suite}.`);
      onFermer();
      return;
    }
    setMessage({ ok: true, texte: r.message });
    setVersion((v) => v + 1);
  };

  const mettreAJour = async (cle: string) => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, { geste: 'actualiserContact', cle });
    setOccupe(false);
    setMessage({ ok: r.ok, texte: r.message });
    if (r.ok) setVersion((v) => v + 1);
  };
  /** Dans le DÉTAIL, ajouter ou retirer une pièce est un geste immédiat, tracé — comme « Mettre à jour » un contact. */
  const gestePiece = async (g: { geste: 'ajouterPieces'; pieces: string[] } | { geste: 'retirerPiece'; driveId: string }) => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, g);
    setOccupe(false);
    setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.message, champ: r.champ ?? 'pieces' });
    if (r.ok) setVersion((v) => v + 1);
  };
  const choisirPieces = (f: FichierChoisi[]) => {
    if (mode.sorte === 'detail') { void gestePiece({ geste: 'ajouterPieces', pieces: f.map((x) => x.id) }); return; }
    setPiecesChoisies((l) => [...l, ...f.filter((x) => !l.some((y) => y.id === x.id))]);
  };
  const ecrire = onEcrire === undefined ? undefined : (email: string) => { onFermer(); onEcrire(email); };

  const renvoyer = async () => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, { geste: 'renvoyerDemande' });
    setOccupe(false);
    setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.message, champ: r.champ ?? null });
    if (r.ok) setVersion((v) => v + 1);
  };

  /** 🔴 LOT GESTION-INVITATIONS-TACHES — un geste sur un invité (changer le destinataire…), puis relecture. */
  const agirInvite = async (g: GesteTache) => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, g);
    setOccupe(false);
    setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.message, champ: r.champ ?? null });
    if (r.ok) setVersion((v) => v + 1);
  };

  const reessayerAgenda = async () => {
    if (mode.sorte !== 'detail') return;
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(mode.id, { geste: 'reessayerAgenda' });
    setOccupe(false);
    setMessage(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.message, champ: null });
    setVersion((v) => v + 1);
  };

  const geste = async (g: 'annuler' | 'rouvrir') => {
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache((mode as { id: number }).id, { geste: g });
    setOccupe(false);
    setConfirmerAnnulation(false);
    setMessage({ ok: r.ok, texte: r.message });
    if (r.ok) setVersion((v) => v + 1);
  };

  const titre = mode.sorte === 'creer' ? 'Nouvelle tâche' : 'Tâche';
  const adresse = mode.sorte === 'creer' ? mode.adresse : tache?.adresseBien ?? '';

  return (
    <div className="tchf-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_TACHES}{CSS_FENETRE}{CSS_CONTACTS_TACHE}</style>
      {selecteurDrive && lotId !== null && (
        <SelecteurDriveTache lotId={lotId} onChoisir={choisirPieces} onFermer={() => setSelecteurDrive(false)} />
      )}
      <div className="tchf" role="dialog" aria-modal="true" aria-labelledby="tchf-titre">
        <header className="tchf-tete">
          <h2 className="tchf-titre" id="tchf-titre">
            {titre}
            {adresse !== '' && <span className="tchf-adresse"> — {adresse}</span>}
          </h2>
          <button type="button" className="tchf-croix" onClick={onFermer} aria-label="Fermer">×</button>
        </header>
        {message !== null && !message.ok && (
          <p ref={alerte} className="tchf-alerte" role="alert">{message.texte}</p>
        )}

        {mode.sorte === 'detail' && detail === null && <p className="tch-vide">Lecture de la tâche…</p>}
        {/* 🔴 PARTIE A — dans le détail : l'ÉCHÉANCE en évidence, et la création en PETIT, en dessous. */}
        {tache !== null && (
          <p className="tchf-echeance">
            <b>{echeanceLisible(tache.jour, tache.heure)}</b>
            {terminee && <span className="tchf-etat"> — {tache.etat === 'faite' ? 'Faite' : 'Annulée'}</span>}
          </p>
        )}
        {tache !== null && (
          <p className="tchf-creee">Créée le {horodatageLisible(tache.creeLe)} par {tache.creeParLibelle}</p>
        )}
        {/* ══ 🔴🔴 LOT TACHES-ACCEPTATION — LE STATUT D'ACCEPTATION, et ce que le demandeur peut faire : renvoyer la
            demande, ou réattribuer (changer « Confiée à » puis enregistrer : une nouvelle demande part). */}
        {tache?.acceptation && (
          <div className="tchf-acceptation" data-acceptation={tache.acceptation.statut}>
            <p className="tchf-acceptation-ligne">
              <span className={`tch-badge tch-badge--${tache.acceptation.statut}`}>{BADGE_ACCEPTATION[tache.acceptation.statut]}</span>
              {' '}{phraseAcceptation(tache.acceptation)}
            </p>
            {tache.acceptation.statut === 'refusee' && tache.acceptation.motif && (
              <p className="tchf-acceptation-ligne">Motif du refus : {tache.acceptation.motif}</p>
            )}
            {!terminee && tache.acceptation.statut !== 'acceptee' && (
              <p className="tchf-acceptation-actions">
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
                  onClick={() => void renvoyer()}>
                  Renvoyer la demande
                </button>
                <span className="tchf-aide">Pour réattribuer : choisissez une autre personne dans « Confiée à », puis enregistrez.</span>
              </p>
            )}
          </div>
        )}

        {/* 🔴 LOT GESTION-INVITATIONS-TACHES — chaque invité, son état, « N acceptées sur M ». */}
        {tache !== null && (tache.invites ?? []).length > 0 && (
          <div className="tchf-acceptation tchf-invites">
            <style>{CSS_INVITES_TACHE}</style>
            <InvitesTache tache={tache} terminee={terminee} occupe={occupe} agir={agirInvite} />
          </div>
        )}

        {/* 🔴 LOT TACHES-AGENDA — l'état « Agenda » de la tâche ; un échec se dit, avec « Réessayer ». */}
        {tache?.agenda && (
          <div className={`tchf-agenda tch-agenda--${tache.agenda.etat}`} data-agenda={tache.agenda.etat}>
            <p className="tchf-acceptation-ligne">
              {tache.agenda.texte}{tache.agenda.motif ? ` — ${tache.agenda.motif}` : ''}
            </p>
            {tache.agenda.peutReessayer && (
              <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
                onClick={() => void reessayerAgenda()}>
                Réessayer
              </button>
            )}
          </div>
        )}

        <div className="tchf-corps">
          <label className="tchf-champ">
            <span className="tch-etiquette">Objet</span>
            <input ref={premier} type="text" value={saisie.objet} maxLength={300} disabled={lectureSeule}
              aria-invalid={invalide('objet') || undefined}
              onChange={(e) => setSaisie((s) => ({ ...s, objet: e.target.value }))} />
            {erreurDe('objet')}
          </label>
          <div className="tchf-rangee">
            <label className="tchf-champ">
              <span className="tch-etiquette">Date</span>
              <input type="date" value={saisie.jour} disabled={lectureSeule} aria-invalid={invalide('jour') || undefined}
                onChange={(e) => setSaisie((s) => ({ ...s, jour: e.target.value }))} />
              {erreurDe('jour')}
            </label>
            <label className="tchf-champ">
              <span className="tch-etiquette">Heure (facultative)</span>
              <input type="time" value={saisie.heure ?? ''} disabled={lectureSeule} aria-invalid={invalide('heure') || undefined}
                onChange={(e) => changerHeure(e.target.value)} />
              {erreurDe('heure')}
            </label>
          </div>
          <p className="tchf-aide">
            {saisie.heure === null ? 'Sans heure : repère sur la journée.' : 'Avec heure : rendez-vous.'}
          </p>
          {/* 🔴 LOT TACHES-AGENDA — « Durée » : seulement pour un rendez-vous ; 1 h par défaut (durée de l'événement
              dans l'agenda Google). */}
          {saisie.heure !== null && saisie.dureeMinutes !== undefined && (
            <label className="tchf-champ tchf-duree">
              <span className="tch-etiquette">Durée</span>
              <select value={saisie.dureeMinutes ?? DUREE_DEFAUT_MINUTES} disabled={lectureSeule} data-champ-duree
                onChange={(e) => setSaisie((s) => ({ ...s, dureeMinutes: Number(e.target.value) === DUREE_DEFAUT_MINUTES ? null : Number(e.target.value) }))}>
                {[...new Set([...DUREES_PROPOSEES, saisie.dureeMinutes ?? DUREE_DEFAUT_MINUTES])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>{motDuree(d)}{d === DUREE_DEFAUT_MINUTES ? ' (par défaut)' : ''}</option>
                ))}
              </select>
            </label>
          )}
          <label className="tchf-champ">
            <span className="tch-etiquette">Confiée à</span>
            <select value={saisie.confieeA ?? ''} disabled={lectureSeule || collab === null}
              aria-invalid={invalide('confieeA') || undefined}
              onChange={(e) => setSaisie((s) => ({ ...s, confieeA: e.target.value === '' ? null : Number(e.target.value) }))}>
              {saisie.confieeA === null && <option value="">— choisir —</option>}
              {(collab?.liste ?? []).map((c) => (
                /* 🔴 RÈGLE D'ARNO DU 13/10/2026 — toute personne active de notre Workspace, moi en tête (ordre du serveur) ;
                   sans la tuile Gestion, elle est proposée AVEC la mention, qui dit où elle verra la tâche. */
                <option key={c.id} value={c.id}>
                  {c.libelle}{c.id === collab?.moi ? ' (moi)' : ''}{c.accesGestion === false ? ` ${MENTION_SANS_ACCES_GESTION}` : ''}
                </option>
              ))}
              {/* Une tâche confiée à quelqu'un qui n'a plus l'accès reste lisible : son nom figé. */}
              {tache !== null && tache.confieeA !== null && !(collab?.liste ?? []).some((c) => c.id === tache.confieeA) && (
                <option value={tache.confieeA}>{tache.confieeALibelle}</option>
              )}
            </select>
            {erreurDe('confieeA')}
          </label>
          {/* 🔴 LOT GESTION-INVITATIONS-TACHES — « Inviter aussi » : d'autres collaborateurs, chacun SA propre invitation (son
              lien, sa réponse). Seulement quand le serveur sait les recevoir (migration 365). */}
          {collab?.invites === true && (
            <fieldset className="tchf-champ tchf-invites-choix" disabled={lectureSeule}>
              <legend className="tch-etiquette">Inviter aussi (chacun reçoit sa propre invitation)</legend>
              <div className="tchf-rappels">
                {collab.liste.filter((c) => c.id !== saisie.confieeA).map((c) => (
                  <label key={c.id} className="tchf-case">
                    <input type="checkbox" data-invite-choix={c.id} checked={(saisie.invites ?? []).includes(c.id)}
                      onChange={() => setSaisie((s) => {
                        const l = s.invites ?? [];
                        return { ...s, invites: l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id] };
                      })} />
                    {c.libelle}{c.id === collab.moi ? ' (moi)' : ''}
                  </label>
                ))}
              </div>
              {erreurDe('invites')}
            </fieldset>
          )}
          <label className="tchf-champ">
            <span className="tch-etiquette">Événement du bien lié (facultatif)</span>
            <select value={saisie.evenementId ?? ''} disabled={lectureSeule}
              onChange={(e) => setSaisie((s) => ({ ...s, evenementId: e.target.value === '' ? null : Number(e.target.value) }))}>
              <option value="">Aucun</option>
              {evenements.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.reference} — {ev.objet}{ev.ouvert ? '' : ' (clos)'}</option>
              ))}
              {tache?.evenement && !evenements.some((ev) => ev.id === tache.evenement?.id) && (
                <option value={tache.evenement.id}>{tache.evenement.reference} — {tache.evenement.objet}</option>
              )}
            </select>
            {erreurDe('evenementId')}
          </label>
          {/* ══ 🔴🔴 LOT GESTION-TACHES-EVENEMENTS — RATTACHER À UN OU PLUSIEURS ÉVÉNEMENTS EN COURS (Arno). Ceux du bien
              d'abord. Décocher retire le rattachement (tracé, jamais effacé). Un rattachement déjà posé à un événement
              clos depuis reste listé, pour pouvoir le retirer. Le champ « Événement du bien lié » au-dessus ne change pas. */}
          {evProposes !== null && (
            <ChoixEvenements proposes={evProposes} rattaches={tache?.evenements ?? []} choisis={saisie.evenements ?? []}
              desactive={lectureSeule}
              onBasculer={(id) => setSaisie((s) => {
                const l = s.evenements ?? [];
                return { ...s, evenements: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] };
              })} />
          )}
          {erreurDe('evenements')}
          {sources !== null && (
            <ChoixContacts proposes={proposes} choisis={choisis} onBasculer={basculerContact} desactive={lectureSeule} />
          )}
          {erreurDe('contacts')}

          {/* ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — PIÈCES JOINTES, entre « Contacts de la tâche » et « Rappels » (Arno).
              Des RÉFÉRENCES au Drive : on ouvre le fichier dans le Drive ; « Retirer » l'enlève de la TÂCHE, jamais
              du Drive. */}
          {lotId !== null && (
            <div className="tchf-champ tchf-pieces">
              <span className="tch-etiquette">Pièces jointes</span>
              <ul className="tchf-pieces-liste">
                {(mode.sorte === 'detail' ? (detail?.pieces ?? []).map((p) => ({ id: p.driveId, nom: p.nom, typeMime: p.typeMime ?? '', lien: p.lien }))
                  : piecesChoisies).map((p) => (
                  <li key={p.id} className="tchf-piece" data-piece={p.id}>
                    <span aria-hidden="true">{iconeType(p.typeMime)}</span>
                    {p.lien
                      ? <a className="tchc-lien" href={p.lien} target="_blank" rel="noopener noreferrer">{p.nom} ↗</a>
                      : <span>{p.nom}</span>}
                    {!lectureSeule && (
                      <button type="button" className="svv-btn svv-btn-outline gst-btn tchf-retirer" disabled={occupe}
                        title="Retirer de la tâche (le fichier du Drive n’est pas touché)"
                        onClick={() => (mode.sorte === 'detail'
                          ? void gestePiece({ geste: 'retirerPiece', driveId: p.id })
                          : setPiecesChoisies((l) => l.filter((x) => x.id !== p.id)))}>
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!lectureSeule && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn tchf-ajout-piece" disabled={occupe}
                  onClick={() => setSelecteurDrive(true)}>
                  + Pièce jointe (Drive)
                </button>
              )}
              {erreurDe('pieces')}
            </div>
          )}
          <fieldset className="tchf-rappels" disabled={lectureSeule}>
            <legend className="tch-etiquette">Rappels</legend>
            {rappelsProposes(saisie.heure !== null).map((r) => (
              <label key={cleRappel(r)} className="tchf-case">
                <input type="checkbox" checked={saisie.rappels.some((x) => cleRappel(x) === cleRappel(r))}
                  onChange={() => basculerRappel(r)} />
                {motRappel(r)}
              </label>
            ))}
          </fieldset>
          <label className="tchf-champ">
            <span className="tch-etiquette">Note</span>
            <textarea rows={3} value={saisie.note} maxLength={5000} disabled={lectureSeule}
              aria-invalid={invalide('note') || undefined}
              onChange={(e) => setSaisie((s) => ({ ...s, note: e.target.value }))} />
            {erreurDe('note')}
          </label>
          {/* 🔴 LOT TACHES-1-BIS — le bloc « Contacts » GÉNÉRÉ, à la suite de la note : texte de la tâche = note +
              ce bloc. Il se refait à chaque case cochée ou décochée ; la note, au-dessus, n'est jamais touchée. */}
          {sources !== null && pourLeBloc.length > 0 && (
            <div className="tchf-champ">
              <span className="tch-etiquette">Texte de la tâche — bloc « Contacts » (généré)</span>
              <pre className="tchc-apercu" data-bloc-contacts>{blocContacts(pourLeBloc)}</pre>
            </div>
          )}

          {detail !== null && (
            <ContactsAffiches contacts={detail.contacts} sources={sources} onEcrire={ecrire}
              onMettreAJour={terminee ? undefined : (cle) => void mettreAJour(cle)} occupe={occupe} />
          )}

          {detail !== null && detail.traces.length > 0 && (
            <section className="tchf-trace" aria-label="Historique de la tâche">
              <h3 className="tch-etiquette">Historique</h3>
              <ul>
                {detail.traces.map((t, i) => <li key={i}>{phraseTrace(t)}</li>)}
              </ul>
            </section>
          )}
        </div>

        {message && <p className={`tch-message${message.ok ? '' : ' tch-message--erreur'}`} role="status">{message.texte}</p>}

        <footer className="tchf-pied">
          {!lectureSeule && (
            <button type="button" className="svv-btn gst-btn tch-btn" disabled={occupe} onClick={() => void enregistrer()}>
              {/* Le clic a TOUJOURS un effet visible : le bouton dit qu'il travaille tant que le serveur n'a pas répondu. */}
              {occupe ? 'Enregistrement…' : mode.sorte === 'creer' ? 'Créer la tâche' : 'Enregistrer les modifications'}
            </button>
          )}
          {mode.sorte === 'detail' && tache !== null && !terminee && (
            confirmerAnnulation ? (
              <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn tchf-danger" disabled={occupe}
                  onClick={() => void geste('annuler')}>
                  Confirmer l’annulation
                </button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn"
                  onClick={() => setConfirmerAnnulation(false)}>
                  Ne pas annuler
                </button>
              </>
            ) : (
              <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
                onClick={() => setConfirmerAnnulation(true)}>
                Annuler la tâche
              </button>
            )
          )}
          {mode.sorte === 'detail' && terminee && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
              onClick={() => void geste('rouvrir')}>
              Rouvrir
            </button>
          )}
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" onClick={onFermer}>Fermer</button>
        </footer>
      </div>
    </div>
  );
}

/* ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous. */
const CSS_FENETRE = `
.tchf-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;
  padding:2vh 16px;background:rgba(0,0,0,.45)}
.tchf{display:flex;flex-direction:column;gap:10px;width:min(560px,100%);max-height:94vh;overflow:auto;padding:14px;
  border:1px solid var(--color-svv-line);border-radius:.8rem;background:var(--color-svv-surface);
  box-shadow:0 18px 50px rgba(0,0,0,.28);color:var(--color-svv-ink)}
.tchf-tete{display:flex;align-items:flex-start;gap:10px}
.tchf-titre{flex:1 1 auto;min-width:0;margin:0;font-size:1rem;font-weight:700;overflow-wrap:anywhere}
.tchf-adresse{font-weight:500;color:var(--color-svv-muted)}
.tchf-croix{flex:0 0 auto;min-width:44px;min-height:44px;font-size:1.3rem;line-height:1;background:none;
  border:1px solid transparent;border-radius:.5rem;color:var(--color-svv-ink);cursor:pointer}
.tchf-croix:hover{background:var(--color-svv-field)}
.tchf-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tchf-echeance{margin:0;font-size:1.05rem;color:var(--color-svv-ink)}
.tchf-creee{margin:-6px 0 0;font-size:.76rem;color:var(--color-svv-muted)}
.tchf-etat{font-weight:600;color:var(--color-svv-muted)}
.tchf-corps{display:flex;flex-direction:column;gap:8px}
.tchf-rangee{display:flex;flex-wrap:wrap;gap:8px}
.tchf-rangee > .tchf-champ{flex:1 1 10rem}
.tchf-champ{display:flex;flex-direction:column;gap:3px;min-width:0}
.tch-etiquette{font-size:.78rem;font-weight:600;color:var(--color-svv-muted);margin:0}
.tchf-champ input,.tchf-champ select,.tchf-champ textarea{min-height:44px;padding:.4rem .5rem;border:1px solid var(--color-svv-line-strong);
  border-radius:.4rem;background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;width:100%;box-sizing:border-box}
.tchf-champ textarea{min-height:5rem;resize:vertical}
.tchf-aide{margin:-2px 0 0;font-size:.8rem;color:var(--color-svv-muted)}
.tchf-rappels{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;padding:6px 8px;border:1px solid var(--color-svv-line);
  border-radius:.5rem}
.tchf-case{display:inline-flex;align-items:center;gap:.4rem;min-height:36px;font-size:.88rem}
.tchf-trace ul{margin:4px 0 0;padding-left:1.1rem;font-size:.84rem;color:var(--color-svv-ink)}
.tchf-pied{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.tchf-alerte{margin:0;padding:8px 10px;border:1px solid var(--color-svv-red);border-left-width:4px;border-radius:.5rem;
  background:var(--color-svv-red-soft);color:var(--color-svv-ink);font-size:.88rem;font-weight:600}
.tchf-erreur{display:block;margin-top:2px;font-size:.8rem;font-weight:600;color:var(--color-svv-red)}
.tchf-champ [aria-invalid='true']{border-color:var(--color-svv-red);border-width:2px}
.tchf-pieces-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.tchf-piece{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;font-size:.88rem;overflow-wrap:anywhere}
.tchf-retirer{width:auto;min-height:36px;padding:0 .6rem;font-size:.8rem}
.tchf-ajout-piece{align-self:flex-start}
.tchf-acceptation{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border:1px solid var(--color-svv-line);border-radius:.5rem}
.tchf-acceptation-ligne{margin:0;font-size:.86rem;color:var(--color-svv-ink)}
.tchf-acceptation-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0}
.tchf-danger{color:var(--color-svv-red);border-color:var(--color-svv-red)}
.tchf-agenda{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--color-svv-line);border-radius:.5rem}
.tchf-agenda.tch-agenda--a_resynchroniser{border-color:var(--color-svv-red)}
.tchf-duree{max-width:14rem}
`;

/** La phrase du statut, dans le détail : qui, quand, et l'état du mail. PUR. */
function phraseAcceptation(a: AcceptationTache): string {
  if (a.statut === 'acceptee') {
    return a.automatique ? `d’office (tâche confiée à ${a.destinataireLibelle})`
      : `par ${a.reponduParLibelle ?? a.destinataireLibelle}${a.reponduLe ? ` le ${horodatageLisible(a.reponduLe)}` : ''}`;
  }
  if (a.statut === 'refusee') {
    return `par ${a.reponduParLibelle ?? a.destinataireLibelle}${a.reponduLe ? ` le ${horodatageLisible(a.reponduLe)}` : ''} — à réattribuer`;
  }
  const mail = mentionMail(a.mailEtat) ?? (a.mailEtat === 'envoye' ? 'mail envoyé' : null);
  return `— demande adressée à ${a.destinataireLibelle} par ${a.demandeurLibelle} le ${horodatageLisible(a.demandeLe)}${mail ? ` (${mail})` : ''}`;
}

/**
 * 🔴 LOT GESTION-TACHES-EVENEMENTS — LE SÉLECTEUR MULTIPLE DES ÉVÉNEMENTS EN COURS : « Événements de ce bien » d'abord,
 * puis « Autres événements en cours ». Des cases à cocher (tactiles, 36 px), une par événement.
 */
function ChoixEvenements({ proposes, rattaches, choisis, desactive, onBasculer }: {
  proposes: readonly EvenementPropose[];
  rattaches: readonly { id: number; reference: string; objet: string; ouvert: boolean }[];
  choisis: readonly number[];
  desactive: boolean;
  onBasculer: (id: number) => void;
}) {
  const clos = rattaches.filter((r) => !proposes.some((p) => p.id === r.id));
  const groupes: { titre: string; liste: { id: number; reference: string; objet: string; mention?: string }[] }[] = [
    { titre: 'Événements de ce bien', liste: proposes.filter((p) => p.duBien) },
    { titre: 'Autres événements en cours', liste: proposes.filter((p) => !p.duBien) },
    { titre: 'Rattachés, clos depuis', liste: clos.map((c) => ({ ...c, mention: ' (clos)' })) },
  ].filter((g) => g.liste.length > 0);
  return (
    <fieldset className="tchf-champ tchf-evenements" disabled={desactive}>
      <legend className="tch-etiquette">Rattacher à des événements en cours (plusieurs possibles)</legend>
      {groupes.length === 0 && <p className="tchf-aide">Aucun événement en cours.</p>}
      {groupes.map((g) => (
        <div key={g.titre} className="tchf-evenements-groupe">
          <p className="tchf-aide">{g.titre}</p>
          <div className="tchf-rappels">
            {g.liste.map((e) => (
              <label key={e.id} className="tchf-case">
                <input type="checkbox" data-evenement-choix={e.id} checked={choisis.includes(e.id)} onChange={() => onBasculer(e.id)} />
                {e.reference} — {e.objet}{e.mention ?? ''}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
