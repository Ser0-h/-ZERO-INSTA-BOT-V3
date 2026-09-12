'use strict';

module.exports = {
  config: {
    name: 'welcome',
    author: 'Neoaz 🐊',
    role: 0,
    description: 'Welcome new group members and announce departures.'
  },

  async onStart({ config, event, message, store }) {
    if (!isGroupEvent(event)) return;

    const action = getAction(event);
    if (!action) return;
    const enabled = action === 'join'
      ? (store?.getWelcome ? store.getWelcome(event.threadID, config.welcomeMessages) : config.welcomeMessages)
      : (store?.getLeave ? store.getLeave(event.threadID, config.leaveMessages ?? config.welcomeMessages) : config.leaveMessages ?? config.welcomeMessages);
    if (!enabled) return;
    const people = getParticipants(event, action);
    if (!people.length) return;
    const names = people.map(formatParticipant).filter(Boolean);
    if (!names.length) return;

    if (action === 'join') {
      return message.send(`Welcome to the group, ${names.join(', ')}.`);
    }
    return message.send(`${names.join(', ')} left the group.`);
  }
};

function isGroupEvent(event) {
  return event.isGroup === true
    || event.is_group === true
    || String(event.threadID || '').includes(':')
    || Array.isArray(event.addedParticipants)
    || Array.isArray(event.removedParticipants)
    || Array.isArray(event.users)
    || Array.isArray(event.participants)
    || Boolean(getAction(event));
}

function getAction(event) {
  const value = [
    event.logMessageType,
    event.updateType,
    event.action,
    event.eventType,
    event.type
  ].filter(Boolean).join(' ').toLowerCase();
  if (/(leave|left|remove|removed|unsubscribe|unsubscribed|participant_remove|user_remove)/.test(value)) return 'leave';
  if (/(join|joined|add|added|subscribe|subscribed|participant_add|user_add)/.test(value)) return 'join';
  return null;
}

function getParticipants(event, action) {
  const values = action === 'join'
    ? [event.addedParticipants, event.added_users, event.added_user_ids, event.usersAdded, event.participantsAdded]
    : [event.removedParticipants, event.removed_users, event.removed_user_ids, event.left_users, event.usersRemoved, event.participantsRemoved];
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      if (Array.isArray(value.users) && value.users.length) return value.users;
      if (Array.isArray(value.participants) && value.participants.length) return value.participants;
      return [value];
    }
  }
  for (const value of [event.users, event.participants]) {
    if (Array.isArray(value)) return value;
  }
  const single = action === 'join'
    ? [event.addedParticipant, event.added_user, event.user]
    : [event.removedParticipant, event.removed_user, event.user];
  return single.filter(Boolean);
}

function formatParticipant(participant) {
  if (typeof participant === 'string' || typeof participant === 'number') return String(participant);
  return participant?.username
    || participant?.user?.username
    || participant?.fullName
    || participant?.full_name
    || participant?.user?.fullName
    || participant?.user?.full_name
    || participant?.name
    || participant?.userID
    || participant?.userId
    || participant?.user_id
    || participant?.pk
    || participant?.pk_id
    || participant?.id
    || participant?.user?.userID
    || participant?.user?.userId
    || participant?.user?.user_id
    || participant?.uid
    || participant?.user?.pk
    || participant?.user?.pk_id
    || participant?.user?.uid
    || participant?.user?.id
    || null;
}
