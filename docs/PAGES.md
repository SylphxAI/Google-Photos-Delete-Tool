# Website publication

The Pages workflow builds the website and uploads one immutable artifact before
running a separate deployment job. Publication is serialized with the `pages`
concurrency group. Both jobs require explicitly public repository visibility
before using free standard hosted runners; private, internal or missing
visibility skips them rather than using billed runners.

The build records `github-pages-{run_id}-{build run_attempt}` as its job output.
Upload and deployment use that exact name. Deployment fails if the output is
missing; it does not fall back to the default `github-pages` name.

GitHub documents retained outputs for jobs excluded from a rerun in
[Re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

## Recovery

Read the failed step and run/deployment timeline before submitting recovery.
Never resend an in-flight request.

- **Deployment-only recovery:** rerun the failed deployment job after a
  successful build. GitHub retains the successful build job's output, so
  deployment reuses its artifact without rebuilding or uploading another one.
- **Full-run recovery:** rerunning all jobs creates a new build-attempt name.
  Deployment consumes the new build output, while earlier artifacts remain
  untouched. A new workflow run also has a distinct run ID.
- **Expired or unavailable artifact:** deployment-only recovery cannot recreate
  it. Confirm the terminal failure and artifact state, then use a full rebuild
  when authorized; do not delete other artifacts or select an arbitrary match.

Splitting jobs and capturing artifact identity prevents duplicate-name recovery
failures. It does not establish why an artifact metadata service returned no
artifacts, nor guarantee that transient service errors cannot recur. Confirm
publication using served bytes and browser behavior, not just a successful job.
