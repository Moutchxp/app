'use client';

import { useState } from 'react';
import { CartePersonne, CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_LOCATION, LocationCarte } from './LocationCarte';
import { CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, gestesLocation, liste, useLecture } from './commun';
import { enArbre, LIBELLE_CATEGORIE, resumeBien } from '../../../../lib/location/locationBien';
import { periodeOccupation } from '../../../../lib/gestion/annuaireRecherche';
import { estAncienLocataire, estLocataireEnPlace } from '../../../../lib/gestion/historiqueBien';
import type { FicheLocataireLocation, FicheProprietaireLocation } from '../../../../lib/location/locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — FICHES PROPRIÉTAIRE ET LOCATAIRE ═══════════════════════════════════════════════════════════
 * « Mêmes données que la Gestion (une modification d'un côté se voit de l'autre), affichées dans des écrans de la
 * Location. Champ “N° de mandat de gestion” (texte libre, facultatif) sur le propriétaire. » (Arno, 17/10/2026)
 * Les cartes de personnes sont le MÊME composant que la Gestion ; leurs gestes passent par la porte de la Location.
 */
export function FicheProprietaireLocationVue({ id }: { id: number }) {
  const { etat, rafraichir } = useLecture<FicheProprietaireLocation>(`proprietaire=${id}`);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Propriétaire" /><EtatLecture etat={etat} /></div>;
  }
  const d = etat.data;
  const gestes = gestesLocation(d.fiche.modifiable, rafraichir);
  const arbre = enArbre(liste(d.biens));
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style><style>{CSS_CARTES}</style>
      <EnTeteLocation titre={d.fiche.nom} sous={<span className="loc-pastille">Propriétaire</span>}
        actions={<a className="svv-btn svv-btn-primary gst-btn" href={`/admin/location/nouveau?proprietaire=${id}`}>+ Ajouter un bien</a>} />

      {d.location372 && <Mandat proprietaireId={id} valeur={d.numeroMandat} apres={rafraichir} />}

      <section className="loc-bloc">
        <h3>Coordonnées</h3>
        <div className="loc-cartes">
          {liste(d.fiche.personnes).map((p) => <CartePersonne key={p.id} p={p} gestes={gestes} role="Propriétaire" deplacer={null} />)}
        </div>
      </section>

      <section className="loc-bloc">
        <h3>Ses biens <span className="loc-pastille">{liste(d.biens).length}</span></h3>
        {arbre.length === 0 ? <p className="loc-muet">Aucun bien rattaché.</p> : (
          <ul className="loc-arbre">
            {arbre.flatMap(({ bien, annexes }) => [
              <li key={bien.id}>
                <span>
                  <a href={`/admin/location/bien/${bien.id}`}>{[bien.adresse, bien.commune].filter((x) => x).join(', ') || `Bien ${bien.numero}`}</a>{' '}
                  <span className="loc-pastille">{LIBELLE_CATEGORIE[bien.categorie]}</span>
                  {resumeBien(bien) !== '' && <span className="loc-muet"> · {resumeBien(bien)}</span>}
                </span>
                <span className="loc-muet">{bien.locataireEnPlace === null ? 'libre' : `loué à ${bien.locataireEnPlace}`}</span>
              </li>,
              ...annexes.map((a) => (
                <li key={a.id} className="loc-enfant">
                  <span><a href={`/admin/location/bien/${a.id}`}>{LIBELLE_CATEGORIE[a.categorie]}{a.porte === null ? '' : ` n° ${a.porte}`}</a>
                    {resumeBien(a) !== '' && <span className="loc-muet"> · {resumeBien(a)}</span>}</span>
                  <span className="loc-muet">{a.locataireEnPlace === null ? 'libre' : `loué à ${a.locataireEnPlace}`}</span>
                </li>
              )),
            ])}
          </ul>
        )}
      </section>
    </div>
  );
}

function Mandat({ proprietaireId, valeur, apres }: { proprietaireId: number; valeur: string | null; apres: () => void }) {
  const [texte, setTexte] = useState(valeur ?? '');
  const [motif, setMotif] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  return (
    <section className="loc-bloc">
      <h3>N° de mandat de gestion</h3>
      <form className="loc-actions" style={{ alignItems: 'flex-end' }} onSubmit={(e) => {
        e.preventDefault();
        void envoyer({ action: 'numero-mandat', id: proprietaireId, numeroMandat: texte }).then((r) => {
          setMotif(r.motif); setFait(r.motif === null); if (r.motif === null) apres();
        });
      }}>
        <label className="loc-champ" style={{ flex: '1 1 16rem' }}>Texte libre, facultatif — jamais généré ni numéroté par l’outil
          <input value={texte} onChange={(e) => { setTexte(e.target.value); setFait(false); }} placeholder="ex. MG 2026-041" /></label>
        <button type="submit" className="svv-btn gst-btn">Enregistrer</button>
      </form>
      {fait && <p className="loc-muet" role="status">Enregistré.</p>}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

export function FicheLocataireLocationVue({ id }: { id: number }) {
  const { etat, rafraichir } = useLecture<FicheLocataireLocation>(`locataire=${id}`);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Locataire" /><EtatLecture etat={etat} /></div>;
  }
  const d = etat.data;
  const gestes = gestesLocation(d.fiche.modifiable, rafraichir);
  const enregistrerConditions = async (occupationId: number, c: Record<string, unknown>): Promise<string | null> => {
    const r = await envoyer({ action: 'conditions-location', occupationId, conditions: c });
    if (r.motif === null) rafraichir();
    return r.motif;
  };
  const enPlace = liste(d.locations).some(estLocataireEnPlace);
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style><style>{CSS_CARTES}</style><style>{CSS_LOCATION}</style>
      <EnTeteLocation titre={d.fiche.nom}
        sous={<span className={`loc-pastille ${enPlace ? 'loc-pastille--vert' : 'loc-pastille--violet'}`}>{enPlace ? 'Locataire en place' : 'Ancien locataire'}</span>} />
      <section className="loc-bloc">
        <h3>Coordonnées</h3>
        <div className="loc-cartes">
          {liste(d.fiche.personnes).map((p) => (
            <CartePersonne key={p.id} p={p} gestes={gestes} role={p.id === d.fiche.id ? 'Locataire' : 'Même logement'} deplacer={null} />
          ))}
        </div>
      </section>
      <section className="loc-bloc">
        <h3>Ses locations <span className="loc-pastille">{liste(d.locations).length}</span></h3>
        {liste(d.locations).length === 0 ? <p className="loc-muet">Aucune location connue.</p> : (
          <ul className="loc-liste">
            {liste(d.locations).map((l) => (
              <li key={l.occupationId} style={{ display: 'block' }}>
                <p style={{ margin: '0 0 6px' }}>
                  {l.lotId === null ? <strong>Lot hors gestion</strong>
                    : <a href={`/admin/location/bien/${l.lotId}`}>{[l.adresse, l.commune].filter((x) => x).join(', ')}</a>}{' '}
                  <span className="loc-muet">{periodeOccupation(l.entree, l.sortie)}</span>
                </p>
                <div className="cp-lignes">
                  <LocationCarte location={l.location} modifiable={d.fiche.modifiable} onEnregistrer={enregistrerConditions}
                    lecture={estAncienLocataire(l)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
