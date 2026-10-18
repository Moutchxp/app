'use client';

import { useCallback, useEffect, useState } from 'react';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, EnTeteLocation, envoyer, liste, useLecture } from './commun';
import { CSS_CARTES } from '../gestion/CartesPersonnes';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';
import { SaisieCartes, type EtatCartes } from './SaisieCartes';

/**
 * ══ 🔴🔴 TUILE LOCATION — « NOUVEAU LOCATAIRE » (/admin/location/nouveau-locataire), refonte du 17/10/2026 ═══════════
 * « Création d'un locataire rattaché à un bien (dédoublonnage dès la saisie comme pour le propriétaire). » Un téléphone ou
 * un e-mail déjà connu est SIGNALÉ ; « Utiliser cette fiche » rattache le locataire existant au bien — jamais de fusion.
 * Le bien se choisit parmi ceux du PORTEFEUILLE (en gestion, non sortis).
 *
 * ══ CLIENTS ET CONTACTS (Arno, 17/10/2026) ═════════════════════════════════════════════════════════════════════════════
 * Même principe que le propriétaire : « + Ajouter… » → « Locataire (client) » (un ou plusieurs : colocation, couple) ou
 * « Contact du locataire » (garant, conjoint, employeur…). Au moins UN locataire ; les contacts sont rangés sur le bien,
 * côté locataire, comme « Contact du locataire » de la Gestion. Obligatoires allégés pour un locataire : le nom, un
 * téléphone ou un e-mail.
 */
export function CreationLocataire() {
  const [etat, setEtat] = useState<EtatCartes>({ clients: [], contacts: [], existants: [], ouvertes: 1 });
  const [filtreBien, setFiltreBien] = useState('');
  const [terme, setTerme] = useState('');
  const [bien, setBien] = useState<{ id: number; titre: string } | null>(null);
  const [entree, setEntree] = useState('');
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const surCartes = useCallback((e: EtatCartes) => { setEtat(e); setMotif(null); }, []);

  useEffect(() => { const t = setTimeout(() => setTerme(filtreBien.trim()), 250); return () => clearTimeout(t); }, [filtreBien]);
  const biens = useLecture<{ id: number; titre: string; detail: string | null }[]>(`biensPourLocataire=${encodeURIComponent(terme)}`);

  const nbLocataires = etat.clients.length + etat.existants.length;
  const enregistrer = async (): Promise<void> => {
    if (nbLocataires === 0) {
      setMotif(etat.contacts.length > 0 ? 'Un contact n’est pas un client : ajoutez au moins une carte « Locataire (client) ».'
        : 'Remplissez et enregistrez au moins une carte « Locataire (client) » (ou utilisez une fiche déjà connue).');
      return;
    }
    if (etat.ouvertes > 0) { setMotif('Une carte est encore ouverte : enregistrez-la (ou annulez-la) avant de continuer.'); return; }
    if (bien === null) { setMotif('Choisissez le bien loué.'); return; }
    setEnvoi(true);
    const r = await envoyer({
      action: 'creer-locataires', cartes: etat.clients, existants: etat.existants.map((x) => x.id), contacts: etat.contacts,
      lotId: bien.id, entree: entree === '' ? null : entree,
    });
    setEnvoi(false);
    if (r.motif !== null) { setMotif(r.motif); return; }
    const ids = (r.data as { locataireIds?: number[] } | undefined)?.locataireIds ?? [];
    window.location.href = ids[0] !== undefined ? `/admin/location/locataire/${ids[0]}` : '/admin/location/locataires';
  };

  return (
    <form className="loc-page loc-ample" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_CARTES + CSS_CHAMP_ADRESSE}</style>
      <EnTeteLocation titre="Nouveau locataire" sous="Au moins un locataire (client) et le bien loué. Les contacts du locataire sont facultatifs." />

      <section className="loc-section" aria-labelledby="loc-l1">
        <h3 id="loc-l1"><span className="loc-num">1</span>Le ou les locataires</h3>
        <p className="loc-section-phrase">« + Ajouter… » : un <strong>locataire (client)</strong> ou un <strong>contact du locataire</strong> (conjoint,
          artisan, avocat, voisin…). « Enregistrer » valide la carte ; tout est enregistré en bas de page. Rien n’est jamais fusionné.</p>
        <SaisieCartes cote="locataire" onChange={surCartes} />
      </section>

      <section className="loc-section" aria-labelledby="loc-l2">
        <h3 id="loc-l2"><span className="loc-num">2</span>Bien loué</h3>
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
        <div className="loc-grille">
          <label className="loc-champ">Date d’entrée<input type="date" value={entree} onChange={(e) => setEntree(e.target.value)} /></label>
        </div>
      </section>

      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      <div className="loc-collant" data-collant>
        <p className="loc-manques" role="status">
          {nbLocataires === 0 ? 'Reste à renseigner : au moins un locataire (client).' : bien === null ? 'Reste à choisir : le bien loué.'
            : `${nbLocataires} locataire${nbLocataires > 1 ? 's' : ''}${etat.contacts.length > 0 ? ` et ${etat.contacts.length} contact${etat.contacts.length > 1 ? 's' : ''}` : ''}, prêt${nbLocataires + etat.contacts.length > 1 ? 's' : ''} à enregistrer.`}
        </p>
        <a className="svv-btn svv-btn-outline gst-btn" href="/admin/location/locataires">Annuler</a>
        <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}
