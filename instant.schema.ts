/**
 * InstantDB schema for the meme app.
 * Defines entities: memes (with textBoxes JSON), votes, $files (storage), $users.
 * Run `npx instant-cli push` after schema changes.
 */
import { i } from '@instantdb/react';

/** Single text overlay: text + normalized position (0-1) */
type TextBox = { text: string; pos: { x: number; y: number } };

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
    }),
    memes: i.entity({
      textBoxes: i.json(), // Array<TextBox> - full text overlay config
      createdAt: i.date().indexed(),
      voteCount: i.number().indexed(),
    }),
    votes: i.entity({
      createdAt: i.date(),
    }),
  },
  links: {
    memeImage: {
      forward: { on: 'memes', has: 'one', label: '$file', onDelete: 'cascade' },
      reverse: { on: '$files', has: 'many', label: 'memes' },
    },
    memeCreator: {
      forward: { on: 'memes', has: 'one', label: '$user', onDelete: 'cascade' },
      reverse: { on: '$users', has: 'many', label: 'memes' },
    },
    memeVotes: {
      forward: { on: 'memes', has: 'many', label: 'votes' },
      reverse: { on: 'votes', has: 'one', label: 'meme', onDelete: 'cascade' },
    },
    voteUser: {
      forward: { on: 'votes', has: 'one', label: '$user', onDelete: 'cascade' },
      reverse: { on: '$users', has: 'many', label: 'votes' },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export type { TextBox };
export default schema;
