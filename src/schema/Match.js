export default `
    type Match {
        id: String!
        gameMode: String
        playedAt: String
        mapName: String
        durationSeconds: Int
        telemetryUrl: String
    }

    type Query {
        match(id: String!): Match!
    }
`
