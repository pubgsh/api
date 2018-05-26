import { query, sql } from 'pgr'

const MatchPlayer = {
    async findAll(matchId) {
        return query(sql`
            SELECT player_id AS id, player_name AS name, roster_id AS "rosterId", stats
            FROM match_players mp
            WHERE match_id = ${matchId}
        `)
    },
}

export default MatchPlayer
