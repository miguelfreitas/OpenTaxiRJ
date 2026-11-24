const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('expo/config-plugins');

const MODULE_PATH = path.join(__dirname, 'ride-log', 'android');

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

module.exports = function withRideLog(config) {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/java',
      );
      copyTree(MODULE_PATH, destination);
      return modConfig;
    },
  ]);

  return withMainApplication(config, (modConfig) => {
    const { contents } = modConfig.modResults;
    if (!contents.includes('RideLogPackage')) {
      modConfig.modResults.contents = contents.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        'PackageList(this).packages.apply {\n          add(RideLogPackage())',
      );
    }
    return modConfig;
  });
};
