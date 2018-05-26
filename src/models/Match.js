import Promise from 'bluebird'
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

const writeMatch = async (pubgMatch, tquery) => {
    const { data: { attributes }, included } = pubgMatch

    const participantIdToRosterId = included.reduce((acc, i) => {
        if (i.type === 'roster') {
            i.relationships.participants.data.forEach(d => {
                acc[d.id] = i.id
            })
        }

        return acc
    }, {})

    const players = included
        .filter(i => i.type === 'participant')
        .map(i => ({
            id: i.attributes.stats.playerId,
            name: i.attributes.stats.name,
            rosterId: participantIdToRosterId[i.id],
            stats: i.attributes.stats,
        }))

    await tquery(sql`
        INSERT INTO MATCHES (id, shard_id) VALUES (${pubgMatch.data.id}, ${attributes.shardId})
        ON CONFLICT DO NOTHING
    `, { debug })

    await tquery(sql`
        UPDATE matches
        SET game_mode = ${attributes.gameMode}, played_at = ${attributes.createdAt},
            map_name = ${attributes.mapName}, duration_seconds = ${attributes.duration},
            telemetry_url = ${getTelemetryUrl(pubgMatch)}, updated_at = timezone('utc', now())
        WHERE id = ${pubgMatch.data.id}
    `, { debug })

    await tquery(sql`
        INSERT INTO match_players (match_id, player_id, player_name, roster_id, stats)
        VALUES ${players.map(p => [pubgMatch.data.id, p.id, p.name, p.rosterId, p.stats])}
        ON CONFLICT (match_id, player_id) DO UPDATE
            SET roster_id = EXCLUDED.roster_id, stats = EXCLUDED.stats, player_name = EXCLUDED.player_name
    `, { debug })
}

const Match = {
    async find(id) {
        return query.one(sql`SELECT ${matchFields} FROM matches WHERE id = ${id}`, { debug })
    },

    async findAll(shardId, playerId) {
        if (!shardId || !playerId) return []
        return query(sql`
            SELECT ${matchFields}
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId}
            AND player_id = ${playerId}
            AND game_mode NOT LIKE '%warmode%'
            AND m.played_at > (TIMEZONE('utc', NOW()) - INTERVAL '14 DAY')
            ORDER BY m.played_at DESC
            LIMIT 50
        `, { debug })
    },

    async findAllUnloadedIds(shardId, playerId) {
        if (!shardId || !playerId) return []
        const matches = await query(sql`
            SELECT id, m.played_at AS "playedAt"
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId}
            AND player_id = ${playerId}
            ORDER BY m.created_at DESC
            LIMIT 50
        `, { debug })

        // We want to filter in memory instead of the DB so that we don't constantly go back in time
        // to load more matches we won't render anyways.
        return matches.filter(m => !m.playedAt).map(m => m.id)
    },

    async create(pubgMatch) {
        await query.transaction(async tquery => {
            await writeMatch(pubgMatch, tquery)
        })
        return this.find(pubgMatch.data.id)
    },

    async createAll(pubgMatches) {
        return query.transaction(async tquery => {
            await Promise.mapSeries(pubgMatches, m => writeMatch(m, tquery))
        })
    },
}

export default Match
