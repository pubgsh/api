export const MatchFields = `
    id: String!
    shardId: String!
    gameMode: String
    playedAt: String
    mapName: String
    durationSeconds: Int
    telemetryUrl: String
`

export default `
    type MatchStats {
        kills: Int!
        winPlace: Int!
    }

    type MatchPlayer {
        id: String!
        name: String!
        rosterId: String!
        stats: MatchStats!
    }

    type Match {
        ${MatchFields}
        players: [MatchPlayer!]!
    }

    type SampleMatch {
        id: String!
        playerName: String!
        shardId: String!
    }

    type Query {
        match(id: String!): Match!
        sampleMatch(shardId: String!): SampleMatch!
    }
`
