import * as chokidar from 'chokidar'

process.once('message', function (msg) {
  const watcher = chokidar.watch(msg.path, msg.opts)

  watcher.on('all', (event, path) => {
    process.send && process.send({ event: event, path: path })
  })
})

process.on('disconnect', function () {
  process.exit()
})
