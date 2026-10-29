'use client';

import { useState, type KeyboardEvent } from 'react';
import { ListeChoix, type OptionChoix } from '../location/ListeChoix';
import { posterTransactionDonnee } from './commun';

/**
 * ══ 🔴 TUILE « TRANSACTION », LOT AC (Arno, 29/10/2026) — « + AJOUTER UN NOUVEL APPORTEUR » DEPUIS LE CHOIX DE L'APPORTEUR ════════════
 * Une petite fenêtre (nom, prénom, société, téléphone, e-mail, interne / externe, collègue rattaché) qui écrit dans le MÊME annuaire des
 * apporteurs que la Location (route `apporteur-creer` → `creerApporteur` : aucune copie ; un nom déjà pris est refusé). Avant de créer, les
 * HOMONYMES de l'annuaire sont proposés (« Choisir « … » ») ; une fois créé, l'apporteur est choisi. Journalisé côté serveur.
 */
export interface ApporteurAnnuaire { id: number; nom: string; libelle?: string; recherche?: string }

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.+]+/g, ' ').trim();

/**
 * Les apporteurs de l'annuaire qui portent déjà ce nom (prénom et nom, dans un ordre ou l'autre, ou tous les mots tapés dans sa fiche :
 * nom, prénom, société). Rien de tapé : aucun. PUR.
 */
export function homonymes(prenom: string, nom: string, annuaire: readonly ApporteurAnnuaire[]): ApporteurAnnuaire[] {
  const mots = norm(`${prenom} ${nom}`).split(' ').filter((m) => m !== '');
  if (mots.length === 0) return [];
  return annuaire.filter((a) => {
    const fiche = ` ${norm([a.nom, a.libelle ?? '', a.recherche ?? ''].join(' '))} `;
    return mots.every((m) => fiche.includes(` ${m} `));
  });
}

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
  const [f, setF] = useState({ nom: texte, prenom: '', societe: '', telephone: '', email: '', interne: false, collegueId: '', compteId: '' });
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const memes = homonymes(f.prenom, f.nom, annuaire);
  const nomComplet = `${f.prenom} ${f.nom}`.replace(/\s+/g, ' ').trim();
  // Entrée dans un champ : jamais l'envoi du formulaire du compromis autour.
  const pasEntree = (e: KeyboardEvent<HTMLInputElement>): void => { if (e.key === 'Enter') e.preventDefault(); };
  const creer = async (): Promise<void> => {
    setMotif(null);
    if (!f.interne && nomComplet === '') { setMotif('Le nom de l’apporteur est obligatoire.'); return; }
    setEnvoi(true);
    const r = await posterTransactionDonnee<{ id: number }>({ action: 'apporteur-creer', apporteur: {
      nom: nomComplet, type: f.interne ? 'collaborateur' : 'partenaire', taux: '', interne: f.interne,
      ...(f.interne ? { compteId: f.compteId === '' ? null : Number(f.compteId) } : { collegueId: f.collegueId === '' ? null : Number(f.collegueId) }),
      societe: f.societe, telephone: f.telephone, email: f.email } });
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
      {motif !== null && <p className="trx-erreur" role="alert" data-motif-nouvel-apporteur>{motif}</p>}
      <div className="trx-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void creer()} data-creer-apporteur-transaction>
          {envoi ? 'Enregistrement…' : memes.length > 0 && !f.interne ? 'Créer quand même' : 'Ajouter l’apporteur'}</button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoi} onClick={onFermer}>Annuler</button>
      </div>
    </div>
  );
}
