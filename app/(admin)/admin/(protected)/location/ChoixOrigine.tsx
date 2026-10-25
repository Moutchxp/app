'use client';

import { useState, type ReactNode } from 'react';
import { ListeChoix } from './ListeChoix';
import { ModaleAnnuaireApporteurs } from './ModaleAnnuaireApporteurs';
import { posterSuivi } from './suiviApi';
import {
  aRattacher, aujourdhuiParis, badgeApporteur, estInterne, LIBELLE_TYPE_APPORTEUR, libelleApporteur, PRECISION_ORIGINE_MAX, trierApporteurs,
  TYPES_APPORTEUR, type Apporteur, type TypeApporteur,
} from '../../../../lib/location/suivi/suivi';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — LE CHOIX DE L'ORIGINE DU CONTACT, extrait du bloc 4 (BlocSuiviCommercial) ══════════════════════════════
 * Les mêmes champs, les mêmes règles, partout : l'origine (liste maison), « Personnalisé » et son texte, « Collègue directement » et le
 * collègue, « Apporteur d'affaires » et l'apporteur de l'annuaire (internes puis externes ; « à rattacher » montré, non choisissable),
 * « Ouvrir l'annuaire », « + Nouvel apporteur… » (création rapide). Rendu en DEUX morceaux : `champs` (dans la grille de l'hôte) et
 * `apres` (la carte de création et l'annuaire, sous la grille) — le bloc 4 garde exactement sa mise en page.
 */
export interface ParametresOrigine {
  apporteurs: Apporteur[];
  collegues: { id: number; libelle: string; actif?: boolean }[];
  moi: number | null;
  annuaire: boolean;
}
export interface ValeurOrigine { origine: string; precision: string; collegueId: number | null; apporteurId: number | null }

export interface ConfigOrigine {
  valeur: ValeurOrigine;
  lu: ParametresOrigine;
  rafraichir: () => void;
  /** La liste proposée (ses mentions, ses choix bloqués) et le libellé du champ. */
  options: { id: string; libelle: string; bloque?: boolean; mention?: string }[];
  libelle: string;
  desactive?: boolean;
  /** Sous la liste des origines (« Imposée par Relocation », « reprise du propriétaire … »). */
  sousOrigine?: ReactNode;
  /** Sous la liste des apporteurs (collègue de rattachement, conditions). */
  sousApporteur?: ReactNode;
  /** Montrer le champ apporteur (le bloc 4 sans la 407 le montre toujours). */
  avecApporteur?: boolean;
  onOrigine: (o: string) => void;
  onPrecision: (t: string) => void;
  onCollegue: (id: number | null) => void;
  /** Un apporteur choisi dans la liste ; `depuisAnnuaire` : choisi dans l'annuaire ou créé (l'origine devient « Apporteur »). */
  onApporteur: (id: number | null, depuisAnnuaire: boolean) => void;
}

const libelleChamp = (mot: ReactNode, oblig = false) => <span className="loc-suivi-libelle">{mot}{oblig && <> <span className="loc-oblig">*</span></>}</span>;

export function useChoixOrigine(c: ConfigOrigine): { champs: ReactNode; apres: ReactNode } {
  const { valeur: v, lu } = c;
  const [nouveau, setNouveau] = useState<{ nom: string; type: TypeApporteur; taux: string; collegueId: number | null; societe: string; telephone: string; email: string } | null>(null);
  const [motifNouveau, setMotifNouveau] = useState<string | null>(null);
  const [envoiNouveau, setEnvoiNouveau] = useState(false);
  const [annuaireOuvert, setAnnuaireOuvert] = useState(false);
  const annuaire = lu.annuaire;
  const avecApporteur = c.avecApporteur ?? (!annuaire || v.origine === 'apporteur');
  const actifs = lu.apporteurs.filter((a) => !a.archive);
  const creerApporteur = async (): Promise<void> => {
    if (nouveau === null) return;
    setEnvoiNouveau(true); setMotifNouveau(null);
    const r = await posterSuivi({ action: 'creer-apporteur', apporteur: { ...nouveau, depuis: aujourdhuiParis() } });
    setEnvoiNouveau(false);
    if (r.motif !== null) { setMotifNouveau(r.motif); return; }
    const id = (r.data as { id?: number } | undefined)?.id ?? null;
    setNouveau(null);
    c.rafraichir();
    if (id !== null) c.onApporteur(id, true);
  };
  const nouvelApporteur = () => setNouveau({ nom: '', type: 'partenaire', taux: '', collegueId: lu.moi ?? null, societe: '', telephone: '', email: '' });

  const champs = (
    <>
      {annuaire && (
        <label className="loc-champ">{libelleChamp(c.libelle, true)}
          <ListeChoix options={c.options} valeur={v.origine} libelle={c.libelle} donnees={{ 'data-origine-contact': '' }} desactive={c.desactive}
            onChange={(x) => c.onOrigine(x)} />
          {c.sousOrigine}</label>
      )}
      {annuaire && v.origine === 'personnalise' && (
        <label className="loc-champ">{libelleChamp('Origine personnalisée', true)}
          <input value={v.precision} maxLength={PRECISION_ORIGINE_MAX} placeholder="ex. Salon de l’immobilier" required
            onChange={(e) => c.onPrecision(e.target.value)} data-origine-precision />
          <small className="loc-muet">{PRECISION_ORIGINE_MAX} caractères au plus.</small></label>
      )}
      {annuaire && v.origine === 'collegue' && (
        <label className="loc-champ">{libelleChamp('Collègue', true)}
          <ListeChoix options={lu.collegues} valeur={v.collegueId === null ? '' : String(v.collegueId)} libelle="Collègue"
            onChange={(x) => c.onCollegue(x === '' ? null : Number(x))} donnees={{ 'data-collegue': '' }} /></label>
      )}
      {avecApporteur && (
        <label className="loc-champ">
          <span className="loc-suivi-libelle loc-suivi-libelle--action">
            <span>Apporteur d’affaires{annuaire && <> <span className="loc-oblig">*</span></>}</span>
            <button type="button" className="loc-suivi-annuaire" onClick={(e) => { e.preventDefault(); setAnnuaireOuvert(true); }} data-ouvrir-annuaire>Ouvrir l’annuaire</button>
          </span>
          {/* Un apporteur « à rattacher » reste MONTRÉ dans la liste, avec sa mention, sans être choisissable. */}
          <ListeChoix valeur={v.apporteurId === null ? '' : String(v.apporteurId)} vide={annuaire ? '— choisir dans l’annuaire —' : '— aucun —'}
            options={[...[...trierApporteurs(actifs.filter(estInterne)), ...trierApporteurs(actifs.filter((a) => !estInterne(a)))].map((a) => {
              const bloque = annuaire && aRattacher(a);
              const interne = estInterne(a);
              return { id: a.id, libelle: interne ? `${libelleApporteur(a)} (${badgeApporteur(a)})` : `${libelleApporteur(a)} (${LIBELLE_TYPE_APPORTEUR[a.type]})`, bloque,
                mention: bloque ? ' — à rattacher' : undefined, ...(annuaire ? { groupe: interne ? 'Internes' : 'Partenaires externes' } : {}) };
            }), { id: '+', libelle: '+ Nouvel apporteur…' }]}
            libelle="Apporteur d’affaires" donnees={{ 'data-apporteur': '' }}
            onChange={(x) => { if (x === '+') { nouvelApporteur(); return; } c.onApporteur(x === '' ? null : Number(x), false); }} />
          {c.sousApporteur}</label>
      )}
    </>
  );

  const apres = (
    <>
      {annuaireOuvert && (
        <ModaleAnnuaireApporteurs
          onFermer={() => { setAnnuaireOuvert(false); c.rafraichir(); }}
          onChoisir={(a) => { setAnnuaireOuvert(false); c.rafraichir(); c.onApporteur(a.id, true); }} />
      )}
      {nouveau !== null && (
        <div className="loc-suivi-nouveau" data-nouvel-apporteur>
          <p className="loc-muet" style={{ margin: 0 }}>Nouvel apporteur : il rejoint le référentiel (roue « Paramètres Location ») ; son taux vaut à partir d’aujourd’hui.</p>
          <div className="loc-grille">
            <label className="loc-champ">Nom<input value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} data-nouvel-apporteur-nom /></label>
            <label className="loc-champ">Type
              <ListeChoix options={TYPES_APPORTEUR.map((t) => ({ id: t, libelle: LIBELLE_TYPE_APPORTEUR[t] }))} valeur={nouveau.type} vide={null} libelle="Type d’apporteur"
                onChange={(x) => setNouveau({ ...nouveau, type: x as TypeApporteur })} donnees={{ 'data-nouvel-apporteur-type': '' }} /></label>
            <label className="loc-champ">Taux de commission (%)<input inputMode="decimal" value={nouveau.taux} placeholder="ex. 10" onChange={(e) => setNouveau({ ...nouveau, taux: e.target.value })} />
              <small className="loc-muet" data-nouvel-apporteur-gestion>One shot · gestion : 0 % (modifiable ensuite dans l’annuaire, panneau « Taux »)</small></label>
            {annuaire && (
              <>
                <label className="loc-champ"><span>Collègue de rattachement <span className="loc-oblig">*</span></span>
                  <ListeChoix options={lu.collegues} valeur={nouveau.collegueId === null || nouveau.collegueId === undefined ? '' : String(nouveau.collegueId)} libelle="Collègue de rattachement"
                    onChange={(x) => setNouveau({ ...nouveau, collegueId: x === '' ? null : Number(x) })} donnees={{ 'data-nouvel-apporteur-collegue': '' }} /></label>
                <label className="loc-champ">Société (facultatif)<input value={nouveau.societe} onChange={(e) => setNouveau({ ...nouveau, societe: e.target.value })} /></label>
                <label className="loc-champ">Téléphone (facultatif)<input inputMode="tel" value={nouveau.telephone} onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })} /></label>
                <label className="loc-champ">E-mail (facultatif)<input inputMode="email" value={nouveau.email} onChange={(e) => setNouveau({ ...nouveau, email: e.target.value })} /></label>
              </>
            )}
          </div>
          {motifNouveau !== null && <p className="loc-manque" role="alert">{motifNouveau}</p>}
          <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setNouveau(null); setMotifNouveau(null); }} disabled={envoiNouveau}>Annuler</button>
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void creerApporteur(); }} disabled={envoiNouveau} data-creer-apporteur>
              {envoiNouveau ? 'Enregistrement…' : 'Ajouter l’apporteur'}</button>
          </div>
        </div>
      )}
    </>
  );
  return { champs, apres };
}
