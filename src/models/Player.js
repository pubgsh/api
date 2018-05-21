import { query, sql } from 'pgr'

const debug = false

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
        `, { debug })
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
                    SET name = EXCLUDED.name, updated_at = timezone('utc', now())
            `, { debug })

            await query(sql`
                INSERT INTO matches (id, shard_id)
                VALUES ${matches}
                ON CONFLICT DO NOTHING
            `, { debug })

            await query(sql`
                INSERT INTO match_players (match_id, player_id)
                VALUES ${matchPlayers}
                ON CONFLICT DO NOTHING
            `, { debug })

            await query(sql`
                INSERT INTO player_shards (player_id, shard_id, last_fetched_at)
                VALUES (${player.id}, ${shardId}, timezone('utc', now()))
                ON CONFLICT (player_id, shard_id) DO UPDATE
                    SET last_fetched_at = timezone('utc', now())
            `, { debug })
        })

        return this.find(shardId, { id: pubgPlayer.id })
    },
}

export default Player
