// Stub for Node-only modules (fs, path, chokidar) in the browser bundle.
// NodeVaultFS and VaultWatcher are tree-shaken out; these stubs prevent
// import errors for the modules they list as dependencies.
export default {};
