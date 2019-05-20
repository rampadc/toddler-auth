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
      (this._service = Log.createLogger('service'))
    );
  }

  public static get socket(): winston.Logger {
    return (
      this._socket ||
      (this._socket = Log.createLogger('socket'))
    );
  }

  static timestampedFormat = printf((info: any) => {
    return `${info.level.toUpperCase()} ${info.message}`;
  });

  static createLogger(component: string): Logger {
    const componentNameFormat = winston.format(info => {
      info.component = component;
      return info;
    });

    return createLogger({
      level: "silly",
      format: combine(
        componentNameFormat(),
        prettyPrint(),
        // format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
  }
}
