'use strict';

function formatDuration(milliseconds) {
  let seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`]
    .filter(Boolean)
    .join(' ');
}

function toNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function stringifyThreadInfo(info) {
  const name = info?.name || info?.threadName || 'Direct message';
  const members = info?.participantCount || info?.participants?.length || info?.users?.length || 'unknown';
  const muted = info?.isMuted === true ? 'yes' : 'no';
  return `Thread: ${name}\nMembers: ${members}\nMuted by bot: ${muted}`;
}

module.exports = { formatDuration, toNumber, stringifyThreadInfo };
