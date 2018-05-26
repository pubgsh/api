export default {
    Match: {
        async players(parent, args, { models }, info) {
            // TODO: Batch load with DataLoader
            return models.MatchPlayer.findAll(parent.id)
        },
    },

    Query: {
        async match(parent, { id }, { models, PubgApi }) {
            let match = await models.Match.find(id)

            if (!match || !match.gameMode) {
                const pubgMatch = await PubgApi.getMatch(id)
                match = await models.Match.create(pubgMatch)
            }

            return match
        },
    },
}

