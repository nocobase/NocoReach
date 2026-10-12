import {
  defaultAppConfigs,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import auth from './auth.js';
import mail from './mail.js';
import authorization from './authorization.js';
import notification from './notification.js';
import secrets from './secrets.js';
import session from './session.js';
import server from './server.js';
import spa from './spa.js';
import logging from './logging.js';
import drive from './drive.js';
import queue from './queue.js';
import jobs from './jobs.js';
import scheduler from './scheduler.js';
import caching from './caching.js';
import i18n from './i18n.js';
import app from './app.js';
import api from './api.js';
import database from './database.js';
import snowflake from './snowflake.js';
import users from './users.js';
import nocoreach from './nocoreach.js';
import agents from './agents.js';
import nocoreachMock from './nocoreach-mock.js';

const defaultConfigs: AppConfigFactory<{
  auth: ReturnType<typeof auth>;
  mail: ReturnType<typeof mail>;
  authorization: ReturnType<typeof authorization>;
  notification: ReturnType<typeof notification>;
  secrets: ReturnType<typeof secrets>;
  session: ReturnType<typeof session>;
  server: ReturnType<typeof server>;
  spa: ReturnType<typeof spa>;
  logging: ReturnType<typeof logging>;
  drive: ReturnType<typeof drive>;
  queue: ReturnType<typeof queue>;
  jobs: ReturnType<typeof jobs>;
  scheduler: ReturnType<typeof scheduler>;
  caching: ReturnType<typeof caching>;
  i18n: ReturnType<typeof i18n>;
  app: ReturnType<typeof app>;
  api: ReturnType<typeof api>;
  database: ReturnType<typeof database>;
  snowflake: ReturnType<typeof snowflake>;
  users: ReturnType<typeof users>;
  nocoreach: ReturnType<typeof nocoreach>;
  agents: ReturnType<typeof agents>;
  nocoreachMock: ReturnType<typeof nocoreachMock>;
}> = defaultAppConfigs({
  auth,
  mail,
  authorization,
  notification,
  secrets,
  session,
  server,
  spa,
  logging,
  drive,
  queue,
  jobs,
  scheduler,
  caching,
  i18n,
  app,
  api,
  database,
  snowflake,
  users,
  nocoreach,
  agents,
  nocoreachMock,
});

export default defaultConfigs;
