export const decideUpdateAction = ({ currentVersion, queuedVersion, targetVersion }) => {
  if (currentVersion === targetVersion) return 'none';
  if (queuedVersion === targetVersion) return 'reload';
  return 'download';
};
