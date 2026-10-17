'use client';

import { useCallback, useRef, useState } from 'react';
import { API, CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer, liste } from './commun';
import { CSS_CARTES, FormulaireCarte, type ChampsSaisis, type FicheAEditer } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import type { CoordonneeSaisie } from '../../../../lib/gestion/annuaireEdition';
import type { Doublon } from '../../../../lib/location/locationRepo';

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
interface Carte { cle: number; champs: ChampsSaisis | null; ouverte: boolean; doublons: Doublon[] }

const nouvelleCarte = (cle: number): Carte => ({ cle, champs: null, ouverte: true, doublons: [] });

/** Les champs validés d'une carte, relus par le même formulaire quand on la rouvre (« Modifier »). */
function ficheDeChamps(c: ChampsSaisis): FicheAEditer {
  return {
    civilite: c.civilite ?? null, prenom: c.prenom ?? null, nom: c.nom ?? '', qualite: c.qualite ?? null,
    adresse: c.adresse ?? null, codePostal: c.codePostal ?? null, commune: c.commune ?? null, note: c.note ?? null,
    contacts: (c.coordonnees ?? []).map((k, i) => ({ id: i + 1, sorte: k.sorte, affichage: k.valeur, libelle: k.libelle })),
  };
}

const nomDeCarte = (c: ChampsSaisis): string => [c.civilite, (c.nom ?? '').toUpperCase(), c.prenom].filter((x) => x).join(' ');

export function CreationProprietaires() {
  const [cartes, setCartes] = useState<Carte[]>([nouvelleCarte(1)]);
  const [existants, setExistants] = useState<{ id: number; nom: string }[]>([]);
  const [mandat, setMandat] = useState('');
  /** « Propriétaire(s) en gestion ? » — `null` tant qu'on n'a pas répondu (ni mandat, ni gros bouton). */
  const [enGestion, setEnGestion] = useState<boolean | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const minuteurs = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const changer = (cle: number, f: (c: Carte) => Carte): void => setCartes((l) => l.map((c) => (c.cle === cle ? f(c) : c)));

  // 🔴 LE DÉDOUBLONNAGE DÈS LA SAISIE : 400 ms après la dernière frappe dans un téléphone ou un e-mail de la carte.
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
    setCartes((l) => {
      const reste = l.filter((c) => c.cle !== cle);
      return reste;
    });
  };

  const validees = cartes.filter((c) => c.champs !== null && !c.ouverte);
  const ouvertes = cartes.filter((c) => c.ouverte);
  const empeche = validees.length + existants.length === 0 ? 'Remplissez et enregistrez au moins une carte (ou utilisez une fiche déjà connue).'
    : ouvertes.length > 0 ? 'Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant de continuer.' : null;

  const continuer = async (): Promise<void> => {
    if (empeche !== null) { setMotif(empeche); return; }
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer-proprietaires', numeroMandat: enGestion ? mandat : '', enGestion,
      cartes: validees.map((c) => c.champs), existants: existants.map((x) => x.id),
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const ids = (r.data as { ids?: number[] } | undefined)?.ids ?? [];
    window.location.href = `/admin/location/nouveau-bien?proprietaires=${ids.join(',')}`;
  };

  return (
    <div className="loc-page loc-ample">
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE}</style>
      <EnTeteLocation titre="Créer un nouveau propriétaire"
        sous="Une carte par personne (couple, indivision, SCI…) : tous seront propriétaires du même futur bien." />

      <section className="loc-section" aria-labelledby="loc-p1">
        <h3 id="loc-p1"><span className="loc-num">1</span>Le ou les propriétaires</h3>
        <p className="loc-section-phrase">« Enregistrer » valide la carte sur cette page ; les fiches sont créées au clic sur le gros bouton du bas.
          Un téléphone ou un e-mail déjà connu est signalé : rien n’est jamais fusionné automatiquement.</p>
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
            <div key={c.cle} data-carte={i + 1}>
              {c.ouverte ? (
                <div className="cp-carte">
                  <FormulaireCarte p={c.champs === null ? null : ficheDeChamps(c.champs)} refus={null}
                    creation={{ rappel: `Carte ${i + 1} — sera propriétaire du futur bien.` }}
                    onSaisie={(k) => surSaisie(c.cle, k)}
                    onEnregistrer={async (champs) => { changer(c.cle, (x) => ({ ...x, champs, ouverte: false })); setMotif(null); }}
                    onAnnuler={() => (c.champs === null
                      ? setCartes((l) => (l.length > 1 ? l.filter((x) => x.cle !== c.cle) : l))
                      : changer(c.cle, (x) => ({ ...x, ouverte: false })))} />
                </div>
              ) : c.champs !== null && (
                <div className="loc-recap" data-recap>
                  <strong>{nomDeCarte(c.champs)}</strong>
                  <span>{[c.champs.adresse, [c.champs.codePostal, c.champs.commune].filter((x) => x).join(' ')].filter((x) => x).join(', ')}</span>
                  <span>{(c.champs.coordonnees ?? []).map((k) => k.valeur).join(' · ')}</span>
                  <div className="loc-boutons">
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => changer(c.cle, (x) => ({ ...x, ouverte: true }))}>Modifier</button>
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCartes((l) => l.filter((x) => x.cle !== c.cle))}>Retirer cette carte</button>
                  </div>
                </div>
              )}
              {c.doublons.length > 0 && (
                <div className="loc-alerte loc-alerte--orange" role="alert" style={{ marginTop: 12 }} data-doublons>
                  {c.doublons.map((d) => (
                    <p key={`${d.sujet}-${d.id}-${d.valeur}`} style={{ margin: '0 0 8px' }}>
                      « {d.valeur} » est déjà connu : fiche de <a href={`/admin/location/${d.sujet}/${d.id}`}><strong>{d.nom}</strong></a>
                      {' '}({d.sujet === 'proprietaire' ? 'propriétaire' : 'locataire'}).
                      {d.sujet === 'proprietaire' && (
                        <> <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => utiliserFiche(c.cle, d)}>Utiliser cette fiche</button></>
                      )}
                    </p>
                  ))}
                  <p style={{ margin: 0 }}>Rien n’est fusionné automatiquement : si c’est une autre personne, continuez.</p>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="loc-ajouter-carte" onClick={() => setCartes((l) => [...l, nouvelleCarte(Math.max(0, ...l.map((x) => x.cle)) + 1)])}>
            + Ajouter un contact
          </button>
        </div>
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
        <small>{empeche ?? `Enregistre ${validees.length + existants.length > 1 ? `les ${validees.length + existants.length} propriétaires` : 'le propriétaire'}, puis ouvre le formulaire du bien avec ${validees.length + existants.length > 1 ? 'eux' : 'lui'} déjà rattaché${validees.length + existants.length > 1 ? 's' : ''}.`}</small>
      </button>
      )}
      <p className="loc-boutons" style={{ justifyContent: 'flex-start' }}><a href="/admin/location/proprietaires">Annuler et revenir aux propriétaires</a></p>
    </div>
  );
}
