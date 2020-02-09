const { Command, flags } = require('@oclif/command')
const chalk = require('chalk')
const fs = require('fs')
const inquirer = require('inquirer')
const path = require('path')

const config = require('../config')
const GithubAPI = require('../lib/github-api')
const Git = require('../lib/git')

const backupPath = path.join(process.cwd(), `gbulk-backup-${Date.now()}`)

class BackupCommand extends Command {
  static description = chalk`backup repositories

With {bold gbulk}, you can backup from different sources:
- to backup repositories you own, run {yellow gbulk backup} without arguments (if you want to specify a backup path, use {yellow gbulk backup $YOUR_USERNAME $BACKUP_PATH})
- to backup repositories of another user, run {yellow gbulk backup $USERNAME}
- to backup repositories of an organization, run {yellow gbulk backup $ORGNAME}

Git LFS objects will be backup if {bold git-lfs} is available in path.`

  static flags = {
    help: flags.help({ char: 'h' }),
    public: flags.boolean({
      description: 'include/exclude public repositories'
    }),
    private: flags.boolean({
      description: 'include/exclude private repositories'
    }),
    owner: flags.boolean({
      description: 'include/exclude owned repositories',
      allowNo: true
    }),
    collaborator: flags.boolean({
      description: 'include/exclude repositories where user is collaborator',
      allowNo: true
    }),
    member: flags.boolean({
      description: 'include/exclude repositories where user is member',
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
      description: 'clean GitHub specific pull refs (refs/pull) from backup repositories',
      default: false
    }),
    lfs: flags.boolean({
      description: 'include LFS objects in backup',
      default: true,
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
      default: false,
      exclusive: ['public', 'private', 'owner', 'collaborator', 'member', 'exclude', 'match', 'clean-refs', 'lfs']
    })
  }

  static args = [
    {
      name: 'from',
      description: chalk`{underline user} name or {underline organization} name to backup from`,
      default: config.get('auth.user')
    },
    {
      name: 'destination',
      description: 'backup destination path',
      default: backupPath
    }
  ]

  async run() {
    const { args, flags } = this.parse(BackupCommand)
    let exitCode = 0

    if (flags.quiet) {
      this.debug('quiet mode enabled')
    }

    this.debug('checking auth')

    const auth = config.get('auth')

    if (!auth || !auth.token) {
      this.error(chalk`You are not authenticated, please run {yellow gbulk login} first.`)
    } else {
      this.debug('authenticated user is', auth.user)
    }

    this.debug('checking git command availability')

    await Git.check()

    this.debug('git command available')

    let gitLFS = false

    if (flags.lfs) {
      this.debug('checking git lfs availability')

      gitLFS = await Git.LFS.check()

      if (!gitLFS) {
        this.warn('Git LFS is not installed, objects stored through LFS will not be backup.')
      }

      this.debug('git lfs available')
    } else {
      this.debug('backup will skip lfs objects')
    }

    this.debug('checking destination path', args.destination)

    try {
      await fs.promises.access(args.destination)

      this.debug('destination path exists')
    } catch (err) {
      try {
        this.debug('destination path does not exists, create it...')

        await fs.promises.mkdir(args.destination)

        this.debug('destination path created')
      } catch (err) {
        this.debug(err)
        this.error(`Cannot create ${args.destination}`)
      }
    }

    // Enable flags interactively
    if (flags.interactive) {
      const { filters } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'filters',
          message: 'Select search filters',
          choices: [
            new inquirer.Separator('### Repository type ###'),
            {
              name: 'public',
              checked: true
            },
            {
              name: 'private',
              checked: true
            },
            new inquirer.Separator('### Affiliation with repository ###'),
            {
              name: 'owner',
              checked: true
            },
            {
              name: 'collaborator',
              checked: true
            },
            {
              name: 'member',
              checked: true
            }
          ]
        }
      ])

      for (const filter of filters) {
        flags[filter] = true
      }
    }

    let repositories = []

    // If `from` equals authenticated user, use it as backup source (not as another user)
    if (args.from === auth.user) {
      !flags.quiet && this.log(`Fetching repositories of ${auth.user}...`)

      this.debug('backup authenticated user repositories')

      const affiliationFlags = ['owner', 'collaborator', 'member']
      const affiliation = []

      // Handle affiliation flags enabling
      affiliationFlags.forEach((flag) => {
        if (flags[flag]) affiliation.push(flag)
      })

      // If no affiliation flag explicitly enabled
      if (!affiliation.length) {
        // Enable all affiliation flags not explicitly disabled
        affiliationFlags.forEach((flag) => {
          if (flags[flag] !== false) affiliation.push(flag)
        })
      }

      const options = {
        affiliation,
        type: flags.public && !flags.private ? 'public' : flags.private && !flags.public ? 'private' : 'all'
      }

      this.debug('backup', options.type, 'repositories where user is', affiliation.join(','))

      repositories = await GithubAPI.get.repositories({
        token: auth.token,
        options
      })
    }
    // @TODO: handle other cases than auth user backup source
    // - user
    // - organization

    if (!repositories.length) {
      this.warn('No repositories to backup.')

      exitCode = 1
    } else {
      this.debug(`${repositories.length} repositories to backup`)

      if (flags.exclude) {
        this.debug('filter repos following exclude flag')

        const excluded = []

        repositories = repositories.filter((repo) => {
          return flags.exclude.reduce((acc, exclude) => {
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
      }

      if (flags.match) {
        this.debug('filter repos following match flag')

        const excluded = []

        repositories = repositories.filter((repo) => {
          return flags.match.reduce((acc, match) => {
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
      }

      if (flags.interactive) {
        // This replaces exclude flag in interactive mode
        const { repos: selectedRepos } = await inquirer.prompt([
          {
            type: 'checkbox',
            message: 'Select repositories to backup',
            name: 'repos',
            choices: repositories
              .sort((a, b) => {
                if (a.private && b.private) {
                  return 0
                } else if (!a.private && b.private) {
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
            validate: function(selectedRepos) {
              if (selectedRepos.length < 1) {
                return 'You must choose at least one repository.'
              }

              return true
            }
          }
        ])

        repositories = repositories.filter((repository) => {
          return selectedRepos.find((selectedRepo) => repository.fullName === selectedRepo)
        })

        const { cleanRefs } = await inquirer.prompt([
          {
            type: 'list',
            message: 'Do you want to clean pull request references from backup repositories?',
            name: 'cleanRefs',
            choices: ['Yes', 'No']
          }
        ])

        if (cleanRefs === 'Yes') {
          flags['clean-refs'] = true
        }

        if (gitLFS) {
          const { lfs } = await inquirer.prompt([
            {
              type: 'list',
              message: 'Do you want to include LFS objects (if relevant) in backup?',
              name: 'lfs',
              choices: ['Yes', 'No']
            }
          ])

          if (lfs === 'No') {
            flags.lfs = false
          }
        }
      }

      !flags.quiet && this.log(`Starting backup of ${repositories.length} repositories...`)

      for (const repository of repositories) {
        const data = {
          path: path.resolve(args.destination, repository.fullName + '.git'),
          url: repository.urls.https
        }

        try {
          await Git.clone(data, flags.quiet)

          if (flags.lfs && gitLFS) {
            try {
              await Git.LFS.fetch(data, flags.quiet)
            } catch (err) {
              this.warn(`Failed to fetch LFS objects from ${repository.fullName}`)
              this.debug(err)

              exitCode = 1
            }
          }

          if (flags['clean-refs']) {
            this.debug('clean /pull refs')

            try {
              await Git.cleanRefs(data)
            } catch (err) {
              this.warn(`Failed to clean /pull refs from ${repository.fullName}`)
              this.debug(err)

              exitCode = 1
            }
          }
        } catch (err) {
          if (err.exitCode === 128) {
            this.error(`Failed to backup ${repository.fullName}, destination path exists and is not empty`)
          }

          this.error(err.shortMessage)
          this.debug(err)
        }
      }
    }

    this.exit(exitCode)
  }
}

module.exports = BackupCommand
