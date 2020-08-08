import * as fs from 'fs-extra'
import * as stream from 'stream'
import * as vscode from 'vscode'
import {Extension} from '../main'

export class FileSystem {
    readonly extension: Extension

    constructor(extension: Extension) {
        this.extension = extension
    }

    get workspaceFolder() {
        const ret = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!ret) {
            throw new Error()
        }
        return ret
    }

    get shceme() {
        return this.workspaceFolder.scheme
    }

    get isLocal() {
        return this.workspaceFolder.scheme === 'file'
    }

    toUri(path: string) {
        return this.workspaceFolder.with({scheme: this.shceme, path})
    }

    existsSync(path: string) {
        if (this.isLocal) {
            return fs.existsSync(path)
        } else {
            return false
        }
    }

    async exists(path: string) {
        if (this.isLocal) {
            return fs.existsSync(path)
        } else {
            const uri = this.toUri(path)
            try {
                vscode.workspace.fs.stat(uri)
                return true
            } catch {
                return false
            }
        }
    }

    readFileSync(path: string) {
        return fs.readFileSync(path)
    }

    async readFile(path: string) {
        if (this.isLocal) {
            return fs.readFile(path)
        } else {
            const uri = this.toUri(path)
            const data = await vscode.workspace.fs.readFile(uri)
            return Buffer.from(data)
        }
    }

    async createReadStream(path: string) {
        if (this.isLocal) {
            return fs.createReadStream(path)
        } else {
            const uri = this.toUri(path)
            const data = await vscode.workspace.fs.readFile(uri)
            const buf = Buffer.from(data)
            const bufStream = new stream.PassThrough()
            bufStream.end(buf)
            return bufStream
        }
    }

}
