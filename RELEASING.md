# SDK releases

Build and test jobs use the existing `nozle-ci` self-hosted runner. npm publication
uses GitHub-hosted Ubuntu because npm trusted publishing does not support
self-hosted runners. Packages are built once and published from the tested tarball.

Before publishing, an npm package owner must configure these trusted publishers
in the package settings. No npm token is needed or stored in GitHub.

| npm package | GitHub owner | Repository | Workflow filename | Environment |
| --- | --- | --- | --- | --- |
| `@nozle-js/node` | `nozle-dev` | `nozle-js` | `publish-node.yml` | Leave blank |
| `@nozle-js/react` | `nozle-dev` | `nozle-js` | `publish-react.yml` | Leave blank |

Reference: <https://docs.npmjs.com/trusted-publishers/>

The previous Node 0.6.1 workflow failed with `ENEEDAUTH` on 2026-09-08 because
`NODE_AUTH_TOKEN` was empty and no usable publishing identity was available.
The existence of that version in npm does not establish working CI publication.

The Razorpay integration prepares Node 0.8.0 and React 0.9.0 after the published
API-domain releases. Keep the unified `/core` and `/engine` defaults and both
merchant verification callbacks. Publish only after the matching Core/Engine
changes are deployed and real Razorpay merchant test-mode acceptance passes.
After release approval, push `node-v0.8.0` and `react-v0.9.0` tags pointing at the
reviewed release commit; both workflows check tag/package-version agreement.
Install each published version in a fresh consumer and verify checkout and its
service prefixes. Preparing these versions does not publish them.

For an interrupted release, dispatch the existing tag only after inspecting npm
to establish whether publication already succeeded. Never overwrite a version.
