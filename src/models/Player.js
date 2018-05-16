import { query, sql } from 'pgr'

const Player = {
    async find(shardId, { id, name }) {
        return query.one(sql`
            SELECT id, name, last_fetched_at AS "lastFetchedAt"
            FROM players p
            LEFT JOIN player_shards ps ON p.id = ps.player_id
                AND ps.shard_id = ${shardId}
            WHERE 1 = 1
                ${sql.if('AND id = ?', id)}
                ${sql.if('AND name = ?', name)}
        `)
    },

    async findMatchIds(id) {
        return query(sql`SELECT match_id AS id FROM match_players WHERE player_id = ${id}`)
    },

    async create(pubgPlayer) {
        const { name, shardId } = pubgPlayer.attributes

        const player = {
            id: pubgPlayer.id,
            name,
        }

        const matches = pubgPlayer.relationships.matches.data.map(d => [d.id, shardId])
        const matchPlayers = matches.map(m => [m[0], player.id])

        await query.transaction(async tquery => {
            await query(sql`
                INSERT INTO players (id, name)
                VALUES (${player.id}, ${player.name})
                ON CONFLICT (id) DO UPDATE
                    SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
            `)

            await query(sql`
                INSERT INTO matches (id, shard_id)
                VALUES ${matches}
                ON CONFLICT DO NOTHING
            `)

            await query(sql`
                INSERT INTO match_players (match_id, player_id)
                VALUES ${matchPlayers}
                ON CONFLICT DO NOTHING
            `)

            await query(sql`
                INSERT INTO player_shards (player_id, shard_id, last_fetched_at)
                VALUES (${player.id}, ${shardId}, CURRENT_TIMESTAMP)
                ON CONFLICT (player_id, shard_id) DO UPDATE
                    SET last_fetched_at = CURRENT_TIMESTAMP
            `)
        })

        return this.find(shardId, { id: pubgPlayer.id })
    },
}

export default Player
