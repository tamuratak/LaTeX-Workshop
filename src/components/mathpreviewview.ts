import * as vscode from 'vscode'
import * as path from 'path'
import {MathPreview, TexMathEnv} from '../providers/preview/mathpreview'
import {Extension} from '../main'


export class MathPreviewViewProvider implements vscode.WebviewViewProvider {
    extension: Extension
    mathPreview: MathPreview
    view: vscode.WebviewView | undefined
    prevDocumentUri?: string
    prevCursorPosition?: vscode.Position
    prevNewCommands?: string

    constructor(extension: Extension) {
        this.extension = extension
        this.mathPreview = extension.mathPreview
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView
        webviewView.webview.options = {
            enableScripts: true
        }
        webviewView.onDidDispose(() => {
            this.close()
        })
        const jsPath = vscode.Uri.file(path.join(this.extension.extensionRoot, './resources/mathpreviewview/mathpreview.js'))
        const jsPathSrc = webviewView.webview.asWebviewUri(jsPath)
        webviewView.webview.html = this.getHtml(jsPathSrc)
        webviewView.webview.onDidReceiveMessage(() => this.update())
    }

    open() {
        const panel = vscode.window.createWebviewPanel(
            'latex-workshop-mathpreview',
            'Math Preview',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        )
        const jsPath = vscode.Uri.file(path.join(this.extension.extensionRoot, './resources/mathpreviewview/mathpreview.js'))
        const jsPathSrc = panel.webview.asWebviewUri(jsPath)
        panel.webview.html = this.getHtml(jsPathSrc)
        panel.webview.onDidReceiveMessage(() => this.update())
    }

    close() {
        this.view = undefined
        this.clearCache()
    }

    clearCache() {
        this.prevDocumentUri = undefined
        this.prevCursorPosition = undefined
        this.prevNewCommands = undefined
    }

    getHtml(jsPathSrc: vscode.Uri) {
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
            <script src='${jsPathSrc}' defer></script>
        </head>
        <body> 
            <div id="mathBlock"><img src="" id="math" /></div>
        </body>
        </html>`
    }

    async update() {
        if (!this.view || !this.view.visible) {
            return
        }
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || document?.languageId !== 'latex') {
            this.clearCache()
            return
        }
        const documentUri = document.uri.toString()
        const position = editor.selection.active
        const texMath = this.getTexMath(document, position)
        if (!texMath) {
            this.clearCache()
            return
        }
        let cachedCommands: string | undefined
        if ( position.line === this.prevCursorPosition?.line && documentUri === this.prevDocumentUri ) {
            cachedCommands = this.prevNewCommands
        }
        const {svgDataUrl, newCommands} = await this.mathPreview.generateSVG(document, texMath, cachedCommands)
        this.prevDocumentUri = documentUri
        this.prevNewCommands = newCommands
        this.prevCursorPosition = position
        return this.view.webview.postMessage({type: 'mathImage', src: svgDataUrl })
    }

    getTexMath(document: vscode.TextDocument, position: vscode.Position) {
        const texMath = this.mathPreview.findMathEnvIncludingPosition(document, position)
        if (texMath) {
            // this.renderCursor(document, texMath)
            if (texMath.envname !== '$') {
                return texMath
            }
            if (texMath.range.start.character !== position.character && texMath.range.end.character !== position.character) {
                return texMath
            }
        }
        return
    }

    renderCursor(document: vscode.TextDocument, tex: TexMathEnv) {
        const s = this.mathPreview.renderCursor(document, tex.range)
        tex.texString = s
    }

}
