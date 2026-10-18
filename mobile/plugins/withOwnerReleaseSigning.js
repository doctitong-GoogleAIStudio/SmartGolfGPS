const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withOwnerReleaseSigning(config) {
  const test = config.android?.package?.endsWith(".phase1");
  return withAppBuildGradle(config, (mod) => {
    const marker = "// Smart Golf owner signing guard";
    if (mod.modResults.contents.includes(marker)) return mod;
    mod.modResults.contents += `
${marker}
def ownerSigningFile = rootProject.file('owner-signing.properties')
if (ownerSigningFile.exists()) {
    def ownerSigning = new Properties()
    ownerSigningFile.withInputStream { ownerSigning.load(it) }
    android.signingConfigs.create('ownerRelease') {
        storeFile rootProject.file(ownerSigning.getProperty('storeFile'))
        storePassword ownerSigning.getProperty('storePassword')
        keyAlias ownerSigning.getProperty('keyAlias')
        keyPassword ownerSigning.getProperty('keyPassword')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.ownerRelease
} else {
    android.buildTypes.release.signingConfig = null
}
gradle.taskGraph.whenReady { graph ->
    def signedRelease = graph.allTasks.any { task -> task.project.path == project.path && task.name in ['assembleRelease', 'bundleRelease', 'packageRelease', 'signReleaseBundle', 'validateSigningRelease'] }
    if (signedRelease && !ownerSigningFile.exists()) throw new GradleException('Original owner signing configuration is required. Release cannot use the debug key.')
}
${test ? `// Explicit standalone test variant: isolated application ID, bundled JS, debug certificate.
android.buildTypes.create('phase1') {
    initWith android.buildTypes.release
    debuggable false
    signingConfig android.signingConfigs.debug
    minifyEnabled false
    shrinkResources false
    matchingFallbacks = ['release']
}` : ""}
`;
    return mod;
  });
};
