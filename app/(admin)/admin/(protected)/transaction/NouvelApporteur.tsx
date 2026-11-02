'use client';

import { createContext, useContext, useEffect, useState, type KeyboardEvent } from 'react';
import { ListeChoix, type OptionChoix } from '../location/ListeChoix';
import { posterTransactionDonnee } from './commun';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT AC (Arno, 29/10/2026) — « + AJOUTER UN NOUVEL APPORTEUR » DEPUIS LE CHOIX DE L'APPORTEUR ════════════
 * Une petite fenêtre (nom, prénom, société, téléphone, e-mail, interne / externe, collègue rattaché) qui écrit dans le MÊME annuaire des
 * apporteurs que la Location (route `apporteur-creer` → `creerApporteur` : aucune copie ; un nom déjà pris est refusé). Avant de créer, les
 * HOMONYMES de l'annuaire sont proposés (« Choisir « … » ») ; une fois créé, l'apporteur est choisi. Journalisé côté serveur.
 */
import { messageDoublon, type Doublon, type SaisieApporteur } from '../../../../lib/mon-espace/apporteurs';

/**
 * 🔴 MON ESPACE, LOT 9 (Arno, 02/11/2026) — « MON ESPACE » FOURNIT SA FAÇON DE CRÉER (décision 4 : zéro doublon). Avec ce contexte, le MÊME
 * formulaire : vérifie les doublons sur TOUT l'annuaire dès la saisie (homonyme, téléphone, e-mail : côté serveur), propose « L'utiliser » (aucune
 * création, l'apporteur est choisi tel quel), refuse de créer un doublon, et rattache un externe au titulaire par défaut. Sans ce contexte (la
 * tuile Suivi CA, la Location) : RIEN ne change.
 */
export interface FaconNouvelApporteur {
  envoyer: (apporteur: Record<string, unknown>) => Promise<{ motif: string | null; id?: number; doublons?: Doublon[] }>;
  chercher: (s: SaisieApporteur) => Promise<Doublon[]>;
  /** « L'utiliser » : garder cet apporteur dans MES apporteurs (sans changer son rattachement) ; l'écran le choisit ensuite. */
  utiliser: (id: number) => Promise<void>;
  collegueDefaut: number | null;
}
export const ContexteNouvelApporteur = createContext<FaconNouvelApporteur | null>(null);

// Le contrôle des homonymes et le type de l'annuaire : `app/lib/transaction/homonymesApporteur.ts` (une seule source), réexportés ici.
export { homonymes, type ApporteurAnnuaire } from '../../../../lib/transaction/homonymesApporteur';
import { homonymes, type ApporteurAnnuaire } from '../../../../lib/transaction/homonymesApporteur';

export function NouvelApporteur({ texte, annuaire, collegues, onCree, onChoisir, onFermer }: {
  /** Le texte cherché (pré-remplit le nom). */
  texte: string;
  annuaire: readonly ApporteurAnnuaire[];
  /** Les comptes de l'interface (collègue de rattachement d'un externe, compte d'un interne). */
  collegues: readonly OptionChoix[];
  onCree: (a: ApporteurAnnuaire) => void;
  onChoisir: (id: number) => void;
  onFermer: () => void;
}) {
  const facon = useContext(ContexteNouvelApporteur);
  const [f, setF] = useState({ nom: texte, prenom: '', societe: '', telephone: '', email: '', interne: false, collegueId: facon?.collegueDefaut == null ? '' : String(facon.collegueDefaut), compteId: '' });
  // 🔴 LOT 9 — « Mon espace » : les doublons de TOUT l'annuaire, cherchés dès la saisie (le serveur) ; sans la façon de « Mon espace » : aucun.
  const [distants, setDistants] = useState<Doublon[]>([]);
  useEffect(() => {
    if (facon === null || f.interne) return;
    let vivant = true;
    const t = setTimeout(() => { void facon.chercher({ nom: f.nom, prenom: f.prenom, telephone: f.telephone, email: f.email }).then((d) => { if (vivant) setDistants(d); }); }, 300);
    return () => { vivant = false; clearTimeout(t); };
  }, [facon, f.interne, f.nom, f.prenom, f.telephone, f.email]);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Avec « Mon espace », un homonyme déjà proposé par le serveur (« L'utiliser ») n'est pas proposé deux fois.
  const memes = homonymes(f.prenom, f.nom, annuaire).filter((a) => facon === null || !distants.some((d) => d.id === a.id));
  const nomComplet = `${f.prenom} ${f.nom}`.replace(/\s+/g, ' ').trim();
  // Entrée dans un champ : jamais l'envoi du formulaire du compromis autour.
  const pasEntree = (e: KeyboardEvent<HTMLInputElement>): void => { if (e.key === 'Enter') e.preventDefault(); };
  const creer = async (): Promise<void> => {
    setMotif(null);
    if (!f.interne && nomComplet === '') { setMotif('Le nom de l’apporteur est obligatoire.'); return; }
    setEnvoi(true);
    const apporteur = {
      nom: nomComplet, type: f.interne ? 'collaborateur' : 'partenaire', taux: '', interne: f.interne,
      ...(f.interne ? { compteId: f.compteId === '' ? null : Number(f.compteId) } : { collegueId: f.collegueId === '' ? null : Number(f.collegueId) }),
      societe: f.societe, telephone: f.telephone, email: f.email };
    // 🔴 LOT 9 — « Mon espace » : sa route (jamais un doublon : 409 avec les fiches existantes) ; sinon la tuile, inchangée.
    const r = facon !== null
      ? await facon.envoyer(apporteur).then((x) => { if (x.doublons !== undefined) setDistants(x.doublons); return { motif: x.motif, data: x.id === undefined ? null : { id: x.id } }; })
      : await posterTransactionDonnee<{ id: number }>({ action: 'apporteur-creer', apporteur });
    setEnvoi(false);
    if (r.motif !== null || r.data == null) { setMotif(r.motif ?? 'Création refusée.'); return; }
    const libelle = f.interne ? collegues.find((c) => String(c.id) === f.compteId)?.libelle ?? nomComplet : nomComplet;
    onCree({ id: r.data.id, nom: libelle, libelle, recherche: [libelle, f.societe, f.telephone, f.email].filter((x) => x !== '').join(' ; ') });
  };
  const champ = (mot: string, cle: 'nom' | 'prenom' | 'societe' | 'telephone' | 'email', mode?: 'tel' | 'email') => (
    <label>{mot}<input value={f[cle]} inputMode={mode} onKeyDown={pasEntree} onChange={(e) => setF({ ...f, [cle]: e.target.value })} data-nouvel-apporteur-champ={cle} /></label>
  );
  return (
    <div className="trx-nouvel-apporteur" role="group" aria-label="Nouvel apporteur" data-nouvel-apporteur-transaction>
      <p className="loc-muet trx-nouvel-apporteur-intro">Nouvel apporteur : il rejoint l’annuaire des apporteurs de la Location (le même) ; son taux, 0 % à partir d’aujourd’hui, se règle ensuite dans l’annuaire.</p>
      <div className="trx-unites" role="group" aria-label="Interne ou externe">
        <button type="button" className="trx-unite" aria-pressed={!f.interne} onClick={() => setF({ ...f, interne: false })} data-nouvel-apporteur-type="externe">Externe</button>
        <button type="button" className="trx-unite" aria-pressed={f.interne} onClick={() => setF({ ...f, interne: true })} data-nouvel-apporteur-type="interne">Interne</button>
      </div>
      <div className="trx-form">
        {f.interne ? (
          <label className="trx-plein">Compte de l’apporteur interne (son nom est celui du compte)
            <ListeChoix options={collegues} valeur={f.compteId} libelle="Compte de l’apporteur interne" onChange={(x) => setF({ ...f, compteId: x })}
              donnees={{ 'data-nouvel-apporteur-compte': '' }} recherche={{ placeholder: 'Rechercher un compte' }} /></label>
        ) : <>
          {champ('Nom', 'nom')}
          {champ('Prénom', 'prenom')}
          {champ('Société (facultatif)', 'societe')}
          {champ('Téléphone (facultatif)', 'telephone', 'tel')}
          {champ('E-mail (facultatif)', 'email', 'email')}
          <label>Collègue rattaché
            <ListeChoix options={collegues} valeur={f.collegueId} libelle="Collègue rattaché" onChange={(x) => setF({ ...f, collegueId: x })}
              donnees={{ 'data-nouvel-apporteur-collegue': '' }} recherche={{ placeholder: 'Rechercher un collègue' }} /></label>
        </>}
      </div>
      {!f.interne && memes.length > 0 && (
        <div className="trx-homonymes" role="status" data-homonymes>
          <span className="trx-alerte">Déjà dans l’annuaire : {memes.length === 1 ? 'un apporteur porte ce nom' : `${memes.length} apporteurs portent ce nom`}.</span>
          {memes.map((a) => <button key={a.id} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onChoisir(a.id)} data-choisir-homonyme={a.id}>
            Choisir « {a.libelle ?? a.nom} »</button>)}
        </div>
      )}
      {/* 🔴 LOT 9 — « Mon espace » : « Cet apporteur existe déjà, rattaché à … » ; « L'utiliser » le choisit tel quel (aucune création). */}
      {facon !== null && !f.interne && distants.length > 0 && (
        <div className="trx-homonymes" role="status" data-doublons-annuaire>
          {distants.map((d) => <p key={d.id} className="trx-alerte" data-doublon={d.id}>{messageDoublon(d)}
            {' '}<button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void facon.utiliser(d.id).then(() => onCree({ id: d.id, nom: d.libelle, libelle: d.libelle }))}
              data-utiliser-apporteur={d.id}>L’utiliser</button></p>)}
        </div>
      )}
      {motif !== null && <p className="trx-erreur" role="alert" data-motif-nouvel-apporteur>{motif}</p>}
      <div className="trx-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || (facon !== null && !f.interne && distants.length > 0)} onClick={() => void creer()} data-creer-apporteur-transaction>
          {envoi ? 'Enregistrement…' : memes.length > 0 && !f.interne && facon === null ? 'Créer quand même' : 'Ajouter l’apporteur'}</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onFermer}>Annuler</button>
      </div>
    </div>
  );
}
