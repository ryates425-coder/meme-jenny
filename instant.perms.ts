/**
 * InstantDB permission rules.
 * memes: view all, create/delete creator only, update voteCount allowed for upvoting.
 * votes: view all, create when logged in, delete own vote only.
 * $files: view all, create/delete when logged in.
 */
import type { InstantRules } from '@instantdb/react';

const rules = {
  memes: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'isCreator || (auth.id != null && onlyModifiesVoteCount)',
      delete: 'auth.id in data.ref("$user.id")',
    },
    bind: {
      isCreator: 'auth.id in data.ref("$user.id")',
      onlyModifiesVoteCount: "request.modifiedFields.all(field, field in ['voteCount'])",
    },
  },
  votes: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'false',
      delete: 'auth.id in data.ref("$user.id")',
    },
  },
  $files: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      delete: 'auth.id != null',
    },
  },
  $users: {
    allow: {
      view: 'true',
    },
  },
} satisfies InstantRules;

export default rules;
