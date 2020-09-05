import type {ClientRequest} from './protocol.js'
import * as utils from './utils.js'

type EventMap = {
    'message': MessageEvent,
    'close': CloseEvent
}

export interface IMessagePort {
    send(message: ClientRequest): void,
    addEventListener<K extends keyof EventMap>(type: K, listener: (e: EventMap[K]) => void): void
}

export class WebSocketPort implements IMessagePort {
    readonly server: string
    private socket: WebSocket

    constructor() {
        const server = `ws://${window.location.hostname}:${window.location.port}`
        this.server = server
        this.socket = new WebSocket(server)
    }

    send(message: ClientRequest): void {
        utils.callCbOnDidOpenWebSocket(this.socket, () => {
            this.socket.send(JSON.stringify(message))
        })
    }

    addEventListener<K extends keyof EventMap>(type: K, listener: (e: EventMap[K]) => void) {
        this.socket.addEventListener(type, listener)
    }

}

export class MessagePortFactory {

    createPort(): IMessagePort {
        return new WebSocketPort()
    }

    executedInWebview(): boolean {
        return window.location.protocol !== 'http'
    }

}
