const { CLIError } = require('@oclif/errors')
const execa = require('execa')
const os = require('os')

const Git = {
  /**
   * Try to run `git --version`,
   * if it fails it means git is not available
   * @returns {void}
   * @throws {CLIError}
   */
  check: async function checkGit() {
    try {
      await execa('git', ['--version'])
    } catch (err) {
      throw new CLIError('git not found. Make sure git is installed and run gbulk again')
    }
  },
  /**
   * Run git clone --mirror
   * @param {Object} data
   * @param {String} data.path Clone path
   * @param {String} data.url Remote URL
   * @param {Boolean} quiet
   * @returns {void}
   * @throws {Error} `execa` error
   */
  clone: async function cloneRepository({ path, url }, quiet = false) {
    await execa('git', ['clone', '--mirror', url, path], !quiet && { stdio: 'inherit' })
  },
  /**
   * Delete /pull references from a local repository
   * @param {Object} data
   * @param {String} data.path Repository path
   * @returns {void}
   * @throws {Error} `execa` error
   */
  cleanRefs: async function cleanGithubRefs({ path }) {
    // Search for pull requests
    const { stdout: refs } = await execa('git', ['show-ref'], { cwd: path })
    const refsToDel = refs.split(os.EOL).reduce((acc, ref) => {
      const [, _ref] = ref.split(' ')

      if (_ref && _ref.indexOf('/pull/') !== -1) {
        acc.push(_ref)
      }

      return acc
    }, [])

    // Delete found refs
    if (refsToDel.length) {
      for (const ref of refsToDel) {
        await execa('git', ['update-ref', '-d', ref], { cwd: path })
      }
    }
  },
  LFS: {
    /**
     * Try to run `git lfs version`
     * if it fails it means git lfs is not available
     */
    check: async function checkGitLFS() {
      try {
        await execa('git', ['lfs', 'version'])

        return true
      } catch (err) {
        return false
      }
    },
    /**
     * Fetch remote LFS objects for a local repository
     * @param {Object} data
     * @param {String} data.path Repository path
     * @param {Boolean} quiet
     * @returns {void}
     * @throws {Error} `execa` error
     */
    fetch: async function fetchLFS({ path }, quiet = false) {
      await execa('git', ['lfs', 'fetch', '--all'], { cwd: path, stdio: quiet ? 'pipe' : 'inherit' })
    }
  }
}

module.exports = Git
