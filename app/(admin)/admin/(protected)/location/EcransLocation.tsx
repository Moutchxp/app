'use client';

import { useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, liste, useLecture } from './commun';
import { ListeLocation } from './ListesLocation';
import type { SortiePortefeuille } from '../../../../lib/location/recherchePortefeuille';
import type { FicheSyndic } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES TROIS ÉCRANS DE L'ACCUEIL (refonte du 17/10/2026) ════════════════════════════════════
 * ① « Ajouter / supprimer un propriétaire / bien » · ② « Ajouter / supprimer un locataire » · ③ « Outils de suivi ».
 * Ce qui était sur l'ancien accueil (onglets, listes, boutons) est ICI, déplacé, pas perdu.
 */
export function EcranProprietairesBiens() {
  const [onglet, setOnglet] = useState<'proprietaires' | 'biens'>('proprietaires');
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION}</style>
      <EnTeteLocation titre="Propriétaires et biens"
        sous="Créer un propriétaire avec son bien et ses annexes ; « supprimer » = sortir du portefeuille, depuis la fiche (rien n’est effacé)."
        actions={<a className="svv-btn svv-btn-primary gst-btn" href="/admin/location/nouveau">+ Nouveau propriétaire + bien</a>} />
      {/* Arno (17/10/2026) : « en haut, 2 GROS BOUTONS côte à côte, chacun la moitié de la largeur (empilés au téléphone) ».
          Les listes restent dessous : rien n'est retiré (le bouton « + Nouveau propriétaire + bien » non plus). */}
      <ul className="loc-gros-boutons" aria-label="Créer">
        <li><a className="loc-gros-bouton loc-gros-bouton--plein" href="/admin/location/nouveau-proprietaire" data-gros="proprietaire">
          Créer un nouveau propriétaire<small>Une carte de contact par personne (couple, indivision, SCI…), puis son bien.</small></a></li>
        <li><a className="loc-gros-bouton" href="/admin/location/nouveau-bien" data-gros="bien">
          Ajouter un nouveau bien<small>Pour un propriétaire déjà connu : adresse, logement, copropriété, annexes, DPE…</small></a></li>
      </ul>
      <section className="loc-bloc">
        <div className="loc-onglets" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === 'proprietaires'} onClick={() => setOnglet('proprietaires')}>Propriétaires</button>
          <button type="button" role="tab" aria-selected={onglet === 'biens'} onClick={() => setOnglet('biens')}>Biens</button>
        </div>
        <ListeLocation key={onglet} sorte={onglet} />
      </section>
    </div>
  );
}

export function EcranLocataires() {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre="Locataires"
        sous="Créer un locataire rattaché à un bien ; « supprimer » = sortir du portefeuille, depuis la fiche (rien n’est effacé)."
        actions={<a className="svv-btn svv-btn-primary gst-btn" href="/admin/location/nouveau-locataire">+ Nouveau locataire</a>} />
      <section className="loc-bloc"><ListeLocation sorte="locataires" /></section>
    </div>
  );
}

export function EcranOutils({ administrateur }: { administrateur: boolean }) {
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre="Outils de suivi" sous="Les outils de pilotage de la location. D’autres viendront s’ajouter ici." />
      <ul className="loc-cases">
        {administrateur ? (
          <li>
            <a className="loc-case" href="/admin/location/honoraires" data-outil="honoraires">
              <span className="loc-case-titre">Honoraires de gestion</span>
              <span className="loc-case-phrase">Loyer de départ × taux de gestion, par lot, par propriétaire et pour l’agence, au mois et à l’année (administrateurs).</span>
            </a>
          </li>
        ) : (
          <li><p className="loc-bloc loc-muet">« Honoraires de gestion » est réservé aux administrateurs.</p></li>
        )}
      </ul>
    </div>
  );
}

/**
 * « SUPPRIMER » = SORTIR DU PORTEFEUILLE, avec confirmation obligatoire ; une fiche sortie affiche quand et par qui, et se
 * réactive. Rien n'est effacé (historique, mails, tâches de la Gestion restent).
 */
export function BlocSortie({ sujet, id, sortie, apres, explication }: {
  sujet: 'proprietaire' | 'locataire' | 'bien'; id: number; sortie: SortiePortefeuille | null; apres: () => void; explication: string;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const agir = async (action: 'sortir' | 'reactiver'): Promise<void> => {
    setEnvoi(true);
    const r = await envoyer({ action, sujet, id });
    setEnvoi(false);
    setMotif(r.motif);
    if (r.motif === null) { setConfirmer(false); apres(); }
  };
  const date = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <section aria-label="Portefeuille">
      {sortie !== null ? (
        <div className="loc-sortie" role="status" data-sortie>
          <span><strong>Sorti du portefeuille</strong> le {date(sortie.le)}{sortie.par === null ? '' : ` par ${sortie.par}`} — la fiche reste consultable, rien n’a été effacé.</span>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={() => void agir('reactiver')}>Réactiver</button>
        </div>
      ) : !confirmer ? (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setConfirmer(true); setMotif(null); }}>Sortir du portefeuille…</button>
        </div>
      ) : (
        <div className="loc-confirmation" role="alertdialog" aria-label="Confirmer la sortie du portefeuille">
          <p style={{ margin: '0 0 8px' }}><strong>Sortir du portefeuille ?</strong> {explication}</p>
          <p className="loc-muet" style={{ margin: '0 0 8px' }}>Rien n’est effacé : la fiche quitte les listes actives et la recherche, reste dans « Anciens » et peut être réactivée. La Gestion garde l’historique, les mails et les tâches.</p>
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setConfirmer(false)}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void agir('sortir')}>Confirmer la sortie</button>
          </div>
        </div>
      )}
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
    </section>
  );
}

/** La fiche d'un syndic dans la Location : les données de la Gestion, en lecture (aucune copie). */
export function FicheSyndicLocationVue({ id }: { id: number }) {
  const { etat } = useLecture<FicheSyndic>(`syndic=${id}`);
  if (etat.etat !== 'ok') {
    return <div className="loc-page"><style>{CSS_LOCATION_ECRANS}</style><EnTeteLocation titre="Syndic" /><EtatLecture etat={etat} /></div>;
  }
  const s = etat.data;
  return (
    <div className="loc-page">
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre={s.nom} sous={<span className="loc-pastille">Syndic</span>} />
      <section className="loc-bloc">
        <h3>Coordonnées</h3>
        <dl className="loc-grille" style={{ margin: 0 }}>
          {[['Adresse', [s.adresse, [s.codePostal, s.ville].filter((x) => x).join(' ')].filter((x) => x).join(', ') || null],
            ['Téléphone', [s.telephone, s.telephone2].filter((x) => x).join(' · ') || null], ['E-mail', s.email], ['Note', s.note]]
            .map(([mot, val]) => (
              <div key={mot}><dt className="loc-muet">{mot}</dt><dd style={{ margin: 0 }}>{val ?? <span className="loc-muet">non renseigné</span>}</dd></div>
            ))}
        </dl>
      </section>
      <section className="loc-bloc">
        <h3>Contacts <span className="loc-pastille">{liste(s.contacts).length}</span></h3>
        {liste(s.contacts).length === 0 ? <p className="loc-muet">Aucun contact.</p> : (
          <ul className="loc-liste">
            {liste(s.contacts).map((c) => (
              <li key={c.id}>
                <span><strong>{[c.civilite, c.prenom, c.nom].filter((x) => x).join(' ') || 'Contact'}</strong>{c.titre ? <span className="loc-muet"> · {c.titre}</span> : null}</span>
                <span className="loc-muet">{liste(c.coordonnees).map((k) => k.valeur).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="loc-bloc">
        <h3>Copropriétés suivies <span className="loc-pastille">{liste(s.coproprietes).length}</span></h3>
        {liste(s.coproprietes).length === 0 ? <p className="loc-muet">Aucune copropriété en cours.</p> : (
          <ul className="loc-liste">
            {liste(s.coproprietes).map((c) => (
              <li key={c.id} style={{ display: 'block' }}>
                <p style={{ margin: '0 0 4px' }}><strong>{c.libelle}</strong> <span className="loc-muet">{[c.codePostal, c.commune].filter((x) => x).join(' ')}</span></p>
                <p className="loc-muet" style={{ margin: 0 }}>
                  {liste(c.lots).length === 0 ? 'aucun bien de l’annuaire' : liste(c.lots).map((l, i) => (
                    <span key={l.id}>{i > 0 ? ' · ' : ''}<a href={`/admin/location/bien/${l.id}`}>{l.adresse ?? `bien ${l.numero}`}</a></span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="loc-muet">Fiche tenue dans la Gestion (même données) : elle se modifie depuis l’écran des syndics de la Gestion.</p>
    </div>
  );
}
