export const getRegionSelectedDeskSummary = (selectedDeskIds, regionDesks) => {
  const regionDeskIds = new Set((regionDesks || []).map((desk) => desk.id));
  const count = (selectedDeskIds || []).filter((deskId) => regionDeskIds.has(deskId)).length;
  if (count === 0) return 'No desks selected';
  return `${count} desk${count === 1 ? '' : 's'} selected`;
};
