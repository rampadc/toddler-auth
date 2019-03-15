import {SocketClient, SocketClientEvent} from "./SocketClient";
import {ISocketMessage} from "./common/ISocketMessage";
import {MQEvent} from "./common/MQEvent";
import {Log} from "./common/Log";
import {MQRpcServer} from "./common/MQRpcServer";
import amqp from "amqplib";
import {MQProducer} from "./common/MQProducer";
import {MQConsumer} from "./common/MQConsumer";

/**
 * Authenticator class authenticates user to game if not connected
 */
export class Authenticator {
    private static _instance: Authenticator;

    private _socketClient = SocketClient.shared;

    private _username = '';
    private _password = '';
    private _worldId = '';
    private _playerId = -1;

    private _authenticated = false;
    private _loggedIn = false;
    private _loginInProgress = false;
    private _socketPreviouslyDisconnected = false;
    private _authResting = false;
    private _authRestPeriod = 3000;

    private _rpcServerMQ = MQRpcServer.shared;
    private _producerMQ = MQProducer.shared;
    private _consumerMQ = MQConsumer.shared;

    private constructor() {
        this.addSocketEventListeners();
        this.addMQEventListeners();

        this._socketClient.connect();
    }

    public static get shared(): Authenticator {
        return this._instance || (this._instance = new this());
    }

    /*******************************************************************************************************************
     * Status checking functions
     ******************************************************************************************************************/

    /**
     * isAuthenticated() returns if the client is authenticated using player's provided credentials
     */
    isAuthenticated(): boolean {
        return this._authenticated;
    }

    isMQSetupCompleted(): boolean {
        return this._consumerMQ.connected && this._producerMQ.connected && this._rpcServerMQ.connected;
    }

    /*******************************************************************************************************************
     * Authentication functions
     ******************************************************************************************************************/

    /**
     * Provide player creds
     * @param username
     * @param password
     * @param worldId
     */
    login(username: string, password: string, worldId: string) {
        this._username = username;
        this._password = password;
        this._worldId = worldId;
    }

    private _selectWorld() {
        if (!this._loggedIn) {
            Log.service('auth').error('Player is not logged in to select world.');
            return;
        }
        if (this._worldId == '') {
            Log.service('auth').error('World ID is not supplied.');
            return;
        }

        Log.service('auth').debug(`Selecting world ${this._worldId} for player ID ${this._playerId}`);
        this._socketClient.request({
            type: 'Authentication/selectCharacter',
            data: {
                id: this._playerId,
                world_id: this._worldId
            }
        }, replyMsg => {
            if (replyMsg.type.toLowerCase() != 'authentication/characterselected') {
                Log.service('auth').error('World selection failed');
            } else {
                Log.service('auth').info('World selection successful');
                this._loginInProgress = false;
                this._authenticated = true;

                // complete login sequence
                this._completeLoginSequence();
                this.connectMQ();
            }
        });
    }

    private _completeLoginSequence() {
        this._socketClient.fire({
            type: 'Authentication/completeLogin',
            data: {}
        });
    }

    /**
     * Login code
     */
    private _login() {
        if (this._username == '' || this._password == '') {
            Log.service('auth').error('Username/password is not supplied.');
            return;
        }

        if (!this._socketClient.isConnected()) {
            Log.service('auth').error('Socket client is not connected.');
            return;
        }
        if (this._loginInProgress) {
            Log.service('auth').error('Player is logging in already.');
            return;
        }
        if (this._authResting) {
            Log.service('auth').debug(`Try login again in ${this._authRestPeriod} seconds`);
        }

        // do not allow further login/logout attempts for timeout period
        this.authTimeout();

        if (this.isAuthenticated()) {
            // logout first
            this._socketClient.request({
                type: 'Authentication/logout',
                data: {
                    name: this._username,
                    pass: this._password
                }
            }, replyMsg => {
                if (replyMsg.type.toLowerCase() != 'logout/success') {
                    Log.service('auth').error('Logout failed');
                } else {
                    Log.service('auth').info('Logout successful');
                    this._loginInProgress = false;
                    this._authenticated = false;

                    this.disconnectMQ();
                }
            });
        } else {
            // login first
            this._loginInProgress = true;
            this._socketClient.request({
                type: 'Authentication/login',
                data: {
                    name: this._username,
                    pass: this._password
                }
            }, replyMsg => {
                if (replyMsg.type.toLowerCase() != 'login/success') {
                    Log.service('auth').error('Login failed');
                } else {
                    Log.service('auth').info('Login successful');
                    this._loggedIn = true;
                    Log.service('auth').info('Selecting world...');

                    this._playerId = replyMsg.data['player_id'];
                    this._selectWorld();
                }
            });
        }
    }

    private authTimeout() {
        this._authResting = true;
        setTimeout(() => {
            this._authResting = false;
        }, this._authRestPeriod);
    }

    /**
     * addMQEventListeners() add event listeners for outgoing and incoming messages to the
     * socket service.
     */
    private addMQEventListeners() {
        this._rpcServerMQ.on(MQEvent.rpcMessageReceived, (mqMsg, socketMsg) => {
            this.onRpcMessageReceived(mqMsg, socketMsg);
        });

        this._consumerMQ.on(MQEvent.fireForgetMessageReceived, (socketMsg) => {
            this.onFireForgetMessageReceived(socketMsg);
        });
    }


    /**
     * addSocketEventListeners() add event listeners for outgoing and incoming messages to and
     * from the game socket.io server
     */
    private addSocketEventListeners() {
        this._socketClient.on(SocketClientEvent.messageReceived, (message: ISocketMessage) => {
            this.onUnattachedGameMessageReceived(message);
        });

        this._socketClient.on(SocketClientEvent.disconnected, () => {
            this.onSocketDisconnection();
        });

        this._socketClient.on(SocketClientEvent.connected, () => {
            this.onSocketConnection();
        });
    }

    /*******************************************************************************************************************
     * Message queue initialisation and event handlers
     ******************************************************************************************************************/

    configureMQ(mqUrl: string) {
        this._rpcServerMQ.setConnectionProperties(mqUrl, 'game.rpc', 'auth');
        this._producerMQ.setConnectionProperties(mqUrl, 'from.game.exchange', 'auth');
        this._consumerMQ.setConnectionProperties(mqUrl, 'to.game.exchange', 'auth');
    }

    /**
     * connectMQ() establishes MQ connections
     */
    connectMQ() {
        this._rpcServerMQ.connect();
        this._producerMQ.connect();
        this._consumerMQ.connect();
    }

    disconnectMQ() {
        this._rpcServerMQ.disconnect();
        this._producerMQ.disconnect();
        this._consumerMQ.disconnect();
    }

    private _processOnceAuthenticated(socketMessage: ISocketMessage, rpcReceivedMessage: amqp.ConsumeMessage | null) {
        // place message into internal queue to be processed
        // TODO: Needs to identify when this edge case occurs
        this._login();
    }

    private onRpcMessageReceived(mqMessage: amqp.ConsumeMessage, socketMessage: ISocketMessage) {
        if (this._socketClient.isConnected()) {
            Log.socket.debug(JSON.stringify(socketMessage));

            if (this.isAuthenticated()) {
                this._socketClient.request(socketMessage, replyMsg => {
                    this._rpcServerMQ.reply(mqMessage, replyMsg);
                });
            } else {
                this._processOnceAuthenticated(socketMessage, mqMessage);
            }
        } else {
            Log.service('auth').debug('socket client is not connected, RPC message ignored');
        }
    }

    private onFireForgetMessageReceived(socketMessage: ISocketMessage) {
        if (this._socketClient.isConnected()) {
            Log.socket.silly(JSON.stringify(socketMessage));

            if (this.isAuthenticated()) {
                this._socketClient.fire(socketMessage);
            } else {
                this._processOnceAuthenticated(socketMessage, null);
            }
        }
    }

    /*******************************************************************************************************************
     * Socket.io-client event handlers
     ******************************************************************************************************************/

    /**
     * This event handler handles messages received on game socket to be distributed to
     * other services on the message bus. Aside from dumb message sending by topic, this handler
     * determines if a message is to be sent as RPC as well to requester.
     *
     * @param message socket.io message from game
     */
    private onUnattachedGameMessageReceived(message: ISocketMessage) {
        if (message.type.toLowerCase() == 'system/welcome') {
            this._login();
            return;
        }

        this._producerMQ.send(message);
    }

    private onSocketDisconnection() {
        this._socketPreviouslyDisconnected = true;

        // reconnect
        setTimeout(() => {
            this._socketClient.connect();
        }, 3000);
    }

    private onSocketConnection() {
        // if socket is previously disconnected
        if (this._socketPreviouslyDisconnected) {
            this._socketPreviouslyDisconnected = false;

            this._login();
        }
    }
}