const execa = require('execa')
const os = require('os')

const Git = {
  /**
   * Try to run `git --version`,
   * if it fails it means git is not available
   * @returns {void}
   * @throws {Error}
   */
  check: async function checkGit() {
    try {
      await execa('git', ['--version'])
    } catch (err) {
      throw new Error('git not found. Make sure git is installed and run gbulk again')
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
  clone: async function cloneRepository({ path, url }, pipe = false) {
    await execa('git', ['clone', '--mirror', url, path], pipe && { stdio: 'inherit' })
  },
  /**
   * Delete /pull references from a local repository
   * @param {Object} data
   * @param {String} data.path Repository path
   * @returns {void}
   * @throws {Error} `execa` error
   */
  cleanRefs: async function cleanGithubRefs({ path }) {
    let refs = ''

    try {
      // Search for pull requests
      const { stdout } = await execa('git', ['show-ref'], { cwd: path })

      refs = stdout
    } catch (err) {
      if (err.exitCode === 1) {
        return false
      }
    }

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

    return true
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
    fetch: async function fetchLFS({ path }, pipe = false) {
      await execa('git', ['lfs', 'fetch', '--all'], { cwd: path, stdio: pipe ? 'inherit' : 'pipe' })
    }
  }
}

module.exports = Git
