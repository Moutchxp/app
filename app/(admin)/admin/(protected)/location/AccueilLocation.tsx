'use client';

import { useEffect, useState } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, useLecture } from './commun';
import { LIBELLE_CATEGORIE, resumeBien, type BienLocation } from '../../../../lib/location/locationBien';
import type { LigneLocataire, LigneProprietaire, PageListe, ResultatsLocation } from '../../../../lib/location/locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — L'ACCUEIL (/admin/location) ════════════════════════════════════════════════════════════════
 * Demande d'Arno (17/10/2026) : « recherche unique (personne, bien, adresse), bouton “Nouveau propriétaire + bien”,
 * listes Propriétaires / Locataires / Biens ». Les DONNÉES sont celles de la Gestion (même annuaire) ; l'écran est ici.
 */
type Onglet = 'proprietaires' | 'locataires' | 'biens';

export function AccueilLocation({ administrateur }: { administrateur: boolean }) {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('proprietaires');
  const [page, setPage] = useState(0);

  // La recherche part 300 ms après la dernière frappe : un appel par intention, pas par touche.
  useEffect(() => {
    const t = setTimeout(() => setTerme(texte.trim()), 300);
    return () => clearTimeout(t);
  }, [texte]);

  const recherche = useLecture<ResultatsLocation>(terme.length >= 2 ? `q=${encodeURIComponent(terme)}` : null);
  const liste = useLecture<PageListe<LigneProprietaire | LigneLocataire | (BienLocation & { annexes: BienLocation[] })>>(
    `liste=${onglet}&page=${page}`);

  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <div className="loc-actions">
        <a className="svv-btn svv-btn-primary gst-btn" href="/admin/location/nouveau" data-geste="nouveau">+ Nouveau propriétaire + bien</a>
        {administrateur && <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/honoraires">Honoraires de gestion</a>}
      </div>

      <label className="loc-recherche">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus
          placeholder="Chercher : nom, téléphone, e-mail, adresse, n° de lot…" aria-label="Chercher une personne ou un bien" />
      </label>

      {terme.length >= 2 && (
        <section className="loc-bloc" aria-label="Résultats de la recherche">
          <h3>Résultats pour « {terme} »</h3>
          {recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} /> : (() => {
            const r = recherche.etat.data;
            if (r.personnes.length === 0 && r.biens.length === 0) return <p className="loc-muet">Aucune personne ni aucun bien ne correspond.</p>;
            return (
              <ul className="loc-liste">
                {r.personnes.map((p) => (
                  <li key={`${p.sujet}-${p.id}`}>
                    <span>
                      <a href={`/admin/location/${p.sujet}/${p.id}`}>{p.nomAffiche}</a>{' '}
                      {p.roles.map((x) => (
                        <span key={x} className={`loc-pastille${x === 'locataire' ? ' loc-pastille--vert' : x === 'ancien_locataire' ? ' loc-pastille--violet' : ''}`}>
                          {x === 'proprietaire' ? 'propriétaire' : x === 'locataire' ? 'locataire' : 'ancien locataire'}
                        </span>
                      ))}
                    </span>
                    <span className="loc-muet">{[p.mobile, p.email].filter((x) => x).join(' · ')}</span>
                  </li>
                ))}
                {r.biens.map((b) => (
                  <li key={`b-${b.id}`}>
                    <a href={`/admin/location/bien/${b.id}`}>{[b.adresse, b.commune].filter((x) => x).join(', ') || `Bien ${b.numero}`}</a>
                    <span className="loc-muet">{b.proprietaire ?? ''}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>
      )}

      <section className="loc-bloc">
        <div className="loc-onglets" role="tablist">
          {(['proprietaires', 'locataires', 'biens'] as const).map((o) => (
            <button key={o} type="button" role="tab" aria-selected={onglet === o} onClick={() => { setOnglet(o); setPage(0); }}>
              {o === 'proprietaires' ? 'Propriétaires' : o === 'locataires' ? 'Locataires' : 'Biens'}
            </button>
          ))}
        </div>
        {liste.etat.etat !== 'ok' ? <EtatLecture etat={liste.etat} /> : (
          <>
            <p className="loc-muet">{liste.etat.data.total} au total{liste.etat.data.total > 50 ? ` — page ${page + 1}` : ''}</p>
            <ul className={onglet === 'biens' ? 'loc-arbre' : 'loc-liste'}>
              {onglet === 'proprietaires' && (liste.etat.data.lignes as LigneProprietaire[]).map((p) => (
                <li key={p.id}>
                  <a href={`/admin/location/proprietaire/${p.id}`}>{p.nom}</a>
                  <span className="loc-muet">
                    {p.biens} bien{p.biens > 1 ? 's' : ''}{p.numeroMandat === null ? '' : ` · mandat ${p.numeroMandat}`}
                  </span>
                </li>
              ))}
              {onglet === 'locataires' && (liste.etat.data.lignes as LigneLocataire[]).map((l) => (
                <li key={l.id}>
                  <span>
                    <a href={`/admin/location/locataire/${l.id}`}>{l.nom}</a>{' '}
                    <span className={`loc-pastille${l.enPlace ? ' loc-pastille--vert' : ' loc-pastille--violet'}`}>{l.enPlace ? 'en place' : 'ancien'}</span>
                  </span>
                  <span className="loc-muet">{l.logement ?? ''}</span>
                </li>
              ))}
              {onglet === 'biens' && (liste.etat.data.lignes as (BienLocation & { annexes: BienLocation[] })[]).flatMap((b) => [
                <LigneBien key={b.id} b={b} />,
                ...(b.annexes ?? []).map((a) => <LigneBien key={a.id} b={a} enfant />),
              ])}
            </ul>
            <div className="loc-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>← Précédents</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={(page + 1) * 50 >= liste.etat.data.total}
                onClick={() => setPage((x) => x + 1)}>Suivants →</button>
            </div>
          </>
        )}
      </section>
      <p className="loc-muet">Données communes avec la Gestion : une correction faite ici se voit là-bas, et inversement.</p>
    </div>
  );
}

function LigneBien({ b, enfant = false }: { b: BienLocation; enfant?: boolean }) {
  const resume = resumeBien(b);
  return (
    <li className={enfant ? 'loc-enfant' : undefined}>
      <span>
        <a href={`/admin/location/bien/${b.id}`}>
          {enfant ? `${LIBELLE_CATEGORIE[b.categorie]}${b.porte === null ? '' : ` n° ${b.porte}`}` : [b.adresse, b.commune].filter((x) => x).join(', ') || `Bien ${b.numero}`}
        </a>{' '}
        <span className="loc-pastille">{LIBELLE_CATEGORIE[b.categorie]}</span>
        {resume !== '' && <span className="loc-muet"> · {resume}</span>}
      </span>
      <span className="loc-muet">{b.proprietaire ?? ''}{b.locataireEnPlace === null ? '' : ` · loué à ${b.locataireEnPlace}`}</span>
    </li>
  );
}
