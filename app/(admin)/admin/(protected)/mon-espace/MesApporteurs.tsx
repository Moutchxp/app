'use client';

import { eur } from '../../../../lib/transaction/format';
import { useEffect, useState } from 'react';
import { montantAffiche, useAffichage } from '../transaction/commun';
import { CSS_PANNEAUX_APPORTEUR } from '../location/PanneauxApporteur';
import { FicheApporteurFenetre } from './FicheApporteurFenetre';
import { chercherApporteur, type Doublon, type MesApporteursLus } from '../../../../lib/mon-espace/apporteurs';

/**
 * ══ 🔴 MON ESPACE, LOT 9 (Arno, 02/11/2026) — L'ONGLET « MES APPORTEURS » ═════════════════════════════════════════════════════════════════════════
 * L'annuaire de la Location (le même, aucune copie), tel que je le vois : rattachés à moi, sur mes ventes, que j'utilise (un administrateur :
 * tous). Pour chacun : ses coordonnées, son collègue de rattachement, ses ventes et le CA apporté sur MES ventes (`parApporteur`, comme le Suivi
 * CA) ; la recherche (nom, téléphone, e-mail) ; « Modifier la fiche » (son collègue de rattachement ou un administrateur : la fiche de la
 * Location, journalisée, garde de version) ; « + Nouvel apporteur » (le formulaire existant ; zéro doublon : « L'utiliser »).
 * 🔴 D26 (Arno, 03/11/2026) — créer ET modifier passent par la MÊME fenêtre (`FicheApporteurFenetre`) : tous les champs, le collègue rattaché,
 * le taux et la rémunération ; la fiche posée dans la carte (cassée ici, faute des styles de la Location) est remplacée par cette fenêtre.
 */
export const URL_APPORTEURS = '/api/admin/mon-espace/apporteurs';

/** Envoie un geste sur un apporteur ; rend le motif d'un refus (null : accepté), l'état et ce que le serveur renvoie. */
export async function posterApporteur(corps: Record<string, unknown>): Promise<{ motif: string | null; etat?: string; data?: { id?: number; avertissement?: string } | null;
  doublons?: Doublon[] }> {
  try {
    const r = await fetch(URL_APPORTEURS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = (await r.json()) as { etat?: string; motif?: string; message?: string; data?: { id?: number; avertissement?: string } | null; doublons?: Doublon[] };
    return d.etat === 'ok' ? { motif: null, data: d.data } : { motif: d.motif ?? d.message ?? 'Enregistrement refusé.', etat: d.etat, doublons: d.doublons };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.' };
  }
}

export function MesApporteurs() {
  const u = useAffichage();
  const [lu, setLu] = useState<MesApporteursLus | null | 'erreur'>(null);
  const [lecture, setLecture] = useState(0);
  const [texte, setTexte] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const [fiche, setFiche] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_APPORTEURS, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: MesApporteursLus };
        if (vivant) setLu(r.ok && j.etat === 'ok' && j.data !== undefined ? j.data : 'erreur');
      } catch { if (vivant) setLu('erreur'); }
    })();
    return () => { vivant = false; };
  }, [lecture]);
  if (lu === null) return <p className="loc-muet" role="status">Chargement de vos apporteurs…</p>;
  if (lu === 'erreur') return <p className="loc-alerte loc-alerte--orange" role="alert" data-apporteurs-erreur>Vos apporteurs n’ont pas pu être lus. Rechargez la page.</p>;
  const relire = (m?: string): void => { setMessage(m ?? null); setLecture((x) => x + 1); };
  const liste = chercherApporteur(lu.apporteurs, texte);
  const ouverte = fiche === null ? undefined : lu.apporteurs.find((a) => a.id === fiche && a.modifiable);
  const montant = (ht: number): string => montantAffiche(u, ht, ht * 1.2);
  return (
    <div className="mes-apporteurs" data-mes-apporteurs>
      <style>{CSS_PANNEAUX_APPORTEUR}{CSS_MES_APPORTEURS}</style>
      <div className="mes-apporteurs-tete">
        <label className="mes-apporteurs-recherche">Rechercher (nom, téléphone, e-mail)
          <input type="search" value={texte} onChange={(e) => setTexte(e.target.value)} data-recherche-apporteur /></label>
        {!nouveau && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setNouveau(true); setMessage(null); }} data-nouvel-apporteur-mon-espace>+ Nouvel apporteur</button>}
      </div>
      {nouveau && <FicheApporteurFenetre lu={lu} texte={texte} envoyer={posterApporteur} onFermer={() => setNouveau(false)}
        onChoisir={() => { setNouveau(false); setMessage('Cet apporteur est déjà dans votre liste.'); }}
        onEnregistre={(m) => { setNouveau(false); relire(m); }} />}
      {ouverte !== undefined && <FicheApporteurFenetre key={ouverte.id} a={ouverte.fiche} lu={lu} envoyer={posterApporteur} onFermer={() => setFiche(null)}
        onEnregistre={(m) => { setFiche(null); relire(m); }} onRelire={() => setLecture((x) => x + 1)} />}
      {message !== null && <p className="mes-mise-a-jour" role="status" data-message-apporteurs>{message}</p>}
      {!lu.utiliserDisponible && <p className="loc-muet" data-utiliser-indisponible>« L’utiliser » garde un apporteur existant dans votre liste après la mise à jour de la base (migration 450) ;
        d’ici là, il se choisit dans le compromis.</p>}
      {liste.length === 0 ? <p className="loc-muet" data-apporteurs-vide>{lu.apporteurs.length === 0 ? 'Aucun apporteur rattaché à vous ni sur vos ventes.' : 'Aucun apporteur ne correspond à la recherche.'}</p> : (
        <ul className="mes-apporteurs-liste">
          {liste.map((a) => (
            <li key={a.id} className="svv-card mes-apporteur" data-mon-apporteur={a.id}>
              <div className="mes-apporteur-tete">
                <strong>{a.libelle}</strong>{a.interne && <span className="loc-pastille"> interne</span>}
                {a.societe && <span className="loc-muet"> · {a.societe}</span>}
              </div>
              <p className="mes-apporteur-coord">
                {a.telephone ? <a href={`tel:${a.telephone.replace(/\s/g, '')}`}>{a.telephone}</a> : <span className="trx-a-renseigner">téléphone à renseigner</span>}
                {' · '}{a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : <span className="trx-a-renseigner">e-mail à renseigner</span>}
              </p>
              <p className="loc-muet" data-apporteur-collegue>{a.interne ? 'Apporteur interne (son compte de l’interface)' : `Collègue de rattachement : ${a.collegue ?? 'à rattacher'}`}</p>
              <p className="mes-apporteur-chiffres" data-apporteur-chiffres>Sur vos ventes : {a.nbVentes} vente{a.nbVentes > 1 ? 's' : ''} — CA apporté {montant(a.caApporteHt)}
                {a.retroHt > 0 && <> — rétrocessions <span className="trx-rouge" data-retro-apporteur>{a.interne ? montant(a.retroHt) : `${eur(a.retroHt)} sans TVA`}</span></>}</p>
              {a.modifiable && <button type="button" className="svv-btn svv-btn-outline gst-btn" aria-haspopup="dialog" onClick={() => { setFiche(a.id); setMessage(null); }}
                data-modifier-apporteur={a.id}>Modifier la fiche</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CSS_MES_APPORTEURS = `
.mes-apporteurs{display:flex;flex-direction:column;gap:.75rem}
.mes-apporteurs-tete{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:.5rem}
.mes-apporteurs-recherche{display:flex;flex-direction:column;gap:.25rem;font-weight:600;flex:1 1 260px}
.mes-apporteurs-recherche input{min-height:44px;padding:0 .75rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-apporteurs-liste{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:.75rem}
.mes-apporteur{display:flex;flex-direction:column;gap:.35rem}
.mes-apporteur p{margin:0}
.mes-apporteur-coord a{color:var(--color-svv-ink)}
.mes-apporteur .gst-btn{min-height:44px;align-self:flex-start}
`;
