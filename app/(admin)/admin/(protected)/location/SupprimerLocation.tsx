'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_SUIVI, posterSuivi } from './suiviApi';

/**
 * ══ 🔴🔴 LOT LS1 (Arno, 30/10/2026, option A ; suppression autorisée par Arno) — « SUPPRIMER » UNE LOCATION (Suivi du mois) ══════════════════
 * En bas de la ligne dépliée, après « Convertir en … » : un bouton au texte rouge, discret. Il ouvre la confirmation, écrite d'après le plan
 * du SERVEUR (la location, ses locataires ; ceux qu'un autre bien retient sont conservés, avec la phrase qui le dit). « Oui, supprimer »
 * (rouge) appelle le serveur, qui RECALCULE le plan sous verrou : ce que l'écran a montré ne fait jamais foi. « Annuler », Échap, la croix ou
 * un clic dehors ne changent rien. Un observateur ne le voit pas (le marquage « lecture seule » de la page le masque) et le serveur le refuse
 * (403, garde centrale).
 */

interface LocataireDuPlan { id: number; nom: string; conserve: boolean; autreBien: string | null }
interface Plan { id: number; bien: string; dateSignature: string; locataires: LocataireDuPlan[] }

const fr = (iso: string): string => iso.split('-').reverse().join('/');

/** La phrase d'un locataire dans la confirmation. PUR. */
export function phraseLocataire(l: LocataireDuPlan): string {
  return l.conserve
    ? `${l.nom} est aussi rattaché à ${l.autreBien ?? 'un autre bien'}. Ses coordonnées sont conservées pour cette autre location ; seul son lien avec la location supprimée est retiré.`
    : `${l.nom} — profil supprimé`;
}
/** Le texte d'en-tête de la confirmation (selon qu'au moins un profil est supprimé). PUR. */
export function enteteConfirmation(p: Plan): { action: string; aucunProfil: boolean } {
  const aucunProfil = !p.locataires.some((l) => !l.conserve);
  const loc = `${p.bien} — ${fr(p.dateSignature)}`;
  return { aucunProfil, action: aucunProfil ? `Cette action supprime la location ${loc}.` : `Cette action supprime la location ${loc} et le profil du ou des locataires concernés.` };
}

export function SupprimerLocation({ id: brut, onFini }: { id: number | string; onFini: () => void }) {
  const id = Number(brut);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    if (plan === null) return undefined;
    const touche = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !envoi) setPlan(null); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [plan, envoi]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const ouvrir = async (): Promise<void> => {
    setMotif(null);
    try {
      const r = await fetch(`${API_SUIVI}?vue=suppression-location&id=${id}`, { cache: 'no-store' });
      const d = await r.json() as { etat?: string; data?: Plan; motif?: string };
      if (d.etat === 'ok' && d.data !== undefined) setPlan(d.data);
      else setMotif(d.motif ?? 'Cette location n’existe plus (déjà supprimée ?).');
    } catch { setMotif('Lecture impossible : le serveur n’a pas répondu.'); }
  };
  const confirmer = async (): Promise<void> => {
    setEnvoi(true);
    const r = await posterSuivi({ action: 'supprimer-location', id });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    setPlan(null);
    onFini();
  };
  const e = plan === null ? null : enteteConfirmation(plan);
  return (
    <div className="fdm-supprimer" data-supprimer-location-bloc={id}>
      <button type="button" className="fdm-supprimer-location" onClick={() => { void ouvrir(); }} data-supprimer-location={id}>Supprimer</button>
      {motif !== null && plan === null && <p className="cp-refus" role="alert" data-motif-suppression>{motif}</p>}
      {plan !== null && e !== null && typeof document !== 'undefined' && createPortal(
        <div className="tdb-voile" onMouseDown={(x) => { if (x.target === x.currentTarget && !envoi) setPlan(null); }}>
          <div className="tdb-fenetre fdm-fenetre-suppression" role="alertdialog" aria-modal="true" aria-labelledby={`fdm-supp-${id}`} data-fenetre-suppression={id}>
            <header className="tdb-fenetre-tete"><h3 id={`fdm-supp-${id}`}>Supprimer cette location ?</h3>
              <button type="button" className="tdb-x" aria-label="Fermer" onClick={() => setPlan(null)} disabled={envoi}>×</button></header>
            <div className="tdb-fenetre-corps fdm-suppression-corps">
              {e.aucunProfil && <p className="fdm-suppression-aucun" data-aucun-profil>Aucun profil de locataire ne sera supprimé.</p>}
              <p data-phrase-action>{e.action}</p>
              <p data-phrase-conserve>Toutes les données du ou des propriétaires et toutes les données du bien sont conservées, pour permettre une nouvelle location.</p>
              {plan.locataires.length > 0 && <ul className="fdm-suppression-liste" data-locataires-suppression>
                {plan.locataires.map((l) => <li key={l.id} data-locataire-suppression={l.id} data-conserve={l.conserve ? 'oui' : 'non'}>{phraseLocataire(l)}</li>)}
              </ul>}
              <p className="loc-muet fdm-suppression-limite" data-limite-gestion>Dans la tuile Gestion, la fiche du bien peut encore afficher cet ancien locataire.</p>
              {motif !== null && <p className="cp-refus" role="alert" data-motif-suppression>{motif}</p>}
              <div className="fdm-suppression-actions">
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-confirmer-suppression={id}>
                  {envoi ? 'Suppression…' : 'Oui, supprimer'}</button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => setPlan(null)} data-annuler-suppression={id}>Annuler</button>
              </div>
            </div>
          </div>
        </div>, document.querySelector('.svv-adm-root') ?? document.body)}
    </div>
  );
}

/** Les styles (AUCUN ACCENT GRAVE ICI : littéral gabarit). Un observateur ne voit pas le bouton (le marquage lecture seule le masque). */
export const CSS_SUPPRIMER_LOCATION = `
.fdm-supprimer{display:inline-flex;flex-direction:column;align-items:flex-start;gap:4px}
.fdm-supprimer-location{appearance:none;border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-weight:700;min-height:44px;padding:0 10px;cursor:pointer;border-radius:10px}
.fdm-supprimer-location:hover{text-decoration:underline}
.fdm-supprimer-location:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.fdm-supprimer-location[data-lecture-seule]{display:none !important}
.fdm-fenetre-suppression{width:min(560px,100%)}
.fdm-suppression-corps{display:flex;flex-direction:column;gap:10px}
.fdm-suppression-corps p{margin:0}
.fdm-suppression-aucun{font-weight:700}
.fdm-suppression-liste{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.fdm-suppression-limite{font-size:.82rem}
.fdm-suppression-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.fdm-suppression-actions .svv-btn{width:auto;min-height:44px}
`;
