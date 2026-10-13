'use client';

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import {
  couleurTache, echeanceCompacte, echeanceLisible, horodatageLisible, iconeType, motCouleurTache, RACCOURCIS_DECALAGE,
  type PieceTache, type Tache,
} from '../../../../lib/gestion/taches';
import type { ContactSource, ContactTache } from '../../../../lib/gestion/contactsTache';
import { MOT_AGENDA_COURT } from '../../../../lib/gestion/agendaTache';
/* 🔴 LOT FICHE-CARTE-TACHE — un encadré par contact, au liseré de sa famille (source unique PARTIES). */
import { EncadresContacts } from './ContactsTache';
import { agirSurTache, ecouterTaches, lireDetailTache, type GesteTache } from './tachesClient';
import { BADGE_ACCEPTATION, mentionMail } from '../../../../lib/gestion/acceptationTache';

/**
 * ══ 🔴🔴 LOT TACHES-1 — UNE TÂCHE SUR UNE LIGNE, LA MÊME PARTOUT ═══════════════════════════════════════════════
 *
 * Arno : « Sur chaque tâche, dans n'importe quel écran […], deux actions directes : “Faite” et “Décaler” (+1 jour,
 * +2 jours, +1 semaine, ou une date et heure au choix). La couleur se recalcule aussitôt. Une seule et même
 * fonction partagée pour ces actions et pour la couleur. »
 *
 * 🔴 CE COMPOSANT EST CETTE FONCTION, À L'ÉCRAN : la fiche du bien et le récapitulatif général rendent TOUS DEUX
 * `LigneTache`. La couleur vient de `couleurTache` (module pur), les gestes de `agirSurTache` (une seule porte), et
 * le signal émis après chaque geste relit tous les blocs affichés. Un écran qui écrirait sa propre ligne finirait
 * par dire autre chose.
 *
 * 🔴 LA COULEUR NE PARLE JAMAIS SEULE : une pastille ET un mot (« En retard », « Aujourd'hui »…). Une tâche faite ou
 * annulée se grise et dit par qui et quand.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/**
 * L'HEURE DE L'ÉCRAN, relue chaque minute : la couleur dépend du JOUR, et un écran laissé ouvert passé minuit doit
 * repeindre ses tâches tout seul (la tâche de demain devient celle du jour).
 */
export function useMaintenant(): Date {
  const [m, setM] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setM(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return m;
}

/**
 * ══ 🔴🔴 LOT TACHES-LIGNES-COMPACTES (Arno, 13/10/2026) — QUELLES LIGNES SONT DÉPLIÉES ══════════════════════════════
 * Toutes repliées par défaut. L'état vit dans la LISTE (et non dans la ligne) : une tâche qui passe des « à faire » aux
 * « faites ou annulées » après une action change de liste, et doit rester dépliée pour qu'on voie le résultat.
 */
export function useLignesDepliees(): { estDepliee: (id: number) => boolean; basculer: (id: number) => void; ids: ReadonlySet<number> } {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const basculer = useCallback((id: number) => setIds((avant) => {
    const n = new Set(avant);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }), []);
  return { estDepliee: (id) => ids.has(id), basculer, ids };
}

export function LigneTache({ tache, maintenant, avecAdresse = false, onOuvrirBien, onDetail, presentation = 'compacte', sources = null, onEcrire, deplie = false, onBasculer }: {
  tache: Tache;
  maintenant: Date;
  /** Le récapitulatif général montre l'adresse du bien (cliquable) ; la fiche du bien, non — on y est déjà. */
  avecAdresse?: boolean;
  onOuvrirBien?: (lotId: number) => void;
  /** Ouvre la fenêtre « Tâche — <adresse> » sur cette tâche (clic sur l'objet, et « ✏ Modifier »). */
  onDetail: (id: number) => void;
  /** 🔴 LOT TACHES-LIGNES-COMPACTES — `compacte` (défaut, fiche ET récapitulatif) : deux lignes repliées, un clic
   *  déplie la CARTE en 4 blocs (`deplie`) ; `carte` : la carte d'emblée. */
  presentation?: 'compacte' | 'carte';
  /** La ligne est-elle dépliée (en carte) ? L'état est tenu par la liste (`useLignesDepliees`). */
  deplie?: boolean;
  onBasculer?: () => void;
  /** La fiche d'aujourd'hui (contacts du bien), pour « Mettre à jour » une copie ; `null` = pas de mention. */
  sources?: readonly ContactSource[] | null;
  onEcrire?: (email: string) => void;
}) {
  const couleur = couleurTache(tache, maintenant);
  const [decaler, setDecaler] = useState(false);
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [jour, setJour] = useState(tache.jour);
  const [heure, setHeure] = useState(tache.heure ?? '');

  const agir = async (g: GesteTache) => {
    setOccupe(true);
    setMessage(null);
    const r = await agirSurTache(tache.id, g);
    setOccupe(false);
    if (r.ok) { setDecaler(false); setConfirmerAnnulation(false); }
    setMessage({ ok: r.ok, texte: r.message });
  };

  /* 🔴 LOT TACHES-LIGNES-COMPACTES — le récapitulatif ne lit pas les contacts ni les pièces de chaque tâche : dépliée,
     la carte les demande au détail (la même route que la fenêtre), et les relit après chaque geste. */
  const [detail, setDetail] = useState<{ contacts: ContactTache[]; pieces: PieceTache[] } | null>(null);
  const aLire = deplie && tache.contacts === undefined;
  const [versionDetail, setVersionDetail] = useState(0);
  useEffect(() => (aLire ? ecouterTaches(() => setVersionDetail((v) => v + 1)) : undefined), [aLire]);
  useEffect(() => {
    if (!aLire) return;
    let annule = false;
    void lireDetailTache(tache.id).then((d) => { if (!annule && d !== null) setDetail({ contacts: d.contacts, pieces: d.pieces }); });
    return () => { annule = true; };
  }, [aLire, tache.id, versionDetail]);

  const terminee = tache.etat !== 'a_faire';
  const fin = tache.etat === 'faite'
    ? `Faite par ${tache.faiteParLibelle ?? '?'} le ${horodatageLisible(tache.faiteLe ?? '')}`
    : tache.etat === 'annulee'
      ? `Annulée par ${tache.annuleeParLibelle ?? '?'} le ${horodatageLisible(tache.annuleeLe ?? '')}`
      : null;

  const pastilleMot = (
    <span className="tch-pastille-mot">
      <span className={`tch-pastille tch-pastille--${couleur ?? 'terminee'}`} aria-hidden="true" />
      <span className="tch-mot">{couleur === null ? (tache.etat === 'faite' ? 'Faite' : 'Annulée') : motCouleurTache(tache, maintenant)}</span>
    </span>
  );
  /* 🔴 LOT TACHES-ACCEPTATION — LE STATUT D'ACCEPTATION, en badge ; une tâche d'avant le lot n'a pas de badge. */
  const badge = tache.acceptation && (
    <span className={`tch-badge tch-badge--${tache.acceptation.statut}`} data-acceptation={tache.acceptation.statut}
      title={tache.acceptation.statut === 'refusee' && tache.acceptation.motif ? `Motif : ${tache.acceptation.motif}` : undefined}>
      {BADGE_ACCEPTATION[tache.acceptation.statut]}
    </span>
  );

  /* L'événement lié : une capsule, sur la carte. */
  const ev = tache.evenement !== null && <span className="tch-ev">{tache.evenement.reference}</span>;

  /* ══ 🔴🔴 LOT FICHE-CARTE-TACHE — LES BOUTONS, LES MÊMES PARTOUT : « ✓ Tâche réalisée » (l'ancien « Faite », même
     geste), « Décaler », « ✏ Modifier » (la fenêtre de la tâche), « ✗ Tâche annulée » (confirmation d'abord : même
     annulation que dans la fenêtre — tracée, jamais supprimée, événement d'agenda retiré). Une tâche terminée ne
     garde que « ✏ Modifier », qui ouvre la fenêtre en lecture (« Rouvrir » y reste). */
  const actions = (
    <div className="tch-actions" data-ordre="actions">
      {!terminee && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
          onClick={() => void agir({ geste: 'faite' })}>
          {MOT_ACTION.realisee}
        </button>
      )}
      {!terminee && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
          aria-expanded={decaler}
          onClick={() => { setJour(tache.jour); setHeure(tache.heure ?? ''); setDecaler((v) => !v); }}>
          {MOT_ACTION.decaler}
        </button>
      )}
      <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" data-action="modifier"
        onClick={() => onDetail(tache.id)}>
        {MOT_ACTION.modifier}
      </button>
      {!terminee && !confirmerAnnulation && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn tch-btn-annuler" disabled={occupe}
          data-action="annuler" onClick={() => setConfirmerAnnulation(true)}>
          {MOT_ACTION.annulee}
        </button>
      )}
      {!terminee && confirmerAnnulation && (
        <span className="tch-confirmer" role="group" aria-label="Confirmer l’annulation">
          <span className="tch-confirmer-question">Annuler cette tâche ?</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn tch-btn-annuler" disabled={occupe}
            data-action="annuler-oui" onClick={() => void agir({ geste: 'annuler' })}>
            Oui
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
            data-action="annuler-non" onClick={() => setConfirmerAnnulation(false)}>
            Non
          </button>
        </span>
      )}
    </div>
  );

  const panneauDecaler = decaler && !terminee && (
    <div className="tch-decaler" role="group" aria-label="Décaler la tâche">
      {RACCOURCIS_DECALAGE.map((r) => (
        <button key={r.cle} type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe}
          onClick={() => void agir({ geste: 'decaler', raccourci: r.cle })}>
          {r.mot}
        </button>
      ))}
      <span className="tch-decaler-choix">
        <label className="tch-champ-court">
          <span className="tch-etiquette">Date</span>
          <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
        </label>
        <label className="tch-champ-court">
          <span className="tch-etiquette">Heure (facultative)</span>
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
        </label>
        <button type="button" className="svv-btn gst-btn tch-btn" disabled={occupe || jour === ''}
          onClick={() => void agir({ geste: 'decaler', jour, heure: heure === '' ? null : heure })}>
          Valider
        </button>
      </span>
    </div>
  );
  const retour = message && <p className={`tch-message${message.ok ? '' : ' tch-message--erreur'}`} role="status">{message.texte}</p>;
  const classe = `tch-ligne ${couleur === null ? 'tch-ligne--terminee' : `tch-ligne--${couleur}`}`;

  /* ══ 🔴🔴 LOT FICHE-CARTE-TACHE — LA CARTE (fiche du bien), de haut en bas : titre ; ligne clé (📅 échéance, libellé
     de couleur, 👤 Confiée à, badge) ; commentaire EN ENTIER ; pièces ; un encadré par contact ; boutons. La note est
     le texte libre seul : les contacts ne s'affichent QUE dans les encadrés (aucun bloc « Contacts » en double). */
  if (presentation === 'carte' || deplie) {
    const note = (tache.note ?? '').trim();
    const pieces = tache.pieces ?? detail?.pieces ?? [];
    const contacts = tache.contacts ?? detail?.contacts ?? [];
    /* 🔴 LOT FICHE-CARTE-4-BLOCS — l'agenda est TOUJOURS dit sur la carte (repli : la mention du récapitulatif). */
    const agenda = tache.agendaCarte ?? tache.agenda ?? null;
    return (
      <li className={`${classe} tch-carte`} data-tache={tache.id} data-couleur={couleur ?? 'terminee'}
        data-depliee={onBasculer !== undefined ? 'oui' : undefined}>
        {/* ① TITRE — bandeau d'en-tête. 🔴 LOT TACHES-LIGNES-COMPACTES : dans une liste, un clic sur le bandeau REPLIE
            la carte (« ✏ Modifier » ouvre la fenêtre, en pied) ; une carte seule garde l'ouverture de la fenêtre. */}
        <h5 className="tch-carte-titre tch-carte-bloc" data-ordre="titre">
          <button type="button" className="tch-objet tch-carte-objet"
            onClick={() => (onBasculer !== undefined ? onBasculer() : onDetail(tache.id))}
            aria-expanded={onBasculer !== undefined ? true : undefined}
            title={onBasculer !== undefined ? 'Replier la tâche' : 'Ouvrir la tâche (modifier, annuler)'}>
            {onBasculer !== undefined && <span className="tch-fleche" aria-hidden="true">▾ </span>}
            {tache.objet}
          </button>
        </h5>
        {/* ② QUAND / QUI — échéance, responsable, acceptation, agenda. */}
        <div className="tch-carte-cle tch-carte-bloc" data-ordre="cle">
          <p className="tch-carte-etiquette">Quand / Qui</p>
          <div className="tch-carte-cle-ligne">
            <b className="tch-date" data-echeance={tache.jour}>📅 {echeanceLisible(tache.jour, tache.heure, maintenant)}</b>
            {pastilleMot}
          </div>
          <div className="tch-carte-cle-ligne">
            <b className="tch-carte-qui">👤 Confiée à {tache.confieeALibelle}</b>
            {badge}
            {agenda && (
              <span className={`tch-agenda tch-agenda--${agenda.etat}`} data-agenda={agenda.etat} title={agenda.motif ?? undefined}>
                {agenda.etat === 'dans_agenda' ? agenda.texte.replace('📅', '📆') : agenda.texte}
                {agenda.peutReessayer && (
                  <button type="button" className="tch-lien tch-reessayer" disabled={occupe} data-action="agenda"
                    onClick={() => void agir({ geste: 'reessayerAgenda' })}>
                    {agenda.etat === 'pas_encore' ? 'Envoyer' : 'Réessayer'}
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="tch-bas">
            {avecAdresse && (onOuvrirBien
              ? <button type="button" className="tch-lien" onClick={() => onOuvrirBien(tache.lotId)}>{tache.adresseBien}</button>
              : <span>{tache.adresseBien}</span>)}
            {ev}{fin !== null && <span className="tch-fin">{fin}</span>}
            {tache.acceptation?.statut === 'en_attente' && mentionMail(tache.acceptation.mailEtat) && (
              <span className="tch-mail">{mentionMail(tache.acceptation.mailEtat)}</span>
            )}
            {tache.acceptation?.statut === 'refusee' && tache.acceptation.motif && (
              <span className="tch-motif">Refusée par {tache.acceptation.reponduParLibelle ?? tache.acceptation.destinataireLibelle} : {tache.acceptation.motif}</span>
            )}
          </div>
        </div>
        {/* ③ NOTES (+ pièces jointes) — absent si rien à dire. */}
        {(note !== '' || pieces.length > 0) && (
          <div className="tch-carte-notes tch-carte-bloc" data-ordre="notes">
            {note !== '' && (
              <>
                <p className="tch-carte-etiquette">Notes</p>
                <p className="tch-carte-note">{tache.note}</p>
              </>
            )}
            {pieces.length > 0 && (
              <>
                <p className="tch-carte-etiquette">Pièces jointes</p>
                <ul className="tch-carte-pieces" aria-label="Pièces jointes">
                  {pieces.map((p) => (
                    <li key={p.driveId} data-piece={p.driveId}>
                      <span aria-hidden="true">{iconeType(p.typeMime)} </span>
                      {p.lien
                        ? <a className="tchc-lien" href={p.lien} target="_blank" rel="noopener noreferrer">{p.nom} ↗</a>
                        : <span>{p.nom}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {/* ④ CONTACTS — un encadré par contact. */}
        {contacts.length > 0 && (
          <div className="tch-carte-contacts tch-carte-bloc" data-ordre="contacts">
            <p className="tch-carte-etiquette">Contacts ({contacts.length})</p>
            <EncadresContacts contacts={contacts} sources={sources} onEcrire={onEcrire} occupe={occupe}
              onMettreAJour={terminee ? undefined : (cle) => void agir({ geste: 'actualiserContact', cle })} />
          </div>
        )}
        {/* Barre d'actions, en pied. */}
        <div className="tch-carte-pied">
          {actions}
          {panneauDecaler}
          {retour}
        </div>
      </li>
    );
  }

  /* ══ 🔴🔴 LOT TACHES-LIGNES-COMPACTES — LA LIGNE REPLIÉE, DEUX LIGNES AU PLUS, SANS BOUTONS ════════════════════════
     ① liseré · libellé/date · TITRE en gras · badge ; ② en petit : adresse (cliquable dans le récapitulatif, SANS
     déplier) · → confiée à · contacts · pièces · agenda. Un clic (ou Entrée / Espace) déplie la carte en 4 blocs, où
     sont tous les boutons. Les deux lignes ne passent jamais à la ligne : ce qui dépasse s'efface en « … ». */
  const basculerAuClavier = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBasculer?.(); }
  };
  const agenda = tache.agendaCarte ?? tache.agenda ?? null;
  return (
    <li className={`${classe} tch-compacte`} data-tache={tache.id} data-couleur={couleur ?? 'terminee'} data-depliee="non">
      <div className="tch-l1" role="button" tabIndex={0} aria-expanded={false} title="Déplier la tâche"
        onClick={() => onBasculer?.()} onKeyDown={basculerAuClavier}>
        <span className="tch-pastille-mot">
          <span className={`tch-pastille tch-pastille--${couleur ?? 'terminee'}`} aria-hidden="true" />
          <b className="tch-date tch-l1-quand" data-echeance={tache.jour}>
            {terminee ? `${tache.etat === 'faite' ? 'Faite' : 'Annulée'} · ${echeanceLisible(tache.jour, tache.heure, maintenant)}`
              : echeanceCompacte(tache, maintenant)}
          </b>
        </span>
        <b className="tch-l1-titre">{tache.objet}</b>
        {badge}
      </div>
      <div className="tch-l2" onClick={() => onBasculer?.()}>
        {onOuvrirBien && avecAdresse
          ? <button type="button" className="tch-lien" data-action="ouvrir-bien"
              onClick={(e) => { e.stopPropagation(); onOuvrirBien(tache.lotId); }}>{tache.adresseBien}</button>
          : <span>{tache.adresseBien}</span>}
        <span className="tch-confiee">→ {tache.confieeALibelle}</span>
        {(tache.nbContacts ?? 0) > 0 && (
          <span className="tch-contacts">👤 {tache.nbContacts} contact{tache.nbContacts > 1 ? 's' : ''}</span>
        )}
        {(tache.nbPieces ?? 0) > 0 && (
          <span className="tch-pieces" title={`${tache.nbPieces} pièce(s) jointe(s)`}>📎 {tache.nbPieces}</span>
        )}
        {agenda && <span className={`tch-agenda tch-agenda--${agenda.etat}`} data-agenda={agenda.etat}>{MOT_AGENDA_COURT[agenda.etat]}</span>}
      </div>
    </li>
  );
}

/** 🔴 LOT FICHE-CARTE-TACHE — les libellés des boutons d'une tâche, écrits UNE fois (fiche et récapitulatif). */
export const MOT_ACTION = {
  realisee: '✓ Tâche réalisée', decaler: 'Décaler', modifier: '✏ Modifier', annulee: '✗ Tâche annulée',
} as const;

/**
 * LES STYLES DES TÂCHES, partagés par la ligne, la fenêtre, la fiche et le récapitulatif. Jetons du thème
 * seulement : Clair et Sombre suivent tout seuls.
 *
 * ⚠️ CSS DANS UN GABARIT : jamais d'accent grave dans un commentaire ci-dessous (il fermerait le gabarit).
 */
export const CSS_TACHES = `
/* LOT COULEURS-TACHES (Arno, 13/10/2026) : retard = rouge fonce (bordeaux) ; aujourd'hui et demain = rouge ;
   apres-demain = orange ; plus tard = vert. Deux jetons propres aux taches, redefinis en Sombre (memes selecteurs que
   globals.css) : le bordeaux y reste distinct du rouge et lisible sur fond sombre. */
:root,.svv-adm-root{--tch-c-retard:#6e0a1e;--tch-c-jour:var(--color-svv-proprio)}
.svv-adm-root[data-theme='dark']{--tch-c-retard:#c2405e}
@media (prefers-color-scheme: dark){.svv-adm-root[data-theme='system']{--tch-c-retard:#c2405e}}
.tch-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tch-ligne{display:flex;flex-direction:column;gap:4px;padding:8px 10px 8px 12px;border:1px solid var(--color-svv-line);
  border-left-width:5px;border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.tch-ligne--retard{border-left-color:var(--tch-c-retard)}
.tch-ligne--jour{border-left-color:var(--tch-c-jour)}
.tch-ligne--proche{border-left-color:var(--color-svv-urgence-orange)}
.tch-ligne--plus_tard{border-left-color:var(--color-svv-green)}
.tch-ligne--terminee{border-left-color:var(--color-svv-line);opacity:.62}
.tch-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;min-width:0}
.tch-bas{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .7rem;font-size:.82rem;color:var(--color-svv-muted)}
.tch-pastille-mot{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:700;
  color:var(--color-svv-ink);white-space:nowrap}
.tch-pastille{display:inline-block;width:14px;height:14px;border-radius:50%;flex:0 0 auto;
  border:1px solid transparent}
.tch-pastille--retard{background:var(--tch-c-retard)}
.tch-pastille--jour{background:var(--tch-c-jour)}
.tch-pastille--proche{background:var(--color-svv-urgence-orange)}
.tch-pastille--plus_tard{background:var(--color-svv-green)}
.tch-pastille--terminee{background:var(--color-svv-line)}
.tch-badge{display:inline-flex;align-items:center;padding:.05rem .5rem;border-radius:999px;font-size:.76rem;font-weight:700;
  border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink);background:var(--color-svv-field);white-space:nowrap}
.tch-badge--acceptee{border-color:var(--color-svv-green);color:var(--color-svv-green-ink)}
.tch-badge--refusee{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.tch-mail{font-style:italic}
.tch-motif{color:var(--color-svv-red)}
.tch-agenda{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.tch-agenda--a_resynchroniser{color:var(--color-svv-red);font-weight:600}
.tch-reessayer{min-height:32px;font-weight:600}
/* LOT TACHES-LIGNES-COMPACTES : la ligne repliee, deux lignes au plus ; rien ne passe a la ligne, l'exces s'efface. */
.tch-compacte{gap:2px;padding:6px 10px 6px 12px;cursor:pointer}
.tch-compacte:hover{background:var(--color-svv-field)}
.tch-l1,.tch-l2{display:flex;align-items:center;gap:.6rem;min-width:0;white-space:nowrap;overflow:hidden}
.tch-l1{min-height:28px;outline:none}
.tch-l1:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:.3rem}
.tch-l1 > *{flex:0 0 auto}
.tch-l1-titre{flex:1 1 auto !important;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:700;color:var(--color-svv-ink)}
.tch-l2{font-size:.8rem;color:var(--color-svv-muted)}
.tch-l2 > *{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.tch-l2 .tch-lien{min-height:24px}
.tch-fleche{font-size:.85em}
/* LOT FICHE-CARTE-4-BLOCS : la carte en 4 blocs (titre ; quand/qui ; notes ; contacts) + pied d'actions.
   Jetons du theme seulement : Clair et Sombre suivent. */
.tch-liste--cartes{gap:6px}
/* LOT TACHES-LIGNES-COMPACTES : une carte depliee dans une liste garde ses 20 px d'ecart avec les lignes voisines. */
.tch-liste > .tch-carte[data-depliee]{margin:14px 0}
.tch-carte{gap:0;padding:0;overflow:hidden;border:1px solid var(--color-svv-line-strong);border-left-width:6px;
  border-radius:.8rem;background:var(--color-svv-surface);box-shadow:0 2px 10px rgba(0,0,0,.10)}
.tch-carte.tch-ligne--retard{border-left-color:var(--tch-c-retard)}
.tch-carte.tch-ligne--jour{border-left-color:var(--tch-c-jour)}
.tch-carte.tch-ligne--proche{border-left-color:var(--color-svv-urgence-orange)}
.tch-carte.tch-ligne--plus_tard{border-left-color:var(--color-svv-green)}
.tch-carte.tch-ligne--terminee{border-left-color:var(--color-svv-line-strong)}
.tch-carte-bloc{margin:0;padding:10px 14px;border-top:1px solid var(--color-svv-line)}
.tch-carte-bloc:first-child{border-top:0}
.tch-carte-titre{background:var(--color-svv-blue-soft);border-bottom:1px solid var(--color-svv-line-strong)}
.tch-carte-titre + .tch-carte-bloc{border-top:0}
.tch-carte-titre .tch-objet.tch-carte-objet{font-size:1.25rem;font-weight:800;line-height:1.25;padding:0;min-height:32px;color:var(--color-svv-ink)}
.tch-carte-etiquette{margin:0 0 4px;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.tch-carte-cle{display:flex;flex-direction:column;gap:6px}
.tch-carte-cle-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .9rem;font-size:.95rem;color:var(--color-svv-ink)}
.tch-carte-cle .tch-date{font-size:1rem}
.tch-carte-qui{font-weight:700;color:var(--color-svv-ink)}
.tch-carte .tch-bas:empty{display:none}
.tch-agenda--dans_agenda{color:var(--color-svv-green-ink);font-weight:700}
.tch-agenda--pas_encore,.tch-agenda--pas_dans_agenda,.tch-agenda--sans_agenda_google,.tch-agenda--apres_acceptation{color:var(--color-svv-muted)}
.tch-carte-notes{margin:10px 14px 0;padding:10px 12px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-field)}
.tch-carte-notes .tch-carte-etiquette + .tch-carte-note{margin-top:0}
.tch-carte-note{margin:0 0 6px;font-size:.95rem;line-height:1.5;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.tch-carte-note:last-child{margin-bottom:0}
.tch-carte-pieces{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:.9rem;overflow-wrap:anywhere}
.tch-carte-notes + .tch-carte-bloc{border-top:0;margin-top:4px}
.tch-carte-contacts .tchc-encadres{display:grid;grid-template-columns:1fr;gap:8px}
@media (min-width:900px){.tch-carte-contacts .tchc-encadres{grid-template-columns:repeat(2,minmax(0,1fr))}}
.tch-carte-pied{display:flex;flex-direction:column;gap:6px;margin-top:10px;padding:10px 14px;border-top:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field)}
.tch-carte-pied .tch-btn{background:var(--color-svv-surface)}
.tch-ligne--terminee.tch-carte .tch-carte-objet{text-decoration:line-through}
.tch-btn-annuler{color:var(--color-svv-red);border-color:var(--color-svv-red)}
.tch-confirmer{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.tch-confirmer-question{font-size:.88rem;font-weight:700;color:var(--color-svv-ink)}
.tch-echeance{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.25rem .5rem}
.tch-date{font-size:.95rem;font-weight:700;color:var(--color-svv-ink);white-space:nowrap}
.tch-objet{flex:1 1 12rem;min-width:0;text-align:left;background:none;border:0;padding:4px 0;font:inherit;
  font-weight:600;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere;min-height:32px}
.tch-objet:hover{text-decoration:underline}
.tch-objet:focus-visible,.tch-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tch-ligne--terminee .tch-objet{text-decoration:line-through;font-weight:500}
.tch-lien{background:none;border:0;padding:0;font:inherit;color:var(--color-svv-blue);cursor:pointer;
  text-decoration:underline;text-align:left;overflow-wrap:anywhere}
.tch-ev{padding:0 .4rem;border:1px solid var(--color-svv-line);border-radius:999px}
.tch-actions,.tch-decaler{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
.tch-btn{width:auto;min-height:44px;padding:0 .8rem;font-size:.84rem}
.tch-decaler{padding:8px;border:1px dashed var(--color-svv-line-strong);border-radius:.5rem}
.tch-decaler-choix{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
.tch-champ-court{display:flex;flex-direction:column;gap:2px;font-size:.78rem;color:var(--color-svv-muted)}
.tch-champ-court input{min-height:40px;padding:0 .4rem;border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit}
.tch-message{margin:0;font-size:.82rem;color:var(--color-svv-green-ink)}
.tch-message--erreur{color:var(--color-svv-red)}
.tch-confirmation{flex:1 1 100%;font-size:.84rem;font-weight:600;color:var(--color-svv-green-ink)}
.tch-compteurs{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.tch-compteur{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border:1px solid var(--color-svv-line);
  border-radius:999px;font-size:.82rem;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.tch-compteur b{font-variant-numeric:tabular-nums}
.tch-vide{margin:0;font-size:.85rem;color:var(--color-svv-muted)}
.tch-terminees{margin-top:6px}
.tch-terminees > summary{cursor:pointer;font-size:.85rem;color:var(--color-svv-muted);min-height:32px;
  display:flex;align-items:center}
.tch-terminees > .tch-liste{margin-top:6px}
.tch-bloc-fiche{margin:10px 0 4px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:.8rem;
  background:var(--color-svv-surface)}
.tch-bloc-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:0 0 8px;font-size:.95rem;
  font-weight:700;color:var(--color-svv-ink)}
`;
