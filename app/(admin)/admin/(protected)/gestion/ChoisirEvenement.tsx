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

export function ChoisirEvenement({
  choisi, onChoisir, onNouveau, exclure, autoFocus = false, restreindreA = null, motSiRestreintVide,
}: {
  choisi: number | null;
  /**
   * ⚠️ LE SECOND ARGUMENT EST FACULTATIF (lot CLASSER-PAR-LA-MODALE, point 3) : l'événement TROUVÉ, pour
   * l'appelant qui doit le NOMMER avant de l'écrire (« à lier : GES-… · objet »). Les trois autres gestes qui
   * montent ce composant l'ignorent, et rien ne change pour eux.
   */
  onChoisir: (id: number | null, trouve?: EvenementTrouve | null) => void;
  /** Fourni → une entrée « + Nouvel événement » apparaît DANS la liste, à sa place naturelle. */
  onNouveau?: () => void;
  /** L'événement d'où l'on part, quand on DÉPLACE : le proposer comme destination n'aurait pas de sens. */
  exclure?: number | null;
  autoFocus?: boolean;
  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — N'OFFRIR QUE LES ÉVÉNEMENTS DES BIENS COCHÉS ═══════════════════
   *
   * DEMANDE D'ARNO (06/10/2026) : « “Lier à un événement” (liste des événements du ou des biens cochés) ».
   *
   * 🔴 LA RESTRICTION SE FAIT SUR DES IDENTIFIANTS, et non par un nouveau filtre de recherche côté serveur, pour
   * une raison précise : « les événements d'un bien » est une question DÉJÀ répondue par une route existante
   * (`/historique/evenements?cible=lot-…`, lot HISTORIQUE-BIEN-1). Y ajouter un second prédicat dans la recherche
   * aurait donné deux définitions de « les événements de ce bien », et c'est celle qu'on regarde le moins qui
   * aurait fini par mentir. L'appelant lit la route, et passe la liste.
   *
   * ⚠️ `null` ⇒ AUCUNE RESTRICTION : la recherche est exactement celle d'avant ce lot, pour les trois autres
   * gestes qui montent ce composant. Une liste VIDE, elle, veut dire « aucun événement » — ce n'est pas la même
   * chose, et elle se dit avec `motSiRestreintVide`.
   */
  restreindreA?: readonly number[] | null;
  /** Ce qu'on dit quand la restriction ne laisse rien. Absent ⇒ la phrase ordinaire. */
  motSiRestreintVide?: string;
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
          const data = (await res.json()) as { evenements?: EvenementTrouve[]; max?: number };
          if (annule) return;
          /**
           * ⚠️ `?? []` ET NON `data.evenements` NU. Une réponse qui ne porte pas le champ — un serveur plus ancien,
           * une route en erreur douce — donnait `undefined`, et le `.filter` du rendu faisait tomber TOUT l'encart
           * au-dessus du mail. Un écran ne doit jamais s'écrouler parce qu'un serveur lui parle un langage d'hier :
           * c'est la règle déjà appliquée à `classement`, `nonLus` et `pleinTexte`. Attrapé par la suite de tests
           * pendant le lot CONTACTS-ET-EVENEMENT.
           */
          const evenements = data.evenements ?? [];
          setResultats(evenements);
          setPlein(evenements.length >= (data.max ?? Number.POSITIVE_INFINITY));
          setEtat('ok');
        } catch {
          if (!annule) setEtat('erreur');
        }
      })();
    }, saisie === '' ? 0 : DELAI_FRAPPE_MS);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  useEffect(() => { if (autoFocus) champ.current?.focus(); }, [autoFocus]);

  const visibles = resultats
    .filter((e) => e.id !== exclure)
    /* 🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — hors des biens cochés, l'événement n'est pas proposé. */
    .filter((e) => restreindreA === null || restreindreA.includes(e.id));
  const choisirLe = useCallback(
    (id: number, trouve: EvenementTrouve) => onChoisir(id === choisi ? null : id, trouve),
    [choisi, onChoisir],
  );

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
              onClick={() => choisirLe(e.id, e)}>
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
        <p className="gst-note">
          {restreindreA !== null && motSiRestreintVide !== undefined && saisie.trim() === ''
            ? motSiRestreintVide
            : (saisie.trim() === '' ? 'Aucun événement pour l’instant.' : 'Aucun événement ne correspond.')}
        </p>
      )}
      {plein && <p className="gst-note">Seuls les {resultats.length} premiers sont affichés — précisez votre recherche.</p>}
    </div>
  );
}
