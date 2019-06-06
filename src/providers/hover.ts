import * as vscode from 'vscode'
import {Extension} from '../main'
import {tokenizer, onAPackage} from './tokenizer'
import {ReferenceEntry} from './completer/reference'
import {MathPreview, TexMathEnv} from '../components/mathpreview'

export class HoverProvider implements vscode.HoverProvider {
    extension: Extension
    mathPreview: MathPreview
    verbose: boolean = false

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = this.extension.mathPreview
        extension.hoverProvider = this
    }

    public provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken) :
    Thenable<vscode.Hover> {
        this.mathPreview.getColor()
        return new Promise( async (resolve, _reject) => {
            const configuration = vscode.workspace.getConfiguration('latex-workshop')
            const hov = configuration.get('hover.preview.enabled') as boolean
            const hovReference = configuration.get('hover.ref.enabled') as boolean
            const hovCitation = configuration.get('hover.citation.enabled') as boolean
            const hovCommand = configuration.get('hover.command.enabled') as boolean
            if (hov) {
                let tex = this.mathPreview.findMathEnvOnBeginEnvname(document, position)
                if (!tex && this.verbose) {
                    tex = this.mathPreview.findMathEnvIncludingPosition(document, position)
                }
                if (tex) {
                    const newCommands = await this.mathPreview.findNewCommand(document.getText())
                    this.provideHoverOnTex(document, tex, newCommands)
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
                this.provideHoverOnCommand(token).then(hover => resolve(hover))
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
                this.provideHoverOnRef(document, position, refData, token)
                .then( hover => resolve(hover))
                return
            }
            if (hovCitation && token in this.extension.completer.citation.citationData) {
                const range = document.getWordRangeAtPosition(position, /\{.*?\}/)
                resolve(new vscode.Hover(
                    this.extension.completer.citation.citationData[token].text,
                    range
                ))
                return
            }
            if (hovCitation && token in this.extension.completer.citation.theBibliographyData) {
                const range = document.getWordRangeAtPosition(position, /\{.*?\}/)
                resolve(new vscode.Hover(
                    this.extension.completer.citation.theBibliographyData[token].text,
                    range
                ))
                return
            }
            resolve()
        })
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
        let s = this.mathPreview.renderCursor(document, tex.range)
        s = this.mathPreview.mathjaxify(s, tex.envname)
        const data = await this.mathPreview.mj.typeset({
            math: newCommand + this.mathPreview.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        })
        this.mathPreview.scaleSVG(data, scale)
        this.mathPreview.colorSVG(data)
        const xml = data.svgNode.outerHTML
        const md = this.mathPreview.svgToDataUrl(xml)
        return new vscode.Hover(new vscode.MarkdownString(this.addDummyCodeBlock(`![equation](${md})`)), tex.range )
    }

    async provideHoverOnRef(document: vscode.TextDocument, position: vscode.Position, refData: ReferenceEntry, token: string) : Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const line = refData.item.position.line
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
        mdLink.isTrusted = true
        if (configuration.get('hover.preview.ref.enabled') as boolean) {
            const tex = this.mathPreview.findMathEnvOnRef(document, position, token, refData)
            if (tex) {
                const newCommands = await this.mathPreview.findNewCommand(document.getText())
                return this.provideHoverPreviewOnRef(tex, newCommands, refData)
            }
        }
        const md = '```latex\n' + refData.text + '\n```\n'
        const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/)
        const refNumberMessage = this.mathPreview.refNumberMessage(refData)
        if (refNumberMessage !== undefined && configuration.get('hover.ref.numberAtLastCompilation.enabled') as boolean) {
            return new vscode.Hover([md, refNumberMessage, mdLink], refRange)
        }
        return new vscode.Hover([md, mdLink], refRange)
    }

    async provideHoverPreviewOnRef(tex: TexMathEnv, newCommand: string, refData: ReferenceEntry) : Promise<vscode.Hover> {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const scale = configuration.get('hover.preview.scale') as number

        let tag: string
        if (refData.item.atLastCompilation !== undefined && configuration.get('hover.ref.numberAtLastCompilation.enabled') as boolean) {
            tag = refData.item.atLastCompilation.refNumber
        } else {
            tag = refData.item.reference
        }
        const newTex = this.mathPreview.replaceLabelWithTag(tex.texString, refData.item.reference, tag)
        const s = this.mathPreview.mathjaxify(newTex, tex.envname, {stripLabel: false})
        const obj = { labels : {}, IDs: {}, startNumber: 0 }
        const data = await this.mathPreview.mj.typeset({
            width: 50,
            equationNumbers: 'AMS',
            math: newCommand + this.mathPreview.stripTeX(s),
            format: 'TeX',
            svgNode: true,
            state: {AMS: obj}
        })
        this.mathPreview.scaleSVG(data, scale)
        this.mathPreview.colorSVG(data)
        const xml = data.svgNode.outerHTML
        const md = this.mathPreview.svgToDataUrl(xml)
        const line = refData.item.position.line
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) })
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`)
        mdLink.isTrusted = true
        return new vscode.Hover( [this.addDummyCodeBlock(`![equation](${md})`), mdLink], tex.range )
    }
}
