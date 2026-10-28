'use client';

import { useState } from 'react';
import { dateHeure } from './StatutCompte';

/**
 * ══ 🔴 LOT S (Arno, 28/10/2026) — « COMMISSIONNÉ / NON COMMISSIONNÉ » D'UN ADMINISTRATEUR ═════════════════════════════════════════
 * Pour un compte de rôle ADMINISTRATEUR seulement (un collaborateur est toujours commissionné : il ne voit pas ce choix). Obligatoire à
 * la création et dans Détails, journalisé avec sa date (avant / après, auteur). Deux boutons (●/○, `aria-pressed`, 44 px) comme « Société »
 * et « Statut ». Non commissionné : sur une vente, aucune commission personnelle ne se saisit ni n'entre dans un calcul ; sa part reste dans
 * la répartition et dans le CA de sa société. Le choix est figé sur chaque vente à son enregistrement.
 */
export const MSG_COMMISSIONNE_OBLIGATOIRE = 'Choix obligatoire pour un administrateur : Commissionné ou Non commissionné.';
export const AIDE_COMMISSIONNE = 'Non commissionné : sur ses ventes, aucune commission personnelle (ni saisie, ni calcul) ; sa part reste dans la répartition et dans le CA '
  + 'de sa société. Les montants déjà saisis restent en base, intacts, et réapparaissent s’il redevient commissionné. Le choix est figé sur chaque vente à son enregistrement.';

export interface CommissionneVue { valeur: boolean | null; applicable: boolean; disponible: boolean;
  historique: { le: string; avant: boolean | null; apres: boolean | null; par: string | null; origine: string | null }[] }

const lib = (x: boolean | null): string => (x === null ? 'non renseigné' : x ? 'Commissionné' : 'Non commissionné');

export function ChoixCommissionne({ valeur, disabled, onChoisir, idGroupe }: { valeur: boolean | null; disabled?: boolean; onChoisir: (x: boolean) => void; idGroupe: string }) {
  return (
    <div className="cpt-ouinon" role="group" aria-labelledby={idGroupe} data-choix-commissionne>
      {[true, false].map((x) => (
        <button key={String(x)} type="button" className="cpt-ouinon__btn" aria-pressed={valeur === x} disabled={disabled} onClick={() => onChoisir(x)} data-commissionne={x ? 'oui' : 'non'}>
          <span className="cpt-ouinon__ind" aria-hidden="true">{valeur === x ? '●' : '○'}</span>
          {x ? 'Commissionné' : 'Non commissionné'}
        </button>
      ))}
      {valeur === null && !disabled && <span className="cpt-a-decider">à renseigner</span>}
    </div>
  );
}

/** Le bloc « Commissions » du détail d'un ADMINISTRATEUR : le choix, « Enregistrer », et l'historique daté. Il enregistre lui-même. */
export function BlocCommissionneCompte({ compteId, etat, onFait }: { compteId: number; etat: CommissionneVue; onFait: () => void }) {
  const [choix, setChoix] = useState<boolean | null>(etat.valeur);
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!etat.applicable) return null;
  const enregistrer = async (): Promise<void> => {
    if (choix === null) { setMsg(MSG_COMMISSIONNE_OBLIGATOIRE); return; }
    setEnvoi(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${compteId}/commissionne`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commissionne: choix }) });
      const body = await res.json().catch(() => null) as { change?: boolean; erreur?: string } | null;
      if (res.ok) { setMsg(body?.change === false ? 'Choix inchangé.' : 'Choix enregistré.'); onFait(); }
      else setMsg(body?.erreur ?? 'Enregistrement refusé.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="cpt-identite" role="group" aria-labelledby={`commissionne-${compteId}`} style={{ marginTop: 8 }} data-commissionne-compte>
      <div className="cpt-perms-titre" id={`commissionne-${compteId}`}>Commissions</div>
      <ChoixCommissionne valeur={choix} disabled={envoi || !etat.disponible} onChoisir={setChoix} idGroupe={`commissionne-${compteId}`} />
      {etat.disponible && etat.valeur === null && <span className="cpt-err" role="status" data-commissionne-a-renseigner>{MSG_COMMISSIONNE_OBLIGATOIRE}</span>}
      {etat.disponible && (
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={envoi || choix === null || choix === etat.valeur} onClick={() => void enregistrer()} data-enregistrer-commissionne>Enregistrer le choix</button>
        </div>
      )}
      {msg !== null && <span className="cpt-note" role="status" data-commissionne-message>{msg}</span>}
      <span className="cpt-note">{AIDE_COMMISSIONNE}</span>
      {!etat.disponible && <span className="cpt-note">Mise à jour de la base à appliquer (migration 441) avant de pouvoir le renseigner.</span>}
      {etat.historique.length > 0 && (
        <ul className="cpt-note" data-commissionne-historique style={{ margin: 0, paddingLeft: 18 }}>
          {[...etat.historique].reverse().map((h, i) => (
            <li key={`${h.le}-${i}`}>{lib(h.apres)} le {dateHeure(h.le)} (avant : {lib(h.avant)}) — {h.origine ?? (h.par === null ? 'compte inconnu' : `par ${h.par}`)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
