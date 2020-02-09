@g-script/gbulk
===============

Tool to work in bulk with GitHub repositories

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@g-script/gbulk.svg)](https://npmjs.org/package/@g-script/gbulk)
[![Downloads/week](https://img.shields.io/npm/dw/@g-script/gbulk.svg)](https://npmjs.org/package/@g-script/gbulk)
[![License](https://img.shields.io/npm/l/@g-script/gbulk.svg)](https://github.com/g-script/gbulk/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @g-script/gbulk
$ gbulk COMMAND
running command...
$ gbulk (-v|--version|version)
@g-script/gbulk/1.0.1 linux-x64 node-v12.14.1
$ gbulk --help [COMMAND]
USAGE
  $ gbulk COMMAND
...
```
<!-- usagestop -->
# Commands
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
  DESTINATION  [default: /home/nicolas/dev/gbulk/gbulk-backup-1581272053753] backup destination path

OPTIONS
  -c, --clean-refs       clean GitHub specific pull refs (refs/pull) from backup repositories
  -h, --help             show CLI help
  -i, --interactive      interactive mode

  -m, --match=match      include only repositories whose name is matching specified string or regex pattern (omitting
                         start and end delimiters)

  -q, --quiet            disable logging

  -x, --exclude=exclude  exclude repositories whose name is matching specified string or regex pattern (omitting start
                         and end delimiters)

  --[no-]collaborator    backup repositories of which user is collaborator

  --[no-]lfs             include LFS objects in backup

  --[no-]member          backup repositories of which user is member

  --[no-]owner           backup owned repositories

  --private              backup private repositories

  --public               backup public repositories

DESCRIPTION
  With gbulk, you can backup from different sources:
  - to backup repositories you own, run gbulk backup without arguments (if you want to specify a backup path, use gbulk 
  backup $YOUR_USERNAME $BACKUP_PATH)
  - to backup repositories of a user, run gbulk backup $USERNAME (it will only backup user public repositories)
  - to backup repositories of an organization, run gbulk backup $ORGNAME (if you have pull rights, all repositories will 
  be backup, if not, only public repositories will)

  Git LFS objects will be backup if git-lfs is available in path.

  Scopes needed are : public_repo or repo.
```

_See code: [src/commands/backup.js](https://github.com/g-script/gbulk/blob/v1.0.1/src/commands/backup.js)_

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

_See code: [src/commands/login.js](https://github.com/g-script/gbulk/blob/v1.0.1/src/commands/login.js)_

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

_See code: [src/commands/logout.js](https://github.com/g-script/gbulk/blob/v1.0.1/src/commands/logout.js)_
<!-- commandsstop -->
