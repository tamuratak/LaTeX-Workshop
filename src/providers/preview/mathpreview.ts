import * as vscode from 'vscode'

import {MathJaxPool, TypesetArg} from './mathjaxpool'
import * as utils from '../../utils/utils'
import {TextDocumentLike} from '../../components/textdocumentlike'
import {Extension} from '../../main'
import {Suggestion as ReferenceEntry} from '../completer/reference'
import {getCurrentThemeLightness} from '../../utils/theme'

import {NewCommandFinder} from './mathpreviewlib/newcommandfinder'
import {TexMathEnv, TeXMathEnvFinder} from './mathpreviewlib/texmathenvfinder'
export {TexMathEnv} from './mathpreviewlib/texmathenvfinder'

export class MathPreview {
    private readonly extension: Extension
    private color: string = '#000000'
    private readonly mj: MathJaxPool
    private readonly newCommandFinder: NewCommandFinder
    private readonly texMathEnvFinder: TeXMathEnvFinder

    constructor(extension: Extension) {
        this.extension = extension
        this.mj = new MathJaxPool()
        vscode.workspace.onDidChangeConfiguration(() => this.getColor())
        this.newCommandFinder = new NewCommandFinder(extension)
        this.texMathEnvFinder = new TeXMathEnvFinder()
    }

    findProjectNewCommand(ctoken: vscode.CancellationToken): Promise<string> {
        return this.newCommandFinder.findProjectNewCommand(ctoken)
    }

    private addDummyCodeBlock(md: string): string {
        // We need a dummy code block in hover to make the width of hover larger.
        const dummyCodeBlock = '```\n```'
        return dummyCodeBlock + '\n' + md + '\n' + dummyCodeBlock
    }

    async provideHoverOnTex(document: vscode.TextDocument, tex: TexMathEnv, newCommand: string): Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number
        let s = this.renderCursor(document, tex.range)
        s = this.mathjaxify(s, tex.envname)
        const typesetArg: TypesetArg = {
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        }
        const typesetOpts = { scale, color: this.color }
        try {
            const xml = await this.mj.typeset(typesetArg, typesetOpts)
            const md = utils.svgToDataUrl(xml)
            return new vscode.Hover(new vscode.MarkdownString(this.addDummyCodeBlock(`![equation](${md})`)), tex.range )
        } catch(e) {
            this.extension.logger.logOnRejected(e)
            this.extension.logger.addLogMessage(`Error when MathJax is rendering ${typesetArg.math}`)
            throw e
        }
    }

    async provideHoverOnRef(
        document: vscode.TextDocument,
        position: vscode.Position,
        refData: ReferenceEntry,
        token: string,
        ctoken: vscode.CancellationToken
    ): Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const line = refData.position.line
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
        mdLink.isTrusted = true
        if (configuration.get('hover.ref.enabled') as boolean) {
            const tex = this.texMathEnvFinder.findHoverOnRef(document, position, token, refData)
            if (tex) {
                const newCommands = await this.findProjectNewCommand(ctoken)
                return this.provideHoverPreviewOnRef(tex, newCommands, refData)
            }
        }
        const md = '```latex\n' + refData.documentation + '\n```\n'
        const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/)
        const refNumberMessage = this.refNumberMessage(refData)
        if (refNumberMessage !== undefined && configuration.get('hover.ref.number.enabled') as boolean) {
            return new vscode.Hover([md, refNumberMessage, mdLink], refRange)
        }
        return new vscode.Hover([md, mdLink], refRange)
    }

    private async provideHoverPreviewOnRef(tex: TexMathEnv, newCommand: string, refData: ReferenceEntry): Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number

        let tag: string
        if (refData.prevIndex !== undefined && configuration.get('hover.ref.number.enabled') as boolean) {
            tag = refData.prevIndex.refNumber
        } else {
            tag = refData.label
        }
        const newTex = this.replaceLabelWithTag(tex.texString, refData.label, tag)
        const s = this.mathjaxify(newTex, tex.envname, {stripLabel: false})
        const obj = { labels : {}, IDs: {}, startNumber: 0 }
        const typesetArg: TypesetArg = {
            width: 50,
            equationNumbers: 'AMS',
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
            state: {AMS: obj}
        }
        const typesetOpts = { scale, color: this.color }
        try {
            const xml = await this.mj.typeset(typesetArg, typesetOpts)
            const md = utils.svgToDataUrl(xml)
            const line = refData.position.line
            const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
            const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
            mdLink.isTrusted = true
            return new vscode.Hover( [this.addDummyCodeBlock(`![equation](${md})`), mdLink], tex.range )
        } catch(e) {
            this.extension.logger.logOnRejected(e)
            this.extension.logger.addLogMessage(`Error when MathJax is rendering ${typesetArg.math}`)
            throw e
        }
    }

    private refNumberMessage(refData: ReferenceEntry): string | undefined {
        if (refData.prevIndex) {
            const refNum = refData.prevIndex.refNumber
            const refMessage = `numbered ${refNum} at last compilation`
            return refMessage
        }
        return undefined
    }

    private replaceLabelWithTag(tex: string, refLabel?: string, tag?: string): string {
        const texWithoutTag = tex.replace(/\\tag\{(\{[^{}]*?\}|.)*?\}/g, '')
        let newTex = texWithoutTag.replace(/\\label\{(.*?)\}/g, (_matchString, matchLabel, _offset, _s) => {
            if (refLabel) {
                if (refLabel === matchLabel) {
                    if (tag) {
                        return `\\tag{${tag}}`
                    } else {
                        return `\\tag{${matchLabel}}`
                    }
                }
                return '\\notag'
            } else {
                return `\\tag{${matchLabel}}`
            }
        })
        newTex = newTex.replace(/^$/g, '')
        // To work around a bug of \tag with multi-line environments,
        // we have to put \tag after the environments.
        // See https://github.com/mathjax/MathJax/issues/1020
        newTex = newTex.replace(/(\\tag\{.*?\})([\r\n\s]*)(\\begin\{(aligned|alignedat|gathered|split)\}[^]*?\\end\{\4\})/gm, '$3$2$1')
        newTex = newTex.replace(/^\\begin\{(\w+?)\}/, '\\begin{$1*}')
        newTex = newTex.replace(/\\end\{(\w+?)\}$/, '\\end{$1*}')
        return newTex
    }

    async generateSVG(document: vscode.TextDocument, tex: TexMathEnv, newCommands0?: string) {
        const newCommands: string = newCommands0 ?? (await this.newCommandFinder.findNewCommand(document.getText())).join('')
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number
        const s = this.mathjaxify(tex.texString, tex.envname)
        const xml = await this.mj.typeset({
            math: newCommands + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        }, {scale, color: this.color})
        return {svgDataUrl: utils.svgToDataUrl(xml), newCommands}
    }

    private stripTeX(tex: string): string {
        if (tex.startsWith('$$') && tex.endsWith('$$')) {
            tex = tex.slice(2, tex.length - 2)
        } else if (tex.startsWith('$') && tex.endsWith('$')) {
            tex = tex.slice(1, tex.length - 1)
        } else if (tex.startsWith('\\(') && tex.endsWith('\\)')) {
            tex = tex.slice(2, tex.length - 2)
        } else if (tex.startsWith('\\[') && tex.endsWith('\\]')) {
            tex = tex.slice(2, tex.length - 2)
        }
        return tex
    }

    getColor() {
        const lightness = getCurrentThemeLightness()
        if (lightness === 'light') {
            this.color = '#000000'
        } else {
            this.color = '#ffffff'
        }
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

    renderCursor(document: vscode.TextDocument, range: vscode.Range): string {
        const editor = vscode.window.activeTextEditor
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const conf = configuration.get('hover.preview.cursor.enabled') as boolean
        if (editor && conf && !this.isCursorInTeXCommand(document)) {
            const cursor = editor.selection.active
            const symbol = configuration.get('hover.preview.cursor.symbol') as string
            const color = configuration.get('hover.preview.cursor.color') as string
            let sym = `{\\color{${this.color}}${symbol}}`
            if (color !== 'auto') {
                sym = `{\\color{${color}}${symbol}}`
            }
            if (range.contains(cursor) && !range.start.isEqual(cursor) && !range.end.isEqual(cursor)) {
                return document.getText( new vscode.Range(range.start, cursor) ) + sym + document.getText( new vscode.Range(cursor, range.end))
            }
        }
        return document.getText(range)
    }

    private mathjaxify(tex: string, envname: string, opt = { stripLabel: true }): string {
        // remove TeX comments
        let s = tex.replace(/^\s*%.*\r?\n/mg, '')
        s = s.replace(/^((?:\\.|[^%])*).*$/mg, '$1')
        // remove \label{...}
        if (opt.stripLabel) {
            s = s.replace(/\\label\{.*?\}/g, '')
        }
        if (envname.match(/^(aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|gathered|matrix|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)$/)) {
            s = '\\begin{equation}' + s + '\\end{equation}'
        }
        return s
    }

    findHoverOnTex(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position): TexMathEnv | undefined {
        return this.texMathEnvFinder.findHoverOnTex(document, position)
    }

    findMathEnvIncludingPosition(document: vscode.TextDocument, position: vscode.Position): TexMathEnv | undefined {
        return this.texMathEnvFinder.findMathEnvIncludingPosition(document, position)
    }

}
