import {Authenticator} from "./Authenticator";
import {Secrets} from "./Secrets";
import {Log} from "./Log";

import {Client, connect, Payload, Subscription} from 'ts-nats';
import {GameTypes} from "./Providers";
import {AuthenticatorEvent} from "./AuthenticatorEvent";
import {ISocketMessage} from "./ISocketMessage";

/*******************************************************************************************************************
 * Check for credentials from Docker Swarm secrets
 ******************************************************************************************************************/
const username = Secrets.get('TODDLER_USERNAME') || process.env.TODDLER_USERNAME as string || '';
const password = Secrets.get('TODDLER_PASSWORD') || process.env.TODDLER_PASSWORD as string || '';
const worldId = Secrets.get('TODDLER_WORLD_ID') || process.env.TODDLER_WORLD_ID as string || '';
const natsUri = process.env.TODDLER_NATS_URI || '';
let nc: Client;

if (username.trim().length == 0 || password.trim().length == 0 || worldId.trim().length == 0 || natsUri.trim().length == 0) {
  Log.service().error('Username, password or world id are not provided.');
    process.exit(1);
}

process.on('SIGINT', function () {
  gracefullyExit();
});

/*******************************************************************************************************************
 * Initiates login process
 ******************************************************************************************************************/
let authenticator = Authenticator.shared;

Log.service().info('Initializing authentication service...');

Promise.all([
  authenticator.login(username, password, worldId),
  connect({
    servers: [natsUri],
    payload: Payload.JSON, reconnect: true
  }) // connects to nats://localhost:4222 by default
]).then((values) => {
  nc = values[1];

  // set up subscriptions to process requests
  setupSubscriptionsToProcessRequests(nc, [
    GameTypes.CHAR_GET_INFO,
    GameTypes.CHAR_GET_PROFILE,
    GameTypes.TRIBE_GET_PROFILE,
    GameTypes.ACHIEVEMENT_GET_CHAR_ACHIEVEMENTS,
    GameTypes.MAP_SET_TUTORIAL_VILLAGE_LOCATION,
    GameTypes.MAP_GET_NEAREST_BARBARIAN_VILLAGE,
    GameTypes.MAP_GETPROVINCE,
    GameTypes.MAP_GETVILLAGES,
    GameTypes.MAP_GET_TRIBES_NEAR_VILLAGE,
    GameTypes.MAP_GET_VILLAGE_DETAILS,
    GameTypes.MAP_GET_PROVINCE_CONFIG,
    GameTypes.MAP_GET_KINGDOMS,
    GameTypes.BUILDING_GET_DATA,
    GameTypes.VILLAGE_GET_VILLAGE,
    GameTypes.VILLAGE_GET_BUILDING_QUEUE,
    GameTypes.BUILDING_QUEUE_CANCEL_JOB,
    GameTypes.VILLAGE_WALL_INFO,
    GameTypes.VILLAGE_UNIT_INFO,
    GameTypes.VILLAGE_UPGRADE_BUILDING,
    GameTypes.VILLAGE_STORAGE_INFO,
    GameTypes.VILLAGE_RESEARCH_UNLOCK,
    GameTypes.VILLAGE_FARM_INFO,
    GameTypes.VILLAGES_IN_PROVINCE,
    GameTypes.GAME_DATA_BATCH_GET_GAME_DATA,
    GameTypes.VILLAGE_RESOURCE_INFO,
    GameTypes.GLOBAL_INFORMATION,
    GameTypes.TIMELINE_GET_EVENTS,
    GameTypes.TIMELINE_GET_DETAILS,
    GameTypes.HOSPITAL_GET_PATIENTS,
    GameTypes.VILLAGE_GET_UNITSCREEN_INFO,
    GameTypes.UNITSCREEN_SEND_SURPLUS_BACK,
    GameTypes.COMMAND_WITHDRAW_ALL_SUPPORT_FROM_VILLAGE,
    GameTypes.COMMAND_WITHDRAWSUPPORT,
    GameTypes.COMMAND_SEND_SUPPORT_BACK,
    GameTypes.COMMAND_IGNORE,
    GameTypes.REPORT_GET_LIST_REVERSE,
    GameTypes.REPORT_GET,
    GameTypes.REPORT_GET_BY_TOKEN,
    GameTypes.REPORT_DELETE,
    GameTypes.REPORT_MARK_READ,
    GameTypes.SEND_CUSTOM_ARMY,
    GameTypes.UNIT_MASS_RECRUITING,
    GameTypes.GET_ATTACKING_FACTOR,
    GameTypes.GET_OWN_COMMANDS,
    GameTypes.COMMAND_CANCEL,
    GameTypes.ACADEMY_GET_INFO,
    GameTypes.MINT_COINS,
    GameTypes.GET_TRAINING,
    GameTypes.GET_CHARACTER_VILLAGES,
    GameTypes.PRECEPTORY_SELECT_ORDER,
    GameTypes.PRECEPTORY_RESET_ORDER,
    GameTypes.BARRACKS_RECRUIT,
    GameTypes.ACADEMY_RECRUIT,
    GameTypes.PALADIN_GET_INFO,
    GameTypes.PALADIN_EQUIP_ITEM,
    GameTypes.PRECEPTORY_RECRUIT,
    GameTypes.PRECEPTORY_CANCEL_RECRUIT_JOB,
    GameTypes.ACADEMY_CANCEL_RECRUIT_JOB,
    GameTypes.BARRACKS_CANCEL_RECRUIT_JOB,
    GameTypes.SCOUTING_GET_INFO,
    GameTypes.SCOUTING_RECRUIT,
    GameTypes.SCOUTING_CANCEL_RECRUIT,
    GameTypes.SCOUTING_CANCEL_COMMAND,
    GameTypes.TRADING_SEND_RESOURCES,
    GameTypes.TRADING_GET_TRANSPORTS,
    GameTypes.TRADING_GET_MERCHANT_STATUS,
    GameTypes.TRADING_LIST_OFFERS,
    GameTypes.TRADING_CREATE_OFFER,
    GameTypes.TRADING_REMOVE_OFEER,
    GameTypes.TRADING_ACCEPT_OFEER,
    GameTypes.QUESTS_GET_QUEST_LINES,
    GameTypes.QUEST_FINISH_QUEST,
    GameTypes.OVERVIEW_GET_VILLAGES,
    GameTypes.OVERVIEW_GET_INCOMING,
    GameTypes.OVERVIEW_GET_COMMANDS,
    GameTypes.OVERVIEW_GET_UNITS,
    GameTypes.TRADING_CANCEL_TRANSPORT,
    GameTypes.TUTORIAL_START,
    GameTypes.TUTORIAL_GET_CURRENT_TASK,
    GameTypes.TUTORIAL_START,
    GameTypes.TUTORIAL_GET_VILLAGE_TO_ATTACK,
    GameTypes.SECOND_VILLAGE_GET_INFO,
    GameTypes.SECOND_VILLAGE_OPEN,
    GameTypes.SECOND_VILLAGE_START_JOB,
    GameTypes.SECOND_VILLAGE_COLLECT_JOB_REWARD,
    GameTypes.SECOND_VILLAGE_RENAME,
    GameTypes.SECOND_VILLAGE_FINISH_VILLAGE,
    GameTypes.PREMIUM_DAILY_UNIT_DEAL_ACCEPT,
    GameTypes.PREMIUM_DAILY_UNIT_DEAL_GET_OFFERS
  ])
    .then(setupSubscriptionToGame)
    .then(enableNotifications)
    .then(broadcastReady)
    .then(() => {
      Log.service().info('Ready for messages');
    })
    .catch(error => {
      Log.service().error(error);
    });
}).catch((error) => {
  Log.service().error(error);
  process.exit(1);
});

/*******************************************************************************************************************
 * Utility
 ******************************************************************************************************************/
function gracefullyExit() {
  nc.close();

  authenticator.logout(error => {
    if (error) process.exit(1);
    else process.exit(0);
  });
}

function setupSubscriptionsToProcessRequests(nc: Client, requestTypes: string[]): Promise<Subscription[]> {
  return Promise.all(requestTypes.map(type => {
    const subject = type.toLowerCase().replace('/', '.');
    return nc.subscribe(subject, (error, msg) => {
      if (error) {
        Log.service().error(error);
      } else if (msg.reply) {
        authenticator.request(msg.data).then(socketMsg => {
          nc.publish(msg.reply as string, socketMsg.data);
        }).catch(error => {
          Log.service().error(error);
        });
      } else {
        Log.service().debug('Unhandled subscription return message');
        Log.service().debug(msg);
      }
    })
  }));
}

function enableNotifications() {
  authenticator.fire({
    type: GameTypes.NOTIFICATION_GET_NOTIFICATIONS
  });
  authenticator.on(AuthenticatorEvent.unattachedMessageReceived, (msg: ISocketMessage) => {
    nc.publish(
      msg.type.toLowerCase().replace('/', '.'),
      msg.data);
  });
}

function broadcastReady() {
  nc.publish('authenticator.ready');
}

function setupSubscriptionToGame() {
  return nc.subscribe('authenticator.to.game', (err, msg) => {
    if (err) {
      Log.service().error(err);
    } else {
      authenticator.fire(msg.data);
    }
  });
}
