export default `
    type Player {
        id: String
        name: String
        lastFetchedAt: String
        matches: [Match!]
        rateLimitReset: Float
        rateLimitAhead: Int
        rateLimitPlayerKey: String
    }

    type Query {
        player(shardId: String!, name: String!): Player
    }
`
