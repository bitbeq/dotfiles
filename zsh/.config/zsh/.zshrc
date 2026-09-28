#
# Zsh configuration
#

# =============================================================================
# Directories
# =============================================================================

ZSH_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
ZSH_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/zsh"

mkdir -p "$ZSH_CACHE_DIR" "$ZSH_STATE_DIR"


# =============================================================================
# History
# =============================================================================

HISTFILE="$ZSH_STATE_DIR/history"

HISTSIZE=100000
SAVEHIST=100000

setopt EXTENDED_HISTORY
setopt APPEND_HISTORY
setopt SHARE_HISTORY

setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt HIST_VERIFY


# =============================================================================
# General Shell Behavior
# =============================================================================

# Allow comments in interactive commands.
setopt INTERACTIVE_COMMENTS

# Disable terminal bell.
setopt NO_BEEP


# =============================================================================
# Keybindings
# =============================================================================

# Emacs-style keybindings.
bindkey -e

# Search history based on text already entered on the command line.
autoload -Uz up-line-or-beginning-search
autoload -Uz down-line-or-beginning-search

zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search

bindkey '^[[A' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search


# =============================================================================
# Completion
# =============================================================================

autoload -Uz compinit

compinit -d "$ZSH_CACHE_DIR/zcompdump-$ZSH_VERSION"

# Select completions interactively.
zstyle ':completion:*' menu select

# Case-insensitive completion.
zstyle ':completion:*' matcher-list \
  'm:{a-zA-Z}={A-Za-z}' \
  'r:|=*' \
  'l:|=* r:|=*'

# Group completion categories.
zstyle ':completion:*' group-name ''

# Show useful descriptions for completion groups.
zstyle ':completion:*:descriptions' format '[%d]'


# =============================================================================
# Aliases
# =============================================================================

[[ -f "$ZDOTDIR/aliases.zsh" ]] && source "$ZDOTDIR/aliases.zsh"


# =============================================================================
# fzf
# =============================================================================

if (( $+commands[fzf] )); then
  source <(fzf --zsh)
fi


# =============================================================================
# zoxide
# =============================================================================

if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi


# =============================================================================
# Prompt Configuration
# =============================================================================

# Zsh normally reserves a trailing character for RPROMPT.
#
# Starship's $fill module uses the full terminal width, so remove that
# reserved indentation to keep the hostname aligned correctly.
ZLE_RPROMPT_INDENT=0


# =============================================================================
# Starship
# =============================================================================

if (( $+commands[starship] )); then
  eval "$(starship init zsh)"
fi


# =============================================================================
# Transient Prompt
# =============================================================================
#
# Active prompt:
#
# ~/Development/snowkoi  main  +2 ~1 ?3 ····················· obsidian
# ❯ bun dev
#
# After pressing Enter:
#
# ❯ bun dev                                                    02:27:41
#
# This removes the project/hostname information from terminal scrollback while
# retaining the command itself and the time it was executed.
#

# Previous successful commands use a green arrow.
# Previous failed commands use a red arrow.
TRANSIENT_PROMPT_TRANSIENT_PROMPT='%(?.%F{green}.%F{red})❯%f '

# Timestamp previous commands on the far-right side.
TRANSIENT_PROMPT_TRANSIENT_RPROMPT='%F{8}%D{%H:%M:%S}%f'

# =============================================================================
# Antidote
# =============================================================================

ANTIDOTE_SCRIPT="$(paru -Ql zsh-antidote 2>/dev/null \
  | awk '/\/antidote\.zsh$/ { print $2; exit }')"

if [[ -n "$ANTIDOTE_SCRIPT" && -r "$ANTIDOTE_SCRIPT" ]]; then
  source "$ANTIDOTE_SCRIPT"

  antidote load "$ZDOTDIR/.zsh_plugins.txt"
else
  print -u2 "Antidote not found. Is zsh-antidote installed?"
fi

unset ANTIDOTE_SCRIPT

# =============================================================================
# Mise
# =============================================================================

eval "$(~/.local/bin/mise activate zsh)"
