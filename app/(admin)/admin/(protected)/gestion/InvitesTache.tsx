'use client';

import { useState } from 'react';
import type { Tache } from '../../../../lib/gestion/taches';
import { BADGE_ACCEPTATION, mentionMail, refusChangementDestinataire, resumeInvites } from '../../../../lib/gestion/acceptationTache';
import { lireCollaborateurs, type CollaborateurEcran, type GesteTache } from './tachesClient';

/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (17/10/2026) — LES INVITÉS D'UNE TÂCHE, LES MÊMES PARTOUT ═══════════════════
 *
 * Arno : « La carte de la tâche affiche chaque invité avec son état, et un résumé “N acceptées sur M” » ; « Changer le
 * destinataire » et « Renvoyer l'invitation » sur un invité encore en attente. Rendu par la CARTE (`LigneTache`) et par la FENÊTRE (`FenetreTache`) :
 * une seule liste, un seul geste, partout.
 *
 * Un invité qui a ACCEPTÉ ne change pas de destinataire : la ligne dit comment le retirer (« Modifier », décocher).
 * Aucune adresse n'est affichée : les noms seulement.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
export function InvitesTache({ tache, terminee, occupe, agir }: {
  tache: Tache;
  terminee: boolean;
  occupe: boolean;
  /** La porte des gestes du parent (qui affiche le message et relit la tâche). */
  agir: (g: GesteTache) => Promise<void>;
}) {
  const [changer, setChanger] = useState<number | null>(null);
  const [choix, setChoix] = useState<number | null>(null);
  const [collab, setCollab] = useState<CollaborateurEcran[] | null>(null);
  const invites = tache.invites ?? [];
  if (invites.length === 0) return null;

  const ouvrirChangement = async (inviteId: number) => {
    setChanger(inviteId);
    setChoix(null);
    if (collab === null) setCollab((await lireCollaborateurs())?.collaborateurs ?? []);
  };
  const dejaInvites = new Set(invites.map((i) => i.collaborateurId));

  return (
    <div className="tch-invites" data-invites={invites.length}>
      <p className="tch-carte-etiquette">
        Invités — <span className="tch-invites-resume" data-resume>{resumeInvites(invites)}</span>
      </p>
      <ul className="tch-invites-liste">
        {invites.map((i) => (
          <li key={i.inviteId} className="tch-invite" data-invite={i.inviteId} data-statut={i.statut ?? 'acceptee'}>
            <span className="tch-invite-nom">{i.libelle}{i.principal ? <span className="tch-invite-principal"> · confiée à</span> : null}</span>
            {i.statut !== null && (
              <span className={`tch-badge tch-badge--${i.statut}`}
                title={i.statut === 'refusee' && i.motif ? `Motif : ${i.motif}` : undefined}>
                {BADGE_ACCEPTATION[i.statut]}
              </span>
            )}
            {i.statut === 'refusee' && i.motif && <span className="tch-motif">Motif : {i.motif}</span>}
            {i.statut === 'en_attente' && mentionMail(i.mailEtat) && <span className="tch-mail">{mentionMail(i.mailEtat)}</span>}
            {!terminee && refusChangementDestinataire(i.statut) === null && changer !== i.inviteId && (
              <button type="button" className="tch-lien tch-invite-action" disabled={occupe} data-action="changer-destinataire"
                onClick={() => void ouvrirChangement(i.inviteId)}>
                Changer le destinataire
              </button>
            )}
            {/* 🔴 LOT 2 — « Renvoyer l'invitation » : un nouveau lien, l'ancien cesse d'agir (2 minutes au moins entre deux). */}
            {!terminee && i.statut === 'en_attente' && changer !== i.inviteId && (
              <button type="button" className="tch-lien tch-invite-action" disabled={occupe} data-action="renvoyer-invitation"
                onClick={() => void agir({ geste: 'renvoyerInvitation', inviteId: i.inviteId })}>
                Renvoyer l’invitation
              </button>
            )}
            {!terminee && i.statut === 'acceptee' && !i.automatique && (
              <span className="tch-invite-aide">pour la retirer : « Modifier », puis décochez-la</span>
            )}
            {changer === i.inviteId && (
              <span className="tch-invite-changer" role="group" aria-label={`Changer le destinataire de ${i.libelle}`}>
                <select value={choix ?? ''} disabled={occupe || collab === null} data-champ-nouveau-destinataire
                  onChange={(e) => setChoix(e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">{collab === null ? 'Lecture…' : '— nouveau destinataire —'}</option>
                  {(collab ?? []).filter((c) => !dejaInvites.has(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.libelle}</option>
                  ))}
                </select>
                <button type="button" className="svv-btn gst-btn tch-btn" disabled={occupe || choix === null}
                  onClick={() => { if (choix !== null) void agir({ geste: 'changerDestinataire', inviteId: i.inviteId, collaborateurId: choix }).then(() => setChanger(null)); }}>
                  Valider
                </button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn tch-btn" disabled={occupe} onClick={() => setChanger(null)}>
                  Annuler
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** La feuille de style de la liste des invités (montée par la carte et par la fenêtre). */
export const CSS_INVITES_TACHE = `
.tch-invites{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.tch-invites-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tch-invite{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .6rem;font-size:.88rem;overflow-wrap:anywhere}
.tch-invite-nom{font-weight:600;color:var(--color-svv-ink)}
.tch-invite-principal{font-weight:400;color:var(--color-svv-muted)}
.tch-invite-aide{font-size:.8rem;color:var(--color-svv-muted)}
.tch-invite-changer{display:flex;flex-wrap:wrap;align-items:center;gap:6px;width:100%}
.tch-invite-changer select{min-height:44px;max-width:100%}
.tch-invite-action{min-height:44px}
`;
