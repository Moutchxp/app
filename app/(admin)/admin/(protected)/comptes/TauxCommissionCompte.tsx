'use client';

import { useState } from 'react';
import { dateHeure } from './StatutCompte';

/**
 * ══ 🔴 MON ESPACE (Arno, 07/11/2026, migration 462) — « TAUX DE COMMISSION » DU PROFIL ═════════════════════════════════════════════════
 * Le taux de commission du collaborateur, appliqué à SA part des honoraires : il pré-remplit « Nouveau compromis » (modifiable pour chaque
 * compromis). Facultatif, entre 0 et 100 % ; vide : non renseigné — le taux se saisit alors sur chaque compromis (aucun 50 % par défaut). Journalisé avec sa date (avant / après,
 * auteur). Un administrateur « Non commissionné » le reste : le taux ne s'applique pas tant qu'il l'est (la mention le dit).
 */
export interface TauxCommissionVue { valeur: number | null; disponible: boolean; historique: { le: string; avant: number | null; apres: number | null; par: string | null }[] }

export const AIDE_TAUX_COMMISSION = 'Appliqué à sa part des honoraires ; pré-remplit « Nouveau compromis » (modifiable pour chaque compromis). Vide : à saisir sur chaque compromis.';
const texte = (x: number | null): string => (x === null ? '' : String(x).replace('.', ','));
const lib = (x: number | null): string => (x === null ? 'non renseigné' : `${texte(x)} %`);
/** Le texte saisi : vide (non renseigné), un pourcentage entre 0 et 100, ou illisible (undefined). PUR. */
export function lireTauxSaisi(t: string): number | null | undefined {
  const s = t.trim().replace('%', '').trim();
  if (s === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(s)) return undefined;
  const x = Number(s.replace(',', '.'));
  return x >= 0 && x <= 100 ? x : undefined;
}

export function BlocTauxCommissionCompte({ compteId, etat, nonCommissionne = false, onFait }: { compteId: number; etat: TauxCommissionVue; nonCommissionne?: boolean; onFait: () => void }) {
  const [saisie, setSaisie] = useState(texte(etat.valeur));
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const lu = lireTauxSaisi(saisie);
  const enregistrer = async (): Promise<void> => {
    if (lu === undefined) { setMsg('Le taux de commission doit être compris entre 0 et 100 %.'); return; }
    setEnvoi(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${compteId}/taux-commission`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taux: lu }) });
      const body = await res.json().catch(() => null) as { change?: boolean; erreur?: string } | null;
      if (res.ok) { setMsg(body?.change === false ? 'Taux inchangé.' : 'Taux enregistré.'); onFait(); }
      else setMsg(body?.erreur ?? 'Enregistrement refusé.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="cpt-identite" role="group" aria-labelledby={`taux-commission-${compteId}`} style={{ marginTop: 8 }} data-taux-commission-compte>
      <div className="cpt-perms-titre" id={`taux-commission-${compteId}`}>Taux de commission</div>
      <label className="cpt-note">Taux de commission (%)
        <input inputMode="decimal" value={saisie} onChange={(e) => setSaisie(e.target.value)} disabled={envoi || !etat.disponible} placeholder="non renseigné"
          aria-invalid={lu === undefined} data-champ-taux-commission style={{ marginLeft: 8, width: 90, minHeight: 44 }} /></label>
      {lu === undefined && <span className="cpt-err" role="status" data-taux-commission-bornes>Le taux de commission doit être compris entre 0 et 100 %.</span>}
      {etat.disponible && (
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={envoi || lu === undefined || lu === etat.valeur} onClick={() => void enregistrer()} data-enregistrer-taux-commission>Enregistrer le taux</button>
        </div>
      )}
      {msg !== null && <span className="cpt-note" role="status" data-taux-commission-message>{msg}</span>}
      <span className="cpt-note">{AIDE_TAUX_COMMISSION}</span>
      {nonCommissionne && <span className="cpt-note" data-taux-non-commissionne>Ce compte est « Non commissionné » : le taux ne s’applique pas tant qu’il l’est.</span>}
      {!etat.disponible && <span className="cpt-note" data-taux-commission-indisponible>Mise à jour de la base à appliquer (migration 462) avant de pouvoir le renseigner.</span>}
      {etat.historique.length > 0 && (
        <ul className="cpt-note" data-taux-commission-historique style={{ margin: 0, paddingLeft: 18 }}>
          {[...etat.historique].reverse().map((h, i) => (
            <li key={`${h.le}-${i}`}>{lib(h.apres)} le {dateHeure(h.le)} (avant : {lib(h.avant)}) — {h.par === null ? 'compte inconnu' : `par ${h.par}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
