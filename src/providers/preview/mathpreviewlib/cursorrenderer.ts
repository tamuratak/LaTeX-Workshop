import {latexParser} from 'latex-utensils'
import * as vscode from 'vscode'
import type {Extension} from '../../../main'
import {TexMathEnv} from './texmathenvfinder'


export class CursorRenderer {
    private readonly extension: Extension
    prevAst?: latexParser.LatexAst

    constructor(extension: Extension) {
        this.extension = extension
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    private isCursorInTeXCommand(document: vscode.TextDocument): boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    insertCursor(texMath: TexMathEnv, cursorPos: vscode.Position, cursor: string) {
        const arry = texMath.texString.split('\n')
        const line = cursorPos.line - texMath.range.start.line
        const curLine = arry[line]
        arry[line] = curLine.substring(0, cursorPos.character) + cursor + curLine.substring(cursorPos.character, curLine.length)
        return arry.join('\n')
    }

    async nodeAt(texMath: TexMathEnv, cursorPos: vscode.Position) {
        const ast = await this.extension.pegParser.parseLatex(texMath.texString)
        if (!ast) {
            return
        }
        const cursorPosInSnippet = { line: cursorPos.line - texMath.range.start.line + 1, column: cursorPos.character + 1 }
        const result = latexParser.findNodeAt(ast.content, cursorPosInSnippet)
        if (!result) {
            return
        }
        console.log(JSON.stringify(result.node))
        return result.node
    }

    async renderCursor(document: vscode.TextDocument, texMath: TexMathEnv, thisColor: string): Promise<string> {
        const range = texMath.range
        const cursorPos = vscode.window.activeTextEditor?.selection.active
        if (!cursorPos || !range.contains(cursorPos) || range.start.isEqual(cursorPos) || range.end.isEqual(cursorPos)) {
            return texMath.texString
        }
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const conf = configuration.get('hover.preview.cursor.enabled') as boolean
        if (!conf || this.isCursorInTeXCommand(document)) {
            return texMath.texString
        }
        const symbol = configuration.get('hover.preview.cursor.symbol') as string
        const color = configuration.get('hover.preview.cursor.color') as string
        const cursorString = color === 'auto' ? `{\\color{${thisColor}}${symbol}}` : `{\\color{${color}}${symbol}}`
        return this.insertCursor(texMath, cursorPos, cursorString)
    }

}
