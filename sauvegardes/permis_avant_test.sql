--
-- PostgreSQL database dump
--

\restrict CQ5lhsS8U7KaNgFziI8eQlbCd02NB0VR7soRUYXPMq93Ffx5iU0JZEnCiLwQUzw

-- Dumped from database version 17.10 (Homebrew)
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: permis_altitude_journal; Type: TABLE; Schema: public; Owner: macbookprom4arnaud
--

CREATE TABLE public.permis_altitude_journal (
    id bigint NOT NULL,
    cleabs text NOT NULL,
    altitude_ngf numeric,
    origine text NOT NULL,
    cause text NOT NULL,
    source_type text,
    source_millesime text,
    source_date timestamp with time zone,
    dossier_id bigint,
    altitude_precedente numeric,
    origine_precedente text,
    enregistre_le timestamp with time zone DEFAULT now() NOT NULL,
    enregistre_par text,
    note text,
    CONSTRAINT permis_altitude_journal_cause_chk CHECK ((cause = ANY (ARRAY['import'::text, 'injection'::text, 'retour_arriere'::text, 'ecrasement_lidar'::text]))),
    CONSTRAINT permis_altitude_journal_origine_chk CHECK ((origine = ANY (ARRAY['lidar'::text, 'permis'::text]))),
    CONSTRAINT permis_altitude_journal_origine_prec_chk CHECK ((origine_precedente = ANY (ARRAY['lidar'::text, 'permis'::text])))
);


ALTER TABLE public.permis_altitude_journal OWNER TO macbookprom4arnaud;

--
-- Name: TABLE permis_altitude_journal; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON TABLE public.permis_altitude_journal IS 'FUS-3f — REGISTRE APPEND-ONLY des altitudes par cleabs, à VALEUR DE PREUVE. Une ligne par changement (import BD TOPO, injection permis, retour arrière, écrasement par une mesure LiDAR postérieure). 🔴 JAMAIS d''UPDATE/DELETE/TRUNCATE : garanti EN BASE par le trigger permis_altitude_journal_append_only (on émet une nouvelle ligne, on ne corrige pas). Pas de FK dossier_id (la preuve survit à la purge du dossier). Périmètre borné aux cleabs des empreintes de permis. Extraction : app/lib/permis/exportAltitudes.ts.';


--
-- Name: COLUMN permis_altitude_journal.cause; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_altitude_journal.cause IS 'FUS-3f — ce qui a provoqué la ligne (liste FERMÉE) : import (nouvelle édition BD TOPO / ligne de départ LiDAR) | injection (permis) | retour_arriere (restauration de la LiDAR refigée) | ecrasement_lidar (mesure LiDAR postérieure qui écrase une altitude permis).';


--
-- Name: COLUMN permis_altitude_journal.source_millesime; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_altitude_journal.source_millesime IS 'FUS-3f — PROVENANCE OBLIGATOIRE : étiquette d''édition de la source. Si inconnue (la couche batiment n''a AUCUNE étiquette d''édition), écrire littéralement ''inconnu'' — JAMAIS une date supposée. Une ligne de preuve sans provenance ne prouve rien.';


--
-- Name: COLUMN permis_altitude_journal.source_date; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_altitude_journal.source_date IS 'FUS-3f — date RÉELLE par objet (batiment.date_modification) quand elle existe ; NULL sinon. N''est JAMAIS une date d''édition supposée (cf. source_millesime).';


--
-- Name: COLUMN permis_altitude_journal.dossier_id; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_altitude_journal.dossier_id IS 'FUS-3f — permis en jeu (origine ''permis'', ou permis annulé par une mesure LiDAR). PAS de FK : la preuve doit survivre à la purge du dossier, et un ON DELETE SET NULL serait un UPDATE interdit par le trigger append-only.';


--
-- Name: permis_altitude_journal_id_seq; Type: SEQUENCE; Schema: public; Owner: macbookprom4arnaud
--

CREATE SEQUENCE public.permis_altitude_journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permis_altitude_journal_id_seq OWNER TO macbookprom4arnaud;

--
-- Name: permis_altitude_journal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macbookprom4arnaud
--

ALTER SEQUENCE public.permis_altitude_journal_id_seq OWNED BY public.permis_altitude_journal.id;


--
-- Name: permis_corps_polygone; Type: TABLE; Schema: public; Owner: macbookprom4arnaud
--

CREATE TABLE public.permis_corps_polygone (
    id bigint NOT NULL,
    dossier_id bigint NOT NULL,
    corps_id bigint NOT NULL,
    cleabs text NOT NULL,
    maj_le timestamp with time zone DEFAULT now() NOT NULL,
    maj_par text
);


ALTER TABLE public.permis_corps_polygone OWNER TO macbookprom4arnaud;

--
-- Name: TABLE permis_corps_polygone; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON TABLE public.permis_corps_polygone IS 'M1 — liaison N:1 polygone BD TOPO → bâtiment déclaré au permis (une ligne par couple). Autorité de l''affectation (remplace la colonne dépréciée permis_corps_batiment.cleabs_affecte). Exclusivité (a) garantie par l''index unique (dossier_id, cleabs). Ne porte PAS l''altitude (celle-ci vit dans permis_polygone_altitude).';


--
-- Name: permis_corps_polygone_id_seq; Type: SEQUENCE; Schema: public; Owner: macbookprom4arnaud
--

CREATE SEQUENCE public.permis_corps_polygone_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permis_corps_polygone_id_seq OWNER TO macbookprom4arnaud;

--
-- Name: permis_corps_polygone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macbookprom4arnaud
--

ALTER SEQUENCE public.permis_corps_polygone_id_seq OWNED BY public.permis_corps_polygone.id;


--
-- Name: permis_polygone_altitude; Type: TABLE; Schema: public; Owner: macbookprom4arnaud
--

CREATE TABLE public.permis_polygone_altitude (
    cleabs text NOT NULL,
    altitude_ngf numeric,
    altitude_origine text,
    altitude_lidar_refige numeric,
    altitude_lidar_refige_le timestamp with time zone,
    dossier_id bigint,
    maj_le timestamp with time zone DEFAULT now() NOT NULL,
    maj_par text,
    CONSTRAINT permis_polygone_altitude_origine_chk CHECK ((altitude_origine = ANY (ARRAY['lidar'::text, 'permis'::text])))
);


ALTER TABLE public.permis_polygone_altitude OWNER TO macbookprom4arnaud;

--
-- Name: TABLE permis_polygone_altitude; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON TABLE public.permis_polygone_altitude IS 'FUS-3a — altitude d''un polygone (par cleabs) et son ORIGINE. 🔴 PRÉSÉANCE INVERSÉE : le LiDAR (mesure) écrase TOUJOURS le permis (déclaration), y compris validé → dossier annule_par_lidar. Voir cartouche de la migration 116 et preseanceAltitude.ts.';


--
-- Name: COLUMN permis_polygone_altitude.altitude_origine; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_polygone_altitude.altitude_origine IS 'FUS-3a — origine de l''altitude COURANTE : ''lidar'' (mesure, fait foi) ou ''permis'' (déclaration provisoire). 🔴 INVARIANT INVERSÉ vs ''saisie protégée'' : une mesure LiDAR écrase TOUJOURS un ''permis'', même validé. NE PAS protéger ''permis'' : ce serait garder une valeur déclarée périmée par la mesure réelle.';


--
-- Name: COLUMN permis_polygone_altitude.altitude_lidar_refige; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON COLUMN public.permis_polygone_altitude.altitude_lidar_refige IS 'FUS-3a — altitude LiDAR figée JUSTE AVANT l''écrasement par le permis (relue à l''instant de l''injection, PAS celle du snapshot d''analyse : BD TOPO a pu être remesurée). Sert au RETOUR ARRIÈRE manuel, qui restaure cette valeur (à jour) et repasse l''origine à ''lidar''.';


--
-- Name: permis_rattachement; Type: TABLE; Schema: public; Owner: macbookprom4arnaud
--

CREATE TABLE public.permis_rattachement (
    id integer NOT NULL,
    dossier_id bigint NOT NULL,
    parcelle_candidate_idu text,
    regime text NOT NULL,
    verdict text NOT NULL,
    etat text DEFAULT 'en_attente_bati'::text NOT NULL,
    motif text,
    criteres jsonb,
    seuils_utilises jsonb,
    seuils_provenance text,
    polygones_concernes jsonb DEFAULT '[]'::jsonb NOT NULL,
    millesime_cadastre text,
    millesime_bati text,
    valide_par text,
    valide_le timestamp with time zone,
    refuse_par text,
    refuse_le timestamp with time zone,
    refus_motif text,
    detecte_le timestamp with time zone DEFAULT now() NOT NULL,
    reevalue_le timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permis_rattachement_etat_chk CHECK ((etat = ANY (ARRAY['en_attente_bati'::text, 'arbitrage_demande'::text, 'valide'::text, 'refuse'::text, 'annule_par_lidar'::text])))
);


ALTER TABLE public.permis_rattachement OWNER TO macbookprom4arnaud;

--
-- Name: TABLE permis_rattachement; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON TABLE public.permis_rattachement IS 'FUS-3a — DOSSIER de rattachement (un permis = une ligne, réévalué en place). Fige le verdict FUS-2, les critères mesurés, les seuils utilisés + leur provenance, les millésimes. `etat` se réévalue (en_attente_bati / arbitrage_demande / valide / refuse / annule_par_lidar). Historique dans permis_rattachement_evenement.';


--
-- Name: permis_rattachement_evenement; Type: TABLE; Schema: public; Owner: macbookprom4arnaud
--

CREATE TABLE public.permis_rattachement_evenement (
    id bigint NOT NULL,
    rattachement_id bigint NOT NULL,
    type text NOT NULL,
    ancien_etat text,
    nouvel_etat text,
    details jsonb,
    survenu_le timestamp with time zone DEFAULT now() NOT NULL,
    par text
);


ALTER TABLE public.permis_rattachement_evenement OWNER TO macbookprom4arnaud;

--
-- Name: TABLE permis_rattachement_evenement; Type: COMMENT; Schema: public; Owner: macbookprom4arnaud
--

COMMENT ON TABLE public.permis_rattachement_evenement IS 'FUS-3a — HISTORIQUE append-only du dossier de rattachement : chaque détection, réévaluation, transition d''état, écrasement/retour d''altitude. Permet de raconter l''histoire complète (auditabilité).';


--
-- Name: permis_rattachement_evenement_id_seq; Type: SEQUENCE; Schema: public; Owner: macbookprom4arnaud
--

CREATE SEQUENCE public.permis_rattachement_evenement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permis_rattachement_evenement_id_seq OWNER TO macbookprom4arnaud;

--
-- Name: permis_rattachement_evenement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macbookprom4arnaud
--

ALTER SEQUENCE public.permis_rattachement_evenement_id_seq OWNED BY public.permis_rattachement_evenement.id;


--
-- Name: permis_rattachement_id_seq; Type: SEQUENCE; Schema: public; Owner: macbookprom4arnaud
--

CREATE SEQUENCE public.permis_rattachement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.permis_rattachement_id_seq OWNER TO macbookprom4arnaud;

--
-- Name: permis_rattachement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: macbookprom4arnaud
--

ALTER SEQUENCE public.permis_rattachement_id_seq OWNED BY public.permis_rattachement.id;


--
-- Name: permis_altitude_journal id; Type: DEFAULT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_altitude_journal ALTER COLUMN id SET DEFAULT nextval('public.permis_altitude_journal_id_seq'::regclass);


--
-- Name: permis_corps_polygone id; Type: DEFAULT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_corps_polygone ALTER COLUMN id SET DEFAULT nextval('public.permis_corps_polygone_id_seq'::regclass);


--
-- Name: permis_rattachement id; Type: DEFAULT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement ALTER COLUMN id SET DEFAULT nextval('public.permis_rattachement_id_seq'::regclass);


--
-- Name: permis_rattachement_evenement id; Type: DEFAULT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement_evenement ALTER COLUMN id SET DEFAULT nextval('public.permis_rattachement_evenement_id_seq'::regclass);


--
-- Data for Name: permis_altitude_journal; Type: TABLE DATA; Schema: public; Owner: macbookprom4arnaud
--

COPY public.permis_altitude_journal (id, cleabs, altitude_ngf, origine, cause, source_type, source_millesime, source_date, dossier_id, altitude_precedente, origine_precedente, enregistre_le, enregistre_par, note) FROM stdin;
\.


--
-- Data for Name: permis_corps_polygone; Type: TABLE DATA; Schema: public; Owner: macbookprom4arnaud
--

COPY public.permis_corps_polygone (id, dossier_id, corps_id, cleabs, maj_le, maj_par) FROM stdin;
\.


--
-- Data for Name: permis_polygone_altitude; Type: TABLE DATA; Schema: public; Owner: macbookprom4arnaud
--

COPY public.permis_polygone_altitude (cleabs, altitude_ngf, altitude_origine, altitude_lidar_refige, altitude_lidar_refige_le, dossier_id, maj_le, maj_par) FROM stdin;
\.


--
-- Data for Name: permis_rattachement; Type: TABLE DATA; Schema: public; Owner: macbookprom4arnaud
--

COPY public.permis_rattachement (id, dossier_id, parcelle_candidate_idu, regime, verdict, etat, motif, criteres, seuils_utilises, seuils_provenance, polygones_concernes, millesime_cadastre, millesime_bati, valide_par, valide_le, refuse_par, refuse_le, refus_motif, detecte_le, reevalue_le) FROM stdin;
\.


--
-- Data for Name: permis_rattachement_evenement; Type: TABLE DATA; Schema: public; Owner: macbookprom4arnaud
--

COPY public.permis_rattachement_evenement (id, rattachement_id, type, ancien_etat, nouvel_etat, details, survenu_le, par) FROM stdin;
\.


--
-- Name: permis_altitude_journal_id_seq; Type: SEQUENCE SET; Schema: public; Owner: macbookprom4arnaud
--

SELECT pg_catalog.setval('public.permis_altitude_journal_id_seq', 1, true);


--
-- Name: permis_corps_polygone_id_seq; Type: SEQUENCE SET; Schema: public; Owner: macbookprom4arnaud
--

SELECT pg_catalog.setval('public.permis_corps_polygone_id_seq', 8, true);


--
-- Name: permis_rattachement_evenement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: macbookprom4arnaud
--

SELECT pg_catalog.setval('public.permis_rattachement_evenement_id_seq', 1, false);


--
-- Name: permis_rattachement_id_seq; Type: SEQUENCE SET; Schema: public; Owner: macbookprom4arnaud
--

SELECT pg_catalog.setval('public.permis_rattachement_id_seq', 1, false);


--
-- Name: permis_altitude_journal permis_altitude_journal_pkey; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_altitude_journal
    ADD CONSTRAINT permis_altitude_journal_pkey PRIMARY KEY (id);


--
-- Name: permis_corps_polygone permis_corps_polygone_pkey; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_corps_polygone
    ADD CONSTRAINT permis_corps_polygone_pkey PRIMARY KEY (id);


--
-- Name: permis_polygone_altitude permis_polygone_altitude_pkey; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_polygone_altitude
    ADD CONSTRAINT permis_polygone_altitude_pkey PRIMARY KEY (cleabs);


--
-- Name: permis_rattachement permis_rattachement_dossier_id_key; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement
    ADD CONSTRAINT permis_rattachement_dossier_id_key UNIQUE (dossier_id);


--
-- Name: permis_rattachement_evenement permis_rattachement_evenement_pkey; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement_evenement
    ADD CONSTRAINT permis_rattachement_evenement_pkey PRIMARY KEY (id);


--
-- Name: permis_rattachement permis_rattachement_pkey; Type: CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement
    ADD CONSTRAINT permis_rattachement_pkey PRIMARY KEY (id);


--
-- Name: permis_altitude_journal_cleabs_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_altitude_journal_cleabs_idx ON public.permis_altitude_journal USING btree (cleabs, enregistre_le);


--
-- Name: permis_altitude_journal_dossier_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_altitude_journal_dossier_idx ON public.permis_altitude_journal USING btree (dossier_id);


--
-- Name: permis_corps_polygone_corps_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_corps_polygone_corps_idx ON public.permis_corps_polygone USING btree (corps_id);


--
-- Name: permis_corps_polygone_dossier_cleabs_ux; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE UNIQUE INDEX permis_corps_polygone_dossier_cleabs_ux ON public.permis_corps_polygone USING btree (dossier_id, cleabs);


--
-- Name: permis_corps_polygone_dossier_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_corps_polygone_dossier_idx ON public.permis_corps_polygone USING btree (dossier_id);


--
-- Name: permis_rattachement_candidate_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_rattachement_candidate_idx ON public.permis_rattachement USING btree (parcelle_candidate_idu);


--
-- Name: permis_rattachement_etat_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_rattachement_etat_idx ON public.permis_rattachement USING btree (etat);


--
-- Name: permis_rattachement_evenement_ratt_idx; Type: INDEX; Schema: public; Owner: macbookprom4arnaud
--

CREATE INDEX permis_rattachement_evenement_ratt_idx ON public.permis_rattachement_evenement USING btree (rattachement_id, survenu_le);


--
-- Name: permis_altitude_journal permis_altitude_journal_no_truncate; Type: TRIGGER; Schema: public; Owner: macbookprom4arnaud
--

CREATE TRIGGER permis_altitude_journal_no_truncate BEFORE TRUNCATE ON public.permis_altitude_journal FOR EACH STATEMENT EXECUTE FUNCTION public.permis_altitude_journal_append_only();


--
-- Name: permis_altitude_journal permis_altitude_journal_no_update_delete; Type: TRIGGER; Schema: public; Owner: macbookprom4arnaud
--

CREATE TRIGGER permis_altitude_journal_no_update_delete BEFORE DELETE OR UPDATE ON public.permis_altitude_journal FOR EACH ROW EXECUTE FUNCTION public.permis_altitude_journal_append_only();


--
-- Name: permis_corps_polygone permis_corps_polygone_corps_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_corps_polygone
    ADD CONSTRAINT permis_corps_polygone_corps_id_fkey FOREIGN KEY (corps_id) REFERENCES public.permis_corps_batiment(id) ON DELETE CASCADE;


--
-- Name: permis_corps_polygone permis_corps_polygone_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_corps_polygone
    ADD CONSTRAINT permis_corps_polygone_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.sitadel_dossier(id) ON DELETE CASCADE;


--
-- Name: permis_polygone_altitude permis_polygone_altitude_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_polygone_altitude
    ADD CONSTRAINT permis_polygone_altitude_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.sitadel_dossier(id) ON DELETE SET NULL;


--
-- Name: permis_rattachement permis_rattachement_dossier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement
    ADD CONSTRAINT permis_rattachement_dossier_id_fkey FOREIGN KEY (dossier_id) REFERENCES public.sitadel_dossier(id) ON DELETE CASCADE;


--
-- Name: permis_rattachement_evenement permis_rattachement_evenement_rattachement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: macbookprom4arnaud
--

ALTER TABLE ONLY public.permis_rattachement_evenement
    ADD CONSTRAINT permis_rattachement_evenement_rattachement_id_fkey FOREIGN KEY (rattachement_id) REFERENCES public.permis_rattachement(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict CQ5lhsS8U7KaNgFziI8eQlbCd02NB0VR7soRUYXPMq93Ffx5iU0JZEnCiLwQUzw

