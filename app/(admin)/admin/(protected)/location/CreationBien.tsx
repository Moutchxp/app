'use client';

import { useEffect, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, EtatLecture, envoyer, liste, useLecture } from './commun';
import { ChampAdresseBan, CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import {
  CHAUFFAGES, CLASSES_DPE, EPOQUES_CONSTRUCTION, LIBELLE_TYPE_LOGEMENT, manquesDuBien, TYPES_LOGEMENT, type TypeLogement,
} from '../../../../lib/location/bienComplet';
import { verifierChampsBien, type Categorie } from '../../../../lib/location/locationBien';
import type { ResultatPortefeuille } from '../../../../lib/location/recherchePortefeuille';

/**
 * ══ 🔴🔴 TUILE LOCATION — « AJOUTER UN NOUVEAU BIEN » (/admin/location/nouveau-bien), Arno, 17/10/2026 ══════════════════
 *
 * « Juste au-dessus du formulaire, une ligne de recherche qui ne cherche QUE parmi les propriétaires (nom, prénom,
 * téléphone, e-mail, et adresse postale des biens en gestion de notre portefeuille — aucune autre adresse). Choisir un
 * résultat rattache le bien à ce propriétaire (plusieurs possibles). Si on arrive depuis “Créer un nouveau propriétaire”,
 * les propriétaires sont déjà là, modifiables. »
 * « Formulaire complet, logique ENTONNOIR (du plus général / important au détail), en sections titrées » : 1 Propriétaire(s)
 * · 2 Adresse et situation · 3 Le logement · 4 Copropriété · 5 Annexes · 6 Caractéristiques complémentaires · 7 Commentaires.
 * « Obligatoires : au moins un propriétaire, l'adresse, le type de logement. Bouton “Enregistrer le bien” toujours
 * accessible (en bas et collant). » La règle est celle de `bienComplet.ts`, la même que le serveur.
 */
interface Annexe { cle: number; categorie: Categorie; etage: string; numLotCopro: string; porte: string }

const VIDE = {
  adresse: '', codePostal: '', commune: '', batiment: '', escalier: '', etage: '', porte: '',
  nombrePieces: '', surfaceHabitableM2: '', surfaceCarrezM2: '', surfaceExterieureM2: '',
  numLotCopro: '', syndicId: '', epoqueConstruction: '', chauffage: '', dpeClasse: '', dpeDate: '', commentaire: '',
};
type Champ = keyof typeof VIDE;

const LIBELLE_ANNEXE: Record<string, string> = { cave: 'Cave', parking: 'Parking', box: 'Box', autre: 'Autre annexe' };

export function CreationBien({ proprietairesInitiaux }: { proprietairesInitiaux: number[] }) {
  const [proprietaires, setProprietaires] = useState<ResultatPortefeuille[]>([]);
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [b, setB] = useState(VIDE);
  const [type, setType] = useState<TypeLogement | null>(null);
  const [meuble, setMeuble] = useState<boolean | null>(null);
  const [adresseVerifiee, setAdresseVerifiee] = useState(false);
  const [annexes, setAnnexes] = useState<Annexe[]>([]);
  const [tente, setTente] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Les propriétaires arrivés de « Créer un nouveau propriétaire » : déjà rattachés, modifiables (retirables).
  const initiaux = useLecture<ResultatPortefeuille[]>(proprietairesInitiaux.length > 0 ? `proprietairesIds=${proprietairesInitiaux.join(',')}` : null);
  const [initiauxPoses, setInitiauxPoses] = useState(false);
  useEffect(() => {
    if (!initiauxPoses && initiaux.etat.etat === 'ok') {
      setProprietaires(liste(initiaux.etat.data).slice());
      setInitiauxPoses(true);
    }
  }, [initiaux.etat, initiauxPoses]);

  useEffect(() => { const t = setTimeout(() => setTerme(texte.trim()), 200); return () => clearTimeout(t); }, [texte]);
  const recherche = useLecture<ResultatPortefeuille[]>(terme.length >= 2 ? `proprietairesRecherche=${encodeURIComponent(terme)}` : null);
  const syndics = useLecture<{ id: number; nom: string; ville: string | null }[]>('syndics=1');

  const champ = (k: Champ, mot: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }} {...props} /></label>
  );
  const choix = (k: Champ, mot: string, options: readonly string[]) => (
    <label className="loc-champ">{mot}
      <select value={b[k]} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, [k]: val })); }}>
        <option value="">— non renseigné —</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select></label>
  );
  const ajouterAnnexe = (categorie: Categorie): void =>
    setAnnexes((a) => [...a, { cle: Date.now() + a.length, categorie, etage: '', numLotCopro: '', porte: '' }]);

  const manque = manquesDuBien({ proprietaireIds: proprietaires.map((p) => p.id), adresse: b.adresse, typeLogement: type });
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);

  const enregistrer = async (): Promise<void> => {
    setTente(true);
    if (Object.keys(manque).length > 0) { setMotif(Object.values(manque).join(' ')); return; }
    const v = verifierChampsBien(b);
    if (!v.ok) { setMotif(v.motif); return; }
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer-bien', proprietaireIds: proprietaires.map((p) => p.id),
      logement: { ...b, typeLogement: type, meuble },
      annexes: annexes.map(({ categorie, etage, numLotCopro, porte }) => ({ categorie, etage, numLotCopro, porte })),
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const id = (r.data as { logementId?: number } | undefined)?.logementId;
    window.location.href = id !== undefined ? `/admin/location/bien/${id}` : '/admin/location/proprietaires';
  };

  const resultats = recherche.etat.etat === 'ok' ? liste(recherche.etat.data).filter((r) => !proprietaires.some((p) => p.id === r.id)) : [];

  return (
    <form className="loc-page loc-ample" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CHAMP_ADRESSE}</style>
      <EnTeteLocation titre="Ajouter un nouveau bien"
        sous={<>Obligatoires : au moins un propriétaire, l’adresse, le type de logement <span className="loc-oblig">*</span>. Tout le reste se complète plus tard.</>} />

      <section className="loc-section" aria-labelledby="loc-b1">
        <h3 id="loc-b1"><span className="loc-num">1</span>Propriétaire(s) <span className="loc-oblig">*</span></h3>
        <label className="loc-recherche" aria-label="Chercher un propriétaire">
          <span aria-hidden="true">🔎</span>
          <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)}
            placeholder="Chercher un propriétaire : nom, prénom, téléphone, e-mail, ou adresse d’un bien du portefeuille" />
        </label>
        {terme.length >= 2 && (recherche.etat.etat !== 'ok' ? <EtatLecture etat={recherche.etat} /> : resultats.length === 0
          ? <p className="loc-muet">Aucun propriétaire ne correspond à « {terme} ».</p> : (
            <ul className="loc-choix" data-resultats-proprietaires>
              {resultats.map((r) => (
                <li key={r.id}><button type="button" aria-pressed={false}
                  onClick={() => { setProprietaires((l) => [...l, r]); setTexte(''); setTerme(''); }}>
                  <span><strong>{r.titre}</strong></span><span className="loc-muet">{r.detail ?? ''}</span></button></li>
              ))}
            </ul>
          ))}
        {proprietaires.length > 0 ? (
          <ul className="loc-puces" aria-label="Propriétaires rattachés" data-proprietaires>
            {proprietaires.map((p) => (
              <li key={p.id} className="loc-puce">
                <span>{p.titre}</span>
                <button type="button" aria-label={`Retirer ${p.titre}`} onClick={() => setProprietaires((l) => l.filter((x) => x.id !== p.id))}>✕</button>
              </li>
            ))}
          </ul>
        ) : <p className="loc-muet" style={{ margin: 0 }}>Aucun propriétaire rattaché. Cherchez-le ci-dessus, ou <a href="/admin/location/nouveau-proprietaire">créez un nouveau propriétaire</a>.</p>}
        {manqueDe('proprietaires')}
      </section>

      <section className="loc-section" aria-labelledby="loc-b2">
        <h3 id="loc-b2"><span className="loc-num">2</span>Adresse et situation</h3>
        <div className="loc-grille">
          <label className="loc-champ" style={{ gridColumn: '1 / -1' }}>
            <span>Adresse <span className="loc-oblig">*</span></span>
            <ChampAdresseBan valeur={b.adresse} verifiee={adresseVerifiee}
              onChange={(v) => { setB((x) => ({ ...x, adresse: v })); setAdresseVerifiee(false); }}
              onChoisir={(a) => { setB((x) => ({ ...x, adresse: a.voie, codePostal: a.codePostal, commune: a.commune })); setAdresseVerifiee(true); }} />
          </label>
          {champ('codePostal', 'Code postal', { inputMode: 'numeric', maxLength: 5 })}
          {champ('commune', 'Commune')}
        </div>
        {manqueDe('adresse')}
        <div className="loc-sous-section">
          <h4>Situation dans l’immeuble</h4>
          <div className="loc-grille">
            {champ('batiment', 'Bâtiment', { placeholder: 'ex. B' })}
            {champ('escalier', 'Escalier', { placeholder: 'ex. 2' })}
            {champ('etage', 'Étage', { placeholder: '3, RDC, -1…' })}
            {champ('porte', 'N° de porte')}
          </div>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b3">
        <h3 id="loc-b3"><span className="loc-num">3</span>Le logement</h3>
        <div className="loc-sous-section">
          <h4>Type de logement <span className="loc-oblig">*</span></h4>
          <div className="loc-pilules" role="group" aria-label="Type de logement">
            {TYPES_LOGEMENT.map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>{LIBELLE_TYPE_LOGEMENT[t]}</button>
            ))}
          </div>
          {manqueDe('typeLogement')}
        </div>
        <div className="loc-sous-section">
          <h4>Meublé ?</h4>
          <div className="loc-pilules" role="group" aria-label="Meublé ou non">
            <button type="button" aria-pressed={meuble === true} onClick={() => setMeuble(meuble === true ? null : true)}>Meublé</button>
            <button type="button" aria-pressed={meuble === false} onClick={() => setMeuble(meuble === false ? null : false)}>Non meublé</button>
          </div>
        </div>
        <div className="loc-sous-section">
          <h4>Pièces et surfaces</h4>
          <div className="loc-grille">
            {champ('nombrePieces', 'Nombre de pièces', { inputMode: 'numeric', placeholder: 'ex. 3' })}
            {champ('surfaceHabitableM2', 'Surface habitable (m²)', { inputMode: 'decimal' })}
            {champ('surfaceCarrezM2', 'Surface Carrez (m²)', { inputMode: 'decimal' })}
            {champ('surfaceExterieureM2', 'Surface extérieure — balcon, terrasse, jardin (m²)', { inputMode: 'decimal' })}
          </div>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b4">
        <h3 id="loc-b4"><span className="loc-num">4</span>Copropriété</h3>
        <div className="loc-grille">
          {champ('numLotCopro', 'N° de lot au règlement de copropriété')}
          <label className="loc-champ">Syndic (syndics connus de la Gestion)
            <select value={b.syndicId} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, syndicId: val })); }} disabled={syndics.etat.etat !== 'ok'}>
              <option value="">— non renseigné —</option>
              {syndics.etat.etat === 'ok' && liste(syndics.etat.data).map((s) => (
                <option key={s.id} value={String(s.id)}>{s.nom}{s.ville ? ` — ${s.ville}` : ''}</option>
              ))}
            </select></label>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b5">
        <h3 id="loc-b5"><span className="loc-num">5</span>Annexes</h3>
        <p className="loc-section-phrase">À l’adresse du logement, rattachées à lui pour toujours.</p>
        <ul className="loc-annexes" data-annexes>
          <li className="loc-racine">Logement{b.adresse.trim() !== '' ? ` · ${b.adresse}` : ''}</li>
          {annexes.map((a, i) => (
            <li key={a.cle} className="loc-enfant" data-annexe={a.categorie}>
              <p className="loc-annexe-tete">{LIBELLE_ANNEXE[a.categorie] ?? 'Annexe'}
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAnnexes((l) => l.filter((_, j) => j !== i))}>Retirer</button></p>
              <div className="loc-grille">
                {(['etage', 'numLotCopro', 'porte'] as const).map((k) => (
                  <label key={k} className="loc-champ">
                    {k === 'etage' ? 'Étage' : k === 'numLotCopro' ? 'N° de lot' : a.categorie === 'parking' || a.categorie === 'box' ? 'N° de place' : 'N° de porte'}
                    <input value={a[k]} onChange={(e) => setAnnexes((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <div className="loc-pilules">
          <button type="button" onClick={() => ajouterAnnexe('cave')}>+ Cave</button>
          <button type="button" onClick={() => ajouterAnnexe('parking')}>+ Parking</button>
          <button type="button" onClick={() => ajouterAnnexe('autre')}>+ Autre</button>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b6">
        <h3 id="loc-b6"><span className="loc-num">6</span>Caractéristiques complémentaires</h3>
        <div className="loc-grille">
          {choix('epoqueConstruction', 'Époque de construction', EPOQUES_CONSTRUCTION)}
          {choix('chauffage', 'Chauffage', CHAUFFAGES)}
        </div>
        <div className="loc-sous-section">
          <h4>DPE</h4>
          <div className="loc-pilules" role="group" aria-label="Classe DPE">
            {CLASSES_DPE.map((c) => (
              <button key={c} type="button" aria-pressed={b.dpeClasse === c} onClick={() => setB((x) => ({ ...x, dpeClasse: x.dpeClasse === c ? '' : c }))}>{c}</button>
            ))}
          </div>
          <div className="loc-grille">{champ('dpeDate', 'Date du DPE', { type: 'date' })}</div>
        </div>
      </section>

      <section className="loc-section" aria-labelledby="loc-b7">
        <h3 id="loc-b7"><span className="loc-num">7</span>Commentaires</h3>
        <label className="loc-champ">Commentaire libre
          <textarea value={b.commentaire} onChange={(e) => { const val = e.target.value; setB((x) => ({ ...x, commentaire: val })); }} maxLength={4000} /></label>
      </section>

      <div className="loc-collant" data-collant>
        <p className="loc-manques" role="status">
          {motif ?? (Object.keys(manque).length > 0 ? `Reste à renseigner : ${Object.values(manque).map((m) => m.replace(/\.$/, '')).join(' · ')}.` : 'Tout l’obligatoire est renseigné.')}
        </p>
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/proprietaires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer le bien'}</button>
      </div>
    </form>
  );
}
