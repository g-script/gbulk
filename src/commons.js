const chalk = require('chalk')
const inquirer = require('inquirer')

const config = require('./config')

/**
 * Checks authentication from config and save it to `this.auth`.
 * @throws {CLIError} if authentication is invalid
 */
const checkAuth = function checkAuth () {
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
 * INTERACTIVE MODE
 * Prompts for search filters. This replaces use of flags while taking account
 * of user defined flags. This means gbulk -i --public --owner will prompt a
 * list having only public and owner options already selected. By default,
 * without any search filter flags defined, all options are pre-checked.
 * Selection is appended to `this.flags`.
 */
const promptSearchFilters = async function promptSearchFilters () {
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
const selectRepositories = async function selectRepositories (repositories) {
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
 * Builds Github fetch repositories options (filters) based on account type.
 * @param {String} type Account type
 * @returns {Object} Builded options
 * @throws {CLIError} if account type is unknown
 */
const buildFetchOptions = function buildFetchOptions (type) {
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
 *
 * @todo should be common with backup
 */
const handleExclusions = function handleExclusions (repositories) {
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
const handleInclusions = function handleInclusions (repositories) {
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

module.exports = {
  checkAuth,
  promptSearchFilters,
  selectRepositories,
  buildFetchOptions,
  handleExclusions,
  handleInclusions
}
