import * as chokidar from 'chokidar'
import {Arg} from './arg_types'

let watcher: chokidar.FSWatcher
process.on('message', (msg: Arg) => {
  if (msg.method === 'init') {
    if (watcher) {
      return
    }
    watcher = chokidar.watch(msg.args.path, msg.args.opts)
    watcher.on('all', (event, path) => {
      process.send && process.send({ event: event, path: path })
    })
    return
  } else if (msg.method === 'add') {
    watcher.add(msg.args.path)
    return
  } else if (msg.method === 'unwatch') {
    watcher.unwatch(msg.args.path)
    return
  }
})

process.on('disconnect', function () {
  process.exit()
})
