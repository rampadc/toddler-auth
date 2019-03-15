import {Authenticator} from "./Authenticator";
import {Secrets} from "./Secrets";
import {Log} from "./common/Log";

/*******************************************************************************************************************
 * Check for credentials from Docker Swarm secrets
 ******************************************************************************************************************/
const username = Secrets.get('USERNAME') || process.env.USERNAME as string || '';
const password = Secrets.get('PASSWORD') || process.env.PASSWORD as string || '';
const worldId  = Secrets.get('WORLD_ID') || process.env.WORLD_ID as string || '';
const mqUrl = process.env.MQ_URL || '';

if (username.trim().length == 0 || password.trim().length == 0 || worldId.trim().length == 0) {
    Log.service('auth').error('Username, password or world id are not provided.');
    process.exit(1);
}

if (mqUrl.trim().length == 0) {
    Log.service('auth').error('MQ URL is not provided.');
    process.exit(1);
}

/*******************************************************************************************************************
 * Initiates login process
 ******************************************************************************************************************/
let authenticator = Authenticator.shared;
authenticator.configureMQ(mqUrl);

Log.service('auth').info('Initializing authentication service...');

authenticator.login(username, password, worldId);

/*******************************************************************************************************************
 * Status checking
 ******************************************************************************************************************/
let isReadyTimer = setInterval(checkReadiness, 3000);
function checkReadiness() {
    if (!authenticator.isAuthenticated()) {
        Log.service('auth').error('Socket client is not authenticated');
        return;
    } else {
        Log.service('auth').debug('Socket client is authenticated');
    }

    if (!authenticator.isMQSetupCompleted()) {
        Log.service('auth').error('MQ setup not completed');
        authenticator.connectMQ();
        return;
    } else {
        Log.service('auth').debug('MQ setup completed');
    }

    Log.service('auth').info('Initialization completed');
    clearInterval(isReadyTimer);
}