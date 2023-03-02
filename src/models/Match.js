import Promise from 'bluebird';
import { flatMap, chunk, isEmpty, pick } from 'lodash';
import { query, sql } from 'pgr';
import { db } from '../app';

const debug = false;

function getTelemetryUrl(pubgMatch) {
  const assetId = pubgMatch.data.relationships.assets.data[0].id;
  const asset = pubgMatch.included.find((i) => i.type === 'asset' && i.id === assetId);
  return asset.attributes.URL;
}

const matchFields = sql.raw(`
    id, game_mode AS "gameMode", played_at AS "playedAt", map_name AS "mapName",
    duration_seconds AS "durationSeconds", telemetry_url AS "telemetryUrl", shard_id AS "shardId"
`);

const writeMatches = async (pubgMatches) => {
  try {
    await db.exec('begin transaction')

    await db.exec(
      sql`
          INSERT INTO matches (
              id, shard_id, game_mode, played_at, map_name, duration_seconds, telemetry_url
          )
          VALUES ${pubgMatches.map((m) => [
            m.data.id,
            m.data.attributes.shardId,
            m.data.attributes.gameMode,
            m.data.attributes.createdAt,
            m.data.attributes.mapName,
            m.data.attributes.duration,
            getTelemetryUrl(m),
          ])}
          ON CONFLICT (id) DO UPDATE
              SET game_mode = EXCLUDED.game_mode,
              played_at = EXCLUDED.played_at,
              map_name = EXCLUDED.map_name,
              duration_seconds = EXCLUDED.duration_seconds,
              telemetry_url = EXCLUDED.telemetry_url,
              updated_at = current_timestamp
      `.getStatement()
    );

    const matchPlayers = flatMap(pubgMatches, (m) => {
      return m.included
        .filter((i) => i.type === 'participant')
        .map((i) => [
          m.data.id,
          i.attributes.stats.playerId,
          i.attributes.stats.name,
          m.included.find((i2) => {
            if (i2.type === 'roster') {
              return i2.relationships.participants.data.some((d) => {
                return d.id === i.id;
              });
            }

            return false;
          }).id,
          JSON.stringify(pick(i.attributes.stats, ['winPlace', 'kills'])),
        ]);
    });

    const chunks = chunk(matchPlayers, 300);

    await Promise.mapSeries(chunks, async (c) => {

      await db.exec(
        sql`
            INSERT INTO match_players (match_id, player_id, player_name, roster_id, stats)
            VALUES ${c}
            ON CONFLICT (match_id, player_id) DO UPDATE
                SET roster_id = EXCLUDED.roster_id,
                stats = EXCLUDED.stats,
                player_name = EXCLUDED.player_name
        `.getStatement()
      );
    })

    await db.exec('commit')
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
};

const Match = {
  async find(id) {
    return db.get(sql`SELECT ${matchFields} FROM matches WHERE id = ${id}`.getStatement());
  },

  async findAll(shardId, playerId) {
    if (!shardId || !playerId) return [];
    const res = await db.all(
      sql`
          SELECT ${matchFields}, mp.stats
          FROM match_players mp
          JOIN matches m ON mp.match_id = m.id
          WHERE shard_id = ${shardId} AND player_id = ${playerId}
              AND m.played_at > date(current_timestamp, '-14 DAY')
              AND m.map_name <> 'Range_Main'
          ORDER BY m.played_at DESC
          LIMIT 100
      `.getStatement()
    );
    return res.map(r => ({ ...r, stats: JSON.parse(r.stats) }))
  },

  async findAllUnloadedIds(shardId, playerId) {
    if (!shardId || !playerId) return [];
    const matches = await db.all(
      sql`
          SELECT id, m.played_at AS "playedAt"
          FROM match_players mp
          JOIN matches m ON mp.match_id = m.id
          WHERE shard_id = ${shardId} AND player_id = ${playerId}
          ORDER BY m.created_at DESC
          LIMIT 100
      `.getStatement()
    );

    // We want to filter in memory instead of the DB so that we don't constantly go back in time
    // to load more matches we won't render anyways.
    return matches.filter((m) => !m.playedAt).map((m) => m.id);
  },

  async create(pubgMatches) {
    const filteredMatches = pubgMatches.filter((m) => m.data.attributes.duration <= 10000);
    if (!isEmpty(filteredMatches)) {
      await writeMatches(filteredMatches);
    }
  },

  async getSample(shardId) {
    return db.get(
      sql`
          SELECT m.id AS "id", mp.player_name AS "playerName", m.shard_id AS "shardId"
          FROM match_players mp
          JOIN matches m ON mp.match_id = m.id
          WHERE m.shard_id = ${shardId}
              AND game_mode IN ('squad-fpp')
              AND m.map_name <> 'Range_Main'
          AND played_at IS NOT NULL
          ORDER BY m.played_at DESC
          LIMIT 1
      `.getStatement()
    );
  },
};

export default Match;
