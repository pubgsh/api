import Promise from 'bluebird'
import moment from 'moment'
import { isEmpty } from 'lodash'

export default {
    Player: {
        async matches(parent, args, { models }, info) {
            return models.Match.findAll(parent.shardId, parent.id)
        },
    },

    Query: {
        async player(parent, { name, shardId }, { models, pubgApi }) {
            let player = await models.Player.find(shardId, { name })

            if (player) {
                const ago = moment.utc().diff(moment.utc(player.lastFetchedAt), 'minute')
                console.log(`Player ${player.name} last fetched at ${player.lastFetchedAt} (${ago} min ago)`)
            }

            const shouldFetch = !player
                || !player.lastFetchedAt
                || moment.utc().diff(moment.utc(player.lastFetchedAt), 'minute') > 15

            if (shouldFetch) {
                const pubgPlayer = await pubgApi.getPlayer(shardId, name)
                if (!pubgPlayer) return null

                player = await models.Player.create(pubgPlayer)

                const idsToLoad = await models.Match.findAllUnloadedIds(shardId, player.id)
                if (!isEmpty(idsToLoad)) {
                    console.log(`Loading ${idsToLoad.length} matches for ${player.name}`)

                    const pubgMatches = await Promise.map(idsToLoad, pubgApi.getMatch, { concurrency: 10 })
                    await models.Match.createAll(pubgMatches)

                    player = await models.Player.find(shardId, { name })
                }
            }

            player.shardId = shardId
            return player
        },
    },
}
