import * as vscode from 'vscode'
import * as path from 'path'
import {MathPreview, TexMathEnv} from '../providers/preview/mathpreview'
import {Extension} from '../main'

type InsetInfo = {
    inset?: vscode.WebviewEditorInset,
    curTexMath?: TexMathEnv,
    readonly curLine: number
}

type OptArg = {
    lineNumAsHeight?: number,
    texMath?: TexMathEnv
}

export class MathPreviewInsetManager {
    extension: Extension
    toggleFlag: boolean = false
    mathPreview: MathPreview
    previewInsets: Map<vscode.TextDocument, InsetInfo>

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = extension.mathPreview
        this.previewInsets = new Map()
    }

    createMathPreviewInset(editor: vscode.TextEditor, opt?: OptArg) {
        const document = editor.document
        if (document.languageId !== 'latex') {
            return
        }
        const position = editor.selection.active
        const insetRangeInfo = this.getInsetRangeAndHeight(document, position, opt)
        const extensionRoot = vscode.Uri.file(this.extension.extensionRoot)
        const localResourceRoot = extensionRoot.with( { path: path.join(extensionRoot.path, './resources/inset') })
        try {
            const inset = vscode.window.createWebviewTextEditorInset(
                editor,
                insetRangeInfo.insetStartLine,
                insetRangeInfo.lineNumAsHeight,
                {
                    enableScripts: true,
                    localResourceRoots: [localResourceRoot]
                }
            )
            const insetInfo: InsetInfo = {inset, curLine: position.line, curTexMath: insetRangeInfo.texMath}
            this.previewInsets.set(document, insetInfo)
            inset.webview.onDidReceiveMessage( async (message) => {
                switch (message.type) {
                    case 'sizeInfo':
                        if (message.img.height > message.window.height) {
                            inset.dispose()
                            const lnHeight = message.img.height / message.window.height * insetRangeInfo.lineNumAsHeight + 2
                            if (this.createMathPreviewInset(editor, {lineNumAsHeight: lnHeight, texMath: insetRangeInfo.texMath})) {
                                await this.updateMathPreviewInset(document, insetRangeInfo.texMath)
                            }
                        }
                        break
                    default:
                        break
                }
            })
            inset.onDidDispose( () => {
                const info = this.previewInsets.get(document)
                if (info && info.inset === inset) {
                    info.inset = undefined
                }
            })
            inset.webview.html = this.getImgHtml()
            return insetInfo
        } catch (e) {
            console.log(e)
        }
        return
    }

    moveInsetIfNeeded(editor: vscode.TextEditor) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const whenToDisplay = configuration.get('inset.mathpreview.whenToDisplay') as string
        const document = editor.document
        if (document.languageId !== 'latex' || !this.toggleFlag) {
            return
        }
        const insetInfo = this.previewInsets.get(document)
        const position = editor.selection.active
        if (insetInfo && insetInfo.inset) {
            if (insetInfo.curLine === position.line && whenToDisplay === 'always') {
                this.updateMathPreviewInset(document)
                return
            }
            const curTexMath = insetInfo.curTexMath
            if (curTexMath) {
                if (curTexMath.range.contains(position)) {
                    return
                }
            }
            setTimeout(() => {
                if (insetInfo && insetInfo.inset) {
                    insetInfo.inset.dispose()
                }
            }, 150)
        }
        const texMath = this.getTexMath(document, position)
        if (!texMath && whenToDisplay !== 'always') {
            return
        }
        // move
        if (this.createMathPreviewInset(editor, {texMath})) {
            this.updateMathPreviewInset(document, texMath)
        }
    }

    toggleMathPreviewInset() {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const document = editor.document
        if (this.toggleFlag) {
            this.toggleFlag = false
            const insetInfo = this.previewInsets.get(document)
            if (insetInfo && insetInfo.inset) {
                insetInfo.inset.dispose()
                insetInfo.inset = undefined
            }
        } else {
            this.toggleFlag = true
            const insetInfo = this.createMathPreviewInset(editor)
            if (insetInfo) {
                this.updateMathPreviewInset(document, insetInfo.curTexMath)
            }
        }
        return
    }

    getInsetRangeAndHeight(document: vscode.TextDocument, position: vscode.Position, opt?: OptArg) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const texMath = opt && opt.texMath ? opt.texMath : this.getTexMath(document, position)
        let insetStartLine = position.line
        let lineNumAsHeight: number
        if (!texMath || texMath.envname === '$') {
            lineNumAsHeight = configuration.get('inset.mathpreview.inlineMath.height') as number
        } else {
            lineNumAsHeight = configuration.get('inset.mathpreview.displayMath.height') as number
            insetStartLine = texMath.range.end.line
        }
        if (opt && opt.lineNumAsHeight !== undefined) {
            lineNumAsHeight = opt.lineNumAsHeight
        }
        return {insetStartLine, lineNumAsHeight, texMath}
    }

    getImgHtml() {
        const root = vscode.Uri.file(this.extension.extensionRoot)
        const jsPath = root.with( { scheme: 'vscode-resource', path: path.join(root.path, './resources/inset/mathpreview.js') }).toString()
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src vscode-resource:; img-src data:; style-src 'unsafe-inline';">
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                }
                #mathBlock {
                    width: 100%;
                }
                #math {
                    visibility: hidden;
                    position: relative;
                    display: block;
                }
            </style>
            <script src='${jsPath}'></script>
        </head>
        <body>
            <div id="mathBlock"><img src="" id="math" /></div>
        </body>
        </html>`
    }

    async updateMathPreviewInset(document: vscode.TextDocument, texMath0?: TexMathEnv) {
        if (document.languageId !== 'latex') {
            return
        }
        const insetInfo = this.previewInsets.get(document)
        if (!insetInfo || !this.toggleFlag || !insetInfo.inset) {
            return
        }
        const inset = insetInfo.inset
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }
        const position = editor.selection.active
        const texMath = texMath0 ? texMath0 : this.getTexMath(document, position)
        if (!texMath) {
            return
        }
        insetInfo.curTexMath = texMath
        const svgDataUrl = await this.mathPreview.generateSVG(document, texMath)
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        let leftRatio: number
        if (texMath.envname === '$') {
            leftRatio = configuration.get('inset.mathpreview.inlineMath.left') as number
        } else {
            leftRatio = configuration.get('inset.mathpreview.displayMath.left') as number
        }
        leftRatio = leftRatio > 1 ? 1 : leftRatio
        leftRatio = leftRatio < 0 ? 0 : leftRatio
        return inset.webview.postMessage({type: 'mathImage', src: svgDataUrl, leftRatio})
    }

    getTexMath(document: vscode.TextDocument, position: vscode.Position) {
        const texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        if (texMath) {
            if (texMath.envname !== '$') {
                return texMath
            }
            if (texMath.range.start.character !== position.character && texMath.range.end.character !== position.character) {
                return texMath
            }
        }
        return
    }
}
