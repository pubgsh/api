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
        UPDATE matches
        SET game_mode = ${attributes.gameMode}, played_at = ${attributes.createdAt},
            map_name = ${attributes.mapName}, duration_seconds = ${attributes.duration},
            telemetry_url = ${getTelemetryUrl(pubgMatch)}, updated_at = timezone('utc', now())
        WHERE id = ${pubgMatch.data.id}
    `, { debug })

    await tquery(sql`
        INSERT INTO players (id, name)
        VALUES ${players.map(p => [p.id, p.name])}
        ON CONFLICT (id) DO NOTHING
    `, { debug })

    await tquery(sql`
        INSERT INTO match_players (match_id, player_id, roster_id, stats)
        VALUES ${players.map(p => [pubgMatch.data.id, p.id, p.rosterId, p.stats])}
        ON CONFLICT (match_id, player_id) DO UPDATE
            SET roster_id = EXCLUDED.roster_id, stats = EXCLUDED.stats
    `, { debug })
}

const Match = {
    async find(id) {
        return query.one(sql`SELECT ${matchFields} FROM matches WHERE id = ${id}`)
    },

    async findAll(shardId, playerId) {
        return query(sql`
            SELECT ${matchFields}
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId}
            AND player_id = ${playerId}
            AND game_mode NOT LIKE '%warmode%'
            ORDER BY m.played_at DESC
        `, { debug })
    },

    async findAllUnloaded(shardId, playerId) {
        return query(sql`
            SELECT id
            FROM match_players mp
            JOIN matches m ON mp.match_id = m.id
            WHERE shard_id = ${shardId}
            AND player_id = ${playerId}
            AND played_at IS NULL
        `, { debug })
    },

    async create(pubgMatch) {
        return query.transaction(async tquery => {
            await writeMatch(pubgMatch, tquery)
            return this.find(pubgMatch.data.id)
        })
    },

    async createAll(pubgMatches) {
        return query.transaction(async tquery => {
            await Promise.mapSeries(pubgMatches, m => writeMatch(m, tquery))
        })
    },
}

export default Match
