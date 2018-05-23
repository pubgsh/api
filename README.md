# pubg.sh-api

The API component of [https://pubg.sh](https://pubg.sh). See also [apazzolini/pubg.sh-client](https://github.com/apazzolini/pubg.sh-client).

## Overview

This app provides a caching layer in front of the [PUBG Official API](https://documentation.playbattlegrounds.com/en/introduction.html) and exposes the underlying data via GraphQL. It's responsible for parsing the retrieved data into a normalized schema and returning info about players and the matches they've participated in.

## Running

### Requirements

- PostgresQL
- Node version 8+
- yarn

### Configuration

1. Create `.env.local` [dotenv](https://github.com/motdotla/dotenv) file in the root of the project and provide the following values:

- `HAPI_PORT` (optional, defaults to 8080)
- `HOST` (optional, defaults to 0.0.0.0)
- `PGUSER`
- `PGHOST`
- `PGPASSWORD`
- `PGDATABASE`
- `PUBG_API_KEY`

2. Manually run the `test/seed.sql` file against your database or enable the `recreateDb()` call in `src/app.js`

### Running

Simply run `yarn start` and visit http://localhost:8080/graphiql to confirm it's up.

### Testing

`yarn run test` or `yarn run test:watch` will run the test suite with Jest.

Note that the majority of tests will require an available PostgreSQL database. Each test will run in its own self-contained DB seeded with `test/seed.sql` and the DB will be dropped after the test.

Also note that some tests use `global.__Fixture`. This provides an easy way to automatically cache HTTP requests into a local `__fixtures__` folder to ensure tests remain stable and don't require network connectivity when run in a CI environment. Toggling the `mock` option to true will cause requests to only be served from the file system cache. Setting `mock` to false will allow all outgoing HTTP Axios requets and then write their responses to the file system.

> The fixture helper will automatically remove the `Authorization` header from being written to the FS. Be aware that any other sensitive information must have a manual exclusion added.
