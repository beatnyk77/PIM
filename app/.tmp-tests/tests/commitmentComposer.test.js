"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const commitmentComposer_1 = require("../services/commitments/commitmentComposer");
function run() {
    const normalized = (0, commitmentComposer_1.normalizeCommitmentInput)('   Draft   the   proposal   ', '  Friday 3 pm  ', 'manual');
    strict_1.default.ok(normalized);
    strict_1.default.equal(normalized?.title, 'Draft the proposal');
    strict_1.default.equal(normalized?.deadline, 'Friday 3 pm');
    strict_1.default.equal(normalized?.source, 'manual');
    strict_1.default.equal((0, commitmentComposer_1.commitmentKey)('Draft the proposal', 'Friday 3 pm'), 'draft the proposal::friday 3 pm');
    const firstInsert = (0, commitmentComposer_1.appendCommitment)([], {
        title: 'Book the room',
        deadline: 'Tomorrow',
        source: 'chat',
        sourceText: 'Please book the room tomorrow morning.',
        sourceChatId: 'thread-1',
    }, 1710000000000);
    strict_1.default.equal(firstInsert.added, true);
    strict_1.default.equal(firstInsert.duplicate, false);
    strict_1.default.equal(firstInsert.commitments.length, 1);
    strict_1.default.equal(firstInsert.commitments[0].title, 'Book the room');
    strict_1.default.equal(firstInsert.commitments[0].source, 'chat');
    strict_1.default.equal(firstInsert.commitments[0].sourceText, 'Please book the room tomorrow morning.');
    const duplicateInsert = (0, commitmentComposer_1.appendCommitment)(firstInsert.commitments, {
        title: '  book the room  ',
        deadline: ' tomorrow ',
        source: 'manual',
    }, 1710000001000);
    strict_1.default.equal(duplicateInsert.added, false);
    strict_1.default.equal(duplicateInsert.duplicate, true);
    strict_1.default.equal(duplicateInsert.commitments.length, 1);
    strict_1.default.equal((0, commitmentComposer_1.summarizeSourceText)('  Follow up on the invoice and let me know once the transfer clears.  ', 40), 'Follow up on the invoice and let me...');
    console.log('commitmentComposer tests passed');
}
run();
