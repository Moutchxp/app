'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API, liste } from './commun';
import { FormulaireCarte, type ChampsSaisis, type FicheAEditer } from '../gestion/CartesPersonnes';
import type { CoordonneeSaisie } from '../../../../lib/gestion/annuaireEdition';
import type { Doublon } from '../../../../lib/location/locationRepo';
import {
  BADGE_CLIENT, BADGE_CONTACT, EXEMPLES_QUALITE, manquesClientLocation, MOT_CLIENT, MOT_CONTACT, type CoteCarte,
} from '../../../../lib/location/cartesLocation';

/**
 * ══ 🔴🔴 TUILE LOCATION — LA SAISIE PAR CARTES : CLIENTS ET CONTACTS (Arno, 17/10/2026) ════════════════════════════════
 *
 * « Le bouton “+ Ajouter un contact” devient “+ Ajouter…” et propose, comme dans la Gestion : “Propriétaire (client)”
 * (bouton rouge) / “Contact du propriétaire” (bouton blanc) / “Annuler”. » Côté locataire : « Locataire (client) » /
 * « Contact du locataire ». Le choix reprend les classes du petit choix de la Gestion (`cp-carte--choix`, `cp-choix-btn`).
 *   · carte CLIENT : le formulaire de carte de la Gestion, étiquette rouge (propriétaire) ou verte (locataire), obligatoires
 *     ALLÉGÉS (le nom, un téléphone OU un e-mail), dédoublonnage dès la saisie, « Utiliser cette fiche » ;
 *   · carte CONTACT : le même formulaire en mode contact (la règle de la Gestion : le nom et un e-mail), étiquette grise,
 *     « Qualité » mise en avant. Un contact n'est pas un client : il ne compte jamais parmi les propriétaires / locataires.
 * « Enregistrer » d'une carte la VALIDE sur la page ; l'écran appelant enregistre le tout.
 */
export type SorteCarte = 'client' | 'contact';
interface Carte { cle: number; sorte: SorteCarte; champs: ChampsSaisis | null; ouverte: boolean; doublons: Doublon[] }
export interface EtatCartes {
  clients: ChampsSaisis[];
  contacts: ChampsSaisis[];
  /** Des fiches EXISTANTES retenues par « Utiliser cette fiche » (rattachées, jamais fusionnées). */
  existants: { id: number; nom: string }[];
  /** Le nombre de cartes encore ouvertes (non validées). */
  ouvertes: number;
}

function ficheDeChamps(c: ChampsSaisis): FicheAEditer {
  return {
    civilite: c.civilite ?? null, prenom: c.prenom ?? null, nom: c.nom ?? '', qualite: c.qualite ?? null,
    adresse: c.adresse ?? null, codePostal: c.codePostal ?? null, commune: c.commune ?? null, note: c.note ?? null,
    contacts: (c.coordonnees ?? []).map((k, i) => ({ id: i + 1, sorte: k.sorte, affichage: k.valeur, libelle: k.libelle })),
  };
}
const nomDeCarte = (c: ChampsSaisis): string => [c.civilite, (c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ');

/** L'étiquette de la carte, avec les teintes des cartes de la Gestion (`cp-role--…`). */
export function BadgeCarte({ cote, sorte }: { cote: CoteCarte; sorte: SorteCarte }) {
  const ton = sorte === 'contact' ? 'contact' : cote === 'proprietaire' ? 'proprietaire' : 'en_place';
  return <span className={`cp-role cp-role--${ton}`} data-badge={sorte}>{sorte === 'contact' ? BADGE_CONTACT[cote] : BADGE_CLIENT[cote]}</span>;
}

export function SaisieCartes({ cote, onChange }: { cote: CoteCarte; onChange: (e: EtatCartes) => void }) {
  const [cartes, setCartes] = useState<Carte[]>([{ cle: 1, sorte: 'client', champs: null, ouverte: true, doublons: [] }]);
  const [existants, setExistants] = useState<{ id: number; nom: string }[]>([]);
  const [choix, setChoix] = useState(false);
  const minuteurs = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    onChange({
      clients: cartes.filter((c) => c.sorte === 'client' && c.champs !== null && !c.ouverte).map((c) => c.champs as ChampsSaisis),
      contacts: cartes.filter((c) => c.sorte === 'contact' && c.champs !== null && !c.ouverte).map((c) => c.champs as ChampsSaisis),
      existants, ouvertes: cartes.filter((c) => c.ouverte).length,
    });
  }, [cartes, existants, onChange]);

  const changer = (cle: number, f: (c: Carte) => Carte): void => setCartes((l) => l.map((c) => (c.cle === cle ? f(c) : c)));
  const ajouter = (sorte: SorteCarte): void => {
    setCartes((l) => [...l, { cle: Math.max(0, ...l.map((x) => x.cle)) + 1, sorte, champs: null, ouverte: true, doublons: [] }]);
    setChoix(false);
  };

  // 🔴 LE DÉDOUBLONNAGE DÈS LA SAISIE (cartes client) : 400 ms après la dernière frappe dans un téléphone ou un e-mail.
  const surSaisie = useCallback((cle: number, coordonnees: CoordonneeSaisie[]): void => {
    const t = minuteurs.current.get(cle);
    if (t !== undefined) clearTimeout(t);
    const remplies = coordonnees.filter((k) => k.valeur.trim() !== '');
    if (remplies.length === 0) { setCartes((l) => l.map((c) => (c.cle === cle ? { ...c, doublons: [] } : c))); return; }
    minuteurs.current.set(cle, setTimeout(() => {
      const qs = remplies.map((k) => `${k.sorte === 'email' ? 'email' : 'telephone'}=${encodeURIComponent(k.valeur)}`).join('&');
      void fetch(`${API}?${qs}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ etat?: string; data?: Doublon[] }>)
        .then((d) => setCartes((l) => l.map((c) => (c.cle === cle ? { ...c, doublons: d.etat === 'ok' ? [...liste(d.data)] : [] } : c))))
        .catch(() => {});
    }, 400));
  }, []);

  const utiliserFiche = (cle: number, d: Doublon): void => {
    setExistants((l) => (l.some((x) => x.id === d.id) ? l : [...l, { id: d.id, nom: d.nom }]));
    setCartes((l) => l.filter((c) => c.cle !== cle));
  };

  return (
    <>
      {existants.length > 0 && (
        <ul className="loc-puces" aria-label="Fiches déjà connues retenues">
          {existants.map((x) => (
            <li key={x.id} className="loc-puce" data-existant={x.id}>
              <span>{x.nom} <small>· fiche existante</small></span>
              <button type="button" aria-label={`Retirer ${x.nom}`} onClick={() => setExistants((l) => l.filter((y) => y.id !== x.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="loc-cartes-creation">
        {cartes.map((c, i) => (
          <div key={c.cle} data-carte={i + 1} data-sorte={c.sorte}>
            {c.ouverte ? (
              <div className="cp-carte">
                <p className="loc-carte-badge"><BadgeCarte cote={cote} sorte={c.sorte} /></p>
                {c.sorte === 'client' ? (
                  <FormulaireCarte p={c.champs === null ? null : ficheDeChamps(c.champs)} refus={null}
                    creation={{ rappel: cote === 'proprietaire' ? 'Sera propriétaire du futur bien. Obligatoires : le nom, un téléphone ou un e-mail.'
                      : 'Sera locataire du bien choisi. Obligatoires : le nom, un téléphone ou un e-mail.' }}
                    exigence={(f) => manquesClientLocation(f)}
                    onSaisie={(k) => surSaisie(c.cle, k)}
                    onEnregistrer={async (champs) => { changer(c.cle, (x) => ({ ...x, champs, ouverte: false })); }}
                    onAnnuler={() => (c.champs === null
                      ? setCartes((l) => (l.length > 1 ? l.filter((x) => x.cle !== c.cle) : l))
                      : changer(c.cle, (x) => ({ ...x, ouverte: false })))} />
                ) : (
                  <FormulaireCarte p={c.champs === null ? null : ficheDeChamps(c.champs)} refus={null}
                    contact={{ titre: `Nouveau ${MOT_CONTACT[cote].toLowerCase()}`,
                      rappel: `Un contact n’est pas un client : il sera rangé comme ${MOT_CONTACT[cote].toLowerCase()} du bien. Obligatoires : le nom et un e-mail.` }}
                    qualiteEnAvant={EXEMPLES_QUALITE[cote]}
                    onEnregistrer={async (champs) => { changer(c.cle, (x) => ({ ...x, champs, ouverte: false })); }}
                    onAnnuler={() => (c.champs === null ? setCartes((l) => l.filter((x) => x.cle !== c.cle)) : changer(c.cle, (x) => ({ ...x, ouverte: false })))} />
                )}
              </div>
            ) : c.champs !== null && (
              <div className={`loc-recap${c.sorte === 'contact' ? ' loc-recap--contact' : ''}`} data-recap={c.sorte}>
                <p className="loc-carte-badge"><BadgeCarte cote={cote} sorte={c.sorte} /></p>
                <strong>{nomDeCarte(c.champs)}</strong>
                {c.sorte === 'contact' && c.champs.qualite ? <span>{c.champs.qualite}</span> : null}
                {c.sorte === 'client' && (c.champs.adresse || c.champs.commune)
                  ? <span>{[c.champs.adresse, [c.champs.codePostal, c.champs.commune].filter((x) => x).join(' ')].filter((x) => x).join(', ')}</span> : null}
                <span>{(c.champs.coordonnees ?? []).map((k) => k.valeur).join(' · ')}</span>
                <div className="loc-boutons">
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changer(c.cle, (x) => ({ ...x, ouverte: true }))}>Modifier</button>
                  <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCartes((l) => l.filter((x) => x.cle !== c.cle))}>Retirer cette carte</button>
                </div>
              </div>
            )}
            {c.sorte === 'client' && c.doublons.length > 0 && (
              <div className="loc-alerte loc-alerte--orange" role="alert" style={{ marginTop: 12 }} data-doublons>
                {c.doublons.map((d) => (
                  <p key={`${d.sujet}-${d.id}-${d.valeur}`} style={{ margin: '0 0 8px' }}>
                    « {d.valeur} » est déjà connu : fiche de <a href={`/admin/location/${d.sujet}/${d.id}`}><strong>{d.nom}</strong></a>
                    {' '}({d.sujet === 'proprietaire' ? 'propriétaire' : 'locataire'}).
                    {d.sujet === cote && (
                      <> <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => utiliserFiche(c.cle, d)}>Utiliser cette fiche</button></>
                    )}
                  </p>
                ))}
                <p style={{ margin: 0 }}>Rien n’est fusionné automatiquement : si c’est une autre personne, continuez.</p>
              </div>
            )}
          </div>
        ))}
        {choix ? (
          <article className="cp-carte cp-carte--choix" aria-label="Que voulez-vous ajouter ?" data-choix>
            <p className="cp-choix-titre">Ajouter…</p>
            <button type="button" className="cp-choix-btn cp-choix-btn--premier" onClick={() => ajouter('client')}>{MOT_CLIENT[cote]}</button>
            <button type="button" className="cp-choix-btn" onClick={() => ajouter('contact')}>{MOT_CONTACT[cote]}</button>
            <button type="button" className="gst-lien-bouton" onClick={() => setChoix(false)}>Annuler</button>
          </article>
        ) : (
          <button type="button" className="loc-ajouter-carte" onClick={() => setChoix(true)}>+ Ajouter…</button>
        )}
      </div>
    </>
  );
}
