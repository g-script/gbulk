const { Command, flags } = require('@oclif/command')
const { CLIError } = require('@oclif/errors')
const Promise = require('aigle')
const chalk = require('chalk')
const fs = require('fs')
const inquirer = require('inquirer')
const Joi = require('@hapi/joi')
const path = require('path')
const Spinnies = require('spinnies')

const config = require('../config')
const GithubAPI = require('../lib/github-api')
const Git = require('../lib/git')

const spinnies = new Spinnies()

class BackupCommand extends Command {
  static description = chalk`backup repositories

This command allows you to backup all repositories of a Github account, should it be yours or another user/organization repositories (public and repos you have access to).
This performs a mirror clone of selected repositories in bulk, with parallel processing.

{bold HOW TO USE}

{underline Backup your repositories:}

Use {yellow gbulk backup} without arguments. If you want to specify a backup path, use {yellow gbulk backup $YOUR_USERNAME $BACKUP_PATH}.

{underline Backup another user or an organization repositories:}

Use {yellow gbulk backup $USERNAME} or {yellow gbulk backup $ORGNAME}.

{bold INTERACTIVE MODE} {cyan -i, --interactive}

If you don’t like to write flags, or just lazy, we got you covered.

{bold FILTERING}

Filtering is done through following flags:
{cyan --public} (type)
{cyan --private} (type)
{cyan --owner} (affiliation)
{cyan --collaborator} (affiliation)
{cyan --member} (affiliation)

{underline Type filters:}

{yellow --public}            will only backup public repositories
{yellow --private}           will only backup private repositories
{yellow --public --private}  will backup public and private repositories — {underline this is the same as omitting both flags}

{underline Affiliation filters:}

If one or more affiliation flag is provided, those that are not defined are assumed false.
If one or more no-variant of affiliation flag is provided, those that are not defined are assumed true.
If none or all flags are provided, they are assumed true.

{dim Examples:
  --owner                     will only backup owned repositories
  --member                    will only backup repositories where user is member
  --owner --collaborator      will backup owned repositories and repositories where user is collaborator}

{bold GIT LFS} {cyan --[no]-lfs}

{yellow gbulk} supports Git LFS if command is available. {underline By default, LFS objects will not be included.}
If command is available and interactive mode is enabled, you will be prompted to include LFS objects.
You can also force this value with interactive mode by defining it via flags.

{bold CLEAN PULL REFS} {cyan --clean-refs}

Because {yellow gbulk} performs a mirror clone, backup repositories also include Github pull request references in git refs. {underline By default, Github pull refs are not cleaned.}
If interactive mode is enabled, you will be prompted to clean refs.
You can also force this value with interactive mode by defining it via flags.

{bold QUIET} {cyan -q, --quiet}

Bulk backups are very long, so it is not recommended to use quiet mode. Anyway: you can.
`

  static flags = {
    help: flags.help({ char: 'h' }),
    public: flags.boolean({
      description: 'include public repositories'
    }),
    private: flags.boolean({
      description: 'include private repositories'
    }),
    owner: flags.boolean({
      description: 'include owned repositories',
      allowNo: true
    }),
    collaborator: flags.boolean({
      description: 'include repositories where user is collaborator',
      allowNo: true
    }),
    member: flags.boolean({
      description: 'include repositories where user is member',
      allowNo: true
    }),
    exclude: flags.string({
      char: 'x',
      description:
        'exclude repositories whose name is matching specified string or regex pattern (omitting start and end delimiters)',
      multiple: true
    }),
    match: flags.string({
      char: 'm',
      description:
        'include only repositories whose name is matching specified string or regex pattern (omitting start and end delimiters)',
      multiple: true
    }),
    'clean-refs': flags.boolean({
      char: 'c',
      description: '[default: false] clean GitHub specific pull refs (refs/pull) from backup repositories'
    }),
    lfs: flags.boolean({
      description: '[default: false] include LFS objects in backup',
      allowNo: true
    }),
    quiet: flags.boolean({
      char: 'q',
      description: 'disable logging',
      default: false
    }),
    interactive: flags.boolean({
      char: 'i',
      description: 'interactive mode',
      exclusive: ['quiet'],
      default: false
    }),
    parallel: flags.string({
      char: 'p',
      description: 'backup multiple repositories in parallel',
      default: 8,
      parse: (input) => {
        /**
         * We use Joi to allow potential misuses of parallel flag value.
         * => parallel=a will use default value
         */
        return Joi.attempt(
          input,
          Joi.number()
            .default(this.flags.parallel.default)
            .failover(this.flags.parallel.default)
        )
      }
    })
  }

  /**
   * We do not use oclif defaults to avoid runtime defaults to be output in
   * auto-generated README sections.
   */
  static args = [
    {
      name: 'from',
      description: chalk`[default: authenticated user] {underline user} name or {underline organization} name to backup from`
    },
    {
      name: 'destination',
      description: '[default: gbulk-backup-{timestamp}] backup destination path'
    }
  ]

  /**
   * We use Joi to provide runtime default values for arguments.
   */
  static argsSchema = Joi.object().keys({
    from: Joi.string().default(config.get('auth.user')),
    destination: Joi.string().default(path.join(process.cwd(), `gbulk-backup-${Date.now()}`))
  })

  /**
   * Initialize runtime data that will be used by our functions.
   * @param  {...any} args Original arguments passed to super()
   */
  constructor (...args) {
    super(...args)

    this.args = {}
    this.flags = {}
    this.auth = {}
    this.destinationCreated = false
  }

  /**
   * Runs initialization of args and flags with parsed command values.
   */
  _init () {
    const { args, flags } = this.parse(BackupCommand)

    this.debug('arguments', args)
    this.debug('flags', flags)

    this.initArgs(args)
    this.initFlags(flags)
  }

  /**
   * Initialize `this.args`.
   * @param {Object} args Original arguments parsed from command
   * @see BackupCommand.argsSchema
   */
  initArgs (args) {
    // Joi.attempt() returns validated args (with default values generated on runtime)
    this.args = Joi.attempt(args, BackupCommand.argsSchema, new CLIError('Failed to validate args'))
  }

  /**
   * Initialize `this.flags`.
   * @param {Object} flags Original flags parsed from command
   */
  initFlags (flags) {
    this.flags = flags
  }

  /**
   * Checks authentication from config and save it to `this.auth`.
   * @throws {CLIError} if authentication is invalid
   */
  checkAuth () {
    this.debug('checking authentication')

    const auth = config.get('auth')

    if (auth && auth.token && auth.user) {
      this.debug('authenticated user is', auth.user)

      this.auth = auth

      return
    }

    this.debug('invalid authentication:', auth)
    this.error(chalk`You are not authenticated, please run {yellow gbulk login} first.`)
  }

  /**
   * Checks git command availability.
   * @throws {CLIError} if git command is not available
   */
  async checkGit () {
    this.debug('checking git command availability')

    try {
      await Git.check()

      this.debug('git command is available')
    } catch (err) {
      this.debug(err)
      this.error(err.message)
    }
  }

  /**
   * Checks destination path exists and we have write acces on it.
   * If it doesn’t exists, we try to create it.
   */
  async checkDestination () {
    const { destination } = this.args

    this.debug('checking destination path', destination)

    try {
      await fs.promises.access(destination, fs.constants.W_OK)

      this.debug('destination path exists and is writable')
    } catch (err) {
      if (err.code === 'ENOENT') {
        try {
          this.debug('destination path does not exists, create it...')

          await fs.promises.mkdir(destination)

          this.debug('destination path created')

          this.destinationCreated = true
        } catch (err) {
          this.debug(err)
          this.error(`Cannot create ${destination}`)
        }
      } else {
        this.error(`Cannot access ${destination}`)
      }
    }
  }

  /**
   * INTERACTIVE MODE
   * Prompts for search filters. This replaces use of flags while taking account
   * of user defined flags. This means gbulk -i --public --owner will prompt a
   * list having only public and owner options already selected. By default,
   * without any search filter flags defined, all options are pre-checked.
   * Selection is appended to `this.flags`.
   */
  async promptSearchFilters () {
    const { public: isPublic, private: isPrivate, owner, member, collaborator } = this.flags
    const hasFlagsDefined =
      isPublic !== undefined ||
      isPrivate !== undefined ||
      owner !== undefined ||
      member !== undefined ||
      collaborator !== undefined

    const { filters } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'filters',
        message: 'Select search filters',
        choices: [
          new inquirer.Separator('### Repository type ###'),
          {
            name: 'public',
            checked: hasFlagsDefined ? isPublic || false : true
          },
          {
            name: 'private',
            checked: hasFlagsDefined ? isPrivate || false : true
          },
          new inquirer.Separator('### Affiliation with repository ###'),
          {
            name: 'owner',
            checked: hasFlagsDefined ? owner || false : true
          },
          {
            name: 'collaborator',
            checked: hasFlagsDefined ? collaborator || false : true
          },
          {
            name: 'member',
            checked: hasFlagsDefined ? member || false : true
          }
        ]
      }
    ])

    for (const filter of filters) {
      this.flags[filter] = true
    }
  }

  /**
   * INTERACTIVE MODE
   * Prompts for repository selection. This replaces or completes the use of
   * exclude and match flags. If one of those flags is defined, prompted list
   * will not include exculuded/matching repositories.
   * @param {Array} repositories Repositories to backup
   * @returns {Array} Selected repositories
   */
  async selectRepositories (repositories) {
    const { repos: selectedRepos } = await inquirer.prompt([
      {
        type: 'checkbox',
        message: 'Select repositories to backup',
        name: 'repos',
        choices: repositories
          .sort((a, b) => {
            if (a.private && b.private) {
              return 0
            }
            if (!a.private && b.private) {
              return -1
            }

            return 1
          })
          .filter((repo) => !repo.private)
          .reduce((acc, repo) => {
            if (!acc.length) {
              acc.push(new inquirer.Separator('### Public repositories ###'))
            }

            acc.push({
              checked: true,
              name: repo.fullName
            })

            return acc
          }, [])
          .concat(
            repositories
              .filter((repo) => repo.private)
              .reduce((acc, repo) => {
                if (!acc.length) {
                  acc.push(new inquirer.Separator('### Private repositories ###'))
                }

                acc.push({
                  checked: true,
                  name: repo.fullName
                })

                return acc
              }, [])
          ),
        validate: function (selectedRepos) {
          if (selectedRepos.length === 0) {
            return 'You must choose at least one repository.'
          }

          return true
        }
      }
    ])

    return repositories.filter((repository) => {
      return selectedRepos.find((selectedRepo) => repository.fullName === selectedRepo)
    })
  }

  /**
   * Handles clean refs flag:
   * - if not in interactive mode and flag is not defined, disable flag
   * - if in interactive mode and flag is not defined, prompt user
   * - if flag is defined, use it as is (even in interactive mode)
   */
  async handleCleanRefOption () {
    const { interactive, 'clean-refs': cleanRefs } = this.flags

    if (interactive && cleanRefs !== undefined) {
      this.debug('skipping clean-refs question as it was defined by flags')
    } else if (interactive) {
      const { cleanRefs } = await inquirer.prompt([
        {
          type: 'list',
          message: 'Do you want to clean pull request references from backup repositories?',
          name: 'cleanRefs',
          choices: ['Yes', 'No']
        }
      ])

      if (cleanRefs === 'Yes') {
        this.flags['clean-refs'] = true
      }
    } else if (cleanRefs === undefined) {
      this.debug('disabling clean-refs by default')

      this.flags['clean-refs'] = false
    }
  }

  /**
   * Checks if Git LFS command is available before handling lfs flag:
   * - if not in interactive mode and flag is not defined, disable flag
   * - if in interactive mode and flag is not defined, prompt user
   * - if flag is defined, use it as is (even in interactive mode)
   */
  async handleLFSOption () {
    const { interactive, lfs, quiet } = this.flags

    this.debug('checking git lfs availability')

    const hasLFS = await Git.LFS.check()

    if (!hasLFS) {
      this.debug('backup will skip lfs objects as git lfs is not supported')

      // Only warn if lfs flag was explicitly enabled or in interactive mode
      if (!quiet && (lfs || (lfs === undefined && interactive))) {
        this.warn('Git LFS is not installed, objects stored through LFS will not be backup.')
      }

      this.flags.lfs = false
    } else {
      this.debug('git lfs is available')

      if (interactive && lfs !== undefined) {
        this.debug('skipping lfs question as it was defined by lfs flag')
      } else if (interactive) {
        const { shouldIncludeLfs } = await inquirer.prompt([
          {
            type: 'list',
            message: 'Do you want to include LFS objects (if relevant) in backup?',
            name: 'shouldIncludeLfs',
            choices: ['Yes', 'No']
          }
        ])

        if (shouldIncludeLfs === 'No') {
          this.flags.lfs = false
        } else {
          this.flags.lfs = true
        }
      } else if (lfs === undefined) {
        this.debug('disabling lfs by default')

        this.flags.lfs = false
      }
    }
  }

  /**
   * Builds Github fetch repositories options (filters) based on account type.
   * @param {String} type Account type
   * @returns {Object} Builded options
   * @throws {CLIError} if account type is unknown
   */
  buildFetchOptions (type) {
    const { public: isPublic, private: isPrivate, member, owner } = this.flags
    const options = {
      type,
      params: {}
    }

    if (type === 'User') {
      const typeParam = member && !owner ? 'member' : owner && !member ? 'owner' : 'all'

      this.debug('backup another user repositories where user is', typeParam === 'all' ? 'owner or member' : typeParam)

      options.params = {
        type: typeParam
      }
    } else if (type === 'Organization') {
      // This could (should) be enhanced
      const typeParam =
        isPublic && !isPrivate && !member
          ? 'public'
          : isPrivate && !isPublic && !member
            ? 'private'
            : member && !isPublic && !isPrivate
              ? 'member'
              : 'all'

      this.debug(
        'backup',
        typeParam !== 'all' && isPublic && !isPrivate
          ? 'public'
          : typeParam !== 'all' && isPrivate && !isPublic
            ? 'private'
            : 'all',
        'organization repositories',
        typeParam === 'member' ? 'where user is member' : ''
      )

      options.params = {
        type: typeParam
      }
    } else if (type === 'Authenticated') {
      const visibility = isPublic && !isPrivate ? 'public' : isPrivate && !isPublic ? 'private' : 'all'
      const affiliationFlags = ['owner', 'collaborator', 'member']
      const affiliation = []

      // Handle affiliation flags enabling
      affiliationFlags.forEach((flag) => {
        if (this.flags[flag]) affiliation.push(flag)
      })

      // If no affiliation flag explicitly enabled
      if (!affiliation.length) {
        // Enable all affiliation flags not explicitly disabled
        affiliationFlags.forEach((flag) => {
          if (this.flags[flag] !== false) affiliation.push(flag)
        })
      }

      this.debug(
        'backup authenticated user',
        visibility === 'all' ? 'public and private' : visibility,
        'repositories where user is',
        affiliation.join(',')
      )

      options.params = {
        affiliation: affiliation.map((aff) => (aff === 'member' ? 'organization_member' : aff)).join(','),
        visibility
      }
    } else {
      this.error(`User type ${type} is not handled.`)
    }

    return options
  }

  /**
   * Handles exclusions set via `exclude` flag.
   * @param {Array} repositories Repositories to backup
   * @returns {Array} Filtered repositories
   */
  handleExclusions (repositories) {
    const { exclude } = this.flags

    if (exclude && exclude.length) {
      this.debug('filter repos following exclude flag')

      const excluded = []
      const filteredRepositories = repositories.filter((repo) => {
        return exclude.reduce((acc, exclude) => {
          // If not yet excluded, test exclude rule
          if (acc) {
            const keep = !new RegExp(exclude).test(repo.name)

            if (!keep) {
              excluded.push(repo.name)
            }

            return keep
          }

          return acc
        }, true)
      })

      this.debug(`excluded ${excluded.length} repositories ${JSON.stringify(excluded)}`)

      return filteredRepositories
    }

    return repositories
  }

  /**
   * Handles inclusions set via `match` flag.
   * @param {Array} repositories Repositories to backup
   * @returns {Array} Filtered repositories
   */
  handleInclusions (repositories) {
    const { match } = this.flags

    if (match && match.length) {
      this.debug('filter repos following match flag')

      const excluded = []
      const filteredRepositories = repositories.filter((repo) => {
        return match.reduce((acc, match) => {
          // If not yet excluded, test exclude rule
          if (acc) {
            const keep = new RegExp(match).test(repo.name)

            if (!keep) {
              excluded.push(repo.name)
            }

            return keep
          }

          return acc
        }, true)
      })

      this.debug(`excluded ${excluded.length} repositories ${JSON.stringify(excluded)}`)

      return filteredRepositories
    }

    return repositories
  }

  /**
   * Clone repository.
   * @param {Object} repository Repository data
   */
  async clone (repository) {
    const { quiet } = this.flags

    this.debug(repository.fullName, 'clone repository')

    if (!quiet) {
      spinnies.add(repository.fullName, { text: `${repository.fullName} — Cloning...` })
    }

    try {
      await Git.clone(repository)

      this.debug(repository.fullName, 'repository cloned')

      if (!quiet) {
        spinnies.update(repository.fullName, {
          text: `${repository.fullName} — Cloned`
        })
      }
    } catch (err) {
      if (err.exitCode === 128) {
        const error = `${repository.fullName} — failed to clone: destination path exists and is not empty`

        this.debug(error)

        if (!quiet) {
          spinnies.fail(repository.fullName, {
            text: error
          })
        }
      } else if (!quiet) {
        spinnies.fail(repository.fullName, { text: err.shortMessage || err.message })
      }

      throw err
    }
  }

  /**
   * Fetch repository’s LFS objects.
   * @param {Object} repository Repository data
   * @returns {Boolean} true if a warning was raised, false if not
   */
  async fetchLFS (repository) {
    const { quiet } = this.flags
    const curSpinnerText = !quiet && spinnies.pick(repository.fullName).text

    this.debug(repository.fullName, 'fetch lfs objects')

    if (!quiet) {
      spinnies.update(repository.fullName, {
        text: `${curSpinnerText} — Fetching LFS objects...`
      })
    }

    try {
      await Git.LFS.fetch(repository)

      this.debug(repository.fullName, 'lfs objects fetched')

      if (!quiet) {
        spinnies.update(repository.fullName, {
          text: `${curSpinnerText} — LFS objects fetched`
        })
      }

      return false
    } catch (err) {
      if (!quiet) {
        spinnies.update(repository.fullName, {
          text: `${curSpinnerText} — Failed to fetch LFS objects`
        })
      }

      this.debug(repository.fullName, 'failed to fetch lfs objects:', err)

      return true
    }
  }

  /**
   * Clean Github pull refs from repository’s Git references.
   * @param {Object} repository Repository data
   * @returns {Boolean} true if a warning was raised, false if not
   */
  async cleanRefs (repository) {
    const { quiet } = this.flags
    const curSpinnerText = !quiet && spinnies.pick(repository.fullName).text

    this.debug(repository.fullName, 'clean pull refs')

    if (!quiet) {
      spinnies.update(repository.fullName, {
        text: `${curSpinnerText} — Cleaning /pull refs...`
      })
    }

    try {
      const refsCleaned = await Git.cleanRefs(repository)

      if (refsCleaned) {
        this.debug(repository.fullName, 'pull refs cleaned')

        if (!quiet) {
          spinnies.update(repository.fullName, {
            text: `${curSpinnerText} — Refs cleaned`
          })
        }
      } else {
        this.debug(repository.fullName, 'no pull ref to clean')

        if (!quiet) {
          spinnies.update(repository.fullName, {
            text: `${curSpinnerText} — No ref to clean`
          })
        }
      }

      return false
    } catch (err) {
      if (!quiet) {
        spinnies.update(repository.fullName, {
          text: `${curSpinnerText} — Failed to clean pull refs`,
          succeedColor: 'orange'
        })
      }

      this.debug(repository.fullName, 'failed to clean pull refs:', err)

      return true
    }
  }

  /**
   * Run repositories backup process.
   * @param {Array} repositories Repositories to backup
   */
  async backup (repositories) {
    const { 'clean-refs': cleanRefs, lfs, parallel, quiet } = this.flags
    const globalBackupText = !quiet && spinnies.pick('backup').text
    let backupCount = 0

    await Promise.resolve(repositories).mapLimit(parallel, async (repository) => {
      const data = {
        path: path.resolve(this.args.destination, repository.fullName + '.git'),
        url: repository.urls.https,
        fullName: repository.fullName
      }

      try {
        await this.clone(data)

        const warn = {
          lfs: false,
          refs: false
        }

        // Only run if clone succeeded
        if (lfs) {
          warn.lfs = await this.fetchLFS(data)
        }

        if (cleanRefs) {
          warn.refs = await this.cleanRefs(data)
        }

        if (!quiet) {
          this.log(chalk`{${warn.lfs || warn.refs ? 'yellow' : 'green'} ✓ ${spinnies.pick(repository.fullName).text}}`)

          spinnies.remove(repository.fullName)
          spinnies.update('backup', {
            text: globalBackupText + ` (${++backupCount}/${repositories.length})`
          })
        }
      } catch (err) {
        this.debug(`failed to clone ${repository.fullName}:`, err)
      }
    })
  }

  /**
   * Run command.
   */
  async run () {
    this.initGracefulShutdown()

    this._init()

    const { from } = this.args
    const { interactive, quiet } = this.flags

    if (quiet) {
      this.debug('quiet mode enabled')
    }

    this.checkAuth()
    await this.checkGit()
    await this.checkDestination()

    if (interactive) {
      await this.promptSearchFilters()
    }

    let options

    if (from === this.auth.user) {
      options = this.buildFetchOptions('Authenticated')
    } else {
      const account = await GithubAPI.get.user({
        token: this.auth.token,
        user: from
      })

      options = this.buildFetchOptions(account.type)
    }

    if (!quiet) {
      spinnies.add('fetch', { text: `Fetching repositories of ${from}` })
    }

    let repositories = await GithubAPI.get.repositories({
      token: this.auth.token,
      options
    })

    if (!quiet) {
      spinnies.succeed('fetch')
    }

    if (!repositories.length) {
      this.error('No repositories to backup.')
    } else {
      repositories = this.handleInclusions(this.handleExclusions(repositories))

      if (interactive && repositories.length > 1) {
        repositories = await this.selectRepositories(repositories)
      }

      await this.handleCleanRefOption()
      await this.handleLFSOption()

      this.debug('backup of', repositories.length, 'repositories')

      if (!quiet) {
        spinnies.add('backup', { text: `Backup of ${repositories.length} repositories...` })
      }

      await this.backup(repositories)

      this.debug('backup complete')

      if (!quiet) {
        spinnies.succeed('backup')
      }
    }
  }

  /**
   * Register event listener for graceful shutdown
   */
  initGracefulShutdown() {
    process.stdin.resume()

    process.on('exit', this.shutdown.bind(this)) // App closing
    process.on('SIGINT', this.shutdown.bind(this)) // CTRL+C
    process.on('SIGUSR1', this.shutdown.bind(this)) // Kill command
    process.on('SIGUSR2', this.shutdown.bind(this)) // Kill command
    process.on('uncaughtException', this.shutdown.bind(this)) // Uncaught exception
  }

  /**
   * Handles graceful shutdown
   * - destination path is deleted if it was created and is empty
   * - destination path is keeped if it existed or was created and not empty
   */
  shutdown() {
    const { destination } = this.args

    if (this.destinationCreated) {
      try {
        fs.rmdirSync(destination)

        this.log(`---
Backup cancelled!`)
      } catch (err) {
        this.log(`---
Backup cancelled!

${destination} will not be removed as it is not empty`)

        process.exit(130)
      }
    } else {
      this.log(`---
Backup cancelled!`)

      process.exit(130)
    }
  }
}

module.exports = BackupCommand
