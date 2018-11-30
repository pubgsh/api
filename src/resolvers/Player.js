import Promise from 'bluebird'
import moment from 'moment'
import { isEmpty, get } from 'lodash'
import TemporarySet from '@/lib/TemporarySet.js'
import { playerFetchQueue } from '@/rate-limit-queue.js'

const VALID_SHARDS = ['steam', 'xbox', 'kakao']
const DEFAULT_FETCH_INTERVAL_MS = 1000 * 60 * 3
export const knownBadPlayers = new TemporarySet(DEFAULT_FETCH_INTERVAL_MS)

export function shouldFetch(player, playerKey) {
    const minFetchIntervalMs = get(player, 'fetchIntervalMs') || DEFAULT_FETCH_INTERVAL_MS

    return !knownBadPlayers.has(playerKey) && (
        !player
        || !player.lastFetchedAt
        || moment.utc().diff(moment.utc(player.lastFetchedAt), 'ms') > minFetchIntervalMs
    )
}

export default {
    Player: {
        async matches(parent, args, { models }, info) {
            return models.Match.findAll(parent.shardId, parent.id)
        },
    },

    Query: {
        async player(parent, { name, shardId }, { models, PubgApi }) {
            if (!VALID_SHARDS.includes(shardId)) return null

            const playerKey = `${name}-${shardId}`
            let player = await models.Player.find(shardId, { name })

            if (player && player.lastFetchedAt) {
                const ago = moment.utc().diff(moment.utc(player.lastFetchedAt), 'minute')
                console.log(`Player ${player.name} last fetched at ${player.lastFetchedAt} (${ago} min ago)`)
            }

            if (shouldFetch(player, playerKey)) {
                try {
                    const pubgPlayer = await PubgApi.getPlayer(shardId, name)

                    if (!pubgPlayer) {
                        knownBadPlayers.add(playerKey)
                        return null
                    }

                    player = await models.Player.createOrUpdate(pubgPlayer)
                } catch (e) {
                    if (e.toString().includes('Rate limited')) {
                        if (!player) player = { matches: [] }

                        player.rateLimitReset = e.reset
                        player.rateLimitAhead = playerFetchQueue.length() + playerFetchQueue.running()
                        player.rateLimitPlayerKey = playerKey

                        playerFetchQueue.push({ shardId, name, playerKey })
                    } else {
                        throw e
                    }
                }
            }

            if (player && player.name) {
                const idsToLoad = await models.Match.findAllUnloadedIds(shardId, player.id)
                if (!isEmpty(idsToLoad)) {
                    console.log(`Loading ${idsToLoad.length} matches for ${player.name}`)

                    const pubgMatches = await Promise.map(idsToLoad, PubgApi.getMatch, {
                        concurrency: 50,
                    })
                    await models.Match.create(pubgMatches)

                    player = await models.Player.find(shardId, { name })
                }
            }

            return player
        },
    },
}
