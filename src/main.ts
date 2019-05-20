import {Authenticator} from "./Authenticator";
import {Secrets} from "./Secrets";
import {Log} from "./Log";

import {connect, NatsConnectionOptions, Payload} from 'ts-nats';
import {GameTypes} from "./Providers";
import {ISocketMessage} from "./ISocketMessage";

/*******************************************************************************************************************
 * Check for credentials from Docker Swarm secrets
 ******************************************************************************************************************/
const username = Secrets.get('TODDLER_USERNAME') || process.env.TODDLER_USERNAME as string || 'Simp1eUs3rname';
const password = Secrets.get('TODDLER_PASSWORD') || process.env.TODDLER_PASSWORD as string || 'Passw0rd';
const worldId = Secrets.get('TODDLER_WORLD_ID') || process.env.TODDLER_WORLD_ID as string || 'en41';

if (username.trim().length == 0 || password.trim().length == 0 || worldId.trim().length == 0) {
  Log.service().error('Username, password or world id are not provided.');
    process.exit(1);
}

process.on('SIGINT', function () {
  authenticator.logout(error => {
    process.exit(error ? 1 : 0);
  });
});

/*******************************************************************************************************************
 * Initiates login process
 ******************************************************************************************************************/
let authenticator = Authenticator.shared;

Log.service().info('Initializing authentication service...');

Promise.all([
  authenticator.login(username, password, worldId),
  connect() // connects to nats://localhost:4222 by default
]).then((values) => {
  const natsClient = values[1];

  authenticator.request({
    type: GameTypes.MAP_GETVILLAGES,
    data: {
      x: 500, y: 500, width: 5, height: 5
    }
  }).then(msg => {
    console.log(msg);
    process.exit(0);
  })
}).catch((error) => {
  console.log(error);
});

/*******************************************************************************************************************
 * Status checking
 ******************************************************************************************************************/
