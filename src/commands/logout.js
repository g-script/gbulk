const { Command, flags } = require('@oclif/command')

const config = require('../config')

class LogoutCommand extends Command {
  static description = `logout from Github

Erase authentication details from configuration file`

  static flags = {
    help: flags.help({ char: 'h' })
  }

  async run () {
    config.set('auth', {})
  }
}

module.exports = LogoutCommand
