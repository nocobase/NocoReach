## Release versions to Solutions and wait for slow Studio deployments

- Add a manually dispatched Release workflow on main that increments the application version, folds change notes, tests and builds the release commit, atomically pushes main and its version tag, and creates a GitHub Release. Reject concurrent main updates, existing tags and version downgrades without forcing refs.
- Explicitly call the Solutions deployment workflow with the tested archive and exact release identity: tags created with GITHUB_TOKEN do not trigger another push workflow. Keep ordinary main pushes limited to the test Studio. Both Solutions destinations report independently, and pending Studio approval fails the job instead of reporting a completed deployment.
- Name the test Studio workflow explicitly so its success is not confused with a Solutions deployment.
- Increase the shared Studio deployment polling window from ten to thirty minutes and the Solutions deployment job budget to sixty minutes. Log bounded deployment identifiers and elapsed waiting time, and include the identifiers in timeout errors so an operation that completes later can be inspected without another upload.
