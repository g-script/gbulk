@g-script/gbulk
===============

`gbulk` is a CLI built to work with [Github](https://www.github.com) repositories in bulk.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@g-script/gbulk.svg)](https://npmjs.org/package/@g-script/gbulk)
[![Downloads/week](https://img.shields.io/npm/dw/@g-script/gbulk.svg)](https://npmjs.org/package/@g-script/gbulk)
[![License](https://img.shields.io/npm/l/@g-script/gbulk.svg)](https://github.com/g-script/gbulk/blob/master/package.json)

<!-- toc -->
* [✨ Features](#-features)
* [🏗 Usage](#-usage)
* [🔨 Commands](#-commands)
<!-- tocstop -->

# ✨ Features

* **Authentication** through Github OAuth personal access token
* **Backup** of authenticated user’s repositories, with support of filters on repository privacy (public and/or private) and affiliation (owner and/or collaborator and/or member)
* **Interactive** mode for the lazy

**Coming soon:**

* Backup of any user/organization repositories user has access to
* Transfering
* Archiving

# 🏗 Usage

First, install `gbulk` globally with `npm`:

```sh-session
$ npm install -g @g-script/gbulk
```

After installation, the only thing you need to do is [generate a new personal access token](https://github.com/settings/tokens/new) with following permissions :
* repo / **public_repo** - minimum requirement to backup a user/organization public repositories
* **repo** - required to backup private repositories

<!-- usage -->
```sh-session
$ npm install -g @g-script/gbulk
$ gbulk COMMAND
running command...
$ gbulk (-v|--version|version)
@g-script/gbulk/1.0.2 linux-x64 node-v12.14.1
$ gbulk --help [COMMAND]
USAGE
  $ gbulk COMMAND
...
```
<!-- usagestop -->

# 🔨 Commands

<!-- commands -->
* [`gbulk backup [FROM] [DESTINATION]`](#gbulk-backup-from-destination)
* [`gbulk help [COMMAND]`](#gbulk-help-command)
* [`gbulk login`](#gbulk-login)
* [`gbulk logout`](#gbulk-logout)

## `gbulk backup [FROM] [DESTINATION]`

backup repositories

```
USAGE
  $ gbulk backup [FROM] [DESTINATION]

ARGUMENTS
  FROM         user name or organization name to backup from
  DESTINATION  backup destination path

OPTIONS
  -c, --clean-refs       clean GitHub specific pull refs (refs/pull) from backup repositories
  -h, --help             show CLI help
  -i, --interactive      interactive mode

  -m, --match=match      include only repositories whose name is matching specified string or regex pattern (omitting
                         start and end delimiters)

  -q, --quiet            disable logging

  -x, --exclude=exclude  exclude repositories whose name is matching specified string or regex pattern (omitting start
                         and end delimiters)

  --[no-]collaborator    include/exclude repositories where user is collaborator

  --[no-]lfs             include LFS objects in backup

  --[no-]member          include/exclude repositories where user is member

  --[no-]owner           include/exclude owned repositories

  --private              include/exclude private repositories

  --public               include/exclude public repositories

DESCRIPTION
  With gbulk, you can backup from different sources:
  - to backup repositories you own, run gbulk backup without arguments (if you want to specify a backup path, use gbulk 
  backup $YOUR_USERNAME $BACKUP_PATH)
  - to backup repositories of another user, run gbulk backup $USERNAME
  - to backup repositories of an organization, run gbulk backup $ORGNAME

  Git LFS objects will be backup if git-lfs is available in path.
```

_See code: [src/commands/backup.js](https://github.com/g-script/gbulk/blob/v1.0.2/src/commands/backup.js)_

## `gbulk help [COMMAND]`

display help for gbulk

```
USAGE
  $ gbulk help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.2.3/src/commands/help.ts)_

## `gbulk login`

login to Github

```
USAGE
  $ gbulk login

OPTIONS
  -h, --help     show CLI help
  -v, --verbose  verbose mode

DESCRIPTION
  To authenticate to Github with gbulk, go grab a personal access token at https://github.com/settings/tokens
  Each command needs access to different scopes, see individual command help section to know which scopes are needed.
```

_See code: [src/commands/login.js](https://github.com/g-script/gbulk/blob/v1.0.2/src/commands/login.js)_

## `gbulk logout`

logout from Github

```
USAGE
  $ gbulk logout

OPTIONS
  -h, --help  show CLI help

DESCRIPTION
  Erase authentication details from configuration file
```

_See code: [src/commands/logout.js](https://github.com/g-script/gbulk/blob/v1.0.2/src/commands/logout.js)_
<!-- commandsstop -->
