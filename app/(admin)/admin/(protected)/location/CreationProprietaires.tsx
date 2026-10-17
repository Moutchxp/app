'use client';

import { useCallback, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer } from './commun';
import { CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import { SaisieCartes, type EtatCartes } from './SaisieCartes';
import { poserContactsEnAttente } from './contactsEnAttente';

/**
 * ══ 🔴🔴 TUILE LOCATION — « CRÉER UN NOUVEAU PROPRIÉTAIRE » (/admin/location/nouveau-proprietaire), Arno, 17/10/2026 ══
 *
 * « Les CARTES DE CONTACT HABITUELLES (les mêmes composants que la Gestion, mêmes champs, dédoublonnage dès la saisie par
 * e-mail ou téléphone, alerte “déjà connu” + “Utiliser cette fiche”, jamais de fusion automatique). “+ Ajouter un contact” :
 * autant de cartes qu'on veut (couple, indivision, SCI…), tous propriétaires du même futur bien. N° de mandat de gestion
 * (facultatif). En dessous, un GROS bouton “Ajouter un bien à ce nouveau propriétaire” : enregistre les contacts puis ouvre
 * le formulaire du bien avec ce ou ces propriétaires déjà rattachés. »
 *
 * 🔴 LA CARTE EST `FormulaireCarte`, le formulaire de création des cartes de la Gestion, exécuté tel quel (mêmes champs,
 * même règle de complétude, même mise en forme). Son « Enregistrer » VALIDE la carte sur cette page ; les fiches ne sont
 * créées en base qu'au gros bouton — une page abandonnée ne laisse aucune fiche orpheline.
 */
export function CreationProprietaires() {
  const [etat, setEtat] = useState<EtatCartes>({ clients: [], contacts: [], existants: [], ouvertes: 1 });
  const [mandat, setMandat] = useState('');
  /** « Propriétaire(s) en gestion ? » — `null` tant qu'on n'a pas répondu (ni mandat, ni gros bouton). */
  const [enGestion, setEnGestion] = useState<boolean | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const surCartes = useCallback((e: EtatCartes) => { setEtat(e); setMotif(null); }, []);

  // Au moins UNE carte « Propriétaire (client) » : les contacts seuls ne suffisent pas (Arno, 17/10/2026).
  const nbProprietaires = etat.clients.length + etat.existants.length;
  const empeche = nbProprietaires === 0
    ? (etat.contacts.length > 0 ? 'Un contact n’est pas un client : ajoutez au moins une carte « Propriétaire (client) ».'
      : 'Remplissez et enregistrez au moins une carte « Propriétaire (client) » (ou utilisez une fiche déjà connue).')
    : etat.ouvertes > 0 ? 'Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant de continuer.' : null;

  const continuer = async (): Promise<void> => {
    if (empeche !== null) { setMotif(empeche); return; }
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer-proprietaires', numeroMandat: enGestion ? mandat : '', enGestion,
      cartes: etat.clients, existants: etat.existants.map((x) => x.id),
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const ids = (r.data as { ids?: number[] } | undefined)?.ids ?? [];
    // Les contacts suivent jusqu'au bien : ils y seront enregistrés (une carte de contact se range sur un bien).
    poserContactsEnAttente(ids, etat.contacts);
    window.location.href = `/admin/location/nouveau-bien?proprietaires=${ids.join(',')}`;
  };

  return (
    <div className="loc-page loc-ample">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE}</style>
      <EnTeteLocation titre="Créer un nouveau propriétaire"
        sous="Une carte par personne (couple, indivision, SCI…) : tous seront propriétaires du même futur bien." />

      <section className="loc-section" aria-labelledby="loc-p1">
        <h3 id="loc-p1"><span className="loc-num">1</span>Le ou les propriétaires</h3>
        <p className="loc-section-phrase">« + Ajouter… » : un <strong>propriétaire (client)</strong> ou un <strong>contact du propriétaire</strong> (conjoint,
          gestionnaire, notaire, gardien…). « Enregistrer » valide la carte sur cette page ; tout est enregistré au gros bouton du bas
          (les contacts, avec le bien). Un téléphone ou un e-mail déjà connu est signalé : rien n’est jamais fusionné.</p>
        <SaisieCartes cote="proprietaire" onChange={surCartes} />
      </section>

      {/* Arno (17/10/2026) : « Propriétaire(s) en gestion ? » — Oui / Non, deux gros boutons ; on peut changer d'avis.
          Oui ⇒ le N° de mandat, puis (rempli) le gros bouton ; Non ⇒ le gros bouton tout de suite, mandat vidé. */}
      <section className="loc-section" aria-labelledby="loc-p2" data-question-gestion>
        <h3 id="loc-p2"><span className="loc-num">2</span>Propriétaire(s) en gestion ?</h3>
        <div className="loc-gros-boutons loc-oui-non" role="group" aria-label="Propriétaire(s) en gestion ?">
          <button type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={enGestion === true}
            onClick={() => { setEnGestion(true); setMotif(null); }}>{enGestion === true ? '✓ Oui' : 'Oui'}</button>
          <button type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={enGestion === false}
            onClick={() => { setEnGestion(false); setMandat(''); setMotif(null); }}>{enGestion === false ? '✓ Non' : 'Non'}</button>
        </div>
      </section>

      {enGestion === true && (
        <section className="loc-section" aria-labelledby="loc-p3" data-mandat>
          <h3 id="loc-p3"><span className="loc-num">3</span>Mandat de gestion</h3>
          <div className="loc-grille">
            <label className="loc-champ">N° de mandat de gestion (texte libre)
              <input value={mandat} onChange={(e) => setMandat(e.target.value)} placeholder="ex. MG 2026-041" maxLength={80} autoFocus /></label>
          </div>
        </section>
      )}

      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      {(enGestion === false || (enGestion === true && mandat.trim() !== '')) && (
      <button type="button" className="loc-gros-bouton loc-gros-bouton--plein loc-gros-bouton--centre" disabled={envoi} onClick={() => void continuer()}
        title={empeche ?? undefined} data-continuer>
        {envoi ? 'Enregistrement…' : 'Ajouter un bien à ce nouveau propriétaire'}
        <small>{empeche ?? `Enregistre ${nbProprietaires > 1 ? `les ${nbProprietaires} propriétaires` : 'le propriétaire'}, puis ouvre le formulaire du bien avec ${nbProprietaires > 1 ? 'eux' : 'lui'} déjà rattaché${nbProprietaires > 1 ? 's' : ''}${etat.contacts.length > 0 ? ` (et ${etat.contacts.length} contact${etat.contacts.length > 1 ? 's' : ''}, enregistré${etat.contacts.length > 1 ? 's' : ''} avec le bien)` : ''}.`}</small>
      </button>
      )}
      <p className="loc-boutons" style={{ justifyContent: 'flex-start' }}><a href="/admin/location/proprietaires">Annuler et revenir aux propriétaires</a></p>
    </div>
  );
}
