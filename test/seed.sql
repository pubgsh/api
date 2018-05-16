DROP TABLE IF EXISTS public.match_players;
DROP TABLE IF EXISTS public.players;
DROP TABLE IF EXISTS public.matches;

CREATE TABLE public.players (
    id varchar(255) PRIMARY KEY,
    name varchar(255) NULL UNIQUE,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL
);

CREATE TABLE public.matches (
    id varchar(255) PRIMARY KEY,
    shard_id varchar(255) NOT NULL,
    game_mode varchar(255) NULL,
    played_at timestamp NULL,
    map_name varchar(255) NULL,
    duration_seconds integer NULL,
    telemetry_url varchar(255) NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL
);

CREATE TABLE public.match_players (
    match_id varchar(255) NOT NULL REFERENCES matches (id),
    player_id varchar(255) NOT NULL REFERENCES players (id),
    roster_id varchar(255) NULL,
    stats JSON NULL,
    PRIMARY KEY (match_id, player_id)
);

CREATE TABLE public.player_shards (
    player_id varchar(255) NOT NULL REFERENCES players (id),
    shard_id varchar(255) NOT NULL,
    last_fetched_at timestamp NULL,
    PRIMARY KEY (player_id, shard_id)
);
