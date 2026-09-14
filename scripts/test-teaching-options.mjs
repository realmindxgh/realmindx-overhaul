import assert from 'node:assert/strict';
import {
  TEACHING_SUBJECTS,
  teachingSubjectParts,
  teachingSubjectsCompatible,
} from '../src/lib/teachingOptions.js';

for (const subject of [
  'Core Mathematics', 'Elective Mathematics',
  'Core Physics', 'Elective Physics',
  'Core Chemistry', 'Elective Chemistry',
  'Core Biology', 'Elective Biology',
]) {
  assert.ok(TEACHING_SUBJECTS.includes(subject), `${subject} is missing from the shared catalogue`);
}

assert.deepEqual(teachingSubjectParts('Core Mathematics'), { track: 'core', subject: 'mathematics' });
assert.equal(teachingSubjectsCompatible('Core Mathematics', 'Core Mathematics'), true);
assert.equal(teachingSubjectsCompatible('Core Mathematics', 'Elective Mathematics'), false);
assert.equal(teachingSubjectsCompatible('Mathematics', 'Core Mathematics'), true);
assert.equal(teachingSubjectsCompatible('Elective Physics', 'Physics'), true);
assert.equal(teachingSubjectsCompatible('Core Physics', 'Elective Physics'), false);

console.log('Teaching subject taxonomy tests passed.');
