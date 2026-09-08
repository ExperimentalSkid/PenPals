import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260902132000_fix_introduction_word_count.sql", import.meta.url),
  "utf8",
);
const punctuationFix = await readFile(
  new URL("../supabase/migrations/20260902201900_fix_introduction_punctuation_validation.sql", import.meta.url),
  "utf8",
);

const countWords = (value) => value.trim().split(/\s+/u).filter(Boolean).length;
const meetsValidation = (value) => value.trim().length >= 50 && value.trim().length <= 500 && countWords(value) >= 8;

test("submit_introduction uses POSIX whitespace for server-side word counting", () => {
  assert.match(migration, /regexp_split_to_table\(body, '\[\[:space:\]\]\+'\)/);
  assert.doesNotMatch(migration, /regexp_split_to_table\(body, '\\s\+'/);
});

test("normal multi-word introductions count all words", () => {
  const introduction = "This is a perfectly normal introduction with more than eight words total.";
  assert.ok(countWords(introduction) >= 8);
  assert.ok(meetsValidation(introduction));
});

test("multiple spaces are treated as whitespace separators", () => {
  const introduction = "This   introduction   has   enough   words   to   pass   validation   today.";
  assert.equal(countWords(introduction), 9);
  assert.ok(meetsValidation(introduction));
});

test("tabs, newlines, and surrounding whitespace are handled", () => {
  const introduction = "  This introduction\nhas\tenough words for a valid friendly note today.  ";
  assert.equal(countWords(introduction), 11);
  assert.ok(meetsValidation(introduction));
});

test("seven words are rejected", () => {
  const introduction = "This introduction has exactly seven meaningful words.";
  assert.equal(countWords(introduction), 7);
  assert.equal(meetsValidation(introduction), false);
});

test("eight words are accepted when character length is valid", () => {
  const introduction = "This introduction has seven meaningful words today here";
  assert.equal(countWords(introduction), 8);
  assert.ok(meetsValidation(introduction));
});

test("punctuation attached to words does not create fake whitespace words", () => {
  const introduction = "Hello, there! I enjoy learning languages, sharing stories, and meeting curious people.";
  assert.equal(countWords(introduction), 12);
  assert.ok(meetsValidation(introduction));
});

test("server validation accepts terminal punctuation without counting punctuation padding", () => {
  assert.match(punctuationFix, /words ~ '\[\[:alnum:\]\]'/);
  assert.doesNotMatch(punctuationFix, /body !~ '\^\[\[:alnum:\]\].*\$'/);
});
