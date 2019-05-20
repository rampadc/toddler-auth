import winston, {Logger} from "winston";
import {Console} from "inspector";

const {createLogger, format, transports} = winston;
const {combine, prettyPrint, printf} = format;

export class Log {
  private static _service: winston.Logger;
  private static _socket: winston.Logger;
  private static _instance: Log;

  private constructor() {
  }

  public static get shared(): Log {
    return this._instance || (this._instance = new this());
  }

  public static service(): winston.Logger {
    return (
      this._service ||
      (this._service = Log.createLogger())
    );
  }

  public static get socket(): winston.Logger {
    return (
      this._socket ||
      (this._socket = Log.createLogger())
    );
  }

  static timestampedFormat = printf((info: any) => {
    return `${info.level.toUpperCase()} ${info.message}`;
  });

  static createLogger(): Logger {
    return createLogger({
      level: "silly",
      format: combine(
        prettyPrint()
      ),
      transports: [
        new transports.Console()
      ]
    });
  }
}
