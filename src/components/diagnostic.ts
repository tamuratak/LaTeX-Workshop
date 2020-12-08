import type { Extension } from '../main'
import {Parser as LogParser} from './parser/log'

export class Diagnostic {
//    private readonly extension: Extension
    private readonly logParser: LogParser

    constructor(extension: Extension) {
//        this.extension = extension
        this.logParser = new LogParser(extension)
    }

    get isLaTeXmkSkipped() {
        return this.logParser.isLaTeXmkSkipped
    }

    parse(log: string, rootFile?: string) {
        this.logParser.parse(log, rootFile)
    }

    parseLinter(log: string, singleFileOriginalPath?: string) {
        this.logParser.parseLinter(log, singleFileOriginalPath)
    }

}
