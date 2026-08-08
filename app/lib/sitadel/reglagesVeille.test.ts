import { describe, it, expect } from 'vitest';
import {
  parserBornesCheck, validerReglages, bandeauIdentite, colonneDepuisProbleme,
  PARAMS_VEILLE, CHAMPS_IDENTITE,
} from './reglagesVeille';
import { problemesIdentite, type ConfigDemandeur } from './demande';

/**
 * S7d — réglages de la veille permis. Bornes tirées des CHECK de la base (jamais recopiées), validation server-side
 * réutilisant `problemesIdentite`. `DEFS_BASE` reproduit EXACTEMENT la sortie de `pg_get_constraintdef` sur
 * `config_veille` (relevée en base, migrations 048 + 054 + 070 + 074 + 075) : c'est l'oracle des bornes affichées.
 */
const DEFS_BASE = [
  'CHECK (((annees_par_defaut >= 1) AND (annees_par_defaut <= 20)))',
  'CHECK (((demandes_par_commune_par_mois >= 1) AND (demandes_par_commune_par_mois <= 10)))',
  'CHECK (((dossiers_par_demande >= 1) AND (dossiers_par_demande <= 20)))',
  'CHECK ((id = 1))',
  'CHECK (((rang_construction_neuve >= 1) AND (rang_construction_neuve <= 99)))',
  'CHECK (((rang_demolition >= 1) AND (rang_demolition <= 99)))',
  'CHECK (((rang_extension >= 1) AND (rang_extension <= 99)))',
  'CHECK (((rang_immeuble_neuf >= 1) AND (rang_immeuble_neuf <= 99)))',
  'CHECK (((rang_surelevation >= 1) AND (rang_surelevation <= 99)))',
  'CHECK (((seuil_logements_immeuble >= 1) AND (seuil_logements_immeuble <= 500)))',
  'CHECK (((seuil_surface_immeuble_m2 >= 100) AND (seuil_surface_immeuble_m2 <= 100000)))',
  'CHECK (((anciennete_max_demande_annees >= 1) AND (anciennete_max_demande_annees <= 20)))',
  // S37 — caps d'envoi (migration 070)
  'CHECK (((envois_max_par_run >= 1) AND (envois_max_par_run <= 200)))',
  'CHECK (((envois_max_par_jour >= 1) AND (envois_max_par_jour <= 500)))',
  // R7 — relève automatique (migration 074) : Postgres rend `BETWEEN 15 AND 1440` sous cette forme `>= AND <=`
  'CHECK (((releve_intervalle_minutes >= 15) AND (releve_intervalle_minutes <= 1440)))',
  // R6 — échéance + fraîcheur (migration 075)
  'CHECK (((echeance_alerte_jours >= 1) AND (echeance_alerte_jours <= 30)))',
  'CHECK (((releve_fraicheur_heures >= 1) AND (releve_fraicheur_heures <= 720)))',
  // R8 — heure d'envoi des alertes (migration 078)
  'CHECK (((alerte_heure_locale >= 0) AND (alerte_heure_locale <= 23)))',
];
const BORNES = parserBornesCheck(DEFS_BASE);

const CONF_OK: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};

describe('S7d — bornes issues des CHECK de la base', () => {
  it('parse min/max depuis pg_get_constraintdef, ignore la contrainte non bornée (id = 1)', () => {
    expect(BORNES.seuil_surface_immeuble_m2).toEqual({ min: 100, max: 100000 });
    expect(BORNES.anciennete_max_demande_annees).toEqual({ min: 1, max: 20 });
    expect(BORNES.demandes_par_commune_par_mois).toEqual({ min: 1, max: 10 });
    expect(BORNES.id).toBeUndefined(); // « id = 1 » n'a pas de plage → pas de borne inventée
  });

  it('AUCUN paramètre entier n’a de plage recopiée : chacun est adossé à un CHECK de la base', () => {
    for (const p of PARAMS_VEILLE.filter((x) => x.type === 'entier')) {
      expect(BORNES[p.colonne], `borne manquante pour ${p.colonne}`).toBeDefined();
    }
  });
});

describe('S7d — validation de l’identité (réutilise problemesIdentite)', () => {
  it('identité incomplète REFUSÉE, message nommant le champ fautif, sous la bonne colonne', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, siegeAdresse: '' } }, BORNES);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const e = res.erreurs.find((x) => x.message.includes('adresse du siège'));
      expect(e).toBeDefined();
      expect(e!.message).toContain('requis');
      expect(e!.colonne).toBe('siege_adresse');
    }
  });

  it('casse NON bloquante : « CRITERIMMO » (raison sociale au RCS) est ACCEPTÉE (correctif S8a)', () => {
    expect(validerReglages({ demandeur: { ...CONF_OK, raisonSociale: 'CRITERIMMO' } }, BORNES).ok).toBe(true);
  });

  it('GABARIT non rempli REFUSÉ, message nommant la chaîne reconnue', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, raisonSociale: 'RAISON SOCIALE EXACTE' } }, BORNES);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'raison_sociale' && /gabarit/.test(e.message))).toBe(true);
  });

  it('identité valide ACCEPTÉE (valeurs nettoyées, colonnes snake) et le bandeau bascule', () => {
    const res = validerReglages({ demandeur: { ...CONF_OK, raisonSociale: '  Criterimmo  ' } }, BORNES);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.demandeur.raison_sociale).toBe('Criterimmo'); // trim appliqué
      expect(res.veille).toEqual({});
    }
    expect(bandeauIdentite(problemesIdentite(CONF_OK)).complete).toBe(true);
    expect(bandeauIdentite(problemesIdentite({ ...CONF_OK, emailContact: '' })).complete).toBe(false);
  });

  it('chaque problème d’identité se replace sous une colonne connue (garde anti-divergence des libellés)', () => {
    const vide: ConfigDemandeur = { raisonSociale: '', formeJuridique: '', siegeAdresse: '', representantNom: '', representantQualite: '', emailContact: '', telephone: '' };
    for (const p of problemesIdentite(vide)) {
      expect(CHAMPS_IDENTITE.some((c) => c.libelle === p.split(' : ')[0]), `libellé non mappé: ${p}`).toBe(true);
      expect(colonneDepuisProbleme(p)).not.toBe('');
    }
  });
});

describe('S7d — validation des paramètres moteur (plage = CHECK base)', () => {
  it('valeur HORS PLAGE refusée, RIEN à écrire', () => {
    const trop = validerReglages({ veille: { anciennete_max_demande_annees: 99 } }, BORNES);
    expect(trop.ok).toBe(false);
    if (!trop.ok) expect(trop.erreurs[0].message).toMatch(/maximum 20/);
    const sous = validerReglages({ veille: { seuil_surface_immeuble_m2: 10 } }, BORNES);
    expect(sous.ok).toBe(false);
    if (!sous.ok) expect(sous.erreurs[0].message).toMatch(/minimum 100/);
  });

  it('valeur DANS la plage acceptée ; non entier / colonne inconnue refusés', () => {
    const ok = validerReglages({ veille: { dossiers_par_demande: 8 } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille).toEqual({ dossiers_par_demande: 8 });
    expect(validerReglages({ veille: { dossiers_par_demande: 3.5 } }, BORNES).ok).toBe(false);
    expect(validerReglages({ veille: { colonne_bidon: 1 } }, BORNES).ok).toBe(false);
  });

  it('pièces demandées : liste de codes normalisée, vide refusée', () => {
    const ok = validerReglages({ veille: { pieces_demandees: ' PC2 , PC3 ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.pieces_demandees).toBe('PC2,PC3');
    expect(validerReglages({ veille: { pieces_demandees: '  ,  ' } }, BORNES).ok).toBe(false);
  });

  it('patch vide → refus explicite, rien écrit', () => {
    const res = validerReglages({}, BORNES);
    expect(res.ok).toBe(false);
  });

  it('S40 — mention : booléen (oui/non attendu) et texte libre (vide autorisé, trimé)', () => {
    const on = validerReglages({ veille: { mention_service_active: true } }, BORNES);
    expect(on.ok).toBe(true);
    if (on.ok) expect(on.veille.mention_service_active).toBe(true);
    expect(validerReglages({ veille: { mention_service_active: 'oui' } }, BORNES).ok).toBe(false); // pas un booléen
    const txt = validerReglages({ veille: { mention_delai_texte: '  À défaut de réponse…  ' } }, BORNES);
    expect(txt.ok).toBe(true);
    if (txt.ok) expect(txt.veille.mention_delai_texte).toBe('À défaut de réponse…'); // trimé
    const vide = validerReglages({ veille: { mention_delai_texte: '' } }, BORNES);
    expect(vide.ok).toBe(true); // vide autorisé (= rien ajouté)
    if (vide.ok) expect(vide.veille.mention_delai_texte).toBe('');
  });

  it('S38 — adresse de réponse : e-mail valide accepté (trimé), VIDE accepté (non configurée), invalide refusé', () => {
    const ok = validerReglages({ veille: { adresse_reponse: '  demandes@sansvisavis.com ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.adresse_reponse).toBe('demandes@sansvisavis.com');
    // '' est ACCEPTÉ (c'est le chemin d'envoi qui refuse, pas les réglages)
    const vide = validerReglages({ veille: { adresse_reponse: '' } }, BORNES);
    expect(vide.ok).toBe(true);
    if (vide.ok) expect(vide.veille.adresse_reponse).toBe('');
    // formes invalides → refus (zéro écriture)
    for (const mauvais of ['pas-un-email', 'a@b', 'a b@c.fr']) {
      expect(validerReglages({ veille: { adresse_reponse: mauvais } }, BORNES).ok).toBe(false);
    }
  });

  it('S30 — URL DILA : http(s) accepté (trimé), forme invalide refusée (zéro écriture)', () => {
    const ok = validerReglages({ veille: { dila_url: '  https://data.gouv.fr/x  ' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.dila_url).toBe('https://data.gouv.fr/x'); // trimé
    expect(validerReglages({ veille: { dila_url: 'http://ok.example/a' } }, BORNES).ok).toBe(true);
    // refus : pas d'http, espaces, vide, mauvais schéma → aucune écriture
    for (const mauvais of ['pas-une-url', 'ftp://x', 'https://a b', '', 'www.data.gouv.fr']) {
      const r = validerReglages({ veille: { dila_url: mauvais } }, BORNES);
      expect(r.ok).toBe(false);
    }
  });
});

describe('S7e — validation par profil + profil par défaut', () => {
  const PERS = { representantNom: 'Jean Dupont', siegeAdresse: '12 rue des Lilas, 92000 Nanterre', emailContact: 'jean.dupont@exemple.fr' };

  it('« personne » : identité nom+adresse+e-mail acceptée SANS raison sociale', () => {
    const res = validerReglages({ demandeur: PERS }, BORNES, 'personne');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.demandeur.representant_nom).toBe('Jean Dupont');
      expect(res.demandeur.email_contact).toBe('jean.dupont@exemple.fr');
    }
  });

  it('« personne » : nom manquant refusé, nommé « nom »', () => {
    const res = validerReglages({ demandeur: { ...PERS, representantNom: '' } }, BORNES, 'personne');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'representant_nom' && /nom : requis/.test(e.message))).toBe(true);
  });

  it('« entreprise » : la même saisie (sans raison sociale) est refusée', () => {
    const res = validerReglages({ demandeur: PERS }, BORNES, 'entreprise');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreurs.some((e) => e.colonne === 'raison_sociale')).toBe(true);
  });

  it('profil_demandeur_defaut : valeur de la liste acceptée, hors-liste refusée', () => {
    const ok = validerReglages({ veille: { profil_demandeur_defaut: 'personne' } }, BORNES);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.veille.profil_demandeur_defaut).toBe('personne');
    expect(validerReglages({ veille: { profil_demandeur_defaut: 'anonyme' } }, BORNES).ok).toBe(false);
  });
});
