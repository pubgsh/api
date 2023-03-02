import moment from 'moment';
import { isEmpty } from 'lodash';
import { sql } from 'pgr';
import { db } from '../app'

const debug = false;

const Player = {
  async find(shardId, { id, name }) {
    return db.get(
      sql`
            SELECT p.id, p.name, p.last_fetched_at AS "lastFetchedAt",
                pfi.fetch_interval_ms AS "fetchIntervalMs"
            FROM players p
                LEFT JOIN player_fetch_intervals pfi ON p.name = pfi.name
            WHERE shard_id = ${shardId}
                ${sql.if('AND p.id = ?', id)}
                ${sql.if('AND p.name = ?', name)}
        `.getStatement()).then(row => ({  ...row, shardId }))
  },

  async createOrUpdate(pubgPlayer) {
    const { name, shardId } = pubgPlayer.attributes;

    const player = {
      id: pubgPlayer.id,
      name,
    };

    const now = Date.now();
    const matches = pubgPlayer.relationships.matches.data
      .map((d, i) => [d.id, shardId, moment.utc(now - i * 1000).format('YYYY-MM-DD HH:mm:ss')])
      .slice(0, 100);
    const matchPlayers = matches.map((m) => [m[0], player.id, player.name]);

    await db.exec(
      sql`
          INSERT INTO players AS p (id, shard_id, name, last_fetched_at)
          VALUES (${player.id}, ${shardId}, ${player.name}, current_timestamp)
          ON CONFLICT (id, shard_id) DO UPDATE
              SET last_fetched_at = current_timestamp,
              num_fetches = p.num_fetches + 1
      `.getStatement());

    if (!isEmpty(matches)) {
      await db.exec(
        sql`
            INSERT INTO matches (id, shard_id, created_at)
            VALUES ${matches}
            ON CONFLICT DO NOTHING
        `.getStatement());
    }

    if (!isEmpty(matchPlayers)) {
      await db.exec(
        sql`
          INSERT INTO match_players (match_id, player_id, player_name)
          VALUES ${matchPlayers}
          ON CONFLICT DO NOTHING
      `.getStatement());
    }

    return this.find(shardId, { id: pubgPlayer.id });
  },
};

export default Player;
