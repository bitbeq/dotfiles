#
# Zsh configuration
#

# ---------------------------------------------------------------------------
# Directories
# ---------------------------------------------------------------------------

ZSH_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
ZSH_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/zsh"

mkdir -p "$ZSH_CACHE_DIR" "$ZSH_STATE_DIR"


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# General shell behavior
# ---------------------------------------------------------------------------

# Allow comments when typing commands interactively.
setopt INTERACTIVE_COMMENTS

# Don't beep at me.
setopt NO_BEEP


# ---------------------------------------------------------------------------
# Keybindings
# ---------------------------------------------------------------------------

# Emacs-style bindings.
bindkey -e

# Search history based on what has already been typed.
autoload -Uz up-line-or-beginning-search
autoload -Uz down-line-or-beginning-search

zle -N up-line-or-beginning-search
zle -N down-line-or-beginning-search

bindkey '^[[A' up-line-or-beginning-search
bindkey '^[[B' down-line-or-beginning-search


# ---------------------------------------------------------------------------
# Completion
# ---------------------------------------------------------------------------

autoload -Uz compinit

compinit -d "$ZSH_CACHE_DIR/zcompdump-$ZSH_VERSION"

# Select completions using a menu.
zstyle ':completion:*' menu select

# Case-insensitive completion.
zstyle ':completion:*' matcher-list \
  'm:{a-zA-Z}={A-Za-z}' \
  'r:|=*' \
  'l:|=* r:|=*'

# Group completion categories.
zstyle ':completion:*' group-name ''

# More useful completion descriptions.
zstyle ':completion:*:descriptions' format '[%d]'


# ---------------------------------------------------------------------------
# Aliases
# ---------------------------------------------------------------------------

[[ -f "$ZDOTDIR/aliases.zsh" ]] && source "$ZDOTDIR/aliases.zsh"


# ---------------------------------------------------------------------------
# fzf
# ---------------------------------------------------------------------------

if (( $+commands[fzf] )); then
  source <(fzf --zsh)
fi


# ---------------------------------------------------------------------------
# zoxide
# ---------------------------------------------------------------------------

if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi


# ---------------------------------------------------------------------------
# Starship
# ---------------------------------------------------------------------------

if (( $+commands[starship] )); then
  eval "$(starship init zsh)"
fi


# ---------------------------------------------------------------------------
# Antidote plugins
# ---------------------------------------------------------------------------

ANTIDOTE_HOME="$HOME/.local/share/antidote"

if [[ -r "$ANTIDOTE_HOME/antidote.zsh" ]]; then
  source "$ANTIDOTE_HOME/antidote.zsh"

  antidote load "$ZDOTDIR/.zsh_plugins.txt"
fi
