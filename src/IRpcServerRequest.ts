import {ISocketMessage} from "./common/ISocketMessage";
import amqp from "amqplib";

export interface IRpcServerRequest {
    mqMsg: amqp.ConsumeMessage;
    message: ISocketMessage;
}