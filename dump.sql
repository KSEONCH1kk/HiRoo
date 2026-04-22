--
-- PostgreSQL database dump
--

\restrict k1d7PhodCGjy85aJgqZo5FBcaJcmEIWvxzpYMn8qhzikpEGN3VxETwcO7PpxxyW

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
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
-- Name: channel_role_permissions; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.channel_role_permissions (
    channel_id uuid NOT NULL,
    role_id uuid NOT NULL,
    allow bigint NOT NULL,
    deny bigint NOT NULL
);


ALTER TABLE public.channel_role_permissions OWNER TO hiroo;

--
-- Name: channels; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.channels (
    id uuid NOT NULL,
    server_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(16) NOT NULL,
    "position" integer NOT NULL,
    topic character varying(1024),
    is_private boolean NOT NULL,
    slowmode_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.channels OWNER TO hiroo;

--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.direct_messages (
    id uuid NOT NULL,
    is_group boolean NOT NULL,
    name character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon_url character varying(255),
    owner_id uuid
);


ALTER TABLE public.direct_messages OWNER TO hiroo;

--
-- Name: dm_message_reactions; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.dm_message_reactions (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji character varying(32) NOT NULL
);


ALTER TABLE public.dm_message_reactions OWNER TO hiroo;

--
-- Name: dm_messages; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.dm_messages (
    id uuid NOT NULL,
    dm_id uuid NOT NULL,
    author_id uuid,
    content text NOT NULL,
    edited_at timestamp with time zone,
    is_deleted boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(16) DEFAULT 'text'::character varying NOT NULL,
    reply_to_id uuid
);


ALTER TABLE public.dm_messages OWNER TO hiroo;

--
-- Name: dm_participants; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.dm_participants (
    dm_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dm_participants OWNER TO hiroo;

--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.friend_requests (
    id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    status character varying(16) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.friend_requests OWNER TO hiroo;

--
-- Name: member_roles; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.member_roles (
    server_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


ALTER TABLE public.member_roles OWNER TO hiroo;

--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.message_reactions (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji character varying(32) NOT NULL
);


ALTER TABLE public.message_reactions OWNER TO hiroo;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.messages (
    id uuid NOT NULL,
    channel_id uuid NOT NULL,
    author_id uuid,
    content text NOT NULL,
    reply_to_id uuid,
    edited_at timestamp with time zone,
    is_deleted boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_id uuid,
    webhook_name character varying(80),
    webhook_avatar_url character varying(255),
    embeds jsonb
);


ALTER TABLE public.messages OWNER TO hiroo;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind character varying(32) NOT NULL,
    from_user_id uuid,
    server_id uuid,
    channel_id uuid,
    content text,
    is_read boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.notifications OWNER TO hiroo;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    server_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    color character varying(9) NOT NULL,
    "position" integer NOT NULL,
    permissions bigint NOT NULL,
    hoist boolean NOT NULL,
    mentionable boolean NOT NULL,
    is_everyone boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO hiroo;

--
-- Name: server_bans; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.server_bans (
    server_id uuid NOT NULL,
    user_id uuid NOT NULL,
    banned_by uuid,
    reason character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.server_bans OWNER TO hiroo;

--
-- Name: server_members; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.server_members (
    server_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(16) NOT NULL,
    nickname character varying(64),
    muted boolean NOT NULL,
    deafened boolean NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.server_members OWNER TO hiroo;

--
-- Name: servers; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.servers (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(500),
    icon_url character varying(512),
    owner_id uuid NOT NULL,
    invite_code character varying(8) NOT NULL,
    invite_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_discoverable boolean DEFAULT false NOT NULL
);


ALTER TABLE public.servers OWNER TO hiroo;

--
-- Name: users; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    username character varying(32) NOT NULL,
    hashed_password character varying(128) NOT NULL,
    display_name character varying(64),
    avatar_url character varying(512),
    status character varying(16) NOT NULL,
    custom_status character varying(128),
    is_verified boolean NOT NULL,
    is_banned boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_key character varying(128),
    signing_public_key character varying(128)
);


ALTER TABLE public.users OWNER TO hiroo;

--
-- Name: voice_states; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.voice_states (
    user_id uuid NOT NULL,
    channel_id uuid,
    server_id uuid,
    is_muted boolean NOT NULL,
    is_deafened boolean NOT NULL,
    is_sharing_screen boolean NOT NULL,
    is_video boolean NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.voice_states OWNER TO hiroo;

--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: hiroo
--

CREATE TABLE public.webhooks (
    id uuid NOT NULL,
    channel_id uuid NOT NULL,
    server_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    avatar_url character varying(255),
    token character varying(64) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.webhooks OWNER TO hiroo;

--
-- Data for Name: channel_role_permissions; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.channel_role_permissions (channel_id, role_id, allow, deny) FROM stdin;
379ab3da-a820-44a0-949a-d2a6f139ab10	551ff779-ed04-452a-bb4b-a0ebbbad15f3	4480	8192
\.


--
-- Data for Name: channels; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.channels (id, server_id, name, type, "position", topic, is_private, slowmode_seconds, created_at) FROM stdin;
102980a6-f50e-4973-b870-d85ad2ee5908	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	Главная комната	voice	1	\N	f	0	2026-04-20 14:25:26.145107+00
fa0557a0-6295-4570-964c-2fa00482a63b	237d87ec-fdc0-4dd0-b4ae-7c9e7b09d136	общий-чат	text	0	\N	f	0	2026-04-20 15:13:18.240105+00
300048aa-cdbf-4bb0-8c5a-ce235ad4d3a4	237d87ec-fdc0-4dd0-b4ae-7c9e7b09d136	Главная комната	voice	1	\N	f	0	2026-04-20 15:13:18.240105+00
3e5cd78c-0d47-4d77-9207-54f1bbef00ef	4150b413-0bdf-427f-bcb5-54f00c77de74	общий-чат	text	0	\N	f	0	2026-04-20 15:40:11.987265+00
785cd2f1-d408-426e-a7d1-dac3687edcec	4150b413-0bdf-427f-bcb5-54f00c77de74	Главная комната	voice	1	\N	f	0	2026-04-20 15:40:11.987265+00
1cf11c0f-1c05-4a4e-9518-2ae74e203e28	649ba397-f13b-4fe3-8282-eb4da4c4c3d1	общий-чат	text	0	\N	f	0	2026-04-20 16:18:29.878884+00
1a2c7d46-0a80-456d-a501-f39af087be05	649ba397-f13b-4fe3-8282-eb4da4c4c3d1	Главная комната	voice	1	\N	f	0	2026-04-20 16:18:29.878884+00
4003cd7f-ea98-4fac-86c2-17b69c7579c4	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	фцвфцв	voice	0	\N	f	0	2026-04-21 10:12:36.686161+00
379ab3da-a820-44a0-949a-d2a6f139ab10	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	общий-чат	text	2	\N	f	0	2026-04-20 14:25:26.145107+00
be6f4764-cfd7-4cb3-a658-63eeea6bdee7	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	awdawd	text	3	awdawd	f	0	2026-04-20 16:52:33.156416+00
b2016d4b-8676-4db9-97e1-01a2c3c08ddc	9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	общий-чат	text	0	\N	f	0	2026-04-21 12:20:58.785622+00
ad5432a1-3f08-4654-9d1e-94950e233676	9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	Главная комната	voice	1	\N	f	0	2026-04-21 12:20:58.785622+00
f049f484-984e-4a51-89ec-2d6285866ea4	31fa8783-3202-4f27-90cf-1673be630ddd	общий-чат	text	0	\N	f	0	2026-04-21 13:27:51.708213+00
7d39a7e2-dc00-47b3-b54b-79eca061b397	31fa8783-3202-4f27-90cf-1673be630ddd	Главная комната	voice	1	\N	f	0	2026-04-21 13:27:51.708213+00
912fbe1e-bdcd-43df-8a4d-80ce30096f60	31fa8783-3202-4f27-90cf-1673be630ddd	kidfkw	voice	0	\N	f	0	2026-04-21 13:48:02.258513+00
4b8a6215-7604-4fae-87a5-3e89e4bd40a1	649ba397-f13b-4fe3-8282-eb4da4c4c3d1	kjhb	voice	0	\N	f	0	2026-04-21 17:11:15.220474+00
\.


--
-- Data for Name: direct_messages; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.direct_messages (id, is_group, name, created_at, updated_at, icon_url, owner_id) FROM stdin;
41ca9023-4947-4f3d-9a48-e79e0dc643c7	f	\N	2026-04-21 12:19:35.867742+00	2026-04-21 12:43:49.880864+00	\N	\N
ccffdf3d-a52c-4420-bfac-3dc9bad9605a	f	\N	2026-04-20 14:55:02.957939+00	2026-04-20 15:01:06.589804+00	\N	\N
09f7f0bc-b801-4b3d-961e-92d87355182d	f	\N	2026-04-20 15:03:55.202023+00	2026-04-20 15:04:23.388816+00	\N	\N
714b7876-4ee0-4fa7-9344-d907e64899df	f	\N	2026-04-21 12:44:06.023994+00	2026-04-21 12:44:52.181776+00	\N	\N
0739e0f6-4825-43ae-b357-07f9163ef8b6	f	\N	2026-04-21 12:47:50.037194+00	2026-04-21 12:47:53.455769+00	\N	\N
0e70e7d2-855d-470b-b352-af13e616e2c9	f	\N	2026-04-20 19:25:31.934513+00	2026-04-20 19:25:36.664594+00	\N	\N
ac6fc0aa-72d4-40ba-ace5-fb25594c71be	f	\N	2026-04-20 15:12:37.846258+00	2026-04-20 19:38:46.855217+00	\N	\N
feaf0043-5417-4527-9041-1706fdf1ef29	t	kmmkmdgrdg	2026-04-21 12:23:02.219343+00	2026-04-21 12:24:54.158709+00	\N	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a
b433adb8-3869-40b4-80f0-093d691943e4	f	\N	2026-04-21 13:25:17.701845+00	2026-04-21 15:14:51.983944+00	\N	\N
d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	t	HAILOHAY	2026-04-21 08:27:57.766337+00	2026-04-21 17:02:36.230612+00	/uploads/dm-icons/d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44.png	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a
f7dc0019-9135-4453-9e49-c354fc3bcf58	t	\N	2026-04-21 12:48:00.792515+00	2026-04-21 17:06:00.424486+00	/uploads/dm-icons/f7dc0019-9135-4453-9e49-c354fc3bcf58.jpg	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a
950e0c16-0661-46d6-b81d-c16a945733ef	f	\N	2026-04-20 15:34:30.325793+00	2026-04-21 17:37:56.281821+00	\N	\N
21748b28-33d3-44b5-8c0f-11485ab79b43	t	\N	2026-04-21 17:38:42.890268+00	2026-04-21 18:09:02.830122+00	\N	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a
2c3a52b2-40d9-488f-bead-ad8246bd7a8e	t	\N	2026-04-21 07:53:24.59698+00	2026-04-21 17:02:19.171572+00	\N	\N
\.


--
-- Data for Name: dm_message_reactions; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.dm_message_reactions (message_id, user_id, emoji) FROM stdin;
8be21e72-0f24-4ceb-9e04-20a5b42b5d5c	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	🔥
8be21e72-0f24-4ceb-9e04-20a5b42b5d5c	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	🔥
b95474e2-722b-4907-a8fb-7faad2eda024	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	👍
b95474e2-722b-4907-a8fb-7faad2eda024	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	❤️
b95474e2-722b-4907-a8fb-7faad2eda024	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😂
\.


--
-- Data for Name: dm_messages; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.dm_messages (id, dm_id, author_id, content, edited_at, is_deleted, created_at, type, reply_to_id) FROM stdin;
40e26249-01b1-4311-b93e-ff7a8a2076c4	ccffdf3d-a52c-4420-bfac-3dc9bad9605a	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ку	\N	f	2026-04-20 15:01:06.54986+00	text	\N
bd4e732f-6fe7-46ef-b217-3ae15bf68846	09f7f0bc-b801-4b3d-961e-92d87355182d	bea76aa0-7466-4749-aaa1-207916b005ce	ку	\N	f	2026-04-20 15:03:58.246963+00	text	\N
fc460275-1819-419a-8c84-71c357cd6d15	09f7f0bc-b801-4b3d-961e-92d87355182d	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	123	\N	f	2026-04-20 15:04:08.088795+00	text	\N
b51f04d0-050c-4351-934b-79ea990ebf7d	09f7f0bc-b801-4b3d-961e-92d87355182d	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	123	\N	f	2026-04-20 15:04:23.3834+00	text	\N
8d60d5df-a2dc-44fd-99b1-960e83486618	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ку	\N	f	2026-04-20 15:12:40.156201+00	text	\N
fec6b08a-0069-4cc5-bac7-65374992a5cb	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	ку	\N	f	2026-04-20 15:12:45.078028+00	text	\N
bbcd1e0b-0d02-4df0-8775-d852da65cdd2	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	как дела	\N	f	2026-04-20 15:12:47.160593+00	text	\N
c451ff32-0c7a-4926-85c9-e9feb0c76376	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	njlnl	\N	f	2026-04-20 15:20:29.094661+00	text	\N
b957e42f-027f-4790-92f5-82f61b77ab12	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	куку	\N	f	2026-04-20 15:28:11.611155+00	text	\N
23373131-9623-4d87-99ad-946173914712	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	УРА	\N	f	2026-04-20 15:28:14.653326+00	text	\N
120dba9b-5a10-4a7f-be07-3fd435fd89c7	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	оно робит	\N	f	2026-04-20 15:28:17.892164+00	text	\N
68b0030d-d10c-4b76-bfac-84029a66d9d4	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	сосат	\N	f	2026-04-20 15:28:23.458452+00	text	\N
0804925e-2ec1-4dd3-9d63-8273a86a8d70	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	hello	\N	f	2026-04-20 15:34:39.062769+00	text	\N
7ccc520f-817a-405a-a738-db9796d53ad5	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	сосал?	\N	f	2026-04-20 15:34:42.647376+00	text	\N
507619b8-4a71-4dec-8060-002a78715594	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	YEEEES	\N	f	2026-04-20 15:34:49.75997+00	text	\N
df217223-9956-45cc-9200-707640c337d5	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😊😊	\N	f	2026-04-20 15:34:56.55642+00	text	\N
87f4e666-5b39-4331-98d3-6b2f3e309329	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	фцвфцв	\N	f	2026-04-20 15:36:23.489593+00	text	\N
5afeff53-005f-40a1-b7c0-edb034198cde	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	/uploads/attachments/ec1f0b77-dad7-4e1c-98ba-e52115c650d1/Снимокэкрана2026-04-06175204-669836c65e7b.png	\N	f	2026-04-20 16:18:03.951148+00	text	\N
436ebc40-c864-4d1a-9f8a-0281eee40595	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ХАЮХАЙ	\N	f	2026-04-20 16:30:56.447828+00	text	\N
b39e3485-fcca-4662-a593-514f2fc2bb76	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	hello creator	\N	f	2026-04-20 16:35:08.571549+00	text	\N
feedc42b-e187-4d98-af80-f9a013dba6d7	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	hftyghfghjuguigyuiflrtysd5etyrtysd	\N	f	2026-04-20 16:50:41.031691+00	text	\N
43b57869-9aaf-469f-84b3-d556996c7cf6	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	http://77.90.33.108/invite/bHS5E5Qy	\N	f	2026-04-20 16:50:57.94257+00	text	\N
ad7a83a4-f76b-4f77-a30a-7f0b16ad3601	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	,	\N	f	2026-04-20 17:39:57.063492+00	text	\N
8be21e72-0f24-4ceb-9e04-20a5b42b5d5c	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	💗💙💜🖤🤍🤎💕💞💓❣️💔	\N	f	2026-04-20 17:41:15.036578+00	text	\N
13ce4e4a-8921-4a7f-b9b5-54d526791189	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/backrooms__level_0__floorplan__wip__by_bitstruct0r_dhl28px-375w-2x-7a3f676ba218.png	2026-04-20 18:22:06.045111+00	f	2026-04-20 16:15:30.48519+00	text	\N
32c9362f-8c40-402d-996f-1ed95741908d	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	123213	\N	f	2026-04-20 18:56:22.888782+00	text	\N
a0291a35-fe1f-4b31-a6e8-06808f4cb28a	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	f	2026-04-20 18:56:31.648505+00	text	\N
41769564-739b-4573-840d-696ea72c814f	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	awfawf	\N	f	2026-04-20 19:05:59.737262+00	text	\N
46215c90-5c51-41f0-8e5e-56fcc119961c	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdwad	\N	f	2026-04-20 19:06:13.322477+00	text	\N
ed1027b6-65fd-4a7d-bc7a-2b14138c0e84	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	СТААААС	\N	f	2026-04-20 19:22:46.413011+00	text	\N
2e453567-0b31-44aa-a470-7d75fe4e70a0	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	ОТВЕТЬ	\N	f	2026-04-20 19:22:49.286089+00	text	\N
50cba7ad-fa7a-4bd3-be5b-10b8d65de8b3	0e70e7d2-855d-470b-b352-af13e616e2c9	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	пр	\N	f	2026-04-20 19:25:36.658736+00	text	\N
10b2e109-1c9c-4c57-81b7-ae97cf4d3354	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	чё	\N	f	2026-04-20 19:31:16.840587+00	text	\N
5d5b5f03-b6f1-4e12-9ae5-9b6590b5fc42	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	цфвфцвфцв	\N	f	2026-04-20 19:33:02.196311+00	text	\N
db0db0b8-8767-4db8-9ce1-caf295d5743d	ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	awd	\N	f	2026-04-20 19:38:46.827398+00	text	\N
5d6ab56b-c692-44d0-9575-54ad9638c4de	950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	kf	\N	f	2026-04-20 21:01:28.488603+00	text	\N
91980f2a-b4f6-4daf-bfa0-ebee5c7b96c3	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ТОСТЕРо	2026-04-21 07:35:03.67088+00	f	2026-04-20 16:30:54.595017+00	text	\N
a7322697-0f0a-4b4c-a8f2-ffe70d4603ea	2c3a52b2-40d9-488f-bead-ad8246bd7a8e	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	q	\N	f	2026-04-21 07:53:56.984252+00	text	\N
524d35ac-a284-4eeb-a075-9af9f4e0c78b	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	[deleted]	\N	t	2026-04-21 10:15:48.256727+00	text	\N
62457153-7b4c-4509-bfba-bf614a3a006d	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/ru-e1997ee7b1a7.yml	\N	f	2026-04-21 10:16:43.324605+00	text	\N
7b31c96a-ce92-431f-aed5-008accfb9aec	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/14204294_1920_1080_25fps-aa43b5fbe632.mp4	\N	f	2026-04-21 10:18:23.263225+00	text	\N
34a462ab-cd42-42d9-885f-05d645581eef	2c3a52b2-40d9-488f-bead-ad8246bd7a8e	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	кууу	2026-04-21 07:55:34.152386+00	f	2026-04-21 07:53:31.944584+00	text	\N
de0e0de5-72d2-4d63-93f3-220fedf04e3f	2c3a52b2-40d9-488f-bead-ad8246bd7a8e	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	фцвфцв	\N	f	2026-04-21 07:57:25.922025+00	text	\N
27b0d8bb-b879-43aa-82f8-83e715f13685	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	КУКУКУ123123	2026-04-21 08:28:40.564639+00	f	2026-04-21 08:28:36.750507+00	text	\N
ee345c8a-f744-4410-848c-16266d31af75	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	6	\N	f	2026-04-21 08:27:29.287497+00	call_log	\N
f1dca379-b5e9-40e9-a90b-b53a1a2df1e2	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	окак	\N	f	2026-04-21 08:29:04.348523+00	text	\N
d5b700b9-8618-4f12-b78d-1d638a0a1d89	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	123	\N	f	2026-04-21 08:29:16.848339+00	text	\N
e4afbb3c-c5f6-4c07-8926-47938b3c8413	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@qqq окак	\N	f	2026-04-21 09:06:33.32225+00	text	d5b700b9-8618-4f12-b78d-1d638a0a1d89
1386af7c-0843-4fb2-94b9-32d11898eb0b	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@everyone	\N	f	2026-04-21 09:06:47.785238+00	text	\N
b0e67de3-9bd5-4870-9e3c-1646e2d49073	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@qqq окак	\N	f	2026-04-21 09:06:58.522646+00	text	\N
0490993c-fe8c-4776-8251-850a07e7010b	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	66	\N	f	2026-04-21 09:07:06.828828+00	call_log	\N
8f115477-9ab0-4314-b06b-a86f0afb1f16	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	шоьщ	\N	f	2026-04-21 09:08:32.718489+00	text	27b0d8bb-b879-43aa-82f8-83e715f13685
06fcdb4a-a563-4ec3-a582-9a33df23360a	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://youtube.com/	\N	f	2026-04-21 09:32:51.437315+00	text	\N
51307086-dbf0-4167-a084-d01b5a8ddcd1	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://hiroo.intave.tech/invite/ixHhAAwz	\N	f	2026-04-21 09:33:18.386088+00	text	\N
e5dcd748-a9a9-4490-b365-aed1f80e3cc0	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	```print("Hello World!")```	\N	f	2026-04-21 10:09:19.751682+00	text	\N
a832b70e-f7b9-439d-aa39-ee9979a5cded	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	f	2026-04-21 10:09:35.44451+00	text	\N
7fcbdf08-6883-40ad-93fd-28145e392441	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	__ahfw__	\N	f	2026-04-21 10:09:43.665107+00	text	\N
1d370be0-8714-44e8-af76-89cf6741785f	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/call-8f94452c298d.mp3	\N	f	2026-04-21 10:15:12.139552+00	text	\N
c14beb10-fcb1-46df-8e25-408fa305bc8e	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@kseonyt uhu	\N	f	2026-04-21 10:18:57.632721+00	text	7b31c96a-ce92-431f-aed5-008accfb9aec
84d8ae7c-f789-4c01-b7b9-3ee786d50880	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	8	\N	f	2026-04-21 12:07:58.929728+00	call_log	\N
521785c6-f9e2-4638-8fc0-eaa911297673	d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	0	\N	f	2026-04-21 12:09:30.475362+00	call_log	\N
4bf199ec-7ebc-41ea-8ecc-76d0a374bfc4	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	123	\N	f	2026-04-21 12:19:37.104151+00	text	\N
d4d20aca-afd0-46c6-a0fd-372d73cc1680	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	а откуда звук этот	\N	f	2026-04-21 12:19:44.692522+00	text	\N
af408b4d-9ca4-4c8e-aabd-269fcd16e357	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	я забыл	\N	f	2026-04-21 12:19:46.482764+00	text	\N
a055728c-0cd3-4a06-81f9-f33a7cfd2ac7	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	уведов	\N	f	2026-04-21 12:19:49.37195+00	text	\N
d7b4d412-18c3-47db-8af7-bb06860a95fa	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@sp0ff	\N	f	2026-04-21 12:20:05.397795+00	text	\N
b1b4719d-338b-4249-8f49-0316c687ddbb	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	__pop__	\N	f	2026-04-21 12:20:13.542265+00	text	\N
7cfb5c00-aec9-449c-98b4-785c5244b33c	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	30	\N	f	2026-04-21 12:20:19.308299+00	call_log	\N
87e6e754-b6ce-41f9-ba18-c1b5ecc7dbd6	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://hiroo.intave.tech/invite/Rpbk0w48	\N	f	2026-04-21 12:21:07.68247+00	text	\N
db319005-c3ad-4a62-91e6-ae3266c66187	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	абоба	\N	f	2026-04-21 12:23:22.923119+00	text	\N
4b4c9a5a-2d59-4f9f-beb6-e77c433f26b5	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	https://www.youtube.com/watch?v=L_yEFrMxmhA	\N	f	2026-04-21 12:24:30.698375+00	text	\N
c3d4f934-bd54-4633-bc3b-b32faf2a7999	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	а ты для себя или планируешь сюда людей заводить	\N	f	2026-04-21 12:25:54.800853+00	text	\N
20eadb99-041c-4461-8ec5-c31863a07a69	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	d	\N	f	2026-04-21 12:26:43.639145+00	text	\N
88b8d7a1-7c68-417c-937a-16844f8e1672	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn	\N	f	2026-04-21 12:27:14.520686+00	text	\N
46258a8a-05d6-411f-ba17-78d2b5490a2f	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	qqq это твой твин?	\N	f	2026-04-21 12:21:09.137471+00	text	\N
2c944736-1f5e-4ca0-b0cb-2aee336f0b20	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	будешь такую штуку как в дсе делать с градиентом ролей?	\N	f	2026-04-21 12:21:53.512585+00	text	\N
9e1e9db5-2503-46a9-9cc7-bec4867a4fc9	feaf0043-5417-4527-9041-1706fdf1ef29	31b7ed2e-fefb-4e41-8925-7813f9b63de6	d	\N	f	2026-04-21 12:23:12.777764+00	text	\N
92590210-a221-4cd6-b527-2dc0778f96c5	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	f,j,f	\N	f	2026-04-21 12:23:13.414626+00	text	\N
57d86e7f-ef4f-498d-9a9a-5639067ff3ae	feaf0043-5417-4527-9041-1706fdf1ef29	31b7ed2e-fefb-4e41-8925-7813f9b63de6	да	\N	f	2026-04-21 12:23:14.401674+00	text	\N
1a14ab97-c5a7-4679-8930-558e8bd550bd	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	f,j,f	\N	f	2026-04-21 12:23:15.294861+00	text	\N
4413cc01-926d-484a-8d7e-4bd1a7175bb1	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://discord.com/	\N	f	2026-04-21 12:23:29.246165+00	text	\N
1a163092-55a0-4f19-9cb6-3ae58caa693e	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://youtube.com/	\N	f	2026-04-21 12:23:42.56422+00	text	\N
49d81181-7ead-471d-a465-b95307233a62	feaf0043-5417-4527-9041-1706fdf1ef29	31b7ed2e-fefb-4e41-8925-7813f9b63de6	блин лоадер дельты ошибка загрузки	\N	f	2026-04-21 12:23:48.546591+00	text	\N
dde0cdae-9aac-4c56-bd1a-c1eb18b6c6cc	feaf0043-5417-4527-9041-1706fdf1ef29	31b7ed2e-fefb-4e41-8925-7813f9b63de6	хотел кинуть сюда	\N	f	2026-04-21 12:23:55.710517+00	text	\N
e3a92a7c-c119-488e-9606-d22c0122f67a	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/14204294_1920_1080_25fps-55ea3c5511de.mp4	\N	f	2026-04-21 12:24:03.656502+00	text	\N
79cf8b2a-86b5-4108-9a80-78da3d0428d4	feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/wormax_asset_3-1838a090d2cf.png	\N	f	2026-04-21 12:24:28.120468+00	text	\N
a7a52399-0217-4828-8a38-1fe501594d89	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	@sp0ff ??	\N	f	2026-04-21 12:25:26.075733+00	text	2c944736-1f5e-4ca0-b0cb-2aee336f0b20
45558842-fd1b-46ae-bbc7-fd2077928a45	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	а че если сообщение большое не присылается?	\N	f	2026-04-21 12:26:51.947087+00	text	\N
889db790-6e7b-40de-b2b2-24cc2964508e	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	кстати	\N	f	2026-04-21 12:27:00.938614+00	text	\N
14b8cc0c-ca29-4c8f-9a1a-b75e5c94b208	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	в дс есть фича	\N	f	2026-04-21 12:27:03.57225+00	text	\N
7e00975a-5402-4d77-a51e-82a4b4386587	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	что если большой текст то можно в .txt автоматически скинуть	\N	f	2026-04-21 12:27:13.90098+00	text	\N
49cda78c-aba5-4140-8756-04f6957a4c9f	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	или предпросмотр сделать	\N	f	2026-04-21 12:27:19.794226+00	text	\N
56d0e704-d036-44b8-9d84-7af9143c313a	41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	да, я кфг даркнесса скинул	\N	f	2026-04-21 12:27:28.35064+00	text	\N
7109cbef-3257-4935-8f3b-ddb72955bc34	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/message-31e66ea09420.txt	\N	f	2026-04-21 12:43:08.024401+00	text	\N
cc92ddff-4081-49fc-bd27-c4bf5d6ee0b4	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ывщоащзывлащулыщзалыущауыулахыузхзлщхыулахщылуащхлыуалхыхулщааааааааааааааааааааааааааааааааааааааааааывщоащзывлащулыщзалыущауыулахыузхзлщхыулахщылуащхлыуалхыхулщааааааааааааааааааааааааааааааааааааааааааывщоащзывлащулыщзалыущауыулахыузхзлщхыулахщылуащхлыуалхыхулщааааааааааааааааааааааааааааааааааааааааааывщоащзывлащулыщзалыущауыулахыузхзлщхыулахщылуащхлыуалхыхулщааааааааааааааааааааааааааааааааааааааааааывщоащзывлащулыщзалыущауыулахыузхзлщхыулахщылуащхлыуалхыхулщааааааааааааааааааааааааа	\N	f	2026-04-21 12:43:39.854454+00	text	\N
869104f4-27b8-4c87-8f4d-af0d2cf7c80d	41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/message-cf51aafb3ac9.txt	\N	f	2026-04-21 12:43:49.859475+00	text	\N
28161887-128e-49f3-8de3-c51a53dbe9c6	714b7876-4ee0-4fa7-9344-d907e64899df	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	морон	\N	f	2026-04-21 12:44:10.511648+00	text	\N
2340ef6a-ac60-40dc-9c68-b1cc5998d109	714b7876-4ee0-4fa7-9344-d907e64899df	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ворон	\N	f	2026-04-21 12:44:16.461588+00	text	\N
b95474e2-722b-4907-a8fb-7faad2eda024	714b7876-4ee0-4fa7-9344-d907e64899df	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/14204294_1920_1080_25fps-4f08d6d81490.mp4	\N	f	2026-04-21 12:44:30.742683+00	text	\N
837739cf-a3cf-4216-addc-8e5c58c52007	714b7876-4ee0-4fa7-9344-d907e64899df	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/backrooms__level_0__floorplan__wip__by_bitstruct0r_dhl28px-375w-2x-8253e50b4a1a.png	\N	f	2026-04-21 12:44:52.174629+00	text	\N
1dfc1cc8-cacb-47bc-8dd7-02c25851f472	0739e0f6-4825-43ae-b357-07f9163ef8b6	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	сосо	\N	f	2026-04-21 12:47:53.441357+00	text	\N
3144fa51-3376-424d-85e4-f8ac1fb41a26	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😀	\N	f	2026-04-21 12:48:08.652308+00	text	\N
0dcdfffc-9b9a-4e1e-889c-75dfb6587198	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	19	\N	f	2026-04-21 12:48:48.537544+00	call_log	\N
0e8b4e9b-1685-44b5-92ee-042e52b10be9	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://hiroo.intave.tech/invite/ixHhAAwz	\N	f	2026-04-21 12:50:10.032658+00	text	\N
aa09ee2a-c06d-4c0e-a19e-429784466086	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	моран	\N	f	2026-04-21 12:56:17.730626+00	text	\N
3b4bc5ef-bd85-4609-a993-ca95d02a3e06	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	792	\N	f	2026-04-21 12:50:17.05996+00	call_log	\N
e266f6f1-9db5-4406-8ccd-8923418a116b	f7dc0019-9135-4453-9e49-c354fc3bcf58	d6028015-8931-404c-a814-b0bf65ff524c	279	\N	f	2026-04-21 13:10:31.883898+00	call_log	\N
04188e8b-94ae-40f3-9daf-b6b3a8410289	f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	12	\N	f	2026-04-21 13:15:15.344063+00	call_log	\N
2034ec7a-0d75-493e-bd3e-bf1dc1dadc7b	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	123	\N	f	2026-04-21 13:25:24.665898+00	text	\N
1524bc37-a8b9-4747-b356-ae8c4871c550	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	привет	\N	f	2026-04-21 13:25:24.902406+00	text	\N
582b7065-a97e-4458-8e78-5cbfcd178b0f	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	107	\N	f	2026-04-21 13:25:30.64824+00	call_log	\N
c0081fb5-880d-4ef3-a96f-184d811f21b7	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	156	\N	f	2026-04-21 13:27:21.059954+00	call_log	\N
ca78e159-67e4-4161-9840-94d997fc2b35	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	31	\N	f	2026-04-21 13:30:00.31482+00	call_log	\N
971995e9-2e80-44e9-8871-01b891f8cd75	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/14204294_1920_1080_25fps-e3c601a68541.mp4	\N	f	2026-04-21 13:31:19.210578+00	text	\N
d85025cc-6e73-4875-aa1c-3da91eb775c5	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/backrooms__level_0__floorplan__wip__by_bitstruct0r_dhl28px-375w-2x-f13df5439625.png	\N	f	2026-04-21 13:31:33.387603+00	text	\N
4be88228-d04a-4db5-be97-a780cc611b3f	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/call-e594c6988865.mp3	\N	f	2026-04-21 13:32:00.959817+00	text	\N
6a5bb117-c072-48d3-8f32-bba4186ded52	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	[deleted]	\N	t	2026-04-21 13:32:46.424647+00	text	\N
0b967103-7317-45b7-8cbf-eb7c9a7e156d	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/FakeLag-19dab15486d0.txt	\N	f	2026-04-21 13:33:23.830417+00	text	\N
1a3e2d8d-b922-4f85-ba33-1ab961f1c493	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	[deleted]	\N	t	2026-04-21 13:33:21.532284+00	text	\N
73de4c4c-e0c1-41bd-bae5-0529a1042106	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://youtube.com	\N	f	2026-04-21 13:34:24.58053+00	text	\N
ce5db7cc-24e2-4cc8-aaca-d07585182944	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:11.217175+00	text	\N
b9f7fa84-dee8-454e-97fe-55b2e608b435	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:13.114256+00	text	\N
264bb7e8-04a7-4210-bb54-6a576ca7ac31	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:13.715824+00	text	\N
77e4c69f-5fea-4b16-ba6a-588d9a6ee466	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	/uploads/attachments/b65720c7-4114-4816-87af-50ee725173af/lua-18309c979a14.txt	\N	f	2026-04-21 13:34:18.118461+00	text	\N
d06c35e3-803c-426d-92cb-93aa05e77ec5	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	/uploads/attachments/b65720c7-4114-4816-87af-50ee725173af/OnixSprintAddon-be0036d55b28.zip	\N	f	2026-04-21 13:35:07.103667+00	text	\N
035e02ab-da6e-4f41-8fa8-de81bc8eb83b	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	d	\N	f	2026-04-21 13:35:10.756615+00	text	\N
be5ead1e-59df-46fa-9040-c61b107a8d20	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:11.056086+00	text	\N
dabbdeac-833f-4878-844d-0c1e0769ceab	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	d	\N	f	2026-04-21 13:35:11.540907+00	text	\N
575f12d8-fe6b-40e9-ab6d-a743dafe0147	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:12.170954+00	text	\N
bf4b157f-b308-4194-be24-6b0043041138	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/dnSpy-net-win641-e1e98fb4c597.zip	\N	f	2026-04-21 13:35:14.064717+00	text	\N
84e2700a-0492-4c57-8bd2-67fe17087059	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/message-bda0523c128c.txt	\N	f	2026-04-21 13:37:20.621158+00	text	\N
ed83ffb3-3a8d-470f-9d62-5ae68502abe2	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	https://www.youtube.com/watch?v=chTXF5Qi4KA	\N	f	2026-04-21 13:34:35.908894+00	text	\N
b36c7ba3-80a3-40de-8069-c64b3ecbe760	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	;d	\N	f	2026-04-21 13:35:10.46558+00	text	\N
b744a72a-3431-4da0-959e-44e2a6ff9f9d	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:11.873827+00	text	\N
b47fafdc-b7d1-49e5-9fa7-db0b410b46c7	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:12.456023+00	text	\N
b6e7c917-e080-4e7e-9ceb-d0d4ca86d6bb	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	dd	\N	f	2026-04-21 13:35:12.83514+00	text	\N
84d5b78f-6720-4449-abbf-d590ad48f78a	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	/uploads/attachments/b65720c7-4114-4816-87af-50ee725173af/Анти-реклама-15c83f172626.yml	\N	f	2026-04-21 13:34:38.819505+00	text	\N
77e5b10f-45bf-4f55-be2d-eb9b333a159c	b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	409	\N	f	2026-04-21 13:30:38.687812+00	call_log	\N
6369c642-87ed-42ac-8f16-f849b3047bf6	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	31	\N	f	2026-04-21 13:37:42.77185+00	call_log	\N
2f7fd221-c39a-4f43-ad70-0ba480d55a0f	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	Ура, Я почти сделал адаптацию для телефонов	\N	f	2026-04-21 15:06:01.399376+00	text	\N
388b4b77-376a-4451-93ac-5fc7bf128c00	b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	/uploads/attachments/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a/message-a7d27201ca59.txt	\N	f	2026-04-21 15:14:51.962+00	text	\N
9a3e102d-5e32-4ed2-956f-4dc29395b860	f7dc0019-9135-4453-9e49-c354fc3bcf58	d6028015-8931-404c-a814-b0bf65ff524c	17	\N	f	2026-04-21 16:22:49.457687+00	call_log	\N
2a208eb2-b997-45b8-99a7-afe5f51eb714	f7dc0019-9135-4453-9e49-c354fc3bcf58	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	10	\N	f	2026-04-21 17:06:00.424486+00	call_log	\N
f06b62b9-c055-414d-a2ac-aceff919e106	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😍😍😎😎	\N	f	2026-04-21 17:14:34.71711+00	text	\N
2f8bf0e0-e59e-46e5-917b-e900d9a70864	950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	60	\N	f	2026-04-21 17:37:56.281821+00	call_log	\N
9a7c8cc0-541d-4038-a147-e67ac980beb4	21748b28-33d3-44b5-8c0f-11485ab79b43	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	125	\N	f	2026-04-21 17:38:56.480275+00	call_log	\N
58c5c507-8463-41f0-8515-c2809ae1d839	21748b28-33d3-44b5-8c0f-11485ab79b43	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	168	\N	f	2026-04-21 17:56:00.207585+00	call_log	\N
2ee23a25-ca6e-40ce-96ea-74a3dce28146	21748b28-33d3-44b5-8c0f-11485ab79b43	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	527	\N	f	2026-04-21 17:58:51.435526+00	call_log	\N
1c00bb99-3c7d-488f-8e58-d97e9a40e486	21748b28-33d3-44b5-8c0f-11485ab79b43	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	43	\N	f	2026-04-21 18:09:02.830122+00	call_log	\N
\.


--
-- Data for Name: dm_participants; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.dm_participants (dm_id, user_id, last_read_at, joined_at) FROM stdin;
ccffdf3d-a52c-4420-bfac-3dc9bad9605a	445ff097-29ef-4e62-9156-6b0602913e0d	\N	2026-04-20 14:55:02.957939+00
ccffdf3d-a52c-4420-bfac-3dc9bad9605a	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-20 14:55:02.957939+00
09f7f0bc-b801-4b3d-961e-92d87355182d	bea76aa0-7466-4749-aaa1-207916b005ce	\N	2026-04-20 15:03:55.202023+00
09f7f0bc-b801-4b3d-961e-92d87355182d	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-20 15:03:55.202023+00
ac6fc0aa-72d4-40ba-ace5-fb25594c71be	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-20 15:12:37.846258+00
ac6fc0aa-72d4-40ba-ace5-fb25594c71be	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	\N	2026-04-20 15:12:37.846258+00
950e0c16-0661-46d6-b81d-c16a945733ef	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	2026-04-20 15:34:30.325793+00
950e0c16-0661-46d6-b81d-c16a945733ef	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-20 15:34:30.325793+00
0e70e7d2-855d-470b-b352-af13e616e2c9	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	2026-04-20 19:25:31.934513+00
0e70e7d2-855d-470b-b352-af13e616e2c9	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	\N	2026-04-20 19:25:31.934513+00
d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 08:27:57.766337+00
d6d81ed7-8f4a-4f3c-8e60-a5d2ba2ead44	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	\N	2026-04-21 08:27:57.766337+00
41ca9023-4947-4f3d-9a48-e79e0dc643c7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 12:19:35.867742+00
41ca9023-4947-4f3d-9a48-e79e0dc643c7	31b7ed2e-fefb-4e41-8925-7813f9b63de6	\N	2026-04-21 12:19:35.867742+00
feaf0043-5417-4527-9041-1706fdf1ef29	445ff097-29ef-4e62-9156-6b0602913e0d	\N	2026-04-21 12:23:02.219343+00
feaf0043-5417-4527-9041-1706fdf1ef29	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 12:23:02.219343+00
feaf0043-5417-4527-9041-1706fdf1ef29	31b7ed2e-fefb-4e41-8925-7813f9b63de6	\N	2026-04-21 12:23:02.219343+00
714b7876-4ee0-4fa7-9344-d907e64899df	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 12:44:06.023994+00
714b7876-4ee0-4fa7-9344-d907e64899df	8339c7cd-799d-4436-a431-b3b18e987d59	\N	2026-04-21 12:44:06.023994+00
0739e0f6-4825-43ae-b357-07f9163ef8b6	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 12:47:50.037194+00
0739e0f6-4825-43ae-b357-07f9163ef8b6	d6028015-8931-404c-a814-b0bf65ff524c	\N	2026-04-21 12:47:50.037194+00
f7dc0019-9135-4453-9e49-c354fc3bcf58	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	2026-04-21 12:48:00.792515+00
f7dc0019-9135-4453-9e49-c354fc3bcf58	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 12:48:00.792515+00
f7dc0019-9135-4453-9e49-c354fc3bcf58	8339c7cd-799d-4436-a431-b3b18e987d59	\N	2026-04-21 12:48:00.792515+00
f7dc0019-9135-4453-9e49-c354fc3bcf58	d6028015-8931-404c-a814-b0bf65ff524c	\N	2026-04-21 12:48:00.792515+00
b433adb8-3869-40b4-80f0-093d691943e4	b65720c7-4114-4816-87af-50ee725173af	\N	2026-04-21 13:25:17.701845+00
b433adb8-3869-40b4-80f0-093d691943e4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 13:25:17.701845+00
21748b28-33d3-44b5-8c0f-11485ab79b43	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	2026-04-21 17:38:42.890268+00
21748b28-33d3-44b5-8c0f-11485ab79b43	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	2026-04-21 17:38:42.890268+00
21748b28-33d3-44b5-8c0f-11485ab79b43	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	\N	2026-04-21 17:38:42.890268+00
\.


--
-- Data for Name: friend_requests; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.friend_requests (id, from_user_id, to_user_id, status, created_at, updated_at) FROM stdin;
f2066790-2bb0-4332-bec0-532d0df26449	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	445ff097-29ef-4e62-9156-6b0602913e0d	accepted	2026-04-20 14:21:31.11319+00	2026-04-20 14:21:37.275457+00
730ffd48-4709-4dd6-afc0-49e041d0795f	bea76aa0-7466-4749-aaa1-207916b005ce	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-20 15:03:40.875541+00	2026-04-20 15:03:48.190067+00
13b1ed69-aa8c-48cf-a77f-c35f86872276	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-20 15:12:29.189279+00	2026-04-20 15:12:33.609224+00
565ccc7b-5444-4eed-a006-657586d2dc36	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-20 15:31:26.470241+00	2026-04-20 15:34:17.930176+00
715cb541-bcfa-4b59-ac82-5473c1c35ae1	31b7ed2e-fefb-4e41-8925-7813f9b63de6	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-21 12:18:57.811281+00	2026-04-21 12:19:22.134874+00
0ac57c9c-fb64-4d1d-8d86-83bf8576ee07	8339c7cd-799d-4436-a431-b3b18e987d59	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-21 12:43:54.223728+00	2026-04-21 12:44:00.448055+00
5ba25790-75db-4442-8a9f-075846a51676	d6028015-8931-404c-a814-b0bf65ff524c	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	accepted	2026-04-21 12:47:42.724193+00	2026-04-21 12:47:44.93811+00
df48a661-b5b9-4c1e-8751-a455a4eab125	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	b65720c7-4114-4816-87af-50ee725173af	accepted	2026-04-21 13:25:05.087979+00	2026-04-21 13:25:11.317835+00
fafe5c24-a337-4122-8709-7f1775ad0136	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	d6028015-8931-404c-a814-b0bf65ff524c	pending	2026-04-21 17:07:18.125771+00	2026-04-21 17:07:18.125771+00
\.


--
-- Data for Name: member_roles; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.member_roles (server_id, user_id, role_id) FROM stdin;
649ba397-f13b-4fe3-8282-eb4da4c4c3d1	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	df5751dc-0b7b-427f-8f62-778bdb73bb44
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	551ff779-ed04-452a-bb4b-a0ebbbad15f3
9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	31b7ed2e-fefb-4e41-8925-7813f9b63de6	b2ee6010-9b5f-4880-99c3-f82861cad3fd
31fa8783-3202-4f27-90cf-1673be630ddd	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	29274b0c-d3bf-4583-afe5-6bea043cfb1f
31fa8783-3202-4f27-90cf-1673be630ddd	31b7ed2e-fefb-4e41-8925-7813f9b63de6	e542a81e-927d-4da5-9e9b-3e2536211144
\.


--
-- Data for Name: message_reactions; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.message_reactions (message_id, user_id, emoji) FROM stdin;
a68fdb65-f4ad-4b67-b486-c5f547100d09	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	😢
a68fdb65-f4ad-4b67-b486-c5f547100d09	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	🔥
a68fdb65-f4ad-4b67-b486-c5f547100d09	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	😂
a68fdb65-f4ad-4b67-b486-c5f547100d09	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	😧
dc731807-9ef2-4e5b-9815-5f4630096db7	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	🔥
a68fdb65-f4ad-4b67-b486-c5f547100d09	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	🔥
a68fdb65-f4ad-4b67-b486-c5f547100d09	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😢
a68fdb65-f4ad-4b67-b486-c5f547100d09	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😂
a68fdb65-f4ad-4b67-b486-c5f547100d09	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😧
a68fdb65-f4ad-4b67-b486-c5f547100d09	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	❤️
c71afc8d-65b1-4dc3-b500-12ec24c20895	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	🤯
0c9211db-8fe4-4dc3-8948-ee685a8a10c9	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😮
a68fdb65-f4ad-4b67-b486-c5f547100d09	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	❤️
2128149a-dcca-477c-97e7-101f10ca1d45	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	❤️
2128149a-dcca-477c-97e7-101f10ca1d45	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	👍
4641540a-063b-4c1a-b177-d07ab10a4882	31b7ed2e-fefb-4e41-8925-7813f9b63de6	😂
68aaee41-3318-45de-b60d-2537cd301e6d	b65720c7-4114-4816-87af-50ee725173af	❤️
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.messages (id, channel_id, author_id, content, reply_to_id, edited_at, is_deleted, created_at, webhook_id, webhook_name, webhook_avatar_url, embeds) FROM stdin;
d433e977-497c-4865-90a2-9a187a2751dc	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	trfhtfh	\N	\N	f	2026-04-20 16:51:34.496295+00	\N	\N	\N	\N
0566d188-f5fe-430d-b43f-8da68be1316b	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	fthfth	\N	\N	f	2026-04-20 16:51:36.611818+00	\N	\N	\N	\N
ddbe9c95-d9f6-471a-9301-e17a51e6fd8b	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	d	\N	\N	f	2026-04-20 16:51:38.337444+00	\N	\N	\N	\N
ccb82eb4-c4d3-4985-a8da-67d9abb575fd	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	d	\N	\N	f	2026-04-20 16:51:39.022049+00	\N	\N	\N	\N
a50f41d0-3348-4351-ad73-5f425d106218	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	d	\N	\N	f	2026-04-20 16:51:39.78314+00	\N	\N	\N	\N
96086e0c-86d6-4d51-b109-660189da9e59	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	f	\N	\N	f	2026-04-20 16:51:48.193621+00	\N	\N	\N	\N
039fbc8c-b38a-4faa-8106-157c25e697b5	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	nmh	\N	\N	f	2026-04-20 16:51:52.827811+00	\N	\N	\N	\N
5b627963-10ac-42db-a0f8-66a9b9193095	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	;j	\N	\N	f	2026-04-20 16:51:54.01587+00	\N	\N	\N	\N
097cedf0-ba82-44a8-8066-626c5f4b226c	be6f4764-cfd7-4cb3-a658-63eeea6bdee7	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	geg	\N	\N	f	2026-04-20 16:52:46.889561+00	\N	\N	\N	\N
a2ee4c3c-14e7-4800-9a8f-834ec7780999	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	sadawd	\N	\N	f	2026-04-20 17:13:27.539119+00	\N	\N	\N	\N
a68fdb65-f4ad-4b67-b486-c5f547100d09	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	\N	f	2026-04-20 17:13:28.555003+00	\N	\N	\N	\N
6cfb2c35-12c5-4ff2-901b-babb2bac956f	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	http://77.90.33.108/invite/w5CPddY4	\N	\N	f	2026-04-20 17:20:57.930502+00	\N	\N	\N	\N
cf8a540c-653e-4eb5-a2fb-42dee87ef913	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawdawdawdawd	\N	2026-04-20 17:22:24.330826+00	f	2026-04-20 17:22:21.227724+00	\N	\N	\N	\N
25b11a81-bc5f-4d6d-9e82-43237f653b7c	1cf11c0f-1c05-4a4e-9518-2ae74e203e28	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	edsflojsfokeof	\N	\N	f	2026-04-20 17:23:40.859222+00	\N	\N	\N	\N
cf209bac-021e-454b-9cc7-8373a58fee0b	1cf11c0f-1c05-4a4e-9518-2ae74e203e28	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	riodsjgiojdfa	\N	\N	f	2026-04-20 17:23:41.498094+00	\N	\N	\N	\N
18aa01b9-8e2c-4b92-9ccc-3a0a203f8096	1cf11c0f-1c05-4a4e-9518-2ae74e203e28	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	irjhdifgjdh	\N	\N	f	2026-04-20 17:23:42.223273+00	\N	\N	\N	\N
303ab114-a527-412f-b971-37d45b386a6c	1cf11c0f-1c05-4a4e-9518-2ae74e203e28	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	iojdrgikrdg	\N	\N	f	2026-04-20 17:23:43.039203+00	\N	\N	\N	\N
2c19315d-c090-4055-94b8-04eaeb05ef90	1cf11c0f-1c05-4a4e-9518-2ae74e203e28	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awd	\N	\N	f	2026-04-20 17:24:23.210889+00	\N	\N	\N	\N
57eda4b4-4899-4f4c-bf33-68dcdfcf749e	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	[deleted]	\N	\N	t	2026-04-20 17:14:38.417078+00	\N	\N	\N	\N
dc731807-9ef2-4e5b-9815-5f4630096db7	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	iyfgghj	\N	2026-04-20 17:38:42.138148+00	f	2026-04-20 17:23:23.589094+00	\N	\N	\N	\N
a674c743-5740-4b29-bdad-ab1e4f326b5f	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@LexaFortyna	\N	\N	f	2026-04-20 18:55:45.720914+00	\N	\N	\N	\N
b4480312-765c-4378-9a8d-c2773ef32d84	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@everyone	\N	\N	f	2026-04-20 18:55:52.39034+00	\N	\N	\N	\N
c71afc8d-65b1-4dc3-b500-12ec24c20895	379ab3da-a820-44a0-949a-d2a6f139ab10	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	@kseonyt	\N	\N	f	2026-04-20 18:56:54.629541+00	\N	\N	\N	\N
f9cf812f-50a9-4460-8bf0-9776413272d0	379ab3da-a820-44a0-949a-d2a6f139ab10	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	@kseonyt	\N	\N	f	2026-04-20 19:05:38.940406+00	\N	\N	\N	\N
581aae01-f8b9-4ded-ba9c-439523abeabc	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	окак	\N	\N	f	2026-04-20 19:24:21.058564+00	\N	\N	\N	\N
c538157f-05cb-4ab2-af81-026a20120974	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	@kseonyt	\N	\N	f	2026-04-20 19:24:39.935922+00	\N	\N	\N	\N
0c9211db-8fe4-4dc3-8948-ee685a8a10c9	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	/uploads/attachments/ec1f0b77-dad7-4e1c-98ba-e52115c650d1/Снимокэкрана2026-04-14214036-dd14908af2a7.png	\N	\N	f	2026-04-20 19:33:25.485658+00	\N	\N	\N	\N
70cc903c-df81-41b9-8f42-9653b4461399	379ab3da-a820-44a0-949a-d2a6f139ab10	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	@kseonyt	\N	\N	f	2026-04-20 19:38:37.555762+00	\N	\N	\N	\N
d5846e15-5214-4ee9-97b3-13efde64acd5	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	@kseonyt	\N	\N	f	2026-04-20 19:38:40.234209+00	\N	\N	\N	\N
588db544-d8cd-4c7b-8a85-5156c408c46b	379ab3da-a820-44a0-949a-d2a6f139ab10	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	awdawd	\N	\N	f	2026-04-21 10:10:40.813287+00	\N	\N	\N	\N
4d1c9f75-22ca-4772-917f-a1cdd14ed4bb	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@everyone	\N	\N	f	2026-04-21 10:11:09.938674+00	\N	\N	\N	\N
8bcaade9-a202-4d54-a79e-92c91d52e9e8	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@all	\N	\N	f	2026-04-21 10:11:14.486214+00	\N	\N	\N	\N
7d548363-aed8-4b1a-997b-aeab30ddb512	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	\N	f	2026-04-21 10:11:18.777876+00	\N	\N	\N	\N
246d97a5-d194-4cd6-932e-54c13c54e0df	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	😫	\N	\N	f	2026-04-21 11:11:01.234145+00	\N	\N	\N	\N
8dbf8787-a390-49cf-bc61-bb0b6ebcef3d	379ab3da-a820-44a0-949a-d2a6f139ab10	\N		\N	\N	f	2026-04-21 11:53:07.080412+00	4dba3a20-594a-47b5-ad87-89cde5925364	botik	\N	[{"url": "https://google.com", "color": 8150271, "title": "Хай нахрен", "author": {"name": "ыуааыуауыыауыаууыа"}, "fields": [{"name": "ТУТА", "value": "ыуаыуаыуаыуа", "inline": true}], "footer": {"text": "ыуауыыуаыуауыа"}, "description": "уывуаыуаыуаыуаыуавыауыа"}]
7db3bb0a-de96-450c-b095-b87d14297468	379ab3da-a820-44a0-949a-d2a6f139ab10	\N	фцвцфвфвцфцвфцввцф	\N	\N	f	2026-04-21 11:54:11.223512+00	4dba3a20-594a-47b5-ad87-89cde5925364	фвцвцфвцфвцфвцф	\N	[{"color": 16711680, "title": "вфыцвцвццвф", "author": {"name": "фцвфцвфцвфцвцфвцфв"}, "fields": [{"name": "ПОЛЕ", "value": "1111", "inline": true}], "footer": {"text": "цфвцфвцфвцвффвц"}, "description": "вцффцвывфвфц"}]
ffa10e37-bd7d-427e-bd5d-154d29dde9b6	379ab3da-a820-44a0-949a-d2a6f139ab10	\N	фцвцфвфвцфцвфцввцф	\N	\N	f	2026-04-21 11:54:38.851109+00	4dba3a20-594a-47b5-ad87-89cde5925364	фвцвцфвцфвцфвцф	\N	[{"color": 16711680, "title": "вфыцвцвццвф", "author": {"name": "фцвфцвфцвфцвцфвцфв"}, "fields": [{"name": "ПОЛЕ", "value": "1111", "inline": true}], "footer": {"text": "цфвцфвцфвцвффвц"}, "description": "вцффцвывфвфц"}]
d1682b11-3686-4ab3-a13b-aa3fe1c5c04d	379ab3da-a820-44a0-949a-d2a6f139ab10	\N	[deleted]	\N	\N	t	2026-04-21 11:54:43.416568+00	4dba3a20-594a-47b5-ad87-89cde5925364	фвцвцфвцфвцфвцф	\N	[{"color": 16711680, "title": "вфыцвцвццвф", "author": {"name": "фцвфцвфцвфцвцфвцфв"}, "fields": [{"name": "ПОЛЕ", "value": "1111", "inline": true}], "footer": {"text": "цфвцфвцфвцвффвц"}, "description": "вцффцвывфвфц"}]
c829f0f6-9dff-4cba-9847-1aaaa113a9a2	379ab3da-a820-44a0-949a-d2a6f139ab10	\N	[deleted]	\N	\N	t	2026-04-21 11:33:49.341302+00	4dba3a20-594a-47b5-ad87-89cde5925364	botik	\N	\N
2128149a-dcca-477c-97e7-101f10ca1d45	379ab3da-a820-44a0-949a-d2a6f139ab10	31b7ed2e-fefb-4e41-8925-7813f9b63de6	пенис	\N	\N	f	2026-04-21 12:20:07.674675+00	\N	\N	\N	\N
34133a85-7bc6-4473-bd59-cd0ca58acdeb	b2016d4b-8676-4db9-97e1-01a2c3c08ddc	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	qwadawd	\N	\N	f	2026-04-21 12:21:31.398847+00	\N	\N	\N	\N
c478370f-3ea3-4ba9-90fd-7217366e0427	b2016d4b-8676-4db9-97e1-01a2c3c08ddc	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	\N	f	2026-04-21 12:21:32.566618+00	\N	\N	\N	\N
c30d558f-eaed-4870-8744-508a37b0d0cd	b2016d4b-8676-4db9-97e1-01a2c3c08ddc	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	awdawd	\N	\N	f	2026-04-21 12:22:29.898344+00	\N	\N	\N	\N
c42a8375-bcba-4b4d-804a-1d2e6d6cd7e0	379ab3da-a820-44a0-949a-d2a6f139ab10	31b7ed2e-fefb-4e41-8925-7813f9b63de6	в	\N	\N	f	2026-04-21 12:22:39.126219+00	\N	\N	\N	\N
2facab78-9e9c-4f88-962c-ac400da391ea	379ab3da-a820-44a0-949a-d2a6f139ab10	31b7ed2e-fefb-4e41-8925-7813f9b63de6	вв	\N	\N	f	2026-04-21 12:22:39.924323+00	\N	\N	\N	\N
4641540a-063b-4c1a-b177-d07ab10a4882	379ab3da-a820-44a0-949a-d2a6f139ab10	31b7ed2e-fefb-4e41-8925-7813f9b63de6	вввв	\N	\N	f	2026-04-21 12:22:40.420445+00	\N	\N	\N	\N
e5fd580f-b384-4d32-b1c6-afb6e89add85	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	@sp0ff fddrgdrgdrg	2128149a-dcca-477c-97e7-101f10ca1d45	\N	f	2026-04-21 12:22:43.193465+00	\N	\N	\N	\N
1a7c395f-6473-4eef-8f77-1e85130d736f	f049f484-984e-4a51-89ec-2d6285866ea4	31b7ed2e-fefb-4e41-8925-7813f9b63de6	f	\N	\N	f	2026-04-21 13:45:01.322301+00	\N	\N	\N	\N
90998c08-b2a9-4fde-84fe-05a7c8243fd1	f049f484-984e-4a51-89ec-2d6285866ea4	31b7ed2e-fefb-4e41-8925-7813f9b63de6	@OnixNine zov	\N	\N	f	2026-04-21 13:45:06.126684+00	\N	\N	\N	\N
720e706a-428c-41b3-bada-1bb7bec6ef44	f049f484-984e-4a51-89ec-2d6285866ea4	b65720c7-4114-4816-87af-50ee725173af	првирв	\N	\N	f	2026-04-21 13:49:14.627611+00	\N	\N	\N	\N
68aaee41-3318-45de-b60d-2537cd301e6d	f049f484-984e-4a51-89ec-2d6285866ea4	31b7ed2e-fefb-4e41-8925-7813f9b63de6	эх билнр нет права говорить в канале	\N	\N	f	2026-04-21 13:49:20.724584+00	\N	\N	\N	\N
e0225923-6fe3-4409-abb7-be3f230e5443	f049f484-984e-4a51-89ec-2d6285866ea4	31b7ed2e-fefb-4e41-8925-7813f9b63de6	буду молчать зато со включенным визуально микрофоном	\N	\N	f	2026-04-21 13:49:53.930261+00	\N	\N	\N	\N
ad41af33-1b60-49e1-81b6-2d6cfb09e6d1	f049f484-984e-4a51-89ec-2d6285866ea4	b65720c7-4114-4816-87af-50ee725173af	@sp0ff （⊙ｏ⊙）›-®‚	e0225923-6fe3-4409-abb7-be3f230e5443	\N	f	2026-04-21 13:51:29.300393+00	\N	\N	\N	\N
817e5812-cf5c-475c-8cd7-e7e566eb2f12	f049f484-984e-4a51-89ec-2d6285866ea4	b65720c7-4114-4816-87af-50ee725173af	🚸	\N	\N	f	2026-04-21 13:52:08.014553+00	\N	\N	\N	\N
ad687b51-cea6-4896-b6e9-b43bdea8f2da	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 17:13:20.256936+00	\N	\N	\N	\N
1f5fd355-7f21-446f-8a6e-4e899c94e18e	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 18:34:31.650614+00	\N	\N	\N	\N
ce49a4dc-ef4c-4cd5-b0b9-07cecc8ebcf8	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 18:36:00.059565+00	\N	\N	\N	\N
e0dcead3-e60b-4d2b-a363-f10d599889ef	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	уря :)	\N	\N	f	2026-04-21 18:36:19.521821+00	\N	\N	\N	\N
a0a161e2-936c-4980-a0bf-65e4bc89d185	379ab3da-a820-44a0-949a-d2a6f139ab10	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	надо писать !pr и сылка	\N	\N	f	2026-04-21 18:36:42.633988+00	\N	\N	\N	\N
2cca52ad-0d4e-4904-ac75-20f007a03fb3	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=jTSIQU8u17o	\N	\N	f	2026-04-21 18:50:36.620916+00	\N	\N	\N	\N
058d6da4-f32e-4db7-ba1e-95508ab12aea	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 19:11:41.619132+00	\N	\N	\N	\N
93912b41-f302-4d47-8fb8-36ce9146366e	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 19:16:09.280222+00	\N	\N	\N	\N
61b1d6d6-f7ad-4f89-847f-7f15036ef7f4	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 19:25:56.233385+00	\N	\N	\N	\N
0ed3eaea-fdb8-4a9f-86bf-cbb14fc3d171	379ab3da-a820-44a0-949a-d2a6f139ab10	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	!pr https://www.youtube.com/watch?v=QziTHs1yRnQ	\N	\N	f	2026-04-21 19:26:29.211838+00	\N	\N	\N	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.notifications (id, user_id, kind, from_user_id, server_id, channel_id, content, is_read, created_at) FROM stdin;
ab795864-223c-49f7-899c-6437e796b579	445ff097-29ef-4e62-9156-6b0602913e0d	friend_request	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	\N	\N	f	2026-04-20 14:21:31.11319+00
5a091298-3a95-463e-8be0-e7008bc29f76	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	445ff097-29ef-4e62-9156-6b0602913e0d	\N	\N	\N	t	2026-04-20 14:21:03.375093+00
e197d478-0ec2-424f-a6be-b0c108cacd27	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	bea76aa0-7466-4749-aaa1-207916b005ce	\N	\N	\N	t	2026-04-20 15:03:40.875541+00
92ff8baa-a754-4d11-9ff0-6995403708cb	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	\N	\N	\N	t	2026-04-20 15:12:29.189279+00
7e08353f-85fb-4e95-bb1e-f0a64bafe082	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	\N	\N	t	2026-04-20 15:31:26.470241+00
7c290946-3cc1-45a9-996d-e97f24326eb7	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	mention	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@LexaFortyna	t	2026-04-20 18:55:45.720914+00
360b537d-a878-470c-8f36-b32c8d187c27	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	mention	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@kseonyt	t	2026-04-20 19:38:40.234209+00
0aee0947-bdcf-4570-8197-6070d2c43a9f	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	mention	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@kseonyt	t	2026-04-20 19:38:37.555762+00
113a06a8-96a9-4777-ad35-af4681189610	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	mention	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@kseonyt	t	2026-04-20 19:24:39.935922+00
b3a8ec5e-3167-41ff-b30d-1c0d5854a55e	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	mention	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@kseonyt	t	2026-04-20 19:05:38.940406+00
0dffee3c-a6ca-4f5b-b650-a26d01645f49	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	mention	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@kseonyt	t	2026-04-20 18:56:54.629541+00
7ebb0a8f-b952-4eaa-a870-3c210866430d	31b7ed2e-fefb-4e41-8925-7813f9b63de6	mention	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	379ab3da-a820-44a0-949a-d2a6f139ab10	@sp0ff fddrgdrgdrg	f	2026-04-21 12:22:43.193465+00
3fdae4a2-8d15-424e-84f8-9753962f5d18	b65720c7-4114-4816-87af-50ee725173af	friend_request	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	\N	\N	\N	f	2026-04-21 13:25:05.087979+00
27109d15-26c6-429d-be3a-fa0737944c94	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	31b7ed2e-fefb-4e41-8925-7813f9b63de6	\N	\N	\N	t	2026-04-21 12:18:57.811281+00
f003ce05-fe90-42c8-912c-413a5392d44c	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	8339c7cd-799d-4436-a431-b3b18e987d59	\N	\N	\N	t	2026-04-21 12:43:54.223728+00
d8f0320a-1c8a-4790-9e17-add9030f02ce	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	friend_request	d6028015-8931-404c-a814-b0bf65ff524c	\N	\N	\N	t	2026-04-21 12:47:42.724193+00
8b945d17-f408-491f-bb81-b3230c215ddd	b65720c7-4114-4816-87af-50ee725173af	mention	31b7ed2e-fefb-4e41-8925-7813f9b63de6	31fa8783-3202-4f27-90cf-1673be630ddd	f049f484-984e-4a51-89ec-2d6285866ea4	@OnixNine zov	f	2026-04-21 13:45:06.126684+00
5dd17171-6be7-488c-8c2f-78ed9726213e	31b7ed2e-fefb-4e41-8925-7813f9b63de6	mention	b65720c7-4114-4816-87af-50ee725173af	31fa8783-3202-4f27-90cf-1673be630ddd	f049f484-984e-4a51-89ec-2d6285866ea4	@sp0ff （⊙ｏ⊙）›-®‚	f	2026-04-21 13:51:29.300393+00
10f78d19-df7f-48c6-a1ca-a994242f1352	d6028015-8931-404c-a814-b0bf65ff524c	friend_request	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	\N	\N	\N	f	2026-04-21 17:07:18.125771+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.roles (id, server_id, name, color, "position", permissions, hoist, mentionable, is_everyone, created_at) FROM stdin;
df5751dc-0b7b-427f-8f62-778bdb73bb44	649ba397-f13b-4fe3-8282-eb4da4c4c3d1	админ сайта	#ff0000	1	65535	f	f	f	2026-04-20 17:21:39.200178+00
551ff779-ed04-452a-bb4b-a0ebbbad15f3	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	awdawdd	#3ecf8e	1	30656	t	t	f	2026-04-20 16:52:58.00223+00
b2ee6010-9b5f-4880-99c3-f82861cad3fd	9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	sosun	#e05c7a	1	524287	t	t	f	2026-04-21 12:21:38.266168+00
29274b0c-d3bf-4583-afe5-6bea043cfb1f	31fa8783-3202-4f27-90cf-1673be630ddd	DEV	#e11ed8	1	524287	t	f	f	2026-04-21 13:42:11.967786+00
e542a81e-927d-4da5-9e9b-3e2536211144	31fa8783-3202-4f27-90cf-1673be630ddd	Tester	#5b8af0	2	128960	t	f	f	2026-04-21 13:45:38.689814+00
\.


--
-- Data for Name: server_bans; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.server_bans (server_id, user_id, banned_by, reason, created_at) FROM stdin;
\.


--
-- Data for Name: server_members; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.server_members (server_id, user_id, role, nickname, muted, deafened, joined_at) FROM stdin;
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	owner	\N	f	f	2026-04-20 14:25:26.145107+00
237d87ec-fdc0-4dd0-b4ae-7c9e7b09d136	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	owner	\N	f	f	2026-04-20 15:13:18.240105+00
4150b413-0bdf-427f-bcb5-54f00c77de74	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	owner	\N	f	f	2026-04-20 15:40:11.987265+00
649ba397-f13b-4fe3-8282-eb4da4c4c3d1	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	owner	\N	f	f	2026-04-20 16:18:29.878884+00
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	member	\N	f	f	2026-04-20 16:51:18.744474+00
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	member	\N	f	f	2026-04-20 18:56:47.577676+00
649ba397-f13b-4fe3-8282-eb4da4c4c3d1	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	admin	\N	f	f	2026-04-20 17:23:36.459003+00
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	31b7ed2e-fefb-4e41-8925-7813f9b63de6	member	\N	f	f	2026-04-21 12:20:01.400104+00
9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	owner	\N	f	f	2026-04-21 12:20:58.785622+00
9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	31b7ed2e-fefb-4e41-8925-7813f9b63de6	member	\N	f	f	2026-04-21 12:21:10.998409+00
31fa8783-3202-4f27-90cf-1673be630ddd	b65720c7-4114-4816-87af-50ee725173af	owner	\N	f	f	2026-04-21 13:27:51.708213+00
31fa8783-3202-4f27-90cf-1673be630ddd	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	member	\N	f	f	2026-04-21 13:28:11.673433+00
31fa8783-3202-4f27-90cf-1673be630ddd	31b7ed2e-fefb-4e41-8925-7813f9b63de6	member	\N	f	f	2026-04-21 13:41:40.693247+00
\.


--
-- Data for Name: servers; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.servers (id, name, description, icon_url, owner_id, invite_code, invite_expires_at, created_at, is_discoverable) FROM stdin;
237d87ec-fdc0-4dd0-b4ae-7c9e7b09d136	111	111	\N	7a5ea46a-87c3-4bd1-ad05-34c65d78e833	gLpVyADG	\N	2026-04-20 15:13:18.240105+00	f
4150b413-0bdf-427f-bcb5-54f00c77de74	sdfeasd	sefsef	\N	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	fS0YPZ10	\N	2026-04-20 15:40:11.987265+00	f
649ba397-f13b-4fe3-8282-eb4da4c4c3d1	Test	testing	\N	ec1f0b77-dad7-4e1c-98ba-e52115c650d1	PJet3IDN	\N	2026-04-20 16:18:29.878884+00	t
e2f3292a-b8c7-4901-9dfd-beb619e38b7c	1	dfxgv	/uploads/server-icons/e2f3292a-b8c7-4901-9dfd-beb619e38b7c.jpg	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	ixHhAAwz	\N	2026-04-20 14:25:26.145107+00	t
9bae9427-c5bd-4b35-9613-c45a3e8a5e9d	sp0ff11	11	\N	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	Rpbk0w48	\N	2026-04-21 12:20:58.785622+00	f
31fa8783-3202-4f27-90cf-1673be630ddd	OnixVisuals	Aboba	\N	b65720c7-4114-4816-87af-50ee725173af	GbbuCOSS	\N	2026-04-21 13:27:51.708213+00	f
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.users (id, email, username, hashed_password, display_name, avatar_url, status, custom_status, is_verified, is_banned, created_at, updated_at, public_key, signing_public_key) FROM stdin;
445ff097-29ef-4e62-9156-6b0602913e0d	yyy@yyy.yyy	yyy	$2b$12$kfXIh1nmBCn3YrQU6HEXhuGbkVdf0z9SvyXSPgA7WWYsjxL5QDlrK	\N	\N	online	\N	f	f	2026-04-20 14:16:20.208072+00	2026-04-20 14:16:20.208072+00	\N	\N
bea76aa0-7466-4749-aaa1-207916b005ce	iii@ii.iii	iii	$2b$12$9WcETUblt2mFnm754oPNdOlpK5NLOQYtrRk5qS2XITpJ3dcMzkW4K	\N	\N	online	\N	f	f	2026-04-20 15:03:35.340293+00	2026-04-20 15:03:35.340293+00	\N	\N
ec1f0b77-dad7-4e1c-98ba-e52115c650d1	aleksys.ts2010@gmail.com	LexaFortyna	$2b$12$8qIiFhQJbPPyaodJxrO.5.NwnIzShcvkpA7SqTOieGoOdcq.MlTiu	Тостер	/uploads/avatars/ec1f0b77-dad7-4e1c-98ba-e52115c650d1.png	offline	Тестеровщик хренов	f	f	2026-04-20 15:31:03.617181+00	2026-04-21 18:45:25.127109+00	LyP+P5lto6wtESMAfUfCNxCFdmoSQZa0dkgNdcozkwU=	mfF/2omxBGrg9jPopzDyi5vYTztzjNXKVc8dVK0l7WA=
31b7ed2e-fefb-4e41-8925-7813f9b63de6	sp3rkl3@gmail.com	sp0ff	$2b$12$eCDDCjKKprb19.ZSVGMflewRgHa.KsjOS1JlWlQLrQbbPw8WIp9uG		\N	offline	играит в Maincraft 1.21.11 *Ситевая игра староний сервир	f	f	2026-04-21 12:18:00.990581+00	2026-04-21 13:48:29.209805+00	\N	\N
7a5ea46a-87c3-4bd1-ad05-34c65d78e833	qqq@qqq.qqq	qqq	$2b$12$BtKTlX6yIGgYaDjT7Thauu5TxWLVcGWDS2pBiNkGVWGV8uD.STleG	\N	\N	offline	\N	f	f	2026-04-20 15:12:21.952773+00	2026-04-21 18:07:53.704397+00	Xd0z5fCYRX96Wk0BZsADrDXskjRNS2nI1HYFEOvR5Uo=	OSIQ08fTRYDt2LHm8G4IRnaYs1yRnjfa6+P7NAooLFc=
b65720c7-4114-4816-87af-50ee725173af	tryksy226@gmail.com	OnixNine	$2b$12$IBlwrfWNMniKDQIc200jQ.09o6gYPXy1mbWCjsoYGHBWgLPc5DbL6	\N	/uploads/avatars/b65720c7-4114-4816-87af-50ee725173af.png	offline	\N	f	f	2026-04-21 13:24:32.945452+00	2026-04-21 14:03:30.2568+00	\N	\N
8339c7cd-799d-4436-a431-b3b18e987d59	marat.abdulov.10@gmail.com	Mr_Moran	$2b$12$DHFHC1NFz64ptDKitpWSHexSaRJW22yeWAZ6taKVr1/PzaMjrK88q	\N	/uploads/avatars/8339c7cd-799d-4436-a431-b3b18e987d59.jfif	offline	\N	f	f	2026-04-21 12:36:00.889005+00	2026-04-21 13:23:54.559598+00	\N	\N
d6028015-8931-404c-a814-b0bf65ff524c	realkeep105@gmail.com	Reality_Keeper	$2b$12$hWhPOQa5JB0MrJHMS9DSOe2J7CHKsUFpHisCXs/lhO8OV2Crfe7NO	\N	/uploads/avatars/d6028015-8931-404c-a814-b0bf65ff524c.png	offline	\N	f	f	2026-04-21 12:46:52.055913+00	2026-04-21 16:23:07.468104+00	\N	\N
59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	kseonyt@gmail.com	kseonyt	$2b$12$SmJZJZMGcK9rIUYMLTuCUO4NGQ2y1dMPT9mY/.ENqCU7TaPaTJeeK	\N	/uploads/avatars/59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a.jpg	online	\N	f	f	2026-04-20 13:53:51.782654+00	2026-04-21 19:28:14.512608+00	mRy5jQ8J3iVpS5rkfkCHeIlEuLbwlpsY58jMp9SB3QE=	5lLcewyIiHDFoG/jo0kA1IpfBYF6QqX8quXL3aw05jw=
\.


--
-- Data for Name: voice_states; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.voice_states (user_id, channel_id, server_id, is_muted, is_deafened, is_sharing_screen, is_video, joined_at) FROM stdin;
\.


--
-- Data for Name: webhooks; Type: TABLE DATA; Schema: public; Owner: hiroo
--

COPY public.webhooks (id, channel_id, server_id, name, avatar_url, token, created_by, created_at) FROM stdin;
4dba3a20-594a-47b5-ad87-89cde5925364	379ab3da-a820-44a0-949a-d2a6f139ab10	e2f3292a-b8c7-4901-9dfd-beb619e38b7c	botik	\N	ClrNZLZ86-JgfriBOAp9fEs1juQXKrF2QVaBZJJcGW4	59e2ff8f-9a9b-44fc-9002-b3ad6d8f091a	2026-04-21 11:09:07.335269+00
\.


--
-- Name: channel_role_permissions channel_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.channel_role_permissions
    ADD CONSTRAINT channel_role_permissions_pkey PRIMARY KEY (channel_id, role_id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: dm_message_reactions dm_message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_message_reactions
    ADD CONSTRAINT dm_message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: dm_messages dm_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_pkey PRIMARY KEY (id);


--
-- Name: dm_participants dm_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_participants
    ADD CONSTRAINT dm_participants_pkey PRIMARY KEY (dm_id, user_id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: member_roles member_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.member_roles
    ADD CONSTRAINT member_roles_pkey PRIMARY KEY (server_id, user_id, role_id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: server_bans server_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_bans
    ADD CONSTRAINT server_bans_pkey PRIMARY KEY (server_id, user_id);


--
-- Name: server_members server_members_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_pkey PRIMARY KEY (server_id, user_id);


--
-- Name: servers servers_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voice_states voice_states_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.voice_states
    ADD CONSTRAINT voice_states_pkey PRIMARY KEY (user_id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_token_key; Type: CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_token_key UNIQUE (token);


--
-- Name: ix_dm_messages_created_at; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_dm_messages_created_at ON public.dm_messages USING btree (created_at);


--
-- Name: ix_dm_messages_dm_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_dm_messages_dm_id ON public.dm_messages USING btree (dm_id);


--
-- Name: ix_friend_requests_from_user_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_friend_requests_from_user_id ON public.friend_requests USING btree (from_user_id);


--
-- Name: ix_friend_requests_to_user_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_friend_requests_to_user_id ON public.friend_requests USING btree (to_user_id);


--
-- Name: ix_messages_channel_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_messages_channel_id ON public.messages USING btree (channel_id);


--
-- Name: ix_messages_created_at; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_messages_created_at ON public.messages USING btree (created_at);


--
-- Name: ix_notifications_created_at; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_notifications_created_at ON public.notifications USING btree (created_at);


--
-- Name: ix_notifications_user_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: ix_roles_server_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_roles_server_id ON public.roles USING btree (server_id);


--
-- Name: ix_servers_invite_code; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE UNIQUE INDEX ix_servers_invite_code ON public.servers USING btree (invite_code);


--
-- Name: ix_servers_is_discoverable; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_servers_is_discoverable ON public.servers USING btree (is_discoverable);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_username; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);


--
-- Name: ix_webhooks_channel_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_webhooks_channel_id ON public.webhooks USING btree (channel_id);


--
-- Name: ix_webhooks_server_id; Type: INDEX; Schema: public; Owner: hiroo
--

CREATE INDEX ix_webhooks_server_id ON public.webhooks USING btree (server_id);


--
-- Name: channel_role_permissions channel_role_permissions_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.channel_role_permissions
    ADD CONSTRAINT channel_role_permissions_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: channel_role_permissions channel_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.channel_role_permissions
    ADD CONSTRAINT channel_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: channels channels_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: dm_message_reactions dm_message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_message_reactions
    ADD CONSTRAINT dm_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.dm_messages(id) ON DELETE CASCADE;


--
-- Name: dm_message_reactions dm_message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_message_reactions
    ADD CONSTRAINT dm_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: dm_messages dm_messages_dm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_dm_id_fkey FOREIGN KEY (dm_id) REFERENCES public.direct_messages(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.dm_messages(id) ON DELETE SET NULL;


--
-- Name: dm_participants dm_participants_dm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_participants
    ADD CONSTRAINT dm_participants_dm_id_fkey FOREIGN KEY (dm_id) REFERENCES public.direct_messages(id) ON DELETE CASCADE;


--
-- Name: dm_participants dm_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.dm_participants
    ADD CONSTRAINT dm_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: member_roles member_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.member_roles
    ADD CONSTRAINT member_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: roles roles_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_bans server_bans_banned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_bans
    ADD CONSTRAINT server_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: server_bans server_bans_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_bans
    ADD CONSTRAINT server_bans_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_bans server_bans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_bans
    ADD CONSTRAINT server_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: server_members server_members_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_members server_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: servers servers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: voice_states voice_states_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.voice_states
    ADD CONSTRAINT voice_states_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;


--
-- Name: voice_states voice_states_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.voice_states
    ADD CONSTRAINT voice_states_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE SET NULL;


--
-- Name: voice_states voice_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.voice_states
    ADD CONSTRAINT voice_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: webhooks webhooks_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: hiroo
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict k1d7PhodCGjy85aJgqZo5FBcaJcmEIWvxzpYMn8qhzikpEGN3VxETwcO7PpxxyW

