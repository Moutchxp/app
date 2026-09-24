'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChoisirEvenement } from './ChoisirEvenement';

/**
 * LOT 4b — LE PANNEAU « AFFECTER À UN ÉVÉNEMENT », ouvert sous la ligne de l'échange.
 *
 * DEUX VOIES, jamais un devinement : rattacher à un événement EXISTANT, ou en OUVRIR un nouveau. Les champs du nouvel
 * événement sont PRÉ-REMPLIS avec ce que le fil contient (objet, et l'interlocuteur du dernier message REÇU — celui qui
 * demande, pas nous), et ils restent TOUS modifiables : la proposition est une commodité, jamais une vérité. Rien n'est
 * déduit au-delà de ce qui est écrit dans le mail — il n'existe aucun référentiel de biens, et on n'en invente pas un.
 *
 * Le panneau ne charge ses données qu'à l'OUVERTURE (un échange jamais déplié ne coûte aucune requête), et il rend la
 * main à l'appelant après un succès : c'est lui qui recharge l'écran.
 *
 * LOT 4d — la voie « événement existant » n'est plus une liste déroulante mais la MÊME RECHERCHE que partout ailleurs
 * (`ChoisirEvenement`). Une liste simple tenait tant qu'il y avait trois cartes ; à la vingtième elle devient une
 * corvée, et à la centième une impasse. On cherche par ce dont on se souvient : le nom du locataire, l'adresse, le
 * plombier qui a écrit — pas par le rang dans un menu.
 */
type Propositions = { objet: string; demandeurNom: string | null; demandeurEmail: string | null; adresseLibre: string | null };

export function PanneauAffecter({ filId, objet: objetDuFil, onFait, onAnnuler, voieInitiale = 'nouveau' }: {
  filId: number;
  /** L'objet de l'échange visé, RAPPELÉ en tête du panneau : on doit voir sur QUOI on agit, sans remonter des yeux. */
  objet?: string;
  onFait: (message: string) => void;
  onAnnuler: () => void;
  /**
   * LOT 5-GMAIL — par quelle voie on ARRIVE. « Classer dans une carte » ouvre sur la recherche d'événements,
   * « Créer un événement » sur le formulaire. Les DEUX voies restent offertes dans les deux cas : c'est le point de
   * départ qui change, jamais ce qui est possible. Absent = `nouveau`, comme avant ce lot.
   */
  voieInitiale?: 'nouveau' | 'existant';
}) {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [voie, setVoie] = useState<'nouveau' | 'existant'>(voieInitiale);
  const [choisi, setChoisi] = useState<number | null>(null);
  const [objet, setObjet] = useState('');
  const [demandeur, setDemandeur] = useState('');
  const [adresse, setAdresse] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, { cache: 'no-store' });
        if (!res.ok) { if (!annule) { setErreur('Chargement impossible.'); setChargement(false); } return; }
        const data = (await res.json()) as { propositions: Propositions | null };
        if (annule) return;
        setObjet(data.propositions?.objet ?? '');
        setDemandeur(data.propositions?.demandeurNom ?? data.propositions?.demandeurEmail ?? '');
        setAdresse(data.propositions?.adresseLibre ?? '');
        setChargement(false);
      } catch { if (!annule) { setErreur('Chargement impossible (réseau).'); setChargement(false); } }
    })();
    return () => { annule = true; };
  }, [filId]);

  const valider = useCallback(async () => {
    if (enCours) return;
    setEnCours(true);
    setErreur(null);
    try {
      const corps = voie === 'existant'
        ? { evenementId: choisi }
        : { nouveau: { objet, demandeurNom: demandeur, adresseLibre: adresse } };
      const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const data = (await res.json()) as { ok?: boolean; reference?: string; erreur?: string };
      if (!res.ok || !data.ok) { setErreur(data.erreur ?? 'Rattachement impossible.'); return; }
      onFait(`Échange rattaché à l’événement ${data.reference ?? ''}.`);
    } catch {
      setErreur('Rattachement impossible : le serveur n’a pas répondu.');
    } finally {
      setEnCours(false);
    }
  }, [enCours, voie, choisi, objet, demandeur, adresse, filId, onFait]);

  if (chargement) return <p className="gst-info" role="status">Chargement…</p>;

  const pretAValider = voie === 'existant' ? choisi !== null : objet.trim() !== '';

  return (
    <div className="gst-panneau">
      {objetDuFil && <p className="gst-panneau-titre">Rattacher <span className="gst-objet">{objetDuFil}</span></p>}
      {erreur && <p className="gst-erreur" role="status">{erreur}</p>}

      <div className="gst-voies" role="group" aria-label="Rattacher à">
        <button type="button" className={`gst-voie${voie === 'nouveau' ? ' gst-voie--active' : ''}`}
          aria-pressed={voie === 'nouveau'} onClick={() => setVoie('nouveau')}>Nouvel événement</button>
        <button type="button" className={`gst-voie${voie === 'existant' ? ' gst-voie--active' : ''}`}
          aria-pressed={voie === 'existant'} onClick={() => setVoie('existant')}>
          Événement existant
        </button>
      </div>

      {voie === 'nouveau' ? (
        <div className="gst-champs">
          <label className="gst-champ">
            <span className="svv-label">Quoi</span>
            <input className="gst-saisie" value={objet} onChange={(e) => setObjet(e.target.value)}
              placeholder="ex. Fuite salle de bain" maxLength={300} />
          </label>
          <label className="gst-champ">
            <span className="svv-label">Qui demande</span>
            <input className="gst-saisie" value={demandeur} onChange={(e) => setDemandeur(e.target.value)}
              placeholder="nom ou adresse" maxLength={300} />
          </label>
          <label className="gst-champ">
            <span className="svv-label">Adresse (texte libre)</span>
            <input className="gst-saisie" value={adresse} onChange={(e) => setAdresse(e.target.value)}
              placeholder="ce que le mail indique" maxLength={300} />
          </label>
          <p className="gst-note">Pré-rempli d’après l’échange, entièrement modifiable. L’adresse reste du texte libre : il n’existe pas encore de fichier des lots.</p>
        </div>
      ) : (
        <>
          <ChoisirEvenement choisi={choisi} onChoisir={setChoisi} autoFocus />
          <p className="gst-note">Un événement peut regrouper plusieurs échanges.</p>
        </>
      )}

      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={enCours || !pretAValider} onClick={() => void valider()}>
          {enCours ? 'Rattachement…' : 'Rattacher'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={enCours} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}
