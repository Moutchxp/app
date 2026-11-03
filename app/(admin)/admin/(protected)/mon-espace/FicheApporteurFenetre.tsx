'use client';

import { useContext, useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ListeChoix } from '../location/ListeChoix';
import { CSS_PARAMETRES } from '../location/ParametresLocation';
import { CSS_ONGLETS_SUIVI } from '../location/OngletsSuivi';
import { ChampDuree, ChoixMode, dureeEnvoyee } from '../location/ReglageApporteur';
import { ChampNombre } from '../location/ChampNombre';
import { ListeAutres, PanneauRattachement, PanneauTaux, PasserEnInterne } from '../location/PanneauxApporteur';
import { ContexteNouvelApporteur } from '../transaction/NouvelApporteur';
import { EnteteAide } from '../transaction/commun';
import { homonymes } from '../../../../lib/transaction/homonymesApporteur';
import {
  type Apporteur, aujourdhuiParis, baremeADate, collegueADate, estInterne, LIBELLE_TYPE_APPORTEUR, libelleApporteur, libelleRegleApporteur, libelleRemuneration,
  type ModeApporteur, remunerationADate, tauxVide, TYPES_APPORTEUR,
} from '../../../../lib/location/suivi/suivi';
import { CIVILITES, changementsFiche, ficheDe, type FicheApporteur, verifierFiche } from '../../../../lib/location/suivi/ficheApporteur';
import { messageDoublon, type Doublon, type MesApporteursLus } from '../../../../lib/mon-espace/apporteurs';

/**
 * ══ 🔴 D26 (Arno, 03/11/2026) — LA FICHE D'UN APPORTEUR DANS « MES APPORTEURS » : UNE FENÊTRE, LA MÊME POUR CRÉER ET POUR MODIFIER ══════════════════
 * Le formulaire d'avant (`PanneauFiche` posé dans la carte) s'affichait cassé ici : ses champs (`.plo-champ`, `.plo-grille`…) sont stylés par la
 * feuille de la Location (`CSS_PARAMETRES`, `CSS_ONGLETS_SUIVI`), jamais chargée dans « Mon espace » — libellés collés à leur valeur, aucune case
 * visible. La fenêtre charge ces feuilles (la cause, pas un rapiéçage), et range la fiche en sections, chaque libellé AU-DESSUS de son champ :
 *   1. Identité : Externe / Interne · Civilité · Nom · Prénom · Société · Catégorie (partenaire, agence…) ;
 *   2. Contact : téléphone et e-mail principaux, autres téléphones et e-mails (« + Ajouter » sur sa ligne), adresse ;
 *   3. Rattachement et rémunération : le collègue rattaché (création : moi par défaut) ; en modification, s'il change : la date et la question
 *      « touche-t-il des honoraires ? » (obligatoire, la règle de la Location) ; le taux et la rémunération en vigueur, et les panneaux de la
 *      Location pour les modifier ;
 *   4. Notes.
 * Une seule source : l'annuaire de la Location (les mêmes fonctions serveur, journal, garde de version 409). DROITS INCHANGÉS : l'identité, son
 * collègue / l'apporteur interne lui-même / un administrateur ; le collègue rattaché, la rémunération et le taux : un administrateur (comme dans la
 * Location) ; à la création, chacun choisit le collègue (comme avant). Un INTERNE : son identité est celle de son compte (lecture seule, inchangé).
 */
type Envoi = (corps: Record<string, unknown>) => Promise<{ motif: string | null; etat?: string; data?: { id?: number; avertissement?: string } | null; doublons?: Doublon[] }>;

const VIDE: FicheApporteur = { civilite: '', nomFamille: '', prenom: '', societe: '', type: 'partenaire', telephone: '', telephonesAutres: [], email: '', emailsAutres: [], adresse: '', notes: '' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

interface SaisieRattachement { collegueId: string; depuis: string; toujours: boolean; reponse: 'oui' | 'non' | null; mode: ModeApporteur; taux: string; tauxGestion: string; indeterminee: boolean; duree: string }

export function FicheApporteurFenetre({ a, lu, texte = '', envoyer, onFermer, onEnregistre, onRelire, onChoisir }: {
  /** L'apporteur à modifier ; absent : un nouvel apporteur. */
  a?: Apporteur;
  lu: MesApporteursLus;
  /** Création : le texte cherché (pré-remplit le nom). */
  texte?: string;
  envoyer: Envoi;
  onFermer: () => void;
  /** Enregistré : la fenêtre se ferme, l'onglet relit l'annuaire et montre le message. */
  onEnregistre: (message: string) => void;
  /** Un geste des panneaux de la Location (taux, rémunération) a réussi : l'annuaire se relit, la fenêtre reste ouverte. */
  onRelire?: () => void;
  /** Création : un homonyme de la liste choisi tel quel. */
  onChoisir?: (id: number) => void;
}) {
  const titreId = useId();
  const jour = aujourdhuiParis();
  const facon = useContext(ContexteNouvelApporteur);
  const creation = a === undefined;
  const admin = lu.administrateur;
  const actuel = a === undefined ? null : collegueADate(a, jour);
  const depart = a === undefined ? { ...VIDE, nomFamille: texte } : ficheDe(a);
  const [f, setF] = useState<FicheApporteur>(depart);
  const [interne, setInterne] = useState(false);
  const [compteId, setCompteId] = useState('');
  const collegueDepart = creation ? String(facon?.collegueDefaut ?? lu.titulaireId) : actuel === null ? '' : String(actuel.collegueId);
  const [r, setR] = useState<SaisieRattachement>({ collegueId: collegueDepart, depuis: jour, toujours: a !== undefined && (a.collegues ?? []).length === 0 && lu.toujours === true,
    reponse: null, mode: 'one_shot', taux: '', tauxGestion: '', indeterminee: true, duree: '' });
  const [panneau, setPanneau] = useState<'taux' | 'remuneration' | null>(null);
  const [recap, setRecap] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [conflit, setConflit] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [messagePanneau, setMessagePanneau] = useState<string | null>(null);
  const [distants, setDistants] = useState<Doublon[]>([]);
  useEffect(() => {
    if (!creation || facon === null || interne) return;
    let vivant = true;
    const t = setTimeout(() => { void facon.chercher({ nom: f.nomFamille, prenom: f.prenom, telephone: f.telephone, email: f.email }).then((d) => { if (vivant) setDistants(d); }); }, 300);
    return () => { vivant = false; clearTimeout(t); };
  }, [creation, facon, interne, f.nomFamille, f.prenom, f.telephone, f.email]);
  useEffect(() => {
    const echap = (e: globalThis.KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onFermer]);

  const lecture = a !== undefined && estInterne(a);
  const changements = a === undefined ? [] : changementsFiche(ficheDe(a), f);
  const rattachementChange = !creation && !lecture && admin && r.collegueId !== collegueDepart;
  const nbChangements = changements.length + (rattachementChange ? 1 : 0);
  const annuaire = lu.apporteurs.map((x) => ({ id: x.id, nom: x.fiche.nom, libelle: x.libelle, recherche: x.recherche }));
  const memes = creation && !interne ? homonymes(f.prenom, f.nomFamille, annuaire).filter((x) => !distants.some((d) => d.id === x.id)) : [];
  const nomCollegue = lu.collegues.find((c) => String(c.id) === r.collegueId)?.libelle ?? 'Le collègue choisi';
  const tauxSaisi = r.reponse !== 'oui' || (!tauxVide(r.taux) && !tauxVide(r.tauxGestion));
  const rattachementPret = !rattachementChange || (r.collegueId !== '' && r.reponse !== null && tauxSaisi && (r.toujours || ISO.test(r.depuis))
    && (r.reponse === 'non' || lu.avec419 === true));
  const pret = creation ? (interne ? compteId !== '' : true) && distants.length === 0 : nbChangements > 0 && rattachementPret;
  const poser = (x: Partial<FicheApporteur>): void => { setF({ ...f, ...x }); setRecap(false); setMotif(null); };
  const poserR = (x: Partial<SaisieRattachement>): void => { setR({ ...r, ...x }); setRecap(false); setMotif(null); };
  const pasEntree = (e: KeyboardEvent<HTMLInputElement>): void => { if (e.key === 'Enter') e.preventDefault(); };

  const demander = (): void => {
    if (!creation && a !== undefined && a.collegues !== undefined && a.collegues.length === 0 && !rattachementChange && !estInterne(a)) {
      setMotif('Partenaire externe « à rattacher » : choisissez d’abord son collègue rattaché (section « Rattachement et rémunération »), puis enregistrez.'); return;
    }
    if (!interne) {
      const v = verifierFiche(f);
      if (!v.ok) { setMotif(v.motif); return; }
      if (creation && `${f.prenom} ${f.nomFamille}`.trim() === '' && f.societe.trim() === '') { setMotif('Le nom de l’apporteur est obligatoire.'); return; }
    }
    if (rattachementChange && !rattachementPret) { setMotif(r.reponse === null ? 'Répondez à la question sur les honoraires du collègue.' : 'Le rattachement est incomplet.'); return; }
    setMotif(null);
    if (creation) { void creer(); return; }
    setRecap(true);
  };
  const creer = async (): Promise<void> => {
    setEnvoi(true);
    const nom = `${f.prenom} ${f.nomFamille}`.replace(/\s+/g, ' ').trim() || f.societe.trim();
    const apporteur = interne
      ? { nom: '', type: 'collaborateur', taux: '', interne: true, compteId: Number(compteId) }
      : { nom, type: f.type, taux: '', interne: false, collegueId: r.collegueId === '' ? null : Number(r.collegueId), societe: f.societe, telephone: f.telephone, email: f.email, fiche: f };
    const x = await envoyer({ action: 'creer', apporteur });
    setEnvoi(false);
    if (x.doublons !== undefined) setDistants(x.doublons);
    if (x.motif !== null) { setMotif(x.motif); return; }
    const libelle = interne ? lu.collegues.find((c) => String(c.id) === compteId)?.libelle ?? '' : libelleApporteur({ nom, type: f.type, nomFamille: f.nomFamille || null, prenom: f.prenom || null });
    onEnregistre(x.data?.avertissement ?? `« ${libelle} » est dans votre liste.`);
  };
  const confirmer = async (): Promise<void> => {
    if (a === undefined) return;
    setEnvoi(true); setConflit(false);
    if (rattachementChange) {
      const x = await envoyer({ action: 'rattachement', apporteurId: a.id, collegueAvant: actuel?.collegueId ?? null, rattachement: {
        sorte: 'rattacher', collegueId: Number(r.collegueId), ...(r.toujours ? { depuisToujours: true } : { depuis: r.depuis }),
        remuneration: { remunere: r.reponse === 'oui', mode: r.mode, taux: r.taux, tauxGestion: r.tauxGestion, dureeAnnees: dureeEnvoyee(r) } } });
      if (x.motif !== null) { setEnvoi(false); setRecap(false); setMotif(x.motif); setConflit(x.etat === 'conflit'); return; }
    }
    if (changements.length > 0) {
      const x = await envoyer({ action: 'fiche', apporteurId: a.id, fiche: f, version: a.version ?? null });
      if (x.motif !== null) {
        setEnvoi(false); setRecap(false); setConflit(x.etat === 'conflit');
        setMotif(rattachementChange ? `Rattachement enregistré ; la fiche, non : ${x.motif}` : x.motif); return;
      }
    }
    setEnvoi(false);
    onEnregistre('Fiche enregistrée');
  };
  // Les panneaux de la Location (taux, rémunération du collègue) : leur geste passe par la route de « Mon espace » (administrateurs).
  const faire = async (corps: Record<string, unknown>, reussite: string): Promise<boolean> => {
    setEnvoi(true);
    const x = await envoyer(corps);
    setEnvoi(false);
    setMessagePanneau(x.motif ?? reussite);
    if (x.motif === null) onRelire?.();
    return x.motif === null;
  };

  const v = a === undefined ? null : baremeADate(a, jour);
  const remu = a === undefined ? null : remunerationADate(a, jour);
  const titre = creation ? 'Nouvel apporteur' : `Fiche de ${a === undefined ? '' : libelleApporteur(a)}`;
  const champTexte = (mot: string, cle: 'nomFamille' | 'prenom' | 'societe' | 'telephone' | 'email' | 'adresse', o: { mode?: 'tel' | 'email'; large?: boolean } = {}) => (
    <label className={`plo-champ${o.large ? ' plo-champ--large' : ''}`}><span>{mot}</span>
      <input value={f[cle]} inputMode={o.mode} onKeyDown={pasEntree} onChange={(e) => poser({ [cle]: e.target.value })} data-fiche-champ={cle} /></label>
  );

  return (
    <div className="plo-voile" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }} data-fenetre-fiche-apporteur={a?.id ?? 'nouveau'}>
      <style>{CSS_PARAMETRES}{CSS_ONGLETS_SUIVI}{CSS_FENETRE_FICHE}</style>
      <div className="plo-fenetre mfa-fenetre" role="dialog" aria-modal="true" aria-labelledby={titreId}>
        <div className="plo-tete">
          <h2 id={titreId}>{titre}</h2>
          <button type="button" className="plo-x" aria-label="Fermer" onClick={onFermer} data-fermer-fiche>×</button>
        </div>
        <div className="plo-corps">
          {/* 1. IDENTITÉ */}
          <section className="mfa-section" data-section-fiche="identite">
            <h3 className="mfa-titre">Identité</h3>
            {lecture && a !== undefined ? (
              <>
                <dl className="plo-lecture">
                  <div><dt>Type</dt><dd>Interne — {LIBELLE_TYPE_APPORTEUR[a.type]}</dd></div>
                  <div><dt>Nom</dt><dd>{a.compteLibelle ?? a.nom}</dd></div>
                  <div><dt>Identifiant (e-mail)</dt><dd>{a.compteIdentifiant ?? '—'}</dd></div>
                </dl>
                <p className="plo-muet plo-petit-texte" data-fiche-interne-mention>Identité lue depuis son compte de l’interface — modifiable dans la gestion des comptes.</p>
              </>
            ) : (
              <div className="plo-grille">
                <div className="plo-champ plo-champ--large"><span>Type</span>
                  {creation ? (
                    <span className="plo-modes" role="group" aria-label="Externe ou interne">
                      <button type="button" className="plo-mode" aria-pressed={!interne} onClick={() => { setInterne(false); setMotif(null); }} data-fiche-externe-interne="externe">Externe</button>
                      <button type="button" className="plo-mode" aria-pressed={interne} onClick={() => { setInterne(true); setMotif(null); }} data-fiche-externe-interne="interne">Interne</button>
                    </span>
                  ) : (
                    <span className="mfa-sorte">
                      <span className="plo-muet" data-fiche-sorte>Externe (sans accès à l’interface)</span>
                      {admin && a !== undefined && <PasserEnInterne a={a} comptes={lu.collegues} apporteurs={lu.apporteurs.map((x) => x.fiche)} possible={lu.passage === true}
                        onFait={(m) => onEnregistre(m)} />}
                    </span>
                  )}
                </div>
                {interne ? (
                  <label className="plo-champ plo-champ--large"><span>Compte de l’apporteur interne (son nom est celui du compte)</span>
                    <ListeChoix options={lu.collegues} valeur={compteId} libelle="Compte de l’apporteur interne" onChange={(x) => { setCompteId(x); setMotif(null); }}
                      donnees={{ 'data-fiche-compte-interne': '' }} recherche={{ placeholder: 'Rechercher un compte' }} /></label>
                ) : (
                  <>
                    {lu.identite && (
                      <label className="plo-champ"><span>Civilité</span>
                        <ListeChoix options={CIVILITES.map((c) => ({ id: c, libelle: c }))} valeur={f.civilite} vide="— aucune —" libelle="Civilité"
                          onChange={(x) => poser({ civilite: x })} donnees={{ 'data-fiche-champ': 'civilite' }} /></label>
                    )}
                    <label className="plo-champ"><span>Catégorie</span>
                      <ListeChoix options={TYPES_APPORTEUR.map((t) => ({ id: t, libelle: LIBELLE_TYPE_APPORTEUR[t] }))} valeur={f.type} vide={null} libelle="Catégorie"
                        onChange={(x) => poser({ type: x as FicheApporteur['type'] })} donnees={{ 'data-fiche-champ': 'type' }} /></label>
                    {champTexte('Nom', 'nomFamille')}
                    {champTexte('Prénom', 'prenom')}
                    <p className="plo-muet mfa-aide plo-champ--large" data-aide-nom-prenom>
                      <EnteteAide libelle="Affiché « NOM Prénom »." cible={`${titreId}-aide-nom`} etiquette="Nom et prénom"
                        texte="L’apporteur s’affiche « NOM Prénom » et se trie par nom de famille. Une structure (agence, société) : videz le nom et le prénom, et saisissez la société : son nom s’affiche tel quel." />
                    </p>
                    {champTexte('Société', 'societe', { large: true })}
                  </>
                )}
              </div>
            )}
          </section>

          {/* 2. CONTACT */}
          {!lecture && !interne && (
            <section className="mfa-section" data-section-fiche="contact">
              <h3 className="mfa-titre">Contact</h3>
              <div className="plo-grille">
                {champTexte('Téléphone principal', 'telephone', { mode: 'tel' })}
                {champTexte('E-mail principal', 'email', { mode: 'email' })}
                {lu.identite && <>
                  <ListeAutres valeurs={f.telephonesAutres} onChange={(x) => poser({ telephonesAutres: x })} mot="Autres téléphones" repere="telephones" mode="tel" />
                  <ListeAutres valeurs={f.emailsAutres} onChange={(x) => poser({ emailsAutres: x })} mot="Autres e-mails" repere="emails" mode="email" />
                  {champTexte('Adresse', 'adresse', { large: true })}
                </>}
              </div>
            </section>
          )}

          {/* 3. RATTACHEMENT ET RÉMUNÉRATION */}
          {!interne && (
            <section className="mfa-section" data-section-fiche="rattachement">
              <h3 className="mfa-titre">Rattachement et rémunération</h3>
              {lecture ? <p className="plo-muet" data-rattachement-interne>Apporteur interne — lié à son compte, rattaché à personne.</p> : (
                <div className="plo-grille">
                  {creation || admin ? (
                    <label className="plo-champ"><span>Collègue rattaché</span>
                      <ListeChoix options={lu.collegues} valeur={r.collegueId} libelle="Collègue rattaché" vide={creation ? '— choisir —' : '— à rattacher —'}
                        onChange={(x) => poserR({ collegueId: x })} donnees={{ 'data-fiche-collegue': '' }} recherche={{ placeholder: 'Rechercher un collègue' }} /></label>
                  ) : (
                    <div className="plo-champ"><span>Collègue rattaché</span><strong className="mfa-valeur" data-fiche-collegue-lecture>{actuel?.collegueLibelle ?? 'à rattacher'}</strong></div>
                  )}
                  {rattachementChange && <>
                    <div className="plo-champ"><span>À partir du</span>
                      {(a?.collegues ?? []).length === 0 && lu.toujours === true && (
                        <label className="plo-case"><input type="checkbox" checked={r.toujours} onChange={(e) => poserR({ toujours: e.target.checked })} data-fiche-rattacher-toujours />Depuis toujours</label>
                      )}
                      <input type="date" aria-label="À partir du" value={r.toujours ? '' : r.depuis} disabled={r.toujours} onChange={(e) => poserR({ depuis: e.target.value })} data-fiche-rattacher-depuis />
                    </div>
                    <div className="plo-champ plo-champ--large" data-fiche-question-honoraires><span>{nomCollegue} touche des honoraires sur l’activité de cet apporteur ?</span>
                      <span className="plo-modes" role="radiogroup" aria-label="Honoraires du collègue">
                        <button type="button" role="radio" className="plo-mode" aria-checked={r.reponse === 'non'} onClick={() => poserR({ reponse: 'non' })} data-fiche-reponse="non">Non</button>
                        <button type="button" role="radio" className="plo-mode" aria-checked={r.reponse === 'oui'} onClick={() => poserR({ reponse: 'oui' })} data-fiche-reponse="oui">Oui</button>
                      </span>
                      {r.reponse === null && <small className="plo-muet">À trancher pour enregistrer.</small>}
                      {r.reponse === 'oui' && lu.avec419 !== true && <small className="plo-alerte">Mise à jour de la base à appliquer (migration 419) : la rémunération du collègue ne peut pas encore être enregistrée.</small>}
                    </div>
                    {r.reponse === 'oui' && <>
                      <ChoixMode valeur={r.mode} onChange={(m) => poserR({ mode: m })} />
                      <label className="plo-champ"><span>Taux sur la location (%)</span><ChampNombre value={r.taux} placeholder="ex. 5" onChange={(e) => poserR({ taux: e.target.value })} data-fiche-remuneration-taux /></label>
                      <label className="plo-champ"><span>Taux sur la gestion (%)</span><ChampNombre value={r.tauxGestion} placeholder="ex. 10" onChange={(e) => poserR({ tauxGestion: e.target.value })} data-fiche-remuneration-taux-gestion /></label>
                      {r.mode === 'recurrent' && <ChampDuree indeterminee={r.indeterminee} duree={r.duree} repere="fiche" onChange={(x) => poserR(x)} />}
                    </>}
                  </>}
                  {a !== undefined && <>
                    <div className="plo-champ plo-champ--large" data-fiche-regle-en-vigueur><span>Taux de l’apporteur en vigueur</span>
                      <span className="mfa-valeur">{v === null ? 'aucun taux aujourd’hui' : libelleRegleApporteur(v)}</span></div>
                    {actuel !== null && <div className="plo-champ plo-champ--large" data-fiche-remuneration-en-vigueur><span>Rémunération de {actuel.collegueLibelle} en vigueur</span>
                      <span className="mfa-valeur">{libelleRemuneration(remu)}</span></div>}
                    {admin ? (
                      <div className="plo-champ--large mfa-gestes">
                        <button type="button" className="svv-btn svv-btn-outline gst-btn" aria-pressed={panneau === 'taux'} onClick={() => { setPanneau(panneau === 'taux' ? null : 'taux'); setMessagePanneau(null); }}
                          data-fiche-ouvrir-taux>Modifier le taux</button>
                        {actuel !== null && <button type="button" className="svv-btn svv-btn-outline gst-btn" aria-pressed={panneau === 'remuneration'}
                          onClick={() => { setPanneau(panneau === 'remuneration' ? null : 'remuneration'); setMessagePanneau(null); }} data-fiche-ouvrir-remuneration>Modifier la rémunération du collègue</button>}
                      </div>
                    ) : <p className="plo-muet plo-petit-texte plo-champ--large" data-fiche-rattachement-admin>Le collègue rattaché, sa rémunération et le taux se modifient par un administrateur (comme dans la Location).</p>}
                  </>}
                </div>
              )}
              {admin && a !== undefined && !lecture && panneau === 'taux' && (
                <PanneauTaux a={a} apporteurs={lu.apporteurs.map((x) => x.fiche)} jour={jour} faire={faire} envoi={envoi} orphelin={(a.collegues ?? []).length === 0}
                  toujoursPossible={lu.toujours === true} cle={lu} onFermer={() => setPanneau(null)} message={messagePanneau && <p className="plo-message-carte" role="status">{messagePanneau}</p>} />
              )}
              {admin && a !== undefined && !lecture && panneau === 'remuneration' && (
                <PanneauRattachement a={a} apporteurs={lu.apporteurs.map((x) => x.fiche)} collegues={lu.collegues} jour={jour} faire={faire} envoi={envoi}
                  avec419={lu.avec419 === true} toujoursPossible={lu.toujours === true} cle={lu} message={messagePanneau && <p className="plo-message-carte" role="status">{messagePanneau}</p>} />
              )}
            </section>
          )}

          {/* 4. NOTES */}
          {!lecture && !interne && lu.identite && (
            <section className="mfa-section" data-section-fiche="notes">
              <h3 className="mfa-titre">Notes</h3>
              <label className="plo-champ"><span>Notes</span><textarea rows={3} value={f.notes} onChange={(e) => poser({ notes: e.target.value })} data-fiche-champ="notes" /></label>
            </section>
          )}

          {creation && !interne && memes.length > 0 && (
            <div className="mfa-doublons" role="status" data-homonymes>
              <span className="plo-alerte">Déjà dans l’annuaire : {memes.length === 1 ? 'un apporteur porte ce nom' : `${memes.length} apporteurs portent ce nom`}.</span>
              {memes.map((x) => <button key={x.id} type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onChoisir?.(x.id)} data-choisir-homonyme={x.id}>Choisir « {x.libelle ?? x.nom} »</button>)}
            </div>
          )}
          {creation && facon !== null && !interne && distants.length > 0 && (
            <div className="mfa-doublons" role="status" data-doublons-annuaire>
              {distants.map((d) => <p key={d.id} className="plo-alerte" data-doublon={d.id}>{messageDoublon(d)}
                {' '}<button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void facon.utiliser(d.id).then(() => onEnregistre(`« ${d.libelle} » est dans votre liste.`))}
                  data-utiliser-apporteur={d.id}>L’utiliser</button></p>)}
            </div>
          )}
        </div>
        {!lecture && (
          <div className="plo-pied mfa-pied">
            {recap && (
              <div className="plo-recap" role="alertdialog" aria-label="Récapitulatif des modifications" data-recap-fiche>
                <strong>Champs modifiés ({nbChangements})</strong>
                <ul className="plo-recap-liste">
                  {rattachementChange && <li data-recap-champ="collegue">Collègue rattaché : {actuel?.collegueLibelle ?? 'à rattacher'} → {nomCollegue} ({r.toujours ? 'depuis toujours' : `à partir du ${r.depuis.split('-').reverse().join('/')}`} ; honoraires : {r.reponse === 'oui' ? 'oui' : 'non'})</li>}
                  {changements.map((c) => <li key={c.cle} data-recap-champ={c.cle}>{c.champ} : {c.avant} → {c.apres}</li>)}
                </ul>
              </div>
            )}
            {motif !== null && <p className="plo-erreur" role="alert" data-fiche-motif>{motif}</p>}
            <div className="plo-boutons">
              {!creation && !recap && <span className="plo-muet plo-petit-texte mfa-etat" data-etat-fiche>{nbChangements === 0 ? 'Aucune modification.' : `${nbChangements} champ(s) modifié(s).`}</span>}
              {conflit && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onEnregistre('Fiche rechargée : elle avait changé entre-temps.')} data-recharger-fiche>Recharger</button>}
              {recap ? <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setRecap(false)} data-recap-revenir>Revenir</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => { void confirmer(); }} data-recap-confirmer>{envoi ? 'Enregistrement…' : 'Confirmer'}</button>
              </> : <>
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFermer} data-annuler-fiche>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!pret || envoi} onClick={demander} data-enregistrer-fiche>
                  {envoi ? 'Enregistrement…' : creation ? 'Ajouter l’apporteur' : 'Enregistrer'}</button>
              </>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS_FENETRE_FICHE = `
.mfa-fenetre{width:min(860px,100%)}
.mfa-section{display:flex;flex-direction:column;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--color-svv-line)}
.mfa-section:last-of-type{border-bottom:0}
.mfa-titre{margin:0;font-size:1rem;color:var(--color-svv-ink)}
.mfa-aide{margin:-4px 0 0;font-size:.82rem;font-weight:400}
.mfa-valeur{font-size:.95rem;font-weight:600;color:var(--color-svv-ink)}
.mfa-sorte{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:.9rem;font-weight:400}
.mfa-sorte .plo-passer-interne{margin:0}
.mfa-sorte [data-passage-interne]{flex-basis:100%}
.mfa-gestes{display:flex;flex-wrap:wrap;gap:8px}
.mfa-gestes .gst-btn{min-height:44px;width:auto}
.mfa-gestes .gst-btn[aria-pressed="true"]{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.mfa-doublons{display:flex;flex-direction:column;gap:8px}
.mfa-doublons .gst-btn{min-height:44px;width:auto;align-self:flex-start}
.mfa-etat{margin:0 auto 0 0;align-self:center}
.mfa-fenetre .plo-champ select,.mfa-fenetre .plo-champ textarea{width:100%;box-sizing:border-box}
.mfa-fenetre .plo-champ input[type=date]{max-width:220px}
`;
