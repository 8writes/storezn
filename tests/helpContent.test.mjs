import test from "node:test";
import assert from "node:assert/strict";
import { HELP_TOPICS, POPULAR_QUESTIONS, START_STEPS, findArticle, searchHelp } from "../lib/helpContent.js";

test("every 'Common question' points at a real article", () => {
  for (const [topicId, q] of POPULAR_QUESTIONS) assert.ok(findArticle(topicId, q), `${topicId}: ${q}`);
});

test("topic ids and questions are unique (they're used as keys)", () => {
  const ids = HELP_TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const topic of HELP_TOPICS) {
    const qs = topic.articles.map((a) => a.q);
    assert.equal(new Set(qs).size, qs.length, topic.id);
  }
});

test("links are internal dashboard paths and plans are known", () => {
  const links = [...START_STEPS, ...HELP_TOPICS.flatMap((t) => t.articles)].map((x) => x.link).filter(Boolean);
  for (const link of links) assert.match(link.href, /^\/(vendor\/|profile)/);
  for (const a of HELP_TOPICS.flatMap((t) => t.articles)) assert.ok(a.plan === undefined || ["plus", "enterprise"].includes(a.plan));
});

test("search matches every word, case-insensitively, across answers and steps", () => {
  assert.ok(searchHelp("DELIVERY fee").length > 0);
  assert.ok(searchHelp("generate variants").some(({ article }) => article.q.includes("variants")));
  assert.equal(searchHelp("zzzz nothing").length, 0);
  assert.equal(searchHelp("   ").length, 0);
});
