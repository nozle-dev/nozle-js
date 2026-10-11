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

Current published versions are Node `0.9.1` and React `0.10.0`. The packages
version independently. Node tags use `node-v<version>`; React tags use
`react-v<version>`.

To release a package:

1. Update its package version, changelog, and tested examples on a PR branch.
2. Merge after CI passes, then create an immutable tag at the reviewed merge
   commit. The release workflow checks that the tag matches the package version.
3. Check that the build and publish jobs pass. Confirm the new version appears in
   the public npm registry before updating installation docs.
4. Install the published package in a fresh consumer and verify its exports and
   service URL defaults. Create a GitHub Release with the changes and verification.

For an interrupted release, inspect npm before rerunning the workflow for the
existing tag. Never overwrite a published version or move a release tag.
