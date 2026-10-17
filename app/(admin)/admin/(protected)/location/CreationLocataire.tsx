'use client';

import { useEffect, useState } from 'react';
import { API, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer, liste, useLecture } from './commun';
import type { Doublon } from '../../../../lib/location/locationRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — « NOUVEAU LOCATAIRE » (/admin/location/nouveau-locataire), refonte du 17/10/2026 ═══════════
 * « Création d'un locataire rattaché à un bien (dédoublonnage dès la saisie comme pour le propriétaire). » Un téléphone ou
 * un e-mail déjà connu est SIGNALÉ ; « Utiliser cette fiche » rattache le locataire existant au bien — jamais de fusion.
 * Le bien se choisit parmi ceux du PORTEFEUILLE (en gestion, non sortis).
 */
export function CreationLocataire() {
  const [existant, setExistant] = useState<{ id: number; nom: string } | null>(null);
  const [l, setL] = useState({ civilite: '', nom: '', prenom: '', telephone: '', email: '' });
  const [filtreBien, setFiltreBien] = useState('');
  const [terme, setTerme] = useState('');
  const [bien, setBien] = useState<{ id: number; titre: string } | null>(null);
  const [entree, setEntree] = useState('');
  const [doublons, setDoublons] = useState<Doublon[]>([]);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { const t = setTimeout(() => setTerme(filtreBien.trim()), 250); return () => clearTimeout(t); }, [filtreBien]);
  const biens = useLecture<{ id: number; titre: string; detail: string | null }[]>(`biensPourLocataire=${encodeURIComponent(terme)}`);

  // 🔴 LE DÉDOUBLONNAGE DÈS LA SAISIE : 400 ms après la dernière frappe dans le téléphone ou l'e-mail.
  useEffect(() => {
    if (existant !== null || (l.telephone.trim() === '' && l.email.trim() === '')) { setDoublons([]); return; }
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`${API}?telephone=${encodeURIComponent(l.telephone)}&email=${encodeURIComponent(l.email)}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ etat?: string; data?: Doublon[] }>)
        .then((d) => { if (vivant) setDoublons(d.etat === 'ok' ? liste(d.data) as Doublon[] : []); })
        .catch(() => { if (vivant) setDoublons([]); });
    }, 400);
    return () => { vivant = false; clearTimeout(t); };
  }, [l.telephone, l.email, existant]);

  const champ = (k: keyof typeof l, mot: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="loc-champ">{mot}<input value={l[k]} onChange={(e) => setL({ ...l, [k]: e.target.value })} {...props} /></label>
  );

  const enregistrer = async (): Promise<void> => {
    if (existant === null && l.nom.trim() === '') { setMotif('Le nom du locataire est obligatoire.'); return; }
    if (bien === null) { setMotif('Choisissez le bien loué.'); return; }
    setEnvoi(true);
    const r = await envoyer({ action: 'creer-locataire', locataireId: existant?.id ?? null, locataire: l, lotId: bien.id, entree: entree === '' ? null : entree });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const data = r.data as { locataireId?: number } | undefined;
    window.location.href = data?.locataireId !== undefined ? `/admin/location/locataire/${data.locataireId}` : '/admin/location/locataires';
  };

  return (
    <form className="loc-page" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS}</style>
      <EnTeteLocation titre="Nouveau locataire" sous="Seuls le nom du locataire et le bien loué sont obligatoires." />

      <section className="loc-bloc" aria-labelledby="loc-l1">
        <h3 id="loc-l1">1 · Locataire</h3>
        {existant !== null ? (
          <p>Locataire existant : <a href={`/admin/location/locataire/${existant.id}`}><strong>{existant.nom}</strong></a>{' '}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setExistant(null)}>Créer un autre locataire</button></p>
        ) : (
          <>
            <div className="loc-grille">
              <label className="loc-champ">Civilité
                <select value={l.civilite} onChange={(e) => setL({ ...l, civilite: e.target.value })}>
                  <option value="">—</option>{['M.', 'Mme', 'M. et Mme', 'Sté'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select></label>
              {champ('nom', 'Nom *', { autoFocus: true, required: true })}
              {champ('prenom', 'Prénom')}
              {champ('telephone', 'Téléphone', { inputMode: 'tel', placeholder: '06 12 34 56 78' })}
              {champ('email', 'E-mail', { inputMode: 'email', placeholder: 'nom@exemple.fr' })}
            </div>
            {doublons.length > 0 && (
              <div className="loc-alerte loc-alerte--orange" role="alert" style={{ marginTop: 10 }} data-doublons>
                {doublons.map((d) => (
                  <p key={`${d.sujet}-${d.id}-${d.valeur}`} style={{ margin: '0 0 6px' }}>
                    « {d.valeur} » est déjà sur la fiche de <a href={`/admin/location/${d.sujet}/${d.id}`}><strong>{d.nom}</strong></a>
                    {' '}({d.sujet === 'proprietaire' ? 'propriétaire' : 'locataire'}).
                    {d.sujet === 'locataire' && (
                      <> <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setExistant({ id: d.id, nom: d.nom })}>Utiliser cette fiche</button></>
                    )}
                  </p>
                ))}
                <p style={{ margin: 0 }}>Rien n’est fusionné automatiquement : si c’est une autre personne, continuez.</p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="loc-bloc" aria-labelledby="loc-l2">
        <h3 id="loc-l2">2 · Bien loué</h3>
        {bien !== null ? (
          <p>Bien : <a href={`/admin/location/bien/${bien.id}`}><strong>{bien.titre}</strong></a>{' '}
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setBien(null)}>Changer de bien</button></p>
        ) : (
          <>
            <label className="loc-champ">Chercher le bien par son adresse (biens du portefeuille)
              <input value={filtreBien} onChange={(e) => setFiltreBien(e.target.value)} placeholder="ex. rue des Lilas" /></label>
            {biens.etat.etat === 'ok' && (
              liste(biens.etat.data).length === 0 ? <p className="loc-muet">Aucun bien du portefeuille ne correspond.</p> : (
                <ul className="loc-choix">
                  {liste(biens.etat.data).map((b) => (
                    <li key={b.id}><button type="button" aria-pressed={false} onClick={() => setBien({ id: b.id, titre: b.titre })}>
                      <span>{b.titre}</span><span>{b.detail}</span></button></li>
                  ))}
                </ul>
              ))}
          </>
        )}
        <div className="loc-grille" style={{ marginTop: 10 }}>
          <label className="loc-champ">Date d’entrée<input type="date" value={entree} onChange={(e) => setEntree(e.target.value)} /></label>
        </div>
      </section>

      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      <div className="loc-boutons">
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/locataires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}
