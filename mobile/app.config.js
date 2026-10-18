const { expo } = require("./app.json");

module.exports = () => {
  const test = process.env.SMART_GOLF_TEST_BUILD === "1";
  return {
    ...expo,
    plugins: [...expo.plugins, "./plugins/withOwnerReleaseSigning"],
    name: test ? "Smart Golf GPS Imagery Test" : expo.name,
    android: { ...expo.android, package: test ? `${expo.android.package}.phase1` : expo.android.package },
  };
};
