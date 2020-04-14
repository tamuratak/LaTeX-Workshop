export type ServerResponse = {
    type: 'refresh'
} | {
    type: 'request_status'
} | {
    type: 'params',
    scale: string,
    trim: number,
    scrollMode: number,
    spreadMode: number,
    hand: boolean,
    invert: number,
    bgColor: string,
    keybindings: {
        synctex: 'ctrl-click' | 'double-click'
    }
} | {
    type: 'synctex',
    data: {
        page: number,
        x: number,
        y: number
    }
}

export type ClientRequest = {
    type: 'open',
    path: string,
    viewer: 'browser' | 'tab'
} | {
    type: 'close'
} | {
    type: 'request_params',
    path: string
} | {
    type: 'loaded',
    path: string
} | {
    type: 'external_link',
    url: string
} | {
    type: 'ping'
} | {
    type: 'status',
    path: string,
    scrollTop: number
} | {
    type: 'reverse_synctex',
    path: string,
    pos: [number, number],
    page: number,
    textBeforeSelection: string,
    textAfterSelection: string
}

export type PanelManagerResponse = {

}

export type PanelRequest = {
    type: 'initialized'
} | {
    type: 'keyboard_event',
    event: any
} | {
    type: 'status'
}
