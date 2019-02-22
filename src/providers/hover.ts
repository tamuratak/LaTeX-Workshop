import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as stripJsonComments from 'strip-json-comments'
import * as utils from '../utils'
import {TextDocumentLike} from '../components/textdocumentlike'
import {Extension} from '../main'
import {tokenizer, onAPackage} from './tokenizer'
import {ReferenceEntry} from './completer/reference'

export type TexMathEnv = { texString: string, range: vscode.Range, envname: string }
type LabelsStore = {labels: {[k: string]: {tag: string, id: string}}, IDs: {[k: string]: number}, startNumber: number}

export class HoverProvider implements vscode.HoverProvider {
    extension: Extension
    mathPreview: MathPreview

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = this.extension.mathPreview
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) :
    Thenable<vscode.Hover> {
        this.mathPreview.getColor()
        return new Promise((resolve, _reject) => {
            const configuration = vscode.workspace.getConfiguration('latex-workshop')
            const hov = configuration.get('hover.preview.enabled') as boolean
            const hovReference = configuration.get('hover.ref.enabled') as boolean
            const hovCitation = configuration.get('hover.citation.enabled') as boolean
            const hovCommand = configuration.get('hover.command.enabled') as boolean
            if (hov) {
                const tex = this.mathPreview.findHoverOnTex(document, position)
                if (tex) {
                    this.mathPreview.provideHoverOnTex(document, tex, this.mathPreview.findNewCommand(document.getText()))
                        .then(hover => resolve(hover))
                    return
                }
            }
            const token = tokenizer(document, position)
            if (!token) {
                resolve()
                return
            }
            // Test if we are on a command
            if (token.charAt(0) === '\\') {
                if (!hovCommand) {
                    resolve()
                    return
                }
                this.mathPreview.provideHoverOnCommand(token).then(hover => resolve(hover))
                return
            }
            if (onAPackage(document, position, token)) {
                const pkg = encodeURIComponent(JSON.stringify(token))
                const md = `Package **${token}** \n\n`
                const mdLink = new vscode.MarkdownString(`[View documentation](command:latex-workshop.texdoc?${pkg})`)
                mdLink.isTrusted = true
                resolve(new vscode.Hover([md, mdLink]))
                return
            }
            if (hovReference && token in this.extension.completer.reference.referenceData) {
                const refData = this.extension.completer.reference.referenceData[token]
                const line = refData.item.position.line
                const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
                const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
                mdLink.isTrusted = true
                if (configuration.get('hover.preview.ref.enabled') as boolean) {
                    const tex = this.mathPreview.findHoverOnRef(document, position, token, refData)
                    if (tex) {
                        this.mathPreview.provideHoverOnRef(tex, this.mathPreview.findNewCommand(document.getText()), token, refData)
                            .then(hover => resolve(hover))
                        return
                    }
                }
                const md = '```latex\n' + refData.text + '\n```\n'
                resolve( new vscode.Hover([md, mdLink]) )
                return
            }
            if (hovCitation && token in this.extension.completer.citation.citationData) {
                resolve(new vscode.Hover(
                    this.extension.completer.citation.citationData[token].text
                ))
                return
            }
            if (hovCitation && token in this.extension.completer.citation.theBibliographyData) {
                resolve(new vscode.Hover(
                    this.extension.completer.citation.theBibliographyData[token].text
                ))
                return
            }
            resolve()
        })
    }
}

export class MathPreview {
    extension: Extension
    jaxInitialized = false
    color
    mj

    constructor(extension: Extension) {
        this.extension = extension
        import('mathjax-node').then(mj => {
            this.mj = mj
            mj.config({
                MathJax: {
                    jax: ['input/TeX', 'output/SVG'],
                    extensions: ['tex2jax.js', 'MathZoom.js'],
                    showMathMenu: false,
                    showProcessingMessages: false,
                    messageStyle: 'none',
                    SVG: {
                        useGlobalCache: false
                    },
                    TeX: {
                        extensions: ['AMSmath.js', 'AMSsymbols.js', 'autoload-all.js', 'color.js', 'noUndefined.js']
                    }
                }
            })
            mj.start()
            this.jaxInitialized = true
        })
    }

    findNewCommand(content: string) : string {
        const regex = /(\\(?:(?:(?:re)?new|provide)command(\*)?(?:\[[^\[\]\{\}]*\])*{.*})|\\(?:def\\[a-zA-Z]+(?:#[0-9])*{.*}))/gm
        const commands: string[] = []
        const noCommentContent = content.replace(/([^\\]|^)%.*$/gm, '$1') // Strip comments
        let result
        do {
            result = regex.exec(noCommentContent)
            if (result) {
                let command = result[1]
                if (result[2]) {
                    command = command.replace(/\*/, '')
                }
                commands.push(command)
            }
        } while (result)
        return commands.join('')
    }

    async provideHoverOnCommand(token: string) : Promise<vscode.Hover | undefined> {
        const signatures: string[] = []
        const pkgs: string[] = []
        const tokenWithoutSlash = token.substring(1)
        Object.keys(this.extension.completer.command.allCommands).forEach( key => {
            if (key.startsWith(tokenWithoutSlash) && ((key.length === tokenWithoutSlash.length) || (key.charAt(tokenWithoutSlash.length) === '[') || (key.charAt(tokenWithoutSlash.length) === '{'))) {
                const command = this.extension.completer.command.allCommands[key]
                if (command.documentation === undefined) {
                    return
                }
                const doc = command.documentation as string
                const packageName = command.packageName
                if (packageName && (pkgs.indexOf(packageName) === -1)) {
                    pkgs.push(packageName)
                }
                signatures.push(doc)
            }
        })
        let pkgLink = ''
        if (pkgs.length > 0) {
            pkgLink = '\n\nView documentation for package(s) '
            pkgs.forEach(p => {
                const pkg = encodeURIComponent(JSON.stringify(p))
                pkgLink += `[${p}](command:latex-workshop.texdoc?${pkg}),`
            })
            pkgLink = pkgLink.substr(0, pkgLink.lastIndexOf(',')) + '.'
        }
        if (signatures.length > 0) {
            const mdLink = new vscode.MarkdownString(signatures.join('  \n')) // We need two spaces to ensure md newline
            mdLink.appendMarkdown(pkgLink)
            mdLink.isTrusted = true
            return new vscode.Hover(mdLink)
        }
        return undefined
    }

    addDummyCodeBlock(md: string) : string {
        // We need a dummy code block in hover to make the width of hover larger.
        const dummyCodeBlock = '```\n```'
        return dummyCodeBlock + '\n' + md + '\n' + dummyCodeBlock
    }

    async provideHoverOnTex(document: vscode.TextDocument, tex: TexMathEnv, newCommand: string) : Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number
        let s = this.renderCursor(document, tex.range)
        s = this.mathjaxify(s, tex.envname)
        const data = await this.mj.typeset({
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        })
        this.scaleSVG(data, scale)
        this.colorSVG(data)
        const xml = data.svgNode.outerHTML
        const md = this.svgToDataUrl(xml)
        return new vscode.Hover(new vscode.MarkdownString(this.addDummyCodeBlock(`![equation](${md})`)), tex.range )
    }

    async getSvgDataUrlOnRef(tex: TexMathEnv, newCommand: string, refToken: string) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number
        const s = this.mathjaxify(tex.texString, tex.envname, {stripLabel: false})
        const obj = { labels : {}, IDs: {}, startNumber: 0 }
        const data = await this.mj.typeset({
            width: 50,
            equationNumbers: 'AMS',
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
            state: {AMS: obj}
        })
        this.scaleSVG(data, scale)
        this.colorSVG(data)
        const xml = data.svgNode.outerHTML
        const eqNumAndLabels = this.eqNumAndLabel(obj, tex, refToken)
        const svgDataUrl = this.svgToDataUrl(xml)
        return {svgDataUrl, eqNumAndLabels}
    }

    async provideHoverOnRef(tex: TexMathEnv, newCommand: string, refToken: string, refData: ReferenceEntry) : Promise<vscode.Hover> {        
        const ret = await this.getSvgDataUrlOnRef(tex, newCommand, refToken)
        const line = refData.item.position.line
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
        mdLink.isTrusted = true
        return new vscode.Hover( [ret.eqNumAndLabels, this.addDummyCodeBlock(`![equation](${link})`), mdLink], tex.range )
    }

    eqNumAndLabel(obj: LabelsStore, tex: TexMathEnv, refToken: string) : string {
        let s = ''
        const e = '[error] fail to get equation number for label.'
        const labels = tex.texString.match(/\\label\{.*?\}/g)
        if (!labels) {
            return e
        }
        if (labels.length === 1 && obj.startNumber === 1) {
            return `(1) ${Object.keys(obj.labels)[0]}`
        }
        if (labels.length === obj.startNumber) {
            let i = 1
            for (const label0 of labels) {
                const label = label0.substr(7, label0.length - 8)
                if (refToken === label) {
                    s = `(${i}) ${label}` + '&nbsp;&nbsp;&nbsp;'
                    return s
                }
                i += 1
            }
            return e
        }
        for (const label in obj.labels) {
            const labelNum = obj.labels[label].tag
            if (!labelNum.match(/\d+/)) {
                return e
            }
            if (refToken === label) {
                s = `(${labelNum}) ${label}` + '&nbsp;&nbsp;&nbsp;'
                return s
            }
        }
        return e
    }

    scaleSVG(data: any, scale: number) {
        const svgelm = data.svgNode
        // w0[2] and h0[2] are units, i.e., pt, ex, em, ...
        const w0 = svgelm.getAttribute('width').match(/([\.\d]+)(\w*)/)
        const h0 = svgelm.getAttribute('height').match(/([\.\d]+)(\w*)/)
        const w = scale * Number(w0[1])
        const h = scale * Number(h0[1])
        svgelm.setAttribute('width', w + w0[2])
        svgelm.setAttribute('height', h + h0[2])
    }

    svgToDataUrl(xml: string) : string {
        const svg64 = Buffer.from(unescape(encodeURIComponent(xml))).toString('base64')
        const b64Start = 'data:image/svg+xml;base64,'
        return b64Start + svg64
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : null
    }

    colorSVG(data: any) {
        const svgelm = data.svgNode
        const g = svgelm.getElementsByTagName('g')[0]
        g.setAttribute('fill', this.color)
    }

    stripTeX(tex: string) : string {
        if (tex.startsWith('$') && tex.endsWith('$')) {
            tex = tex.slice(1, tex.length - 1)
        }
        if (tex.startsWith('\\(') && tex.endsWith('\\)')) {
            tex = tex.slice(2, tex.length - 2)
        }
        if (tex.startsWith('\\[') && tex.endsWith('\\]')) {
            tex = tex.slice(2, tex.length - 2)
        }
        return tex
    }

    getColor() {
        const colorTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme')
        for (const extension of vscode.extensions.all) {
            if (extension.packageJSON === undefined || extension.packageJSON.contributes === undefined || extension.packageJSON.contributes.themes === undefined) {
                continue
            }
            const candidateThemes = extension.packageJSON.contributes.themes.filter(themePkg => themePkg.label === colorTheme || themePkg.id === colorTheme)
            if (candidateThemes.length === 0) {
                continue
            }
            try {
                const themePath = path.resolve(extension.extensionPath, candidateThemes[0].path)
                let theme = JSON.parse(stripJsonComments(fs.readFileSync(themePath, 'utf8')))
                while (theme.include) {
                    const includedTheme = JSON.parse(stripJsonComments(fs.readFileSync(path.resolve(path.dirname(themePath), theme.include), 'utf8')))
                    theme.include = undefined
                    theme = {... theme, ...includedTheme}
                }
                const bgColor = this.hexToRgb(theme.colors['editor.background'])
                if (bgColor) {
                    // http://stackoverflow.com/a/3943023/112731
                    const r = bgColor.r <= 0.03928 ? bgColor.r / 12.92 : Math.pow((bgColor.r + 0.055) / 1.055, 2.4)
                    const g = bgColor.r <= 0.03928 ? bgColor.g / 12.92 : Math.pow((bgColor.g + 0.055) / 1.055, 2.4)
                    const b = bgColor.r <= 0.03928 ? bgColor.b / 12.92 : Math.pow((bgColor.b + 0.055) / 1.055, 2.4)
                    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    if (L > 0.179) {
                        this.color = '#000000'
                    } else {
                        this.color = '#ffffff'
                    }
                    return
                } else if (theme.type && theme.type === 'dark') {
                    this.color = '#ffffff'
                    return
                }
            } catch (e) {
                console.log('Error when JSON.parse theme files.')
                console.log(e.message)
            }
            const uiTheme = candidateThemes[0].uiTheme
            if (!uiTheme || uiTheme === 'vs') {
                this.color = '#000000'
                return
            } else {
                this.color = '#ffffff'
                return
            }
        }
        this.color = '#000000'
    }

    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    isCursorInTeXCommand(document: vscode.TextDocument) : boolean {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return false
        }
        const cursor = editor.selection.active
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[\(\)\[\]]|\\\\/)
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor) ) {
            return true
        }
        return false
    }

    renderCursor(document: vscode.TextDocument, range: vscode.Range) : string {
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

    mathjaxify(tex: string, envname: string, opt = { stripLabel: true }) : string {
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

    findHoverOnTex(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position) : TexMathEnv | undefined {
        const envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/
        let r = document.getWordRangeAtPosition(position, envBeginPat)
        if (r) {
            const envname = this.getFirstRmemberedSubstring(document.getText(r), envBeginPat)
            return this.findHoverOnEnv(document, envname, r.start)
        }
        const parenBeginPat = /(\\\[|\\\()/
        r = document.getWordRangeAtPosition(position, parenBeginPat)
        if (r) {
            const paren = this.getFirstRmemberedSubstring(document.getText(r), parenBeginPat)
            return this.findHoverOnParen(document, paren, r.start)
        }
        return this.findHoverOnInline(document, position)
    }

    findHoverOnRef(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position, token: string, refData: ReferenceEntry)
    : TexMathEnv | undefined {
        const docOfRef = TextDocumentLike.load(refData.file)
        const envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/
        const l = docOfRef.lineAt(refData.item.position.line).text
        const pat = new RegExp('\\\\label\\{' + utils.escapeRegExp(token) + '\\}')
        const m  = l.match(pat)
        if (m && m.index !== undefined) {
            const labelPos = new vscode.Position(refData.item.position.line, m.index)
            const beginPos = this.findBeginPair(docOfRef, envBeginPatMathMode, labelPos)
            if (beginPos) {
                const t = this.findHoverOnTex(docOfRef, beginPos)
                if (t) {
                    const beginEndRange = t.range
                    const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/)
                    if (refRange && beginEndRange.contains(labelPos)) {
                        t.range = refRange
                        return t
                    }
                }
            }
        }
        return undefined
    }

    getFirstRmemberedSubstring(s: string, pat: RegExp) : string {
        const m = s.match(pat)
        if (m && m[1]) {
            return m[1]
        }
        return 'never return here'
    }

    removeComment(line: string) : string {
        return line.replace(/^((?:\\.|[^%])*).*$/, '$1')
    }

    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    findEndPair(document: vscode.TextDocument | TextDocumentLike, endPat: RegExp, startPos1: vscode.Position) : vscode.Position | undefined {
        const currentLine = document.lineAt(startPos1).text.substring(startPos1.character)
        const l = this.removeComment(currentLine)
        let m = l.match(endPat)
        if (m && m.index !== undefined) {
            return new vscode.Position(startPos1.line, startPos1.character + m.index + m[0].length)
        }

        let lineNum = startPos1.line + 1
        while (lineNum <= document.lineCount) {
            m  = this.removeComment(document.lineAt(lineNum).text).match(endPat)
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index + m[0].length)
            }
            lineNum += 1
        }
        return undefined
    }

    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    findBeginPair(document: vscode.TextDocument | TextDocumentLike, beginPat: RegExp, endPos1: vscode.Position, limit= 20) : vscode.Position | undefined {
        const currentLine = document.lineAt(endPos1).text.substr(0, endPos1.character)
        let l = this.removeComment(currentLine)
        let m  = l.match(beginPat)
        if (m && m.index !== undefined) {
            return new vscode.Position(endPos1.line, m.index)
        }
        let lineNum = endPos1.line - 1
        let i = 0
        while (lineNum >= 0 && i < limit) {
            l = document.lineAt(lineNum).text
            l = this.removeComment(l)
            m = l.match(beginPat)
            if (m && m.index !== undefined) {
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
    private findHoverOnEnv(document: vscode.TextDocument | TextDocumentLike, envname: string, startPos: vscode.Position) : TexMathEnv | undefined {
        const pattern = new RegExp('\\\\end\\{' + utils.escapeRegExp(envname) + '\\}')
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length + '\\begin{}'.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    //  \[                \]
    //  ^
    //  startPos
    findHoverOnParen(document: vscode.TextDocument | TextDocumentLike, envname: string, startPos: vscode.Position) : TexMathEnv | undefined {
        const pattern = envname === '\\[' ? /\\\]/ : /\\\)/
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length)
        const endPos = this.findEndPair(document, pattern, startPos1)
        if ( endPos ) {
            const range = new vscode.Range(startPos, endPos)
            return {texString: document.getText(range), range, envname}
        }
        return undefined
    }

    findHoverOnInline(document: vscode.TextDocument | TextDocumentLike, position: vscode.Position) : TexMathEnv | undefined {
        const currentLine = document.lineAt(position.line).text
        let s = currentLine
        let base = 0
        let m: RegExpMatchArray | null = s.match(/\$(?:\\.|[^\\])+?\$|\\\(.+?\\\)/)
        while (m) {
            if (m && m.index !== undefined) {
                const matchStart = base + m.index
                const matchEnd = base + m.index + m[0].length
                if ( matchStart <= position.character && position.character <= matchEnd ) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd)
                    return {texString: document.getText(range), range, envname: '$'}
                } else {
                    base = matchEnd
                    s = currentLine.substring(base)
                }
            } else {
                break
            }
            m = s.match(/\$(?:\\.|[^\\])+?\$|\\\(.+?\\\)/)
        }
        return undefined
    }

}
