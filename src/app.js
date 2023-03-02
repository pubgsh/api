import 'dotenv/config';
import sqlite from 'sqlite';
import path from 'path';
import Hapi from 'hapi';
import socketio from 'socket.io';
import fs from 'fs';
import { sql } from 'pgr';
import { graphqlHapi, graphiqlHapi } from 'apollo-server-hapi';
import { makeExecutableSchema } from 'graphql-tools';
import { fileLoader, mergeTypes, mergeResolvers } from 'merge-graphql-schemas';
import depthLimit from 'graphql-depth-limit';
import models from '@/models';
import PubgApi from '@/lib/pubg-api.js';

let io;
export let db; // eslint-disable-line
export const getIo = () => io;

export const server =
  process.env.NODE_ENV === 'test'
    ? Hapi.server({ autoListen: false })
    : Hapi.server({
        port: process.env.HAPI_PORT || 8080,
        host: process.env.HOST || '0.0.0.0',
        routes: { cors: true },
      });

function createSchema() {
  const typeDefs = mergeTypes(fileLoader(path.join(__dirname, './schema')));
  const resolvers = mergeResolvers(fileLoader(path.join(__dirname, './resolvers/!(*.test).js')));

  return makeExecutableSchema({
    typeDefs,
    resolvers,
  });
}

export async function registerGraphql() {
  return server.register({
    plugin: graphqlHapi,
    options: {
      path: '/graphql',
      graphqlOptions: {
        schema: createSchema(),
        context: {
          models,
          PubgApi,
        },
        validationRules: [depthLimit(4)],
      },
      route: {
        cors: true,
      },
    },
  });
}

async function registerGraphiql() {
  return server.register({
    plugin: graphiqlHapi,
    options: {
      path: '/graphiql',
      graphiqlOptions: {
        endpointURL: '/graphql',
      },
    },
  });
}

async function recreateDb() {
  // eslint-disable-line
  const seed = sql.raw(fs.readFileSync(path.join(__dirname, '../test/seed.sql'), 'utf-8'));
  await db.exec(sql`${seed}`.getStatement());
  console.log('Recreated DB', await db.get("select current_timestamp"));
}

async function deleteOldMatches() {
  // Note that this will cascade deletes through to match_players
  await db.exec(
    sql`DELETE FROM matches WHERE played_at < date(current_timestamp, '-14 DAY')`.getStatement(),
  );
}

async function init() {
  db = await sqlite.open(':memory:', { cached: true });

  await recreateDb();
  await registerGraphql();
  await registerGraphiql();

  await server.start();
  io = socketio(server.listener);
  console.log(`Server running at: ${server.info.uri}`);

  setInterval(deleteOldMatches, 10 * 60 * 1000);
}

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error(err);
  process.exit(1);
});

if (require.main === module) {
  init();
}
