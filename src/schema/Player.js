export default `
    type Player {
        id: String!
        name: String!
        matches: [Match!]
    }

    type Query {
        player(name: String!): Player
    }
`
