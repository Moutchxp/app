'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EnTetePage } from '../_composants/EnTetePage';
import type { Perms, RoleAdmin } from '../../../../lib/admin/session';

interface CompteVue {
  id: number;
  identifiant: string;
  prenom: string;
  nom: string;
  role: RoleAdmin;
  actif: boolean;
  perms: Perms;
  peutModifierPermis: boolean; // RATT-EDIT (lot A3) — état de la sous-case « modifier après validation » (capacité effective : perm_permis && perm_permis_modif, ou admin)
  etatEnvoiGestion?: 'oui' | 'non' | 'a_decider' | 'sans_objet'; // LOT 5-DROITS — optionnel : une réponse d'API d'avant ce lot n'en porte pas
  derniere_connexion_a: string | null;
  cree_a: string | null; // date de création (fournie par l'API ; NULL toléré)
}
interface DetailCompte extends CompteVue {
  doit_changer_mot_de_passe: boolean;
}

const MODULES: ReadonlyArray<{ cle: keyof Perms; libelle: string }> = [
  { cle: 'pilotage', libelle: 'Pilotage' },
  { cle: 'cartes_annee', libelle: 'Cartes d’année' },
  { cle: 'statistiques', libelle: 'Statistiques' },
  { cle: 'internautes', libelle: 'Internautes' },
  { cle: 'curation', libelle: 'Curation' },
  { cle: 'banc_test', libelle: 'Banc de test' },
  { cle: 'permis', libelle: 'Permis de construire' }, // RATT-EDIT (lot A2) — module gardé (perm_permis) au même rang que les 6
  { cle: 'gestion', libelle: 'Gestion' }, // GESTION (lot 2) — module gardé (perm_gestion), AJOUTÉ en fin de liste : les cases existantes ne bougent pas
];
const PERMS_VIDE = (): Perms => ({ pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false, permis: false, gestion: false });

/** LOT 5-DROITS — réponse à la question d'envoi : `null` = pas encore répondu (« à décider »). */
export type ReponseEnvoi = boolean | null;

/**
 * LOT 5-DROITS — l'état rendu par le serveur redevient une réponse éditable. `a_decider` et `sans_objet` donnent tous
 * deux `null` : dans les deux cas personne n'a répondu, et l'écran ne doit surtout pas pré-cocher « non ». PUR.
 */
export function envoiDepuisEtat(etat: string | undefined): ReponseEnvoi {
  if (etat === 'oui') return true;
  if (etat === 'non') return false;
  return null;
}

/**
 * LOT 5-DROITS — L'ACCÈS GESTION EST-IL DONNÉ SANS RÉPONSE SUR L'ENVOI ? C'est la SEULE condition qui bloque
 * l'enregistrement (décision b d'Arno). PURE, donc testable sans écran — et c'est la même règle que celle que la route
 * applique côté serveur : l'écran empêche, le serveur garantit.
 */
export function envoiSansReponse(perms: Perms, envoi: ReponseEnvoi): boolean {
  return perms.gestion && envoi === null;
}

/** Le message, écrit une fois et réutilisé : l'écran et le serveur doivent dire la MÊME chose. */
export const MSG_ENVOI_OBLIGATOIRE =
  'Répondez d’abord à la question « Peut envoyer des mails au nom de gestion@criterimmo.fr » : oui ou non.';

/**
 * LOT 5-DROITS — CHOIX OUI / NON, sans valeur pré-cochée. Ce n'est pas une case à cocher, et ce n'est pas un détail :
 * une case décochée RÉPOND « non » à la place d'Arno, alors qu'on veut précisément distinguer « on a dit non » de « on
 * n'a pas encore décidé ». Deux boutons, aucun sélectionné au départ.
 *
 * L'état se lit SANS la couleur seule (règle d'accessibilité du dépôt) : un indicateur de forme ●/○, `aria-pressed` pour
 * les lecteurs d'écran, et le mot « à décider » écrit en toutes lettres tant que rien n'est choisi.
 */
export function ChoixOuiNon({ valeur, disabled, onChoisir, idGroupe }: {
  valeur: ReponseEnvoi; disabled?: boolean; onChoisir: (v: boolean) => void; idGroupe: string;
}) {
  return (
    <div className="cpt-ouinon" role="group" aria-labelledby={idGroupe}>
      {([[true, 'Oui'], [false, 'Non']] as const).map(([v, libelle]) => (
        <button key={libelle} type="button" className="cpt-ouinon__btn" aria-pressed={valeur === v}
          disabled={disabled} onClick={() => onChoisir(v)}>
          <span className="cpt-ouinon__ind" aria-hidden="true">{valeur === v ? '●' : '○'}</span>
          {libelle}
        </button>
      ))}
      {valeur === null && !disabled && <span className="cpt-a-decider">à décider</span>}
    </div>
  );
}

/**
 * LOT 5-DROITS — UNE TUILE ET SES DROITS COMPLÉMENTAIRES, groupés. Décision c d'Arno : un droit complémentaire ne
 * s'affiche JAMAIS en liste à plat ; il vit sous sa tuile, en retrait, et il DISPARAÎT quand la tuile n'est pas cochée.
 *
 * Le masquage conditionnel vaut aussi pour le droit Permis existant — Arno l'a demandé explicitement. Il ne retire
 * aucune fonctionnalité : décocher une tuile retire ses droits complémentaires (décision d), donc un droit masqué est
 * un droit qui ne s'applique pas. Montrer une case sans effet serait le vrai mensonge.
 */
export function BlocTuile({ libelle, coche, disabled, onToggle, enfant }: {
  libelle: string; coche: boolean; disabled?: boolean; onToggle?: () => void; enfant?: React.ReactNode;
}) {
  return (
    <div className="cpt-tuile">
      <Chip libelle={libelle} coche={coche} disabled={disabled} onToggle={onToggle} />
      {coche && enfant && <div className="cpt-tuile__sous">{enfant}</div>}
    </div>
  );
}

/**
 * Date lisible en français, HEURE LOCALE (Intl, locale fr-FR ; aucune dépendance). « jamais » si absente.
 * PUR et déterministe → pas de mismatch d'hydratation (la page ne rend les dates qu'en client, après fetch).
 */
export function formaterDate(iso: string | null): string {
  if (!iso) return 'jamais';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'jamais';
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${jour}, ${heure}`;
}

/** Normalisation de tri (insensible casse/accents, NFD) pour l'ordre alphabétique des noms. */
const normNom = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pastille de permission (chip) — contrôle de FORMULAIRE tactile. État coché/décoché perceptible SANS la seule
 * couleur : un indicateur ✓ / □ (forme). Annoncé aux lecteurs d'écran via `aria-pressed`. Désactivée + forcée
 * pour un administrateur (perms implicites).
 */
export function Chip({ libelle, coche, disabled, onToggle }: { libelle: string; coche: boolean; disabled?: boolean; onToggle?: () => void }) {
  return (
    <button type="button" className="cpt-chip" aria-pressed={coche} disabled={disabled} onClick={onToggle}>
      <span className="cpt-chip__ind" aria-hidden="true">{coche ? '✓' : ''}</span>
      {libelle}
    </button>
  );
}

/**
 * Contenu du DÉTAIL d'un compte (présentation PURE, sans fetch). L'identité (prénom/nom/identifiant) n'y figure
 * QU'UNE fois — quand le détail est ouvert, la carte n'affiche que ce contenu, jamais le résumé en plus.
 */
export function DetailContenu({
  compte, perms, peutModifierPermis, envoi, collaborateur, msg, enCours, idPrenom, idNom, onIdPrenom, onIdNom, onEnregistrerIdentite,
  onToggle, onToggleModif, onChoisirEnvoi, onEnregistrer, onPromouvoir, onFermer,
}: {
  compte: DetailCompte;
  perms: Perms;
  peutModifierPermis: boolean; // RATT-EDIT (lot A3) — état de la sous-case
  collaborateur: boolean;
  msg: string | null;
  enCours: boolean;
  idPrenom: string;
  idNom: string;
  onIdPrenom: (v: string) => void;
  onIdNom: (v: string) => void;
  onEnregistrerIdentite: () => void;
  onToggle: (cle: keyof Perms) => void;
  onToggleModif: () => void; // RATT-EDIT (lot A3) — bascule de la sous-case « modifier après validation »
  envoi: ReponseEnvoi; // LOT 5-DROITS — réponse à la question d'envoi (null = à décider)
  onChoisirEnvoi: (v: boolean) => void;
  onEnregistrer: () => void;
  onPromouvoir: () => void;
  onFermer: () => void;
}) {
  // Refus AVANT tout appel serveur (le serveur revalide de toute façon) : prénom ET nom non vides après trim.
  const identiteInvalide = idPrenom.trim().length === 0 || idNom.trim().length === 0;
  return (
    <>
      <div className="cpt-tete" id={`cpt-tete-${compte.id}`}>{compte.prenom} {compte.nom}</div>
      <div className="cpt-meta">
        Rôle : {compte.role} · {compte.actif ? 'actif' : 'inactif'} · créé le : {compte.cree_a ? formaterDate(compte.cree_a) : '—'} · dernière connexion : {formaterDate(compte.derniere_connexion_a)}
        {compte.doit_changer_mot_de_passe && ' · doit changer son mot de passe'}
      </div>

      {/* Identité : prénom + nom éditables (tout compte, y compris un administrateur — F-2). L'identifiant (e-mail)
          est affiché en TEXTE lecture seule, jamais dans un champ désactivé trompeur : il est IMMUABLE (F-1). */}
      <div className="cpt-identite" role="group" aria-labelledby={`ident-${compte.id}`}>
        <div className="cpt-perms-titre" id={`ident-${compte.id}`}>Identité</div>
        <label className="cpt-libc">
          <span className="cpt-libc-t">Prénom</span>
          <input className="cpt-champ" value={idPrenom} autoCapitalize="words" disabled={enCours}
            onChange={(e) => onIdPrenom(e.target.value)} aria-invalid={idPrenom.trim().length === 0} />
        </label>
        <label className="cpt-libc">
          <span className="cpt-libc-t">Nom</span>
          <input className="cpt-champ" value={idNom} autoCapitalize="words" disabled={enCours}
            onChange={(e) => onIdNom(e.target.value)} aria-invalid={idNom.trim().length === 0} />
        </label>
        <div className="cpt-libc">
          <span className="cpt-libc-t">Identifiant (e-mail)</span>
          <span className="cpt-idval">{compte.identifiant}</span>
          <span className="cpt-note">
            Non modifiable : c’est la clé de connexion. Pour changer d’adresse, désactivez ce compte et recréez-en un.
          </span>
        </div>
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={enCours || identiteInvalide} onClick={onEnregistrerIdentite}>
            Enregistrer l’identité
          </button>
          {identiteInvalide && <span className="cpt-err" role="status">Prénom et nom sont obligatoires.</span>}
        </div>
      </div>

      <div className="cpt-perms-titre" id={`perms-${compte.id}`}>
        Permissions {!collaborateur && '(administrateur : toutes, non modifiables)'}
      </div>
      {/* LOT 5-DROITS — UNE TUILE PAR BLOC, ses droits complémentaires EN RETRAIT dessous, et seulement si elle est cochée. */}
      <div className="cpt-perms" role="group" aria-labelledby={`perms-${compte.id}`}>
        {MODULES.map((m) => (
          <BlocTuile key={m.cle} libelle={m.libelle} coche={collaborateur ? perms[m.cle] : true}
            disabled={!collaborateur} onToggle={() => onToggle(m.cle)}
            enfant={m.cle === 'permis' ? (
              <>
                <Chip libelle="Modifier un permis après validation" coche={collaborateur ? peutModifierPermis : true}
                  disabled={!collaborateur} onToggle={onToggleModif} />
                <span className="cpt-note" style={{ display: 'block' }}>
                  Corriger l’emprise et l’altitude d’un permis <strong>déjà validé</strong> (dans Rattachement).
                </span>
              </>
            ) : m.cle === 'gestion' ? (
              <>
                <div className="cpt-sous-titre" id={`envoi-${compte.id}`}>
                  Peut envoyer des mails au nom de gestion@criterimmo.fr
                </div>
                <ChoixOuiNon valeur={collaborateur ? envoi : true} disabled={!collaborateur}
                  onChoisir={onChoisirEnvoi} idGroupe={`envoi-${compte.id}`} />
                <span className="cpt-note" style={{ display: 'block' }}>
                  Écrire au nom de l’agence n’est pas la même chose que lire et trier le courrier. La réponse est
                  obligatoire {collaborateur && <>— tant qu’elle n’est pas donnée, l’envoi est <strong>refusé</strong></>}.
                </span>
              </>
            ) : undefined} />
        ))}
      </div>

      {collaborateur && envoiSansReponse(perms, envoi) && (
        <p className="cpt-err" role="alert">{MSG_ENVOI_OBLIGATOIRE}</p>
      )}

      {collaborateur ? (
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--primary" disabled={enCours || envoiSansReponse(perms, envoi)} onClick={onEnregistrer}>Enregistrer les permissions</button>
          <button type="button" className="cpt-btn cpt-btn--secondary" disabled={enCours} onClick={onPromouvoir}>Promouvoir administrateur</button>
        </div>
      ) : (
        <p className="cpt-note">Un administrateur a toutes les permissions et ne peut être ni rétrogradé ni désactivé depuis l’interface (accès serveur requis).</p>
      )}

      <p className="cpt-note">
        Un changement de permission prend effet <strong>immédiatement</strong> sur les écritures ; l’accès aux pages
        et le menu se mettent à jour à la prochaine connexion de l’intéressé (au plus 8 h).
      </p>
      {msg && <p className="cpt-note" role="status">{msg}</p>}

      <button type="button" className="cpt-btn cpt-btn--neutral" onClick={onFermer}>Fermer</button>
    </>
  );
}

/** Détail d'un compte : charge l'état RÉEL en base, puis rend `DetailContenu`. Prend le focus au dépli (a11y). */
function Detail({ id, onFermer, onRafraichir }: { id: number; onFermer: () => void; onRafraichir: () => void }) {
  const [d, setD] = useState<DetailCompte | null>(null);
  const [perms, setPerms] = useState<Perms>(PERMS_VIDE());
  const [peutModifierPermis, setPeutModifierPermis] = useState(false); // RATT-EDIT (lot A3) — sous-droit « modifier après validation »
  // LOT 5-DROITS — `null` tant qu'Arno n'a pas répondu. On NE remplace JAMAIS ce null par false au chargement : ce
  //   serait répondre « non » à sa place, et effacer la différence entre un refus assumé et une question en attente.
  const [envoi, setEnvoi] = useState<ReponseEnvoi>(null);
  const [idPrenom, setIdPrenom] = useState('');
  const [idNom, setIdNom] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.focus(); }, []); // dépli → focus au détail (focus, pas d'animation)
  useEffect(() => {
    let annule = false;
    void (async () => {
      const res = await fetch(`/api/admin/comptes/${id}`);
      if (annule) return;
      if (!res.ok) { setMsg('Détail indisponible.'); return; }
      const body = await res.json();
      if (!annule) { setD(body.compte); setPerms(body.compte.perms); setPeutModifierPermis(body.compte.peutModifierPermis); setEnvoi(envoiDepuisEtat(body.compte.etatEnvoiGestion)); setIdPrenom(body.compte.prenom); setIdNom(body.compte.nom); }
    })();
    return () => { annule = true; };
  }, [id]);

  async function recharger() {
    const res = await fetch(`/api/admin/comptes/${id}`);
    if (!res.ok) { setMsg('Détail indisponible.'); return; }
    const body = await res.json();
    setD(body.compte); setPerms(body.compte.perms); setPeutModifierPermis(body.compte.peutModifierPermis); setEnvoi(envoiDepuisEtat(body.compte.etatEnvoiGestion)); setIdPrenom(body.compte.prenom); setIdNom(body.compte.nom);
  }
  async function enregistrerIdentite() {
    const prenom = idPrenom.trim(); const nom = idNom.trim();
    if (prenom.length === 0 || nom.length === 0) { setMsg('Prénom et nom sont obligatoires.'); return; }
    setEnCours(true); setMsg(null);
    try {
      // Allowlist stricte côté serveur : le corps ne porte QUE prenom + nom. L'identifiant n'est jamais transmis.
      const res = await fetch(`/api/admin/comptes/${id}/identite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prenom, nom }) });
      if (res.ok) { setMsg('Identité enregistrée.'); await recharger(); onRafraichir(); } else setMsg('Enregistrement de l’identité refusé.');
    } finally { setEnCours(false); }
  }
  async function enregistrer() {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${id}/permissions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perms, permis_modif: peutModifierPermis, gestion_envoi: envoi }) }); // RATT-EDIT lot A3 ; LOT 5-DROITS — gestion_envoi
      if (res.ok) { setMsg('Permissions enregistrées.'); await recharger(); onRafraichir(); }
      else {
        // Le serveur refuse lui aussi l'accès Gestion sans réponse : on affiche SON message, pas une reformulation.
        const body = await res.json().catch(() => null);
        setMsg(typeof body?.erreur === 'string' ? body.erreur : 'Enregistrement refusé.');
      }
    } finally { setEnCours(false); }
  }
  async function promouvoir() {
    if (!window.confirm('Promouvoir ce compte en administrateur ? Un administrateur a toutes les permissions et ne peut plus être rétrogradé.')) return;
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/comptes/${id}/role`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'administrateur' }) });
      if (res.ok) { setMsg('Compte promu administrateur.'); await recharger(); onRafraichir(); } else setMsg('Promotion refusée.');
    } finally { setEnCours(false); }
  }

  return (
    <div ref={ref} tabIndex={-1} className="cpt-detail" id={`detail-${id}`} role="region" aria-labelledby={`cpt-tete-${id}`}>
      {d
        ? <DetailContenu compte={d} perms={perms} peutModifierPermis={peutModifierPermis} envoi={envoi} collaborateur={d.role === 'collaborateur'} msg={msg} enCours={enCours}
            idPrenom={idPrenom} idNom={idNom} onIdPrenom={setIdPrenom} onIdNom={setIdNom} onEnregistrerIdentite={enregistrerIdentite}
            onToggle={(cle) => {
              if (cle === 'permis' && perms.permis) setPeutModifierPermis(false); // subordination ② : décocher « Permis » retire le sous-droit
              // LOT 5-DROITS (décision d) — retirer la tuile Gestion remet la question À DÉCIDER, jamais à « non » :
              //   si on la rouvre, elle se repose. Aucun droit ne revient — ni ne reste fermé — en silence.
              if (cle === 'gestion') setEnvoi(null);
              setPerms((p) => ({ ...p, [cle]: !p[cle] }));
            }}
            onToggleModif={() => setPeutModifierPermis((v) => !v)} onChoisirEnvoi={setEnvoi}
            onEnregistrer={enregistrer} onPromouvoir={promouvoir} onFermer={onFermer} />
        : (msg ?? 'Chargement…')}
    </div>
  );
}

/** Modale bloquante du mot de passe temporaire : une seule fois, copie, case « transmis » avant fermeture. */
function ModaleTemporaire({ identifiant, motDePasse, onFermer }: { identifiant: string; motDePasse: string; onFermer: () => void }) {
  const [transmis, setTransmis] = useState(false);
  const [copie, setCopie] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []); // focus initial dans la modale bloquante (a11y)
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="cpt-modale-titre" className="cpt-overlay">
      <div ref={ref} tabIndex={-1} className="cpt-modale" style={{ outline: 'none' }}>
        <h2 className="cpt-titre" id="cpt-modale-titre">Mot de passe temporaire</h2>
        <p className="cpt-sous">
          Pour <strong>{identifiant}</strong>. Il ne sera <strong>plus jamais affiché</strong> : transmettez-le
          maintenant. Perdu ? Régénérez-en un depuis la liste.
        </p>
        <div className="cpt-mdp">
          <code>{motDePasse}</code>
          <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => { navigator.clipboard?.writeText(motDePasse); setCopie(true); }}>
            {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
        <label className="cpt-case">
          <input type="checkbox" checked={transmis} onChange={(e) => setTransmis(e.target.checked)} />
          J’ai transmis ce mot de passe
        </label>
        <button type="button" className="cpt-btn cpt-btn--primary" disabled={!transmis} onClick={onFermer} style={{ width: '100%' }}>Fermer</button>
      </div>
    </div>
  );
}

export default function ComptesPage() {
  const [comptes, setComptes] = useState<CompteVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ identifiant: string; motDePasse: string } | null>(null);
  const [ouvertId, setOuvertId] = useState<number | null>(null);
  const [desactivesOuverts, setDesactivesOuverts] = useState(false);
  const detailsBtnRef = useRef<HTMLButtonElement | null>(null);

  // Formulaire de création
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [identifiant, setIdentifiant] = useState('');
  const [role, setRole] = useState<RoleAdmin>('collaborateur');
  const [perms, setPerms] = useState<Perms>(PERMS_VIDE());
  const [peutModifierPermis, setPeutModifierPermis] = useState(false); // RATT-EDIT (lot A3) — sous-droit « modifier après validation »
  const [envoi, setEnvoi] = useState<ReponseEnvoi>(null); // LOT 5-DROITS — aucune valeur pré-cochée, à la création aussi
  const [enCours, setEnCours] = useState(false);
  const admin = role === 'administrateur';

  async function recharger() {
    try {
      const res = await fetch('/api/admin/comptes');
      if (!res.ok) throw new Error();
      const body = await res.json();
      setComptes(body.comptes ?? []); setErreur(null);
    } catch { setErreur('Liste indisponible.'); } finally { setChargement(false); }
  }
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/comptes');
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!annule) { setComptes(body.comptes ?? []); setErreur(null); }
      } catch { if (!annule) setErreur('Liste indisponible.'); } finally { if (!annule) setChargement(false); }
    })();
    return () => { annule = true; };
  }, []);

  async function creer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setEnCours(true); setErreur(null);
    try {
      const res = await fetch('/api/admin/comptes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prenom, nom, identifiant, role, perms, permis_modif: peutModifierPermis, gestion_envoi: envoi }) }); // RATT-EDIT lot A3 — perms imbriqué (le serveur lit b.perms) + sous-droits au niveau racine ; LOT 5-DROITS — gestion_envoi
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setTemp({ identifiant, motDePasse: body.motDePasseTemporaire });
        setPrenom(''); setNom(''); setIdentifiant(''); setRole('collaborateur'); setPerms(PERMS_VIDE()); setPeutModifierPermis(false);
        await recharger();
      } else setErreur(typeof body?.erreur === 'string' ? body.erreur : 'Création impossible.');
    } catch { setErreur('Création impossible.'); } finally { setEnCours(false); }
  }

  async function definirActif(c: CompteVue, actif: boolean) {
    const res = await fetch(`/api/admin/comptes/${c.id}/actif`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actif }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const erreurs: Record<string, string> = {
        ADMIN_CLI_UNIQUEMENT: 'Un administrateur ne peut pas être activé ou désactivé depuis l’interface.',
        DERNIER_ADMINISTRATEUR: 'Impossible de désactiver le dernier administrateur actif.',
      };
      setErreur(erreurs[body?.erreur as string] ?? 'Action impossible.');
      return;
    }
    await recharger();
  }
  async function regenerer(c: CompteVue) {
    const res = await fetch(`/api/admin/comptes/${c.id}/mot-de-passe-temporaire`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { setTemp({ identifiant: c.identifiant, motDePasse: body.motDePasseTemporaire }); await recharger(); } else setErreur('Régénération impossible.');
  }

  function ouvrir(c: CompteVue, btn: HTMLButtonElement) { detailsBtnRef.current = btn; setOuvertId(c.id); }
  function fermer() { const btn = detailsBtnRef.current; setOuvertId(null); requestAnimationFrame(() => btn?.focus()); }

  // Tri d'AFFICHAGE (copie, base non réordonnée) : administrateurs d'abord, puis collaborateurs ; chaque groupe par
  // NOM DE FAMILLE (insensible casse/accents, NFD). Appliqué aux actifs ET aux désactivés pour cohérence.
  const trierComptes = (arr: CompteVue[]) =>
    [...arr].sort((a, b) =>
      (a.role === 'administrateur' ? 0 : 1) - (b.role === 'administrateur' ? 0 : 1) ||
      normNom(a.nom).localeCompare(normNom(b.nom)),
    );
  const actifs = trierComptes(comptes.filter((c) => c.actif));
  const desactives = trierComptes(comptes.filter((c) => !c.actif));

  function carte(c: CompteVue, desactive: boolean) {
    if (ouvertId === c.id) {
      return <div key={c.id} className="cpt-carte"><Detail id={c.id} onFermer={fermer} onRafraichir={recharger} /></div>;
    }
    const collaborateur = c.role === 'collaborateur';
    return (
      <div key={c.id} className="cpt-carte">
        <div className="cpt-resume">
          <div className="cpt-nom">{c.prenom} {c.nom}</div>
          <div className="cpt-id">{c.identifiant}</div>
          <div className="cpt-meta">{c.role} · créé le : {c.cree_a ? formaterDate(c.cree_a) : '—'} · dernière connexion : {formaterDate(c.derniere_connexion_a)}</div>
          {/* Règle admin (F1) : sous la ligne de rôle, dans la colonne d'identité — jamais dans la rangée de
              boutons (ceux-ci s'alignent ainsi d'une carte à l'autre). Ton sobre. Le refus est aussi serveur. */}
          {!collaborateur && (
            <div className="cpt-regle">
              {desactive
                ? 'Un administrateur ne peut pas être réactivé depuis l’interface.'
                : 'Un administrateur ne peut pas être désactivé depuis l’interface.'}
            </div>
          )}
        </div>
        <div className="cpt-actions">
          <button type="button" className="cpt-btn cpt-btn--secondary" aria-expanded={false} aria-controls={`detail-${c.id}`} onClick={(e) => ouvrir(c, e.currentTarget)}>Détails</button>
          {!desactive && <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => regenerer(c)}>Régénérer le mot de passe</button>}
          {collaborateur && (
            <button type="button" className="cpt-btn cpt-btn--secondary" onClick={() => definirActif(c, desactive)}>{desactive ? 'Réactiver' : 'Désactiver'}</button>
          )}
        </div>
      </div>
    );
  }

  // Rendu d'une liste DÉJÀ triée (admins d'abord, puis collaborateurs) avec 2 sous-titres intermédiaires. Le split
  // par rôle préserve l'ordre par nom de chaque groupe ; un sous-titre n'apparaît que si son groupe est NON vide.
  // AFFICHAGE seul : n'altère ni le tri ni les données.
  function rendreGroupes(liste: CompteVue[], desactive: boolean) {
    const admins = liste.filter((c) => c.role === 'administrateur');
    const collabs = liste.filter((c) => c.role === 'collaborateur');
    return (
      <div className="cpt-liste">
        {admins.length > 0 && <div className="cpt-groupe">Administrateurs</div>}
        {admins.map((c) => carte(c, desactive))}
        {collabs.length > 0 && <div className="cpt-groupe">Collaborateurs</div>}
        {collabs.map((c) => carte(c, desactive))}
      </div>
    );
  }

  return (
    <div>
      <style>{CSS}</style>
      <EnTetePage titre="Administratif — comptes" intro="Gestion des comptes, de leurs rôles et de leurs permissions." />

      {/* Bloc « Créer un compte » encapsulé en TRAME GRISE (cohérence admin) ; champs/cases/bouton restent en fond clair.
          Affichage seul — aucune logique compte/rôle/permission modifiée. */}
      <section className="svv-card" style={{ marginBottom: 20, background: 'var(--color-svv-field)' }}>
        <h2 className="cpt-h2">Créer un compte</h2>
        <form onSubmit={creer} className="cpt-form">
          <input className="cpt-champ" placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
          <input className="cpt-champ" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          <input className="cpt-champ" type="email" inputMode="email" autoCapitalize="none" placeholder="adresse e-mail" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required />
          <select className="cpt-champ" value={role} onChange={(e) => setRole(e.target.value as RoleAdmin)}>
            <option value="collaborateur">Collaborateur</option>
            <option value="administrateur">Administrateur</option>
          </select>
          <div className="cpt-perms-titre" id="perms-creation">Permissions {admin && '(administrateur : toutes, non modifiables)'}</div>
          {/* LOT 5-DROITS — même regroupement qu'au détail : une tuile par bloc, ses droits complémentaires dessous. */}
          <div className="cpt-perms" role="group" aria-labelledby="perms-creation">
            {MODULES.map((m) => (
              <BlocTuile key={m.cle} libelle={m.libelle} coche={admin || perms[m.cle]} disabled={admin}
                onToggle={() => {
                  if (m.cle === 'permis' && perms.permis) setPeutModifierPermis(false);
                  if (m.cle === 'gestion') setEnvoi(null); // décision d : rouvrir la tuile repose la question
                  setPerms((p) => ({ ...p, [m.cle]: !p[m.cle] }));
                }}
                enfant={m.cle === 'permis' ? (
                  <>
                    <Chip libelle="Modifier un permis après validation" coche={admin || peutModifierPermis}
                      disabled={admin} onToggle={() => setPeutModifierPermis((v) => !v)} />
                    <span className="cpt-note" style={{ display: 'block' }}>Corriger l’emprise et l’altitude d’un permis <strong>déjà validé</strong>.</span>
                  </>
                ) : m.cle === 'gestion' ? (
                  <>
                    <div className="cpt-sous-titre" id="envoi-creation">Peut envoyer des mails au nom de gestion@criterimmo.fr</div>
                    <ChoixOuiNon valeur={admin ? true : envoi} disabled={admin} onChoisir={setEnvoi} idGroupe="envoi-creation" />
                    <span className="cpt-note" style={{ display: 'block' }}>
                      Écrire au nom de l’agence n’est pas la même chose que lire et trier le courrier. La réponse est obligatoire.
                    </span>
                  </>
                ) : undefined} />
            ))}
          </div>
          {!admin && envoiSansReponse(perms, envoi) && <p className="cpt-err" role="alert">{MSG_ENVOI_OBLIGATOIRE}</p>}
          <button type="submit" className="cpt-btn cpt-btn--primary" disabled={enCours || (!admin && envoiSansReponse(perms, envoi))}>{enCours ? 'Création…' : 'Créer le compte'}</button>
        </form>
      </section>

      {erreur && <p role="alert" className="cpt-err">{erreur}</p>}

      <section className="svv-card" style={{ marginBottom: 20 }}>
        <h2 className="cpt-h2">Comptes actifs ({actifs.length})</h2>
        {chargement ? <p>Chargement…</p> : rendreGroupes(actifs, false)}
      </section>

      <section className="svv-card cpt-desactives">
        <button type="button" className="cpt-repli cpt-btn--focus" aria-expanded={desactivesOuverts} onClick={() => setDesactivesOuverts((v) => !v)}>
          <span className="cpt-h2" style={{ margin: 0 }}>Comptes désactivés ({desactives.length})</span>
          <span aria-hidden="true">{desactivesOuverts ? '▾' : '▸'}</span>
        </button>
        {desactivesOuverts && (desactives.length === 0
          ? <p className="cpt-note">Aucun compte désactivé.</p>
          : rendreGroupes(desactives, true))}
      </section>

      {temp && <ModaleTemporaire identifiant={temp.identifiant} motDePasse={temp.motDePasse} onFermer={() => setTemp(null)} />}
    </div>
  );
}

const CSS = `
.cpt-h2{font-size:1rem;font-weight:700;color:var(--color-svv-ink);margin:0 0 12px}
.cpt-form{display:flex;flex-direction:column;gap:10px}
.cpt-champ{min-height:44px;padding:.6rem;font-size:1rem;border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.cpt-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.cpt-err{color:var(--color-svv-red);font-size:.9rem;margin:0 0 12px}
.cpt-liste{display:flex;flex-direction:column;gap:10px}
/* Sous-titre de groupe (Administrateurs / Collaborateurs) — intertitre discret, palette du site (aucun bleu). */
.cpt-groupe{font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--color-svv-muted);margin:6px 0 -2px}
/* Trame de fond : gris très clair UNIFORME sur tout le cartouche + bordure fine. Aucun filet interne. */
.cpt-carte{background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:.7rem;padding:.9rem;display:flex;flex-direction:column;gap:10px}
.cpt-nom{font-weight:700;color:var(--color-svv-ink)}
.cpt-id{font-size:.85rem;color:var(--color-svv-gray)}
.cpt-meta{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-tete{font-weight:700;color:var(--color-svv-ink)}
.cpt-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cpt-regle{font-size:.72rem;color:var(--color-svv-muted);margin-top:4px}
/* Bloc identité (édition prénom/nom + identifiant en texte lecture seule). */
.cpt-identite{display:flex;flex-direction:column;gap:8px}
.cpt-libc{display:flex;flex-direction:column;gap:4px}
.cpt-libc-t{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-idval{font-size:.95rem;font-weight:600;color:var(--color-svv-ink);word-break:break-all}
.cpt-detail{outline:none}
.cpt-note{font-size:.8rem;color:var(--color-svv-muted);margin:4px 0 0}
.cpt-perms-titre{font-size:.8rem;color:var(--color-svv-muted)}
.cpt-perms{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:2px 0;align-items:start}
/* LOT 5-DROITS — une TUILE et ses droits complémentaires forment UN bloc : le rattachement visuel doit tenir même
   quand la grille passe sur une seule colonne (iPhone portrait), d'où le liseré vertical plutôt qu'une simple marge. */
.cpt-tuile{display:flex;flex-direction:column;gap:6px;min-width:0}
.cpt-tuile__sous{display:flex;flex-direction:column;gap:6px;margin-left:12px;padding:8px 0 4px 12px;border-left:2px solid var(--color-svv-line-strong);min-width:0}
.cpt-sous-titre{font-size:.85rem;font-weight:600;color:var(--color-svv-ink);line-height:1.3}
/* Oui / Non : deux cibles de 44 px qui passent à la ligne plutôt que de déborder. Aucune dépendance au survol. */
.cpt-ouinon{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cpt-ouinon__btn{display:inline-flex;align-items:center;gap:.4rem;min-height:44px;min-width:88px;padding:.5rem .9rem;border-radius:.7rem;border:1.5px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.9rem;font-weight:600;cursor:pointer}
.cpt-ouinon__btn[aria-pressed="true"]{background:var(--color-svv-green-soft);border-color:var(--color-svv-green-ink);color:var(--color-svv-green-ink)}
.cpt-ouinon__btn:disabled{cursor:not-allowed;opacity:.85}
.cpt-ouinon__btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cpt-ouinon__ind{font-size:.9rem;line-height:1}
/* « à décider » est un MOT, pas une couleur : il reste lisible en niveaux de gris et pour un daltonien. */
.cpt-a-decider{display:inline-flex;align-items:center;min-height:28px;padding:.15rem .55rem;border-radius:.5rem;border:1px dashed var(--color-svv-red);color:var(--color-svv-red);font-size:.8rem;font-weight:700}
/* Boutons — hiérarchie stricte, palette du site (aucun bleu), focus rouge visible, cibles >= 44px. */
.cpt-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:44px;padding:.6rem 1rem;font-weight:700;font-size:.95rem;line-height:1.1;border-radius:.7rem;border:1.5px solid transparent;background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer;transition:background-color .15s ease,border-color .15s ease}
.cpt-btn--primary{background:var(--color-svv-red);color:#fff;border-color:var(--color-svv-red)}
.cpt-btn--primary:hover{background:var(--color-svv-red-dark);border-color:var(--color-svv-red-dark)}
.cpt-btn--secondary{background:var(--color-svv-surface);color:var(--color-svv-red);border-color:var(--color-svv-red)}
.cpt-btn--secondary:hover{background:var(--color-svv-red-soft)}
.cpt-btn--neutral{background:var(--color-svv-surface);color:var(--color-svv-gray);border-color:var(--color-svv-line)}
.cpt-btn--neutral:hover{border-color:var(--color-svv-muted)}
.cpt-btn:disabled{opacity:.55;cursor:not-allowed}
.cpt-btn:focus-visible,.cpt-btn--focus:focus-visible,.cpt-chip:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Pastilles de permission (chips) — état par forme (indicateur ✓/□) + fond, pas la seule couleur. */
.cpt-chip{display:flex;align-items:center;gap:.5rem;min-height:44px;padding:.5rem .75rem;border-radius:.7rem;border:1.5px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.9rem;font-weight:600;cursor:pointer;text-align:left;width:100%}
.cpt-chip[aria-pressed="true"]{background:var(--color-svv-green-soft);border-color:var(--color-svv-green-ink);color:var(--color-svv-green-ink)}
.cpt-chip:disabled{cursor:not-allowed;opacity:.85}
.cpt-chip__ind{width:20px;height:20px;flex-shrink:0;border:1.5px solid currentColor;border-radius:.35rem;display:inline-flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:800}
.cpt-desactives{border-style:dashed}
.cpt-repli{width:100%;display:flex;align-items:center;justify-content:space-between;min-height:44px;background:none;border:0;cursor:pointer;padding:0;color:var(--color-svv-ink)}
.cpt-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(20,20,20,.55)}
.cpt-modale{width:100%;max-width:420px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.9rem;padding:1.25rem}
.cpt-titre{margin:0 0 6px;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.cpt-sous{margin:0 0 12px;font-size:.85rem;color:var(--color-svv-muted)}
.cpt-mdp{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.cpt-mdp code{flex:1;font-size:1rem;padding:.6rem;background:var(--color-svv-field);border-radius:.5rem;word-break:break-all;color:var(--color-svv-ink)}
.cpt-case{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:.9rem;margin-bottom:12px}
/* Case à cocher : coche + focus à la palette du site (jamais le bleu natif du navigateur). */
.cpt-case input{accent-color:var(--color-svv-red)}
.cpt-case input:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (min-width:768px){
  .cpt-carte{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between}
  .cpt-carte .cpt-detail{flex-basis:100%}
  .cpt-resume{flex:1;min-width:0}
}
@media (prefers-reduced-motion: reduce){ .cpt-btn{transition:none} }
`;
