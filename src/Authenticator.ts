import {SocketClient, SocketClientEvent} from "./SocketClient";
import {ISocketMessage} from "./ISocketMessage";
import {Log} from "./Log";
import EventEmitter from 'events';
import {AuthenticatorEvent} from "./AuthenticatorEvent";
import {GameEvents} from "./Providers";

/**
 * Authenticator class authenticates user to game if not connected
 */
export class Authenticator extends EventEmitter {
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

  private constructor() {
    super();

    this.addSocketEventListeners();
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

  /*******************************************************************************************************************
   * Authentication functions
   ******************************************************************************************************************/

  /**
   * Provide player creds
   * @param username
   * @param password
   * @param worldId
   */
  login(username: string, password: string, worldId: string): Promise<string> {
    this._username = username;
    this._password = password;
    this._worldId = worldId;
    this._socketClient.connect();

    return new Promise<string>((resolve, reject) => {
      this.on(AuthenticatorEvent.loginFailed, (error) => {
        reject(error);
      });

      this.on(AuthenticatorEvent.loggedIn, () => {
        resolve('logged in');
      });
    });
  }

  logout(done: (error: boolean) => void) {
    if (this.isAuthenticated()) {
      this._socketClient.request({
        type: 'Authentication/logout',
        data: {
          name: this._username,
          pass: this._password
        }
      }, replyMsg => {
        if (replyMsg.type.toLowerCase() != 'logout/success') {
          Log.service().error('Logout failed');
          this.emit(AuthenticatorEvent.logoutFailed);
          done(true);
        } else {
          Log.service().info('Logout successful');
          this._loginInProgress = false;
          this._authenticated = false;
          this.emit(AuthenticatorEvent.loggedOut);
          done(false);
        }
      });
    } else {
      done(true);
    }
  }

  fire(message: ISocketMessage) {
    if (this.isAuthenticated()) {
      this._socketClient.fire(message);
    }
  }

  request(message: ISocketMessage): Promise<ISocketMessage> {
    return new Promise<ISocketMessage>((resolve, reject) => {
      if (!this.isAuthenticated()) {
        reject(null);
      } else {
        this._socketClient.request(message, replyMsg => {
          resolve(replyMsg);
        })
      }
    });
  }

  private _selectWorld() {
    if (!this._loggedIn) {
      Log.service().error('Player is not logged in to select world.');
      this.emit(AuthenticatorEvent.loginFailed, 'Player is not logged in to select world.');
      return;
    }
    if (this._worldId == '') {
      Log.service().error('World ID is not supplied.');
      this.emit(AuthenticatorEvent.loginFailed, 'World ID is not supplied.');
      return;
    }

    Log.service().debug(`Selecting world ${this._worldId} for player ID ${this._playerId}`);
    this._socketClient.request({
      type: 'Authentication/selectCharacter',
      data: {
        id: this._playerId,
        world_id: this._worldId
      }
    }, replyMsg => {
      if (replyMsg.type.toLowerCase() != 'authentication/characterselected') {
        Log.service().error('World selection failed');
        this.emit(AuthenticatorEvent.loginFailed, 'Invalid world for character');
      } else {
        Log.service().info('World selection successful');
        this._loginInProgress = false;
        this._authenticated = true;

        // complete login sequence
        this._completeLoginSequence();
      }
    });
  }

  private _completeLoginSequence() {
    this._socketClient.fire({
      type: 'Authentication/completeLogin',
      data: {}
    });
    this.emit(AuthenticatorEvent.loggedIn);
  }

  /**
   * Login code
   */
  private _login() {
    if (this._username == '' || this._password == '') {
      Log.service().error('Username/password is not supplied.');
      this.emit(AuthenticatorEvent.loginFailed, {error: 'username/password is not supplied'});
      return;
    }

    if (!this._socketClient.isConnected()) {
      Log.service().error('Socket client is not connected.');
      return;
    }
    if (this._loginInProgress) {
      Log.service().error('Player is logging in already.');
      return;
    }
    if (this._authResting) {
      Log.service().debug(`Try login again in ${this._authRestPeriod} seconds`);
    }

    // do not allow further login/logout attempts for timeout period
    this.authTimeout();

    if (this.isAuthenticated()) {
      // logout first
      this.logout(() => {
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
        if (replyMsg.type.toLowerCase() == 'login/success') {
          Log.service().info('Login successful');
          this._loggedIn = true;
          Log.service().info('Selecting world...');

          this._playerId = replyMsg.data['player_id'];
          this._selectWorld();
        } else {
          if (replyMsg.type.toLowerCase() == 'system/error') {
            if ((replyMsg.data['cause'] as string).includes('Authentication')) {
              this.emit(AuthenticatorEvent.loginFailed, replyMsg.data['message']);
            }
          }
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
    } else {
      this.emit(AuthenticatorEvent.unattachedMessageReceived, message);
    }
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