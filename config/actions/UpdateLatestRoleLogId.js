// src/actions/UpdateLatestRoleLogId.js
module.exports = function(router) {
  const Action = router.formio.actions.Action;

  class UpdateLatestRoleLogId extends Action {
    /**
     * Basic metadata for the action type as it will appear in the UI.
     */
    static info() {
      return {
        name: 'updateLatestRoleLogId',
        title: 'Update Latest Role Log Id on User',
        group: 'custom',
        description: 'After a roleMgmtLog submission is created, update the target user with latestRoleLogId = this log _id.'
      };
    }

    /**
     * Called in the actions pipeline.
     *
     * @param {String} handler - 'before' or 'after'
     * @param {String} method  - 'create', 'read', 'update', 'delete'
     */
    resolve(handler, method, req, res, next) {
      // Only run AFTER CREATE on the roleMgmtLog form.
      if (handler !== 'after' || method !== 'create') {
        return next();
      }

      // Verify we're running on the correct form
      if (!req.form || req.form.name !== 'roleMgmtLog') {
        return next();
      }

      try {
        // Get the submission data from the request body
        const submission = req.body || {};
        const logId = submission._id;
        const data = submission.data || {};
        const targetUserId = data.targetUserId;

        router.formio.logger.info('UpdateLatestRoleLogId: Processing', {
          logId,
          targetUserId,
          hasData: !!data,
          submissionKeys: Object.keys(submission)
        });

        if (!logId) {
          router.formio.logger.error('UpdateLatestRoleLogId: Missing logId');
          return next();
        }

        if (!targetUserId) {
          router.formio.logger.error('UpdateLatestRoleLogId: Missing targetUserId');
          return next();
        }

        // Use the built-in submission model to update the user submission
        const SubmissionModel = router.formio.resources.submission.model;

        // First verify the user submission exists
        SubmissionModel.findOne({ _id: targetUserId })
          .then(userSubmission => {
            if (!userSubmission) {
              router.formio.logger.error('UpdateLatestRoleLogId: User submission not found', { targetUserId });
              return next();
            }

            router.formio.logger.info('UpdateLatestRoleLogId: Found user submission', {
              userSubmissionId: userSubmission._id,
              currentData: userSubmission.data
            });

            // Update the User submission: data.latestRoleLogId = logId
            return SubmissionModel.updateOne(
              { _id: targetUserId },
              { $set: { 'data.latestRoleLogId': logId } }
            );
          })
          .then(updateResult => {
            if (updateResult) {
              router.formio.logger.info('UpdateLatestRoleLogId: Successfully updated user', {
                targetUserId,
                logId,
                modifiedCount: updateResult.modifiedCount
              });
            }
            next();
          })
          .catch((err) => {
            // Log but do not block the main request unless you prefer strict failure.
            router.formio.logger.error('UpdateLatestRoleLogId action error:', err);
            next(); // swallow the error to avoid breaking log creation
          });
      } catch (err) {
        router.formio.logger.error('UpdateLatestRoleLogId unexpected error:', err);
        return next();
      }
    }
  }

  // Register the action type with the router.
  router.formio.actions.updateLatestRoleLogId = UpdateLatestRoleLogId;

  return UpdateLatestRoleLogId;
};
