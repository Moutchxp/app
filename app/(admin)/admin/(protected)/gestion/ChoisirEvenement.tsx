'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * LOT 4d — CHOISIR UN ÉVÉNEMENT : un champ de recherche et une liste qui se filtre au fil de la frappe.
 *
 * LE MÊME COMPOSANT SERT LES TROIS GESTES qui doivent désigner une carte : affecter un échange depuis la file,
 * déplacer un échange, déplacer un mail. Une seule implémentation, donc un seul comportement — ce qui se trouve dans
 * un cas se trouve dans les trois. C'est aussi ce qui fait disparaître la « liste simple » du panneau d'affectation,
 * inutilisable dès la vingtième carte.
 *
 * ON CHERCHE PAR CE DONT ON SE SOUVIENT : le titre, le demandeur, l'adresse, la référence GES-…, et le nom ou
 * l'adresse des expéditeurs des messages déjà rattachés — on se souvient du plombier bien avant du titre de la carte.
 *
 * La frappe est TEMPORISÉE (250 ms) : on interroge le serveur quand la frappe s'arrête, pas à chaque lettre.
 */
export interface EvenementTrouve {
  id: number;
  reference: string;
  objet: string;
  demandeur: string | null;
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  nbFils: number;
}

const DELAI_FRAPPE_MS = 250;

export function ChoisirEvenement({ choisi, onChoisir, onNouveau, exclure, autoFocus = false }: {
  choisi: number | null;
  onChoisir: (id: number | null) => void;
  /** Fourni → une entrée « + Nouvel événement » apparaît DANS la liste, à sa place naturelle. */
  onNouveau?: () => void;
  /** L'événement d'où l'on part, quand on DÉPLACE : le proposer comme destination n'aurait pas de sens. */
  exclure?: number | null;
  autoFocus?: boolean;
}) {
  const [saisie, setSaisie] = useState('');
  const [resultats, setResultats] = useState<EvenementTrouve[]>([]);
  const [etat, setEtat] = useState<'charge' | 'ok' | 'erreur'>('charge');
  const [plein, setPlein] = useState(false);
  const champ = useRef<HTMLInputElement | null>(null);

  // Une seule lecture par arrêt de frappe. `annule` couvre les deux cas : composant démonté, et réponse périmée
  //   (une réponse lente à « fui » ne doit pas écraser les résultats de « fuite »).
  useEffect(() => {
    let annule = false;
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/evenements?q=${encodeURIComponent(saisie)}`, { cache: 'no-store' });
          if (annule) return;
          if (!res.ok) { setEtat('erreur'); return; }
          const data = (await res.json()) as { evenements: EvenementTrouve[]; max: number };
          if (annule) return;
          setResultats(data.evenements);
          setPlein(data.evenements.length >= data.max);
          setEtat('ok');
        } catch {
          if (!annule) setEtat('erreur');
        }
      })();
    }, saisie === '' ? 0 : DELAI_FRAPPE_MS);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  useEffect(() => { if (autoFocus) champ.current?.focus(); }, [autoFocus]);

  const visibles = resultats.filter((e) => e.id !== exclure);
  const choisirLe = useCallback((id: number) => onChoisir(id === choisi ? null : id), [choisi, onChoisir]);

  return (
    <div className="gst-choix">
      <label className="gst-champ">
        <span className="svv-label">Chercher un événement</span>
        <input ref={champ} className="gst-saisie" type="search" value={saisie} autoComplete="off"
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="titre, nom, adresse, GES-…" maxLength={120} />
      </label>

      {etat === 'erreur' && <p className="gst-erreur" role="status">Recherche impossible.</p>}

      <ul className="gst-resultats" role="listbox" aria-label="Événements">
        {onNouveau && (
          <li>
            <button type="button" className="gst-resultat gst-resultat--nouveau" onClick={onNouveau}>
              + Nouvel événement
            </button>
          </li>
        )}
        {visibles.map((e) => (
          <li key={e.id}>
            <button type="button" role="option" aria-selected={choisi === e.id}
              className={`gst-resultat${choisi === e.id ? ' gst-resultat--choisi' : ''}`}
              onClick={() => choisirLe(e.id)}>
              <span className="gst-resultat-haut">
                <span className="gst-objet">{e.objet}</span>
                <span className="gst-ref">{e.reference}</span>
              </span>
              <span className="gst-resultat-bas">
                {e.demandeur && <>{e.demandeur}<span className="gst-sep" aria-hidden="true">·</span></>}
                {e.adresseLibre && <>{e.adresseLibre}<span className="gst-sep" aria-hidden="true">·</span></>}
                <span>{e.nbFils} échange{e.nbFils > 1 ? 's' : ''}</span>
                {e.etat === 'traite' && <><span className="gst-sep" aria-hidden="true">·</span><span>traité</span></>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* On dit toujours ce qu'on montre et ce qu'on tait — ici comme dans la file. */}
      {etat === 'ok' && visibles.length === 0 && (
        <p className="gst-note">{saisie.trim() === '' ? 'Aucun événement pour l’instant.' : 'Aucun événement ne correspond.'}</p>
      )}
      {plein && <p className="gst-note">Seuls les {resultats.length} premiers sont affichés — précisez votre recherche.</p>}
    </div>
  );
}
