export default `
    type Player {
        id: String!
        name: String!
        matches: [Match!]
    }

    type Query {
        player(shardId: String!, name: String!): Player
    }
`
