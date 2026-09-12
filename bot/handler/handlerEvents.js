'use strict';

const HOOKS = ['onStart', 'onChat', 'onFirstChat', 'onReply', 'onReaction', 'onEvent', 'onAnyEvent'];

function createHandlerEvents(commands, eventCommands) {
  const registry = { eventCommands: [...eventCommands.keys()] };
  for (const hook of HOOKS) registry[hook] = [];

  for (const [name, command] of commands) {
    for (const hook of HOOKS) {
      if (typeof command[hook] === 'function') registry[hook].push(name);
    }
  }
  return registry;
}

module.exports = { HOOKS, createHandlerEvents };
