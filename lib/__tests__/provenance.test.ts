import { test } from "node:test";
import assert from "node:assert/strict";
import { isEchoedExample, valueCameFromUser } from "../provenance";

// agent.md rule 16. Two reproduced bugs, both of them well-formed values
// that no format check could catch: an LLC run recorded
// email "jane.doe@example.com" for a question that was never asked, and a
// Corp run wrote "for example, 08/06/2026" in its own question and then
// recorded that example as amendmentDate.

test("a date the user actually gave is accepted, however they spelled it", () => {
  assert.equal(valueCameFromUser("amendmentDate", "07/01/2026", "we adopted it on 07/01/2026"), true);
  assert.equal(valueCameFromUser("amendmentDate", "07/01/2026", "adopted July 1, 2026"), true);
  assert.equal(valueCameFromUser("amendmentDate", "07/01/2026", "adopted on 1 July 2026"), true);
  assert.equal(valueCameFromUser("dateOfOriginalFiling", "03/14/2019", "filed 2019-03-14"), true);
  assert.equal(valueCameFromUser("dateOfOriginalFiling", "03/14/2019", "it was Mar 14 2019"), true);
});

test("a date the user never gave is rejected, including the model's own example", () => {
  // The exact reproduced failure: the example date came from the assistant's
  // question, and userText holds only what the user typed.
  assert.equal(valueCameFromUser("amendmentDate", "08/06/2026", "I don't remember the date"), false);
  assert.equal(valueCameFromUser("amendmentDate", "08/06/2026", ""), false);
  // A different date in the same message is not a licence to record this one.
  assert.equal(valueCameFromUser("amendmentDate", "08/06/2026", "we filed on 03/14/2019"), false);
});

test("an email is matched case-insensitively, and an invented one is rejected", () => {
  assert.equal(valueCameFromUser("email", "jane@acme.com", "my email is Jane@Acme.com"), true);
  assert.equal(
    valueCameFromUser("email", "jane@acme.com", "reach me at jane@acme.com, thanks"),
    true
  );
  assert.equal(valueCameFromUser("email", "jane.doe@example.com", "Jane Doe, Manager"), false);
});

test("a phone matches on digits, so formatting differences don't matter", () => {
  assert.equal(valueCameFromUser("phone", "307-555-0142", "(307) 555 0142"), true);
  assert.equal(valueCameFromUser("phone", "(307) 555-0142", "3075550142 is fine"), true);
  assert.equal(valueCameFromUser("phone", "307-555-0142", "I'd rather not say"), false);
});

// Deliberately narrow: names and titles keep rule 15's checks instead, since
// "I'm Jane" -> "Jane" is a legitimate reading and a literal-match rule would
// cost the user a turn for nothing.
test("fields outside the three checked kinds are always allowed through", () => {
  assert.equal(valueCameFromUser("signerName", "Jane Doe", "I'm Jane"), true);
  assert.equal(valueCameFromUser("currentName", "Acme Ventures LLC", "acme ventures"), true);
  assert.equal(valueCameFromUser("signatureDate", "08/06/2026", ""), true);
  assert.equal(valueCameFromUser("approval", "board", "the board did it"), true);
});

// Found immediately after examples were added to the questions: asked for
// the signer's title with "(for example, President, Manager, Managing
// Member)", the user typed a name instead, and "President" was recorded — a
// title nobody had said. Names and titles are outside valueCameFromUser's
// mechanical checks on purpose, so this is the narrow guard for them.
test("an example echoed back as the answer is rejected", () => {
  const example = "President, Manager, Managing Member";
  assert.equal(isEchoedExample(example, "President", "Jane Doe"), true);
  assert.equal(isEchoedExample(example, "Managing Member", "Jane Doe"), true);
  assert.equal(isEchoedExample("Jane Doe", "Jane Doe", "her name is Mary Smith"), true);
});

test("the same value is accepted when the user actually said it", () => {
  assert.equal(isEchoedExample("President, Manager, Managing Member", "President", "I'm the President"), false);
  assert.equal(isEchoedExample("Jane Doe", "Jane Doe", "Jane Doe"), false);
  // Not one of our examples at all.
  assert.equal(isEchoedExample("President, Manager", "Treasurer", "Treasurer"), false);
  assert.equal(isEchoedExample(undefined, "President", ""), false);
});
