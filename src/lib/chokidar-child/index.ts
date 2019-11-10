import * as cp from 'child_process'
import {EventEmitter} from 'events'
import * as path from 'path'
import * as chokidar from 'chokidar'
import {Arg} from './arg_types'

export class Watcher extends EventEmitter {
  private child: cp.ChildProcess
  closing: boolean = false
  closed: boolean = false

  constructor(filePath: string | ReadonlyArray<string>, opts: chokidar.WatchOptions) {
    super()
    const child = cp.fork(path.join(__dirname, 'child'))
    this.child = child

    const initArg: Arg = {
      method: 'init',
      args: {
        path: filePath,
        opts
      }
    }
    child.send(initArg)

    child.on('message', (msg) => {
      this.emit(msg.event, msg.path)
      this.emit('all', msg.event, msg.path)
    })

    child.on('error', () => {})

    child.on('exit', (exit, signal) => {
      if (this.closing) {
        this.closing = false
        this.closed = true
        return
      }
      this.emit('childDead', child.pid, exit, signal)
    })
  }

  add(path: string | ReadonlyArray<string>) {
    const addArg: Arg = {
      method: 'add',
      args: {
        path
      }
    }
    this.child.send(addArg)
  }

  close(cb?: () => {}) {
    if (this.closing || this.closed) {
      return
    }
    this.closing = true
    if (cb) {
      this.child.on('exit', cb)
    }
    setImmediate(() => {
      this.child && this.child.kill()
    })
  }

  unwatch(path: string | ReadonlyArray<string>) {
    const unwatchArg: Arg = {
      method: 'unwatch',
      args: {
        path
      }
    }
    this.child.send(unwatchArg)
  }

}

export function watch(filePath: string | ReadonlyArray<string>, opts: chokidar.WatchOptions) {
  return new Watcher(filePath, opts)
}
