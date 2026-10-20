'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer } from './commun';
import { CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import { SaisieCartes, type EtatCartes } from './SaisieCartes';
import { CreationBien } from './CreationBien';
import { CSS_FETE } from './FeteOui';
import { QuestionEnGestion } from './QuestionEnGestion';

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
 *
 * 🔴 Arno, 18/10/2026 — LE BIEN DANS LA CONTINUITÉ : le gros bouton n'enregistre plus rien ; il ouvre JUSTE EN DESSOUS le
 * formulaire « Ajouter un nouveau bien » lui-même (`CreationBien`, mode `continuite`, sans le bloc « Propriétaire(s) »), et
 * descend jusqu'à lui en douceur. Son « Enregistrer le bien » crée les fiches (une seule fois, même après un refus du bien)
 * puis le bien, avec les contacts saisis.
 */
export function CreationProprietaires() {
  const [etat, setEtat] = useState<EtatCartes>({ clients: [], contacts: [], existants: [], ouvertes: 1 });
  const [mandat, setMandat] = useState('');
  /** Arno, 18/10/2026 : Non ⇒ le N° de mandat de TRANSACTION LOCATIVE (même règle que le mandat de gestion). */
  const [transaction, setTransaction] = useState('');
  /** « Propriétaire(s) en gestion ? » — `null` tant qu'on n'a pas répondu (ni mandat, ni gros bouton). */
  const [enGestion, setEnGestion] = useState<boolean | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const surCartes = useCallback((e: EtatCartes) => { setEtat(e); setMotif(null); }, []);
  /** Le formulaire du bien est-il ouvert sous les cartes ? */
  const [formulaire, setFormulaire] = useState(false);
  /** Les fiches déjà créées (un refus du bien ne les fait pas recréer). */
  const idsCrees = useRef<number[] | null>(null);
  const ancre = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!formulaire || ancre.current === null) return;
    const doux = typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ancre.current.scrollIntoView?.({ behavior: doux ? 'smooth' : 'auto', block: 'start' });
  }, [formulaire]);

  // Au moins UNE carte « Propriétaire (client) » : les contacts seuls ne suffisent pas (Arno, 17/10/2026).
  const nbProprietaires = etat.clients.length + etat.existants.length;
  const empeche = nbProprietaires === 0
    ? (etat.contacts.length > 0 ? 'Un contact n’est pas un client : ajoutez au moins une carte « Propriétaire (client) ».'
      : 'Remplissez et enregistrez au moins une carte « Propriétaire (client) » (ou utilisez une fiche déjà connue).')
    : etat.ouvertes > 0 ? 'Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant de continuer.' : null;

  const continuer = (): void => {
    if (empeche !== null) { setMotif(empeche); return; }
    if (formulaire) { ancre.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); return; }
    setFormulaire(true);
  };

  /** Crée les fiches des cartes, UNE seule fois : appelé par « Enregistrer le bien » du formulaire du dessous. */
  const creerFiches = async (): Promise<{ ids: number[] } | { motif: string }> => {
    if (idsCrees.current !== null) return { ids: idsCrees.current };
    if (empeche !== null) return { motif: empeche };
    const r = await envoyer({
      action: 'creer-proprietaires', numeroMandat: enGestion ? mandat : '', numeroMandatTransaction: enGestion === false ? transaction : '', enGestion,
      cartes: etat.clients, existants: etat.existants.map((x) => x.id),
    });
    if (r.motif !== null) return { motif: r.motif };
    const ids = (r.data as { ids?: number[] } | undefined)?.ids ?? [];
    idsCrees.current = ids;
    return { ids };
  };
  const nomDeCarte = (c: { civilite?: string | null; nom?: string | null; prenom?: string | null }): string =>
    [c.civilite, (c.nom ?? '').toUpperCase(), c.prenom].filter((x) => (x ?? '') !== '').join(' ');

  return (
    <div className="loc-page loc-ample">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE + CSS_FETE}</style>
      <EnTeteLocation titre="Créer un nouveau propriétaire"
        sous="Une carte par personne (couple, indivision, SCI…) : tous seront propriétaires du même futur bien." />

      <section className="loc-section" aria-labelledby="loc-p1">
        <h3 id="loc-p1"><span className="loc-num">1</span>Le ou les propriétaires</h3>
        <p className="loc-section-phrase">« + Ajouter… » : un <strong>propriétaire (client)</strong> ou un <strong>contact du propriétaire</strong> (conjoint,
          artisan, avocat, voisin…). « Enregistrer » valide la carte sur cette page ; tout est enregistré au gros bouton du bas
          (les contacts, avec le bien). Un téléphone ou un e-mail déjà connu est signalé : rien n’est jamais fusionné.</p>
        <SaisieCartes cote="proprietaire" onChange={surCartes} />
      </section>

      {/* Arno (17/10/2026) : « Propriétaire(s) en gestion ? » — Oui / Non, deux gros boutons ; on peut changer d'avis.
          Oui ⇒ le N° de mandat de gestion, Non ⇒ le N° de mandat de transaction locative (Arno, 18/10/2026) ; le gros bouton
          n'apparaît qu'une fois le numéro rempli ; changer d'avis vide le champ de l'autre choix. Le bloc est
          `QuestionEnGestion`, le même que « Bien en gestion ? » de l'écran « Nouveau bien » (Arno, 20/10/2026). */}
      <QuestionEnGestion id="loc-p2" numero={2} titre="Propriétaire(s) en gestion ?" sorte="proprietaires" valeur={enGestion}
        onChoix={(oui) => { setEnGestion(oui); if (oui) setTransaction(''); else setMandat(''); setMotif(null); }} />

      {enGestion === true && (
        <section className="loc-section" aria-labelledby="loc-p3" data-mandat>
          <h3 id="loc-p3"><span className="loc-num">3</span>Mandat de gestion</h3>
          <div className="loc-grille">
            <label className="loc-champ">N° de mandat de gestion (texte libre)
              <input value={mandat} onChange={(e) => setMandat(e.target.value)} placeholder="ex. MG 2026-041" maxLength={80} autoFocus /></label>
          </div>
        </section>
      )}

      {enGestion === false && (
        <section className="loc-section" aria-labelledby="loc-p3t" data-mandat-transaction>
          <h3 id="loc-p3t"><span className="loc-num">3</span>Mandat de transaction locative</h3>
          <div className="loc-grille">
            <label className="loc-champ">N° de mandat de transaction locative (texte libre)
              <input value={transaction} onChange={(e) => setTransaction(e.target.value)} placeholder="ex. MT 2026-041" maxLength={80} autoFocus /></label>
          </div>
        </section>
      )}

      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      {((enGestion === false && transaction.trim() !== '') || (enGestion === true && mandat.trim() !== '')) && (
      <button type="button" className="loc-gros-bouton loc-gros-bouton--plein loc-gros-bouton--centre" onClick={continuer}
        title={empeche ?? undefined} data-continuer aria-expanded={formulaire}>
        {formulaire ? 'Le bien de ce nouveau propriétaire ↓' : 'Ajouter un bien à ce nouveau propriétaire'}
        <small>{empeche ?? `Ouvre juste en dessous le formulaire du bien, avec ${nbProprietaires > 1 ? `les ${nbProprietaires} propriétaires` : 'le propriétaire'} déjà rattaché${nbProprietaires > 1 ? 's' : ''}${etat.contacts.length > 0 ? ` et ${etat.contacts.length} contact${etat.contacts.length > 1 ? 's' : ''}` : ''} ; un seul « Enregistrer le bien » crée les fiches puis le bien.`}</small>
      </button>
      )}
      {formulaire && (
        <div ref={ancre} className="loc-suite-bien" data-formulaire-bien>
          <CreationBien proprietairesInitiaux={[]} continuite={{
            proprietaires: [...etat.clients.map((c) => ({ nom: nomDeCarte(c) })), ...etat.existants.map((x) => ({ nom: x.nom }))],
            contacts: etat.contacts, creerFiches, enGestion,
          }} />
        </div>
      )}
      <p className="loc-boutons" style={{ justifyContent: 'flex-start' }}><a href="/admin/location/proprietaires">Annuler et revenir aux propriétaires</a></p>
    </div>
  );
}
