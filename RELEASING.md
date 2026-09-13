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

For the API domain migration, reserve Node 0.7.0 and React 0.8.0 after confirming
they remain unpublished. Publish only after production `/core` and `/engine`
acceptance passes. Push `node-v0.7.0` and `react-v0.8.0` tags pointing at the
reviewed release commit; both workflows check tag/package-version agreement.
Install each published version in a fresh consumer and verify its defaults.

For an interrupted release, dispatch the existing tag only after inspecting npm
to establish whether publication already succeeded. Never overwrite a version.
