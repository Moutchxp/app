'use client';

import { useEffect, useRef, useState } from 'react';
import { FormulaireDossier, etatRepartitionDe, referencesSures, type References } from '../transaction/FormulaireDossier';
import { changerNegociateur } from '../transaction/Repartition';
import { LIBELLE_SOCIETE, SOCIETES, type Societe } from '../../../../lib/transaction/modele';
import { LONGUEUR_MAX_MANDAT } from '../../../../lib/transaction/mandat';
import { manquesCreateur } from '../../../../lib/mon-espace/compromisCommun';
import type { TransactionDuMandat } from '../../../../lib/mon-espace/creation';
import type { VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';

/**
 * ══ 🔴 MON ESPACE, LOT 5 (Arno, 02/11/2026) — « + NOUVEAU COMPROMIS » DEPUIS « MON ESPACE », EN TROIS TEMPS ═════════════════════════════════════
 *   ① la structure (CRITERIMMO ou MACJ), rien d'autre à l'écran ;
 *   ② le n° de mandat, obligatoire (impossible d'avancer sans lui) ;
 *   ③ la vérification dans la structure choisie (`/api/admin/mon-espace/mandat`, les fonctions uniques du lot 2) : libre → ④ ; déjà pris → la
 *      transaction existante (bien, parties, structure, statut, date du compromis, collègues rattachés) et « Rejoindre cette transaction » ;
 *      aucun doublon possible (le serveur refuse aussi, 422) ;
 *   🔴 LOT 6 — « Rejoindre » : je choisis un côté LIBRE (un côté déjà tenu ne se rejoint pas : la répartition tient un négociateur par côté), puis
 *      le formulaire EXISTANT s'ouvre sur CETTE affaire (sans la commission des autres) pour y renseigner ce qui manque ; aucune vente n'est créée ;
 *   ④ le côté que je tiens (entrée ou sortie ; un administrateur peut créer pour un collègue), puis le formulaire EXISTANT de la tuile Suivi CA
 *      (`FormulaireDossier`), la structure et le n° posés (n° non modifiable), moi à mon côté ; l'autre côté se remplit aussi (décision 2).
 * L'envoi passe par /api/admin/mon-espace/compromis, qui enregistre par la MÊME fonction que la tuile.
 */
export const URL_REFERENCES = '/api/admin/mon-espace/references';
export const URL_MANDAT = '/api/admin/mon-espace/mandat';
export const URL_COMPROMIS = '/api/admin/mon-espace/compromis';
export const URL_VENTE = '/api/admin/mon-espace/vente';
export const URL_JOURNAL = '/api/admin/mon-espace/journal';

type Refs = References & { titulaireId: number; administrateur: boolean; aujourdhui: string;
  /** 🔴 Décision 12 — la structure de mon profil (rattaché à une seule) ; null : les deux, ou aucun rattachement enregistré (la question reste). */
  structureImposee?: Societe | null };
type Etape = 'structure' | 'mandat' | 'pris' | 'rejoindre' | 'cote' | 'formulaire' | 'formulaireRejoindre';
type Cote = 'entree' | 'sortie' | 'aucun';

const jourFr = (d: string | null): string | null => (d === null ? null : d.split('-').reverse().join('/'));

/** Envoie le dossier à la route de « Mon espace » ; rend le motif d'un refus (null : accepté) et l'id du compromis. 🔴 LOT 6 : aussi une modification
 *  (`id`, `version`) ou un « Rejoindre » (`rejoindre: { numero }`). */
export async function envoyerMonEspace(corps: Record<string, unknown>): Promise<{ motif: string | null; data: number | null }> {
  try {
    const r = await fetch(URL_COMPROMIS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const d = (await r.json()) as { etat?: string; motif?: string; message?: string; erreur?: string; data?: number };
    if (d.etat === 'ok') return { motif: null, data: d.data ?? null };
    return { motif: d.motif ?? d.message ?? (r.status === 403 ? 'Accès refusé : droit « Mon espace » requis (ou session expirée).' : 'Enregistrement refusé.'), data: null };
  } catch {
    return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.', data: null };
  }
}

/** 🔴 Arno (05/11/2026) — le récapitulatif du compromis commun que la route rend à la création (côtés, partage, mails envoyés). */
export interface RecapCommunEcran {
  mandat: string | null; structure: string; cotes: { entree: string | null; sortie: string | null }; partage: string[]; disponible: boolean;
  mails: { compteId: number; nom: string; email: string | null; envoye: boolean; motif: string | null }[];
}

/** La ligne de chaque collaborateur prévenu (ou pas) dans la fenêtre de confirmation. PUR. */
export function phraseMailPrevenu(m: RecapCommunEcran['mails'][number]): string {
  return m.envoye ? `Un e-mail a été envoyé à ${m.nom} pour l’informer de ce compromis commun.`
    : `L’e-mail à ${m.nom} n’a pas pu être envoyé${m.motif ? ` : ${m.motif}` : ''}. Prévenez-le directement.`;
}

/** 🔴 Arno (05/11/2026) — « Compromis enregistré » : le récapitulatif, et une ligne par collaborateur prévenu ; seul sur les deux côtés : la confirmation simple. */
export function ConfirmationCompromis({ id, recap, onVoir }: { id: number; recap: RecapCommunEcran | null; onVoir: (id: number) => void }) {
  const ligne = (mot: string, valeur: string | null) => <div className="mes-parcours-info"><dt>{mot}</dt><dd>{valeur ?? '—'}</dd></div>;
  return (
    <div className="tdb-voile">
      <div className="tdb-fenetre mes-confirmation" role="dialog" aria-modal="true" aria-label="Compromis enregistré" data-confirmation-compromis={id}>
        <header className="tdb-fenetre-tete"><h3>Compromis enregistré</h3></header>
        <div className="tdb-fenetre-corps">
          {recap !== null && <dl className="mes-parcours-infos" data-recap-compromis>
            {ligne('N° de mandat', recap.mandat)}{ligne('Structure', recap.structure)}
            {ligne('Entrée du mandat (côté vendeur)', recap.cotes.entree)}{ligne('Sortie du mandat (côté acquéreur)', recap.cotes.sortie)}
            {ligne('Partage de la commission', recap.partage.length === 0 ? null : recap.partage.join(' ; '))}
          </dl>}
          {recap !== null && recap.mails.map((m) => <p key={m.compteId} className={m.envoye ? 'loc-muet' : 'loc-alerte loc-alerte--orange'} data-mail-prevenu={m.envoye ? 'envoye' : 'echec'}>{phraseMailPrevenu(m)}</p>)}
          {recap !== null && !recap.disponible && <p className="loc-alerte loc-alerte--orange" data-commun-indisponible>La mise à jour de la base (migration 459) n’est pas appliquée : aucun e-mail n’est parti.</p>}
          <div className="trx-actions"><button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => onVoir(id)} data-voir-compromis>Voir le compromis</button></div>
        </div>
      </div>
    </div>
  );
}

export function NouveauCompromis({ onFermer, onCree, modeAgence = false }: { onFermer: () => void; onCree: (id: number) => void;
  /** Le mode agence (administrateurs) : la question de la structure reste toujours posée (inchangé). */
  modeAgence?: boolean }) {
  const [etape, setEtape] = useState<Etape>('structure');
  const [societe, setSociete] = useState<Societe | null>(null);
  const [numero, setNumero] = useState('');
  const [verifie, setVerifie] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<TransactionDuMandat | null>(null);
  const [cote, setCote] = useState<Cote | null>(null);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // 🔴 LOT 6 — l'affaire à rejoindre (lue avec son n°, sans la commission des autres) et le côté libre choisi.
  const [aRejoindre, setARejoindre] = useState<VenteMonEspace | null>(null);
  const [coteRejoint, setCoteRejoint] = useState<'entree' | 'sortie' | null>(null);
  // 🔴 Arno (05/11/2026) — après la création : la fenêtre « Compromis enregistré » et son récapitulatif.
  const [confirme, setConfirme] = useState<{ id: number; recap: RecapCommunEcran | null } | null>(null);
  const recapRecu = useRef<RecapCommunEcran | null>(null);
  const envoyerCreation = async (corps: Record<string, unknown>): Promise<{ motif: string | null; data: number | null }> => {
    try {
      const r = await fetch(URL_COMPROMIS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      const d = (await r.json()) as { etat?: string; motif?: string; message?: string; data?: number; commun?: RecapCommunEcran };
      if (d.etat === 'ok') { recapRecu.current = d.commun ?? null; return { motif: null, data: d.data ?? null }; }
      return { motif: d.motif ?? d.message ?? (r.status === 403 ? 'Accès refusé : droit « Mon espace » requis (ou session expirée).' : 'Enregistrement refusé.'), data: null };
    } catch { return { motif: 'Enregistrement impossible : le serveur n’a pas répondu.', data: null }; }
  };
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await fetch(URL_REFERENCES, { cache: 'no-store' });
        const j = (await r.json()) as { etat?: string; data?: Refs };
        if (vivant && r.ok && j.etat === 'ok' && j.data !== undefined) {
          // 🔴 Arno (05/11/2026, production) — la réponse est gardée TELLE QUELLE : le formulaire dit les listes manquantes (`referencesSures`),
          //    et ce parcours ne lit que leur forme sûre (`negos`). Ici, « collègues » est attendu (« + Nouvel apporteur ») : absent, il reste marqué comme manquant (null) pour que le formulaire le dise.
          setRefs({ ...j.data, collegues: (Array.isArray(j.data.collegues) ? j.data.collegues : null) as unknown as References['collegues'] });
          // 🔴 Décision 12 — rattaché à UNE structure : la question n'est pas posée, la structure de mon profil est imposée (le serveur l'impose aussi).
          const imposee = modeAgence ? null : j.data.structureImposee ?? null;
          if (imposee !== null) { setSociete(imposee); setEtape((e) => (e === 'structure' ? 'mandat' : e)); }
        }
        else if (vivant) setMotif('Le formulaire n’a pas pu être préparé. Rechargez la page.');
      } catch { if (vivant) setMotif('Le formulaire n’a pas pu être préparé. Rechargez la page.'); }
    })();
    return () => { vivant = false; };
  }, [modeAgence]);

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

  const rejoindre = async (c: 'entree' | 'sortie'): Promise<void> => {
    if (transaction === null || verifie === null) return;
    setEnvoi(true); setMotif(null);
    try {
      const r = await fetch(`${URL_VENTE}?id=${transaction.id}&numero=${encodeURIComponent(verifie)}`, { cache: 'no-store' });
      const j = (await r.json()) as { etat?: string; motif?: string; data?: VenteMonEspace };
      if (j.etat !== 'ok' || j.data === undefined) { setMotif(j.motif ?? 'L’affaire n’a pas pu être lue.'); return; }
      setARejoindre(j.data); setCoteRejoint(c); setEtape('formulaireRejoindre');
    } catch { setMotif('L’affaire n’a pas pu être lue : le serveur n’a pas répondu.'); } finally { setEnvoi(false); }
  };

  const imposee = modeAgence ? null : refs?.structureImposee ?? null;
  const titre = <><h3 className="mes-parcours-titre">Nouveau compromis{societe !== null && etape !== 'structure' ? ` — ${LIBELLE_SOCIETE[societe]}` : ''}</h3>
    {imposee !== null && <p className="loc-muet mes-structure-imposee" data-structure-imposee={imposee}>Structure : {LIBELLE_SOCIETE[imposee]} (celle de votre profil)</p>}</>;
  const messageStructure = imposee === null ? undefined : `Structure : ${LIBELLE_SOCIETE[imposee]} (celle de votre profil).`;
  const fermer = <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-parcours-fermer>Fermer</button>;
  const ligne = (mot: string, valeur: string | null) => <div className="mes-parcours-info"><dt>{mot}</dt><dd className={valeur === null ? 'trx-a-renseigner' : undefined}>{valeur ?? 'à renseigner'}</dd></div>;

  // 🔴 LOT 6 — le formulaire EXISTANT sur l'affaire rejointe : moi au côté libre choisi, les négociateurs présents gardés ; commissions non visibles.
  // 🔴 Arno (05/11/2026, production) — les négociateurs dans leur forme sûre (liste vide si la réponse ne les porte pas).
  const negosSurs = refs === null ? [] : referencesSures(refs).references.negociateurs;
  if (etape === 'formulaireRejoindre' && refs !== null && aRejoindre !== null && coteRejoint !== null && verifie !== null) {
    const base = etatRepartitionDe(aRejoindre, negosSurs, refs.uniteCommission === true);
    return <FormulaireDossier societe={aRejoindre.societe} vente={aRejoindre} references={refs} repartitionInitiale={changerNegociateur(base, coteRejoint, refs.titulaireId, negosSurs)}
      commissionsMasquees={!refs.administrateur} message={`Vous rejoignez cette affaire à ${coteRejoint === 'entree' ? 'l’entrée du mandat (côté vendeur)' : 'la sortie du mandat (côté acquéreur)'} : complétez ce qui manque, puis enregistrez.`}
      envoyer={(c) => envoyerMonEspace({ ...c, rejoindre: { numero: verifie } })}
      onFermer={onFermer} onFait={(e) => { if (e !== undefined && e.id > 0) onCree(e.id); else onFermer(); }} />;
  }

  if (confirme !== null) return <ConfirmationCompromis id={confirme.id} recap={confirme.recap} onVoir={onCree} />;
  if (etape === 'formulaire' && refs !== null && societe !== null && verifie !== null && cote !== null) {
    const negos = negosSurs;
    const base = etatRepartitionDe(null, negos, refs.uniteCommission === true);
    const repartition = cote === 'aucun' ? base : changerNegociateur(base, cote, refs.titulaireId, negos);
    // 🔴 Arno (05/11/2026) — les obligations du créateur (le serveur les revérifie) ; enregistré : la fenêtre « Compromis enregistré ».
    // 🔴 Arno (05/11/2026) — le partage est celui que le créateur SAISIT (parts vides au départ, jamais un 50/50 implicite).
    return <FormulaireDossier societe={societe} vente={null} references={refs} repartitionInitiale={repartition} mandatFixe={verifie} envoyer={envoyerCreation} partageASaisir
      {...(messageStructure === undefined ? {} : { message: messageStructure })}
      controleCreation={({ personnes, repartition: rep, partageDefini }) => manquesCreateur({ entreeId: rep.entreeId, sortieId: rep.sortieId, partageDefini,
        personnes: personnes.map((p) => ({ role: p.role, type: p.type, nom: p.nom, prenom: p.prenom, telephone: p.telephone, email: p.email })) }, refs.titulaireId)}
      onFermer={onFermer} onFait={(e) => { if (e !== undefined && e.id > 0) setConfirme({ id: e.id, recap: recapRecu.current }); else onFermer(); }} />;
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
          {imposee === null && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setEtape('structure'); setMotif(null); }}>Changer de structure</button>}
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
      {etape === 'rejoindre' && transaction !== null && <>
        <p className="mes-parcours-question">De quel côté rejoignez-vous « {transaction.libelle} » ?</p>
        <div className="mes-parcours-choix" role="group" aria-label="Le côté que vous rejoignez">
          {(['entree', 'sortie'] as const).map((c) => {
            const tenu = c === 'entree' ? transaction.entree : transaction.sortie;
            const mot = c === 'entree' ? 'Entrée du mandat (côté vendeur)' : 'Sortie du mandat (côté acquéreur)';
            return tenu === null
              ? <button key={c} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void rejoindre(c)} disabled={envoi || refs === null} data-rejoindre-cote={c}>{mot}</button>
              : <p key={c} className="loc-muet mes-parcours-tenu" data-cote-tenu={c}>{mot} : déjà tenue par {tenu}.</p>;
          })}
        </div>
        {transaction.entree !== null && transaction.sortie !== null && <p className="loc-alerte loc-alerte--orange" role="status" data-deux-cotes-tenus>Les deux côtés sont déjà tenus.
          Un deuxième négociateur sur un même côté n’existe pas encore dans la répartition : demandez à un administrateur.</p>}
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
.mes-parcours-tenu{margin:0;flex:1 1 220px;align-self:center}
`;
