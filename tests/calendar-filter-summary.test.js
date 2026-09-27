import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegionSelectedDeskSummary } from '../src/utils/calendarFilters.js';

const east = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];
const south = [{ id: 's1' }, { id: 's2' }];

test('region summary counts only selected desks in the current region', () => {
  const followed = ['e1', 'e2', 'e3', 's1'];
  const selected = ['e1', 's1'];
  assert.equal(getRegionSelectedDeskSummary(selected, east), '1 desk selected');
  assert.equal(getRegionSelectedDeskSummary(selected, south), '1 desk selected');
  assert.deepEqual(followed, ['e1', 'e2', 'e3', 's1']);
});

test('region summary handles zero, plural, switching, and preserves selections', () => {
  const selected = ['e1', 'e2', 's1'];
  assert.equal(getRegionSelectedDeskSummary([], east), 'No desks selected');
  assert.equal(getRegionSelectedDeskSummary(['e1', 'e2'], east), '2 desks selected');
  assert.equal(getRegionSelectedDeskSummary(selected, south), '1 desk selected');
  assert.deepEqual(selected, ['e1', 'e2', 's1']);
});
