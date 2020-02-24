const { Command, flags } = require('@oclif/command')
const chalk = require('chalk')
const inquirer = require('inquirer')

const config = require('../config')
const GithubAPI = require('../lib/github-api')

class LoginCommand extends Command {
  static description = chalk`login to Github

To authenticate to Github with {bold gbulk}, go grab a personal access token at https://github.com/settings/tokens
Each command needs access to different scopes, see individual command help section to know which scopes are needed.`

  static flags = {
    help: flags.help({ char: 'h' }),
    verbose: flags.boolean({
      char: 'v',
      description: 'verbose mode',
      default: false
    })
  }

  async run () {
    const { flags } = this.parse(LoginCommand)

    const auth = config.get('auth')

    if (auth && auth.user) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'list',
          name: 'confirm',
          message: `You are already logged in as ${auth.user}. Change user?`,
          choices: ['Yes', 'No']
        }
      ])

      if (confirm === 'No') {
        this.exit(0)
      }
    }

    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Enter your personnal access token',
        validate: token => {
          if (!token) {
            return 'Token is required'
          }

          return true
        }
      }
    ])

    try {
      const user = await GithubAPI.get.user(token)

      config.set('auth', {
        token,
        user: user.login
      })

      flags.verbose && this.log('Logged in as', user.login)
    } catch (err) {
      config.set('auth', {})

      if (auth && auth.user) {
        this.warn(`${auth.user} was logged out`)
      }

      this.error(err)
    }
  }
}

module.exports = LoginCommand
