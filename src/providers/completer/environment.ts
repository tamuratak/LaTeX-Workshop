import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import {latexParser} from 'latex-utensils'

import {Extension} from '../../main'

export class Environment {
    extension: Extension
    private defaultEnvs: vscode.CompletionItem[] = []
    private packageEnvs: {[pkg: string]: vscode.CompletionItem[]} = {}

    constructor(extension: Extension) {
        this.extension = extension
    }

    initialize(envs: string[]) {
        this.defaultEnvs = envs.map(env => new vscode.CompletionItem(env, vscode.CompletionItemKind.Module))
    }

    provideFrom() {
        return this.provide()
    }

    provide(): vscode.CompletionItem[] {
        // Extract cached envs and add to default ones
        const suggestions: vscode.CompletionItem[] = Array.from(this.defaultEnvs)
        const envList: string[] = this.defaultEnvs.map(env => env.label)
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedEnvs = this.extension.manager.cachedContent[cachedFile].element.environment
            if (cachedEnvs === undefined) {
                return
            }
            cachedEnvs.forEach(env => {
                if (envList.includes(env.label)) {
                    return
                }
                suggestions.push(env)
                envList.push(env.label)
            })
        })
        // If no insert package-defined environments
        if (!(vscode.workspace.getConfiguration('latex-workshop').get('intellisense.package.enabled'))) {
            return suggestions
        }
        // Insert package environments
        this.extension.manager.getIncludedTeX().forEach(tex => {
            const pkgs = this.extension.manager.cachedContent[tex].element.package
            if (pkgs === undefined) {
                return
            }
            pkgs.forEach(pkg => {
                this.getEnvFromPkg(pkg).forEach(env => {
                    if (envList.includes(env.label)) {
                        return
                    }
                    suggestions.push(env)
                    envList.push(env.label)
                })
            })
        })
        return suggestions
    }

    update(file: string, nodes?: latexParser.Node[], lines?: string[], content?: string) {
        if (nodes !== undefined && lines !== undefined) {
            this.extension.manager.cachedContent[file].element.environment = this.getEnvFromNodeArray(nodes, lines)
        } else if (content !== undefined) {
            this.extension.manager.cachedContent[file].element.environment = this.getEnvFromContent(content)
        }
    }

    // This function will return all environments in a node array, including sub-nodes
    private getEnvFromNodeArray(nodes: latexParser.Node[], lines: string[]): vscode.CompletionItem[] {
        let envs: vscode.CompletionItem[] = []
        for (let index = 0; index < nodes.length; ++index) {
            envs = envs.concat(this.getEnvFromNode(nodes[index], lines))
        }
        return envs
    }

    private getEnvFromNode(node: latexParser.Node, lines: string[]): vscode.CompletionItem[] {
        let envs: vscode.CompletionItem[] = []
        let label = ''
        // Here we only check `isEnvironment`which excludes `align*` and `verbatim`.
        // Nonetheless, they have already been included in `defaultEnvs`.
        if (latexParser.isEnvironment(node)) {
            label = node.name
            envs.push(new vscode.CompletionItem(label, vscode.CompletionItemKind.Module))
        }
        if (latexParser.hasContentArray(node)) {
            envs = envs.concat(this.getEnvFromNodeArray(node.content, lines))
        }
        return envs
    }

    private getEnvFromPkg(pkg: string): vscode.CompletionItem[] {
        if (pkg in this.packageEnvs) {
            return this.packageEnvs[pkg]
        }
        const filePath = `${this.extension.extensionRoot}/data/packages/${pkg}_env.json`
        if (!fs.existsSync(filePath)) {
            return []
        }
        this.packageEnvs[pkg] = (JSON.parse(fs.readFileSync(filePath).toString()) as string[])
            .map(env => new vscode.CompletionItem(env, vscode.CompletionItemKind.Module))
        return this.packageEnvs[pkg]
    }

    private getEnvFromContent(content: string): vscode.CompletionItem[] {
        const envReg = /\\begin\s?{([^{}]*)}/g
        const envs: vscode.CompletionItem[] = []
        const envList: string[] = []
        while (true) {
            const result = envReg.exec(content)
            if (result === null) {
                break
            }
            if (envList.includes(result[1])) {
                continue
            }

            envs.push(new vscode.CompletionItem(result[1], vscode.CompletionItemKind.Module))
            envList.push(result[1])
        }
        return envs
    }
}
