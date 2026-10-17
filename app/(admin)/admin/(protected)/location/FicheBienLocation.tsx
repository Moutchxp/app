'use client';

import { useState } from 'react';
import { CartePersonne, CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_LOCATION, LocationCarte } from './LocationCarte';
import { CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, gestesLocation, useLecture } from './commun';
import {
  CATEGORIES, CATEGORIES_ANNEXE, LIBELLE_CATEGORIE, libelleEtage, resumeBien, verifierChampsBien,
  type BienLocation, type Categorie,
} from '../../../../lib/location/locationBien';
import type { FicheBienLocation as Donnees } from '../../../../lib/location/locationRepo';
import { formaterDateIso, periodeOccupation } from '../../../../lib/gestion/annuaireRecherche';

/**
 * ══ 🔴🔴 TUILE LOCATION — LA FICHE DU BIEN (/admin/location/bien/[id]) ═════════════════════════════════════════════
 * Demande d'Arno (17/10/2026) : « adresse, étage, surface Carrez, surface extérieure, n° de porte, n° de lot de
 * copropriété ; annexes (cave, parking) EN ARBRE sous leur logement, avec étage, n° de lot, n° de porte ou de place. Une
 * annexe garde toujours son lien avec le logement d'origine. » + le loyer de départ, le taux et les honoraires de
 * gestion, saisis sur la location (contenu du lot L1, désormais ICI et plus dans la Gestion).
 */
export function FicheBienLocation({ id }: { id: number }) {
  const { etat, rafraichir } = useLecture<Donnees>(`lot=${id}`);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Bien" /><EtatLecture etat={etat} /></div>;
  }
  const d = etat.data;
  const f = d.fiche;
  const b = d.bien;
  const gestes = gestesLocation(f.modifiable, rafraichir);
  const conditions = new Map(d.locations.map((l) => [l.occupationId, l.location]));
  const enregistrerConditions = async (occupationId: number, c: Record<string, unknown>): Promise<string | null> => {
    const r = await envoyer({ action: 'conditions-location', occupationId, conditions: c });
    if (r.motif === null) rafraichir();
    return r.motif;
  };
  const enPlace = f.occupations.filter((o) => o.encours);
  const anciens = f.occupations.filter((o) => !o.encours);
  const logement = d.parent ?? b;
  const annexes = d.parent === null ? d.annexes : [];

  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style><style>{CSS_CARTES}</style><style>{CSS_LOCATION}</style>
      <EnTeteLocation
        titre={[f.adresse, [f.codePostal, f.commune].filter((x) => x).join(' ')].filter((x) => x).join(', ') || `Bien ${f.numero}`}
        sous={<>
          <span className="loc-pastille">{LIBELLE_CATEGORIE[b.categorie]}</span>{' '}
          {resumeBien(b) || 'caractéristiques non renseignées'}
          {b.creeDansLApplication ? ' · créé dans la Location' : ` · réf. WIPPIMMO ${f.numero}`}
        </>} />

      {d.parent !== null && (
        <p className="loc-alerte">Annexe du logement <a href={`/admin/location/bien/${d.parent.id}`}>
          {[d.parent.adresse, d.parent.commune].filter((x) => x).join(', ')}{d.parent.etage === null ? '' : ` — ${libelleEtage(d.parent.etage)}`}
        </a> : ce lien est gardé pour toujours.</p>
      )}

      <section className="loc-bloc" aria-labelledby="loc-arbre-titre">
        <h3 id="loc-arbre-titre">Le logement et ses annexes</h3>
        <ul className="loc-arbre">
          <LigneArbre b={logement} courant={logement.id === b.id} />
          {annexes.map((a) => <LigneArbre key={a.id} b={a} enfant courant={a.id === b.id} />)}
        </ul>
        {d.parent === null && d.location372 && <AjoutAnnexes parentId={b.id} rattachables={d.rattachables} apres={rafraichir} />}
      </section>

      <Caracteristiques b={b} modifiable={d.location372} apres={rafraichir} />

      <section className="loc-bloc">
        <h3>Propriétaire{f.proprietaires.length > 1 ? 's' : ''}</h3>
        {f.proprietaires.length === 0 ? <p className="loc-muet">{f.proprietaireNom || 'Aucun propriétaire rattaché.'}</p> : (
          <div className="loc-cartes">
            {f.proprietaires.map((p) => (
              <div key={p.id}>
                <CartePersonne p={p} gestes={gestes} role="Propriétaire" deplacer={null} />
                <p className="loc-muet"><a href={`/admin/location/proprietaire/${p.id}`}>Fiche du propriétaire →</a></p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="loc-bloc">
        <h3>Location en cours</h3>
        {enPlace.length === 0 ? <p className="loc-muet">Aucun locataire en place — le bien est vacant.</p> : (
          <div className="loc-cartes">
            {enPlace.map((o) => {
              const p = f.occupants.find((x) => x.id === o.locataireId);
              return (
                <div key={o.occupationId}>
                  {p !== undefined
                    ? <CartePersonne p={p} gestes={gestes} role="En place" deplacer={null}
                      dessous={<LocationCarte location={conditions.get(o.occupationId) ?? null} modifiable={f.modifiable} onEnregistrer={enregistrerConditions} />} />
                    : <p>{o.nom}</p>}
                  <p className="loc-muet"><a href={`/admin/location/locataire/${o.locataireId}`}>Fiche du locataire →</a> · entré le {o.entree === null ? 'date inconnue' : formaterDateIso(o.entree)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {anciens.length > 0 && (
        <section className="loc-bloc">
          <h3>Historique des locations <span className="loc-pastille">{anciens.length}</span></h3>
          <ul className="loc-liste">
            {anciens.map((o) => (
              <li key={o.occupationId} style={{ display: 'block' }}>
                <p style={{ margin: '0 0 6px' }}>
                  <a href={`/admin/location/locataire/${o.locataireId}`}>{o.nom}</a>{' '}
                  <span className="loc-muet">{periodeOccupation(o.entree, o.sortie)}</span>
                </p>
                <div className="cp-lignes">
                  <LocationCarte location={conditions.get(o.occupationId) ?? null} modifiable={f.modifiable} onEnregistrer={enregistrerConditions} lecture />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LigneArbre({ b, enfant = false, courant }: { b: BienLocation; enfant?: boolean; courant: boolean }) {
  const titre = enfant
    ? `${LIBELLE_CATEGORIE[b.categorie]}${b.porte === null ? '' : ` n° ${b.porte}`}`
    : `${LIBELLE_CATEGORIE[b.categorie]} · ${[b.adresse, b.commune].filter((x) => x).join(', ')}`;
  return (
    <li className={enfant ? 'loc-enfant' : undefined} data-annexe={enfant ? 'oui' : undefined}>
      <span>
        {courant ? <strong>{titre}</strong> : <a href={`/admin/location/bien/${b.id}`}>{titre}</a>}
        {resumeBien(b) !== '' && <span className="loc-muet"> · {resumeBien(b)}</span>}
      </span>
      <span className="loc-muet">{b.locataireEnPlace === null ? 'libre' : `loué à ${b.locataireEnPlace}`}</span>
    </li>
  );
}

function AjoutAnnexes({ parentId, rattachables, apres }: { parentId: number; rattachables: BienLocation[]; apres: () => void }) {
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [champs, setChamps] = useState({ etage: '', numLotCopro: '', porte: '' });
  const [choisi, setChoisi] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const ajouter = async (): Promise<void> => {
    const r = await envoyer({ action: 'ajouter-annexe', id: parentId, champs: { ...champs, categorie } });
    setMotif(r.motif);
    if (r.motif === null) { setCategorie(null); setChamps({ etage: '', numLotCopro: '', porte: '' }); apres(); }
  };
  const rattacher = async (): Promise<void> => {
    const r = await envoyer({ action: 'rattacher-annexe', id: parentId, annexeId: Number(choisi) });
    setMotif(r.motif);
    if (r.motif === null) { setChoisi(''); apres(); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="loc-actions">
        {(['cave', 'parking', 'autre'] as const).map((c) => (
          <button key={c} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCategorie(c)}>
            + {c === 'autre' ? 'Autre annexe' : LIBELLE_CATEGORIE[c]}
          </button>
        ))}
      </div>
      {categorie !== null && (
        <form className="loc-bloc" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void ajouter(); }}>
          <div className="loc-grille">
            <label className="loc-champ">Catégorie
              <select value={categorie} onChange={(e) => setCategorie(e.target.value as Categorie)}>
                {CATEGORIES_ANNEXE.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
              </select></label>
            <label className="loc-champ">Étage<input value={champs.etage} onChange={(e) => setChamps({ ...champs, etage: e.target.value })} placeholder="-1" /></label>
            <label className="loc-champ">N° de lot de copropriété<input value={champs.numLotCopro} onChange={(e) => setChamps({ ...champs, numLotCopro: e.target.value })} /></label>
            <label className="loc-champ">{categorie === 'parking' || categorie === 'box' ? 'N° de place' : 'N° de porte'}
              <input autoFocus value={champs.porte} onChange={(e) => setChamps({ ...champs, porte: e.target.value })} /></label>
          </div>
          <div className="loc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCategorie(null)}>Annuler</button>
            <button type="submit" className="svv-btn gst-btn">Ajouter l’annexe</button>
          </div>
          <p className="loc-muet">L’annexe hérite de l’adresse et du propriétaire du logement ; son lien avec lui est gardé pour toujours.</p>
        </form>
      )}
      {rattachables.length > 0 && (
        <div className="loc-actions" style={{ marginTop: 10, alignItems: 'center' }}>
          <select className="loc-select" value={choisi} onChange={(e) => setChoisi(e.target.value)} aria-label="Bien existant à rattacher">
            <option value="">Rattacher un bien existant du même propriétaire…</option>
            {rattachables.map((r) => (
              <option key={r.id} value={r.id}>{LIBELLE_CATEGORIE[r.categorie]} · {[r.adresse, r.commune].filter((x) => x).join(', ')} (réf. {r.numero})</option>
            ))}
          </select>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={choisi === ''} onClick={() => void rattacher()}>Rattacher comme annexe</button>
        </div>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </div>
  );
}

function Caracteristiques({ b, modifiable, apres }: { b: BienLocation; modifiable: boolean; apres: () => void }) {
  const initial = {
    categorie: b.categorie as string, etage: b.etage ?? '', porte: b.porte ?? '', numLotCopro: b.numLotCopro ?? '',
    surfaceCarrezM2: b.surfaceCarrezM2 === null ? '' : String(b.surfaceCarrezM2).replace('.', ','),
    surfaceExterieureM2: b.surfaceExterieureM2 === null ? '' : String(b.surfaceExterieureM2).replace('.', ','),
    adresse: b.adresse ?? '', codePostal: b.codePostal ?? '', commune: b.commune ?? '',
  };
  const [edition, setEdition] = useState(false);
  const [v, setV] = useState(initial);
  const [motif, setMotif] = useState<string | null>(null);
  const champ = (k: keyof typeof initial, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...props} /></label>
  );
  const enregistrer = async (): Promise<void> => {
    const verdict = verifierChampsBien(v);
    if (!verdict.ok) { setMotif(verdict.motif); return; }
    const r = await envoyer({ action: 'modifier-bien', id: b.id, champs: v });
    setMotif(r.motif);
    if (r.motif === null) { setEdition(false); apres(); }
  };
  return (
    <section className="loc-bloc">
      <h3>Caractéristiques</h3>
      {!edition ? (
        <>
          <dl className="loc-grille" style={{ margin: 0 }}>
            {[['Catégorie', LIBELLE_CATEGORIE[b.categorie]], ['Étage', libelleEtage(b.etage)], ['N° de porte / place', b.porte],
              ['N° de lot de copropriété', b.numLotCopro],
              ['Surface Carrez', b.surfaceCarrezM2 === null ? null : `${String(b.surfaceCarrezM2).replace('.', ',')} m²`],
              ['Surface extérieure', b.surfaceExterieureM2 === null ? null : `${String(b.surfaceExterieureM2).replace('.', ',')} m²`]]
              .map(([mot, val]) => (
                <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0 }}>{val ?? <span className="loc-muet">non renseigné</span>}</dd></div>
              ))}
          </dl>
          {modifiable && <div className="loc-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setV(initial); setEdition(true); }}>Modifier</button></div>}
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
          <div className="loc-grille">
            <label className="loc-champ">Catégorie
              <select value={v.categorie} onChange={(e) => setV({ ...v, categorie: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
              </select></label>
            {champ('etage', 'Étage', { placeholder: '3, RDC, -1…' })}
            {champ('porte', 'N° de porte / de place')}
            {champ('numLotCopro', 'N° de lot de copropriété')}
            {champ('surfaceCarrezM2', 'Surface Carrez (m²)', { inputMode: 'decimal' })}
            {champ('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' })}
            {b.creeDansLApplication && <>{champ('adresse', 'Adresse')}{champ('codePostal', 'Code postal', { inputMode: 'numeric' })}{champ('commune', 'Commune')}</>}
          </div>
          {!b.creeDansLApplication && <p className="loc-muet">L’adresse de ce bien est tenue par WIPPIMMO : elle se corrige là-bas.</p>}
          <div className="loc-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEdition(false)}>Annuler</button>
            <button type="submit" className="svv-btn gst-btn">Enregistrer</button>
          </div>
        </form>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}
