DROP TABLE IF EXISTS public.player_fetch_intervals;
DROP TABLE IF EXISTS public.match_players;
DROP TABLE IF EXISTS public.players;
DROP TABLE IF EXISTS public.matches;

CREATE TABLE public.matches (
    id varchar(255) PRIMARY KEY,
    shard_id varchar(255) NOT NULL,
    game_mode varchar(255) NULL,
    played_at timestamp NULL,
    map_name varchar(255) NULL,
    duration_seconds integer NULL,
    telemetry_url varchar(255) NULL,
    created_at timestamp NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamp NULL
);

CREATE TABLE public.match_players (
    match_id varchar(255) NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    player_id varchar(255) NOT NULL,
    player_name varchar(255) NOT NULL,
    roster_id varchar(255) NULL,
    stats JSON NULL,
    PRIMARY KEY (match_id, player_id)
);

CREATE TABLE public.players (
    id varchar(255) NOT NULL,
    shard_id varchar(255) NOT NULL,
    name varchar(255) NOT NULL,
    created_at timestamp NOT NULL DEFAULT timezone('utc', now()),
    last_fetched_at timestamp NULL,
    PRIMARY KEY (id, shard_id)
);

CREATE TABLE public.player_fetch_intervals (
    name varchar(255) NOT NULL,
    fetch_interval_ms integer NOT NULL,
    PRIMARY KEY (name)
);

CREATE INDEX match_players_player_name ON match_players (player_name);
CREATE INDEX players_shard_id_name ON players (shard_id, name);
CREATE INDEX matches_game_mode_played_at ON matches (game_mode, played_at);
CREATE INDEX match_players_player_id ON match_players (player_id);


INSERT INTO player_fetch_intervals (name, fetch_interval_ms)
VALUES
    ('Bevo', 30000),
    ('BOT_Andre', 30000),
    ('Goobeez', 30000),
    ('Blarley', 30000),
    ('SIX-MO', 30000);
