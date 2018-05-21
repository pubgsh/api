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

            const shouldFetch = !player
                || !player.lastFetchedAt
                || moment.utc().diff(moment.utc(player.lastFetchedAt), 'minute') > 15

            if (shouldFetch) {
                const pubgPlayer = await pubgApi.getPlayer(shardId, name)
                if (!pubgPlayer) return null

                player = await models.Player.create(pubgPlayer)

                const matchesToLoad = await models.Match.findAllUnloaded(shardId, player.id)
                if (!isEmpty(matchesToLoad)) {
                    console.log(`Loading ${matchesToLoad.length} matches for ${player.name}`)

                    const pubgMatches = await Promise.map(matchesToLoad, m => {
                        return pubgApi.getMatch(m.id)
                    }, { concurrency: 5 })

                    await models.Match.createAll(pubgMatches)

                    player = await models.Player.find(shardId, { name })
                }
            }

            player.shardId = shardId
            return player
        },
    },
}
