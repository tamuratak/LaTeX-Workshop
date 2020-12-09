import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import type { Extension } from '../main'
import {Parser as LogParser, LogEntry, LinterLogEntry, DIAGNOSTIC_SEVERITY} from './parser/log'
import { convertFilenameEncoding } from '../utils/utils'

export class Diagnostic {
//    private readonly extension: Extension
    private readonly logParser: LogParser
    private readonly compilerDiagnostics = vscode.languages.createDiagnosticCollection('LaTeX')
    private readonly linterDiagnostics = vscode.languages.createDiagnosticCollection('ChkTeX')

    constructor(extension: Extension) {
//        this.extension = extension
        this.logParser = new LogParser(extension)
    }

    get isLaTeXmkSkipped() {
        return this.logParser.isLaTeXmkSkipped
    }

    parse(log: string, rootFile?: string) {
        const buildLog = this.logParser.parse(log, rootFile)
        if (buildLog) {
            this.showCompilerDiagnostics(buildLog)
        }
    }

    parseLinter(log: string, singleFileOriginalPath?: string) {
        const linterLog = this.logParser.parseLinter(log, singleFileOriginalPath)
        if (singleFileOriginalPath === undefined) {
            // A full lint of the project has taken place - clear all previous results.
            this.linterDiagnostics.clear()
        } else if (linterLog.length === 0) {
            // We are linting a single file and the new log is empty for it -
            // clean existing records.
            this.linterDiagnostics.set(vscode.Uri.file(singleFileOriginalPath), [])
        }
        this.showLinterDiagnostics(linterLog)
    }

    private showCompilerDiagnostics(buildLog: LogEntry[]) {
        this.compilerDiagnostics.clear()
        const diagsCollection: { [key: string]: vscode.Diagnostic[] } = {}
        for (const item of buildLog) {
            const range = new vscode.Range(new vscode.Position(item.line - 1, 0), new vscode.Position(item.line - 1, 65535))
            const diag = new vscode.Diagnostic(range, item.text, DIAGNOSTIC_SEVERITY[item.type])
            diag.source = 'LaTeX'
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = []
            }
            diagsCollection[item.file].push(diag)
        }

        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const convEnc = configuration.get('message.convertFilenameEncoding') as boolean
        for (const file in diagsCollection) {
            let file1 = file
            if (!fs.existsSync(file1) && convEnc) {
                const f = convertFilenameEncoding(file1)
                if (f !== undefined) {
                    file1 = f
                }
            }
            this.compilerDiagnostics.set(vscode.Uri.file(file1), diagsCollection[file])
        }
    }

    private showLinterDiagnostics(linterLog: LinterLogEntry[]) {
        const diagsCollection: { [key: string]: vscode.Diagnostic[] } = {}
        for (const item of linterLog) {
            const range = new vscode.Range(new vscode.Position(item.line - 1, item.position - 1),
                new vscode.Position(item.line - 1, item.position - 1 + item.length))
            const diag = new vscode.Diagnostic(range, item.text, DIAGNOSTIC_SEVERITY[item.type])
            diag.code = item.code
            diag.source = 'ChkTeX'
            if (diagsCollection[item.file] === undefined) {
                diagsCollection[item.file] = []
            }
            diagsCollection[item.file].push(diag)
        }
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const convEnc = configuration.get('message.convertFilenameEncoding') as boolean
        for (const file in diagsCollection) {
            let file1 = file
            if (['.tex', '.bbx', '.cbx', '.dtx'].includes(path.extname(file))) {
                // Only report ChkTeX errors on TeX files. This is done to avoid
                // reporting errors in .sty files, which are irrelevant for most users.
                if (!fs.existsSync(file1) && convEnc) {
                    const f = convertFilenameEncoding(file1)
                    if (f !== undefined) {
                        file1 = f
                    }
                }
                this.linterDiagnostics.set(vscode.Uri.file(file1), diagsCollection[file])
            }
        }
    }
}
