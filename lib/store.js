// A small JSON file database. Everything the bot remembers lives in one file, written atomically.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.resolve(root, process.env.YAPHOOK_DATA_FILE || 'data/yaphook.json');

const empty = () => ({ version: 1, servers: {}, buttons: {} });

function read() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...empty(), ...d };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`[yaphook] couldn't read ${FILE}, starting empty:`, e.message);
    return empty();
  }
}

const data = read();
let timer = null;

/** Settings for one server, created on first use. */
export function server(id) {
  const s = (data.servers[id] ||= {});
  s.welcomer ||= {};
  s.triggers ||= {};
  s.reactionRoles ||= {};
  return s;
}

/** Every custom button the bot has put on a message, by its id. */
export const buttons = () => data.buttons;

/** Write soon (changes made in the same tick are saved together). */
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error(`[yaphook] couldn't save ${FILE}:`, e.message);
  }
}

export const dataFile = FILE;
