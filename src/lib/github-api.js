const axios = require('axios')
const _debug = require('debug')

const createDebugger = (reporter) => _debug(`github-api${reporter ? ':' + reporter : ''}`)
const base = 'https://api.github.com'

const GithubAPI = {
  get: {
    /**
     * Get details about a user. Defaults to user represented by token
     * @param {String} token Authentication token
     * @param {String?} user User name to get details
     * @throws {Error|String} Github API error message or axios error
     * @returns {Object} User details
     * @see https://developer.github.com/v3/users/#get-a-single-user
     * @see https://developer.github.com/v3/users/#get-the-authenticated-user
     */
    user: async function getUser(token, user) {
      if (!token) {
        throw new Error('No token provided @getUser')
      }

      const debug = createDebugger('get-user')
      let url

      if (!user) {
        debug('fetch authenticated user details')

        url = base + '/user'
      } else {
        debug('fetch user', user, 'details')

        url = base + '/users/' + user
      }

      try {
        const resultUser = await axios({
          method: 'get',
          url,
          headers: {
            Authorization: 'token ' + token
          }
        })

        return resultUser.data
      } catch (err) {
        if (err.response.status >= 400) {
          throw err.response.data.message
        }

        throw err
      }
    },
    /**
     * Get repositories of an account (user or organization). Defaults to user represented by token
     * @param {Object} data
     * @param {String} data.token Authentication token
     * @param {String} data.from Account to get list of repositories from
     * @param {Object<affiliation: Array[String]?, type: String?>?} data.options API options
     * @throws {Error} Missing token
     * @returns {Array} List of repositories
     * @see https://developer.github.com/v3/repos/#list-your-repositories
     * @see https://developer.github.com/v3/repos/#list-user-repositories
     * @see https://developer.github.com/v3/repos/#list-organization-repositories
     */
    repositories: async function getRepositories({ token, from, options }) {
      if (!token) {
        throw new Error('No token provided @getAuthenticatedUserRepositories')
      }

      const debug = createDebugger('get-repositories')

      debug({ token, from, options })

      if (!from) {
        debug('fetch authenticated user repositories')

        return recurseRepositories({ token, url: base + '/user/repos', params: options, debug })
      }

      return []
    }
  }
}

/**
 * Fetch repositories with recursive pagination support
 * @param {Object} data
 * @param {String} data.token Authentication token
 * @param {String} data.url Url to fetch
 * @param {Object?} data.params Query parameters
 * @param {Array} data.repositories List of fetched repositories
 * @param {Number} data.page Page number
 * @param {Function} debug Debugging function
 */
const recurseRepositories = async function({ token, url, params, repositories = [], page = 1, debug }) {
  debug('fetch', url)

  let repos = []
  let res = {}

  try {
    res = await axios({
      method: 'get',
      url,
      params,
      headers: {
        Authorization: `token ${token}`
      }
    })
  } catch (err) {
    debug('fetch failed')
    debug(err)
  }

  if (res.data && Array.isArray(res.data) && res.data.length) {
    debug(`got ${res.data.length} repos`)

    repos = res.data.reduce((acc, repo) => {
      if (repo.permissions && !repo.permissions.pull) {
        debug(`user do not have pull right on repository ${repo.name}, skipping it`)
      } else {
        acc.push({
          fullName: repo.full_name,
          name: repo.name,
          description: repo.description,
          private: repo.private,
          fork: repo.fork,
          urls: {
            https: repo.clone_url.replace(/github.com/, `${token}@github.com`)
          }
        })
      }

      return acc
    }, [])

    if (repos.length !== res.data.length) {
      debug(`user have pull right over ${repos.length}/${res.data.length} repos)`)
    }
  } else {
    debug('no repositories found')
  }

  if (res.headers && res.headers.link) {
    const nextLink = res.headers.link.split(',').find((link) => link.indexOf('rel="next"') !== -1)

    if (nextLink) {
      const [, nextUrl] = nextLink.match(/<(.*)?>; rel="next"/)
      const nextPageNumber = nextUrl.replace(/(.*&page=)(\d)(.*)/, '$2')

      // Do not send again query params (they are already in nextUrl)
      return recurseRepositories({
        token,
        url: nextUrl,
        repositories: repositories.concat(repos),
        page: nextPageNumber,
        debug
      })
    }
  }

  return repositories.concat(repos)
}

module.exports = GithubAPI
