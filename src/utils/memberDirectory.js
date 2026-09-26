export const getRegistrarMemberCounts = (users = []) => ({
  active: users.filter(user => user.status === 'Approved' || user.status === 'Pending').length,
  rejected: users.filter(user => user.status === 'Rejected').length,
  archived: users.filter(user => user.status === 'Archived').length,
  all: users.length
});
export const matchesRegistrarMemberFilter = (user, filter) => filter === 'ALL' || (filter === 'ARCHIVED' && user.status === 'Archived') || (filter === 'REJECTED' && user.status === 'Rejected') || (filter === 'ACTIVE' && (user.status === 'Approved' || user.status === 'Pending'));
