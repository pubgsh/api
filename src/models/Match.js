import { query, sql } from 'pgr'

function getTelemetryUrl(pubgMatch) {
    const assetId = pubgMatch.data.relationships.assets.data[0].id
    const asset = pubgMatch.included.find(i => i.type === 'asset' && i.id === assetId)
    return asset.attributes.URL
}

const matchFields = sql.raw(`
    id, game_mode AS "gameMode", played_at AS "playedAt", map_name AS "mapName",
    duration_seconds AS "durationSeconds", telemetry_url AS "telemetryUrl", shard_id AS "shardId"
`)

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
            ORDER BY CASE WHEN m.played_at IS NULL THEN '1970-01-01' ELSE m.played_at END DESC
        `, { debug: true })
    },

    async create(pubgMatch) {
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

        await query.transaction(async tquery => {
            await query(sql`
                UPDATE matches
                SET game_mode = ${attributes.gameMode}, played_at = ${attributes.createdAt},
                    map_name = ${attributes.mapName}, duration_seconds = ${attributes.duration},
                    telemetry_url = ${getTelemetryUrl(pubgMatch)}, updated_at = timezone('utc', now())
                WHERE id = ${pubgMatch.data.id}
            `, { debug: true })

            await query(sql`
                INSERT INTO players (id, name)
                VALUES ${players.map(p => [p.id, p.name])}
                ON CONFLICT (id) DO NOTHING
            `, { debug: true })

            await query(sql`
                INSERT INTO match_players (match_id, player_id, roster_id, stats)
                VALUES ${players.map(p => [pubgMatch.data.id, p.id, p.rosterId, p.stats])}
                ON CONFLICT (match_id, player_id) DO UPDATE
                    SET roster_id = EXCLUDED.roster_id, stats = EXCLUDED.stats
            `, { debug: true })
        })

        return this.find(pubgMatch.data.id)
    },
}

export default Match
