import Promise from 'bluebird'
import { flatMap, chunk, isEmpty } from 'lodash'
import { query, sql } from 'pgr'

const debug = false

function getTelemetryUrl(pubgMatch) {
    const assetId = pubgMatch.data.relationships.assets.data[0].id
    const asset = pubgMatch.included.find(i => i.type === 'asset' && i.id === assetId)
    return asset.attributes.URL
}

const matchFields = sql.raw(`
    id, game_mode AS "gameMode", played_at AS "playedAt", map_name AS "mapName",
    duration_seconds AS "durationSeconds", telemetry_url AS "telemetryUrl", shard_id AS "shardId"
`)

const writeMatches = async pubgMatches => {
    return query.transaction(async tquery => {
        await tquery(sql`
            INSERT INTO matches (
                id, shard_id, game_mode, played_at, map_name, duration_seconds, telemetry_url
            )
            VALUES ${pubgMatches.map(m => [
                m.data.id,
                m.data.attributes.shardId,
                m.data.attributes.gameMode,
                m.data.attributes.createdAt,
                m.data.attributes.mapName,
                m.data.attributes.duration,
                getTelemetryUrl(m),
            ])}
            ON CONFLICT (id) DO UPDATE
                SET game_mode = EXCLUDED.game_mode,
                played_at = EXCLUDED.played_at,
                map_name = EXCLUDED.map_name,
                duration_seconds = EXCLUDED.duration_seconds,
                telemetry_url = EXCLUDED.telemetry_url,
                updated_at = timezone('utc', now())
        `, { debug })

        const matchPlayers = flatMap(pubgMatches, m => {
            return m.included
                .filter(i => i.type === 'participant')
                .map(i => [
                    m.data.id,
                    i.attributes.stats.playerId,
                    i.attributes.stats.name,
                    m.included.find(i2 => {
                        if (i2.type === 'roster') {
                            return i2.relationships.participants.data.some(d => {
                                return d.id === i.id
                            })
                        }

                        return false
                    }).id,
                    i.attributes.stats,
                ])
        })

        const chunks = chunk(matchPlayers, 300)

        await Promise.mapSeries(chunks, c => {
            return tquery(sql`
                INSERT INTO match_players (match_id, player_id, player_name, roster_id, stats)
                VALUES ${c}
                ON CONFLICT (match_id, player_id) DO UPDATE
                    SET roster_id = EXCLUDED.roster_id,
                    stats = EXCLUDED.stats,
                    player_name = EXCLUDED.player_name
            `, { debug })
        })
    })
}

const Match = {
    async find(id) {
        return query.one(sql`SELECT ${matchFields} FROM matches WHERE id = ${id}`, { debug })
    },

    async findAll(shardId, playerId) {
        if (!shardId || !playerId) return []
        return query(sql`
            SELECT ${matchFields}, mp.stats
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId} AND player_id = ${playerId}
                AND m.played_at > (TIMEZONE('utc', NOW()) - INTERVAL '14 DAY')
            ORDER BY m.played_at DESC
            LIMIT 100
        `, { debug })
    },

    async findAllUnloadedIds(shardId, playerId) {
        if (!shardId || !playerId) return []
        const matches = await query(sql`
            SELECT id, m.played_at AS "playedAt"
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId} AND player_id = ${playerId}
            ORDER BY m.created_at DESC
            LIMIT 100
        `, { debug })

        // We want to filter in memory instead of the DB so that we don't constantly go back in time
        // to load more matches we won't render anyways.
        return matches.filter(m => !m.playedAt).map(m => m.id)
    },

    async create(pubgMatches) {
        const filteredMatches = pubgMatches.filter(m => m.data.attributes.duration <= 10000)
        if (!isEmpty(filteredMatches)) {
            await writeMatches(filteredMatches)
        }
    },

    async getSample(shardId) {
        return query.one(sql`
            SELECT m.id AS "id", mp.player_name AS "playerName", m.shard_id AS "shardId"
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE m.shard_id = ${shardId}
                AND game_mode IN ('squad-fpp')
            AND played_at IS NOT NULL
            ORDER BY m.played_at DESC
            LIMIT 1
        `, { debug })
    },
}

export default Match
