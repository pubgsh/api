import { query, sql } from 'pgr';
import { db } from '../app'

const MatchPlayer = {
  async findAll(matchId) {
    const res = await db.all(sql`
        SELECT player_id AS id, player_name AS name, roster_id AS "rosterId", stats
        FROM match_players mp
        WHERE match_id = ${matchId}
    `.getStatement());
    return res.map(r => ({ ...r, stats: JSON.parse(r.stats) }))
  },
};

export default MatchPlayer;
