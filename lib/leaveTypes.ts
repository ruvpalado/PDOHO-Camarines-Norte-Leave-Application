export const LEAVE_TYPES = [
  'Vacation Leave (VL)',
  'Sick Leave (SL)',
  'Maternity Leave',
  'Paternity Leave',
  'Special Privilege Leave (SPL)',
  'Solo Parent Leave',
  'Study Leave',
  '10-Day VAWC Leave',
  'Rehabilitation Privilege Leave',
  'Special Leave Benefits for Women',
  'Special Emergency (Calamity) Leave',
  'Forced/Mandatory Leave',
  'Monetization of Leave Credits',
  'Terminal Leave',
  'Wellness Leave',
] as const;

export const TYPES_WITH_CATEGORY = [
  'Vacation Leave (VL)',
  'Special Privilege Leave (SPL)',
  'Sick Leave (SL)',
  'Study Leave',
  'Special Leave Benefits for Women',
];

export const CATEGORY_MAP: Record<string, string[]> = {
  'Vacation Leave (VL)': ['Within the Philippines', 'Abroad'],
  'Special Privilege Leave (SPL)': ['Within the Philippines', 'Abroad'],
  'Sick Leave (SL)': ['In Hospital', 'Outpatient'],
  'Study Leave': ["Completion of Master's Degree", 'BAR/Board Examination Review'],
  'Special Leave Benefits for Women': ['Specify Illness'],
};
