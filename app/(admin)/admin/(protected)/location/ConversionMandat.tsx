'use client';

import { useState } from 'react';
import { posterSuivi } from './suiviApi';

const fr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** « Converti en « Mandat de gestion seul » le … par … — à l'origine « Bail » du … » : la mention d'une ligne convertie (Suivi du mois, fiche locataire). PUR. */
export function phraseConversion(conv: { le: string; par: string; typeOrigine: string; dateOrigine: string }): string {
  return `Converti en « Mandat de gestion seul » le ${fr(conv.le)}${conv.par ? ` par ${conv.par}` : ''} — à l’origine « ${conv.typeOrigine === 'bail' ? 'Bail' : conv.typeOrigine} » du ${fr(conv.dateOrigine)}.`;
}

/**
 * 🔴 LOT LS2 (Arno, 30/10/2026 ; retrait autorisé par Arno) — le bouton « Convertir en « Mandat de gestion seul » » est RETIRÉ (tout se corrige
 * avec « Modifier », « Fiche du bien », « Fiche locataire ») : ce composant ne rend plus que la mention d'une ligne DÉJÀ convertie et son
 * « Annuler la conversion » (non concernés par le retrait) ; une ligne non convertie : rien. Les données converties ne changent pas.
 *
 * ══ 🔴🔴 Arno (26/10/2026, décision C, migration 431) — « CONVERTIR EN « MANDAT DE GESTION SEUL » » (Suivi du mois) ═══════════════════════
 * Dans le panneau déplié d'une ligne « Bail » : pour le bail d'un locataire EN PLACE saisi comme un bail signé par l'agence. La ligne prend
 * la date du mandat (proposée : celle du mandat de gestion du propriétaire, modifiable), sort de « Baux signés » et du CA location, sa prime
 * est datée du mandat ; négociateur et apporteur restent. Une ligne convertie dit d'où elle vient et propose « Annuler la conversion ».
 * Chaque geste est confirmé avant d'écrire, et journalisé. Sans la migration 431 : le geste le dit (« disponible après la mise à jour »).
 * Ajout seul : aucun geste existant n'est retiré. Cibles de 44 px.
 */
export function ConversionMandat({ a, onFini }: {
  a: { id: number | string; type: string; conversion?: { le: string; par: string; typeOrigine: string; dateOrigine: string } | null };
  onFini: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const id = Number(a.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const conv = a.conversion ?? null;
  // 🔴 LOT LS2 — plus de « Convertir » : une ligne non convertie n'a plus rien ici.
  if (conv === null) return null;

  const confirmer = async (): Promise<void> => {
    setEnvoi(true);
    const r = await posterSuivi({ action: 'annuler-conversion', id });
    setEnvoi(false);
    if (r.motif !== null) { setMessage(r.motif); return; }
    setOuvert(false);
    onFini();
  };

  return (
      <div className="fdm-conversion" data-conversion={id}>
        <p className="loc-muet" data-conversion-origine>{phraseConversion(conv)}</p>
        {!ouvert ? (
          <button type="button" className="tdb-pilule fdm-raccourci" onClick={() => { setMessage(null); setOuvert(true); }} data-annuler-conversion={id}>Annuler la conversion</button>
        ) : (
          <div className="fdm-conversion-confirmer" role="group" aria-label="Annuler la conversion">
            <p>La ligne redeviendra « Bail » du {fr(conv.dateOrigine)}, avec ses honoraires d’origine : elle comptera de nouveau dans « Baux signés ».</p>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setOuvert(false)}>Revenir</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-confirmer-annulation={id}>
              {envoi ? 'Enregistrement…' : 'Confirmer l’annulation'}</button>
          </div>
        )}
        {message !== null && <p className="cp-refus" role="alert">{message}</p>}
      </div>
  );
}
