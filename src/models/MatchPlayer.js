import { query, sql } from 'pgr'

const MatchPlayer = {
    async findAll(matchId) {
        return query(sql`
            SELECT player_id AS id, name, roster_id AS "rosterId", stats
            FROM match_players mp
            JOIN players p ON mp.player_id = p.id
            WHERE match_id = ${matchId}
        `)
    },
}

export default MatchPlayer
