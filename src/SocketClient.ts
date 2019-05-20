import io from "socket.io-client";
import {EventEmitter} from "events"
import {ISocketMessage} from "./ISocketMessage";
import {IMessageReply} from "./IMessageReply";
import {Log} from "./Log";

export enum SocketClientEvent {
    messageReceived = "message received",
    disconnected = 'socket disconnected',
    connected = 'socket connected'
}

export class SocketClient extends EventEmitter {
    socket: SocketIOClient.Socket = io("https://en.tribalwars2.com/", {
        query: "platform=desktop",
        transports: ["websocket", "polling", "polling-jsonp", "polling-xhr"],
        autoConnect: false
    });
    private static _instance: SocketClient;

    private _msgId = 1;
    private _replyQueue: IMessageReply[] = [];

    private constructor() {
        super();
        this.setupSocketIOMsgHandlers();
    }

    public static get shared(): SocketClient {
        return this._instance || (this._instance = new this());
    }

    connect() {
        if (!this.socket.connected) this.socket.open();
    }

    close() {
        if (this.socket.connected) this.socket.close();
    }

    isConnected(): boolean {
        return this.socket.connected;
    }

    setupSocketIOMsgHandlers(): void {
        // It doesn't matter when the socket connects. When the socket is connected, the game automatically
        // sends a message to the client.

        this.socket.on('connect', () => {
          Log.service().info('Socket connected');
            this.emit(SocketClientEvent.connected);
        });
        this.socket.on("disconnect", () => {
          Log.service().info('Socket disconnected');
            this.emit(SocketClientEvent.disconnected);
        });

        this.socket.on("msg", (messageObject: ISocketMessage) => {
            Log.socket.debug(JSON.stringify(messageObject));
            this.reply(messageObject);
        });

    }

    fire(message: ISocketMessage) {
        if (isNaN(this._msgId)) {
            this._msgId = 1;
        }
        let msgId = this._msgId++;

        message.id = msgId;
        let gameMsg = {
            type: message.type,
            data: message.data,
            id: msgId,
            headers: {
                traveltimes: [["browser_send", Date.now()]]
            }
        };
        Log.socket.debug(JSON.stringify(gameMsg));
        this.socket.emit("msg", gameMsg);
    }

    request(message: ISocketMessage, reply: (replyMsg: ISocketMessage) => void) {
        if (isNaN(this._msgId)) {
            this._msgId = 1;
        }
        let msgId = this._msgId++;

        message.id = msgId;
        this._replyQueue.push({
            message: message,
            replyFn: reply
        });

        let gameMsg = {
            type: message.type,
            data: message.data,
            id: msgId,
            headers: {
                traveltimes: [["browser_send", Date.now()]]
            }
        };
        Log.socket.debug(JSON.stringify(gameMsg));
        this.socket.emit("msg", gameMsg);
    }

    reply(message: ISocketMessage) {
        this._msgId = message.id! + 1;

        for (let i = this._replyQueue.length - 1; i >= 0; i--) {
            if (this._replyQueue[i].message.id == message.id) {
                this._replyQueue[i].replyFn(message);

                this._replyQueue.splice(i, 1);
                return;
            }
        }

        Log.service().info('Message to be sent to authenticator');

        // reached the end but cannot find a match for RPC
        this.emit(SocketClientEvent.messageReceived, message);
    }
}
