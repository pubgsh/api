import Promise from 'bluebird'
import { query, sql } from 'pgr'
import models from '@/models'
import PubgApi from '@/lib/pubg-api'

require('dotenv').config({ path: './.env.local' })

const pubgApi = PubgApi(process.env.PUBG_API_KEY)

const loadRandomMatch = async () => {
    const matchToLoad = await query.one(sql`
        SELECT id FROM matches WHERE played_at IS NULL ORDER BY created_at ASC LIMIT 1
    `)
    if (!matchToLoad) return

    const pubgMatch = await pubgApi.getMatch(matchToLoad.id)
    const match = await models.Match.create(pubgMatch)

    console.log(`[crawler]: Loaded match ${match.id}`)
}

const refreshPlayer = async () => {
    const playerToLoad = await query.one(sql`
        SELECT p.name, ps.shard_id AS "shardId"
        FROM player_shards ps JOIN players p ON ps.player_id = p.id
        WHERE ps.last_fetched_at < (TIMEZONe('utc', NOW()) - INTERVAL '4 hour')
        ORDER BY ps.last_fetched_at ASC
        LIMIT 1
    `)
    if (!playerToLoad) return

    const pubgPlayer = await pubgApi.getPlayer(playerToLoad.shardId, playerToLoad.name)
    const player = await models.Player.create(pubgPlayer)

    console.log(`[crawler]: Refreshed player ${player.name}`)
}

let startTimeout
const start = () => {
    startTimeout = setTimeout(async () => {
        await Promise.all([loadRandomMatch(), refreshPlayer()])
        start()
    }, 20 * 1000)
}

const stop = () => {
    if (startTimeout) {
        clearTimeout(startTimeout)
        startTimeout = null
    }
}

export default {
    start,
    stop,
}
