const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

/** Preserve phone/tablet support when regenerating Android. */
module.exports = function withAndroidDeviceSupport(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["supports-screens"] = [{ $: {
      "android:smallScreens": "true", "android:normalScreens": "true",
      "android:largeScreens": "true", "android:xlargeScreens": "true",
      "android:anyDensity": "true",
    } }];
    const features = manifest["uses-feature"] || [];
    for (const name of ["android.hardware.location", "android.hardware.location.gps", "android.hardware.location.network"]) {
      const existing = features.find((feature) => feature.$?.["android:name"] === name);
      if (existing) existing.$["android:required"] = "false";
      else features.push({ $: { "android:name": name, "android:required": "false" } });
    }
    manifest["uses-feature"] = features;
    AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults).$["android:resizeableActivity"] = "true";
    return mod;
  });
};