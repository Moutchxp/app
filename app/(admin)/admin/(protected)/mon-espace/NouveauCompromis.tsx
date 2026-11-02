'use client';

import { useEffect, useState } from 'react';
import { FormulaireDossier, etatRepartitionDe, type References } from '../transaction/FormulaireDossier';
import { changerNegociateur } from '../transaction/Repartition';
import { LIBELLE_SOCIETE, SOCIETES, type Societe } from '../../../../lib/transaction/modele';
import { LONGUEUR_MAX_MANDAT } from '../../../../lib/transaction/mandat';
import type { TransactionDuMandat } from '../../../../lib/mon-espace/creation';

/**
 * ══ 🔴 MON ESPACE, LOT 5 (Arno, 02/11/2026) — « + NOUVEAU COMPROMIS » DEPUIS « MON ESPACE », EN TROIS TEMPS ═════════════════════════════════════
 *   ① la structure (CRITERIMMO ou MACJ), rien d'autre à l'écran ;
 *   ② le n° de mandat, obligatoire (impossible d'avancer sans lui) ;
 *   ③ la vérification dans la structure choisie (`/api/admin/mon-espace/mandat`, les fonctions uniques du lot 2) : libre → ④ ; déjà pris → la
 *      transaction existante (bien, parties, structure, statut, date du compromis, collègues rattachés) et « Rejoindre cette transaction » —
 *      à ce lot, un écran d'attente honnête ; aucun doublon possible (le serveur refuse aussi, 422) ;
 *   ④ le côté que je tiens (entrée ou sortie ; un administrateur peut créer pour un collègue), puis le formulaire EXISTANT de la tuile Suivi CA
 *      (`FormulaireDossier`), la structure et le n° posés (n° non modifiable), moi à mon côté ; l'autre côté se remplit aussi (décision 2).
 * L'envoi passe par /api/admin/mon-espace/compromis, qui enregistre par la MÊME fonction que la tuile.
 */
export const URL_REFERENCES = '/api/admin/mon-espace/references';
export const URL_MANDAT = '/api/admin/mon-espace/mandat';
export const URL_COMPROMIS = '/api/admin/mon-espace/compromis';

type Refs = References & { titulaireId: number; administrateur: boolean; aujourdhui: string };
type Etape = 'structure' | 'mandat' | 'pris' | 'rejoindre' | 'cote' | 'formulaire';
type Cote = 'entree' | 'sortie' | 'aucun';

const jourFr = (d: string | null): string | null => (d === null ? null : d.split('-').reverse().join('/'));

/** Envoie le dossier à la route de « Mon espace » ; rend le motif d'un refus (null : accepté) et l'id du compromis créé. */
async function envoyerMonEspace(corps: { id: number | null; dossier: Record<string, unknown> }): Promise<{ motif: string | null; data: number | null }> {
  try {
    const r = await fetch(URL_COMPROMIS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = (await r.json()) as { etat?: string; motif?: string; message?: string; erreur?: string; data?: number };
    if (d.etat === 'ok') return { motif: null, data: d.data ?? null };
    return { motif: d.motif ?? d.message ?? (r.status === 403 ? 'Accès refusé : droit « Mon espace » requis (ou session expirée).' : 'Enregistrement refusé.'), data: null };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.', data: null };
  }
}

export function NouveauCompromis({ onFermer, onCree }: { onFermer: () => void; onCree: (id: number) => void }) {
  const [etape, setEtape] = useState<Etape>('structure');
  const [societe, setSociete] = useState<Societe | null>(null);
  const [numero, setNumero] = useState('');
  const [verifie, setVerifie] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<TransactionDuMandat | null>(null);
  const [cote, setCote] = useState<Cote | null>(null);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_REFERENCES, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: Refs };
        if (vivant && r.ok && j.etat === 'ok' && j.data !== undefined) setRefs(j.data);
        else if (vivant) setMotif('Le formulaire n’a pas pu être préparé. Rechargez la page.');
      } catch { if (vivant) setMotif('Le formulaire n’a pas pu être préparé. Rechargez la page.'); }
    })();
    return () => { vivant = false; };
  }, []);

  const verifier = async (): Promise<void> => {
    if (societe === null || numero.trim() === '') return;
    setEnvoi(true); setMotif(null);
    try {
      const r = await fetch(`${URL_MANDAT}?societe=${societe}&numero=${encodeURIComponent(numero.trim())}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; motif?: string; data?: { libre: boolean; numero: string; transaction?: TransactionDuMandat } };
      if (j.etat !== 'ok' || j.data === undefined) { setMotif(j.motif ?? 'Vérification impossible.'); return; }
      setVerifie(j.data.numero);
      if (j.data.libre) { setTransaction(null); setEtape('cote'); } else { setTransaction(j.data.transaction ?? null); setEtape('pris'); }
    } catch { setMotif('Vérification impossible : le serveur n’a pas répondu.'); } finally { setEnvoi(false); }
  };

  const titre = <h3 className="mes-parcours-titre">Nouveau compromis{societe !== null && etape !== 'structure' ? ` — ${LIBELLE_SOCIETE[societe]}` : ''}</h3>;
  const fermer = <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-parcours-fermer>Fermer</button>;
  const ligne = (mot: string, valeur: string | null) => <div className="mes-parcours-info"><dt>{mot}</dt><dd className={valeur === null ? 'trx-a-renseigner' : undefined}>{valeur ?? 'à renseigner'}</dd></div>;

  if (etape === 'formulaire' && refs !== null && societe !== null && verifie !== null && cote !== null) {
    const negos = refs.negociateurs;
    const base = etatRepartitionDe(null, negos, refs.uniteCommission === true);
    const repartition = cote === 'aucun' ? base : changerNegociateur(base, cote, refs.titulaireId, negos);
    return <FormulaireDossier societe={societe} vente={null} references={refs} repartitionInitiale={repartition} mandatFixe={verifie} envoyer={envoyerMonEspace}
      onFermer={onFermer} onFait={(e) => { if (e !== undefined && e.id > 0) onCree(e.id); else onFermer(); }} />;
  }

  return (
    <section className="svv-card mes-parcours" aria-label="Nouveau compromis" data-parcours={etape}>
      {titre}
      {etape === 'structure' && <>
        <p className="mes-parcours-question">① Pour quelle structure ?</p>
        <div className="mes-parcours-choix" role="group" aria-label="Structure concernée">
          {SOCIETES.map((x) => <button key={x} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setSociete(x); setEtape('mandat'); }}
            data-structure={x}>{LIBELLE_SOCIETE[x]}</button>)}
        </div>
        <div className="trx-actions">{fermer}</div>
      </>}
      {etape === 'mandat' && <form className="trx-form" onSubmit={(e) => { e.preventDefault(); void verifier(); }}>
        <p className="mes-parcours-question trx-plein">② Le n° de mandat (obligatoire)</p>
        <label className="trx-plein">N° de mandat
          <input value={numero} onChange={(e) => setNumero(e.target.value)} required maxLength={LONGUEUR_MAX_MANDAT} autoComplete="off" autoFocus data-parcours-mandat /></label>
        <div className="trx-plein trx-actions">
          <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || numero.trim() === ''} data-parcours-verifier>Vérifier et continuer</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setEtape('structure'); setMotif(null); }}>Changer de structure</button>
          {fermer}
        </div>
      </form>}
      {etape === 'pris' && <>
        <p className="loc-alerte loc-alerte--orange" role="status" data-mandat-pris>Ce mandat existe déjà chez {societe === null ? '' : LIBELLE_SOCIETE[societe]} : la transaction ci-dessous le porte.
          Pour éviter un doublon, rejoignez-la plutôt que d’en créer une autre.</p>
        {transaction !== null && <dl className="mes-parcours-infos" data-transaction-existante={transaction.id}>
          {ligne('N° de mandat', transaction.numero)}
          {ligne('Affaire', transaction.libelle)}
          {ligne('Bien', transaction.adresseBien)}
          {ligne('Vendeur(s)', transaction.vendeurs.length === 0 ? null : transaction.vendeurs.join(', '))}
          {ligne('Acquéreur(s)', transaction.acquereurs.length === 0 ? null : transaction.acquereurs.join(', '))}
          {ligne('Structure', LIBELLE_SOCIETE[transaction.societe])}
          {ligne('Statut', transaction.statut === 'vendue' ? `vendue${transaction.dateActe !== null ? ` (acte du ${jourFr(transaction.dateActe)})` : ''}` : 'compromis en cours')}
          {ligne('Date du compromis', jourFr(transaction.dateCompromis))}
          {ligne('Négociateur d’entrée', transaction.entree)}
          {ligne('Négociateur de sortie', transaction.sortie)}
        </dl>}
        <div className="trx-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setEtape('rejoindre')} data-rejoindre>Rejoindre cette transaction</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setEtape('mandat'); setMotif(null); }} data-autre-mandat>Saisir un autre n°</button>
          {fermer}
        </div>
      </>}
      {etape === 'rejoindre' && <>
        <p role="status" data-rejoindre-attente>Rejoindre une transaction existante (y renseigner votre côté) sera disponible au prochain lot. Aucun nouveau compromis n’a été créé.</p>
        <div className="trx-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtape('pris')}>Revenir à la transaction</button>
          {fermer}
        </div>
      </>}
      {etape === 'cote' && <>
        <p className="mes-parcours-question">N° {verifie} : libre chez {societe === null ? '' : LIBELLE_SOCIETE[societe]}. ③ Votre côté sur cette affaire ?</p>
        <div className="mes-parcours-choix" role="group" aria-label="Votre côté">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setCote('entree'); setEtape('formulaire'); }} disabled={refs === null} data-cote="entree">
            Entrée du mandat (côté vendeur)</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setCote('sortie'); setEtape('formulaire'); }} disabled={refs === null} data-cote="sortie">
            Sortie du mandat (côté acquéreur)</button>
          {refs?.administrateur === true && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setCote('aucun'); setEtape('formulaire'); }} data-cote="aucun">
            Pour un collègue (je ne suis sur aucun côté)</button>}
        </div>
        <div className="trx-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setEtape('mandat')}>Changer le n°</button>
          {fermer}
        </div>
      </>}
      {motif !== null && <p className="trx-erreur" role="alert" data-parcours-motif>{motif}</p>}
    </section>
  );
}

// Les jetons de la charte seulement (Clair et Sombre) ; cibles de 44 px ; une colonne sur téléphone.
export const CSS_NOUVEAU_COMPROMIS = `
.mes-parcours{margin:0 0 1rem;display:flex;flex-direction:column;gap:.75rem}
.mes-parcours-titre{margin:0;font-size:1.1rem}
.mes-parcours-question{margin:0;font-weight:600}
.mes-parcours-choix{display:flex;flex-wrap:wrap;gap:.5rem}
.mes-parcours-choix .gst-btn{min-height:44px;flex:1 1 220px}
.mes-parcours-infos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:.5rem 1rem;margin:0}
.mes-parcours-info dt{font-size:.85rem;color:var(--color-svv-muted)}
.mes-parcours-info dd{margin:0;font-weight:600;color:var(--color-svv-ink)}
.mes-nouveau{min-height:44px}
`;
