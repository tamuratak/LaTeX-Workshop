import * as vscode from 'vscode'
import * as envpair from '../components/envpair'
import {Extension} from '../main'
import {tokenizer} from './tokenizer'

type HoverPreviewOption = { render_label?: boolean }

export class HoverProvider implements vscode.HoverProvider {
    extension: Extension
    envBeginPat: RegExp
    envBeginPatMathMode: RegExp

    constructor(extension: Extension) {
        this.extension = extension
        this.envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/
        this.envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) :
    Thenable<vscode.Hover> {
        return new Promise((resolve, _reject) => {
            const configuration = vscode.workspace.getConfiguration('latex-workshop')
            const h = configuration.get('hoverPreview.enabled') as boolean
            if (h && this.extension.panel) {
                const tr = this.findHoverOnTex(document, position)
                if (tr) {
                    const [tex, range] = tr
                    this.provideHoverPreview(tex, range)
                    .then( (hover) => { resolve(hover) } )
                    return
                }
            }
            const token = tokenizer(document, position)
            if (token === undefined) {
                resolve()
                return
            }
            if (token in this.extension.completer.reference.referenceData) {
                const refData = this.extension.completer.reference.referenceData[token]
                if (configuration.get('hoverPreview.ref.enabled') as boolean) {
                    const tr = this.findHoverOnRef(document, position, token, refData.item.position)
                    if (tr) {
                        const [tex, range] = tr
                        this.provideHoverPreview(tex, range)
                        .then( (hover) => { resolve(hover) } )
                        return
                    }
                }
                resolve(new vscode.Hover(
                    {language: 'latex', value: refData.text }
                ))
                return
            }
            if (token in this.extension.completer.citation.citationData) {
                resolve(new vscode.Hover(
                    this.extension.completer.citation.citationData[token].text
                ))
                return
            }
            resolve()
        })
    }

    private provideHoverPreview(tex: string, range: vscode.Range) : Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hoverPreview.scale') as number
        return new Promise((resolve, _reject) => {
            const panel = this.extension.panel
            const d = panel.webview.onDidReceiveMessage( message => {
                resolve( new vscode.Hover(new vscode.MarkdownString( "![equation](" + message.dataurl + ")" ), range ) )
                d.dispose()
            })
            panel.webview.postMessage({
                text: tex,
                scale: scale,
                need_dataurl: "1"
            })
        })
    }

    private findHoverOnRef(document: vscode.TextDocument, position: vscode.Position, token:string, labelPos: vscode.Position)
    : [string, vscode.Range] | undefined {
        const l = document.lineAt(labelPos.line).text
        const pat = new RegExp('\\\\label\\{' + envpair.escapeRegExp(token) + '\\}')
        if (!l.match(pat)) {
            return undefined
        }
        let beginPos = this.findBeginPair(document, this.envBeginPatMathMode, labelPos)
        if (beginPos && this.extension.panel) {
            const tr = this.findHoverOnTex(document, beginPos, {render_label:true})
            if (tr) {
                const tex = tr[0]
                const e = new vscode.Position(position.line, position.character + '\\label{}'.length + token.length)
                const range = new vscode.Range(position, e)
                return [tex, range]
            }
        }
        return undefined
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    private isCursorInTeXCommand(document: vscode.TextDocument) : boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end)\{.*?\}|\\[a-zA-Z]+\{?|\\[\(\)\[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    private renderCursor(document: vscode.TextDocument, range: vscode.Range) : string {
        const editor = vscode.window.activeTextEditor
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const conf = configuration.get('hoverPreview.cursor.enabled') as boolean
        if (editor && conf && !this.isCursorInTeXCommand(document)) {
            const cursor = editor.selection.active
            const symbol = configuration.get('hoverPreview.cursor.symbol') as string
            const color = configuration.get('hoverPreview.cursor.color') as string
            let sym = `{${symbol}}`
            if (color != 'auto') {
                sym = `{\\color{${color}}${symbol}}`
            }
            if (range.contains(cursor)) {
                return document.getText( new vscode.Range(range.start, cursor) ) + sym + document.getText( new vscode.Range(cursor, range.end))
            }
        }
        return document.getText(range)
    }

    private mathjaxify(tex: string, envname: string, opt: HoverPreviewOption={}) : string {
        // remove TeX comments
        let s = tex.replace(/^\s*%.*\r?\n/mg, '')
        s = s.replace(/^((?:\\.|[^%])*).*$/mg, '$1')
        // remove \label{...}
        if (opt.render_label) {
            s = s.replace(/\\label\{(.*?)\}/g, '\\tag{$1}')
        }else{
            s = s.replace(/\\label\{.*?\}/g, '')
        }
        if (envname.match(/^(aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|gathered|matrix|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)$/)) {
            s = '\\begin{equation}' + s + '\\end{equation}'
        }
        return s
    }

    private findHoverOnTex(document: vscode.TextDocument, position: vscode.Position, opt: HoverPreviewOption={}) : [string, vscode.Range] | undefined {
        let r = document.getWordRangeAtPosition(position, this.envBeginPat)
        if (r) {
            const envname = this.getFirstRmemberedSubstring(document.getText(r), this.envBeginPat)
            return this.findHoverOnEnv(document, envname, r.start, opt)
        }
        const parenBeginPat = /(\\\[|\\\()/
        r = document.getWordRangeAtPosition(position, parenBeginPat)
        if (r) {
            const paren = this.getFirstRmemberedSubstring(document.getText(r), parenBeginPat)
            return this.findHoverOnParen(document, paren, r.start)
        }
        return this.findHoverOnInline(document, position)
    }

    private getFirstRmemberedSubstring(s: string, pat: RegExp) : string {
        const m = s.match(pat)
        if (m && m[1]) {
            return m[1]
        }
        return "never return here"
    }

    private removeComment(line: string) : string {
        return line.replace(/^((?:\\.|[^%])*).*$/, '$1')
    }

    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    private findEndPair(document: vscode.TextDocument, endPat: RegExp, startPos1: vscode.Position) : vscode.Position | undefined {
        const current_line = document.lineAt(startPos1).text.substring(startPos1.character)
        const l = this.removeComment(current_line)
        let m  = l.match(endPat)
        if (m && m.index != null) {
            return new vscode.Position(startPos1.line, startPos1.character + m.index + m[0].length)
        }

        let lineNum = startPos1.line + 1
        while (lineNum <= document.lineCount) {
            let l = document.lineAt(lineNum).text
            l = this.removeComment(l)
            let m  = l.match(endPat)
            if (m && m.index != null) {
                return new vscode.Position(lineNum, m.index + m[0].length)
            }
            lineNum += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    private findBeginPair(document: vscode.TextDocument, beginPat: RegExp, endPos1: vscode.Position, limit=20) : vscode.Position | undefined {
        const current_line = document.lineAt(endPos1).text.substr(0, endPos1.character)
        const l = this.removeComment(current_line)
        let m  = l.match(beginPat)
        if (m && m.index != null) {
            return new vscode.Position(endPos1.line, m.index)
        }

        let lineNum = endPos1.line - 1
        let i = 0
        while (lineNum >=0 && i < limit) {
            let l = document.lineAt(lineNum).text
            l = this.removeComment(l)
            let m  = l.match(beginPat)
            if (m && m.index != null) {
                return new vscode.Position(lineNum, m.index)
            }
            lineNum -= 1
            i += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^
    //  startPos
    private findHoverOnEnv(document: vscode.TextDocument, envname: string, startPos: vscode.Position, opt: HoverPreviewOption={}) : [string, vscode.Range] | undefined {
        const pattern = new RegExp('\\\\end\\{' + envpair.escapeRegExp(envname) + '\\}')
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length + '\\begin{}'.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            const ret = this.mathjaxify( this.renderCursor(document, range), envname, opt )
            return [ret, range]
        }
        return undefined
    }

    //  \[                \]
    //  ^
    //  startPos
    private findHoverOnParen(document: vscode.TextDocument, envname: string, startPos: vscode.Position) : [string, vscode.Range] | undefined {
        const pattern = envname == '\\[' ? /\\\]/ : /\\\)/
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            const ret = this.mathjaxify( this.renderCursor(document, range), envname )
            return [ret, range]
        }
        return undefined
    }

    private findHoverOnInline(document: vscode.TextDocument, position: vscode.Position) : [string, vscode.Range] | undefined {
        let m : RegExpMatchArray | null
        const current_line = document.lineAt(position.line).text
        let s = current_line
        let base = 0
        while (m = s.match(/\$(?:\\.|[^\\])+?\$|\\\(.+?\\\)/)) {
            if (m && m.index != null) {
                const matchStart = base + m.index
                const matchEnd = base + m.index + m[0].length
                if ( matchStart <= position.character && position.character <= matchEnd ) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd)
                    const ret = this.mathjaxify( this.renderCursor(document, range), '$' )
                    return [ret, range]
                }else{
                    base = matchEnd
                    s = current_line.substring(base)
                }
            }else{
                break
            }
        }
        return undefined
    }

}