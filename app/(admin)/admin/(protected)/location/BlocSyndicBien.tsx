'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API, liste } from './commun';
import { FicheSyndic } from '../gestion/FicheSyndic';
import type { FicheSyndic as DonneesSyndic } from '../../../../lib/gestion/syndics';
import type { NouveauContactSyndic, SyndicSuggere } from '../../../../lib/location/syndicLocation';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE SYNDIC DU BIEN (section Copropriété), Arno, 17/10/2026 ═════════════════════════════════════
 *
 * « Libellé “Syndic”. À côté : une loupe et un “+” rouge cerclé de rouge. Loupe → recherche dans l'annuaire des syndics
 * de la GESTION (mêmes données, aucune copie). Suggestion automatique : si un autre bien du portefeuille à la même adresse a
 * déjà un syndic, “Syndic déjà connu pour cette adresse : NOM — Rattacher” ; jamais de rattachement sans clic. “+” →
 * modale de création du syndic (mêmes champs que la Gestion) avec ses contacts internes. Syndic choisi : ses contacts
 * internes déjà connus, en désigner un ou plusieurs pour ce bien, et “+ Ajouter un contact” qui enrichit l'annuaire du
 * syndic. » (Arno)
 * 🔴 LA LOUPE ET LE « + » OUVRENT LA MODALE DE LA GESTION (`FicheSyndic`), telle quelle — recherche, création, contacts,
 * rattachement de l'immeuble du bien à la copropriété du syndic. Le reste (désignation des contacts, nouveaux contacts)
 * est enregistré AVEC le bien, par les fonctions de la Gestion (`syndicLocationRepo`).
 */
export interface SyndicChoisi {
  id: number; nom: string; ville: string | null;
  /** Les contacts du cabinet désignés pour CE bien. */
  contactsIds: number[];
  /** Les contacts à AJOUTER à l'annuaire interne du syndic (et désignés pour ce bien). */
  nouveauxContacts: NouveauContactSyndic[];
}

const FONCTIONS = ['Gestionnaire', 'Comptable', 'Assistante', 'Responsable de copropriété', 'Service comptabilité'];
const VIDE_CONTACT: NouveauContactSyndic = { civilite: null, prenom: '', nom: '', fonction: '', email: '', telephone: '' };

export function BlocSyndic({ adresse, choisi, onChoisi }: {
  adresse: { libelle: string; codePostal: string; commune: string };
  choisi: SyndicChoisi | null;
  onChoisi: (s: SyndicChoisi | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<SyndicSuggere[]>([]);
  const [modale, setModale] = useState<null | 'recherche' | 'creation'>(null);
  const [fiche, setFiche] = useState<DonneesSyndic | null>(null);
  const [ajout, setAjout] = useState<NouveauContactSyndic | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const avant = useRef<number[]>([]);
  const apresModale = useRef(false);
  const adressePrete = adresse.libelle.trim().length >= 5;

  // La SUGGESTION « déjà connu pour cette adresse », 500 ms après la dernière frappe dans l'adresse. Lecture seule.
  useEffect(() => {
    if (!adressePrete) { setSuggestions([]); return; }
    let vivant = true;
    const t = setTimeout(() => {
      const qs = `syndicPourAdresse=${encodeURIComponent(adresse.libelle)}&cp=${encodeURIComponent(adresse.codePostal)}&commune=${encodeURIComponent(adresse.commune)}`;
      void fetch(`${API}?${qs}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: SyndicSuggere[] }>)
        .then((d) => { if (vivant) setSuggestions(d.etat === 'ok' ? [...liste(d.data)] : []); }).catch(() => {});
    }, 500);
    return () => { vivant = false; clearTimeout(t); };
  }, [adresse.libelle, adresse.codePostal, adresse.commune, adressePrete, n]);

  // Après la modale (où l'on a cliqué pour rattacher ou créer) : le syndic NOUVEAU pour cette adresse est choisi — UNE fois,
  // à la première relecture qui suit la fermeture. Plus tard (adresse modifiée…), rien ne se choisit sans clic.
  useEffect(() => {
    if (!apresModale.current || modale !== null) return;
    apresModale.current = false;
    const neufs = suggestions.filter((x) => !avant.current.includes(x.id));
    if (choisi === null && neufs.length === 1) onChoisi({ id: neufs[0].id, nom: neufs[0].nom, ville: neufs[0].ville, contactsIds: [], nouveauxContacts: [] });
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Les contacts internes du syndic choisi : la fiche de la Gestion (mêmes données).
  useEffect(() => {
    if (choisi === null) { setFiche(null); return; }
    let vivant = true;
    void fetch(`${API}?syndic=${choisi.id}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: DonneesSyndic }>)
      .then((d) => { if (vivant) setFiche(d.etat === 'ok' && d.data !== undefined ? d.data : null); }).catch(() => {});
    return () => { vivant = false; };
  }, [choisi?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ouvrir = (m: 'recherche' | 'creation'): void => { avant.current = suggestions.map((x) => x.id); setModale(m); };
  const fermer = (): void => { apresModale.current = true; setModale(null); setN((x) => x + 1); };
  const valider = (c: NouveauContactSyndic): string | null => {
    if ((c.nom ?? '').trim() === '') return 'Le nom du contact est obligatoire.';
    if ((c.email ?? '').trim() === '' && (c.telephone ?? '').trim() === '') return 'Un téléphone ou un e-mail.';
    return null;
  };
  const autres = suggestions.filter((x) => x.id !== choisi?.id);

  return (
    <div className="loc-pleine loc-syndic" data-syndic>
      <div className="loc-syndic-tete">
        <span className="loc-syndic-mot">Syndic</span>
        <button type="button" className="loc-picto" aria-label="Chercher un syndic dans l’annuaire de la Gestion" title={adressePrete ? 'Chercher dans l’annuaire des syndics' : 'Saisissez d’abord l’adresse du bien'}
          disabled={!adressePrete} onClick={() => ouvrir('recherche')} data-loupe>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
        </button>
        <button type="button" className="loc-picto loc-picto--plus" aria-label="Créer un syndic" title={adressePrete ? 'Créer un syndic' : 'Saisissez d’abord l’adresse du bien'}
          disabled={!adressePrete} onClick={() => ouvrir('creation')} data-creer-syndic>+</button>
        {!adressePrete && <span className="loc-muet">Saisissez d’abord l’adresse du bien (section « Adresse et situation »).</span>}
      </div>

      {autres.length > 0 && (
        <ul className="loc-syndic-suggestions" data-suggestions-syndic>
          {autres.map((x) => (
            <li key={x.id} className="loc-alerte">
              <span>Syndic déjà connu pour cette adresse : <strong>{x.nom}</strong>{x.ville ? ` — ${x.ville}` : ''} <small>({x.motif})</small></span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onChoisi({ id: x.id, nom: x.nom, ville: x.ville, contactsIds: [], nouveauxContacts: [] })}>Rattacher</button>
            </li>
          ))}
        </ul>
      )}

      {choisi !== null && (
        <div className="loc-syndic-choisi" data-syndic-choisi>
          <p className="loc-syndic-nom"><strong>{choisi.nom}</strong>{choisi.ville ? <span className="loc-muet"> — {choisi.ville}</span> : null}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onChoisi(null)}>Changer de syndic</button></p>
          <p className="loc-muet" style={{ margin: 0 }}>Rattaché au bien à l’enregistrement (par son immeuble, comme dans la Gestion). Ses contacts pour ce bien :</p>
          {fiche === null ? <p className="gst-info">Chargement des contacts…</p> : liste(fiche.contacts).length === 0
            ? <p className="loc-muet" style={{ margin: 0 }}>Aucun contact interne connu pour ce syndic.</p> : (
              <ul className="loc-syndic-contacts">
                {liste(fiche.contacts).map((c) => (
                  <li key={c.id}><label>
                    <input type="checkbox" checked={choisi.contactsIds.includes(c.id)}
                      onChange={(e) => onChoisi({ ...choisi, contactsIds: e.target.checked ? [...choisi.contactsIds, c.id] : choisi.contactsIds.filter((x) => x !== c.id) })} />
                    <span><strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>{c.titre ? ` · ${c.titre}` : ''}
                      <small className="loc-muet"> {liste(c.coordonnees).map((k) => k.valeur).join(' · ')}</small></span>
                  </label></li>
                ))}
              </ul>
            )}
          {choisi.nouveauxContacts.length > 0 && (
            <ul className="loc-puces">
              {choisi.nouveauxContacts.map((c, i) => (
                <li key={`${c.nom}-${i}`} className="loc-puce loc-puce--contact">
                  <span>{[c.civilite, c.prenom, (c.nom ?? '').toUpperCase()].filter((x) => x).join(' ')}{c.fonction ? <small> · {c.fonction}</small> : null} <small>· nouveau</small></span>
                  <button type="button" aria-label={`Retirer ${c.nom ?? ''}`} onClick={() => onChoisi({ ...choisi, nouveauxContacts: choisi.nouveauxContacts.filter((_, j) => j !== i) })}>✕</button>
                </li>
              ))}
            </ul>
          )}
          {ajout === null ? (
            <button type="button" className="loc-ajouter-contact-syndic" onClick={() => { setAjout({ ...VIDE_CONTACT }); setMotif(null); }}>+ Ajouter un contact</button>
          ) : (
            <div className="loc-syndic-ajout" data-ajout-contact-syndic>
              <div className="loc-grille">
                <label className="loc-champ">Civilité
                  <select value={ajout.civilite ?? ''} onChange={(e) => { const v = e.target.value; setAjout((x) => ({ ...(x ?? VIDE_CONTACT), civilite: v === 'M.' || v === 'Mme' ? v : null })); }}>
                    <option value="">—</option><option value="M.">M.</option><option value="Mme">Mme</option>
                  </select></label>
                {(['prenom', 'nom', 'fonction', 'email', 'telephone'] as const).map((k) => (
                  <label key={k} className="loc-champ">{k === 'prenom' ? 'Prénom' : k === 'nom' ? 'Nom *' : k === 'fonction' ? 'Fonction' : k === 'email' ? 'E-mail' : 'Téléphone'}
                    <input value={ajout[k] ?? ''} list={k === 'fonction' ? 'loc-fonctions-syndic' : undefined}
                      inputMode={k === 'telephone' ? 'tel' : k === 'email' ? 'email' : undefined}
                      placeholder={k === 'fonction' ? 'gestionnaire, comptable, assistante…' : undefined}
                      onChange={(e) => { const v = e.target.value; setAjout((x) => ({ ...(x ?? VIDE_CONTACT), [k]: v })); }} /></label>
                ))}
                <datalist id="loc-fonctions-syndic">{FONCTIONS.map((f) => <option key={f} value={f} />)}</datalist>
              </div>
              {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
              <div className="loc-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAjout(null)}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => {
                  const m = valider(ajout);
                  if (m !== null) { setMotif(m); return; }
                  onChoisi({ ...choisi, nouveauxContacts: [...choisi.nouveauxContacts, ajout] });
                  setAjout(null);
                }}>Ajouter ce contact</button>
              </div>
              <p className="loc-muet" style={{ margin: 0 }}>Il rejoint l’annuaire interne de ce syndic (visible ensuite dans la Gestion), comme contact pour ce bien.</p>
            </div>
          )}
        </div>
      )}

      {modale !== null && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={null} departCreation={modale === 'creation'}
          immeubleDepart={{ libelle: adresse.libelle.trim(), codePostal: adresse.codePostal, commune: adresse.commune }}
          onFerme={fermer} />,
        document.querySelector('.svv-adm-root') ?? document.body,
      )}
    </div>
  );
}
