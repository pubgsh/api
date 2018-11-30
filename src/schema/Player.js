import { MatchFields } from './Match.js'

export default `
    type Player {
        id: String
        name: String
        lastFetchedAt: String
        matches: [PlayerMatch!]
        rateLimitReset: Float
        rateLimitAhead: Int
        rateLimitPlayerKey: String
    }

    type PlayerMatch {
        ${MatchFields}
        stats: MatchStats!
    }

    type Query {
        player(shardId: String!, name: String!): Player
    }
`
