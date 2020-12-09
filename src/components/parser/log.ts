import * as vscode from 'vscode'
import * as path from 'path'

import type { Extension } from '../../main'

const latexPattern = /^Output\swritten\son\s(.*)\s\(.*\)\.$/gm
const latexFatalPattern = /Fatal error occurred, no output PDF file produced!/gm
const latexError = /^(?:(.*):(\d+):|!)(?: (.+) Error:)? (.+?)$/
const latexBox = /^((?:Over|Under)full \\[vh]box \([^)]*\)) in paragraph at lines (\d+)--(\d+)$/
const latexBoxAlt = /^((?:Over|Under)full \\[vh]box \([^)]*\)) detected at line (\d+)$/
const latexBoxOutput = /^((?:Over|Under)full \\[vh]box \([^)]*\)) has occurred while \\output is active/
const latexWarn = /^((?:(?:Class|Package) \S*)|LaTeX) (Warning|Info|Font Warning):\s+(.*?)(?: on input line (\d+))?(\.|\?|)$/
const latexPackageWarningExtraLines = /^\((.*)\)\s+(.*?)(?: +on input line (\d+))?(\.)?$/
const bibEmpty = /^Empty `thebibliography' environment/
const biberWarn = /^Biber warning:.*WARN - I didn't find a database entry for '([^']+)'/

const latexmkPattern = /^Latexmk:\sapplying\srule/gm
const latexmkLog = /^Latexmk:\sapplying\srule/
const latexmkLogLatex = /^Latexmk:\sapplying\srule\s'(pdf|lua|xe)?latex'/
const latexmkUpToDate = /^Latexmk: All targets \(.*\) are up-to-date/

const texifyPattern = /^running\s(pdf|lua|xe)?latex/gm
const texifyLog = /^running\s((pdf|lua|xe)?latex|miktex-bibtex)/
const texifyLogLatex = /^running\s(pdf|lua|xe)?latex/

// const truncatedLine = /(.{77}[^\.](\w|\s|-|\\|\/))(\r\n|\n)/g
const messageLine = /^l\.\d+\s(.*)$/

export const DIAGNOSTIC_SEVERITY: { [key: string]: vscode.DiagnosticSeverity } = {
    'typesetting': vscode.DiagnosticSeverity.Information,
    'warning': vscode.DiagnosticSeverity.Warning,
    'error': vscode.DiagnosticSeverity.Error,
}

export interface LinterLogEntry {
    file: string,
    line: number,
    position: number,
    length: number,
    type: string,
    code: number,
    text: string
}

export interface LogEntry { type: string, file: string, text: string, line: number }

class ParserState {
    searchEmptyLine = false
    insideBoxWarn = false
    insideError = false
    currentResult: LogEntry = { type: '', file: '', text: '', line: 1 }
    nested = 0
    rootFile: string
    fileStack: string[]

    constructor(rootFilename: string) {
        this.rootFile = rootFilename
        this.fileStack = [this.rootFile]
    }
}

export class LogParser {
    private readonly extension: Extension
    isLaTeXmkSkipped: boolean = false
    private buildLog: LogEntry[] = []
    buildLogRaw: string = ''

    constructor(extension: Extension) {
        this.extension = extension
    }

    parse(log: string, rootFile?: string) {
        this.isLaTeXmkSkipped = false
        // Canonicalize line-endings
        log = log.replace(/(\r\n)|\r/g, '\n')

        if (log.match(latexmkPattern)) {
            log = this.trimLaTeXmk(log)
        } else if (log.match(texifyPattern)) {
            log = this.trimTexify(log)
        }
        if (log.match(latexPattern) || log.match(latexFatalPattern)) {
            return this.parseLaTeX(log, rootFile)
        } else {
            const buildLog = this.latexmkSkipped(log)
            if (buildLog) {
                this.isLaTeXmkSkipped = true
                return buildLog
            }
        }
        return
    }

    private trimLaTeXmk(log: string): string {
        const lines = log.split('\n')
        let startLine = -1
        let finalLine = -1
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            let result = line.match(latexmkLogLatex)
            if (result) {
                startLine = index
            }
            result = line.match(latexmkLog)
            if (result) {
                finalLine = index
            }
        }
        if (finalLine <= startLine) {
            return lines.slice(startLine).join('\n')
        } else {
            return lines.slice(startLine, finalLine).join('\n')
        }
    }

    private trimTexify(log: string): string {
        const lines = log.split('\n')
        let startLine = -1
        let finalLine = -1
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            let result = line.match(texifyLogLatex)
            if (result) {
                startLine = index
            }
            result = line.match(texifyLog)
            if (result) {
                finalLine = index
            }
        }
        if (finalLine <= startLine) {
            return lines.slice(startLine).join('\n')
        } else {
            return lines.slice(startLine, finalLine).join('\n')
        }
    }

    private latexmkSkipped(log: string) {
        const lines = log.split('\n')
        if (lines[0].match(latexmkUpToDate)) {
            return this.buildLog
        }
        return false
    }

   private parseLine(line: string, state: ParserState, buildLog: LogEntry[]) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const excludeRegexp = (configuration.get('message.latexlog.exclude') as string[]).map(regexp => RegExp(regexp))
        // Compose the current file
        const filename = path.resolve(path.dirname(state.rootFile), state.fileStack[state.fileStack.length - 1])
        // Skip the first line after a box warning, this is just garbage
        if (state.insideBoxWarn) {
            state.insideBoxWarn = false
            return
        }
        // Append the read line, since we have a corresponding result in the matching
        if (state.searchEmptyLine) {
            if (line.trim() === '' || (state.insideError && line.match(/^\s/))) {
                state.currentResult.text = state.currentResult.text + '\n'
                state.searchEmptyLine = false
                state.insideError = false
            } else {
                const packageExtraLineResult = line.match(latexPackageWarningExtraLines)
                if (packageExtraLineResult) {
                    state.currentResult.text += '\n(' + packageExtraLineResult[1] + ')\t' + packageExtraLineResult[2] + (packageExtraLineResult[4] ? '.' : '')
                    state.currentResult.line = parseInt(packageExtraLineResult[3], 10)
                } else if (state.insideError) {
                    const subLine = line.replace(messageLine, '$1')
                    state.currentResult.text = state.currentResult.text + '\n' + subLine
                } else {
                    state.currentResult.text = state.currentResult.text + '\n' + line
                }
            }
            return
        }
        for (const regexp of excludeRegexp) {
            if (line.match(regexp)) {
                return
            }
        }
        let result = line.match(latexBox)
        if (!result) {
            result = line.match(latexBoxAlt)
        }
        if (result && configuration.get('message.badbox.show')) {
            if (state.currentResult.type !== '') {
                buildLog.push(state.currentResult)
            }
            state.currentResult = {
                type: 'typesetting',
                file: filename,
                line: parseInt(result[2], 10),
                text: result[1]
            }
            state.searchEmptyLine = false
            state.insideBoxWarn = true
            this.parseLine(line.substring(result[0].length), state, buildLog)
            return
        }
        result = line.match(latexBoxOutput)
        if (result && configuration.get('message.badbox.show')) {
            if (state.currentResult.type !== '') {
                buildLog.push(state.currentResult)
            }
            state.currentResult = {
                type: 'typesetting',
                file: filename,
                line: 1,
                text: result[1]
            }
            state.searchEmptyLine = false
            this.parseLine(line.substring(result[0].length), state, buildLog)
            return
        }
        result = line.match(latexWarn)
        if (result) {
            if (state.currentResult.type !== '') {
                buildLog.push(state.currentResult)
            }
            state.currentResult = {
                type: 'warning',
                file: filename,
                line: parseInt(result[4], 10),
                text: result[3] + result[5]
            }
            state.searchEmptyLine = true
            return
        }
        result = line.match(biberWarn)
        if (result) {
            if (state.currentResult.type !== '') {
                buildLog.push(state.currentResult)
            }
            state.currentResult = {
                type: 'warning',
                file: '',
                line: 1,
                text: `No bib entry found for '${result[1]}'`
            }
            state.searchEmptyLine = false
            this.parseLine(line.substring(result[0].length), state, buildLog)
            return
        }

        result = line.match(latexError)
        if (result) {
            if (state.currentResult.type !== '') {
                buildLog.push(state.currentResult)
            }
            state.currentResult = {
                type: 'error',
                text: (result[3] && result[3] !== 'LaTeX') ? `${result[3]}: ${result[4]}` : result[4],
                file: result[1] ? path.resolve(path.dirname(state.rootFile), result[1]) : filename,
                line: result[2] ? parseInt(result[2], 10) : 1
            }
            state.searchEmptyLine = true
            state.insideError = true
            return
        }
        state.nested = this.parseLaTeXFileStack(line, state.fileStack, state.nested)
        if (state.fileStack.length === 0) {
            state.fileStack.push(state.rootFile)
        }
    }


    private parseLaTeX(log: string, rootFile?: string) {
        if (rootFile === undefined) {
            rootFile = this.extension.manager.rootFile
        }
        if (rootFile === undefined) {
            this.extension.logger.addLogMessage('How can you reach this point?')
            return
        }

        this.buildLogRaw = log
        const lines = log.split('\n')
        this.buildLog = []

        const state: ParserState = new ParserState(rootFile)
        for(const line of lines) {
            this.parseLine(line, state, this.buildLog)
        }

        // Push the final result
        if (state.currentResult.type !== '' && !state.currentResult.text.match(bibEmpty)) {
            this.buildLog.push(state.currentResult)
        }
        this.extension.logger.addLogMessage(`LaTeX log parsed with ${this.buildLog.length} messages.`)
        return this.buildLog
    }

    private parseLaTeXFileStack(line: string, fileStack: string[], nested: number): number {
        const result = line.match(/(\(|\))/)
        if (result && result.index !== undefined && result.index > -1) {
            line = line.substr(result.index + 1)
            if (result[1] === '(') {
                const pathResult = line.match(/^"?((?:(?:[a-zA-Z]:|\.|\/)?(?:\/|\\\\?))[^"()[\]]*)/)
                const mikTeXPathResult = line.match(/^"?([^"()[\]]*\.[a-z]{3,})/)
                if (pathResult) {
                    fileStack.push(pathResult[1].trim())
                } else if (mikTeXPathResult) {
                    fileStack.push(`./${mikTeXPathResult[1].trim()}`)
                } else {
                    nested += 1
                }
            } else {
                if (nested > 0) {
                    nested -= 1
                } else {
                    fileStack.pop()
                }
            }
            nested = this.parseLaTeXFileStack(line, fileStack, nested)
        }
        return nested
    }

    parseLinter(log: string, singleFileOriginalPath?: string) {
        const re = /^(.*?):(\d+):(\d+):(\d+):(.*?):(\d+):(.*?)$/gm
        const linterLog: LinterLogEntry[] = []
        let match = re.exec(log)
        while (match) {
            // This log may be for a single file in memory, in which case we override the
            // path with what is provided
            const filePath = singleFileOriginalPath ? singleFileOriginalPath : match[1]
            linterLog.push({
                file: (!path.isAbsolute(filePath) && this.extension.manager.rootDir !== undefined) ?
                    path.resolve(this.extension.manager.rootDir, filePath) : filePath,
                line: parseInt(match[2]),
                position: parseInt(match[3]),
                length: parseInt(match[4]),
                type: match[5].toLowerCase(),
                code: parseInt(match[6]),
                text: `${match[6]}: ${match[7]}`
            })
            match = re.exec(log)
        }
        this.extension.logger.addLogMessage(`Linter log parsed with ${linterLog.length} messages.`)
        return linterLog
    }

}
