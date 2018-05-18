import moment from 'moment'

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
            }

            player.shardId = shardId
            return player
        },
    },
}
