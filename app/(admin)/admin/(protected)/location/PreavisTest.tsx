'use client';

import { useState } from 'react';
import { envoyer } from './commun';
import { BADGE_TEST, EXPLICATION_TEST } from '../../../../lib/location/preavisTest';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';

/**
 * ══ 🔴🔴 LE PRÉAVIS DE TEST, À L'ÉCRAN (Arno, 14/11/2026, 473) ═══════════════════════════════════════════════════════════════════════════
 * « Préavis de test » : un bouton DISCRET sous les tris du bloc des préavis de la Location, pour les administrateurs seulement. Il ouvre une
 * explication (bien et locataire fictifs, mails à vous seul…) et « Créer le préavis de test ». La ligne créée porte le badge « TEST » ; dépliée,
 * un bandeau le redit et propose « Supprimer ce préavis de test » (confirmation dans la page, jamais une boîte du navigateur).
 */
export function CreerPreavisTest({ disponible, apres }: { disponible: boolean; apres: (message: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const creer = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer({ action: 'creer-preavis-test' }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    setOuvert(false);
    apres('Préavis de test créé (badge « TEST ») : ses mails ne partent qu’à votre adresse. Ouvrez la ligne pour programmer la pré-visite (« Dans 2 minutes »).');
  };
  return (
    <div className="pvt" data-preavis-test>
      {!ouvert ? (
        <button type="button" className="pvt-discret" onClick={() => setOuvert(true)} data-ouvrir-preavis-test>Préavis de test</button>
      ) : (
        <div className="pvt-panneau" role="group" aria-label="Préavis de test" data-panneau-preavis-test>
          <p className="pvt-titre"><span className="pvt-badge">{BADGE_TEST}</span>Préavis de test (administrateurs)</p>
          <p className="pvt-texte">{EXPLICATION_TEST}</p>
          {!disponible && <p className="pvt-texte" role="note" data-preavis-test-indisponible>Disponible après la mise à jour de la base (migration 473).</p>}
          {refus !== null && <p className="pvt-refus" role="alert" data-preavis-test-refus>{refus}</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!disponible || envoi} onClick={() => { void creer(); }} data-creer-preavis-test>
              {envoi ? 'Création…' : 'Créer le préavis de test'}</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => { setOuvert(false); setRefus(null); }} data-annuler-preavis-test>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BandeauPreavisTest({ l, apres }: { l: LignePreavisAccueil; apres: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const supprimer = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer({ action: 'supprimer-preavis-test', testId: l.testId }, { propre: true });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    apres();
  };
  return (
    <div className="pvt-bandeau" role="note" data-bandeau-preavis-test>
      <p className="pvt-titre"><span className="pvt-badge">{BADGE_TEST}</span>Préavis de test — bien et locataire fictifs ; tous ses mails ne partent qu’à votre adresse.</p>
      {refus !== null && <p className="pvt-refus" role="alert">{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        {!confirmer
          ? <button type="button" className="svv-btn svv-btn-outline gst-btn pvt-supprimer" onClick={() => setConfirmer(true)} data-supprimer-preavis-test>Supprimer ce préavis de test</button>
          : <>
            <span className="pvt-texte">Le préavis et ses tâches seront annulés, et le test masqué partout (rien n’est effacé de l’historique).</span>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void supprimer(); }} data-confirmer-suppression-test>
              {envoi ? 'Suppression…' : 'Confirmer la suppression'}</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => setConfirmer(false)}>Annuler</button>
          </>}
      </div>
    </div>
  );
}

export const CSS_PREAVIS_TEST = `
.pvt{margin:6px 0 10px}
.pvt-discret{background:none;border:0;padding:6px 0;min-height:44px;font-size:.8rem;color:var(--color-svv-muted);text-decoration:underline;cursor:pointer}
.pvt-panneau,.pvt-bandeau{border:2px dashed var(--color-svv-orange);border-radius:12px;padding:12px;background:var(--color-svv-orange-soft);margin:6px 0 10px}
.pvt-titre{font-weight:700;margin:0 0 6px;color:var(--color-svv-ink)}
.pvt-texte{font-size:.85rem;margin:0 0 8px;color:var(--color-svv-ink)}
.pvt-refus{font-size:.85rem;margin:0 0 8px;color:var(--color-svv-red)}
.pvt-badge{display:inline-block;background:var(--color-svv-orange);color:var(--color-svv-orange-soft);font-weight:800;font-size:.7rem;letter-spacing:.06em;border-radius:6px;padding:2px 7px;margin-right:6px;vertical-align:middle}
`;
