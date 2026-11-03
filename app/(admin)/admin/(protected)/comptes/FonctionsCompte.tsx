'use client';

import { useEffect, useState } from 'react';
import { FONCTIONS, LIBELLE_FONCTION, type EtatFonctions, type Fonction } from '../../../../lib/admin/fonctionsCompteModele';

/**
 * ══ 🔴 « LES COÛTS », LOT 2 (Arno, 03/11/2026, décision C9) — LES FONCTIONS D'UN PROFIL ═════════════════════════════════════════════════════════
 * Une case par fonction (Vente, Location, Gestion), plusieurs possibles ; pré-cochées d'après les données existantes (« déduite » : à confirmer
 * en enregistrant). Elles ne donnent aucun droit : elles rangent les profils proposés pour un salaire chargé dans « Les coûts ». Le bloc lit et
 * enregistre lui-même (journalisé). Sans la migration 451 : il le dit, rien ne s'écrit.
 */
export function BlocFonctionsCompte({ compteId }: { compteId: number }) {
  const [etat, setEtat] = useState<EtatFonctions | null>(null);
  const [choix, setChoix] = useState<Fonction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [lecture, setLecture] = useState(0);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/comptes/${compteId}/fonctions`, { cache: 'no-store' });
        const j = (await r.json()) as EtatFonctions;
        // une réponse qui n'a pas la forme attendue (route absente, autre réponse) : le bloc reste absent
        if (vivant && r.ok && Array.isArray(j?.valeur) && Array.isArray(j?.deduites) && typeof j?.disponible === 'boolean') { setEtat(j); setChoix(j.valeur); }
      } catch { /* le bloc reste absent */ }
    })();
    return () => { vivant = false; };
  }, [compteId, lecture]);
  if (etat === null) return null;
  const basculer = (f: Fonction): void => setChoix((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f]));
  const change = JSON.stringify([...choix].sort()) !== JSON.stringify([...etat.valeur].sort()) || etat.deduites.length > 0;
  const enregistrer = async (): Promise<void> => {
    setEnvoi(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${compteId}/fonctions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fonctions: choix }) });
      const body = await res.json().catch(() => null) as { change?: boolean; erreur?: string } | null;
      if (res.ok) { setMsg(body?.change === false ? 'Fonctions inchangées.' : 'Fonctions enregistrées.'); setLecture((x) => x + 1); }
      else setMsg(body?.erreur ?? 'Enregistrement refusé.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="cpt-identite" role="group" aria-labelledby={`fonctions-${compteId}`} style={{ marginTop: 8 }} data-fonctions-compte>
      <div className="cpt-perms-titre" id={`fonctions-${compteId}`}>Fonctions</div>
      {!etat.disponible ? <span className="cpt-aide" data-fonctions-indisponibles>Disponible après la mise à jour de la base (migration 451).</span> : <>
        <div className="cpt-ouinon" data-choix-fonctions>
          {FONCTIONS.map((f) => (
            <button key={f} type="button" className="cpt-ouinon__btn" aria-pressed={choix.includes(f)} disabled={envoi} onClick={() => basculer(f)} data-fonction={f}>
              <span className="cpt-ouinon__ind" aria-hidden="true">{choix.includes(f) ? '☑' : '☐'}</span>{LIBELLE_FONCTION[f]}
              {etat.deduites.includes(f) && <small className="cpt-aide" data-fonction-deduite> (déduite)</small>}
            </button>
          ))}
        </div>
        <span className="cpt-aide">Plusieurs possibles. Aucun droit n’en découle : elles rangent les profils proposés pour un salaire dans « Les coûts ».</span>
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={envoi || !change} onClick={() => void enregistrer()} data-enregistrer-fonctions>Enregistrer les fonctions</button>
        </div>
      </>}
      {msg !== null && <span className="cpt-aide" role="status" data-fonctions-message>{msg}</span>}
    </div>
  );
}
