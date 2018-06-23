import Promise from 'bluebird'
import moment from 'moment'
import { isEmpty } from 'lodash'
import { playerFetchQueue } from '@/rate-limit-queue.js'

// TODO: This needs to expire players after some time so that they can be searched for again.
export const knownBadPlayers = new Set()

export function shouldFetch(player, playerKey) {
    return !knownBadPlayers.has(playerKey) && (
        !player
        || !player.lastFetchedAt
        || moment.utc().diff(moment.utc(player.lastFetchedAt), 'minute') > 3
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
                        concurrency: 25,
                    })
                    await models.Match.create(pubgMatches)

                    player = await models.Player.find(shardId, { name })
                }
            }

            return player
        },
    },
}
