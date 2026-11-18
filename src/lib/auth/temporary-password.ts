import { randomInt } from "node:crypto";

// Temporary passwords handed out by admins (PLAN 0a.4). Read aloud or typed from a message, so the alphabet
// leaves out look-alikes (0/O, 1/l/I) and the password comes in groups: 16 characters from 31, about 79 bits.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 4;
const GROUP_LENGTH = 4;

/** For example "k7mp-x3qa-9vtr-c2hw". Longer than MIN_PASSWORD_LENGTH, so it passes the password rules. */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

export const TEMPORARY_PASSWORD_PATTERN = /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/;
