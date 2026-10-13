'use client';

import { useEffect, useState } from 'react';
import {
  couleurTache, echeanceLisible, horodatageLisible, iconeType, MOT_COULEUR, RACCOURCIS_DECALAGE,
  type Tache,
} from '../../../../lib/gestion/taches';
import type { ContactSource } from '../../../../lib/gestion/contactsTache';
/* 🔴 LOT FICHE-CARTE-TACHE — un encadré par contact, au liseré de sa famille (source unique PARTIES). */
import { EncadresContacts } from './ContactsTache';
import { agirSurTache, type GesteTache } from './tachesClient';
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

export function LigneTache({ tache, maintenant, avecAdresse = false, onOuvrirBien, onDetail, presentation = 'ligne', sources = null, onEcrire }: {
  tache: Tache;
  maintenant: Date;
  /** Le récapitulatif général montre l'adresse du bien (cliquable) ; la fiche du bien, non — on y est déjà. */
  avecAdresse?: boolean;
  onOuvrirBien?: (lotId: number) => void;
  /** Ouvre la fenêtre « Tâche — <adresse> » sur cette tâche (clic sur l'objet, et « ✏ Modifier »). */
  onDetail: (id: number) => void;
  /** 🔴 LOT FICHE-CARTE-TACHE — `carte` sur la fiche du bien (titre, ligne clé, note, pièces, contacts, boutons) ;
   *  `ligne` (défaut) dans le récapitulatif général, mise en page inchangée. */
  presentation?: 'ligne' | 'carte';
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

  const terminee = tache.etat !== 'a_faire';
  const fin = tache.etat === 'faite'
    ? `Faite par ${tache.faiteParLibelle ?? '?'} le ${horodatageLisible(tache.faiteLe ?? '')}`
    : tache.etat === 'annulee'
      ? `Annulée par ${tache.annuleeParLibelle ?? '?'} le ${horodatageLisible(tache.annuleeLe ?? '')}`
      : null;

  const pastilleMot = (
    <span className="tch-pastille-mot">
      <span className={`tch-pastille tch-pastille--${couleur ?? 'terminee'}`} aria-hidden="true" />
      <span className="tch-mot">{couleur === null ? (tache.etat === 'faite' ? 'Faite' : 'Annulée') : MOT_COULEUR[couleur]}</span>
    </span>
  );
  /* 🔴 LOT TACHES-ACCEPTATION — LE STATUT D'ACCEPTATION, en badge ; une tâche d'avant le lot n'a pas de badge. */
  const badge = tache.acceptation && (
    <span className={`tch-badge tch-badge--${tache.acceptation.statut}`} data-acceptation={tache.acceptation.statut}
      title={tache.acceptation.statut === 'refusee' && tache.acceptation.motif ? `Motif : ${tache.acceptation.motif}` : undefined}>
      {BADGE_ACCEPTATION[tache.acceptation.statut]}
    </span>
  );
  /* Les mentions d'état : fin, mail, refus, agenda — les mêmes sur la ligne et sur la carte. */
  const ev = tache.evenement !== null && <span className="tch-ev">{tache.evenement.reference}</span>;
  const mentions = (
    <>
      {fin !== null && <span className="tch-fin">{fin}</span>}
      {tache.acceptation?.statut === 'en_attente' && mentionMail(tache.acceptation.mailEtat) && (
        <span className="tch-mail">{mentionMail(tache.acceptation.mailEtat)}</span>
      )}
      {tache.acceptation?.statut === 'refusee' && tache.acceptation.motif && (
        <span className="tch-motif">Refusée par {tache.acceptation.reponduParLibelle ?? tache.acceptation.destinataireLibelle} : {tache.acceptation.motif}</span>
      )}
      {/* 🔴 LOT TACHES-AGENDA — la mention « Agenda » : jamais d'échec silencieux (« à resynchroniser » + Réessayer). */}
      {tache.agenda && (
        <span className={`tch-agenda tch-agenda--${tache.agenda.etat}`} data-agenda={tache.agenda.etat}
          title={tache.agenda.motif ?? undefined}>
          {tache.agenda.texte}
          {tache.agenda.peutReessayer && (
            <button type="button" className="tch-lien tch-reessayer" disabled={occupe}
              onClick={() => void agir({ geste: 'reessayerAgenda' })}>
              Réessayer
            </button>
          )}
        </span>
      )}
    </>
  );

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
  if (presentation === 'carte') {
    const note = (tache.note ?? '').trim();
    const pieces = tache.pieces ?? [];
    return (
      <li className={`${classe} tch-carte`} data-tache={tache.id} data-couleur={couleur ?? 'terminee'}>
        <h5 className="tch-carte-titre" data-ordre="titre">
          <button type="button" className="tch-objet tch-carte-objet" onClick={() => onDetail(tache.id)}
            title="Ouvrir la tâche (modifier, annuler)">
            {tache.objet}
          </button>
        </h5>
        <div className="tch-carte-cle" data-ordre="cle">
          <b className="tch-date" data-echeance={tache.jour}>📅 {echeanceLisible(tache.jour, tache.heure, maintenant)}</b>
          {pastilleMot}
          <b className="tch-carte-qui">👤 Confiée à {tache.confieeALibelle}</b>
          {badge}
        </div>
        <div className="tch-bas">{ev}{mentions}</div>
        {note !== '' && <p className="tch-carte-note" data-ordre="note">{tache.note}</p>}
        {pieces.length > 0 && (
          <ul className="tch-carte-pieces" data-ordre="pieces" aria-label="Pièces jointes">
            {pieces.map((p) => (
              <li key={p.driveId} data-piece={p.driveId}>
                <span aria-hidden="true">{iconeType(p.typeMime)} </span>
                {p.lien
                  ? <a className="tchc-lien" href={p.lien} target="_blank" rel="noopener noreferrer">{p.nom} ↗</a>
                  : <span>{p.nom}</span>}
              </li>
            ))}
          </ul>
        )}
        <EncadresContacts contacts={tache.contacts ?? []} sources={sources} onEcrire={onEcrire} occupe={occupe}
          onMettreAJour={terminee ? undefined : (cle) => void agir({ geste: 'actualiserContact', cle })} />
        {actions}
        {panneauDecaler}
        {retour}
      </li>
    );
  }

  return (
    <li className={classe} data-tache={tache.id} data-couleur={couleur ?? 'terminee'}>
      <div className="tch-haut">
        {/* 🔴🔴 PARTIE A (Arno, 13/10/2026) — L'ÉCHÉANCE EN PREMIER ET EN GRAS (« mar. 13 oct. · 9 h 30 »), le libellé de
            couleur COLLÉ à elle. C'est la date de la tâche, jamais celle de sa création (qui ne se lit qu'en petit,
            dans le détail). */}
        <span className="tch-echeance">
          <b className="tch-date" data-echeance={tache.jour}>{echeanceLisible(tache.jour, tache.heure, maintenant)}</b>
          {pastilleMot}
          {badge}
        </span>
        <button type="button" className="tch-objet" onClick={() => onDetail(tache.id)}
          title="Voir le détail, modifier ou annuler">
          {tache.objet}
        </button>
      </div>
      <div className="tch-bas">
        {avecAdresse && (
          onOuvrirBien
            ? <button type="button" className="tch-lien" onClick={() => onOuvrirBien(tache.lotId)}>{tache.adresseBien}</button>
            : <span>{tache.adresseBien}</span>
        )}
        <span className="tch-confiee">→ {tache.confieeALibelle}</span>
        {ev}
        {/* 🔴 LOT TACHES-1-BIS — dans les listes, un simple indicateur ; le détail montre les coordonnées. */}
        {(tache.nbContacts ?? 0) > 0 && (
          <span className="tch-contacts">👤 {tache.nbContacts} contact{tache.nbContacts > 1 ? 's' : ''}</span>
        )}
        {/* 🔴 LOT TACHES-PIECES-DRIVE — un simple indicateur ; le détail montre les pièces et les ouvre dans le Drive. */}
        {(tache.nbPieces ?? 0) > 0 && (
          <span className="tch-pieces" title={`${tache.nbPieces} pièce(s) jointe(s)`}>📎 {tache.nbPieces}</span>
        )}
        {mentions}
      </div>
      {actions}
      {panneauDecaler}
      {retour}
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
.tch-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tch-ligne{display:flex;flex-direction:column;gap:4px;padding:8px 10px 8px 12px;border:1px solid var(--color-svv-line);
  border-left-width:5px;border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.tch-ligne--retard{border-left-color:var(--color-svv-red)}
.tch-ligne--jour{border-left-color:var(--color-svv-line-strong)}
.tch-ligne--proche{border-left-color:var(--color-svv-urgence-orange)}
.tch-ligne--plus_tard{border-left-color:var(--color-svv-green)}
.tch-ligne--terminee{border-left-color:var(--color-svv-line);opacity:.62}
.tch-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .7rem;min-width:0}
.tch-bas{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .7rem;font-size:.82rem;color:var(--color-svv-muted)}
.tch-pastille-mot{display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem;font-weight:700;
  color:var(--color-svv-ink);white-space:nowrap}
.tch-pastille{display:inline-block;width:14px;height:14px;border-radius:50%;flex:0 0 auto;
  border:1px solid transparent}
.tch-pastille--retard{background:var(--color-svv-red)}
.tch-pastille--jour{background:#ffffff;border-color:#9aa3ad}
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
.tch-carte{gap:6px;padding:10px 12px 10px 14px}
.tch-carte-titre{margin:0;font-size:1.05rem;font-weight:800;line-height:1.25}
.tch-carte-objet{font-size:1.05rem;font-weight:800;padding:0;min-height:28px}
.tch-carte-cle{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .8rem;font-size:.92rem;color:var(--color-svv-ink)}
.tch-carte-qui{font-weight:700;color:var(--color-svv-ink)}
.tch-carte .tch-bas:empty{display:none}
.tch-carte-note{margin:2px 0 0;font-size:.92rem;line-height:1.45;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.tch-carte-pieces{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:.88rem;overflow-wrap:anywhere}
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
