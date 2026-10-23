'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CreationBien } from '../location/CreationBien';
import { ModaleIssue } from '../location/ModaleIssue';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';
import { annoncerBienModifie, type ImportBien } from './EditionEncart';

/**
 * ══ 🔴🔴 « MODIFIER » LA FICHE DU BIEN : LE FORMULAIRE « NOUVEAU BIEN » ENTIER, PRÉ-REMPLI (Arno, 23/10/2026) ═══════════════════════
 *
 * L'UNIQUE « Modifier » de l'encart du bien (il remplace les cinq « Modifier » par groupe — accord d'Arno du 23/10/2026) ouvre, en
 * plein écran, le MÊME composant que « Ajouter un nouveau bien » (`CreationBien`, mode modification), rempli des valeurs ACTUELLES
 * relues à la source. Le même écran dans la Gestion et dans la Location (la fiche est commune). Échap ou « Annuler » referme (une
 * saisie en cours demande confirmation). `versionDistante` : l'empreinte que la fiche relit toutes les quelques secondes — si elle
 * change pendant la saisie, le formulaire le dit (« Ce bien a été modifié par ailleurs — recharger ? »).
 */
const API = '/api/admin/gestion/annuaire/location';

export function ModifierFicheBien({ lotId, versionDistante, importe, onFermer }: { lotId: number; versionDistante: string | null; importe?: ImportBien; onFermer: () => void }) {
  const [lecture, setLecture] = useState<LectureFiche | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const panneau = useRef<HTMLDivElement | null>(null);
  const lire = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch(`${API}?ficheEntiere=${lotId}`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: LectureFiche };
      if (d.etat === 'ok' && d.data) { setLecture(d.data); setRefus(null); setN((x) => x + 1); return; }
      setRefus(d.etat === 'sans_schema' ? 'La base de données n’est pas à jour pour modifier ce bien.' : 'La fiche du bien n’a pas pu être lue.');
    } catch { setRefus('La fiche du bien n’a pas pu être lue : le serveur n’a pas répondu.'); }
  }, [lotId]);
  useEffect(() => { void lire(); }, [lire]);
  // La page dessous ne défile plus tant que le formulaire est ouvert ; le focus va au panneau.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panneau.current?.focus();
    return () => { document.body.style.overflow = avant; };
  }, []);
  return (
    <div className="mfb-plein" role="dialog" aria-modal="true" aria-label="Modifier le bien" tabIndex={-1} ref={panneau} data-modifier-fiche-bien={lotId}>
      <style>{CSS_MODIFIER_FICHE_BIEN}</style>
      <div className="mfb-dedans">
        {lecture === null && refus === null && <p className="loc-muet" role="status">Lecture de la fiche du bien…</p>}
        {lecture === null && refus !== null && (
          <ModaleIssue sorte="erreur" titre="Modification impossible" onFermer={onFermer}
            echec={{ quoi: 'Le formulaire ne s’ouvre pas.', pourquoi: refus, faire: 'Fermez, puis réessayez dans un instant.', conserve: 'Rien n’a été modifié.' }}
            actions={[{ libelle: 'Fermer', onClick: onFermer, principal: true, repere: 'fermer-lecture' }]} />
        )}
        {lecture !== null && (
          <CreationBien key={`${lecture.version}-${n}`} proprietairesInitiaux={[]}
            modification={{
              lotId, lecture, versionDistante, importe, onFermer,
              onEnregistre: () => { annoncerBienModifie(lotId); onFermer(); },
              onRecharger: () => { void lire(); },
              enregistrer: async (saisie) => {
                const r = await fetch(API, {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
                  body: JSON.stringify({ action: 'modifier-fiche-bien', id: lotId, saisie }),
                });
                return { statut: r.status, corps: await r.json().catch(() => ({})) };
              },
              occupationsDe: async (annexeId) => {
                const r = await fetch(`${API}?apercuArchivage=${annexeId}&sujet=bien`, { cache: 'no-store' });
                const d = await r.json() as { data?: { occupees?: unknown[] } };
                return Array.isArray(d.data?.occupees) ? d.data.occupees.length : 0;
              },
            }} />
        )}
      </div>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; sous les modales (90) ; rien ne deborde. */
export const CSS_MODIFIER_FICHE_BIEN = `
.mfb-plein{position:fixed;inset:0;z-index:80;background:var(--color-svv-bg);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;cursor:auto;outline:none}
.mfb-dedans{box-sizing:border-box;max-width:1100px;margin:0 auto;padding:16px 16px 0;min-width:0}
.mfb-conflit{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 12px;padding:10px 14px;border-radius:14px;border:1px solid var(--color-svv-amber);background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.mfb-conflit .svv-btn{min-height:44px;width:auto;margin:0}
.mfb-sortie{opacity:.7}
.mfb-sortie .loc-annexe-titre{text-decoration:line-through}
.mfb-note{margin:0;color:var(--color-svv-muted);font-size:.9rem;overflow-wrap:anywhere}
.mfb-fige input:disabled{opacity:1;color:var(--color-svv-muted)}
`;
