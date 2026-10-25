'use client';

import { CSS_SUIVI_COMMERCIAL } from './SuiviCommercial';
import { corpsOrigineProprietaire, manqueOrigineProprietaire, ORIGINE_PROPRIETAIRE_VIDE, useOrigineProprietaire, type SaisieOrigineProprietaire } from './ChoixOrigineProprietaire';
import { ListeChoix } from './ListeChoix';
import { useEffect, useState } from 'react';
import { API, CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer, phraseMail } from './commun';
import { manquesDpeEntretien } from '../../../../lib/location/bienComplet';
import { aujourdhuiParis } from '../../../../lib/location/reglagesDpe';
import { BlocDpe, CSS_DPE_PNO } from './BlocDpe';
import { BlocEntretien, CSS_ENTRETIEN, ENTRETIEN_VIDE, versEnvoiEntretien, type SaisieEntretien } from './EntretienBien';
import { CATEGORIES_ANNEXE, LIBELLE_CATEGORIE, verifierChampsBien, type Categorie } from '../../../../lib/location/locationBien';
import type { Doublon } from '../../../../lib/location/locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — « NOUVEAU PROPRIÉTAIRE + BIEN + ANNEXES » (/admin/location/nouveau) ═══════════════════════
 * Demande d'Arno (17/10/2026) : « en une seule page à sections, avec alerte de dédoublonnage dès la saisie (même e-mail
 * ou téléphone), sans fusion automatique ». Une coordonnée déjà connue est SIGNALÉE (« déjà sur la fiche de X ») ; on
 * peut alors « Utiliser cette fiche » — jamais rien n'est fusionné tout seul.
 * `?proprietaire=N` (depuis « + Ajouter un bien » d'une fiche) part directement d'un propriétaire existant.
 * 🔴 Arno (18/10/2026) : la page n'a plus de lien mais reste ouverte ; elle applique EXACTEMENT les règles du formulaire
 * complet — DPE (A–G ou « Non soumis », date sauf « Non soumis ») et « Entretien à prévoir » obligatoires, mêmes composants
 * (`BlocDpe`, `BlocEntretien`), même règle (`manquesDpeEntretien`), la même que le serveur (`creerProprietaireEtBiens`).
 */
interface Annexe { cle: number; categorie: Categorie; etage: string; numLotCopro: string; porte: string }
const VIDE_LOGEMENT = { adresse: '', codePostal: '', commune: '', etage: '', porte: '', numLotCopro: '', surfaceCarrezM2: '', surfaceExterieureM2: '' };

export function CreationProprietaireBien({ proprietaireInitial }: { proprietaireInitial: { id: number; nom: string } | null }) {
  const [existant, setExistant] = useState<{ id: number; nom: string } | null>(proprietaireInitial);
  const [p, setP] = useState({ civilite: '', nom: '', prenom: '', telephone: '', email: '', adresse: '', codePostal: '', commune: '', numeroMandat: '' });
  const [logement, setLogement] = useState(VIDE_LOGEMENT);
  const [annexes, setAnnexes] = useState<Annexe[]>([]);
  const [doublons, setDoublons] = useState<Doublon[]>([]);
  const [motif, setMotif] = useState<string | null>(null);
  const [mailEchec, setMailEchec] = useState<{ phrase: string; cible: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [dpe, setDpe] = useState({ classe: '', date: '' });
  const [entretien, setEntretien] = useState<SaisieEntretien>(ENTRETIEN_VIDE);
  const [tente, setTente] = useState(false);
  const aujourdhui = aujourdhuiParis();
  const manque = manquesDpeEntretien({ dpeClasse: dpe.classe, dpeDate: dpe.date, entretienAPrevoir: entretien.aPrevoir, entretiens: versEnvoiEntretien(entretien).entretiens }, aujourdhui);
  const manqueDe = (k: string): React.ReactNode => (tente && manque[k] !== undefined ? <p className="loc-manque" role="alert">{manque[k]}</p> : null);

  // 🔴 LE DÉDOUBLONNAGE DÈS LA SAISIE : 400 ms après la dernière frappe dans le téléphone ou l'e-mail.
  useEffect(() => {
    if (existant !== null || (p.telephone.trim() === '' && p.email.trim() === '')) { setDoublons([]); return; }
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`${API}?telephone=${encodeURIComponent(p.telephone)}&email=${encodeURIComponent(p.email)}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ etat?: string; data?: Doublon[] }>)
        .then((d) => { if (vivant) setDoublons(d.etat === 'ok' ? d.data ?? [] : []); })
        .catch(() => { if (vivant) setDoublons([]); });
    }, 400);
    return () => { vivant = false; clearTimeout(t); };
  }, [p.telephone, p.email, existant]);

  const champP = (k: keyof typeof p, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} {...props} /></label>
  );
  const champL = (k: keyof typeof VIDE_LOGEMENT, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={logement[k]} onChange={(e) => setLogement({ ...logement, [k]: e.target.value })} {...props} /></label>
  );
  const ajouterAnnexe = (categorie: Categorie): void =>
    setAnnexes((a) => [...a, { cle: Date.now() + a.length, categorie, etage: '', numLotCopro: '', porte: '' }]);

  // 🔴 Arno (25/10/2026, 425) — l'origine du contact du propriétaire CRÉÉ ici : obligatoire (« Origine inconnue » est un choix).
  const [origine, setOrigine] = useState<SaisieOrigineProprietaire>(ORIGINE_PROPRIETAIRE_VIDE);
  const choixOrigine = useOrigineProprietaire(origine, (v) => { setOrigine(v); setMotif(null); });
  const enregistrer = async (): Promise<void> => {
    if (existant === null && p.nom.trim() === '') { setMotif('Le nom du propriétaire est obligatoire.'); return; }
    if (existant === null && choixOrigine.disponible === true && manqueOrigineProprietaire(origine) !== null) { setMotif(manqueOrigineProprietaire(origine)); return; }
    if (logement.adresse.trim() === '') { setMotif('L’adresse du logement est obligatoire.'); return; }
    const v = verifierChampsBien(logement);
    if (!v.ok) { setMotif(v.motif); return; }
    setTente(true);
    if (Object.keys(manque).length > 0) { setMotif(`Reste à renseigner : ${Object.values(manque).map((m) => m.replace(/\.$/, '')).join(' · ')}.`); return; }
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer', proprietaireId: existant?.id ?? null, proprietaire: p, ...(existant === null ? { origine: corpsOrigineProprietaire(origine) } : {}),
      logement: { ...logement, categorie: 'logement', dpeClasse: dpe.classe, dpeDate: dpe.date, ...versEnvoiEntretien(entretien) },
      annexes: annexes.map(({ categorie, etage, numLotCopro, porte }) => ({ categorie, etage, numLotCopro, porte })),
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const data = r.data as { logementId?: number } | undefined;
    const cible = data?.logementId !== undefined ? `/admin/location/bien/${data.logementId}` : '/admin/location';
    const echec = phraseMail(r.mail);
    if (echec !== null) { setMailEchec({ phrase: echec, cible }); return; }
    window.location.href = cible;
  };

  return (
    <form className="loc-page" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_ENTRETIEN + CSS_DPE_PNO + CSS_SUIVI_COMMERCIAL}</style>
      <EnTeteLocation titre="Nouveau propriétaire + bien" sous="Une seule page : obligatoires — le nom du propriétaire, l’adresse du logement, le DPE et l’entretien à prévoir." />

      <section className="loc-bloc" aria-labelledby="loc-s1">
        <h3 id="loc-s1">1 · Propriétaire</h3>
        {existant !== null ? (
          <p>Propriétaire existant : <a href={`/admin/location/proprietaire/${existant.id}`}><strong>{existant.nom}</strong></a>{' '}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setExistant(null)}>Créer un autre propriétaire</button></p>
        ) : (
          <>
            <div className="loc-grille">
              <label className="loc-champ">Civilité
                <ListeChoix options={['M.', 'Mme', 'M. et Mme', 'SCI', 'Sté', 'Indivision'].map((c) => ({ id: c, libelle: c }))} valeur={p.civilite} vide="—" libelle="Civilité"
                  onChange={(v) => setP({ ...p, civilite: v })} donnees={{ 'data-civilite-proprietaire': '' }} /></label>
              {champP('nom', 'Nom *', { autoFocus: true, required: true })}
              {champP('prenom', 'Prénom')}
              {champP('telephone', 'Téléphone', { inputMode: 'tel', placeholder: 'ex. 06 12 34 56 78' })}
              {champP('email', 'E-mail', { inputMode: 'email', placeholder: 'ex. nom@exemple.fr' })}
              {champP('adresse', 'Adresse postale')}
              {champP('codePostal', 'Code postal', { inputMode: 'numeric' })}
              {champP('commune', 'Commune')}
            </div>
            {doublons.length > 0 && (
              <div className="loc-alerte loc-alerte--orange" role="alert" style={{ marginTop: 10 }} data-doublons>
                {doublons.map((d) => (
                  <p key={`${d.sujet}-${d.id}-${d.valeur}`} style={{ margin: '0 0 6px' }}>
                    « {d.valeur} » est déjà sur la fiche de <a href={`/admin/location/${d.sujet}/${d.id}`}><strong>{d.nom}</strong></a>
                    {' '}({d.sujet === 'proprietaire' ? 'propriétaire' : 'locataire'}).
                    {d.sujet === 'proprietaire' && (
                      <> <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setExistant({ id: d.id, nom: d.nom })}>
                        Utiliser cette fiche</button></>
                    )}
                  </p>
                ))}
                <p className="loc-muet" style={{ margin: 0 }}>Rien n’est fusionné automatiquement : si c’est une autre personne, continuez.</p>
              </div>
            )}
          </>
        )}
        {existant === null && choixOrigine.disponible === true && (
          <div data-origine-proprietaire style={{ marginTop: 10 }}>
            <div className="loc-grille loc-suivi-ligne loc-suivi-ligne--deux">{choixOrigine.champs}</div>
            {choixOrigine.apres}
            <small className="loc-muet">Reprise ensuite pour ses biens et chaque nouvelle location (modifiable sur la location).</small>
          </div>
        )}
        <div className="loc-grille" style={{ marginTop: 10 }}>
          {champP('numeroMandat', 'N° de mandat de gestion (facultatif, texte libre)', { placeholder: 'ex. MG 2026-041' })}
        </div>
      </section>

      <section className="loc-bloc" aria-labelledby="loc-s2">
        <h3 id="loc-s2">2 · Logement</h3>
        <div className="loc-grille">
          {champL('adresse', 'Adresse *', { required: true })}
          {champL('codePostal', 'Code postal', { inputMode: 'numeric' })}
          {champL('commune', 'Commune')}
          {champL('etage', 'Étage', { placeholder: 'ex. 3, RDC, -1' })}
          {champL('porte', 'N° de porte')}
          {champL('numLotCopro', 'N° de lot de copropriété')}
          {champL('surfaceCarrezM2', 'Surface Carrez/Boutin m²', { inputMode: 'decimal' })}
          {champL('surfaceExterieureM2', 'Surface extérieure (m²)', { inputMode: 'decimal' })}
        </div>
      </section>

      <section className="loc-bloc" aria-labelledby="loc-s3">
        <h3 id="loc-s3">3 · Annexes <span className="loc-muet" style={{ fontWeight: 400 }}>— à l’adresse du logement, rattachées à lui pour toujours</span></h3>
        {annexes.length > 0 && (
          <ul className="loc-arbre">
            {annexes.map((a, i) => (
              <li key={a.cle} className="loc-enfant" style={{ display: 'block' }}>
                <div className="loc-grille">
                  <label className="loc-champ">Catégorie
                    <ListeChoix options={CATEGORIES_ANNEXE.map((c) => ({ id: c, libelle: LIBELLE_CATEGORIE[c] }))} valeur={a.categorie} vide={null} libelle="Catégorie"
                      onChange={(v) => setAnnexes((l) => l.map((x, j) => (j === i ? { ...x, categorie: v as Categorie } : x)))} donnees={{ 'data-categorie-annexe': String(i) }} /></label>
                  {(['etage', 'numLotCopro', 'porte'] as const).map((k) => (
                    <label key={k} className="loc-champ">
                      {k === 'etage' ? 'Étage' : k === 'numLotCopro' ? 'N° de lot de copropriété' : a.categorie === 'parking' || a.categorie === 'box' ? 'N° de place' : 'N° de porte'}
                      <input value={a[k]} onChange={(e) => setAnnexes((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                    </label>
                  ))}
                </div>
                <div className="loc-boutons"><button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => setAnnexes((l) => l.filter((_, j) => j !== i))}>Retirer cette ligne</button></div>
              </li>
            ))}
          </ul>
        )}
        <div className="loc-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => ajouterAnnexe('cave')}>+ Cave</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => ajouterAnnexe('parking')}>+ Parking</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => ajouterAnnexe('autre')}>+ Autre annexe</button>
        </div>
      </section>

      <section className="loc-bloc" aria-labelledby="loc-s4" data-bloc-dpe-entretien>
        <h3 id="loc-s4">4 · DPE et entretien</h3>
        <div className="loc-dpe-pno loc-dpe-pno--seul">
          <BlocDpe classe={dpe.classe} date={dpe.date} aujourdhui={aujourdhui}
            onClasse={(c) => setDpe((x) => ({ ...x, classe: c }))} onDate={(d) => setDpe((x) => ({ ...x, date: d }))} manque={(k) => manqueDe(k)} />
        </div>
        <BlocEntretien valeur={entretien} onChange={setEntretien} obligatoire
          manques={{ reponse: manqueDe('entretien'), liste: manqueDe('entretienListe'), autre: (k) => manqueDe(`entretien-autre-${k}`) }} />
      </section>

      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      {mailEchec !== null && (
        <p className="loc-alerte loc-alerte--orange" role="alert" data-mail-echec>{mailEchec.phrase} <a href={mailEchec.cible}>Ouvrir la fiche du bien</a></p>
      )}
      <div className="loc-boutons">
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/proprietaires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}
