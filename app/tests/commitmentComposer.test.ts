import assert from 'node:assert/strict';
import {
  appendCommitment,
  commitmentKey,
  normalizeCommitmentInput,
  summarizeSourceText,
} from '../services/commitments/commitmentComposer';

function run() {
  const normalized = normalizeCommitmentInput(
    '   Draft   the   proposal   ',
    '  Friday 3 pm  ',
    'manual',
  );

  assert.ok(normalized);
  assert.equal(normalized?.title, 'Draft the proposal');
  assert.equal(normalized?.deadline, 'Friday 3 pm');
  assert.equal(normalized?.source, 'manual');

  assert.equal(commitmentKey('Draft the proposal', 'Friday 3 pm'), 'draft the proposal::friday 3 pm');

  const firstInsert = appendCommitment([], {
    title: 'Book the room',
    deadline: 'Tomorrow',
    source: 'chat',
    sourceText: 'Please book the room tomorrow morning.',
    sourceChatId: 'thread-1',
  }, 1710000000000);

  assert.equal(firstInsert.added, true);
  assert.equal(firstInsert.duplicate, false);
  assert.equal(firstInsert.commitments.length, 1);
  assert.equal(firstInsert.commitments[0].title, 'Book the room');
  assert.equal(firstInsert.commitments[0].source, 'chat');
  assert.equal(firstInsert.commitments[0].sourceText, 'Please book the room tomorrow morning.');

  const duplicateInsert = appendCommitment(firstInsert.commitments, {
    title: '  book the room  ',
    deadline: ' tomorrow ',
    source: 'manual',
  }, 1710000001000);

  assert.equal(duplicateInsert.added, false);
  assert.equal(duplicateInsert.duplicate, true);
  assert.equal(duplicateInsert.commitments.length, 1);

  assert.equal(summarizeSourceText('  Follow up on the invoice and let me know once the transfer clears.  ', 40), 'Follow up on the invoice and let me...');

  console.log('commitmentComposer tests passed');
}

run();
