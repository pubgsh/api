export default {
    Player: {
        async matches(parent, args, { models }, info) {
            return models.Player.findMatchIds(parent.id)
        },
    },

    Query: {
        async player(parent, { name }, { models, pubgApi }) {
            let player = await models.Player.find({ name })

            if (!player) {
                const pubgPlayer = await pubgApi.getPlayer(name)
                if (!pubgPlayer) return null

                player = await models.Player.create(pubgPlayer)
            }

            return player
        },
    },
}
