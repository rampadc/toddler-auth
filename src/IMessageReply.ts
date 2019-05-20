import {ISocketMessage} from "./ISocketMessage";

export interface IMessageReply {
  message: ISocketMessage,
  replyFn: (replyMsg: ISocketMessage) => void;
}