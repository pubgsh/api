export default `
    type MatchPlayer {
        id: String!
        name: String!
        rosterId: String!
        stats: String!
    }

    type Match {
        id: String!
        gameMode: String
        playedAt: String
        mapName: String
        durationSeconds: Int
        telemetryUrl: String
        players: [MatchPlayer!]!
    }

    type Query {
        match(id: String!): Match!
    }
`
