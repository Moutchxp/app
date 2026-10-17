'use client';

import { useState } from 'react';
import { EtatLecture, liste, useLecture } from './commun';
import { LIBELLE_CATEGORIE, resumeBien, type BienLocation } from '../../../../lib/location/locationBien';
import type { LigneLocataire, LigneProprietaire, PageListe } from '../../../../lib/location/locationRepo';

/**
 * ══ TUILE LOCATION — LES LISTES (déplacées de l'ancien accueil, refonte du 17/10/2026) ═══════════════════════════════
 * Les mêmes listes qu'avant (Propriétaires, Locataires, Biens en arbre, pagination), plus la bascule « Actifs / Anciens » :
 * une fiche SORTIE DU PORTEFEUILLE quitte les actifs et reste consultable dans les anciens.
 */
export type SorteListe = 'proprietaires' | 'locataires' | 'biens';
type Ligne = LigneProprietaire | LigneLocataire | (BienLocation & { annexes?: BienLocation[] });

export function ListeLocation({ sorte }: { sorte: SorteListe }) {
  const [page, setPage] = useState(0);
  const [anciens, setAnciens] = useState(false);
  const { etat } = useLecture<PageListe<Ligne>>(`liste=${sorte}&page=${page}${anciens ? '&anciens=1' : ''}`);
  return (
    <>
      <div className="loc-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="loc-bascule" role="group" aria-label="Actifs ou anciens">
          <button type="button" aria-pressed={!anciens} onClick={() => { setAnciens(false); setPage(0); }}>Actifs</button>
          <button type="button" aria-pressed={anciens} onClick={() => { setAnciens(true); setPage(0); }}>Anciens (sortis du portefeuille)</button>
        </span>
        {etat.etat === 'ok' && <span className="loc-muet">{etat.data.total} au total{etat.data.total > 50 ? ` — page ${page + 1}` : ''}</span>}
      </div>
      {etat.etat !== 'ok' ? <EtatLecture etat={etat} /> : liste(etat.data.lignes).length === 0
        ? <p className="loc-muet">{anciens ? 'Aucune fiche sortie du portefeuille.' : 'Aucune fiche.'}</p> : (
          <>
            <ul className={sorte === 'biens' ? 'loc-arbre' : 'loc-liste'} style={{ marginTop: 10 }}>
              {sorte === 'proprietaires' && (liste(etat.data.lignes) as LigneProprietaire[]).map((p) => (
                <li key={p.id}>
                  <a href={`/admin/location/proprietaire/${p.id}`}>{p.nom}</a>
                  <span className="loc-muet">{p.biens} bien{p.biens > 1 ? 's' : ''}{p.numeroMandat === null ? '' : ` · mandat ${p.numeroMandat}`}</span>
                </li>
              ))}
              {sorte === 'locataires' && (liste(etat.data.lignes) as LigneLocataire[]).map((l) => (
                <li key={l.id}>
                  <span>
                    <a href={`/admin/location/locataire/${l.id}`}>{l.nom}</a>{' '}
                    <span className={`loc-pastille${l.enPlace ? ' loc-pastille--vert' : ' loc-pastille--violet'}`}>{l.enPlace ? 'en place' : 'ancien'}</span>
                  </span>
                  <span className="loc-muet">{l.logement ?? ''}</span>
                </li>
              ))}
              {sorte === 'biens' && (liste(etat.data.lignes) as (BienLocation & { annexes?: BienLocation[] })[]).flatMap((b) => [
                <LigneBien key={b.id} b={b} />,
                ...liste(b.annexes).map((a) => <LigneBien key={a.id} b={a} enfant />),
              ])}
            </ul>
            <div className="loc-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>← Précédents</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={(page + 1) * 50 >= etat.data.total}
                onClick={() => setPage((x) => x + 1)}>Suivants →</button>
            </div>
          </>
        )}
    </>
  );
}

export function LigneBien({ b, enfant = false }: { b: BienLocation; enfant?: boolean }) {
  const resume = resumeBien(b);
  return (
    <li className={enfant ? 'loc-enfant' : undefined}>
      <span>
        <a href={`/admin/location/bien/${b.id}`}>
          {enfant ? `${LIBELLE_CATEGORIE[b.categorie]}${b.porte === null ? '' : ` n° ${b.porte}`}` : [b.adresse, b.commune].filter((x) => x).join(', ') || `Bien ${b.numero}`}
        </a>{' '}
        <span className="loc-pastille">{LIBELLE_CATEGORIE[b.categorie]}</span>
        {b.sorti === true && <> <span className="loc-pastille loc-pastille--violet">sorti</span></>}
        {resume !== '' && <span className="loc-muet"> · {resume}</span>}
      </span>
      <span className="loc-muet">{b.proprietaire ?? ''}{b.locataireEnPlace === null ? '' : ` · loué à ${b.locataireEnPlace}`}</span>
    </li>
  );
}
