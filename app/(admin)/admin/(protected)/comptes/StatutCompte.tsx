'use client';

import { useState } from 'react';
import { LIBELLE_STATUT_PERSONNE, STATUTS_PERSONNE, type Statut } from '../../../../lib/admin/statut';

/**
 * ══ 🔴 LOT P (Arno, 28/10/2026) — « STATUT » DANS COMPTES : Associé, Salarié, Indépendant, Observateur ═════════════════════════
 * Obligatoire (à la création et dans Détails), journalisé avec sa date (avant / après, auteur), distinct de la société et des droits de
 * tuiles. Quatre boutons (●/○, `aria-pressed`, 44 px) comme « Société » ; « à renseigner » écrit tant que rien n'est choisi. Observateur :
 * lecture seule absolue (le proxy refuse toute écriture) et jamais négociateur.
 */
export const MSG_STATUT_OBLIGATOIRE = 'Statut obligatoire : Associé, Salarié, Indépendant ou Observateur.';
export const AIDE_STATUT = 'Associé ou salarié : commissions internes, non déduites du solde des compromis. Indépendant : commissions déduites. '
  + 'Observateur : lecture seule absolue (aucune modification nulle part) et jamais négociateur.';

export interface StatutVue { valeur: Statut | null; disponible: boolean; historique: { le: string; avant: Statut | null; apres: Statut | null; par: string | null; origine: string | null }[] }

export function ChoixStatut({ valeur, disabled, onChoisir, idGroupe }: { valeur: Statut | null; disabled?: boolean; onChoisir: (s: Statut) => void; idGroupe: string }) {
  return (
    <div className="cpt-ouinon" role="group" aria-labelledby={idGroupe} data-choix-statut>
      {STATUTS_PERSONNE.map((s) => (
        <button key={s} type="button" className="cpt-ouinon__btn" aria-pressed={valeur === s} disabled={disabled} onClick={() => onChoisir(s)} data-statut={s}>
          <span className="cpt-ouinon__ind" aria-hidden="true">{valeur === s ? '●' : '○'}</span>
          {LIBELLE_STATUT_PERSONNE[s]}
        </button>
      ))}
      {valeur === null && !disabled && <span className="cpt-a-decider">à renseigner</span>}
    </div>
  );
}

/** « 2026-10-28 11:59:03.12+01 » (timestamptz en texte) → « 28/10/2026 11:59:03 » à Paris. */
export const dateHeure = (x: string): string => {
  const d = new Date(x.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isNaN(d.getTime()) ? x : d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
};
const lib = (s: Statut | null): string => (s === null ? 'à renseigner' : LIBELLE_STATUT_PERSONNE[s]);

/** Le bloc « Statut » du détail d'un compte : le choix, « Enregistrer le statut », et l'historique daté. Il enregistre lui-même. */
export function BlocStatutCompte({ compteId, etat, onFait }: { compteId: number; etat: StatutVue; onFait: () => void }) {
  const [choix, setChoix] = useState<Statut | null>(etat.valeur);
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const enregistrer = async (): Promise<void> => {
    if (choix === null) { setMsg(MSG_STATUT_OBLIGATOIRE); return; }
    setEnvoi(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${compteId}/statut`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statut: choix }) });
      const body = await res.json().catch(() => null) as { change?: boolean; erreur?: string; motif?: string } | null;
      if (res.ok) { setMsg(body?.change === false ? 'Statut inchangé.' : 'Statut enregistré.'); onFait(); }
      else setMsg(body?.motif ?? body?.erreur ?? 'Enregistrement refusé.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="cpt-identite" role="group" aria-labelledby={`statut-${compteId}`} style={{ marginTop: 8 }} data-statut-compte>
      <div className="cpt-perms-titre" id={`statut-${compteId}`}>Statut</div>
      <ChoixStatut valeur={choix} disabled={envoi || !etat.disponible} onChoisir={setChoix} idGroupe={`statut-${compteId}`} />
      {etat.disponible && etat.valeur === null && <span className="cpt-err" role="status" data-statut-a-renseigner>{MSG_STATUT_OBLIGATOIRE}</span>}
      {etat.disponible && (
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={envoi || choix === null || choix === etat.valeur} onClick={() => void enregistrer()} data-enregistrer-statut>Enregistrer le statut</button>
        </div>
      )}
      {msg !== null && <span className="cpt-note" role="status" data-statut-message>{msg}</span>}
      <span className="cpt-note">{AIDE_STATUT}</span>
      {!etat.disponible && <span className="cpt-note">Mise à jour de la base à appliquer (migration 439) avant de pouvoir le renseigner.</span>}
      {etat.historique.length > 0 && (
        <ul className="cpt-note" data-statut-historique style={{ margin: 0, paddingLeft: 18 }}>
          {[...etat.historique].reverse().map((h, i) => (
            <li key={`${h.le}-${i}`}>{lib(h.apres)} le {dateHeure(h.le)} (avant : {lib(h.avant)}) — {h.origine ?? (h.par === null ? 'compte inconnu' : `par ${h.par}`)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
