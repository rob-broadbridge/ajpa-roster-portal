const humanise = (value) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
const transition = (from, to) => from && to ? `${from} → ${to}` : (to || from || '');
export const formatActivityAction = (activity = {}) => {
  const statusTransition = transition(activity.previousStatus, activity.newStatus);
  switch (activity.eventType) {
    case 'DUTY_REGISTERED': return 'Registered for shift';
    case 'DUTY_WITHDRAWN': return 'Withdrew from shift';
    case 'RULE_CREATED': return `${activity.ruleAction === 'WITHDRAW' ? 'Withdrawal' : 'Registration'} rule created`;
    case 'RULE_DELETED': return `${activity.ruleAction === 'WITHDRAW' ? 'Withdrawal' : 'Registration'} rule removed`;
    case 'MEMBER_APPROVE': return `Member approved${statusTransition ? `: ${statusTransition}` : ''}`;
    case 'MEMBER_REJECT': return `Member rejected${statusTransition ? `: ${statusTransition}` : ''}`;
    case 'MEMBER_RECONSIDER': return `Member reconsidered${statusTransition ? `: ${statusTransition}` : ''}`;
    case 'MEMBER_ARCHIVE': return `Member archived${statusTransition ? `: ${statusTransition}` : ''}`;
    case 'MEMBER_REINSTATE': return `Member reinstated${statusTransition ? `: ${statusTransition}${activity.newRole ? ` (${humanise(activity.newRole)})` : ''}` : ''}`;
    case 'MEMBER_CHANGE_ROLE':
    case 'MEMBER_ROLE_CHANGED': { const roleTransition = transition(activity.previousRole, activity.newRole); return `Member role changed${roleTransition ? `: ${roleTransition}` : ''}`; }
    default: return 'Roster activity recorded';
  }
};
export const formatActivityRuleDetail = (activity = {}) => activity.ruleType ? `${activity.ruleType.replaceAll('_', ' ').toLowerCase()}${activity.ruleCount ? ` · ${activity.ruleCount} slot${activity.ruleCount === 1 ? '' : 's'}` : ''}` : 'Single shift';
