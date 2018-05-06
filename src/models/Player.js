import { query, sql } from 'pgr'

const Player = {
    async find({ id, name }) {
        return query.one(sql`
            SELECT id, name FROM players
            WHERE 1 = 1
                ${sql.if('AND id = ?', id)}
                ${sql.if('AND name = ?', name)}
        `)
    },

    async findMatchIds(id) {
        return query(sql`SELECT match_id AS id FROM match_players WHERE player_id = ${id}`)
    },

    async create(pubgPlayer) {
        const player = {
            id: pubgPlayer.id,
            name: pubgPlayer.attributes.name,
        }

        const matches = pubgPlayer.relationships.matches.data.map(d => [d.id])
        const matchPlayers = matches.map(m => [m[0], player.id])

        await query.transaction(async tquery => {
            await query(sql`
                INSERT INTO players (id, name)
                VALUES ${[[player.id, player.name]]}
                ON CONFLICT (id) DO UPDATE
                    SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
            `)

            await query(sql`
                INSERT INTO matches (id)
                VALUES ${matches}
                ON CONFLICT DO NOTHING
            `)

            await query(sql`
                INSERT INTO match_players (match_id, player_id)
                VALUES ${matchPlayers}
                ON CONFLICT DO NOTHING
            `)
        })

        return this.find({ id: pubgPlayer.id })
    },
}

export default Player
